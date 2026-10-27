#!/usr/bin/env python3
"""Exercise the deployed bus. Reads ~/.config/grok-attention/config.json."""

from __future__ import annotations

import base64
import json
import os
import socket
import ssl
import struct
import sys
import urllib.error
import urllib.request
from pathlib import Path
from urllib.parse import urlparse


def load_config() -> dict[str, str]:
    path = Path.home() / ".config" / "grok-attention" / "config.json"
    return json.loads(path.read_text(encoding="utf-8"))


def request(url: str, token: str, method: str = "GET", body: dict | None = None) -> tuple[int, dict]:
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={
            "Authorization": "Bearer " + token,
            "Content-Type": "application/json",
            "User-Agent": "grok-attention/1",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as response:
            return response.status, json.loads(response.read().decode())
    except urllib.error.HTTPError as exc:
        return exc.code, json.loads(exc.read().decode())


def ws_hello(url: str, token: str) -> dict:
    parsed = urlparse(url)
    host = parsed.hostname or ""
    port = 443
    path = "/v1/ws"
    key = base64.b64encode(os.urandom(16)).decode()
    handshake = (
        f"GET {path} HTTP/1.1\r\n"
        f"Host: {host}\r\n"
        "Upgrade: websocket\r\n"
        "Connection: Upgrade\r\n"
        f"Sec-WebSocket-Key: {key}\r\n"
        "Sec-WebSocket-Version: 13\r\n"
        f"Authorization: Bearer {token}\r\n"
        "User-Agent: grok-attention/1\r\n"
        "\r\n"
    )
    raw = socket.create_connection((host, port), timeout=20)
    tls = ssl.create_default_context().wrap_socket(raw, server_hostname=host)
    tls.sendall(handshake.encode())
    buf = b""
    while b"\r\n\r\n" not in buf:
        chunk = tls.recv(4096)
        if not chunk:
            raise SystemExit("websocket closed during handshake")
        buf += chunk
    head, rest = buf.split(b"\r\n\r\n", 1)
    status = head.split(b"\r\n", 1)[0]
    if b" 101 " not in status:
        raise SystemExit(f"websocket upgrade failed: {status.decode()}")
    frame = read_frame(tls, rest)
    tls.close()
    return json.loads(frame)


def read_frame(tls: ssl.SSLSocket, already: bytes) -> bytes:
    buf = already
    while len(buf) < 2:
        buf += tls.recv(4096)
    first, second = buf[0], buf[1]
    offset = 2
    opcode = first & 0x0F
    masked = (second & 0x80) != 0
    length = second & 0x7F
    if length == 126:
        while len(buf) < offset + 2:
            buf += tls.recv(4096)
        length = struct.unpack("!H", buf[offset : offset + 2])[0]
        offset += 2
    elif length == 127:
        while len(buf) < offset + 8:
            buf += tls.recv(4096)
        length = struct.unpack("!Q", buf[offset : offset + 8])[0]
        offset += 8
    if masked:
        while len(buf) < offset + 4 + length:
            buf += tls.recv(4096)
        mask = buf[offset : offset + 4]
        offset += 4
        data = bytes(byte ^ mask[i % 4] for i, byte in enumerate(buf[offset : offset + length]))
    else:
        while len(buf) < offset + length:
            buf += tls.recv(4096)
        data = buf[offset : offset + length]
    if opcode != 1:
        raise SystemExit(f"expected text frame, got opcode {opcode}")
    return data


def main() -> int:
    config = load_config()
    base = config["url"].rstrip("/")
    token = config["token"]
    status, health = request(base + "/v1/health", token)
    assert status == 200 and health.get("ok") is True, health
    denied, _ = request(base + "/v1/sessions", "nope")
    assert denied == 401, denied

    host = "live-check"
    session = "live-check-" + os.urandom(4).hex()
    sticky = {
        "kind": "needs_user",
        "urgency": "attention",
        "state": "needs_user",
        "sticky": True,
        "host": host,
        "session_id": session,
        "prompt_id": "p1",
        "workspace": "/tmp/live-check",
        "title": "Bus test ask",
        "body": "sticky ask",
        "source": "agent",
        "dedupe_key": f"{host}|{session}|p1|needs_user",
    }
    status, posted = request(base + "/v1/events", token, "POST", sticky)
    assert status == 200 and posted["duplicate"] is False, posted
    status, again = request(base + "/v1/events", token, "POST", sticky)
    assert again["duplicate"] is True and again["event"]["id"] == posted["event"]["id"]

    status, ended = request(
        base + "/v1/events",
        token,
        "POST",
        {
            "kind": "turn_ended",
            "state": "idle",
            "host": host,
            "session_id": session,
            "prompt_id": "p1",
            "title": "Bus test finished",
            "body": "should not clear the ask",
            "source": "hook",
        },
    )
    assert ended["session"]["state"] == "needs_user", ended["session"]
    assert ended["session"]["title"] == "Bus test ask"

    status, started = request(
        base + "/v1/events",
        token,
        "POST",
        {
            "kind": "turn_started",
            "state": "running",
            "host": host,
            "session_id": session,
            "prompt_id": "p2",
            "title": "Working",
            "body": "",
            "source": "hook",
        },
    )
    assert started["session"]["state"] == "running"

    status, permission = request(
        base + "/v1/events",
        token,
        "POST",
        {
            "kind": "needs_user",
            "sticky": False,
            "host": host,
            "session_id": session,
            "prompt_id": "p2",
            "title": "Allow deploy?",
            "body": "permission",
            "source": "hook",
        },
    )
    assert permission["session"]["state"] == "needs_user"
    assert permission["session"]["sticky"] is False

    status, cleared = request(
        base + "/v1/events",
        token,
        "POST",
        {
            "kind": "turn_ended",
            "state": "idle",
            "host": host,
            "session_id": session,
            "prompt_id": "p2",
            "title": "Deployed",
            "body": "done",
            "source": "hook",
        },
    )
    assert cleared["session"]["state"] == "idle", cleared["session"]

    hello = ws_hello(base, token)
    assert hello["type"] == "hello"
    assert any(item["title"] == "Bus test ask" for item in hello["events"])

    status, _ = request(
        base + "/v1/events",
        token,
        "POST",
        {
            "kind": "session_ended",
            "state": "ended",
            "host": host,
            "session_id": session,
            "title": "Session ended",
            "body": "",
            "source": "hook",
        },
    )
    print("live check ok")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:
        print(f"live check failed: {exc}", file=sys.stderr)
        sys.exit(1)
