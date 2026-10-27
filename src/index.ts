import { DurableObject } from "cloudflare:workers";
import { otpauthUri, passwordMatches, totpMatches } from "./crypto";
import { installCommand, installScript } from "./installer";
import { qrSvg } from "./qr";
import { configuredProviders, providerById } from "./providers";
import {
  escapeHtml,
  codePage,
  html,
  inboxPage,
  joinPage,
  loginPage,
  machineLinkPage,
  machineLinkText,
  pairPage,
  text,
  unlockPage,
} from "./pages";

const KINDS = new Set([
  "turn_started",
  "turn_ended",
  "turn_failed",
  "turn_cancelled",
  "needs_user",
  "session_ended",
]);

const URGENCIES = new Set(["idle", "attention"]);
const SOURCES = new Set(["hook", "agent"]);
const STATES = new Set(["running", "idle", "needs_user", "failed", "ended"]);

const MAX_BODY = 16_000;
const MAX_EVENTS = 400;

type Kind = "turn_started" | "turn_ended" | "turn_failed" | "turn_cancelled" | "needs_user" | "session_ended";
type Urgency = "idle" | "attention";
type Source = "hook" | "agent";
type SessionState = "running" | "idle" | "needs_user" | "failed" | "ended";

interface AttentionEvent {
  id: string;
  at: string;
  kind: Kind;
  urgency: Urgency;
  state: SessionState;
  sticky: boolean;
  host: string;
  session_id: string;
  prompt_id: string;
  workspace: string;
  title: string;
  body: string;
  summary: string;
  source: Source;
  dedupe_key: string;
}

interface SessionSnapshot {
  host: string;
  session_id: string;
  workspace: string;
  state: SessionState;
  title: string;
  body: string;
  summary: string;
  hidden: boolean;
  kind: Kind;
  urgency: Urgency;
  sticky: boolean;
  prompt_id: string;
  updated_at: string;
}

interface EventRow extends Record<string, SqlStorageValue> {
  id: string;
  at: string;
  kind: string;
  urgency: string;
  state: string;
  sticky: number;
  host: string;
  session_id: string;
  prompt_id: string | null;
  workspace: string | null;
  title: string;
  body: string;
  source: string;
  dedupe_key: string | null;
  user_id: string | null;
  summary: string | null;
}

type Access = "master" | "device" | "machine" | "pair" | "user" | "none";

interface Principal {
  kind: Access;
  userId: string;
}

interface IdRow extends Record<string, SqlStorageValue> {
  id: string;
}

interface CredentialRow extends Record<string, SqlStorageValue> {
  id: string;
  role: string | null;
  user_id: string | null;
}

interface CodePointer extends Record<string, SqlStorageValue> {
  current_code: string | null;
}

interface MachinePointer extends Record<string, SqlStorageValue> {
  current_machine_code: string | null;
}

interface CodeRow extends Record<string, SqlStorageValue> {
  code: string;
  expires_at: string;
  used_at: string | null;
  user_id: string | null;
}

interface DeviceRecord extends Record<string, SqlStorageValue> {
  id: string;
  name: string;
  created_at: string;
  role: string | null;
}

interface PairingView {
  code: string;
  expires_at: string;
  payload: string;
  qr_svg: string;
}

interface SessionRow extends Record<string, SqlStorageValue> {
  host: string;
  session_id: string;
  workspace: string | null;
  state: string;
  title: string;
  body: string;
  kind: string;
  urgency: string;
  sticky: number;
  prompt_id: string | null;
  updated_at: string;
  user_id: string | null;
  summary: string | null;
  hidden: number | null;
}

interface UserRow extends Record<string, SqlStorageValue> {
  id: string;
  email: string;
  password_salt: string | null;
  password_hash: string | null;
  totp_secret: string | null;
  totp_confirmed: number | null;
}

interface LoginRow extends Record<string, SqlStorageValue> {
  id: string;
  user_id: string;
  state: string;
  expires_at: string;
}

interface BootstrapAccount {
  user_id: string;
  email: string;
  password_salt: string;
  password_hash: string;
  totp_secret?: string;
  backup_hashes?: string[];
  credential_tag?: string;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    },
  });
}

function clip(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return trimmed.slice(0, max - 1) + "…";
}

function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const left = enc.encode(a);
  const right = enc.encode(b);
  const len = Math.max(left.length, right.length);
  let diff = left.length ^ right.length;
  for (let i = 0; i < len; i++) {
    diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  }
  return diff === 0;
}

function presentedToken(request: Request): string {
  const header = request.headers.get("Authorization") ?? "";
  if (header.startsWith("Bearer ")) return header.slice("Bearer ".length).trim();
  return new URL(request.url).searchParams.get("token")?.trim() ?? "";
}

function defaultState(kind: Kind): SessionState {
  switch (kind) {
    case "turn_started":
      return "running";
    case "turn_failed":
      return "failed";
    case "needs_user":
      return "needs_user";
    case "session_ended":
      return "ended";
    default:
      return "idle";
  }
}

function deriveSummary(title: string, body: string): string {
  const cleaned = body
    .replace(/```[\s\S]*?```/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && !line.startsWith("```"))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  const source = cleaned || title.trim();
  const sentences = source.split(/(?<=[.!?])\s+/).filter(Boolean);
  const tail = sentences.length > 2 ? sentences.slice(-2) : sentences.slice(0, 2);
  let summary = "";
  for (const sentence of tail) {
    const next = summary ? `${summary} ${sentence}` : sentence;
    if (next.length > 320 && summary) break;
    summary = next;
  }
  return clip(summary || title, 320);
}

function parseEvent(input: unknown): AttentionEvent | string {
  if (!input || typeof input !== "object") return "body must be a JSON object";
  const raw = input as Record<string, unknown>;
  if (typeof raw.kind !== "string" || !KINDS.has(raw.kind)) return "unknown kind";
  const kind = raw.kind as Kind;
  const urgency: Urgency =
    typeof raw.urgency === "string" && URGENCIES.has(raw.urgency)
      ? (raw.urgency as Urgency)
      : kind === "needs_user" || kind === "turn_failed"
        ? "attention"
        : "idle";
  const source: Source = raw.source === "agent" ? "agent" : "hook";
  if (typeof raw.source === "string" && !SOURCES.has(raw.source)) return "unknown source";
  const state: SessionState =
    typeof raw.state === "string" && STATES.has(raw.state)
      ? (raw.state as SessionState)
      : defaultState(kind);
  const host = clip(raw.host, 80);
  const title = clip(raw.title, 160);
  if (!host) return "host is required";
  if (!title) return "title is required";
  const sticky =
    typeof raw.sticky === "boolean" ? raw.sticky : kind === "needs_user";
  return {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    kind,
    urgency,
    state,
    sticky,
    host,
    session_id: clip(raw.session_id, 120),
    prompt_id: clip(raw.prompt_id, 120),
    workspace: clip(raw.workspace, 400),
    title,
    body: clip(raw.body, 800),
    summary: clip(raw.summary, 320) || deriveSummary(title, clip(raw.body, 800)),
    source,
    dedupe_key: clip(raw.dedupe_key, 200),
  };
}

function eventFromRow(row: EventRow): AttentionEvent {
  return {
    id: row.id,
    at: row.at,
    kind: row.kind as Kind,
    urgency: row.urgency as Urgency,
    state: row.state as SessionState,
    sticky: row.sticky === 1,
    host: row.host,
    session_id: row.session_id,
    prompt_id: row.prompt_id ?? "",
    workspace: row.workspace ?? "",
    title: row.title,
    body: row.body,
    summary: row.summary || deriveSummary(row.title, row.body),
    source: row.source as Source,
    dedupe_key: row.dedupe_key ?? "",
  };
}

function sessionFromRow(row: SessionRow): SessionSnapshot {
  return {
    host: row.host,
    session_id: row.session_id,
    workspace: row.workspace ?? "",
    state: row.state as SessionState,
    title: row.title,
    body: row.body,
    summary: row.summary || deriveSummary(row.title, row.body),
    hidden: row.hidden === 1,
    kind: row.kind as Kind,
    urgency: row.urgency as Urgency,
    sticky: row.sticky === 1,
    prompt_id: row.prompt_id ?? "",
    updated_at: row.updated_at,
  };
}

export class AttentionHub extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
    this.ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS events (
          id TEXT PRIMARY KEY,
          at TEXT NOT NULL,
          kind TEXT NOT NULL,
          urgency TEXT NOT NULL,
          state TEXT NOT NULL,
          sticky INTEGER NOT NULL,
          host TEXT NOT NULL,
          session_id TEXT NOT NULL,
          prompt_id TEXT,
          workspace TEXT,
          title TEXT NOT NULL,
          body TEXT NOT NULL,
          source TEXT NOT NULL,
          dedupe_key TEXT
        )
      `);
      this.ctx.storage.sql.exec(
        "CREATE UNIQUE INDEX IF NOT EXISTS events_dedupe ON events(dedupe_key) WHERE dedupe_key IS NOT NULL AND dedupe_key != ''",
      );
      this.ctx.storage.sql.exec("CREATE INDEX IF NOT EXISTS events_at ON events(at)");
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS sessions (
          session_key TEXT PRIMARY KEY,
          host TEXT NOT NULL,
          session_id TEXT NOT NULL,
          workspace TEXT,
          state TEXT NOT NULL,
          title TEXT NOT NULL,
          body TEXT NOT NULL,
          kind TEXT NOT NULL,
          urgency TEXT NOT NULL,
          sticky INTEGER NOT NULL,
          prompt_id TEXT,
          updated_at TEXT NOT NULL
        )
      `);
      this.ctx.storage.sql.exec(
        "CREATE INDEX IF NOT EXISTS sessions_updated ON sessions(updated_at)",
      );
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS pair_sessions (
          id TEXT PRIMARY KEY,
          expires_at TEXT NOT NULL,
          current_code TEXT
        )
      `);
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS pairing_codes (
          code TEXT PRIMARY KEY,
          expires_at TEXT NOT NULL,
          used_at TEXT
        )
      `);
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS devices (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          token_hash TEXT NOT NULL UNIQUE,
          created_at TEXT NOT NULL,
          revoked_at TEXT
        )
      `);
      this.addColumn("ALTER TABLE pair_sessions ADD COLUMN current_machine_code TEXT");
      this.addColumn("ALTER TABLE pairing_codes ADD COLUMN kind TEXT NOT NULL DEFAULT 'reader'");
      this.addColumn("ALTER TABLE devices ADD COLUMN role TEXT NOT NULL DEFAULT 'reader'");
      this.addColumn("ALTER TABLE devices ADD COLUMN user_id TEXT");
      this.addColumn("ALTER TABLE devices ADD COLUMN host TEXT");
      this.addColumn("ALTER TABLE events ADD COLUMN user_id TEXT");
      this.addColumn("ALTER TABLE sessions ADD COLUMN user_id TEXT");
      this.addColumn("ALTER TABLE pairing_codes ADD COLUMN user_id TEXT");
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          email TEXT NOT NULL UNIQUE,
          password_salt TEXT,
          password_hash TEXT,
          totp_secret TEXT,
          created_at TEXT NOT NULL
        )
      `);
      this.addColumn("ALTER TABLE users ADD COLUMN credential_tag TEXT");
      this.addColumn("ALTER TABLE users ADD COLUMN totp_confirmed INTEGER NOT NULL DEFAULT 0");
      this.addColumn("ALTER TABLE events ADD COLUMN summary TEXT");
      this.addColumn("ALTER TABLE sessions ADD COLUMN summary TEXT");
      this.addColumn("ALTER TABLE sessions ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0");
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS backup_codes (
          user_id TEXT NOT NULL,
          code_hash TEXT NOT NULL,
          used_at TEXT,
          PRIMARY KEY (user_id, code_hash)
        )
      `);
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS login_sessions (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          state TEXT NOT NULL,
          expires_at TEXT NOT NULL
        )
      `);
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS oauth_identities (
          provider TEXT NOT NULL,
          provider_user TEXT NOT NULL,
          user_id TEXT NOT NULL,
          PRIMARY KEY (provider, provider_user)
        )
      `);
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS oauth_states (
          state TEXT PRIMARY KEY,
          provider TEXT NOT NULL,
          expires_at TEXT NOT NULL
        )
      `);
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS login_attempts (
          email TEXT PRIMARY KEY,
          failures INTEGER NOT NULL,
          window_start TEXT NOT NULL
        )
      `);
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS replies (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          host TEXT NOT NULL,
          session_id TEXT NOT NULL,
          workspace TEXT,
          text TEXT NOT NULL,
          created_at TEXT NOT NULL,
          delivered_at TEXT
        )
      `);
      this.bootstrapOwner();
    });
  }

  private bootstrapOwner(): void {
    const raw = this.env.ACCOUNT_BOOTSTRAP;
    if (!raw) return;
    let parsed: BootstrapAccount;
    try {
      parsed = JSON.parse(raw) as BootstrapAccount;
    } catch {
      console.error(JSON.stringify({ message: "account bootstrap was not valid JSON" }));
      return;
    }
    if (!parsed.email || !parsed.user_id || !parsed.password_salt || !parsed.password_hash) return;
    const email = parsed.email.trim().toLowerCase();
    const found = this.ctx.storage.sql
      .exec<{ id: string; credential_tag: string | null } & Record<string, SqlStorageValue>>(
        "SELECT id, credential_tag FROM users WHERE email = ?",
        email,
      )
      .toArray();
    const userId = found[0]?.id ?? parsed.user_id;
    const tag = parsed.credential_tag ?? "";
    if (found.length === 0) {
      this.ctx.storage.sql.exec(
        "INSERT INTO users (id, email, password_salt, password_hash, totp_secret, created_at, credential_tag) VALUES (?, ?, ?, ?, ?, ?, ?)",
        userId,
        email,
        parsed.password_salt,
        parsed.password_hash,
        parsed.totp_secret ?? null,
        new Date().toISOString(),
        tag,
      );
      this.replaceBackupCodes(userId, parsed.backup_hashes ?? []);
    } else if ((found[0].credential_tag ?? "") !== tag && tag) {
      this.ctx.storage.sql.exec(
        "UPDATE users SET password_salt = ?, password_hash = ?, totp_secret = ?, credential_tag = ?, totp_confirmed = 0 WHERE id = ?",
        parsed.password_salt,
        parsed.password_hash,
        parsed.totp_secret ?? null,
        tag,
        userId,
      );
      this.replaceBackupCodes(userId, parsed.backup_hashes ?? []);
    }
    this.ctx.storage.sql.exec("UPDATE events SET user_id = ? WHERE user_id IS NULL OR user_id = ''", userId);
    this.ctx.storage.sql.exec("UPDATE sessions SET user_id = ? WHERE user_id IS NULL OR user_id = ''", userId);
    this.ctx.storage.sql.exec("UPDATE devices SET user_id = ? WHERE user_id IS NULL OR user_id = ''", userId);
    this.ctx.storage.sql.exec("UPDATE pairing_codes SET user_id = ? WHERE user_id IS NULL OR user_id = ''", userId);
  }

  private replaceBackupCodes(userId: string, hashes: string[]): void {
    this.ctx.storage.sql.exec("DELETE FROM backup_codes WHERE user_id = ?", userId);
    for (const codeHash of hashes) {
      this.ctx.storage.sql.exec(
        "INSERT OR IGNORE INTO backup_codes (user_id, code_hash, used_at) VALUES (?, ?, NULL)",
        userId,
        codeHash,
      );
    }
  }

  private addColumn(statement: string): void {
    try {
      this.ctx.storage.sql.exec(statement);
    } catch (error) {
      if (!/duplicate column/i.test(String(error))) throw error;
    }
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    try {
      const principal = await this.access(request);
      if (url.pathname === "/" && request.method === "GET") return this.home(principal);
      if (url.pathname === "/login" && request.method === "GET") return loginPage({ failed: false, providers: this.providerLinks() });
      if (url.pathname === "/login" && request.method === "POST") return this.login(request, url);
      if (url.pathname === "/login/code" && request.method === "GET") return this.codeForm(request, false);
      if (url.pathname === "/login/show-code" && request.method === "POST") return this.showPairingCode(request);
      if (url.pathname === "/login/code" && request.method === "POST") return this.loginCode(request);
      if (url.pathname === "/logout") return this.logout(request);
      const oauthStart = /^\/auth\/start\/([a-z0-9_-]+)$/.exec(url.pathname);
      if (oauthStart && request.method === "GET") return this.oauthStart(oauthStart[1], url);
      const oauthCallback = /^\/auth\/callback\/([a-z0-9_-]+)$/.exec(url.pathname);
      if (oauthCallback && request.method === "GET") return this.oauthCallback(request, oauthCallback[1], url);
      if (url.pathname === "/reply" && request.method === "POST") return this.postReply(request, principal);
      if (url.pathname === "/v1/auth/methods" && request.method === "GET") return this.authMethods();
      if (url.pathname === "/v1/auth/login" && request.method === "POST") return this.loginJson(request);
      if (url.pathname === "/v1/auth/code" && request.method === "POST") return this.loginCodeJson(request);
      if (url.pathname === "/v1/replies" && request.method === "POST") return this.postReply(request, principal);
      if (url.pathname === "/v1/replies/claim" && request.method === "POST") return this.claimReply(request, principal);
      if (url.pathname === "/pair" && request.method === "GET") return this.showPair(request, url, principal);
      if (url.pathname === "/pair/unlock" && request.method === "POST") return this.unlock(request);
      if (url.pathname === "/pair/revoke" && request.method === "POST") return await this.revokeFromPage(request, principal);
      if (url.pathname === "/join" && request.method === "GET") return joinPage(url.searchParams.get("code") ?? "");
      const machineInstall = /^\/m\/([A-Za-z0-9_-]{16,64})\/install$/.exec(url.pathname);
      if (machineInstall) return this.machineInstall(request, machineInstall[1], url.origin);
      const machineLink = /^\/m\/([A-Za-z0-9_-]{16,64})$/.exec(url.pathname);
      if (machineLink && request.method === "GET") return this.machinePage(request, machineLink[1], url.origin);
      if (url.pathname === "/v1/enroll" && request.method === "POST") return await this.enroll(request);
      if (url.pathname === "/v1/pairings" && request.method === "POST") return this.mintJson(request, url, principal);
      if (url.pathname === "/v1/pairings/current" && request.method === "GET") return this.currentJson(request, url, principal);
      if (url.pathname === "/v1/devices" && request.method === "GET") return this.deviceList(principal);
      if (url.pathname === "/v1/machine" && request.method === "POST") return this.renameMachine(request);
      const revoke = /^\/v1\/devices\/([0-9a-f-]{36})\/revoke$/.exec(url.pathname);
      if (revoke && request.method === "POST") return this.revokeDevice(revoke[1], principal);
      if (url.pathname === "/v1/ws" && request.method === "GET") {
        if (!canRead(principal)) return json({ error: "unauthorized" }, 401);
        return this.openSocket(principal.userId);
      }
      if (url.pathname === "/v1/events" && request.method === "POST") {
        if (!canPost(principal)) return json({ error: "unauthorized" }, 401);
        return this.postEvent(request, principal.userId);
      }
      if (url.pathname === "/v1/events" && request.method === "GET") {
        if (!canRead(principal)) return json({ error: "unauthorized" }, 401);
        return this.listEvents(url, principal.userId);
      }
      if (url.pathname === "/v1/sessions" && request.method === "GET") {
        if (!canRead(principal)) return json({ error: "unauthorized" }, 401);
        return json({ sessions: this.sessions(principal.userId) });
      }
      if (url.pathname === "/v1/sessions/hide" && request.method === "POST") return this.setSessionHidden(request, principal, true);
      if (url.pathname === "/v1/sessions/unhide" && request.method === "POST") return this.setSessionHidden(request, principal, false);
      return json({ error: "not found" }, 404);
    } catch (error) {
      console.error(JSON.stringify({ message: "hub request failed", error: String(error) }));
      return json({ error: "hub failed" }, 500);
    }
  }

  private async access(request: Request): Promise<Principal> {
    const none: Principal = { kind: "none", userId: "" };
    const presented = presentedToken(request);
    const master = this.env.ATTENTION_TOKEN ?? "";
    const owner = this.ownerUserId();
    if (presented && master && timingSafeEqual(presented, master)) return { kind: "master", userId: owner };
    if (presented.startsWith("gat_") || presented.startsWith("gam_")) {
      const hash = await sha256Hex(presented);
      const rows = this.ctx.storage.sql
        .exec<CredentialRow>(
          "SELECT id, role, user_id FROM devices WHERE token_hash = ? AND revoked_at IS NULL",
          hash,
        )
        .toArray();
      if (rows.length === 0) return none;
      const userId = rows[0].user_id || owner;
      const role = rows[0].role || "reader";
      if (presented.startsWith("gam_")) return role === "publisher" ? { kind: "machine", userId } : none;
      return role === "reader" ? { kind: "device", userId } : none;
    }
    if (presented) {
      const bearerLogin = this.loginSession(presented);
      if (bearerLogin?.state === "full") return { kind: "user", userId: bearerLogin.user_id };
      return none;
    }
    const login = this.loginSession(readCookie(request, "ga_auth"));
    if (login && login.state === "full") return { kind: "user", userId: login.user_id };
    const pairId = readCookie(request, "ga_pair");
    if (!pairId) return none;
    const rows = this.ctx.storage.sql
      .exec<IdRow>("SELECT id FROM pair_sessions WHERE id = ? AND expires_at > ?", pairId, new Date().toISOString())
      .toArray();
    return rows.length > 0 ? { kind: "pair", userId: owner } : none;
  }

  private ownerUserId(): string {
    const raw = this.env.ACCOUNT_BOOTSTRAP;
    if (!raw) return "";
    try {
      const parsed = JSON.parse(raw) as BootstrapAccount;
      const email = parsed.email.trim().toLowerCase();
      const rows = this.ctx.storage.sql.exec<IdRow>("SELECT id FROM users WHERE email = ?", email).toArray();
      return rows[0]?.id ?? "";
    } catch {
      return "";
    }
  }

  private loginSession(id: string): LoginRow | null {
    if (!id) return null;
    const rows = this.ctx.storage.sql
      .exec<LoginRow>("SELECT id, user_id, state, expires_at FROM login_sessions WHERE id = ?", id)
      .toArray();
    const row = rows[0];
    if (!row || row.expires_at <= new Date().toISOString()) return null;
    return row;
  }

  private showPair(request: Request, url: URL, principal: Principal): Response {
    if (!canAdmin(principal)) {
      return new Response(null, { status: 303, headers: { Location: "/login?next=/pair" } });
    }
    const sessionId = this.pairingKey(request, principal);
    this.ensurePairSession(sessionId);
    const forceQr = url.searchParams.get("new") === "1";
    const forceMachine = url.searchParams.get("new_machine") === "1";
    const pairing = forceQr
      ? this.mint(sessionId, url.origin, principal.userId)
      : (this.current(sessionId, url.origin) ?? this.mint(sessionId, url.origin, principal.userId));
    const machine = forceMachine
      ? this.mintMachine(sessionId, principal.userId)
      : (this.currentMachine(sessionId) ?? this.mintMachine(sessionId, principal.userId));
    const machineUrl = `${url.origin}/m/${machine.code}`;
    return pairPage({
      code: pairing.code,
      expiresAt: pairing.expires_at,
      payload: pairing.payload,
      qr: pairing.qr_svg,
      machineUrl,
      machineCommand: installCommand(url.origin, machine.code),
      machineExpiresAt: machine.expiresAt,
      devices: this.enrolledDevices(principal.userId),
    });
  }

  private async unlock(request: Request): Promise<Response> {
    const raw = await request.text();
    if (raw.length > 4_000) return html(escapeHtml("Too large"), 413);
    const token = new URLSearchParams(raw).get("token") ?? "";
    const master = this.env.ATTENTION_TOKEN ?? "";
    if (!token || !master || !timingSafeEqual(token, master)) return unlockPage(true);
    const id = randomToken(32);
    const expires = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
    this.ctx.storage.sql.exec(
      "INSERT INTO pair_sessions (id, expires_at, current_code) VALUES (?, ?, NULL)",
      id,
      expires,
    );
    return new Response(null, {
      status: 303,
      headers: {
        Location: "/pair",
        "Cache-Control": "no-store",
        "Set-Cookie": `ga_pair=${id}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=43200`,
      },
    });
  }

  private async revokeFromPage(request: Request, principal: Principal): Promise<Response> {
    if (!canAdmin(principal)) return new Response(null, { status: 303, headers: { Location: "/login" } });
    const raw = await request.text();
    if (raw.length > 1_000) return html(escapeHtml("Too large"), 413);
    const id = new URLSearchParams(raw).get("id") ?? "";
    if (/^[0-9a-f-]{36}$/.test(id)) this.markRevoked(id, principal.userId);
    return new Response(null, { status: 303, headers: { Location: "/pair", "Cache-Control": "no-store" } });
  }

  private mintJson(request: Request, url: URL, principal: Principal): Response {
    const sessionId = this.pairingSession(request, principal);
    if (!sessionId) return json({ error: "unauthorized" }, 401);
    return json(this.mint(sessionId, url.origin, principal.userId));
  }

  private currentJson(request: Request, url: URL, principal: Principal): Response {
    const sessionId = this.pairingSession(request, principal);
    if (!sessionId) return json({ error: "unauthorized" }, 401);
    const reader = this.current(sessionId, url.origin);
    const machine = this.currentMachine(sessionId);
    return json({
      ...(reader ?? { code: null }),
      machine_code: machine?.code ?? null,
      machine_expires_at: machine?.expiresAt ?? null,
    });
  }

  private pairingSession(request: Request, principal: Principal): string | null {
    if (!canAdmin(principal)) return null;
    const key = this.pairingKey(request, principal);
    this.ensurePairSession(key);
    return key;
  }

  private pairingKey(request: Request, principal: Principal): string {
    if (principal.kind === "pair") return readCookie(request, "ga_pair");
    if (principal.kind === "user") return `user:${principal.userId}`;
    return "master";
  }

  private ensurePairSession(id: string): void {
    if (!id) return;
    const expires = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
    this.ctx.storage.sql.exec(
      `INSERT INTO pair_sessions (id, expires_at, current_code) VALUES (?, ?, NULL)
       ON CONFLICT(id) DO UPDATE SET expires_at = excluded.expires_at`,
      id,
      expires,
    );
  }

  private masterPairSession(): string {
    const expires = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
    this.ctx.storage.sql.exec(
      `INSERT INTO pair_sessions (id, expires_at, current_code) VALUES ('master', ?, NULL)
       ON CONFLICT(id) DO UPDATE SET expires_at = excluded.expires_at`,
      expires,
    );
    return "master";
  }

  private current(sessionId: string, origin: string): PairingView | null {
    const rows = this.ctx.storage.sql
      .exec<CodePointer>("SELECT current_code FROM pair_sessions WHERE id = ?", sessionId)
      .toArray();
    const code = rows[0]?.current_code ?? "";
    if (!code) return null;
    const found = this.ctx.storage.sql
      .exec<CodeRow>("SELECT code, expires_at, used_at FROM pairing_codes WHERE code = ?", code)
      .toArray();
    const row = found[0];
    if (!row || row.used_at || row.expires_at <= new Date().toISOString()) return null;
    return this.view(row.code, row.expires_at, origin);
  }

  private mint(sessionId: string, origin: string, userId: string): PairingView {
    const now = new Date().toISOString();
    const existing = this.ctx.storage.sql
      .exec<CodePointer>("SELECT current_code FROM pair_sessions WHERE id = ?", sessionId)
      .toArray();
    const previous = existing[0]?.current_code ?? "";
    if (previous) {
      this.ctx.storage.sql.exec(
        "UPDATE pairing_codes SET used_at = ? WHERE code = ? AND used_at IS NULL",
        now,
        previous,
      );
    }
    this.ctx.storage.sql.exec("DELETE FROM pairing_codes WHERE expires_at <= ? OR used_at IS NOT NULL", now);
    this.ctx.storage.sql.exec("DELETE FROM pair_sessions WHERE expires_at <= ? AND id != ?", now, sessionId);
    const code = randomToken(18);
    const expiresAt = new Date(Date.now() + 3 * 60 * 1000).toISOString();
    this.ctx.storage.sql.exec(
      "INSERT INTO pairing_codes (code, expires_at, used_at, kind, user_id) VALUES (?, ?, NULL, 'reader', ?)",
      code,
      expiresAt,
      userId,
    );
    this.ctx.storage.sql.exec(
      "UPDATE pair_sessions SET current_code = ? WHERE id = ?",
      code,
      sessionId,
    );
    return this.view(code, expiresAt, origin);
  }

  private currentMachine(sessionId: string): { code: string; expiresAt: string } | null {
    const rows = this.ctx.storage.sql
      .exec<MachinePointer>("SELECT current_machine_code FROM pair_sessions WHERE id = ?", sessionId)
      .toArray();
    const code = rows[0]?.current_machine_code ?? "";
    if (!code) return null;
    const found = this.ctx.storage.sql
      .exec<CodeRow>("SELECT code, expires_at, used_at FROM pairing_codes WHERE code = ? AND kind = 'machine'", code)
      .toArray();
    const row = found[0];
    if (!row || row.used_at || row.expires_at <= new Date().toISOString()) return null;
    return { code: row.code, expiresAt: row.expires_at };
  }

  private mintMachine(sessionId: string, userId: string): { code: string; expiresAt: string } {
    const now = new Date().toISOString();
    const existing = this.ctx.storage.sql
      .exec<MachinePointer>("SELECT current_machine_code FROM pair_sessions WHERE id = ?", sessionId)
      .toArray();
    const previous = existing[0]?.current_machine_code ?? "";
    if (previous) {
      this.ctx.storage.sql.exec(
        "UPDATE pairing_codes SET used_at = ? WHERE code = ? AND used_at IS NULL",
        now,
        previous,
      );
    }
    this.ctx.storage.sql.exec("DELETE FROM pairing_codes WHERE expires_at <= ? OR used_at IS NOT NULL", now);
    const code = randomToken(18);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    this.ctx.storage.sql.exec(
      "INSERT INTO pairing_codes (code, expires_at, used_at, kind, user_id) VALUES (?, ?, NULL, 'machine', ?)",
      code,
      expiresAt,
      userId,
    );
    this.ctx.storage.sql.exec(
      "UPDATE pair_sessions SET current_machine_code = ? WHERE id = ?",
      code,
      sessionId,
    );
    return { code, expiresAt };
  }

  private view(code: string, expiresAt: string, origin: string): PairingView {
    const payload = `${origin}/join?code=${code}`;
    return { code, expires_at: expiresAt, payload, qr_svg: qrSvg(payload) };
  }

  private async enroll(request: Request): Promise<Response> {
    const length = Number(request.headers.get("Content-Length") ?? "0");
    if (Number.isFinite(length) && length > 4_000) return json({ error: "body too large" }, 413);
    const raw = await request.text();
    if (raw.length > 4_000) return json({ error: "body too large" }, 413);
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return json({ error: "invalid JSON" }, 400);
    }
    if (!parsed || typeof parsed !== "object") return json({ error: "body must be a JSON object" }, 400);
    const body = parsed as Record<string, unknown>;
    const code = typeof body.code === "string" ? body.code.trim() : "";
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(code)) return json({ error: "unknown code" }, 410);
    const now = new Date().toISOString();
    const claimed = this.ctx.storage.sql.exec(
      "UPDATE pairing_codes SET used_at = ? WHERE code = ? AND used_at IS NULL AND expires_at > ? AND kind = 'reader'",
      now,
      code,
      now,
    );
    if (claimed.rowsWritten !== 1) return json({ error: "code expired or already used" }, 410);
    this.ctx.storage.sql.exec("UPDATE pair_sessions SET current_code = NULL WHERE current_code = ?", code);
    const id = crypto.randomUUID();
    const deviceToken = `gat_${randomToken(32)}`;
    const name = cleanName(body.name);
    this.ctx.storage.sql.exec(
      "INSERT INTO devices (id, name, token_hash, created_at, revoked_at, role, user_id) VALUES (?, ?, ?, ?, NULL, 'reader', ?)",
      id,
      name,
      await sha256Hex(deviceToken),
      now,
      this.codeUser(code),
    );
    const origin = new URL(request.url).origin;
    return json({ ok: true, device_id: id, device_token: deviceToken, url: origin });
  }

  private deviceList(principal: Principal): Response {
    if (!canAdmin(principal)) return json({ error: "unauthorized" }, 401);
    return json({ devices: this.enrolledDevices(principal.userId) });
  }

  private enrolledDevices(userId: string): Array<{ id: string; name: string; created_at: string; role: string }> {
    return this.ctx.storage.sql
      .exec<DeviceRecord>(
        "SELECT id, name, created_at, role FROM devices WHERE revoked_at IS NULL AND (user_id = ? OR user_id IS NULL) ORDER BY created_at DESC LIMIT 50",
        userId,
      )
      .toArray()
      .map((row) => ({
        id: row.id,
        name: row.name,
        created_at: row.created_at,
        role: row.role === "publisher" ? "publisher" : "reader",
      }));
  }

  private async renameMachine(request: Request): Promise<Response> {
    const presented = presentedToken(request);
    if (!presented.startsWith("gam_")) return json({ error: "unauthorized" }, 401);
    const raw = await request.text();
    if (raw.length > 1_000) return json({ error: "body too large" }, 413);
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return json({ error: "invalid JSON" }, 400);
    }
    const name = cleanName(parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>).name : "Grok machine");
    const hash = await sha256Hex(presented);
    const updated = this.ctx.storage.sql.exec(
      "UPDATE devices SET name = ?, host = ? WHERE token_hash = ? AND role = 'publisher' AND revoked_at IS NULL",
      name,
      name,
      hash,
    );
    if (updated.rowsWritten !== 1) return json({ error: "unauthorized" }, 401);
    return json({ ok: true });
  }

  private machinePage(request: Request, code: string, origin: string): Response {
    const live = this.machineCode(code);
    const command = installCommand(origin, code);
    const input = { command, expiresAt: live?.expires_at ?? "", live: live !== null };
    const accept = request.headers.get("Accept") ?? "";
    if (!accept.includes("text/html")) return text(machineLinkText(input), live ? 200 : 410);
    return machineLinkPage(input);
  }

  private async machineInstall(request: Request, code: string, origin: string): Promise<Response> {
    if (request.method !== "POST") return text("POST claim=1 to install. Opening this URL does not install.\n", 405);
    const raw = await request.text();
    if (raw.length > 200) return text("body too large\n", 413);
    const header = request.headers.get("X-Grok-Attention-Claim") === "1";
    const bodyClaim = raw === "claim=1" || raw === "claim=1\n";
    if (!header && !bodyClaim) return text("Send claim=1 to install.\n", 400);
    const now = new Date().toISOString();
    const claimed = this.ctx.storage.sql.exec(
      "UPDATE pairing_codes SET used_at = ? WHERE code = ? AND kind = 'machine' AND used_at IS NULL AND expires_at > ?",
      now,
      code,
      now,
    );
    if (claimed.rowsWritten !== 1) return text("This machine link is expired or already used.\n", 410);
    this.ctx.storage.sql.exec(
      "UPDATE pair_sessions SET current_machine_code = NULL WHERE current_machine_code = ?",
      code,
    );
    const id = crypto.randomUUID();
    const machineToken = `gam_${randomToken(32)}`;
    this.ctx.storage.sql.exec(
      "INSERT INTO devices (id, name, token_hash, created_at, revoked_at, role, user_id, host) VALUES (?, ?, ?, ?, NULL, 'publisher', ?, NULL)",
      id,
      "Grok machine",
      await sha256Hex(machineToken),
      now,
      this.codeUser(code),
    );
    return text(installScript({ url: origin, token: machineToken }));
  }

  private machineCode(code: string): CodeRow | null {
    const found = this.ctx.storage.sql
      .exec<CodeRow>("SELECT code, expires_at, used_at FROM pairing_codes WHERE code = ? AND kind = 'machine'", code)
      .toArray();
    const row = found[0];
    if (!row || row.used_at || row.expires_at <= new Date().toISOString()) return null;
    return row;
  }

  private revokeDevice(id: string, principal: Principal): Response {
    if (!canAdmin(principal)) return json({ error: "unauthorized" }, 401);
    const changed = this.markRevoked(id, principal.userId);
    if (!changed) return json({ error: "not found" }, 404);
    return json({ ok: true });
  }

  private markRevoked(id: string, userId: string): boolean {
    const result = this.ctx.storage.sql.exec(
      "UPDATE devices SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL AND (user_id = ? OR user_id IS NULL)",
      new Date().toISOString(),
      id,
      userId,
    );
    return result.rowsWritten === 1;
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (message === "hello") {
      const userId = this.socketUser(ws);
      ws.send(JSON.stringify({ type: "hello", sessions: this.sessions(userId), events: this.recentEvents(userId, 50) }));
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean): Promise<void> {
    void ws;
    void code;
    void reason;
    void wasClean;
  }

  private openSocket(userId: string): Response {
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ userId });
    server.send(JSON.stringify({ type: "hello", sessions: this.sessions(userId), events: this.recentEvents(userId, 50) }));
    return new Response(null, { status: 101, webSocket: client });
  }

  private socketUser(ws: WebSocket): string {
    const attached = ws.deserializeAttachment() as { userId?: string } | null;
    return attached?.userId ?? "";
  }

  private codeUser(code: string): string {
    const rows = this.ctx.storage.sql
      .exec<CodeRow>("SELECT code, expires_at, used_at, user_id FROM pairing_codes WHERE code = ?", code)
      .toArray();
    return rows[0]?.user_id || this.ownerUserId();
  }

  private providerLinks(): { id: string; label: string }[] {
    return configuredProviders(this.env).map((provider) => ({ id: provider.id, label: provider.label }));
  }

  private authMethods(): Response {
    return json({
      methods: ["password", "totp", "device_enroll", ...configuredProviders(this.env).map((provider) => provider.id)],
    });
  }

  private async loginJson(request: Request): Promise<Response> {
    const raw = await request.text();
    if (raw.length > 4_000) return json({ error: "body too large" }, 413);
    let email = "";
    let password = "";
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      email = typeof parsed.email === "string" ? parsed.email.trim().toLowerCase() : "";
      password = typeof parsed.password === "string" ? parsed.password : "";
    } catch {
      return json({ error: "invalid JSON" }, 400);
    }
    if (!email || !password || this.lockedOut(email)) return json({ error: "unauthorized" }, 401);
    const users = this.ctx.storage.sql
      .exec<UserRow>(
        "SELECT id, email, password_salt, password_hash, totp_secret, totp_confirmed FROM users WHERE email = ?",
        email,
      )
      .toArray();
    const user = users[0];
    const salt = user?.password_salt ?? "";
    const hash = user?.password_hash ?? "";
    const matches = salt && hash ? await passwordMatches(password, salt, hash) : false;
    if (!user || !matches) {
      this.noteFailure(email);
      return json({ error: "unauthorized" }, 401);
    }
    this.clearFailures(email);
    const id = randomToken(32);
    const needsCode = Boolean(user.totp_secret);
    const ttlMs = needsCode ? 10 * 60 * 1000 : 14 * 24 * 60 * 60 * 1000;
    this.ctx.storage.sql.exec(
      "INSERT INTO login_sessions (id, user_id, state, expires_at) VALUES (?, ?, ?, ?)",
      id,
      user.id,
      needsCode ? "pending_2fa" : "full",
      new Date(Date.now() + ttlMs).toISOString(),
    );
    if (!needsCode) return json({ step: "done", token: id, email: user.email });
    const response: Record<string, string> = { step: "totp", login_id: id, email: user.email };
    if (user.totp_confirmed !== 1 && user.totp_secret) response.otpauth_uri = otpauthUri(user.email, user.totp_secret);
    return json(response);
  }

  private async loginCodeJson(request: Request): Promise<Response> {
    const raw = await request.text();
    if (raw.length > 2_000) return json({ error: "body too large" }, 413);
    let loginId = "";
    let code = "";
    let scanned = false;
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      loginId = typeof parsed.login_id === "string" ? parsed.login_id : "";
      code = typeof parsed.code === "string" ? parsed.code.trim() : "";
      scanned = parsed.scanned === true;
    } catch {
      return json({ error: "invalid JSON" }, 400);
    }
    const session = this.loginSession(loginId);
    if (!session || session.state !== "pending_2fa") return json({ error: "unauthorized" }, 401);
    const user = this.userById(session.user_id);
    const secret = user?.totp_secret ?? "";
    const totpOk = secret ? await totpMatches(secret, code) : false;
    const backupOk = !totpOk && (await this.useBackupCode(session.user_id, code));
    if (!totpOk && !backupOk) return json({ error: "unauthorized" }, 401);
    if (totpOk && scanned) {
      this.ctx.storage.sql.exec("UPDATE users SET totp_confirmed = 1 WHERE id = ?", session.user_id);
    }
    const expires = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    this.ctx.storage.sql.exec(
      "UPDATE login_sessions SET state = 'full', expires_at = ? WHERE id = ?",
      expires,
      session.id,
    );
    return json({ step: "done", token: session.id, email: user?.email ?? "" });
  }

  private home(principal: Principal): Response {
    if (principal.kind !== "user" && principal.kind !== "master") {
      return new Response(null, { status: 303, headers: { Location: "/login" } });
    }
    const users = this.ctx.storage.sql
      .exec<UserRow>("SELECT id, email, password_salt, password_hash, totp_secret FROM users WHERE id = ?", principal.userId)
      .toArray();
    const open = this.sessions(principal.userId);
    return inboxPage({ email: users[0]?.email ?? "", sessions: open });
  }

  private async login(request: Request, url: URL): Promise<Response> {
    const raw = await request.text();
    const form = new URLSearchParams(raw.slice(0, 4_000));
    const email = (form.get("email") ?? "").trim().toLowerCase();
    const password = form.get("password") ?? "";
    const failed = () => loginPage({ failed: true, providers: this.providerLinks() });
    if (!email || !password || this.lockedOut(email)) return failed();
    const users = this.ctx.storage.sql
      .exec<UserRow>("SELECT id, email, password_salt, password_hash, totp_secret FROM users WHERE email = ?", email)
      .toArray();
    const user = users[0];
    const salt = user?.password_salt ?? "";
    const hash = user?.password_hash ?? "";
    const matches = salt && hash ? await passwordMatches(password, salt, hash) : false;
    if (!user || !matches) {
      this.noteFailure(email);
      return failed();
    }
    this.clearFailures(email);
    return this.startLogin(user.id, Boolean(user.totp_secret), url);
  }

  private showPairingCode(request: Request): Response {
    const session = this.loginSession(readCookie(request, "ga_auth"));
    if (!session || session.state !== "pending_2fa") {
      return new Response(null, { status: 303, headers: { Location: "/login" } });
    }
    this.ctx.storage.sql.exec("UPDATE users SET totp_confirmed = 0 WHERE id = ?", session.user_id);
    return new Response(null, { status: 303, headers: { Location: "/login/code", "Cache-Control": "no-store" } });
  }

  private codeForm(request: Request, failed: boolean): Response {
    const session = this.loginSession(readCookie(request, "ga_auth"));
    if (!session || session.state !== "pending_2fa") {
      return new Response(null, { status: 303, headers: { Location: "/login" } });
    }
    const user = this.userById(session.user_id);
    const secret = user?.totp_secret ?? "";
    if (!secret) return codePage({ failed, setup: null });
    return codePage({
      failed,
      setup: { qr: qrSvg(otpauthUri(user?.email ?? "", secret)), secret, email: user?.email ?? "" },
    });
  }

  private userById(id: string): UserRow | null {
    const rows = this.ctx.storage.sql
      .exec<UserRow>(
        "SELECT id, email, password_salt, password_hash, totp_secret, totp_confirmed FROM users WHERE id = ?",
        id,
      )
      .toArray();
    return rows[0] ?? null;
  }

  private async loginCode(request: Request): Promise<Response> {
    const session = this.loginSession(readCookie(request, "ga_auth"));
    if (!session || session.state !== "pending_2fa") return this.codeForm(request, true);
    const raw = await request.text();
    const code = (new URLSearchParams(raw.slice(0, 500)).get("code") ?? "").trim();
    const user = this.userById(session.user_id);
    const secret = user?.totp_secret ?? "";
    const totpOk = secret ? await totpMatches(secret, code) : false;
    const backupOk = !totpOk && (await this.useBackupCode(session.user_id, code));
    if (!totpOk && !backupOk) return this.codeForm(request, true);
    const scanned = new URLSearchParams(raw.slice(0, 500)).get("scanned") === "1";
    if (totpOk && scanned) {
      this.ctx.storage.sql.exec("UPDATE users SET totp_confirmed = 1 WHERE id = ?", session.user_id);
    }
    const expires = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    this.ctx.storage.sql.exec(
      "UPDATE login_sessions SET state = 'full', expires_at = ? WHERE id = ?",
      expires,
      session.id,
    );
    return new Response(null, {
      status: 303,
      headers: { Location: "/", "Set-Cookie": authCookie(session.id, 14 * 24 * 60 * 60), "Cache-Control": "no-store" },
    });
  }

  private logout(request: Request): Response {
    const id = readCookie(request, "ga_auth");
    if (id) this.ctx.storage.sql.exec("DELETE FROM login_sessions WHERE id = ?", id);
    return new Response(null, {
      status: 303,
      headers: { Location: "/login", "Set-Cookie": "ga_auth=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0" },
    });
  }

  private startLogin(userId: string, needsCode: boolean, url: URL): Response {
    const id = randomToken(32);
    const ttlMs = needsCode ? 10 * 60 * 1000 : 14 * 24 * 60 * 60 * 1000;
    const expires = new Date(Date.now() + ttlMs).toISOString();
    this.ctx.storage.sql.exec(
      "INSERT INTO login_sessions (id, user_id, state, expires_at) VALUES (?, ?, ?, ?)",
      id,
      userId,
      needsCode ? "pending_2fa" : "full",
      expires,
    );
    const next = url.searchParams.get("next");
    const location = needsCode ? "/login/code" : next && next.startsWith("/") ? next : "/";
    return new Response(null, {
      status: 303,
      headers: {
        Location: location,
        "Cache-Control": "no-store",
        "Set-Cookie": authCookie(id, Math.floor(ttlMs / 1000)),
      },
    });
  }

  private lockedOut(email: string): boolean {
    const rows = this.ctx.storage.sql
      .exec<{ failures: number; window_start: string } & Record<string, SqlStorageValue>>(
        "SELECT failures, window_start FROM login_attempts WHERE email = ?",
        email,
      )
      .toArray();
    const row = rows[0];
    if (!row) return false;
    if (Date.now() - Date.parse(row.window_start) > 15 * 60 * 1000) return false;
    return row.failures >= 8;
  }

  private noteFailure(email: string): void {
    const now = new Date().toISOString();
    const rows = this.ctx.storage.sql
      .exec<{ failures: number; window_start: string } & Record<string, SqlStorageValue>>(
        "SELECT failures, window_start FROM login_attempts WHERE email = ?",
        email,
      )
      .toArray();
    const row = rows[0];
    if (!row || Date.now() - Date.parse(row.window_start) > 15 * 60 * 1000) {
      this.ctx.storage.sql.exec(
        "INSERT INTO login_attempts (email, failures, window_start) VALUES (?, 1, ?) ON CONFLICT(email) DO UPDATE SET failures = 1, window_start = excluded.window_start",
        email,
        now,
      );
      return;
    }
    this.ctx.storage.sql.exec("UPDATE login_attempts SET failures = failures + 1 WHERE email = ?", email);
  }

  private clearFailures(email: string): void {
    this.ctx.storage.sql.exec("DELETE FROM login_attempts WHERE email = ?", email);
  }

  private async useBackupCode(userId: string, code: string): Promise<boolean> {
    const normalized = code.replace(/[\s-]/g, "").toLowerCase();
    if (!/^[a-z0-9]{8}$/.test(normalized)) return false;
    const codeHash = await sha256Hex(normalized);
    const used = this.ctx.storage.sql.exec(
      "UPDATE backup_codes SET used_at = ? WHERE user_id = ? AND code_hash = ? AND used_at IS NULL",
      new Date().toISOString(),
      userId,
      codeHash,
    );
    return used.rowsWritten === 1;
  }

  private async postReply(request: Request, principal: Principal): Promise<Response> {
    if (!canReply(principal)) {
      if (request.headers.get("Content-Type")?.includes("application/json")) return json({ error: "unauthorized" }, 401);
      return new Response(null, { status: 303, headers: { Location: "/login" } });
    }
    const raw = await request.text();
    if (raw.length > 8_000) return json({ error: "body too large" }, 413);
    const contentType = request.headers.get("Content-Type") ?? "";
    let host = "";
    let sessionId = "";
    let textBody = "";
    if (contentType.includes("application/json")) {
      try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        host = clip(parsed.host, 80);
        sessionId = clip(parsed.session_id, 120);
        textBody = clip(parsed.text, 4_000);
      } catch {
        return json({ error: "invalid JSON" }, 400);
      }
    } else {
      const form = new URLSearchParams(raw);
      host = clip(form.get("host"), 80);
      sessionId = clip(form.get("session_id"), 120);
      textBody = clip(form.get("text"), 4_000);
    }
    if (!host || !sessionId || !textBody) return json({ error: "host, session_id, and text are required" }, 400);
    const known = this.ctx.storage.sql
      .exec<SessionRow>("SELECT * FROM sessions WHERE session_key = ? AND user_id = ?", sessionKey(host, sessionId), principal.userId)
      .toArray();
    const workspace = known[0]?.workspace ?? "";
    const id = crypto.randomUUID();
    this.ctx.storage.sql.exec(
      "INSERT INTO replies (id, user_id, host, session_id, workspace, text, created_at, delivered_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL)",
      id,
      principal.userId,
      host,
      sessionId,
      workspace,
      textBody,
      new Date().toISOString(),
    );
    if (!contentType.includes("application/json")) {
      return new Response(null, { status: 303, headers: { Location: "/" } });
    }
    return json({ ok: true, id });
  }

  private async claimReply(request: Request, principal: Principal): Promise<Response> {
    if (!canPost(principal)) return json({ error: "unauthorized" }, 401);
    const raw = await request.text();
    let host = "";
    try {
      const parsed = JSON.parse(raw || "{}") as Record<string, unknown>;
      host = clip(parsed.host, 80);
    } catch {
      return json({ error: "invalid JSON" }, 400);
    }
    if (!host) return json({ error: "host is required" }, 400);
    const rows = this.ctx.storage.sql
      .exec<{ id: string; session_id: string; workspace: string | null; text: string } & Record<string, SqlStorageValue>>(
        "SELECT id, session_id, workspace, text FROM replies WHERE user_id = ? AND host = ? AND delivered_at IS NULL ORDER BY created_at ASC LIMIT 1",
        principal.userId,
        host,
      )
      .toArray();
    const row = rows[0];
    if (!row) return json({ reply: null });
    const claimed = this.ctx.storage.sql.exec(
      "UPDATE replies SET delivered_at = ? WHERE id = ? AND delivered_at IS NULL",
      new Date().toISOString(),
      row.id,
    );
    if (claimed.rowsWritten !== 1) return json({ reply: null });
    return json({
      reply: { id: row.id, session_id: row.session_id, workspace: row.workspace ?? "", text: row.text },
    });
  }

  private oauthStart(providerId: string, url: URL): Response {
    const provider = providerById(providerId);
    if (!provider || !configuredProviders(this.env).some((item) => item.id === provider.id)) {
      return json({ error: "provider is not configured" }, 404);
    }
    const state = randomToken(24);
    this.ctx.storage.sql.exec(
      "INSERT INTO oauth_states (state, provider, expires_at) VALUES (?, ?, ?)",
      state,
      provider.id,
      new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    );
    const redirectUri = `${url.origin}/auth/callback/${provider.id}`;
    const auth = new URL(provider.authUrl);
    auth.searchParams.set("client_id", this.env[provider.clientIdEnv] ?? "");
    auth.searchParams.set("redirect_uri", redirectUri);
    auth.searchParams.set("scope", provider.scope);
    auth.searchParams.set("state", state);
    if (provider.id === "google") auth.searchParams.set("response_type", "code");
    return new Response(null, { status: 302, headers: { Location: auth.toString() } });
  }

  private async oauthCallback(request: Request, providerId: string, url: URL): Promise<Response> {
    const provider = providerById(providerId);
    if (!provider) return json({ error: "provider is not configured" }, 404);
    const code = url.searchParams.get("code") ?? "";
    const state = url.searchParams.get("state") ?? "";
    const rows = this.ctx.storage.sql
      .exec<{ provider: string; expires_at: string } & Record<string, SqlStorageValue>>(
        "SELECT provider, expires_at FROM oauth_states WHERE state = ?",
        state,
      )
      .toArray();
    this.ctx.storage.sql.exec("DELETE FROM oauth_states WHERE state = ?", state);
    const saved = rows[0];
    if (!code || !saved || saved.provider !== provider.id || saved.expires_at <= new Date().toISOString()) {
      return loginPage({ failed: true, providers: this.providerLinks() });
    }
    const redirectUri = `${url.origin}/auth/callback/${provider.id}`;
    const identity = await this.oauthIdentity(provider.id, code, redirectUri);
    if (!identity) return loginPage({ failed: true, providers: this.providerLinks() });
    const userId = this.userForIdentity(provider.id, identity);
    const user = this.ctx.storage.sql
      .exec<UserRow>("SELECT id, email, password_salt, password_hash, totp_secret FROM users WHERE id = ?", userId)
      .toArray()[0];
    return this.startLogin(userId, Boolean(user?.totp_secret), url);
  }

  private userForIdentity(provider: string, identity: { id: string; email: string }): string {
    const linked = this.ctx.storage.sql
      .exec<IdRow>("SELECT user_id AS id FROM oauth_identities WHERE provider = ? AND provider_user = ?", provider, identity.id)
      .toArray();
    if (linked[0]?.id) return linked[0].id;
    const email = identity.email.trim().toLowerCase();
    const existing = this.ctx.storage.sql.exec<IdRow>("SELECT id FROM users WHERE email = ?", email).toArray();
    const userId = existing[0]?.id ?? crypto.randomUUID();
    if (!existing[0]) {
      this.ctx.storage.sql.exec(
        "INSERT INTO users (id, email, password_salt, password_hash, totp_secret, created_at) VALUES (?, ?, NULL, NULL, NULL, ?)",
        userId,
        email,
        new Date().toISOString(),
      );
    }
    this.ctx.storage.sql.exec(
      "INSERT OR IGNORE INTO oauth_identities (provider, provider_user, user_id) VALUES (?, ?, ?)",
      provider,
      identity.id,
      userId,
    );
    return userId;
  }

  private async oauthIdentity(provider: string, code: string, redirectUri: string): Promise<{ id: string; email: string } | null> {
    const spec = providerById(provider);
    if (!spec) return null;
    const clientId = this.env[spec.clientIdEnv] ?? "";
    const clientSecret = this.env[spec.clientSecretEnv] ?? "";
    const tokenResponse = await fetch(spec.tokenUrl, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    if (!tokenResponse.ok) return null;
    const tokenJson = (await tokenResponse.json()) as { access_token?: string };
    if (!tokenJson.access_token) return null;
    if (provider === "github") return githubIdentity(tokenJson.access_token);
    if (provider === "google") return googleIdentity(tokenJson.access_token);
    return null;
  }

  private async postEvent(request: Request, userId: string): Promise<Response> {
    const length = Number(request.headers.get("Content-Length") ?? "0");
    if (Number.isFinite(length) && length > MAX_BODY) return json({ error: "body too large" }, 413);
    const raw = await request.text();
    if (raw.length > MAX_BODY) return json({ error: "body too large" }, 413);
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return json({ error: "invalid JSON" }, 400);
    }
    const event = parseEvent(parsed);
    if (typeof event === "string") return json({ error: event }, 400);

    if (event.dedupe_key) {
      const existing = this.ctx.storage.sql
        .exec<EventRow>("SELECT * FROM events WHERE dedupe_key = ? AND user_id = ?", event.dedupe_key, userId)
        .toArray();
      if (existing.length > 0) {
        const stored = eventFromRow(existing[0]);
        const session = this.sessionFor(stored.host, stored.session_id);
        return json({ ok: true, duplicate: true, event: stored, session });
      }
    }

    this.ctx.storage.sql.exec(
      `INSERT INTO events (
        id, at, kind, urgency, state, sticky, host, session_id, prompt_id, workspace, title, body, summary, source, dedupe_key, user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      event.id,
      event.at,
      event.kind,
      event.urgency,
      event.state,
      event.sticky ? 1 : 0,
      event.host,
      event.session_id,
      event.prompt_id,
      event.workspace,
      event.title,
      event.body,
      event.summary,
      event.source,
      event.dedupe_key || null,
      userId,
    );
    this.prune();
    const session = this.applySession(event, userId);
    const payload = JSON.stringify({ type: "event", event, session });
    for (const socket of this.ctx.getWebSockets()) {
      try {
        if (this.socketUser(socket) !== userId) continue;
        socket.send(payload);
      } catch (error) {
        console.error(JSON.stringify({ message: "socket send failed", error: String(error) }));
      }
    }
    return json({ ok: true, duplicate: false, event, session });
  }

  private listEvents(url: URL, userId: string): Response {
    const limit = clampLimit(url.searchParams.get("limit"));
    const since = url.searchParams.get("since") ?? "";
    const rows = since
      ? this.ctx.storage.sql
          .exec<EventRow>(
            "SELECT * FROM events WHERE user_id = ? AND at > ? ORDER BY at ASC LIMIT ?",
            userId,
            since,
            limit,
          )
          .toArray()
      : this.ctx.storage.sql
          .exec<EventRow>("SELECT * FROM events WHERE user_id = ? ORDER BY at DESC LIMIT ?", userId, limit)
          .toArray()
          .reverse();
    return json({ events: rows.map(eventFromRow) });
  }

  private applySession(event: AttentionEvent, userId: string): SessionSnapshot {
    const key = sessionKey(event.host, event.session_id);
    const currentRows = this.ctx.storage.sql
      .exec<SessionRow>("SELECT * FROM sessions WHERE session_key = ?", key)
      .toArray();
    const current = currentRows.length > 0 ? currentRows[0] : null;
    if (current && keepStickyAsk(current, event)) {
      const workspace = event.workspace || current.workspace || "";
      this.ctx.storage.sql.exec(
        "UPDATE sessions SET workspace = ?, updated_at = ? WHERE session_key = ?",
        workspace,
        event.at,
        key,
      );
      return sessionFromRow({ ...current, workspace, updated_at: event.at });
    }
    const workspace = event.workspace || current?.workspace || "";
    this.ctx.storage.sql.exec(
      `INSERT INTO sessions (
        session_key, host, session_id, workspace, state, title, body, summary, kind, urgency, sticky, prompt_id, updated_at, user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(session_key) DO UPDATE SET
        workspace = excluded.workspace,
        state = excluded.state,
        title = excluded.title,
        body = excluded.body,
        summary = excluded.summary,
        hidden = CASE WHEN excluded.kind IN ('turn_started', 'needs_user') THEN 0 ELSE sessions.hidden END,
        kind = excluded.kind,
        urgency = excluded.urgency,
        sticky = excluded.sticky,
        prompt_id = excluded.prompt_id,
        updated_at = excluded.updated_at,
        user_id = excluded.user_id`,
      key,
      event.host,
      event.session_id,
      workspace,
      event.state,
      event.title,
      event.body,
      event.summary,
      event.kind,
      event.urgency,
      event.sticky ? 1 : 0,
      event.prompt_id,
      event.at,
      userId,
    );
    return {
      host: event.host,
      session_id: event.session_id,
      workspace,
      state: event.state,
      title: event.title,
      body: event.body,
      summary: event.summary,
      hidden: event.kind === "turn_started" || event.kind === "needs_user" ? false : current?.hidden === 1,
      kind: event.kind,
      urgency: event.urgency,
      sticky: event.sticky,
      prompt_id: event.prompt_id,
      updated_at: event.at,
    };
  }

  private async setSessionHidden(request: Request, principal: Principal, hidden: boolean): Promise<Response> {
    if (!canReply(principal)) return json({ error: "unauthorized" }, 401);
    const raw = await request.text();
    if (raw.length > 2_000) return json({ error: "body too large" }, 413);
    let host = "";
    let sessionId = "";
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      host = clip(parsed.host, 80);
      sessionId = clip(parsed.session_id, 120);
    } catch {
      return json({ error: "invalid JSON" }, 400);
    }
    if (!host || !sessionId) return json({ error: "host and session_id are required" }, 400);
    const updated = this.ctx.storage.sql.exec(
      "UPDATE sessions SET hidden = ? WHERE session_key = ? AND user_id = ?",
      hidden ? 1 : 0,
      sessionKey(host, sessionId),
      principal.userId,
    );
    if (updated.rowsWritten !== 1) return json({ error: "not found" }, 404);
    const session = this.sessionFor(host, sessionId);
    const payload = JSON.stringify({ type: "session", session });
    for (const socket of this.ctx.getWebSockets()) {
      if (this.socketUser(socket) !== principal.userId) continue;
      try {
        socket.send(payload);
      } catch (error) {
        console.error(JSON.stringify({ message: "socket send failed", error: String(error) }));
      }
    }
    return json({ ok: true, session });
  }

  private sessionFor(host: string, sessionId: string): SessionSnapshot | null {
    const rows = this.ctx.storage.sql
      .exec<SessionRow>("SELECT * FROM sessions WHERE session_key = ?", sessionKey(host, sessionId))
      .toArray();
    return rows.length > 0 ? sessionFromRow(rows[0]) : null;
  }

  private sessions(userId: string): SessionSnapshot[] {
    return this.ctx.storage.sql
      .exec<SessionRow>(
        "SELECT * FROM sessions WHERE user_id = ? AND (hidden IS NULL OR hidden = 0) ORDER BY updated_at DESC LIMIT 100",
        userId,
      )
      .toArray()
      .map(sessionFromRow);
  }

  private recentEvents(userId: string, limit: number): AttentionEvent[] {
    return this.ctx.storage.sql
      .exec<EventRow>("SELECT * FROM events WHERE user_id = ? ORDER BY at DESC LIMIT ?", userId, limit)
      .toArray()
      .reverse()
      .map(eventFromRow);
  }

  private prune(): void {
    this.ctx.storage.sql.exec(
      `DELETE FROM events WHERE id NOT IN (
        SELECT id FROM events ORDER BY at DESC LIMIT ?
      )`,
      MAX_EVENTS,
    );
  }
}

function sessionKey(host: string, sessionId: string): string {
  return `${host}\n${sessionId}`;
}

function keepStickyAsk(current: SessionRow, incoming: AttentionEvent): boolean {
  if (current.state !== "needs_user" || current.sticky !== 1) return false;
  if (incoming.kind === "needs_user") return false;
  if (
    incoming.kind === "turn_started" ||
    incoming.kind === "turn_failed" ||
    incoming.kind === "turn_cancelled" ||
    incoming.kind === "session_ended"
  ) {
    return false;
  }
  return true;
}

function authCookie(id: string, maxAge: number): string {
  return `ga_auth=${id}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

async function githubIdentity(token: string): Promise<{ id: string; email: string } | null> {
  const userResponse = await fetch("https://api.github.com/user", {
    headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "User-Agent": "grok-attention" },
  });
  if (!userResponse.ok) return null;
  const user = (await userResponse.json()) as { id?: number; email?: string | null };
  let email = user.email ?? "";
  if (!email) {
    const emailsResponse = await fetch("https://api.github.com/user/emails", {
      headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "User-Agent": "grok-attention" },
    });
    if (emailsResponse.ok) {
      const emails = (await emailsResponse.json()) as { email?: string; primary?: boolean; verified?: boolean }[];
      email = emails.find((item) => item.primary && item.verified)?.email ?? emails.find((item) => item.verified)?.email ?? "";
    }
  }
  if (!user.id || !email) return null;
  return { id: String(user.id), email };
}

async function googleIdentity(token: string): Promise<{ id: string; email: string } | null> {
  const response = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) return null;
  const user = (await response.json()) as { id?: string; email?: string };
  if (!user.id || !user.email) return null;
  return { id: user.id, email: user.email };
}

function canRead(principal: Principal): boolean {
  return principal.kind === "master" || principal.kind === "device" || principal.kind === "user";
}

function canPost(principal: Principal): boolean {
  return principal.kind === "master" || principal.kind === "machine";
}

function canAdmin(principal: Principal): boolean {
  return principal.kind === "master" || principal.kind === "pair" || principal.kind === "user";
}

function canReply(principal: Principal): boolean {
  return principal.kind === "master" || principal.kind === "device" || principal.kind === "user";
}

function isHubPath(pathname: string): boolean {
  return (
    pathname === "/" ||
    pathname === "/login" ||
    pathname === "/login/code" ||
    pathname === "/login/show-code" ||
    pathname === "/logout" ||
    pathname === "/reply" ||
    pathname === "/pair" ||
    pathname === "/pair/unlock" ||
    pathname === "/pair/revoke" ||
    pathname === "/join" ||
    /^\/m\/[A-Za-z0-9_-]{16,64}(\/install)?$/.test(pathname) ||
    pathname === "/v1/enroll" ||
    pathname === "/v1/pairings" ||
    pathname === "/v1/pairings/current" ||
    pathname === "/v1/devices" ||
    pathname === "/v1/machine" ||
    pathname === "/v1/auth/methods" ||
    pathname === "/v1/auth/login" ||
    pathname === "/v1/auth/code" ||
    pathname === "/v1/replies" ||
    pathname === "/v1/replies/claim" ||
    pathname === "/v1/events" ||
    pathname === "/v1/sessions" ||
    pathname === "/v1/sessions/hide" ||
    pathname === "/v1/sessions/unhide" ||
    pathname === "/v1/ws" ||
    /^\/v1\/devices\/[0-9a-f-]{36}\/revoke$/.test(pathname) ||
    /^\/auth\/start\/[a-z0-9_-]+$/.test(pathname) ||
    /^\/auth\/callback\/[a-z0-9_-]+$/.test(pathname)
  );
}

function readCookie(request: Request, name: string): string {
  const header = request.headers.get("Cookie") ?? "";
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    if (trimmed.slice(0, eq) !== name) continue;
    try {
      return decodeURIComponent(trimmed.slice(eq + 1));
    } catch {
      return "";
    }
  }
  return "";
}

function randomToken(bytes: number): string {
  const buf = crypto.getRandomValues(new Uint8Array(bytes));
  let binary = "";
  for (const byte of buf) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function cleanName(value: unknown): string {
  const text = clip(typeof value === "string" ? value : "Mac", 80).replace(/[\u0000-\u001f]/g, "").trim();
  return text || "Mac";
}

function clampLimit(value: string | null): number {
  const parsed = Number(value ?? "50");
  if (!Number.isFinite(parsed)) return 50;
  return Math.min(200, Math.max(1, Math.floor(parsed)));
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") return json({ ok: true });
    const url = new URL(request.url);
    if (url.pathname === "/v1/health") return json({ ok: true });
    if (!isHubPath(url.pathname)) return json({ error: "not found" }, 404);
    if (!env.ATTENTION_TOKEN) return json({ error: "token is not configured" }, 500);
    try {
      const stub = env.HUB.getByName("notaify");
      return await stub.fetch(request);
    } catch (error) {
      console.error(JSON.stringify({ message: "worker request failed", error: String(error) }));
      return json({ error: "request failed" }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
