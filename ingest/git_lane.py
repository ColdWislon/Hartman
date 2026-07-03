"""Git ingestion lane.

For each configured repo:
  1. Mirror-clone on first run; `git remote update --prune` afterwards.
  2. Resolve the default branch from the remote HEAD symref.
  3. Extract commits (default branch, no merges) with numstat + name-status,
     mailmap applied, at (file, commit) grain.
  4. Incremental via last_ingested_sha..tip, with full-rescan fallback if the
     high-water mark is unreachable (force-push / rebase). Upsert on sha/path
     makes both paths idempotent.
"""
from __future__ import annotations

import fnmatch
import subprocess
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from .config import AppConfig, RepoConfig

# ASCII unit separator used to split the pretty-format fields unambiguously.
US = "\x1f"
COMMIT_PREFIX = "C" + US


def _run(args: List[str], cwd: Optional[Path] = None) -> str:
    res = subprocess.run(
        args, cwd=str(cwd) if cwd else None,
        check=True, capture_output=True, text=True,
    )
    return res.stdout


def _mirror_path(cfg: AppConfig, repo: RepoConfig) -> Path:
    return cfg.mirrors_dir / f"{repo.name}.git"


def ensure_mirror(cfg: AppConfig, repo: RepoConfig) -> Path:
    """Mirror-clone on first run, otherwise update in place."""
    path = _mirror_path(cfg, repo)
    if path.exists():
        _run(["git", "remote", "update", "--prune"], cwd=path)
    else:
        path.parent.mkdir(parents=True, exist_ok=True)
        _run(["git", "clone", "--mirror", repo.clone_url, str(path)])
    return path


def resolve_default_branch(repo: RepoConfig, mirror: Optional[Path] = None) -> str:
    """Read the remote HEAD symref to find the default branch."""
    out = _run(["git", "ls-remote", "--symref", repo.clone_url, "HEAD"])
    for line in out.splitlines():
        # format: "ref: refs/heads/main\tHEAD"
        if line.startswith("ref:"):
            ref = line.split()[1]
            return ref.rsplit("/", 1)[-1]
    # fallback: ask the mirror
    if mirror is not None:
        try:
            out = _run(["git", "symbolic-ref", "HEAD"], cwd=mirror)
            return out.strip().rsplit("/", 1)[-1]
        except subprocess.CalledProcessError:
            pass
    return "main"


def _sha_reachable(mirror: Path, sha: str) -> bool:
    try:
        _run(["git", "cat-file", "-e", f"{sha}^{{commit}}"], cwd=mirror)
        return True
    except subprocess.CalledProcessError:
        return False


def _log_range(default_branch: str, since_sha: Optional[str]) -> str:
    if since_sha:
        return f"{since_sha}..{default_branch}"
    return default_branch


class ParsedCommit:
    __slots__ = ("sha", "author_name", "author_email", "authored_at", "subject", "files")

    def __init__(self, sha, name, email, authored_at, subject):
        self.sha = sha
        self.author_name = name
        self.author_email = email
        self.authored_at = authored_at
        self.subject = subject
        # path -> dict(lines_added, lines_removed, change_type, is_binary)
        self.files: Dict[str, dict] = {}


def _parse_commits(cfg: AppConfig, mirror: Path, rev_range: str) -> List[ParsedCommit]:
    """Parse numstat + name-status into a list of ParsedCommit."""
    pretty = f"C{US}%H{US}%aN{US}%aE{US}%aI{US}%s"
    base = [
        "git", "-c", f"mailmap.file={Path(cfg.mailmap_path).resolve()}",
    ]
    # --- pass 1: numstat ---
    numstat_out = _run(
        base + ["log", rev_range, "--no-merges", "--use-mailmap", "--numstat",
                f"--pretty=format:{pretty}"],
        cwd=mirror,
    )
    commits: Dict[str, ParsedCommit] = {}
    order: List[str] = []
    current: Optional[ParsedCommit] = None
    for line in numstat_out.splitlines():
        if line.startswith(COMMIT_PREFIX):
            _, sha, name, email, date, *rest = line.split(US)
            subject = US.join(rest) if rest else ""
            current = ParsedCommit(sha, name, email, date, subject)
            commits[sha] = current
            order.append(sha)
        elif line.strip() and current is not None:
            cols = line.split("\t")
            if len(cols) < 3:
                continue
            added_s, removed_s, path = cols[0], cols[1], "\t".join(cols[2:])
            is_binary = added_s == "-" or removed_s == "-"
            current.files[path] = {
                "lines_added": 0 if is_binary else int(added_s or 0),
                "lines_removed": 0 if is_binary else int(removed_s or 0),
                "is_binary": is_binary,
                "change_type": None,
            }

    # --- pass 2: name-status for change_type ---
    ns_out = _run(
        base + ["log", rev_range, "--no-merges", "--use-mailmap", "--name-status",
                f"--pretty=format:C{US}%H"],
        cwd=mirror,
    )
    current = None
    for line in ns_out.splitlines():
        if line.startswith(COMMIT_PREFIX):
            sha = line.split(US)[1]
            current = commits.get(sha)
        elif line.strip() and current is not None:
            cols = line.split("\t")
            status = cols[0][0]  # A/M/D/R (R100 -> R)
            # For renames, git prints "R100\told\tnew"; use the new path.
            path = cols[-1]
            if path in current.files:
                current.files[path]["change_type"] = status
            else:
                # rename target may differ from numstat path in edge cases;
                # attach to whichever file row exists, else create a stub.
                current.files.setdefault(path, {
                    "lines_added": 0, "lines_removed": 0,
                    "is_binary": False, "change_type": status,
                })

    return [commits[s] for s in order]


def _churn_excluded(path: str, globs: List[str]) -> bool:
    return any(fnmatch.fnmatch(path, g) or fnmatch.fnmatch(path, g.replace("**/", "*"))
               for g in globs)


def ingest_repo(cfg: AppConfig, conn, repo: RepoConfig) -> Tuple[int, int]:
    """Ingest one repo. Returns (commits_inserted, files_inserted)."""
    mirror = ensure_mirror(cfg, repo)
    default_branch = resolve_default_branch(repo, mirror)

    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO repo (name, clone_url, default_branch)
        VALUES (%s, %s, %s)
        ON CONFLICT (name) DO UPDATE SET clone_url = EXCLUDED.clone_url,
                                         default_branch = EXCLUDED.default_branch
        RETURNING id, last_ingested_sha
        """,
        (repo.name, repo.clone_url, default_branch),
    )
    repo_id, last_sha = cur.fetchone()

    # Decide the range: incremental if HWM reachable, else full re-scan.
    if last_sha and _sha_reachable(mirror, last_sha):
        rev_range = _log_range(default_branch, last_sha)
    else:
        rev_range = _log_range(default_branch, None)

    parsed = _parse_commits(cfg, mirror, rev_range)
    globs = cfg.churn_exclude.get(repo.name, []) or []

    n_commits = n_files = 0
    for c in parsed:
        cur.execute(
            """
            INSERT INTO git_commit (sha, repo_id, author_name, author_email, authored_at, subject)
            VALUES (%s, %s, %s, %s, %s, %s)
            ON CONFLICT (sha) DO UPDATE SET
                author_name = EXCLUDED.author_name,
                author_email = EXCLUDED.author_email,
                authored_at = EXCLUDED.authored_at,
                subject = EXCLUDED.subject
            """,
            (c.sha, repo_id, c.author_name, c.author_email, c.authored_at, c.subject),
        )
        n_commits += 1
        for path, f in c.files.items():
            counts_churn = not _churn_excluded(path, globs)
            cur.execute(
                """
                INSERT INTO commit_file
                    (sha, repo_id, path, lines_added, lines_removed,
                     change_type, is_binary, counts_churn)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (sha, path) DO UPDATE SET
                    lines_added = EXCLUDED.lines_added,
                    lines_removed = EXCLUDED.lines_removed,
                    change_type = EXCLUDED.change_type,
                    is_binary = EXCLUDED.is_binary,
                    counts_churn = EXCLUDED.counts_churn
                """,
                (c.sha, repo_id, path, f["lines_added"], f["lines_removed"],
                 f["change_type"], f["is_binary"], counts_churn),
            )
            n_files += 1

    # Advance the high-water mark to the current branch tip.
    tip = _run(["git", "rev-parse", default_branch], cwd=mirror).strip()
    cur.execute("UPDATE repo SET last_ingested_sha = %s WHERE id = %s", (tip, repo_id))
    conn.commit()
    return n_commits, n_files


def seed_mailmap(cfg: AppConfig) -> List[str]:
    """Dump every distinct `Name <email>` across all mirrors."""
    seen = set()
    for repo in cfg.repos:
        mirror = ensure_mirror(cfg, repo)
        default_branch = resolve_default_branch(repo, mirror)
        out = _run(
            ["git", "log", default_branch, "--no-merges", "--pretty=format:%aN <%aE>"],
            cwd=mirror,
        )
        for line in out.splitlines():
            line = line.strip()
            if line:
                seen.add(line)
    return sorted(seen)
