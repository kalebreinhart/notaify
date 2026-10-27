import classifyPy from "../skill/scripts/classify.py";
import clientPy from "../skill/scripts/client.py";
import deliverPy from "../skill/scripts/deliver.py";
import installPy from "../skill/scripts/install.py";
import notifyPy from "../skill/scripts/notify.py";
import reportPy from "../skill/scripts/report.py";
import teamPy from "../skill/scripts/team.py";
import skillMd from "../skill/SKILL.md";

const SKILL_FILES: Record<string, string> = {
  "SKILL.md": skillMd,
  "scripts/classify.py": classifyPy,
  "scripts/client.py": clientPy,
  "scripts/deliver.py": deliverPy,
  "scripts/install.py": installPy,
  "scripts/notify.py": notifyPy,
  "scripts/report.py": reportPy,
  "scripts/team.py": teamPy,
};

function utf8Base64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function installCommand(origin: string, code: string): string {
  return `curl -fsSL -X POST --data claim=1 ${shellQuote(`${origin}/m/${code}/install`)} | sh`;
}

export function installScript(input: {
  url: string;
  token: string;
  project_id?: string;
  agent_name?: string;
  capabilities?: string[];
}): string {
  const bundle = {
    url: input.url,
    token: input.token,
    project_id: input.project_id ?? "",
    agent_name: input.agent_name ?? "",
    capabilities: input.capabilities ?? [],
    files: Object.fromEntries(Object.entries(SKILL_FILES).map(([path, text]) => [path, utf8Base64(text)])),
  };
  const packed = JSON.stringify(bundle);
  return `#!/bin/sh
set -eu
if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required" >&2
  exit 1
fi
python3 - << 'PY'
import base64, json, os
from pathlib import Path
bundle = json.loads(${JSON.stringify(packed)})
home = Path.home()
root = home / ".grok" / "skills" / "grok-attention"
for rel, encoded in bundle["files"].items():
    dest = root.joinpath(*rel.split("/"))
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(base64.b64decode(encoded))
config_dir = home / ".config" / "grok-attention"
config_dir.mkdir(parents=True, exist_ok=True)
host = os.uname().nodename.split(".")[0]
config = config_dir / "config.json"
existing = {}
if config.exists():
    try:
        loaded = json.loads(config.read_text())
        if isinstance(loaded, dict):
            existing = loaded
    except Exception:
        existing = {}
token = bundle["token"]
old = existing.get("token")
if isinstance(old, str) and old and not old.startswith("gam_") and not old.startswith("gat_"):
    token = old
record = {"url": bundle["url"], "token": token, "host": host}
if bundle.get("project_id"):
    record["project_id"] = bundle["project_id"]
if bundle.get("agent_name"):
    record["agent_name"] = bundle["agent_name"]
if bundle.get("capabilities"):
    record["capabilities"] = bundle["capabilities"]
config.write_text(json.dumps(record, indent=2) + "\\n")
os.chmod(config, 0o600)
print("paired " + host)
PY
python3 "$HOME/.grok/skills/grok-attention/scripts/install.py"
python3 - << 'PY'
import json, urllib.request
from pathlib import Path
config = json.loads((Path.home() / ".config" / "grok-attention" / "config.json").read_text())
request = urllib.request.Request(
    config["url"].rstrip("/") + "/v1/machine",
    data=json.dumps({"name": config.get("agent_name") or config["host"]}).encode(),
    method="POST",
    headers={
        "Authorization": "Bearer " + config["token"],
        "Content-Type": "application/json",
        "User-Agent": "grok-attention/1",
    },
)
try:
    with urllib.request.urlopen(request, timeout=10) as response:
        response.read()
except Exception:
    pass
PY
echo "grok-attention installed"
`;
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}
