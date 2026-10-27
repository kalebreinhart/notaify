---
name: grok-attention
description: >
  Report to Kaleb's attention bus when this Grok turn needs him in person:
  an account login, a credential or permission, or a design fork you will not
  decide. Use when you are blocked on the user, when you ask a blocking
  question in prose, and when installing or repairing grok-attention
  (/grok-attention).
when-to-use: >
  log in, sign in, wrangler login, approve an account, design fork,
  which approach, need the user, waiting on Kaleb, install grok-attention,
  enroll at notaify, project board, job from notaify
---

# Notaify

This skill reports to Notaify, the notification bus at notaify.com. A user hook on this computer already reports turn start, turn end, failure, cancel, permission prompts, and `ask_user_question`. You only post when the hook will not say why the user is needed.

## Post a needs-you event

Run this before your final message when the turn is blocked on the user and your final message will not itself say so:

- They must log in, approve an account, or paste a credential.
- You are at a design fork and will not pick for them.
- You are asking a blocking question in prose.

When you are offering a choice, send the same options you show in the chat. Repeat `--option` once per choice, at most six. Use `Label | short description` when a label is not enough. The person can tap an option in Notaify or type their own reply.

```bash
python3 ~/.grok/skills/grok-attention/scripts/notify.py \
  --title "Which mount?" \
  --body "The shelf can hang two ways." \
  --option "Steel bracket | Bolts to the wall" \
  --option "Printed clip"
```

`--title` is one short line. `--body` is one or two sentences. The command prints `attention: ok` or `attention: not delivered` and exits 0. Still ask the user in your reply, with the same options.

Skip `notify.py` when this turn already called `ask_user_question`. That tool's options are sent by the hook. Also skip it when the final message only asks them to log in or ends in a question and there are no choices to tap.

Do not post for ordinary progress or a finished task.

A person can send the next prompt from the attention site. The stop hook injects it into this turn when it is already waiting. Otherwise this machine starts that prompt in the same session. Do not ask them to paste the same text into the terminal.

## Enroll at Notaify

When the user tells you to enroll at Notaify, open https://notaify.com/enroll with them. If they have no account, the page creates one, names the shared project, and records what this machine can do (xcode, android, windows, linux, browser, gpu, or general). If they already have an account, open https://notaify.com/crew and use the same project name as the other machines. Run the one-time install command the page shows. Pipe it to `sh`. Do not print the script or the credential. After it finishes, this machine listens for crew jobs.

## Work with the crew

At the start of a turn, read `~/.config/grok-attention/inbox.json` if it exists. It holds a job and board notes meant for this agent. Do the job. Post the result for a teammate, then finish the job.

```bash
python3 ~/.grok/skills/grok-attention/scripts/team.py job --title "Build the Android app" --body "Assemble the debug build and post the result." --capability android
python3 ~/.grok/skills/grok-attention/scripts/team.py post --text "Android build is green." --to "Mac build"
python3 ~/.grok/skills/grok-attention/scripts/team.py finish --id "<job id>" --result "Installed the debug build."
```

`--to` is the other agent's name. Notes are removed when that agent takes them, or after one hour. A note with no name is taken by the next teammate. Do not use another clipboard service for this.

## Install on a computer

If the user gives you a `https://…/m/<code>` grok-attention link, fetch that URL and run the install command it shows. Pipe it to `sh`. Do not print the script or the credential. The command installs this skill, the user hooks, and this machine's bus credential.

From a checkout of `grok-attention`, `python3 skill/scripts/install.py` links this skill into `~/.grok/skills/grok-attention` and writes `~/.grok/hooks/grok-attention.json`. The bus credential lives in `~/.config/grok-attention/config.json`, mode `600`. Do not print it.
