"""Tuleap tracker ingestion lane.

Every call is authenticated with `X-Auth-AccessKey: $TULEAP_ACCESS_KEY`.

For each configured tracker ID:
  1. Read the status semantic (status field + open value IDs) and the
     contributor semantic (assignee field) from GET /api/trackers/{id}.
  2. List artifacts with pagination, upserting each.
  3. Reconstruct status history from changesets → artifact_status_event
     (idempotent on (artifact_id, changeset_id)).
  4. Incremental via last_modified_hwm per tracker.

NOTE: exact REST shapes vary per instance — verify against /api/explorer/.
The semantic parsing below targets the standard Tuleap v14+ shapes and falls
back defensively when a field is absent.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple

import requests

from .config import AppConfig


class TuleapClient:
    def __init__(self, base_url: str, access_key: str, page_size: int = 100):
        self.base = base_url.rstrip("/")
        self.session = requests.Session()
        self.session.headers.update({
            "X-Auth-AccessKey": access_key,
            "Accept": "application/json",
        })
        self.page_size = page_size

    def get(self, path: str, params: Optional[dict] = None) -> requests.Response:
        url = f"{self.base}/api{path}"
        resp = self.session.get(url, params=params, timeout=60)
        resp.raise_for_status()
        return resp

    def get_json(self, path: str, params: Optional[dict] = None):
        return self.get(path, params).json()

    def paginate(self, path: str, params: Optional[dict] = None):
        """Yield items across offset/limit pages using the X-PAGINATION-SIZE header."""
        params = dict(params or {})
        offset = 0
        while True:
            params.update({"limit": self.page_size, "offset": offset})
            resp = self.get(path, params)
            items = resp.json()
            if not isinstance(items, list):
                items = items.get("collection", items)  # defensive
            for it in items:
                yield it
            total = resp.headers.get("X-PAGINATION-SIZE")
            got = offset + len(items)
            if total is not None:
                if got >= int(total) or not items:
                    break
            elif not items:
                break
            offset = got


def _parse_ts(value) -> datetime:
    """Parse a Tuleap ISO-8601 timestamp (may carry a +02:00 offset)."""
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(value, tz=timezone.utc)
    if not value:
        return datetime.now(timezone.utc)
    # e.g. "2024-05-14T09:12:33+02:00"
    return datetime.fromisoformat(value)


def read_semantics(client: TuleapClient, tuleap_tracker_id: int) -> dict:
    """Return {name, status_field, open_value_ids, assignee_field}."""
    tr = client.get_json(f"/trackers/{tuleap_tracker_id}")
    name = tr.get("label") or tr.get("name")
    semantics = tr.get("semantics", {}) or {}

    status_field = None
    open_value_ids: List[int] = []
    status_sem = semantics.get("status") or {}
    # Shape varies: sometimes {field_id, open_values:[ids]}, sometimes nested.
    if status_sem:
        status_field = status_sem.get("field_id") or status_sem.get("field")
        ov = status_sem.get("open_values") or status_sem.get("open_value_ids") or []
        open_value_ids = [int(v["id"]) if isinstance(v, dict) else int(v) for v in ov]

    # Resolve the status field's short name from the fields list, for readability.
    status_field_name = None
    fields = tr.get("fields", []) or []
    by_id = {f.get("field_id"): f for f in fields}
    if status_field is not None and status_field in by_id:
        status_field_name = by_id[status_field].get("name") or by_id[status_field].get("label")

    assignee_field = None
    contrib = semantics.get("contributor") or semantics.get("assigned_to") or {}
    if contrib:
        cf = contrib.get("field_id") or contrib.get("field")
        if cf is not None and cf in by_id:
            assignee_field = by_id[cf].get("name") or by_id[cf].get("label")

    return {
        "name": name,
        "status_field": status_field_name or (str(status_field) if status_field else None),
        "status_field_id": status_field,
        "open_value_ids": open_value_ids,
        "assignee_field": assignee_field,
    }


def _upsert_tracker(conn, tuleap_tracker_id: int, sem: dict) -> Tuple[int, Optional[datetime]]:
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO tracker (tuleap_tracker_id, name, status_field, open_value_ids, assignee_field)
        VALUES (%s, %s, %s, %s, %s)
        ON CONFLICT (tuleap_tracker_id) DO UPDATE SET
            name = EXCLUDED.name,
            status_field = EXCLUDED.status_field,
            open_value_ids = EXCLUDED.open_value_ids,
            assignee_field = EXCLUDED.assignee_field
        RETURNING id, last_modified_hwm
        """,
        (tuleap_tracker_id, sem["name"], sem["status_field"],
         sem["open_value_ids"], sem["assignee_field"]),
    )
    row = cur.fetchone()
    return row[0], row[1]


def _field_value(artifact: dict, field_name: Optional[str]):
    """Pull a field's rendered value + bind_value ids from an artifact's `values`."""
    if not field_name:
        return None, []
    for v in artifact.get("values", []) or []:
        if v.get("label") == field_name or v.get("name") == field_name:
            # list fields carry `values` (selectbox) with bind ids
            ids = []
            label = None
            if "values" in v and isinstance(v["values"], list):
                for bv in v["values"]:
                    if isinstance(bv, dict):
                        if bv.get("id") is not None:
                            ids.append(int(bv["id"]))
                        label = bv.get("label") or bv.get("display_name") or label
            elif v.get("value") is not None:
                label = v.get("value")
            return label, ids
    return None, []


def _status_from_changeset(changeset: dict, status_field: Optional[str]) -> Tuple[Optional[str], List[int]]:
    """Extract the status label + value ids present in a changeset snapshot."""
    return _field_value(changeset, status_field)


def ingest_tracker(cfg: AppConfig, conn, client: TuleapClient, tuleap_tracker_id: int) -> Tuple[int, int]:
    """Ingest one tracker. Returns (artifacts_upserted, events_inserted)."""
    sem = read_semantics(client, tuleap_tracker_id)
    tracker_id, hwm = _upsert_tracker(conn, tuleap_tracker_id, sem)
    conn.commit()

    open_ids = set(sem["open_value_ids"])
    status_field = sem["status_field"]
    assignee_field = sem["assignee_field"]

    # Incremental filter: only artifacts changed since the high-water mark.
    params = {}
    if hwm is not None:
        # Expert query on last_update_date. Exact syntax varies per instance;
        # verify on /api/explorer/. This is the common form.
        params["query"] = f'{{"last_update_date":{{"operator":">","value":"{hwm.isoformat()}"}}}}'

    cur = conn.cursor()
    n_art = n_evt = 0
    newest_mod: Optional[datetime] = hwm

    for art in client.paginate(f"/trackers/{tuleap_tracker_id}/artifacts", params):
        tuleap_artifact_id = int(art["id"])
        submitted_at = _parse_ts(art.get("submitted_on") or art.get("submitted_at"))
        last_mod = _parse_ts(art.get("last_modified_date") or art.get("last_update_date") or submitted_at)
        if newest_mod is None or last_mod > newest_mod:
            newest_mod = last_mod

        status_label, status_ids = _field_value(art, status_field)
        assignee_label, _ = _field_value(art, assignee_field)
        is_open = bool(set(status_ids) & open_ids) if status_ids else None
        title = art.get("title") or art.get("label")

        cur.execute(
            """
            INSERT INTO artifact
                (tuleap_artifact_id, tracker_id, title, submitted_at,
                 current_status, current_assignee, is_open)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (tuleap_artifact_id) DO UPDATE SET
                title = EXCLUDED.title,
                current_status = EXCLUDED.current_status,
                current_assignee = EXCLUDED.current_assignee,
                is_open = EXCLUDED.is_open
            RETURNING id
            """,
            (tuleap_artifact_id, tracker_id, title, submitted_at,
             status_label, assignee_label, is_open),
        )
        artifact_id = cur.fetchone()[0]
        n_art += 1

        n_evt += _rebuild_events(conn, client, artifact_id, tuleap_artifact_id,
                                 status_field, open_ids, submitted_at)

    if newest_mod is not None:
        cur.execute("UPDATE tracker SET last_modified_hwm = %s WHERE id = %s",
                    (newest_mod, tracker_id))
    conn.commit()
    return n_art, n_evt


def _rebuild_events(conn, client, artifact_id, tuleap_artifact_id,
                    status_field, open_ids, submitted_at) -> int:
    """Walk changesets in order and emit open/close/reopen events idempotently."""
    cur = conn.cursor()
    prev_open: Optional[bool] = None
    inserted = 0
    first = True

    for cs in client.paginate(f"/artifacts/{tuleap_artifact_id}/changesets"):
        changeset_id = int(cs["id"])
        event_time = _parse_ts(cs.get("submitted_on") or cs.get("submitted_at") or submitted_at)
        _, status_ids = _status_from_changeset(cs, status_field)

        # If this changeset doesn't touch the status field, carry prev state.
        cur_open = bool(set(status_ids) & open_ids) if status_ids else prev_open

        event_type = None
        if first:
            # Creation is always an OPEN event by definition (spec §6.3).
            event_type = "open"
            first = False
        elif prev_open is not None and cur_open is not None:
            if prev_open and not cur_open:
                event_type = "close"
            elif not prev_open and cur_open:
                event_type = "reopen"

        if event_type:
            cur.execute(
                """
                INSERT INTO artifact_status_event
                    (artifact_id, changeset_id, event_time, event_type)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (artifact_id, changeset_id) DO NOTHING
                """,
                (artifact_id, changeset_id, event_time, event_type),
            )
            inserted += cur.rowcount

        if cur_open is not None:
            prev_open = cur_open

    return inserted
