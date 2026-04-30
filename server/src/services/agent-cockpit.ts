import { and, desc, eq, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { agents, companies, heartbeatRuns, issues } from "@paperclipai/db";
import { notFound } from "../errors.js";

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}

export type AgentCockpitRun = {
  id: string;
  status: string;
  invocationSource: string;
  triggerDetail: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
};

export type AgentCockpitAgent = {
  id: string;
  name: string;
  role: string;
  title: string | null;
  status: string;
  adapterType: string;
  pauseReason: string | null;
  lastHeartbeatAt: string | null;
  openIssues: number;
  blockedIssues: number;
  runningIssues: number;
  latestRun: AgentCockpitRun | null;
};

export type AgentCockpitOverview = {
  companyId: string;
  generatedAt: string;
  agents: AgentCockpitAgent[];
  totals: {
    agents: number;
    activeAgents: number;
    pausedAgents: number;
    errorAgents: number;
    openIssues: number;
    blockedIssues: number;
    runningIssues: number;
    runningRuns: number;
    failedRuns: number;
  };
};

const OPEN_ISSUE_STATUSES = new Set(["backlog", "todo", "in_progress", "in_review", "blocked"]);

export function agentCockpitService(db: Db) {
  return {
    overview: async (companyId: string): Promise<AgentCockpitOverview> => {
      const company = await db
        .select({ id: companies.id })
        .from(companies)
        .where(eq(companies.id, companyId))
        .then((rows) => rows[0] ?? null);

      if (!company) throw notFound("Company not found");

      const [agentRows, issueRows, recentRuns] = await Promise.all([
        db
          .select({
            id: agents.id,
            name: agents.name,
            role: agents.role,
            title: agents.title,
            status: agents.status,
            adapterType: agents.adapterType,
            pauseReason: agents.pauseReason,
            lastHeartbeatAt: agents.lastHeartbeatAt,
          })
          .from(agents)
          .where(eq(agents.companyId, companyId))
          .orderBy(agents.name),
        db
          .select({
            agentId: issues.assigneeAgentId,
            status: issues.status,
            count: sql<number>`count(*)`,
          })
          .from(issues)
          .where(and(eq(issues.companyId, companyId), sql`${issues.hiddenAt} is null`))
          .groupBy(issues.assigneeAgentId, issues.status),
        db
          .select({
            id: heartbeatRuns.id,
            agentId: heartbeatRuns.agentId,
            status: heartbeatRuns.status,
            invocationSource: heartbeatRuns.invocationSource,
            triggerDetail: heartbeatRuns.triggerDetail,
            startedAt: heartbeatRuns.startedAt,
            finishedAt: heartbeatRuns.finishedAt,
            error: heartbeatRuns.error,
            createdAt: heartbeatRuns.createdAt,
          })
          .from(heartbeatRuns)
          .where(eq(heartbeatRuns.companyId, companyId))
          .orderBy(desc(heartbeatRuns.createdAt))
          .limit(500),
      ]);

      const issueCounts = new Map<string, { openIssues: number; blockedIssues: number; runningIssues: number }>();
      for (const row of issueRows) {
        if (!row.agentId) continue;
        const counts = issueCounts.get(row.agentId) ?? { openIssues: 0, blockedIssues: 0, runningIssues: 0 };
        const count = Number(row.count ?? 0);
        if (OPEN_ISSUE_STATUSES.has(row.status)) counts.openIssues += count;
        if (row.status === "blocked") counts.blockedIssues += count;
        if (row.status === "in_progress") counts.runningIssues += count;
        issueCounts.set(row.agentId, counts);
      }

      const latestRunByAgent = new Map<string, AgentCockpitRun>();
      let runningRuns = 0;
      let failedRuns = 0;
      for (const run of recentRuns) {
        if (run.status === "running" || run.status === "queued") runningRuns += 1;
        if (run.status === "failed") failedRuns += 1;
        if (latestRunByAgent.has(run.agentId)) continue;
        latestRunByAgent.set(run.agentId, {
          id: run.id,
          status: run.status,
          invocationSource: run.invocationSource,
          triggerDetail: run.triggerDetail,
          startedAt: toIso(run.startedAt),
          finishedAt: toIso(run.finishedAt),
          error: run.error,
        });
      }

      const mappedAgents = agentRows.map((agent) => {
        const counts = issueCounts.get(agent.id) ?? { openIssues: 0, blockedIssues: 0, runningIssues: 0 };
        return {
          id: agent.id,
          name: agent.name,
          role: agent.role,
          title: agent.title,
          status: agent.status,
          adapterType: agent.adapterType,
          pauseReason: agent.pauseReason,
          lastHeartbeatAt: toIso(agent.lastHeartbeatAt),
          openIssues: counts.openIssues,
          blockedIssues: counts.blockedIssues,
          runningIssues: counts.runningIssues,
          latestRun: latestRunByAgent.get(agent.id) ?? null,
        };
      });

      return {
        companyId,
        generatedAt: new Date().toISOString(),
        agents: mappedAgents,
        totals: {
          agents: mappedAgents.length,
          activeAgents: mappedAgents.filter((agent) => agent.status === "idle" || agent.status === "running").length,
          pausedAgents: mappedAgents.filter((agent) => agent.status === "paused").length,
          errorAgents: mappedAgents.filter((agent) => agent.status === "error").length,
          openIssues: mappedAgents.reduce((sum, agent) => sum + agent.openIssues, 0),
          blockedIssues: mappedAgents.reduce((sum, agent) => sum + agent.blockedIssues, 0),
          runningIssues: mappedAgents.reduce((sum, agent) => sum + agent.runningIssues, 0),
          runningRuns,
          failedRuns,
        },
      };
    },
  };
}
