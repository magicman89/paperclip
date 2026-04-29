# Mike Command Source Policy

Status: active operating policy
Scope: Mike's Paperclip / Hermes / Obsidian / Telegram command system

## Surfaces

- Telegram / MC Agents: command room and live chatter.
- Paperclip: durable task board, agent assignments, heartbeat runs, issue comments, execution closeouts.
- Obsidian: durable human-readable command center, handoff notes, open loops, daily closeout notes.
- Hermes: operator / tool runner that executes work and writes proof back to durable surfaces.

## Source of truth

Paperclip issue comments and Obsidian handoff notes are the durable source of truth.

Telegram is not the source of truth. Telegram is the remote control, decision surface, and fast status room. Any work that matters must be reflected in Paperclip and/or Obsidian.

## Heartbeat closeout requirement

Every Paperclip heartbeat run should write a concrete `result_json` when it finalizes.

Minimum `result_json` fields:

- `summary`: concise human-readable outcome.
- `status`: final run status.
- `runId`: heartbeat run id.
- `agentName`: agent name.
- `concreteCloseout`: `true`.

When the run is issue-backed, include:

- `issueId`
- `issueIdentifier`
- `issueTitle`

When available, include:

- `result`
- `message`
- `error`
- `provider`
- `model`
- `runtimePrimaryUrl`
- `stdoutExcerpt`
- `stderrExcerpt`

Issue-backed heartbeat runs must also write a Paperclip issue comment with a closeout summary. This comment should end with:

`Source of truth: Paperclip issue comments and Obsidian handoff notes; Telegram is command-room chatter only.`

## Legacy/offline agent policy

Agents using dead local runtimes or stale temporary tunnels should be paused or terminated instead of left as noisy active workers.

Known expected states:

- Durable Railway-backed HTTP agents: active/idle with heartbeat enabled.
- Codex 5.5 Subscription Runner: heartbeat disabled unless Mike's local bridge and Cloudflare tunnel are intentionally online.
- MikeyCloudClaw / old Hermes Local: terminated or paused as legacy/offline.
- BossBot / old OpenClaw gateway: terminated or paused as legacy/offline.

Do not blindly disable revenue/product agents that are actively producing useful outputs. If they are `claude_local` but still producing valid issue comments/result_json, treat them as legacy runtime candidates to migrate, not immediate deletion targets.

## Verification rule

A run is not considered complete only because the HTTP adapter returned 200.

Verify at least one durable proof point:

- newest `heartbeat_runs.result_json` is non-null and contains `concreteCloseout: true`; or
- issue comment contains `Paperclip execution closeout`; or
- Obsidian handoff note records the result with issue/run evidence.

For deployments, verify Railway DB state after code changes; do not rely only on logs or public health checks.
