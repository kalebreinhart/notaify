#!/usr/bin/env python3
"""Install the grok-attention skill and user hooks on this computer."""

from __future__ import annotations

import json
import os
import shutil
import socket
import sys
from pathlib import Path


HOOKS = (
    "UserPromptSubmit",
    "Stop",
    "StopFailure",
    "StopCancelled",
    "SessionEnd",
)

SKILL_ROOT = Path(__file__).resolve().parents[1]
REPORT = SKILL_ROOT / "scripts" / "report.py"


def python_bin() -> str:
    return shutil.which("python3") or "/usr/bin/python3"


def hook_handler() -> dict[str, object]:
    return {
        "type": "command",
        "command": python_bin(),
        "args": [str(REPORT)],
        "timeout": 8,
    }


def hook_file() -> dict[str, object]:
    handler = hook_handler()
    hooks: dict[str, object] = {
        name: [{"hooks": [handler]}] for name in HOOKS
    }
    hooks["Notification"] = [
        {"matcher": "permission_prompt", "hooks": [handler]}
    ]
    hooks["PreToolUse"] = [
        {
            "matcher": "ask_user_question|AskQuestion|AskUserQuestion",
            "hooks": [handler],
        }
    ]
    return {"hooks": hooks}


def ensure_skill_link() -> Path:
    link = Path.home() / ".grok" / "skills" / "grok-attention"
    link.parent.mkdir(parents=True, exist_ok=True)
    if link.exists() and link.resolve() == SKILL_ROOT:
        return link
    if link.is_symlink():
        link.unlink()
    elif link.exists():
        raise SystemExit(f"{link} exists and is not this skill. Move it aside and run install again.")
    link.symlink_to(SKILL_ROOT)
    return link


def install_deliver() -> None:
    unit_dir = Path.home() / ".config" / "systemd" / "user"
    unit_dir.mkdir(parents=True, exist_ok=True)
    unit = unit_dir / "grok-attention-deliver.service"
    script = SKILL_ROOT / "scripts" / "deliver.py"
    unit.write_text(
        "\n".join(
            [
                "[Unit]",
                "Description=Deliver Grok attention replies into local sessions",
                "",
                "[Service]",
                f"ExecStart={python_bin()} {script}",
                "Restart=always",
                "RestartSec=3",
                "",
                "[Install]",
                "WantedBy=default.target",
                "",
            ]
        ),
        encoding="utf-8",
    )
    systemctl = shutil.which("systemctl")
    if not systemctl:
        print(f"deliver unit written: {unit}")
        return
    result = subprocess_run([systemctl, "--user", "daemon-reload"])
    if result != 0:
        print(f"deliver unit written, systemctl reload failed: {unit}")
        return
    subprocess_run([systemctl, "--user", "enable", "--now", "grok-attention-deliver.service"])
    print("deliver: grok-attention-deliver.service")


def subprocess_run(argv: list[str]) -> int:
    import subprocess

    completed = subprocess.run(argv, check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return completed.returncode


def main() -> int:
    if not REPORT.is_file():
        raise SystemExit(f"missing {REPORT}")
    link = ensure_skill_link()
    destination = Path.home() / ".grok" / "hooks" / "grok-attention.json"
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(hook_file(), indent=2) + "\n", encoding="utf-8")
    config = Path.home() / ".config" / "grok-attention" / "config.json"
    print(f"skill: {link}")
    print(f"hooks: {destination}")
    install_deliver()
    if config.is_file():
        print(f"config: {config}")
        return 0
    print(f"config missing: {config}")
    print("Copy config.json from a computer that already has the bus, then set host to this machine:")
    print(socket.gethostname().split(".")[0])
    print("Or set GROK_ATTENTION_URL and GROK_ATTENTION_TOKEN and run install again.")
    url = os.environ.get("GROK_ATTENTION_URL", "")
    token = os.environ.get("GROK_ATTENTION_TOKEN", "")
    if url and token:
        config.parent.mkdir(parents=True, exist_ok=True)
        config.write_text(
            json.dumps(
                {
                    "url": url.rstrip("/"),
                    "token": token,
                    "host": socket.gethostname().split(".")[0],
                },
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )
        config.chmod(0o600)
        print(f"wrote {config}")
        return 0
    return 1


if __name__ == "__main__":
    sys.exit(main())
