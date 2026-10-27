"""Post one event to the attention bus. Never raises to a hook caller."""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any


def config_dir() -> Path:
    root = os.environ.get("XDG_CONFIG_HOME")
    base = Path(root) if root else Path.home() / ".config"
    return base / "grok-attention"


def log(message: str) -> None:
    path = config_dir() / "report.log"
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        if path.exists() and path.stat().st_size > 200_000:
            path.write_text(path.read_text(encoding="utf-8")[-100_000:], encoding="utf-8")
        with path.open("a", encoding="utf-8") as handle:
            handle.write(message.replace("\n", " ")[:500] + "\n")
    except OSError:
        return


def load_config() -> dict[str, str] | None:
    path = config_dir() / "config.json"
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    if not isinstance(raw, dict):
        return None
    url = raw.get("url")
    token = raw.get("token")
    host = raw.get("host")
    if not isinstance(url, str) or not isinstance(token, str) or not url or not token:
        return None
    return {
        "url": url.rstrip("/"),
        "token": token,
        "host": host if isinstance(host, str) and host else "",
    }


def claim_reply(host: str) -> dict[str, str] | None:
    config = load_config()
    if config is None or not host:
        return None
    payload = json.dumps({"host": host}).encode("utf-8")
    request = urllib.request.Request(
        config["url"] + "/v1/replies/claim",
        data=payload,
        method="POST",
        headers={
            "Authorization": "Bearer " + config["token"],
            "Content-Type": "application/json",
            "User-Agent": "grok-attention/1",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=2.5) as response:
            body = json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, OSError, json.JSONDecodeError):
        log("claim failed")
        return None
    reply = body.get("reply") if isinstance(body, dict) else None
    if not isinstance(reply, dict):
        return None
    text = reply.get("text")
    session_id = reply.get("session_id")
    if not isinstance(text, str) or not text or not isinstance(session_id, str):
        return None
    workspace = reply.get("workspace")
    return {
        "text": text,
        "session_id": session_id,
        "workspace": workspace if isinstance(workspace, str) else "",
    }


def post_event(event: dict[str, Any]) -> bool:
    config = load_config()
    if config is None:
        log("no config")
        return False
    if config["host"] and not event.get("host"):
        event["host"] = config["host"]
    payload = json.dumps(event).encode("utf-8")
    request = urllib.request.Request(
        config["url"] + "/v1/events",
        data=payload,
        method="POST",
        headers={
            "Authorization": "Bearer " + config["token"],
            "Content-Type": "application/json",
            "User-Agent": "grok-attention/1",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=2.5) as response:
            response.read()
        return True
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        log(f"post failed: {exc.__class__.__name__}")
        return False
