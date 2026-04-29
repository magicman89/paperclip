import postgres from "postgres";

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) {
  console.error("FATAL: DATABASE_URL not set");
  process.exit(1);
}

// ── Target agents and expected config ──
const TARGETS: Record<string, { intervalSec: number; maxLastRunMin: number }> = {
  Hermes:               { intervalSec: 300,  maxLastRunMin: 40 },
  "Chief of Staff":     { intervalSec: 900,  maxLastRunMin: 40 },
  "Dev Operator":       { intervalSec: 1800, maxLastRunMin: 40 },
  "Server Mechanic":    { intervalSec: 1800, maxLastRunMin: 40 },
  "Obsidian Librarian": { intervalSec: 1800, maxLastRunMin: 40 },
  "Revenue Follow-Up Agent": { intervalSec: 1800, maxLastRunMin: 40 },
  "Bullbot Market Scout":    { intervalSec: 1800, maxLastRunMin: 40 },
  "Content Producer":        { intervalSec: 3600, maxLastRunMin: 80 },
};

// Agents to never touch
const NEVER_TOUCH = new Set(["Codex 5.5 Subscription Runner"]);

const HEARTBEAT_FIELDS = {
  cooldownSec: 60,
  wakeOnDemand: true,
  maxConcurrentRuns: 1,
  durableBridge: "railway-hermes-api-server",
  alwaysOnMode: true,
};

function redact(s: string): string {
  return s
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/g, "Bearer [REDACTED]")
    .replace(/https?:\/\/[^\s"']*@/g, "***@")
    .replace(/Authorization['":\s]*[A-Za-z0-9._~+/=-]+/gi, "Authorization [REDACTED]")
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[EMAIL_REDACTED]");
}

function safeJson(v: unknown): unknown {
  if (v === null || v === undefined) return v;
  if (typeof v === "string") return redact(v);
  if (Array.isArray(v)) return v.map(safeJson);
  if (typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (/token|secret|key|password|auth/i.test(k) && typeof val === "string" && val.length > 8) {
        out[k] = "[REDACTED]";
      } else {
        out[k] = safeJson(val);
      }
    }
    return out;
  }
  return v;
}

const sql = postgres(DB_URL, { max: 1 });

interface AgentRow {
  id: string;
  name: string;
  status: string;
  adapter_type: string;
  paused_at: string | null;
  pause_reason: string | null;
  last_heartbeat_at: string | null;
  runtime_config: Record<string, unknown>;
  adapter_config: Record<string, unknown>;
}

interface RunRow {
  id: string;
  agent_id: string;
  status: string;
  started_at: string | null;
  finished_at: string | null;
  error: string | null;
  exit_code: number | null;
  created_at: string;
}

interface RepairResult {
  agent: string;
  action: string;
  fields: string[];
}

async function main() {
  const results: RepairResult[] = [];
  const now = new Date();

  // ── Step 1: Query all agents ──
  const agentRows = await sql<AgentRow[]>`
    SELECT id, name, status, adapter_type, paused_at, pause_reason,
           last_heartbeat_at, runtime_config, adapter_config
    FROM agents
    WHERE 1=1
    ORDER BY name
  `;

  const agentsById = new Map<string, AgentRow>();
  const targetAgents: AgentRow[] = [];
  for (const a of agentRows) {
    agentsById.set(a.id, a);
    if (TARGETS[a.name] && !NEVER_TOUCH.has(a.name)) {
      targetAgents.push(a);
    }
  }

  console.log(`[WATCHDOG] Found ${agentRows.length} agents, ${targetAgents.length} targets`);

  // ── Step 2: Query recent heartbeat runs (last 2 hours) ──
  const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
  const runRows = await sql<RunRow[]>`
    SELECT id, agent_id, status, started_at, finished_at, error, exit_code, created_at
    FROM heartbeat_runs
    WHERE created_at >= ${twoHoursAgo.toISOString()}
    ORDER BY created_at DESC
  `;

  const runsByAgent = new Map<string, RunRow[]>();
  for (const r of runRows) {
    const list = runsByAgent.get(r.agent_id) || [];
    list.push(r);
    runsByAgent.set(r.agent_id, list);
  }

  console.log(`[WATCHDOG] Found ${runRows.length} heartbeat runs in last 2h`);

  // ── Step 3: Assess and repair ──
  for (const agent of targetAgents) {
    const cfg = TARGETS[agent.name];
    const rt = (agent.runtime_config && typeof agent.runtime_config === "object")
      ? agent.runtime_config as Record<string, unknown> : {};
    const hb = (rt.heartbeat && typeof rt.heartbeat === "object")
      ? rt.heartbeat as Record<string, unknown> : {};

    const hbEnabled = hb.enabled === true || hb.enabled === "true";
    const hbInterval = typeof hb.intervalSec === "number" ? hb.intervalSec : Number(hb.intervalSec ?? 0);
    const badStatus = agent.status === "terminated" || agent.status === "paused" || agent.status === "error" || agent.status === "pending_approval";
    const badInterval = hbEnabled && hbInterval > 0 && hbInterval !== cfg.intervalSec;

    const recentRuns = runsByAgent.get(agent.id) || [];
    const lastSuccess = recentRuns.find(r => r.status === "succeeded");
    const lastRun = recentRuns[0];
    const lastRunAgeMin = lastRun?.started_at
      ? (now.getTime() - new Date(lastRun.started_at).getTime()) / 60000
      : Infinity;

    const needsRepair = !hbEnabled || badStatus || badInterval;

    if (!needsRepair) {
      console.log(`  ✓ ${agent.name}: enabled, status=${agent.status}, interval=${hbInterval}s, last run ${lastRunAgeMin.toFixed(0)}m ago`);
      continue;
    }

    // Build repair
    const repairFields: string[] = [];
    const updates: Record<string, unknown> = {};
    const setClauses: string[] = [];

    // Build new heartbeat object
    const nextHb: Record<string, unknown> = { ...hb };
    if (!hbEnabled) {
      nextHb.enabled = true;
      repairFields.push("heartbeat.enabled=true");
    }
    if (!hbEnabled || hbInterval !== cfg.intervalSec) {
      nextHb.intervalSec = cfg.intervalSec;
      repairFields.push(`heartbeat.intervalSec=${cfg.intervalSec}`);
    }
    // Ensure standard fields
    for (const [k, v] of Object.entries(HEARTBEAT_FIELDS)) {
      if (nextHb[k] === undefined) {
        nextHb[k] = v;
        repairFields.push(`heartbeat.${k}=${v}`);
      }
    }
    nextHb.updatedBy = "paperclip-crew-watchdog";
    nextHb.updatedReason = "Cron watchdog auto-repair";
    nextHb.updatedAt = now.toISOString();

    const nextRt = { ...rt, heartbeat: nextHb };
    setClauses.push(`runtime_config = ${JSON.stringify(JSON.stringify(nextRt))}::jsonb`);

    if (badStatus) {
      setClauses.push(`status = 'idle'`);
      setClauses.push(`paused_at = NULL`);
      setClauses.push(`pause_reason = NULL`);
      repairFields.push("status=idle (was " + agent.status + ")");
    }

    // Set last_heartbeat_at old enough to trigger soon
    const triggerAge = Math.max(cfg.intervalSec + 120, 600); // at least 10 min ago
    const triggerTime = new Date(now.getTime() - triggerAge * 1000);
    setClauses.push(`last_heartbeat_at = ${JSON.stringify(triggerTime.toISOString())}::timestamptz`);
    repairFields.push(`last_heartbeat_at→${triggerTime.toISOString()}`);

    setClauses.push(`updated_at = now()`);

    const setClause = setClauses.join(", ");
    console.log(`  🔧 REPAIR ${agent.name}: ${repairFields.join(", ")}`);
    await sql.unsafe(`UPDATE agents SET ${setClause} WHERE id = '${agent.id}'`);

    results.push({ agent: agent.name, action: "repaired", fields: repairFields });
  }

  // ── Step 4: Check for failing runs and inspect hermes env ──
  let hermesCheckNeeded = false;
  const failingAgents: string[] = [];

  for (const agent of targetAgents) {
    const recentRuns = runsByAgent.get(agent.id) || [];
    const cfg = TARGETS[agent.name];
    const hasRecentSuccess = recentRuns.some(r => {
      if (r.status !== "succeeded") return false;
      if (!r.started_at) return false;
      const ageMin = (now.getTime() - new Date(r.started_at).getTime()) / 60000;
      return ageMin <= cfg.maxLastRunMin;
    });

    if (!hasRecentSuccess) {
      const lastFailed = recentRuns.find(r => r.status === "failed" || r.status === "error" || (r.exit_code !== null && r.exit_code !== 0));
      if (lastFailed) {
        failingAgents.push(agent.name);
        if (agent.name === "Hermes") hermesCheckNeeded = true;
      }
    }
  }

  // ── Step 5: If Hermes runs are failing, check hermes-agent env vars ──
  let envReport: Record<string, string> = {};
  if (hermesCheckNeeded) {
    console.log("\n[Hermes env check]");
    // We can't run railway run from inside this script easily for a different service.
    // We'll check the adapter_config to look for env hints.
    const hermes = targetAgents.find(a => a.name === "Hermes");
    if (hermes) {
      const ac = hermes.adapter_config || {};
      console.log(`  adapter_type: ${hermes.adapter_type}`);
      // For http adapter, check if there's env info in adapter_config
      const acSafe = safeJson(ac);
      console.log(`  adapter_config (safe): ${JSON.stringify(acSafe).slice(0, 500)}`);
    }
    // We'll do the actual railway env check in step 6 via a separate call
  }

  // ── Build report ──
  const report = {
    watchgod_run: now.toISOString(),
    agents_total: agentRows.length,
    agents_targeted: targetAgents.length,
    runs_2h: runRows.length,
    repaired: results,
    agent_states: targetAgents.map(a => {
      const runs = runsByAgent.get(a.id) || [];
      const lastSuccess = runs.find(r => r.status === "succeeded");
      const lastRun = runs[0];
      const cfg = TARGETS[a.name];
      const rt = (a.runtime_config && typeof a.runtime_config === "object")
        ? a.runtime_config as Record<string, unknown> : {};
      const hb = (rt.heartbeat && typeof rt.heartbeat === "object")
        ? rt.heartbeat as Record<string, unknown> : {};
      return {
        name: a.name,
        status: a.status,
        heartbeat_enabled: hb.enabled === true || hb.enabled === "true",
        heartbeat_interval_sec: hb.intervalSec,
        last_run_status: lastRun?.status ?? "none",
        last_run_age_min: lastRun?.started_at
          ? Math.round((now.getTime() - new Date(lastRun.started_at).getTime()) / 60000)
          : null,
        recent_success: runs.some(r => {
          if (r.status !== "succeeded") return false;
          if (!r.started_at) return false;
          return (now.getTime() - new Date(r.started_at).getTime()) / 60000 <= cfg.maxLastRunMin;
        }),
      };
    }),
    failing_agents: failingAgents,
    hermes_check_needed: hermesCheckNeeded,
  };

  console.log("\n=== REPORT ===");
  console.log(JSON.stringify(report, null, 2));

  // Write report for parent to read
  await sql.end();
  return report;
}

main()
  .then(r => {
    // Output a clean summary line
    const repaired = r.repaired.length;
    const failing = r.failing_agents.length;
    const states = r.agent_states;
    const okCount = states.filter(s => s.recent_success).length;
    const totalTargets = states.length;
    console.log(`\n[SUMMARY] Repaired: ${repaired} | OK: ${okCount}/${totalTargets} | Failing: ${failing > 0 ? r.failing_agents.join(", ") : "none"}`);
    process.exit(failing > 0 ? 1 : 0);
  })
  .catch(err => {
    console.error("FATAL:", err);
    process.exit(2);
  });
