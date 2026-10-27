#!/usr/bin/env python3
"""Post a project-board note or finish a Notaify job. Exits 0."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from client import api, load_config


def main() -> int:
    parser = argparse.ArgumentParser(description="Talk to the Notaify crew")
    parser.add_argument("action", choices=["post", "finish", "job"])
    parser.add_argument("--text", default="")
    parser.add_argument("--to", default="")
    parser.add_argument("--id", default="")
    parser.add_argument("--result", default="")
    parser.add_argument("--title", default="")
    parser.add_argument("--body", default="")
    parser.add_argument("--capability", default="")
    args = parser.parse_args()
    config = load_config() or {}
    project_id = config.get("project_id", "")
    agent = config.get("agent_name") or config.get("host") or ""
    if args.action == "job":
        if not project_id or not args.title.strip() or not args.body.strip():
            print("notaify: missing project, title, or body")
            return 0
        payload = {"title": args.title.strip(), "body": args.body.strip(), "capability": args.capability.strip()}
        print("notaify: ok" if api(f"/v1/projects/{project_id}/jobs", payload) else "notaify: not delivered")
        return 0
    if args.action == "post":
        if not project_id or not args.text.strip():
            print("notaify: missing project or text")
            return 0
        body = {"project_id": project_id, "text": args.text.strip(), "agent": agent}
        if args.to:
            body["to"] = args.to
        print("notaify: ok" if api("/v1/board", body) else "notaify: not delivered")
        return 0
    if not args.id:
        print("notaify: missing job id")
        return 0
    finish = {"id": args.id, "result": args.result.strip(), "project_id": project_id, "agent": agent}
    capabilities = config.get("capabilities")
    if isinstance(capabilities, list):
        finish["capabilities"] = capabilities
    print("notaify: ok" if api("/v1/jobs/finish", finish) else "notaify: not delivered")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:
        print("notaify: not delivered")
        sys.exit(0)
