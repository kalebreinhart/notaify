#!/usr/bin/env python3
"""Tell the attention bus this turn needs the user. Always exits 0."""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from classify import dedupe
from client import config_dir, load_config, post_event


def active_for(workspace: str) -> dict[str, str]:
    path = config_dir() / "active.json"
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    if not isinstance(raw, dict):
        return {}
    recorded = raw.get("workspace")
    if isinstance(recorded, str) and recorded and os.path.normpath(recorded) != os.path.normpath(workspace):
        return {}
    out: dict[str, str] = {}
    for key in ("session_id", "prompt_id", "host"):
        value = raw.get(key)
        if isinstance(value, str):
            out[key] = value
    return out


def main() -> int:
    parser = argparse.ArgumentParser(description="Post a needs-you attention event")
    parser.add_argument("--title", required=True)
    parser.add_argument("--body", default="")
    parser.add_argument("--workspace", default="")
    parser.add_argument("--session", default="")
    parser.add_argument("--prompt", default="")
    args = parser.parse_args()
    title = " ".join(args.title.split())
    if not title:
        print("attention: missing title")
        return 0
    workspace = args.workspace or os.getcwd()
    active = active_for(workspace)
    config = load_config()
    host = (config or {}).get("host") or active.get("host") or ""
    session_id = args.session or active.get("session_id", "")
    prompt_id = args.prompt or active.get("prompt_id", "")
    event = {
        "kind": "needs_user",
        "urgency": "attention",
        "state": "needs_user",
        "sticky": True,
        "host": host,
        "session_id": session_id,
        "prompt_id": prompt_id,
        "workspace": workspace,
        "title": title[:140],
        "body": args.body.strip()[:800],
        "source": "agent",
        "dedupe_key": dedupe(host, session_id, prompt_id, "needs_user"),
    }
    print("attention: ok" if post_event(event) else "attention: not delivered")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:
        print("attention: not delivered")
        sys.exit(0)
