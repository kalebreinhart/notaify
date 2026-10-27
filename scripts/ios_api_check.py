#!/usr/bin/env python3
"""Exercise the iOS auth, summary, and reply APIs. Does not start a Grok turn."""

from __future__ import annotations

import json
import sys
import urllib.parse
import urllib.request
from pathlib import Path


def account() -> dict[str, str]:
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import auth_check

    return auth_check.load_account()


def bus() -> dict[str, str]:
    return json.loads((Path.home() / ".config" / "grok-attention" / "config.json").read_text())


def call(url: str, method: str = "GET", payload: dict | None = None, token: str = "") -> tuple[int, dict]:
    headers = {"User-Agent": "grok-attention/1", "Content-Type": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    data = None if payload is None else json.dumps(payload).encode()
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            return resp.status, json.loads(resp.read().decode())
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode()
        try:
            body = json.loads(raw)
        except json.JSONDecodeError:
            body = {"raw": raw[:200]}
        return exc.code, body


def main() -> int:
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import auth_check

    cfg = bus()
    base = cfg["url"].rstrip("/")
    person = account()
    status, methods = call(base + "/v1/auth/methods")
    if status != 200 or "password" not in methods.get("methods", []) or "device_enroll" not in methods.get("methods", []):
        raise SystemExit(f"methods {status}")
    status, started = call(base + "/v1/auth/login", "POST", {"email": person["email"], "password": person["password"]})
    if status != 200 or started.get("step") != "totp" or not started.get("login_id"):
        raise SystemExit(f"login step {status}")
    if "otpauth://" not in started.get("otpauth_uri", ""):
        raise SystemExit("login did not offer an authenticator setup code")
    status, done = call(
        base + "/v1/auth/code",
        "POST",
        {"login_id": started["login_id"], "code": auth_check.totp(person["totp_secret"])},
    )
    token = done.get("token", "")
    if status != 200 or done.get("step") != "done" or not token:
        raise SystemExit(f"code step {status}")
    long_body = "Looked at the mount.\n\n" + ("Checked one bolt. " * 8) + "The coolant pipe support is printed and ready to install."
    status, posted = call(
        base + "/v1/events",
        "POST",
        {
            "kind": "turn_ended",
            "state": "idle",
            "host": "ios-check",
            "session_id": "ios-summary",
            "title": "Looked at the mount.",
            "body": long_body,
            "source": "hook",
        },
        cfg["token"],
    )
    summary = (posted.get("event") or {}).get("summary", "")
    if status != 200 or "ready to install" not in summary:
        raise SystemExit("event summary was not the conclusion")
    status, listed = call(base + "/v1/sessions", token=token)
    if status != 200 or not any(row.get("summary", "").find("ready to install") >= 0 for row in listed.get("sessions", [])):
        raise SystemExit("session list did not show the summary")
    status, reply = call(
        base + "/v1/replies",
        "POST",
        {"host": "ios-check", "session_id": "ios-summary", "text": "Install it on the left bracket and stop."},
        token,
    )
    if status != 200 or not reply.get("ok"):
        raise SystemExit(f"reply {status}")
    status, claimed = call(base + "/v1/replies/claim", "POST", {"host": "ios-check"}, cfg["token"])
    text = (claimed.get("reply") or {}).get("text", "")
    if status != 200 or "left bracket" not in text:
        raise SystemExit("reply was not waiting for the machine")
    print("ios api check ok")
    return 0


if __name__ == "__main__":
    import urllib.error

    try:
        raise SystemExit(main())
    except SystemExit:
        raise
    except Exception as exc:
        print(f"ios api check failed: {exc}", file=sys.stderr)
        raise SystemExit(1)
