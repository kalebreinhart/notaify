#!/usr/bin/env python3
"""Deliver queued replies into the Grok session they belong to."""

from __future__ import annotations

import json
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from client import api, claim_reply, config_dir, load_config, log


def deliver(reply: dict[str, str]) -> None:
    workspace = reply.get("workspace") or str(Path.home())
    session_id = reply["session_id"]
    text = reply["text"]
    log_path = config_dir() / "deliver.log"
    handle = log_path.open("a", encoding="utf-8")
    try:
        subprocess.Popen(
            ["grok", "-p", text, "--verbatim", "--resume", session_id, "--cwd", workspace],
            cwd=workspace,
            start_new_session=True,
            stdin=subprocess.DEVNULL,
            stdout=handle,
            stderr=subprocess.STDOUT,
        )
    except OSError as exc:
        log(f"deliver spawn failed: {exc.__class__.__name__}")
        return
    log(f"delivered reply to {session_id}")


def crew_payload() -> dict:
    config = load_config() or {}
    payload: dict = {}
    project_id = config.get("project_id")
    agent = config.get("agent_name") or config.get("host") or ""
    capabilities = config.get("capabilities")
    if isinstance(project_id, str) and project_id:
        payload["project_id"] = project_id
    if isinstance(agent, str) and agent:
        payload["agent"] = agent
    if isinstance(capabilities, list):
        payload["capabilities"] = capabilities
    return payload


def listen_for_team() -> None:
    config = load_config() or {}
    if not config.get("project_id"):
        return
    payload = crew_payload()
    job = api("/v1/jobs/claim", payload) or {}
    notes = api("/v1/board/take", payload) or {}
    claimed = job.get("job") if isinstance(job.get("job"), dict) else None
    taken = notes.get("notes") if isinstance(notes.get("notes"), list) else []
    if not claimed and not taken:
        return
    inbox = {"job": claimed, "notes": taken}
    path = config_dir() / "inbox.json"
    path.write_text(json.dumps(inbox, indent=2) + "\n", encoding="utf-8")
    if not claimed:
        log(f"board notes {len(taken)}")
        return
    text = f"Notaify job {claimed.get('id')}: {claimed.get('title')}\n\n{claimed.get('body')}\n\nDo the work, then tell the crew on the Notaify board and finish the job."
    log_path = config_dir() / "deliver.log"
    handle = log_path.open("a", encoding="utf-8")
    try:
        subprocess.Popen(
            ["grok", "-p", text, "--verbatim"],
            cwd=str(Path.home()),
            start_new_session=True,
            stdin=subprocess.DEVNULL,
            stdout=handle,
            stderr=subprocess.STDOUT,
        )
    except OSError as exc:
        log(f"job spawn failed: {exc.__class__.__name__}")
        return
    log(f"started job {claimed.get('id')}")


def main() -> int:
    config = load_config()
    host = config["host"] if config else ""
    if not host:
        log("deliver has no host")
        return 1
    while True:
        try:
            reply = claim_reply(host)
            if reply:
                deliver(reply)
            listen_for_team()
            if not reply:
                time.sleep(3)
        except Exception as exc:
            log(f"deliver loop: {exc.__class__.__name__}")
            time.sleep(5)


if __name__ == "__main__":
    sys.exit(main())
