#!/usr/bin/env python3
"""Claim a machine magic link in a throwaway HOME, then revoke it."""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
import urllib.request
from http.cookiejar import CookieJar
from pathlib import Path


def load_config() -> dict[str, str]:
    return json.loads((Path.home() / ".config" / "grok-attention" / "config.json").read_text())


def opener() -> urllib.request.OpenerDirector:
    return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(CookieJar()))


def call(web: urllib.request.OpenerDirector, request: urllib.request.Request):
    request.add_header("User-Agent", "grok-attention/1")
    return web.open(request, timeout=30)


def body_of(response: object) -> str:
    return response.read().decode()  # type: ignore[attr-defined]


def main() -> int:
    config = load_config()
    base = config["url"].rstrip("/")
    master = config["token"]
    web = opener()
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import auth_check

    account = auth_check.load_account()
    call(
        web,
        urllib.request.Request(
            base + "/login",
            data=urllib.parse.urlencode({"email": account["email"], "password": account["password"]}).encode(),
            method="POST",
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        ),
    ).read()
    call(
        web,
        urllib.request.Request(
            base + "/login/code",
            data=urllib.parse.urlencode({"code": auth_check.totp(account["totp_secret"])}).encode(),
            method="POST",
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        ),
    ).read()
    page = call(web, urllib.request.Request(base + "/pair"))
    html = body_of(page)
    if master in html:
        raise SystemExit("pair page leaked the bus token")
    match = re.search(r"https://[^/\s\"']+/m/([A-Za-z0-9_-]{16,64})", html)
    if not match:
        raise SystemExit("pair page had no machine link")
    code = match.group(1)
    link = f"{base}/m/{code}"

    plain = call(web, urllib.request.Request(link, headers={"Accept": "*/*"}))
    instructions = body_of(plain)
    if "curl " not in instructions or master in instructions:
        raise SystemExit("machine link did not return an install command")

    try:
        call(web, urllib.request.Request(f"{link}/install"))
        raise SystemExit("GET install claimed the link")
    except urllib.error.HTTPError as exc:
        if exc.code != 405:
            raise SystemExit(f"GET install status {exc.code}")

    claimed = call(
        web,
        urllib.request.Request(
            f"{link}/install",
            data=b"claim=1",
            method="POST",
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        ),
    )
    script = body_of(claimed)
    if master in script or "gam_" not in script or "SKILL.md" not in script:
        raise SystemExit("install script was missing the skill or leaked the bus token")

    home = Path("/tmp/grok-attention-machine-check")
    if home.exists():
        shutil.rmtree(home)
    home.mkdir()
    script_path = home / "install.sh"
    script_path.write_text(script)
    env = os.environ.copy()
    env["HOME"] = str(home)
    run = subprocess.run(["sh", str(script_path)], cwd=str(home), env=env, text=True, capture_output=True)
    if run.returncode != 0:
        raise SystemExit(f"installer failed\n{run.stderr[-500:]}")
    if master in run.stdout or "gam_" in run.stdout:
        raise SystemExit("installer printed a credential")
    written = json.loads((home / ".config" / "grok-attention" / "config.json").read_text())
    token = written["token"]
    if not token.startswith("gam_"):
        raise SystemExit("config did not get a machine credential")
    skill = home / ".grok" / "skills" / "grok-attention" / "SKILL.md"
    hooks = home / ".grok" / "hooks" / "grok-attention.json"
    if not skill.is_file() or not hooks.is_file():
        raise SystemExit("skill or hooks were not installed")

    post = urllib.request.Request(
        base + "/v1/events",
        data=json.dumps(
            {"kind": "turn_ended", "host": "machine-check", "session_id": "machine-check", "title": "Machine link check"}
        ).encode(),
        method="POST",
        headers={"Authorization": "Bearer " + token, "Content-Type": "application/json", "User-Agent": "grok-attention/1"},
    )
    posted = json.loads(body_of(call(web, post)))
    if posted.get("ok") is not True:
        raise SystemExit("machine credential could not post")
    try:
        call(web, urllib.request.Request(base + "/v1/sessions", headers={"Authorization": "Bearer " + token}))
        raise SystemExit("machine credential could read the bus")
    except urllib.error.HTTPError as exc:
        if exc.code != 401:
            raise SystemExit(f"machine read status {exc.code}")

    try:
        call(
            web,
            urllib.request.Request(f"{link}/install", data=b"claim=1", method="POST"),
        )
        raise SystemExit("machine link was reusable")
    except urllib.error.HTTPError as exc:
        if exc.code != 410:
            raise SystemExit(f"reuse status {exc.code}")

    devices = json.loads(body_of(call(web, urllib.request.Request(base + "/v1/devices"))))
    match_id = ""
    for device in devices["devices"]:
        if device.get("role") == "publisher" and device.get("name") == written["host"]:
            match_id = device["id"]
    if not match_id:
        raise SystemExit("paired machine was not listed")
    call(
        web,
        urllib.request.Request(
            base + "/pair/revoke",
            data=urllib.parse.urlencode({"id": match_id}).encode(),
            method="POST",
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        ),
    )
    try:
        call(web, post)
        raise SystemExit("revoked machine credential still posted")
    except urllib.error.HTTPError as exc:
        if exc.code != 401:
            raise SystemExit(f"revoked post status {exc.code}")

    real = Path.home() / ".grok" / "skills" / "grok-attention"
    if not real.is_symlink():
        raise SystemExit("real skill install was replaced")
    shutil.rmtree(home)
    print("machine check ok")
    return 0


if __name__ == "__main__":
    import urllib.error
    import urllib.parse

    try:
        sys.exit(main())
    except Exception as exc:
        print(f"machine check failed: {exc}", file=sys.stderr)
        sys.exit(1)
