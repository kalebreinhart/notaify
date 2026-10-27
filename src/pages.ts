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
    color-scheme: dark;
    --ink: #f4efe6;
    --paper: #141c18;
    --card: #1c2622;
    --line: #314039;
    --signal: #ff8a3d;
    --muted: #a8b4ac;
    --bg: #0c1210;
  }
  body {
    margin: 0;
    min-height: 100vh;
    color: var(--ink);
    background:
      radial-gradient(900px 420px at 100% -15%, rgba(255, 138, 61, 0.22), transparent 55%),
      radial-gradient(700px 360px at -10% 10%, rgba(90, 160, 120, 0.14), transparent 50%),
      var(--bg);
    font: 16px/1.5 ui-sans-serif, system-ui, sans-serif;
  }
  .wrap { max-width: 42rem; margin: 0 auto; padding: 1.6rem 1.15rem 4rem; }
  .brand { display: flex; align-items: center; gap: 0.6rem; margin-bottom: 1.6rem; text-decoration: none; color: inherit; }
  .brand .name { font-family: "Iowan Old Style", Palatino, Georgia, serif; font-size: 1.35rem; letter-spacing: -0.03em; }
  .mark { width: 2rem; height: 2rem; border-radius: 10px; background: var(--signal); color: #1a1008; display: grid; place-items: center; font-weight: 700; position: relative; }
  .mark::after { content: ""; position: absolute; top: 4px; right: 4px; width: 7px; height: 7px; border-radius: 99px; background: #f4efe6; box-shadow: 0 0 0 2px var(--signal); }
  h1, h2 { font-family: "Iowan Old Style", Palatino, Georgia, serif; font-weight: 500; letter-spacing: -0.03em; }
  h1 { font-size: clamp(2.1rem, 6vw, 3.4rem); line-height: 1.02; margin: 0 0 0.6rem; }
  h2 { font-size: 1.35rem; margin: 0 0 0.35rem; }
  p { margin: 0.35rem 0; }
  .lede { font-size: 1.15rem; max-width: 36rem; color: var(--ink); }
  .eyebrow { text-transform: uppercase; letter-spacing: 0.14em; font-size: 0.72rem; color: var(--signal); font-weight: 700; }
  .card, .session { background: var(--card); border: 1px solid var(--line); border-radius: 20px; padding: 1.15rem 1.15rem 1.25rem; box-shadow: 0 18px 50px rgba(0, 0, 0, 0.28); }
  .points { display: grid; gap: 0.7rem; margin: 1.6rem 0 0; padding: 0; list-style: none; }
  .points li { display: block; padding: 0.95rem 1rem; border: 1px solid var(--line); border-radius: 16px; background: rgba(12, 18, 16, 0.55); }
  .actions { display: flex; flex-wrap: wrap; gap: 0.6rem; margin: 1rem 0; }
  .floor { display: grid; grid-template-columns: 1fr 1.15fr 1fr; gap: 0.7rem; margin-top: 1.5rem; }
  .node { border: 1px solid var(--line); border-radius: 18px; padding: 0.95rem 1rem 1.05rem; background: rgba(28, 38, 34, 0.92); }
  .node.board { background: #24180f; border-color: #6a4330; }
  .uses { display: grid; grid-template-columns: 1fr 1fr; gap: 0.7rem; margin-top: 0.8rem; }
  fieldset { border: 1px solid var(--line); border-radius: 14px; display: grid; gap: 0.35rem; margin: 0; padding: 0.7rem 0.9rem 0.9rem; }
  legend { color: var(--muted); padding: 0 0.25rem; }
  @media (max-width: 720px) {
    .floor, .uses { grid-template-columns: 1fr; }
  }
  form { display: grid; gap: 0.75rem; margin: 0.9rem 0 0; }
  label { display: grid; gap: 0.35rem; font-size: 0.92rem; }
  label.check { display: flex; align-items: center; gap: 0.5rem; }
  input, button, a.button { font: inherit; }
  input[type="text"], input[type="email"], input[type="password"] { padding: 0.8rem 0.9rem; border-radius: 12px; border: 1px solid var(--line); background: #0e1512; color: var(--ink); }
  button, a.button { display: inline-block; width: fit-content; background: var(--signal); color: #1a1008; text-decoration: none; border: 0; border-radius: 999px; padding: 0.75rem 1.2rem; cursor: pointer; font-weight: 650; }
  a.button.ghost, button.ghost { background: transparent; color: var(--ink); border: 1px solid var(--line); }
  button.ghost { background: transparent; color: var(--ink); border: 1px solid var(--line); }
  .nav { display: flex; gap: 0.9rem; align-items: center; margin: 0 0 1rem; color: var(--muted); }
  .session { margin: 0.8rem 0; }
  .session .top { display: flex; justify-content: space-between; gap: 0.8rem; align-items: center; }
  .pill { font-size: 0.75rem; letter-spacing: 0.04em; border-radius: 999px; padding: 0.2rem 0.55rem; background: #24302b; color: var(--ink); }
  .pill.waiting { background: #3a2416; color: #ffb27a; }
  .pill.working { background: #163528; color: #8ddebe; }
  .pill.failed { background: #3a1818; color: #ffb0a8; }
  .crew { display: grid; gap: 0.75rem; margin-top: 1.5rem; }
  .crew article { border: 1px solid var(--line); border-radius: 18px; padding: 1rem 1.05rem; background: rgba(28, 38, 34, 0.85); }
  .crew .who { color: var(--signal); font-size: 0.78rem; letter-spacing: 0.08em; text-transform: uppercase; font-weight: 700; }
  .summary { font-family: "Iowan Old Style", Palatino, Georgia, serif; font-size: 1.2rem; line-height: 1.35; margin: 0.7rem 0; }
  .options { display: flex; flex-wrap: wrap; gap: 0.5rem; }
  .options form { margin: 0; }
  .options button { background: transparent; color: var(--ink); border: 1px solid var(--signal); }
  .qr, .qr-frame { width: min(100%, 240px); margin: 0.5rem auto; }
  .qr svg, .qr-frame svg { width: 100%; height: auto; display: block; background: #fff; }
  .qr-frame { padding: 14px; background: #fff; border-radius: 22px; border: 1px solid var(--line); }
  .steps { display: grid; gap: 1.1rem; }
  .step { display: grid; grid-template-columns: auto 1fr; gap: 0.8rem; align-items: start; }
  .num { width: 1.8rem; height: 1.8rem; border-radius: 99px; background: var(--signal); color: #1a1008; display: grid; place-items: center; font-size: 0.85rem; font-weight: 700; }
  .code-input { font-size: 1.7rem; letter-spacing: 0.28em; text-align: center; }
  .banner { background: #3a2416; color: #ffd7b8; border-radius: 12px; padding: 0.75rem 0.9rem; }
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
<p class="lede">Notaify tells you the moment an agent finishes, or stops and waits for you. Agents on different machines can also share one project and hand work to whoever has the tools.</p>
<div class="actions"><a class="button" href="/login">Sign in</a> <a class="button ghost" href="/enroll">Enroll an agent</a></div>
<ul class="points">
  <li><strong>Finished.</strong> The turn is over. Read the short summary, not the whole log.</li>
  <li><strong>Waiting.</strong> It needs a login, a choice, or your next prompt. Tap an option or type your own. That text is the agent's next turn.</li>
  <li><strong>Any device.</strong> The same account follows you from the desk to your phone.</li>
</ul>
<div class="floor">
  <article class="node"><p class="who">Mac</p><h2>Xcode</h2><p>Signs the iOS app and runs the simulator. It claims jobs tagged xcode.</p></article>
  <article class="node board"><p class="who">Shared board</p><h2>One project</h2><p>Jobs stay until an agent with the right tools claims them. A note is deleted when that teammate takes it, or after one hour.</p></article>
  <article class="node"><p class="who">Windows</p><h2>Android SDK</h2><p>Same goal, other machine. It claims jobs tagged android and posts the build result back.</p></article>
</div>
<h2>Where it earns its keep</h2>
<div class="uses">
  <article class="node"><p class="who">A choice</p><h2>Two ways to hang the shelf</h2><p>The agent stops. Your phone shows Steel bracket and Printed clip. You tap one. The machine continues.</p></article>
  <article class="node"><p class="who">A login</p><h2>The browser is waiting</h2><p>The card says Waiting until you approve the account. You are not hunting through terminal scrollback.</p></article>
  <article class="node"><p class="who">Linux</p><h2>The API agent</h2><p>No phone SDK on this box. It writes the service, runs the tests, and leaves the install steps for the Mac.</p></article>
  <article class="node"><p class="who">A handoff</p><h2>Build is green</h2><p>The Windows agent posts “Android build is green” to the Mac agent. The Mac takes the note and starts the iOS pass. The note is gone.</p></article>
</div>`
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
  options?: { label: string; description: string }[];
}

function optionButtons(session: InboxSession): string {
  const options = session.options ?? [];
  if (!options.length) return "";
  return `<div class="options">${options
    .map(
      (option) => `<form method="post" action="/reply">
<input type="hidden" name="host" value="${escapeHtml(session.host)}">
<input type="hidden" name="session_id" value="${escapeHtml(session.session_id)}">
<input type="hidden" name="text" value="${escapeHtml(option.label)}">
<button type="submit" title="${escapeHtml(option.description)}">${escapeHtml(option.label)}</button>
</form>`,
    )
    .join("")}</div>`;
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
${optionButtons(session)}
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
      `<div class="nav"><span>${escapeHtml(input.email)}</span><a href="/crew">Crew</a><a href="/pair">Pair</a><a href="/logout">Sign out</a></div>
<h1>Waiting on you</h1>
<p class="muted">Reply goes back to that machine as the agent's next prompt.</p>
${rows}`,
    ),
  );
}

const CAPABILITIES = ["xcode", "android", "windows", "linux", "browser", "gpu", "general"];

export function enrollPage(failed: string): Response {
  const boxes = CAPABILITIES.map(
    (item) =>
      `<label class="check"><input type="checkbox" name="capability" value="${item}"${item === "general" ? " checked" : ""}> ${item}</label>`,
  ).join("");
  const note = failed ? `<p class="banner">${escapeHtml(failed)}</p>` : "";
  return html(
    page(
      "Enroll an agent",
      `<p class="eyebrow">New crew</p>
<h1>Enroll an agent</h1>
<p class="lede">Create the account, name the shared project, and say what this machine can do. Notaify then gives you a one-time command the agent runs to install its connector and listen for jobs.</p>
<p class="muted">Already have an account? <a href="/login">Sign in</a>, then add the next machine on <a href="/crew">Crew</a>. Use the same project name on every machine that should work together.</p>
<div class="card">
${note}
<form method="post" action="/enroll">
  <label>Email <input type="email" name="email" autocomplete="username" required></label>
  <label>Password <input type="password" name="password" autocomplete="new-password" minlength="8" required></label>
  <label>Project <input type="text" name="project" placeholder="Mobile app" required></label>
  <label>Goal <input type="text" name="goal" placeholder="Ship iOS and Android from one plan"></label>
  <label>This agent <input type="text" name="agent" placeholder="Mac build" required></label>
  <fieldset><legend>What this machine can do</legend>${boxes}</fieldset>
  <button type="submit">Create account and enroll</button>
</form>
</div>`,
    ),
    failed ? 400 : 200,
  );
}

export function enrollReadyPage(input: {
  email: string;
  project: string;
  command: string;
  qr: string;
  secret: string;
  backups: string[];
}): Response {
  return html(
    page(
      "Agent enrolled",
      `<p class="eyebrow">${escapeHtml(input.project)}</p>
<h1>This machine can join the crew.</h1>
<p>Run this on the computer where the agent works. It installs the Notaify connector and starts listening for jobs.</p>
<div class="card"><pre>${escapeHtml(input.command)}</pre></div>
<h2>Save the authenticator</h2>
<p>Scan this once. Notaify will ask for the 6-digit code the next time you sign in.</p>
<div class="qr-frame">${input.qr}</div>
<p class="key">${escapeHtml(input.secret)}</p>
<p class="muted">Backup codes, each works once: ${escapeHtml(input.backups.join("  "))}</p>
<p><a class="button" href="/login">Sign in</a></p>`,
    ),
  );
}

export function crewPage(failed: string): Response {
  const boxes = CAPABILITIES.map(
    (item) =>
      `<label class="check"><input type="checkbox" name="capability" value="${item}"${item === "general" ? " checked" : ""}> ${item}</label>`,
  ).join("");
  const note = failed ? `<p class="banner">${escapeHtml(failed)}</p>` : "";
  return html(
    page(
      "Add an agent",
      `<p class="eyebrow">Shared project</p>
<h1>Add an agent to the crew.</h1>
<p class="lede">Sign in first. The same project name joins this machine to the agents already on that project. A new name starts a project.</p>
<div class="card">
${note}
<form method="post" action="/crew">
  <label>Project <input type="text" name="project" placeholder="Mobile app" required></label>
  <label>Goal <input type="text" name="goal" placeholder="Ship iOS and Android from one plan"></label>
  <label>This agent <input type="text" name="agent" placeholder="Windows build" required></label>
  <fieldset><legend>What this machine can do</legend>${boxes}</fieldset>
  <button type="submit">Create the install command</button>
</form>
</div>
<p class="muted">Tell the agent on that computer to run the command. It installs the connector and listens for jobs. Notes on the board are removed when the named agent takes them, or after one hour.</p>`,
    ),
    failed ? 400 : 200,
  );
}

export function machineReadyPage(input: { project: string; agent: string; command: string }): Response {
  return html(
    page(
      "Agent ready",
      `<p class="eyebrow">${escapeHtml(input.project)}</p>
<h1>${escapeHtml(input.agent)} can join the crew.</h1>
<p>Run this once on that computer. It installs the Notaify connector and starts listening for jobs. Use this same project name when you enroll the next machine.</p>
<div class="card"><pre>${escapeHtml(input.command)}</pre></div>
<p><a class="button" href="/crew">Add another agent</a></p>`,
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
