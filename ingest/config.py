"""Configuration loading for the ingestion CLI.

Non-secret settings come from config.yaml; credentials come from the
environment only (never the config file):

  TULEAP_ACCESS_KEY  — long-lived Tuleap personal access key (X-Auth-AccessKey)
  GIT_HTTP_PAT       — optional HTTPS PAT for git read auth
  DATABASE_URL       — Postgres DSN
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List

import yaml


@dataclass
class RepoConfig:
    name: str
    clone_url: str


@dataclass
class AppConfig:
    tuleap_base_url: str
    timezone: str
    week: str
    mailmap_path: str
    repos: List[RepoConfig]
    trackers: List[int]
    churn_exclude: Dict[str, List[str]] = field(default_factory=dict)

    # --- environment-only secrets / connection ---
    @property
    def tuleap_access_key(self) -> str:
        return os.environ.get("TULEAP_ACCESS_KEY", "")

    @property
    def git_http_pat(self) -> str:
        return os.environ.get("GIT_HTTP_PAT", "")

    @property
    def database_url(self) -> str:
        return os.environ.get(
            "DATABASE_URL",
            "postgresql://monitor:monitor@localhost:5432/monitor",
        )

    @property
    def mirrors_dir(self) -> Path:
        return Path(os.environ.get("MIRRORS_DIR", "./mirrors")).resolve()


def load_config(path: str = "config.yaml") -> AppConfig:
    raw = yaml.safe_load(Path(path).read_text())
    repos = [RepoConfig(name=r["name"], clone_url=r["clone_url"]) for r in raw.get("repos", [])]
    trackers = [int(t) for t in raw.get("trackers", [])]
    return AppConfig(
        tuleap_base_url=raw["tuleap_base_url"].rstrip("/"),
        timezone=raw.get("timezone", "Europe/Paris"),
        week=raw.get("week", "iso"),
        mailmap_path=raw.get("mailmap_path", "./.mailmap"),
        repos=repos,
        trackers=trackers,
        churn_exclude=raw.get("churn_exclude") or {},
    )
