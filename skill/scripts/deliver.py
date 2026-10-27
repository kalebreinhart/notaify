#!/usr/bin/env python3
"""Deliver queued replies into the Grok session they belong to."""

from __future__ import annotations

import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from client import claim_reply, config_dir, load_config, log


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
            else:
                time.sleep(3)
        except Exception as exc:
            log(f"deliver loop: {exc.__class__.__name__}")
            time.sleep(5)


if __name__ == "__main__":
    sys.exit(main())
