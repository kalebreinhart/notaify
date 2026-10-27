#!/usr/bin/env python3
"""Enroll a throwaway device against the deployed pairing page, then revoke it."""

from __future__ import annotations

import json
import re
import sys
import urllib.request
from http.cookiejar import CookieJar
from pathlib import Path


def load_config() -> dict[str, str]:
    path = Path.home() / ".config" / "grok-attention" / "config.json"
    return json.loads(path.read_text(encoding="utf-8"))


def opener() -> urllib.request.OpenerDirector:
    return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(CookieJar()))


def call(web: urllib.request.OpenerDirector, request: urllib.request.Request):
    request.add_header("User-Agent", "grok-attention/1")
    return web.open(request, timeout=20)


def body_of(response: object) -> str:
    raw = response.read()  # type: ignore[attr-defined]
    return raw.decode()


def sign_in(web: urllib.request.OpenerDirector, base: str) -> None:
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import auth_check

    account = auth_check.load_account()
    form = urllib.parse.urlencode({"email": account["email"], "password": account["password"]}).encode()
    call(
        web,
        urllib.request.Request(
            base + "/login",
            data=form,
            method="POST",
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        ),
    ).read()
    code = urllib.parse.urlencode({"code": auth_check.totp(account["totp_secret"])}).encode()
    call(
        web,
        urllib.request.Request(
            base + "/login/code",
            data=code,
            method="POST",
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        ),
    ).read()


def main() -> int:
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import live_check

    config = load_config()
    base = config["url"].rstrip("/")
    token = config["token"]
    web = opener()
    sign_in(web, base)

    locked = call(web, urllib.request.Request(base + "/pair"))
    locked_body = body_of(locked)
    if locked.status != 200 or "<svg " not in locked_body:
        raise SystemExit(f"pair page status {locked.status}")
    if token in locked_body:
        raise SystemExit("unlock page leaked the bus token")

    bad = urllib.parse.urlencode({"token": "not-the-token"}).encode()
    bad_req = urllib.request.Request(base + "/pair/unlock", data=bad, method="POST")
    try:
        call(web, bad_req)
        raise SystemExit("wrong token was accepted")
    except urllib.error.HTTPError as exc:
        if exc.code != 401:
            raise SystemExit(f"wrong token status {exc.code}")

    form = urllib.parse.urlencode({"token": token}).encode()
    unlock = urllib.request.Request(
        base + "/pair/unlock",
        data=form,
        method="POST",
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    page = call(web, unlock)
    html = body_of(page)
    if page.status != 200 or "<svg " not in html:
        raise SystemExit(f"pair page status {page.status}")
    if token in html:
        raise SystemExit("pair page leaked the bus token")
    match = re.search(r"/join\?code=([A-Za-z0-9_-]{16,64})", html)
    if not match:
        raise SystemExit("pair page had no enrollment code")
    code = match.group(1)

    joined = call(web, urllib.request.Request(f"{base}/join?code={code}"))
    join_html = body_of(joined)
    if "does not enroll" not in join_html or "gat_" in join_html:
        raise SystemExit("join page enrolled or hid the instructions")

    enroll_req = urllib.request.Request(
        base + "/v1/enroll",
        data=json.dumps({"code": code, "name": "pair-check"}).encode(),
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    enrolled = json.loads(body_of(call(web, enroll_req)))
    device = enrolled.get("device_token", "")
    device_id = enrolled.get("device_id", "")
    if not device.startswith("gat_") or not device_id:
        raise SystemExit("enroll did not return a device credential")

    again = urllib.request.Request(
        base + "/v1/enroll",
        data=json.dumps({"code": code, "name": "pair-check"}).encode(),
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    try:
        call(web, again)
        raise SystemExit("enrollment code was reusable")
    except urllib.error.HTTPError as exc:
        if exc.code != 410:
            raise SystemExit(f"reuse status {exc.code}")

    sessions = urllib.request.Request(base + "/v1/sessions", headers={"Authorization": "Bearer " + device})
    listed = call(web, sessions)
    if listed.status != 200:
        raise SystemExit(f"device sessions status {listed.status}")
    body_of(listed)

    hello = live_check.ws_hello(base, device)
    if hello.get("type") != "hello":
        raise SystemExit("device websocket did not hello")

    post = urllib.request.Request(
        base + "/v1/events",
        data=json.dumps({"kind": "turn_ended", "host": "pair-check", "title": "nope"}).encode(),
        method="POST",
        headers={"Authorization": "Bearer " + device, "Content-Type": "application/json"},
    )
    try:
        call(web, post)
        raise SystemExit("device token was allowed to post events")
    except urllib.error.HTTPError as exc:
        if exc.code != 401:
            raise SystemExit(f"device post status {exc.code}")

    revoke = urllib.parse.urlencode({"id": device_id}).encode()
    call(
        web,
        urllib.request.Request(
            base + "/pair/revoke",
            data=revoke,
            method="POST",
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        ),
    )
    try:
        call(
            web,
            urllib.request.Request(base + "/v1/sessions", headers={"Authorization": "Bearer " + device}),
        )
        raise SystemExit("revoked device token still worked")
    except urllib.error.HTTPError as exc:
        if exc.code != 401:
            raise SystemExit(f"revoked status {exc.code}")

    print("pair check ok")
    return 0


if __name__ == "__main__":
    import urllib.error
    import urllib.parse

    try:
        sys.exit(main())
    except Exception as exc:
        print(f"pair check failed: {exc}", file=sys.stderr)
        sys.exit(1)
