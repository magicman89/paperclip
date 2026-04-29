import { createDb } from "./src/client.ts";
import { agents, heartbeatRuns } from "./src/schema/index.ts";
import { desc, eq, and, gte, inArray } from "drizzle-orm";

const TARGET_NAMES = [
  "Hermes",
  "Chief of Staff",
  "Dev Operator",
  "Server Mechanic",
  "Obsidian Librarian",
  "Revenue Follow-Up Agent",
  "Bullbot Market Scout",
  "Content Producer",
];

function safeJsonParse(s: any): any {
  if (typeof s === "string") { try { return JSON.parse(s); } catch { return null; } }
  if (s && typeof s === "object" && !Array.isArray(s)) return s;
  return null;
}

function redactSecrets(s: string): string {
  return s
    .replace(/https:\/\/[a-zA-Z0-9.-]*trycloudflare\.com[^\s"']*/g, '[REDACTED_TRYCLOUDFLARE_URL]')
    .replace(/(DATABASE_URL|OPENAI_API_KEY|ANTHROPIC_API_KEY|GITHUB_TOKEN|BETTER_AUTH_SECRET|PAPERCLIP_AGENT_JWT_SECRET)=[^\s]+/gi, '$1=[REDACTED]')
    .replace(/Bearer\s+[A-Za-z0-9._\-]+/g, 'Bearer [REDACTED]')
    .replace(/Authorization:\s*[^\s]+/gi, 'Authorization: [REDACTED]')
    .replace(/sk-[A-Za-z0-9]+/g, 'sk-[REDACTED]')
    .replace(/api-key[=:]\s*[^\s,}]+/gi, 'api-key=[REDACTED]');
}

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL missing");
  const db = createDb(dbUrl);

  const allAgents = await db.select().from(agents)
    .where(inArray(agents.name, TARGET_NAMES));

  const results: any[] = [];

  for (const agent of allAgents) {
    const hbParsed = safeJsonParse((agent.runtimeConfig as any)?.heartbeat);

    const hb = {
      enabled: hbParsed?.enabled === true,
      intervalSec: hbParsed?.intervalSec ?? null,
      cooldownSec: hbParsed?.cooldownSec ?? null,
      wakeOnDemand: hbParsed?.wakeOnDemand === true ? true : (hbParsed?.wakeOnDemand === false ? false : null),
      maxConcurrentRuns: hbParsed?.maxConcurrentRuns ?? null,
      durableBridge: hbParsed?.durableBridge ?? null,
      alwaysOnMode: hbParsed?.alwaysOnMode === true ? true : (hbParsed?.alwaysOnMode === false ? false : null),
      lastHeartbeatAt: agent.lastHeartbeatAt ? new Date(agent.lastHeartbeatAt).toISOString() : null,
      hbType: typeof (agent.runtimeConfig as any)?.heartbeat,
    };

    const cutoff = new Date(Date.now() - 90 * 60 * 1000);
    const runs = await db.select({
      status: heartbeatRuns.status,
      startedAt: heartbeatRuns.startedAt,
      finishedAt: heartbeatRuns.finishedAt,
      error: heartbeatRuns.error,
      errorCode: heartbeatRuns.errorCode,
      exitCode: heartbeatRuns.exitCode,
    }).from(heartbeatRuns)
      .where(and(
        eq(heartbeatRuns.agentId, agent.id),
        gte(heartbeatRuns.createdAt, cutoff)
      ))
      .orderBy(desc(heartbeatRuns.createdAt))
      .limit(5);

    results.push({
      id: agent.id,
      name: agent.name,
      status: agent.status,
      pausedAt: agent.pausedAt ? new Date(agent.pausedAt).toISOString() : null,
      heartbeat: hb,
      recentRuns: runs.map(r => ({
        status: r.status,
        startedAt: r.startedAt ? new Date(r.startedAt).toISOString() : null,
        finishedAt: r.finishedAt ? new Date(r.finishedAt).toISOString() : null,
        error: r.error ? redactSecrets(r.error) : null,
        errorCode: r.errorCode,
        exitCode: r.exitCode,
      })),
    });
  }

  const problems = allAgents.filter(a =>
    a.status !== "idle" ||
    (a.runtimeConfig as any)?.heartbeat?.enabled !== true
  );

  const summary = {
    totalFound: allAgents.length,
    missing: TARGET_NAMES.filter(n => !allAgents.some(a => a.name === n)),
    problems: problems.map(a => ({
      id: a.id,
      name: a.name,
      status: a.status,
      hbEnabled: (a.runtimeConfig as any)?.heartbeat?.enabled,
      hbType: typeof (a.runtimeConfig as any)?.heartbeat,
      pausedAt: a.pausedAt ? new Date(a.pausedAt).toISOString() : null,
    })),
    agents: results,
  };

  console.log(JSON.stringify(summary, null, 2));
  process.exit(0);
}

main().catch(err => {
  console.error(JSON.stringify({ error: "WATCHDOG_QUERY_ERROR", message: err.message || String(err) }));
  process.exit(1);
});
