export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)}</title>
<!-- pairing-ui -->
<style>
  :root { color-scheme: light; }
  body { margin: 0; min-height: 100vh; background: #e6e0d4; color: #1c1915; font: 17px/1.45 Georgia, "Iowan Old Style", serif; }
  .wrap { max-width: 40rem; margin: 0 auto; padding: 2.5rem 1.1rem 4rem; }
  .brand { display: flex; align-items: center; gap: 0.55rem; font-size: 0.95rem; letter-spacing: 0.04em; margin-bottom: 1.4rem; }
  .mark { width: 1.7rem; height: 1.7rem; border-radius: 8px; background: #1c1915; color: #f4efe6; display: grid; place-items: center; font-family: ui-sans-serif, system-ui, sans-serif; }
  h1 { font-size: 2rem; font-weight: 500; letter-spacing: -0.03em; margin: 0 0 0.35rem; }
  h2 { font-size: 1.25rem; font-weight: 500; margin: 1.6rem 0 0.4rem; }
  p { margin: 0.4rem 0; }
  .card { background: #fbf8f3; border: 1px solid #ddd4c6; border-radius: 18px; padding: 1.2rem; box-shadow: 0 18px 40px rgba(60, 40, 10, 0.06); }
  form { display: grid; gap: 0.75rem; margin: 0.8rem 0 0; }
  label { display: grid; gap: 0.35rem; font-size: 0.95rem; }
  label.check { display: flex; align-items: center; gap: 0.5rem; }
  input, button, a.button { font: inherit; }
  input[type="text"], input[type="email"], input[type="password"] { padding: 0.75rem 0.85rem; border-radius: 12px; border: 1px solid #cfc6b8; background: #fff; }
  button, a.button { display: inline-block; width: fit-content; background: #1c1915; color: #fbf8f3; text-decoration: none; border: 0; border-radius: 999px; padding: 0.7rem 1.15rem; cursor: pointer; }
  .qr, .qr-frame { width: min(100%, 260px); margin: 0.4rem auto; }
  .qr svg, .qr-frame svg { width: 100%; height: auto; display: block; background: #fff; }
  .qr-frame { padding: 14px; background: #fff; border-radius: 20px; border: 1px solid #e4dccd; }
  .steps { display: grid; gap: 1.1rem; }
  .step { display: grid; grid-template-columns: auto 1fr; gap: 0.8rem; align-items: start; }
  .num { width: 1.8rem; height: 1.8rem; border-radius: 999px; background: #1c1915; color: #fbf8f3; display: grid; place-items: center; font-size: 0.9rem; }
  .code-input { font-size: 1.7rem; letter-spacing: 0.32em; text-align: center; font-variant-numeric: tabular-nums; }
  .banner { background: #f4dfd0; border-radius: 12px; padding: 0.75rem 0.9rem; }
  .key { font-family: ui-monospace, monospace; letter-spacing: 0.08em; font-size: 1rem; }
  code, .code, pre { font-family: ui-monospace, monospace; word-break: break-all; white-space: pre-wrap; }
  ul { padding: 0; list-style: none; }
  li { display: flex; justify-content: space-between; gap: 1rem; align-items: center; padding: 0.7rem 0; border-top: 1px solid #e4dccd; }
  .muted { color: #5e564c; }
  details { margin-top: 0.4rem; }
  a { color: #1c1915; }
</style>
</head>
<body>
<div class="wrap">
<header class="brand"><span class="mark">N</span><span>Notaify</span></header>
${body}
</div>
</body>
</html>`;
}

export function html(body: string, status = 200, extra?: HeadersInit): Response {
  const headers = new Headers(extra);
  headers.set("Content-Type", "text/html; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set(
    "Content-Security-Policy",
    "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  );
  return new Response(body, { status, headers });
}

export function unlockPage(failed: boolean): Response {
  const note = failed ? "<p>That token was not accepted.</p>" : "";
  return html(
    page(
      "Unlock pairing",
      `<h1>Unlock pairing</h1>
<p>Enter the bus token from this account. It stays on this page and is not put in the QR code.</p>
${note}
<form method="post" action="/pair/unlock">
  <label>Bus token <input type="password" name="token" autocomplete="current-password" required></label>
  <button type="submit">Unlock</button>
</form>`,
    ),
    failed ? 401 : 200,
  );
}

export interface DeviceRowView {
  id: string;
  name: string;
  created_at: string;
  role: string;
}

export function pairPage(input: {
  payload: string;
  code: string;
  expiresAt: string;
  qr: string;
  machineUrl: string;
  machineCommand: string;
  machineExpiresAt: string;
  devices: DeviceRowView[];
}): Response {
  const devices = input.devices.length
    ? `<ul>${input.devices
        .map((device) => {
          const kind = device.role === "publisher" ? "machine" : "Mac";
          return `<li><span>${escapeHtml(device.name)} <span class="muted">${kind} ${escapeHtml(device.created_at)}</span></span>
<form method="post" action="/pair/revoke"><input type="hidden" name="id" value="${escapeHtml(device.id)}"><button type="submit">Revoke</button></form></li>`;
        })
        .join("")}</ul>`
    : "<p class=\"muted\">No devices enrolled.</p>";
  return html(
    page(
      "Pair a device",
      `<h1>Pair a Mac</h1>
<p>Scan this with the Mac app. The code works once and then expires. Opening it in a browser does not enroll the phone.</p>
<div class="qr">${input.qr}</div>
<p class="code">${escapeHtml(input.payload)}</p>
<p class="muted">Expires <time datetime="${escapeHtml(input.expiresAt)}">${escapeHtml(input.expiresAt)}</time>. <a href="/pair?new=1">New QR code</a></p>
<h2>Add a Grok machine</h2>
<p>Open this link on the other computer, or paste it to Grok there. It installs the skill and pairs that machine. The link works once.</p>
<p class="code">${escapeHtml(input.machineUrl)}</p>
<pre>${escapeHtml(input.machineCommand)}</pre>
<p class="muted">Expires <time datetime="${escapeHtml(input.machineExpiresAt)}">${escapeHtml(input.machineExpiresAt)}</time>. <a href="/pair?new_machine=1">New machine link</a></p>
<h2>Enrolled</h2>
${devices}
<script>
const current = ${JSON.stringify(input.code)};
const machine = ${JSON.stringify(machineCode(input.machineUrl))};
setInterval(async () => {
  try {
    const res = await fetch("/v1/pairings/current");
    if (res.status === 401) { location.href = "/pair"; return; }
    const body = await res.json();
    if (!body.code || body.code !== current || body.machine_code !== machine) location.assign("/pair");
  } catch (_) {}
}, 2000);
</script>`,
    ),
  );
}

function machineCode(machineUrl: string): string {
  const slash = machineUrl.lastIndexOf("/");
  return slash === -1 ? "" : machineUrl.slice(slash + 1);
}

export function text(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export function machineLinkPage(input: { command: string; expiresAt: string; live: boolean }): Response {
  if (!input.live) {
    return html(
      page(
        "Machine link expired",
        `<h1>This link is no longer usable</h1>
<p>Make a new machine link on the pairing page.</p>`,
      ),
      410,
    );
  }
  return html(
    page(
      "Install grok-attention",
      `<h1>Install grok-attention</h1>
<p>On this computer, run the command below. It installs the skill, the hooks, and this machine's credential. Do not print the script. Opening this page does not install anything.</p>
<pre>${escapeHtml(input.command)}</pre>
<p class="muted">Expires <time datetime="${escapeHtml(input.expiresAt)}">${escapeHtml(input.expiresAt)}</time></p>`,
    ),
  );
}

export function machineLinkText(input: { command: string; expiresAt: string; live: boolean }): string {
  if (!input.live) return "This grok-attention machine link is expired or already used. Make a new one on the pairing page.\n";
  return `This is a one-time grok-attention installer for a Grok Build machine.
Run the command below. It installs the skill, the hooks, and this machine's credential.
Do not print the script. Do not open the install URL with GET.
Opening this page does not consume the link.
Expires ${input.expiresAt}

${input.command}
`;
}

export function loginPage(input: { failed: boolean; providers: { id: string; label: string }[] }): Response {
  const providers = input.providers
    .map(
      (provider) =>
        `<p><a class="button" href="/auth/start/${escapeHtml(provider.id)}">Continue with ${escapeHtml(provider.label)}</a></p>`,
    )
    .join("");
  const note = input.failed ? `<p class="banner">Email or password is wrong.</p>` : "";
  return html(
    page(
      "Sign in",
      `<h1>Sign in</h1>
<p class="muted">Know when an agent is finished and waiting on you. iPhone, Android, and the web.</p>
<div class="card">
${note}
<form method="post" action="/login">
  <label>Email <input type="email" name="email" autocomplete="username" required></label>
  <label>Password <input type="password" name="password" autocomplete="current-password" required></label>
  <button type="submit">Continue</button>
</form>
${providers}
</div>`,
    ),
    input.failed ? 401 : 200,
  );
}

export function codePage(input: { failed: boolean; setup: { qr: string; secret: string; email: string } | null }): Response {
  const note = input.failed ? `<p class="banner">That code is wrong or already used. The camera code above is still the right one.</p>` : "";
  const setup = input.setup
    ? `<div class="step"><div class="num">1</div><div>
<h2>Scan with your camera</h2>
<p>Open an authenticator app and use its scan button. Point the camera at this code.</p>
<div class="qr-frame">${input.setup.qr}</div>
<p class="muted">${escapeHtml(input.setup.email)}</p>
<details><summary>Can't scan? Type this key instead</summary><p class="key">${escapeHtml(groupSecret(input.setup.secret))}</p></details>
</div></div>`
    : "";
  const step = input.setup ? "2" : "1";
  return html(
    page(
      "Authenticator",
      `<h1>${input.setup ? "Pair your authenticator" : "Authenticator code"}</h1>
<p class="muted">${input.setup ? "One scan, then the 6 digits the app shows." : "Enter the 6 digits from your authenticator."}</p>
<div class="card">
${note}
<div class="steps">
${setup}
<div class="step"><div class="num">${step}</div><div>
<h2>Enter the code</h2>
<form method="post" action="/login/code">
  <label>6-digit code <input class="code-input" type="text" name="code" inputmode="numeric" autocomplete="one-time-code" autocapitalize="off" spellcheck="false" required autofocus></label>
  ${input.setup ? `<label class="check"><input type="checkbox" name="scanned" value="1" checked> I scanned this with my phone</label>` : ""}
  <button type="submit">Sign in</button>
</form>
<p class="muted">A backup code works here too.</p>
${input.setup ? "" : `<form method="post" action="/login/show-code"><button type="submit">Show the camera code</button></form>`}
</div></div>
</div>
</div>`,
    ),
    input.failed ? 401 : 200,
  );
}

function groupSecret(secret: string): string {
  return secret.replace(/(.{4})/g, "$1 ").trim();
}

export interface InboxSession {
  host: string;
  session_id: string;
  workspace: string;
  state: string;
  title: string;
}

export function inboxPage(input: { email: string; sessions: InboxSession[] }): Response {
  const rows = input.sessions.length
    ? input.sessions
        .map(
          (session) => `<li>
<span><strong>${escapeHtml(session.host)}</strong> ${escapeHtml(session.state)} ${escapeHtml(session.title)}
<span class="muted">${escapeHtml(session.workspace)}</span></span>
<form method="post" action="/reply">
  <input type="hidden" name="host" value="${escapeHtml(session.host)}">
  <input type="hidden" name="session_id" value="${escapeHtml(session.session_id)}">
  <input type="text" name="text" placeholder="Next prompt" required>
  <button type="submit">Send</button>
</form>
</li>`,
        )
        .join("")
    : "<p class=\"muted\">No open sessions yet.</p>";
  return html(
    page(
      "Notaify",
      `<h1>Waiting on you</h1>
<p>${escapeHtml(input.email)} · <a href="/pair">Pairing</a> · <a href="/logout">Sign out</a></p>
<p>A reply is delivered to that machine's Grok session as the next prompt.</p>
<ul>${rows}</ul>`,
    ),
  );
}

export function joinPage(code: string): Response {
  const shown = code ? `<p class="code">${escapeHtml(code)}</p>` : "<p>This link has no code.</p>";
  return html(
    page(
      "Grok Attention code",
      `<h1>Enrollment code</h1>
<p>Enter or scan this in the Grok Attention Mac app. This page does not enroll a device.</p>
${shown}`,
    ),
  );
}
