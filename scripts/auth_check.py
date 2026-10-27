#!/usr/bin/env python3
"""Sign in as the owner, then deliver one reply to the shell queue."""

from __future__ import annotations

import hashlib
import hmac
import json
import struct
import time
import urllib.parse
import urllib.request
from http.cookiejar import CookieJar
from pathlib import Path


def load_account() -> dict[str, str]:
    values: dict[str, str] = {}
    for line in (Path.home() / ".config" / "grok-attention" / "account.txt").read_text().splitlines():
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        values[key.strip()] = value.strip()
    return values


def load_bus() -> dict[str, str]:
    return json.loads((Path.home() / ".config" / "grok-attention" / "config.json").read_text())


def base32_decode(text: str) -> bytes:
    alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
    clean = text.strip().replace(" ", "").upper()
    bits = 0
    value = 0
    out = bytearray()
    for char in clean:
        index = alphabet.find(char)
        if index < 0:
            continue
        value = (value << 5) | index
        bits += 5
        if bits >= 8:
            out.append((value >> (bits - 8)) & 255)
            bits -= 8
    return bytes(out)


def totp(secret: str, now: float | None = None) -> str:
    counter = int((now if now is not None else time.time()) / 30)
    digest = hmac.new(base32_decode(secret), struct.pack(">Q", counter), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    binary = struct.unpack(">I", digest[offset : offset + 4])[0] & 0x7FFFFFFF
    return f"{binary % 1000000:06d}"


def opener() -> urllib.request.OpenerDirector:
    return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(CookieJar()))


def call(web: urllib.request.OpenerDirector, request: urllib.request.Request):
    request.add_header("User-Agent", "grok-attention/1")
    return web.open(request, timeout=20)


def main() -> int:
    account = load_account()
    bus = load_bus()
    base = bus["url"].rstrip("/")
    web = opener()
    bad = urllib.parse.urlencode({"email": account["email"], "password": "wrong-password"}).encode()
    try:
        call(web, urllib.request.Request(base + "/login", data=bad, method="POST"))
        raise SystemExit("wrong password was accepted")
    except urllib.error.HTTPError as exc:
        if exc.code != 401:
            raise SystemExit(f"wrong password status {exc.code}")

    good = urllib.parse.urlencode({"email": account["email"], "password": account["password"]}).encode()
    code_page = call(web, urllib.request.Request(base + "/login", data=good, method="POST")).read().decode()
    grouped = " ".join(account["totp_secret"][i : i + 4] for i in range(0, len(account["totp_secret"]), 4))
    if "<svg " not in code_page or "Scan with your camera" not in code_page or grouped not in code_page:
        raise SystemExit("password login did not show a scannable authenticator code")
    code = urllib.parse.urlencode({"code": totp(account["totp_secret"])}).encode()
    home = call(web, urllib.request.Request(base + "/login/code", data=code, method="POST")).read().decode()
    if account["email"] not in home:
        raise SystemExit("signed-in page did not show the account")

    host = bus["host"]
    reply = urllib.parse.urlencode(
        {"host": host, "session_id": "auth-check", "text": "Reply path check. Stop after acknowledging this."}
    ).encode()
    sent = call(
        web,
        urllib.request.Request(base + "/reply", data=reply, method="POST", headers={"Content-Type": "application/x-www-form-urlencoded"}),
    )
    sent.read()
    claimed = call(
        web,
        urllib.request.Request(
            base + "/v1/replies/claim",
            data=json.dumps({"host": host}).encode(),
            method="POST",
            headers={"Authorization": "Bearer " + bus["token"], "Content-Type": "application/json"},
        ),
    )
    body = json.loads(claimed.read().decode())
    text = (body.get("reply") or {}).get("text", "")
    if "Reply path check" not in text:
        raise SystemExit("reply was not claimed by the hook token")
    again = json.loads(
        call(
            web,
            urllib.request.Request(
                base + "/v1/replies/claim",
                data=json.dumps({"host": host}).encode(),
                method="POST",
                headers={"Authorization": "Bearer " + bus["token"], "Content-Type": "application/json"},
            ),
        )
        .read()
        .decode()
    )
    if again.get("reply") is not None:
        raise SystemExit("reply was claimed twice")
    print("auth check ok")
    return 0


if __name__ == "__main__":
    import urllib.error

    try:
        raise SystemExit(main())
    except SystemExit:
        raise
    except Exception as exc:
        print(f"auth check failed: {exc}", file=__import__("sys").stderr)
        raise SystemExit(1)
