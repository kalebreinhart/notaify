#!/usr/bin/env python3
"""Grok hook entry. Reads one hook envelope on stdin and exits 0."""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))

from classify import classify, is_subagent, text_of
from client import claim_reply, config_dir, load_config, log, post_event


def remember(event: dict[str, Any], host: str) -> None:
    session_id = text_of(event, "sessionId", "session_id")
    if not session_id:
        return
    path = config_dir() / "active.json"
    payload = {
        "host": host,
        "session_id": session_id,
        "prompt_id": text_of(event, "promptId", "prompt_id"),
        "workspace": text_of(event, "workspaceRoot", "cwd", "workspace_root"),
    }
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload), encoding="utf-8")
    except OSError as exc:
        log(f"remember failed: {exc.__class__.__name__}")


def main() -> None:
    raw = sys.stdin.read()
    if not raw.strip():
        return
    try:
        event = json.loads(raw)
    except json.JSONDecodeError:
        log("stdin was not JSON")
        return
    if not isinstance(event, dict) or is_subagent(event):
        return
    config = load_config()
    host = config["host"] if config and config.get("host") else ""
    remember(event, host)
    outgoing = classify(event, host)
    if outgoing is None:
        return
    post_event(outgoing)
    if outgoing.get("kind") in ("turn_ended", "needs_user") and host:
        reply = claim_reply(host)
        if reply and reply.get("text"):
            sys.stdout.write(json.dumps({"decision": "block", "reason": reply["text"]}))
            sys.stdout.write("\n")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        log(f"report crashed: {exc.__class__.__name__}")
    sys.exit(0)
