"""Turn a Grok hook envelope into one attention-bus event, or nothing."""

from __future__ import annotations

import hashlib
import json
import re
from typing import Any

ATTENTION = re.compile(
    r"("
    r"\b(please|need you to|needs you to|waiting on you|you need to)\b.{0,48}\b(log ?in|sign in|authenticate|approve|choose|pick|confirm)\b"
    r"|\b(log ?in|sign in) to\b"
    r"|\bwrangler login\b"
    r"|\b(grant|approve) (access|the login|this login)\b"
    r"|\byour (approval|decision) is required\b"
    r"|\bdesign fork\b"
    r"|\bwhich (option|approach) (do you|should we)\b"
    r")",
    re.IGNORECASE | re.DOTALL,
)

ASK_TOOLS = {"ask_user_question", "ask_question", "askuserquestion"}


def snake(name: str) -> str:
    out: list[str] = []
    for index, char in enumerate(name):
        if char.isupper() and index and not name[index - 1].isupper():
            out.append("_")
        out.append(char.lower())
    return "".join(out).replace("-", "_")


def text_of(event: dict[str, Any], *keys: str) -> str:
    for key in keys:
        value = event.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


def hook_name(event: dict[str, Any]) -> str:
    raw = text_of(event, "hookEventName", "hook_event_name")
    return snake(raw) if raw else ""


def is_subagent(event: dict[str, Any]) -> bool:
    return bool(text_of(event, "subagentType", "subagent_type"))


def clip(value: str, limit: int) -> str:
    value = value.strip()
    if len(value) <= limit:
        return value
    return value[: limit - 1] + "…"


def summarize(text: str, limit: int = 280) -> str:
    kept: list[str] = []
    fenced = False
    for line in text.splitlines():
        stripped = line.strip()
        if stripped.startswith("```"):
            fenced = not fenced
            continue
        if fenced or not stripped or stripped.startswith("#"):
            continue
        kept.append(stripped)
    prose = " ".join(kept)
    prose = re.sub(r"\s+", " ", prose).strip()
    sentences = [part.strip() for part in re.split(r"(?<=[.!?])\s+", prose) if part.strip()]
    chosen = sentences[-2:] if len(sentences) > 2 else sentences[:2]
    summary = ""
    for sentence in chosen:
        nxt = f"{summary} {sentence}".strip()
        if len(nxt) > limit and summary:
            break
        summary = nxt
    return clip(summary or first_line(text, ""), limit)


def first_line(value: str, fallback: str) -> str:
    for line in value.splitlines():
        stripped = line.strip()
        if stripped:
            return clip(stripped, 140)
    return fallback


def digest(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()[:12]


def asks_for_user(message: str) -> bool:
    if not message.strip():
        return False
    if ATTENTION.search(message):
        return True
    last = ""
    for line in message.splitlines():
        if line.strip():
            last = line.strip()
    if not last.endswith("?") or len(last) > 200:
        return False
    if last.startswith(("`", "#", "-", "*")):
        return False
    return True


def tool_name(event: dict[str, Any]) -> str:
    return snake(text_of(event, "toolName", "tool_name"))


def tool_payload(event: dict[str, Any]) -> dict[str, Any]:
    payload = event.get("toolInput", event.get("tool_input"))
    if isinstance(payload, str):
        try:
            parsed = json.loads(payload)
        except json.JSONDecodeError:
            return {}
        return parsed if isinstance(parsed, dict) else {}
    return payload if isinstance(payload, dict) else {}


def question_options(event: dict[str, Any]) -> list[dict[str, str]]:
    questions = tool_payload(event).get("questions")
    if not isinstance(questions, list) or not questions or not isinstance(questions[0], dict):
        return []
    raw = questions[0].get("options")
    if not isinstance(raw, list):
        return []
    options: list[dict[str, str]] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        label = clip(str(item.get("label") or ""), 80)
        if not label:
            continue
        options.append({"label": label, "description": clip(str(item.get("description") or ""), 160)})
        if len(options) == 6:
            break
    return options


def question_text(event: dict[str, Any]) -> str:
    payload = tool_payload(event)
    questions = payload.get("questions")
    if isinstance(questions, list) and questions and isinstance(questions[0], dict):
        question = questions[0].get("question")
        if isinstance(question, str) and question.strip():
            return clip(question, 240)
    return "Grok asked a question"


def background_running(event: dict[str, Any]) -> bool:
    tasks = event.get("backgroundTasks", event.get("background_tasks"))
    return isinstance(tasks, list) and len(tasks) > 0


def base(event: dict[str, Any], host: str) -> dict[str, str]:
    return {
        "host": host,
        "session_id": text_of(event, "sessionId", "session_id"),
        "prompt_id": text_of(event, "promptId", "prompt_id"),
        "workspace": text_of(event, "workspaceRoot", "cwd", "workspace_root"),
        "source": "hook",
    }


def dedupe(host: str, session_id: str, prompt_id: str, kind: str, extra: str = "") -> str:
    if not session_id or not prompt_id:
        return ""
    parts = [host, session_id, prompt_id, kind]
    if extra:
        parts.append(extra)
    return "|".join(parts)


def classify(event: dict[str, Any], host: str) -> dict[str, Any] | None:
    if is_subagent(event):
        return None
    name = hook_name(event)
    fields = base(event, host)
    session_id = fields["session_id"]
    prompt_id = fields["prompt_id"]

    if name == "user_prompt_submit":
        prompt = text_of(event, "prompt", "message", "userPrompt")
        return {
            **fields,
            "kind": "turn_started",
            "urgency": "idle",
            "state": "running",
            "sticky": False,
            "title": "Working",
            "body": clip(prompt, 180),
            "dedupe_key": dedupe(host, session_id, prompt_id, "turn_started"),
        }

    if name == "notification":
        if text_of(event, "notificationType", "notification_type") != "permission_prompt":
            return None
        message = text_of(event, "message", "title") or "Permission needed"
        return {
            **fields,
            "kind": "needs_user",
            "urgency": "attention",
            "state": "needs_user",
            "sticky": False,
            "title": first_line(message, "Permission needed"),
            "body": clip(message, 500),
            "dedupe_key": dedupe(host, session_id, prompt_id, "permission", digest(message)),
        }

    if name == "pre_tool_use" and tool_name(event) in ASK_TOOLS:
        question = question_text(event)
        return {
            **fields,
            "kind": "needs_user",
            "urgency": "attention",
            "state": "needs_user",
            "sticky": False,
            "title": first_line(question, "Question"),
            "body": question,
            "options": question_options(event),
            "dedupe_key": dedupe(host, session_id, prompt_id, "ask", digest(question)),
        }

    if name == "stop":
        if text_of(event, "reason") not in ("", "end_turn"):
            return None
        message = text_of(event, "lastAssistantMessage", "last_assistant_message")
        if background_running(event) and not asks_for_user(message):
            return {
                **fields,
                "kind": "turn_ended",
                "urgency": "idle",
                "state": "running",
                "sticky": False,
                "title": "Background work still running",
                "body": clip(message, 400),
                "dedupe_key": dedupe(host, session_id, prompt_id, "turn_ended", "background"),
            }
        if asks_for_user(message):
            summary = summarize(message)
            return {
                **fields,
                "kind": "needs_user",
                "urgency": "attention",
                "state": "needs_user",
                "sticky": True,
                "title": first_line(summary, "Needs you"),
                "summary": summary or "Needs you",
                "body": clip(message, 800),
                "dedupe_key": dedupe(host, session_id, prompt_id, "needs_user"),
            }
        summary = summarize(message) or "Turn finished"
        return {
            **fields,
            "kind": "turn_ended",
            "urgency": "idle",
            "state": "idle",
            "sticky": False,
            "title": first_line(summary, "Turn finished"),
            "summary": summary,
            "body": clip(message, 800),
            "dedupe_key": dedupe(host, session_id, prompt_id, "turn_ended"),
        }

    if name == "stop_failure":
        detail = text_of(event, "errorDetails", "error_details", "lastAssistantMessage", "last_assistant_message")
        error = text_of(event, "error") or "unknown"
        return {
            **fields,
            "kind": "turn_failed",
            "urgency": "attention",
            "state": "failed",
            "sticky": False,
            "title": f"Turn failed ({error})",
            "body": clip(detail, 500),
            "dedupe_key": dedupe(host, session_id, prompt_id, "turn_failed"),
        }

    if name == "stop_cancelled":
        reason = text_of(event, "reason") or "cancelled"
        detail = text_of(event, "reasonDetails", "reason_details", "lastAssistantMessage", "last_assistant_message")
        return {
            **fields,
            "kind": "turn_cancelled",
            "urgency": "idle",
            "state": "idle",
            "sticky": False,
            "title": f"Turn cancelled ({reason})",
            "body": clip(detail, 400),
            "dedupe_key": dedupe(host, session_id, prompt_id, "turn_cancelled", reason),
        }

    if name == "session_end":
        return {
            **fields,
            "kind": "session_ended",
            "urgency": "idle",
            "state": "ended",
            "sticky": False,
            "title": "Session ended",
            "body": "",
            "dedupe_key": "",
        }

    return None
