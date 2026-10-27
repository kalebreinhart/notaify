# Notaify

Notaify tells you when an agent is finished and waiting on you. It works with any agent that can send a small JSON event. You get the notification on the web, iPhone, or Android.

The public site is [notaify.com](https://notaify.com). The same worker also answers on its workers.dev hostname.

A machine posts when a turn starts, finishes, fails, or needs a person. A signed-in device reads those events and can send the next prompt back to the machine. Each account only sees its own agents.

## Install on another computer

Copy this folder over, then:

```bash
python3 skill/scripts/install.py
```

Copy `~/.config/grok-attention/config.json` from a machine that already has it. Set `host` to this computer's short hostname (`hostname -s`). Mode `600`. Do not commit that file. It holds the bus token.

Hooks live in `~/.grok/hooks/grok-attention.json`. They run after the folder is trusted. Home is trusted. Other repos need `/hooks-trust` once.

Restart Grok, or run `/hooks` and press `r`, so the new hook loads.

## What gets reported

| Moment | `kind` | Session `state` |
| --- | --- | --- |
| You send a prompt | `turn_started` | `running` |
| Turn finishes | `turn_ended` | `idle`, or `running` if background work is still in flight |
| Final message asks you to log in, choose, or ends in a question | `needs_user` | `needs_user` (sticky: a following `turn_ended` does not clear it) |
| Permission prompt, or `ask_user_question` | `needs_user` | `needs_user` (not sticky: the finishing turn clears it) |
| API error | `turn_failed` | `failed` |
| Turn cancelled | `turn_cancelled` | `idle` |
| Session closes | `session_ended` | `ended` |

The next `turn_started` clears a sticky ask. Subagent turns are not reported.

An agent can also post a sticky `needs_user` with `skill/scripts/notify.py` when it is blocked on you and the final message will not say so.

## Mac app

Menu-bar client. One WebSocket. Group rows by `host`. Pin `needs_user` and `failed`. Toast `needs_user`, `turn_failed`, and `turn_ended`. Do not toast `turn_started`. Hide `ended` sessions from the board; keep them in the event list.

Reconnect with backoff. On connect the server sends `hello`. After that, apply each `event` message. Render `session` from the message. Do not recompute state.

Enroll the Mac at `https://notaify.com/pair`. Unlock that page with the bus token. The page shows a QR code. The QR text is:

```
https://notaify.com/join?code=<one-time>
```

The code works once and expires after 3 minutes. Opening `/join` does not enroll anything. The app scans the QR, or the person types the code, then:

```
POST /v1/enroll
{"code":"<one-time>","name":"Mac"}
```

No auth on that call. Response, once:

```json
{"ok":true,"device_id":"...","device_token":"gat_...","url":"https://notaify.com"}
```

Store `device_token` and send it as the bearer on `GET /v1/events`, `GET /v1/sessions`, and the WebSocket. A device token cannot `POST /v1/events` and cannot open `/pair`. Revoking it on the pairing page makes it 401. People sign in at `/login` with email, password, and a 6-digit authenticator code or a one-time backup code. GitHub and Google appear on that page when their client id and secret are set on the worker (`GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`). Another provider is one entry in `src/providers.ts` plus the same pair of secrets. The callback is `/auth/callback/<provider>`.

A signed-in person can type the next prompt on a session. The machine claims it and, if the turn is still closing, the stop hook feeds that text back as the next user message. Otherwise `deliver.py` runs `grok -p --verbatim --resume <session>` in the session workspace.

The bus token stays on the computers that run hooks. It acts as the account that owns this deployment.

The same pairing page shows a machine link, `https://notaify.com/m/<code>`. It lasts 15 minutes and works once. Opening it does not install anything. On the other computer, run the command the page shows. That command installs the skill and hooks and writes a `gam_` credential that can only `POST /v1/events`. `GET /m/<code>/install` does not claim the link. Claim it with `POST` and a body of `claim=1`.

Prefer `Authorization: Bearer <token>`. A `token` query parameter also works when the client cannot set headers. The query form shows up in request logs. Send a `User-Agent`. workers.dev rejects Python's default `Python-urllib` agent with Cloudflare error 1010. The hook sends `grok-attention/1`.

Send the text frame `ping` if you want an application heartbeat. The server answers `pong` without waking the Durable Object for the automatic pair. A text frame `hello` returns a fresh snapshot.

### `GET /v1/health`

No auth. `{"ok": true}`.

### `POST /v1/events`

Auth required. JSON body:

```json
{
  "kind": "needs_user",
  "urgency": "attention",
  "state": "needs_user",
  "sticky": true,
  "host": "RB17",
  "session_id": "session",
  "prompt_id": "prompt",
  "workspace": "/home/kaleb/Projects/grok-attention",
  "title": "Log in to Cloudflare",
  "body": "The browser is waiting on the personal account.",
  "source": "agent",
  "dedupe_key": "RB17|session|prompt|needs_user"
}
```

`kind` is one of the table above. `urgency` is `idle` or `attention`. `source` is `hook` or `agent`. `host` and `title` are required. The server assigns `id` and `at`. The same `dedupe_key` returns the original event and does not broadcast again.

Response:

```json
{ "ok": true, "duplicate": false, "event": {}, "session": {} }
```

### `GET /v1/events?limit=50&since=<iso>`

Auth required. `since` is exclusive on `at`. Without `since`, the most recent `limit` events come back oldest-first. `limit` max is 200.

### `GET /v1/sessions`

Auth required. Current row per host and session, newest first.

```json
{
  "sessions": [
    {
      "host": "RB17",
      "session_id": "session",
      "workspace": "/home/kaleb",
      "state": "needs_user",
      "title": "Log in to Cloudflare",
      "body": "The browser is waiting on the personal account.",
      "kind": "needs_user",
      "urgency": "attention",
      "sticky": true,
      "prompt_id": "prompt",
      "updated_at": "2026-10-27T03:00:00.000Z"
    }
  ]
}
```

### WebSocket `GET /v1/ws`

Auth required. First frame:

```json
{ "type": "hello", "sessions": [], "events": [] }
```

Each accepted post:

```json
{ "type": "event", "event": {}, "session": {} }
```

`event` includes server `id` and `at`. `events` in `hello` are the last 50, oldest first.
