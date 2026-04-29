# OpenAI Subscription / Codex Runner Plan

Date: 2026-04-25
Status: active

## Decision

Mike wants Paperclip to use his OpenAI/ChatGPT subscription through Codex CLI auth, not direct OpenAI API-key billing.

Verified locally on WSL:

- `codex` is installed at `/home/blasc/.local/bin/codex`.
- `codex login --device-auth` completed successfully.
- `codex login status` reports `Logged in using ChatGPT`.
- A smoke test using `codex exec --json --model gpt-5.5` returned `CODEX_55_OK`.
- `~/.codex/auth.json` exists locally and contains the ChatGPT/Codex login session. Treat it as secret material. Do not copy it into git, Obsidian, chat, or Railway variables.

## Important constraint

Railway app containers do not automatically have Mike's local ChatGPT/Codex subscription session.

Paperclip's `codex_local` adapter determines billing mode this way:

- If `OPENAI_API_KEY` exists in the environment, Codex uses API billing.
- If `OPENAI_API_KEY` is absent, Codex relies on local Codex login/session auth and reports billing type as `subscription`.

Railway currently has no `OPENAI_API_KEY` variable, which is good for avoiding API-key billing. But Railway also lacks Mike's local `~/.codex/auth.json`, so a Railway-hosted `codex_local` agent cannot use the subscription unless a secure runner/runtime is provided.

## Correct architecture

Use Paperclip on Railway as the control plane and run Codex execution on a machine/service that has Mike's Codex subscription login.

Preferred split:

```text
Paperclip UI/API/database = Railway
Codex subscription auth = local WSL runner / trusted external runner
Paperclip agent adapter = HTTP bridge or external worker that calls local `codex exec`
No OPENAI_API_KEY in Railway
```

## Do not do

- Do not add `OPENAI_API_KEY` to Railway if the goal is subscription usage.
- Do not paste or preserve `~/.codex/auth.json` contents.
- Do not commit Codex auth files to the repo.
- Do not assume `codex_local` on Railway uses subscription auth just because local WSL is logged in.

## Next implementation steps

1. Disable or replace stale Paperclip HTTP agent URL pointing at dead `trycloudflare.com` tunnel.
2. Create a stable external Codex/Hermes bridge on the local WSL machine or another trusted always-on runner.
3. Configure a Paperclip HTTP Webhook agent to send task/heartbeat payloads to that bridge.
4. Bridge executes `codex exec --json` locally, where `codex login status` is `Logged in using ChatGPT`.
5. Bridge returns output/status to Paperclip and logs closeout to Obsidian/Telegram.

## Verification command

Safe local check:

```bash
codex login status
# expected: Logged in using ChatGPT
```

Functional smoke test:

```bash
TMP=$(mktemp -d)
cd "$TMP"
git init -q
codex exec --json --model gpt-5.5 -c model_reasoning_effort='low' 'Reply with exactly: CODEX_55_OK'
```

Expected output includes:

```text
CODEX_55_OK
```
