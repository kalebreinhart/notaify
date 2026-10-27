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
  :root {
    color-scheme: light;
    --ink: #10231c;
    --paper: #f3efe4;
    --card: #fffdf8;
    --line: #e4dccb;
    --signal: #e36a12;
    --muted: #5c675f;
  }
  body {
    margin: 0;
    min-height: 100vh;
    color: var(--ink);
    background:
      radial-gradient(820px 380px at 0% -10%, #ffe3c2 0%, transparent 60%),
      var(--paper);
    font: 16px/1.5 ui-sans-serif, system-ui, sans-serif;
  }
  .wrap { max-width: 42rem; margin: 0 auto; padding: 1.6rem 1.15rem 4rem; }
  .brand { display: flex; align-items: center; gap: 0.6rem; margin-bottom: 1.6rem; text-decoration: none; color: inherit; }
  .brand .name { font-family: "Iowan Old Style", Palatino, Georgia, serif; font-size: 1.35rem; letter-spacing: -0.03em; }
  .mark { width: 2rem; height: 2rem; border-radius: 10px; background: var(--ink); color: #f6f1e6; display: grid; place-items: center; font-weight: 650; position: relative; }
  .mark::after { content: ""; position: absolute; top: 4px; right: 4px; width: 7px; height: 7px; border-radius: 99px; background: var(--signal); box-shadow: 0 0 0 2px var(--ink); }
  h1, h2 { font-family: "Iowan Old Style", Palatino, Georgia, serif; font-weight: 500; letter-spacing: -0.03em; }
  h1 { font-size: clamp(2.1rem, 6vw, 3.4rem); line-height: 1.02; margin: 0 0 0.6rem; }
  h2 { font-size: 1.35rem; margin: 0 0 0.35rem; }
  p { margin: 0.35rem 0; }
  .lede { font-size: 1.15rem; max-width: 36rem; color: var(--ink); }
  .eyebrow { text-transform: uppercase; letter-spacing: 0.14em; font-size: 0.72rem; color: var(--signal); font-weight: 700; }
  .card, .session { background: var(--card); border: 1px solid var(--line); border-radius: 20px; padding: 1.15rem 1.15rem 1.25rem; box-shadow: 0 18px 50px rgba(16, 35, 28, 0.06); }
  .points { display: grid; gap: 0.7rem; margin: 1.6rem 0 0; padding: 0; list-style: none; }
  .points li { display: block; padding: 0.95rem 1rem; border: 1px solid var(--line); border-radius: 16px; background: rgba(255,253,248,0.7); }
  form { display: grid; gap: 0.75rem; margin: 0.9rem 0 0; }
  label { display: grid; gap: 0.35rem; font-size: 0.92rem; }
  label.check { display: flex; align-items: center; gap: 0.5rem; }
  input, button, a.button { font: inherit; }
  input[type="text"], input[type="email"], input[type="password"] { padding: 0.8rem 0.9rem; border-radius: 12px; border: 1px solid #d9d0c0; background: #fff; color: var(--ink); }
  button, a.button { display: inline-block; width: fit-content; background: var(--ink); color: #f6f1e6; text-decoration: none; border: 0; border-radius: 999px; padding: 0.75rem 1.2rem; cursor: pointer; }
  button.ghost { background: transparent; color: var(--ink); border: 1px solid var(--line); }
  .nav { display: flex; gap: 0.9rem; align-items: center; margin: 0 0 1rem; color: var(--muted); }
  .session { margin: 0.8rem 0; }
  .session .top { display: flex; justify-content: space-between; gap: 0.8rem; align-items: center; }
  .pill { font-size: 0.75rem; letter-spacing: 0.04em; border-radius: 999px; padding: 0.2rem 0.55rem; background: #efe7da; }
  .pill.waiting { background: #ffe0c2; color: #8a3d09; }
  .pill.working { background: #d9efe3; color: #145c38; }
  .pill.failed { background: #f8d4d0; color: #8d2418; }
  .summary { font-family: "Iowan Old Style", Palatino, Georgia, serif; font-size: 1.2rem; line-height: 1.35; margin: 0.7rem 0; }
  .qr, .qr-frame { width: min(100%, 240px); margin: 0.5rem auto; }
  .qr svg, .qr-frame svg { width: 100%; height: auto; display: block; background: #fff; }
  .qr-frame { padding: 14px; background: #fff; border-radius: 22px; border: 1px solid var(--line); }
  .steps { display: grid; gap: 1.1rem; }
  .step { display: grid; grid-template-columns: auto 1fr; gap: 0.8rem; align-items: start; }
  .num { width: 1.8rem; height: 1.8rem; border-radius: 99px; background: var(--ink); color: #f6f1e6; display: grid; place-items: center; font-size: 0.85rem; }
  .code-input { font-size: 1.7rem; letter-spacing: 0.28em; text-align: center; }
  .banner { background: #ffe0c2; border-radius: 12px; padding: 0.75rem 0.9rem; }
  .key, code, .code, pre { font-family: ui-monospace, monospace; word-break: break-all; white-space: pre-wrap; }
  ul.devices { padding: 0; list-style: none; }
  ul.devices li { display: flex; justify-content: space-between; gap: 1rem; align-items: center; padding: 0.75rem 0; border-top: 1px solid var(--line); }
  .muted { color: var(--muted); }
  a { color: var(--ink); }
</style>
</head>
<body>
<div class="wrap">
<a class="brand" href="/"><span class="mark">N</span><span class="name">Notaify</span></a>
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
    ? `<ul class="devices">${input.devices
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
      `<h1>Pair a phone</h1>
<p>Scan this with the Notaify app on iPhone or Android. The code works once. Opening it in a browser does not enroll the phone.</p>
<div class="qr">${input.qr}</div>
<p class="code">${escapeHtml(input.payload)}</p>
<p class="muted">Expires <time datetime="${escapeHtml(input.expiresAt)}">${escapeHtml(input.expiresAt)}</time>. <a href="/pair?new=1">New QR code</a></p>
<h2>Add an agent machine</h2>
<p>Open this link on the computer that runs the agent, or paste it to the agent there. It installs the Notaify hook and pairs that machine. The link works once.</p>
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
      "Add this machine to Notaify",
      `<h1>Add this machine</h1>
<p>Run the command below. It connects this computer to Notaify and installs the hook. Do not print the script. Opening this page does not install anything.</p>
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

export function landingPage(): Response {
  return html(
    page(
      "Notaify",
      `<p class="eyebrow">For people who run agents</p>
<h1>Know when it's your turn.</h1>
<p class="lede">Notaify tells you the moment an agent finishes, or stops and waits for you. Any agent. iPhone, Android, and the web.</p>
<p><a class="button" href="/login">Sign in</a></p>
<ul class="points">
  <li><strong>Finished.</strong> The turn is over. Read the short summary, not the whole log.</li>
  <li><strong>Waiting.</strong> It needs a login, a choice, or your next prompt.</li>
  <li><strong>Any device.</strong> The same account follows you from the desk to your phone.</li>
</ul>`,
    ),
  );
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
  summary?: string;
}

function pill(state: string): string {
  const label =
    state === "needs_user" ? "Waiting" :
    state === "running" ? "Working" :
    state === "failed" ? "Failed" :
    state === "ended" ? "Closed" :
    "Finished";
  const tone = state === "needs_user" ? "waiting" : state === "running" ? "working" : state === "failed" ? "failed" : "";
  return `<span class="pill ${tone}">${label}</span>`;
}

export function inboxPage(input: { email: string; sessions: InboxSession[] }): Response {
  const rows = input.sessions.length
    ? input.sessions
        .map(
          (session) => `<article class="session">
<div class="top">${pill(session.state)}<span class="muted">${escapeHtml(session.host)}</span></div>
<p class="summary">${escapeHtml(session.summary || session.title)}</p>
<form method="post" action="/reply">
  <input type="hidden" name="host" value="${escapeHtml(session.host)}">
  <input type="hidden" name="session_id" value="${escapeHtml(session.session_id)}">
  <label>Reply <input type="text" name="text" placeholder="Tell the agent what to do next" required></label>
  <button type="submit">Send</button>
</form>
</article>`,
        )
        .join("")
    : `<div class="card"><p>No agents yet. Pair a phone or add a machine, and the next finished turn will land here.</p><p><a class="button" href="/pair">Pair a device</a></p></div>`;
  return html(
    page(
      "Notaify",
      `<div class="nav"><span>${escapeHtml(input.email)}</span><a href="/pair">Pair</a><a href="/logout">Sign out</a></div>
<h1>Waiting on you</h1>
<p class="muted">Reply goes back to that machine as the agent's next prompt.</p>
${rows}`,
    ),
  );
}

export function joinPage(code: string): Response {
  const shown = code ? `<p class="code">${escapeHtml(code)}</p>` : "<p>This link has no code.</p>";
  return html(
    page(
      "Notaify code",
      `<h1>Phone code</h1>
<p>Enter or scan this in the Notaify app. This page does not enroll a device.</p>
${shown}`,
    ),
  );
}
