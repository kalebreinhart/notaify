#!/usr/bin/env python3
"""Classifier checks. Run: python3 skill/scripts/classify_test.py"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from classify import classify  # noqa: E402


def envelope(**fields: object) -> dict:
    base = {
        "hookEventName": "stop",
        "sessionId": "sess",
        "promptId": "prompt",
        "cwd": "/work",
    }
    base.update(fields)
    return base


class ClassifyTest(unittest.TestCase):
    def test_summary_uses_the_conclusion(self) -> None:
        message = "# Notes\n\nStarted by reading the mount.\n\n" + ("Checked a bolt. " * 12) + "The bracket is printed and mounted."
        event = classify(envelope(lastAssistantMessage=message), "RB17")
        assert event is not None
        self.assertIn("printed and mounted", event["summary"])

    def test_turn_finished(self) -> None:
        event = classify(
            envelope(lastAssistantMessage="Shipped the bracket."),
            "RB17",
        )
        assert event is not None
        self.assertEqual(event["kind"], "turn_ended")
        self.assertEqual(event["state"], "idle")
        self.assertFalse(event["sticky"])

    def test_question_is_sticky(self) -> None:
        event = classify(
            envelope(lastAssistantMessage="The mount is done.\nWhich approach should we use?"),
            "RB17",
        )
        assert event is not None
        self.assertEqual(event["kind"], "needs_user")
        self.assertTrue(event["sticky"])
        self.assertEqual(event["dedupe_key"], "RB17|sess|prompt|needs_user")

    def test_login_phrase(self) -> None:
        event = classify(
            envelope(lastAssistantMessage="Please log in to Cloudflare in the browser."),
            "RB17",
        )
        assert event is not None
        self.assertEqual(event["kind"], "needs_user")

    def test_login_mention_is_not_enough(self) -> None:
        event = classify(
            envelope(lastAssistantMessage="I left the login page copy alone."),
            "RB17",
        )
        assert event is not None
        self.assertEqual(event["kind"], "turn_ended")

    def test_session_end_stop_is_ignored(self) -> None:
        self.assertIsNone(classify(envelope(reason="shutdown"), "RB17"))

    def test_subagent_is_ignored(self) -> None:
        self.assertIsNone(classify(envelope(subagentType="explore"), "RB17"))

    def test_background_stays_running(self) -> None:
        event = classify(
            envelope(
                lastAssistantMessage="Started the build.",
                backgroundTasks=[{"id": "1", "type": "shell"}],
            ),
            "RB17",
        )
        assert event is not None
        self.assertEqual(event["state"], "running")
        self.assertEqual(event["kind"], "turn_ended")

    def test_permission_is_not_sticky(self) -> None:
        event = classify(
            envelope(
                hookEventName="notification",
                notificationType="permission_prompt",
                message="Allow wrangler deploy?",
            ),
            "RB17",
        )
        assert event is not None
        self.assertEqual(event["kind"], "needs_user")
        self.assertFalse(event["sticky"])

    def test_ask_tool(self) -> None:
        event = classify(
            envelope(
                hookEventName="pre_tool_use",
                toolName="ask_user_question",
                toolInput={"questions": [{"question": "Ship the steel mount?", "options": [{"label": "Yes", "description": "Print it"}]}]},
            ),
            "RB17",
        )
        assert event is not None
        self.assertEqual(event["title"], "Ship the steel mount?")
        self.assertEqual(event["options"][0]["label"], "Yes")
        self.assertFalse(event["sticky"])

    def test_prompt_starts_running(self) -> None:
        event = classify(
            envelope(hookEventName="user_prompt_submit", prompt="keep going"),
            "RB17",
        )
        assert event is not None
        self.assertEqual(event["kind"], "turn_started")
        self.assertEqual(event["state"], "running")

    def test_failure_and_cancel(self) -> None:
        failed = classify(envelope(hookEventName="stop_failure", error="rate_limit"), "RB17")
        cancelled = classify(envelope(hookEventName="stop_cancelled", reason="user_interrupt"), "RB17")
        assert failed is not None and cancelled is not None
        self.assertEqual(failed["kind"], "turn_failed")
        self.assertEqual(cancelled["kind"], "turn_cancelled")

    def test_pascal_stop_failure(self) -> None:
        event = classify(
            {
                "hook_event_name": "StopFailure",
                "sessionId": "sess",
                "promptId": "prompt",
                "error": "server_error",
            },
            "RB17",
        )
        assert event is not None
        self.assertEqual(event["kind"], "turn_failed")


if __name__ == "__main__":
    unittest.main()
