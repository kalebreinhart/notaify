import classifyPy from "../skill/scripts/classify.py";
import clientPy from "../skill/scripts/client.py";
import installPy from "../skill/scripts/install.py";
import notifyPy from "../skill/scripts/notify.py";
import reportPy from "../skill/scripts/report.py";
import skillMd from "../skill/SKILL.md";

const SKILL_FILES: Record<string, string> = {
  "SKILL.md": skillMd,
  "scripts/classify.py": classifyPy,
  "scripts/client.py": clientPy,
  "scripts/install.py": installPy,
  "scripts/notify.py": notifyPy,
  "scripts/report.py": reportPy,
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

export function installScript(input: { url: string; token: string }): string {
  const bundle = {
    url: input.url,
    token: input.token,
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
config.write_text(json.dumps({"url": bundle["url"], "token": bundle["token"], "host": host}, indent=2) + "\\n")
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
    data=json.dumps({"name": config["host"]}).encode(),
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
