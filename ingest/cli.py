"""Git + Tuleap Activity Monitor — ingestion CLI.

Subcommands:
  init-db          apply db/schema.sql
  seed-mailmap     dump distinct identities across all mirrors into .mailmap
  ingest-git       ingest git history for all configured repos
  ingest-trackers  ingest Tuleap tracker/artifact/event history
  link-commits     cross-reference commit subjects to artifacts
  refresh-views    refresh materialized rollups
  ingest-all       ingest-git + ingest-trackers + link-commits + refresh-views
                   (use --seed-sample to load the offline demo dataset instead)

Run `python -m ingest.cli <subcommand> --help` for options.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from . import crossref, git_lane, sample_data, tuleap_lane
from .config import AppConfig, load_config
from .db import connect


def _schema_path() -> Path:
    return Path(__file__).resolve().parent.parent / "db" / "schema.sql"


def cmd_init_db(cfg: AppConfig, args) -> None:
    sql = _schema_path().read_text()
    conn = connect(cfg.database_url)
    with conn.cursor() as cur:
        cur.execute(sql)
    conn.commit()
    conn.close()
    print("Schema applied.")


def cmd_seed_mailmap(cfg: AppConfig, args) -> None:
    identities = git_lane.seed_mailmap(cfg)
    path = Path(cfg.mailmap_path)
    existing = path.read_text() if path.exists() else ""
    header = existing if existing.strip() else "# Shared mailmap — dedupe identities by hand.\n"
    body = "\n".join(identities)
    path.write_text(header.rstrip() + "\n\n" + body + "\n")
    print(f"Wrote {len(identities)} distinct identities to {path}")


def cmd_ingest_git(cfg: AppConfig, args) -> None:
    conn = connect(cfg.database_url)
    total_c = total_f = 0
    for repo in cfg.repos:
        c, f = git_lane.ingest_repo(cfg, conn, repo)
        total_c += c
        total_f += f
        print(f"  [{repo.name}] +{c} commits, +{f} file rows")
    conn.close()
    print(f"git lane done: {total_c} commits, {total_f} file rows.")


def cmd_ingest_trackers(cfg: AppConfig, args) -> None:
    if not cfg.tuleap_access_key:
        print("ERROR: TULEAP_ACCESS_KEY is not set.", file=sys.stderr)
        sys.exit(2)
    conn = connect(cfg.database_url)
    client = tuleap_lane.TuleapClient(cfg.tuleap_base_url, cfg.tuleap_access_key)
    total_a = total_e = 0
    for tid in cfg.trackers:
        a, e = tuleap_lane.ingest_tracker(cfg, conn, client, tid)
        total_a += a
        total_e += e
        print(f"  [tracker {tid}] +{a} artifacts, +{e} events")
    conn.close()
    print(f"tracker lane done: {total_a} artifacts, {total_e} events.")


def cmd_link_commits(cfg: AppConfig, args) -> None:
    conn = connect(cfg.database_url)
    n = crossref.link_commits(conn)
    conn.close()
    print(f"cross-ref done: +{n} commit↔artifact links.")


def cmd_refresh_views(cfg: AppConfig, args) -> None:
    conn = connect(cfg.database_url)
    with conn.cursor() as cur:
        cur.execute("REFRESH MATERIALIZED VIEW daily_backlog")
        cur.execute("REFRESH MATERIALIZED VIEW activity_by_path_period")
    conn.commit()
    conn.close()
    print("Materialized views refreshed.")


def cmd_ingest_all(cfg: AppConfig, args) -> None:
    if args.seed_sample:
        conn = connect(cfg.database_url)
        counts = sample_data.load_sample(conn)
        conn.close()
        print(f"Seeded sample data: {counts}")
    else:
        cmd_ingest_git(cfg, args)
        cmd_ingest_trackers(cfg, args)
        cmd_link_commits(cfg, args)
    cmd_refresh_views(cfg, args)
    print("ingest-all complete.")


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="ingest", description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("-c", "--config", default="config.yaml", help="path to config.yaml")
    sub = p.add_subparsers(dest="command", required=True)

    sub.add_parser("init-db", help="apply db/schema.sql").set_defaults(func=cmd_init_db)
    sub.add_parser("seed-mailmap", help="dump identities into .mailmap").set_defaults(func=cmd_seed_mailmap)
    sub.add_parser("ingest-git", help="ingest git history").set_defaults(func=cmd_ingest_git)
    sub.add_parser("ingest-trackers", help="ingest Tuleap trackers").set_defaults(func=cmd_ingest_trackers)
    sub.add_parser("link-commits", help="cross-reference commits↔artifacts").set_defaults(func=cmd_link_commits)
    sub.add_parser("refresh-views", help="refresh materialized views").set_defaults(func=cmd_refresh_views)

    all_p = sub.add_parser("ingest-all", help="run every lane + refresh views")
    all_p.add_argument("--seed-sample", action="store_true",
                       help="load the offline synthetic dataset instead of hitting real sources")
    all_p.set_defaults(func=cmd_ingest_all)

    return p


def main(argv=None) -> None:
    args = build_parser().parse_args(argv)
    if not hasattr(args, "seed_sample"):
        args.seed_sample = False
    cfg = load_config(args.config)
    args.func(cfg, args)


if __name__ == "__main__":
    main()
