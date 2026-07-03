"""Thin psycopg2 connection helper for the ingestion CLI."""
from __future__ import annotations

import psycopg2
import psycopg2.extras


def connect(dsn: str):
    conn = psycopg2.connect(dsn)
    conn.autocommit = False
    return conn


def dictcur(conn):
    return conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
