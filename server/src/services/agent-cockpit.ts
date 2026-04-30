import { and, desc, eq, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { agents, companies, heartbeatRuns, issues } from "@paperclipai/db";
import { notFound } from "../errors.js";

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}

function hasConcreteCloseout(resultJson: Record<string, unknown> | null | undefined): boolean {
  return resultJson?.concreteCloseout === true;
}

export type AgentCockpitRun = {
  id: string;
  agentId: string;
  agentName: string | null;
  status: string;
  invocationSource: string;
  triggerDetail: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string | null;
  error: string | null;
  exitCode: number | null;
  concreteCloseout: boolean;
  summary: string | null;
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

export type AgentCockpitIssue = {
  id: string;
  identifier: string | null;
  title: string;
  status: string;
  priority: string;
  assigneeAgentId: string | null;
  assigneeAgentName: string | null;
  updatedAt: string | null;
  createdAt: string | null;
};

export type AgentCockpitOverview = {
  company: {
    id: string;
    name: string;
    status: string;
    issuePrefix: string;
  };
  companyId: string;
  generatedAt: string;
  recentWindowHours: number;
  agents: AgentCockpitAgent[];
  issueCounts: Array<{ status: string; count: number }>;
  runCounts: Array<{ status: string; count: number }>;
  blockedIssues: AgentCockpitIssue[];
  staleInProgressIssues: AgentCockpitIssue[];
  latestRuns: AgentCockpitRun[];
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
    concreteCloseouts: number;
    recentRuns: number;
    staleInProgressIssues: number;
  };
};

const OPEN_ISSUE_STATUSES = new Set(["backlog", "todo", "in_progress", "in_review", "blocked"]);
const RECENT_WINDOW_HOURS = 24;

export function agentCockpitService(db: Db) {
  return {
    overview: async (companyId: string): Promise<AgentCockpitOverview> => {
      const company = await db
        .select({
          id: companies.id,
          name: companies.name,
          status: companies.status,
          issuePrefix: companies.issuePrefix,
        })
        .from(companies)
        .where(eq(companies.id, companyId))
        .then((rows) => rows[0] ?? null);

      if (!company) throw notFound("Company not found");

      const [agentRows, issueRows, recentRuns, blockedIssueRows, staleIssueRows] = await Promise.all([
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
            createdAt: heartbeatRuns.createdAt,
            error: heartbeatRuns.error,
            exitCode: heartbeatRuns.exitCode,
            resultJson: heartbeatRuns.resultJson,
          })
          .from(heartbeatRuns)
          .where(and(eq(heartbeatRuns.companyId, companyId), sql`${heartbeatRuns.createdAt} > now() - interval '24 hours'`))
          .orderBy(desc(heartbeatRuns.createdAt))
          .limit(500),
        db
          .select({
            id: issues.id,
            identifier: issues.identifier,
            title: issues.title,
            status: issues.status,
            priority: issues.priority,
            assigneeAgentId: issues.assigneeAgentId,
            updatedAt: issues.updatedAt,
            createdAt: issues.createdAt,
          })
          .from(issues)
          .where(and(eq(issues.companyId, companyId), eq(issues.status, "blocked"), sql`${issues.hiddenAt} is null`))
          .orderBy(desc(issues.updatedAt))
          .limit(10),
        db
          .select({
            id: issues.id,
            identifier: issues.identifier,
            title: issues.title,
            status: issues.status,
            priority: issues.priority,
            assigneeAgentId: issues.assigneeAgentId,
            updatedAt: issues.updatedAt,
            createdAt: issues.createdAt,
          })
          .from(issues)
          .where(
            and(
              eq(issues.companyId, companyId),
              eq(issues.status, "in_progress"),
              sql`${issues.hiddenAt} is null`,
              sql`${issues.updatedAt} < now() - interval '2 hours'`,
            ),
          )
          .orderBy(issues.updatedAt)
          .limit(10),
      ]);

      const agentNameById = new Map(agentRows.map((agent) => [agent.id, agent.name]));
      const issueCounts = new Map<string, { openIssues: number; blockedIssues: number; runningIssues: number }>();
      const issueCountsByStatus = new Map<string, number>();
      for (const row of issueRows) {
        const count = Number(row.count ?? 0);
        issueCountsByStatus.set(row.status, (issueCountsByStatus.get(row.status) ?? 0) + count);
        if (!row.agentId) continue;
        const counts = issueCounts.get(row.agentId) ?? { openIssues: 0, blockedIssues: 0, runningIssues: 0 };
        if (OPEN_ISSUE_STATUSES.has(row.status)) counts.openIssues += count;
        if (row.status === "blocked") counts.blockedIssues += count;
        if (row.status === "in_progress") counts.runningIssues += count;
        issueCounts.set(row.agentId, counts);
      }

      const runCountsByStatus = new Map<string, number>();
      const latestRunByAgent = new Map<string, AgentCockpitRun>();
      let runningRuns = 0;
      let failedRuns = 0;
      let concreteCloseouts = 0;
      const mappedRuns = recentRuns.map((run) => {
        runCountsByStatus.set(run.status, (runCountsByStatus.get(run.status) ?? 0) + 1);
        if (run.status === "running" || run.status === "queued") runningRuns += 1;
        if (run.status === "failed") failedRuns += 1;
        if (hasConcreteCloseout(run.resultJson)) concreteCloseouts += 1;
        const resultJson = run.resultJson as Record<string, unknown> | null | undefined;
        const mapped: AgentCockpitRun = {
          id: run.id,
          agentId: run.agentId,
          agentName: agentNameById.get(run.agentId) ?? null,
          status: run.status,
          invocationSource: run.invocationSource,
          triggerDetail: run.triggerDetail,
          startedAt: toIso(run.startedAt),
          finishedAt: toIso(run.finishedAt),
          createdAt: toIso(run.createdAt),
          error: run.error,
          exitCode: run.exitCode,
          concreteCloseout: hasConcreteCloseout(resultJson),
          summary: typeof resultJson?.summary === "string" ? resultJson.summary : null,
        };
        if (!latestRunByAgent.has(run.agentId)) latestRunByAgent.set(run.agentId, mapped);
        return mapped;
      });

      const mapIssue = (issue: (typeof blockedIssueRows)[number]): AgentCockpitIssue => ({
        id: issue.id,
        identifier: issue.identifier,
        title: issue.title,
        status: issue.status,
        priority: issue.priority,
        assigneeAgentId: issue.assigneeAgentId,
        assigneeAgentName: issue.assigneeAgentId ? agentNameById.get(issue.assigneeAgentId) ?? null : null,
        updatedAt: toIso(issue.updatedAt),
        createdAt: toIso(issue.createdAt),
      });

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

      const blockedIssues = blockedIssueRows.map(mapIssue);
      const staleInProgressIssues = staleIssueRows.map(mapIssue);
      const totalOpenIssues = Array.from(issueCountsByStatus.entries()).reduce(
        (sum, [status, count]) => sum + (OPEN_ISSUE_STATUSES.has(status) ? count : 0),
        0,
      );

      return {
        company,
        companyId,
        generatedAt: new Date().toISOString(),
        recentWindowHours: RECENT_WINDOW_HOURS,
        agents: mappedAgents,
        issueCounts: Array.from(issueCountsByStatus.entries()).map(([status, count]) => ({ status, count })),
        runCounts: Array.from(runCountsByStatus.entries()).map(([status, count]) => ({ status, count })),
        blockedIssues,
        staleInProgressIssues,
        latestRuns: mappedRuns.slice(0, 10),
        totals: {
          agents: mappedAgents.length,
          activeAgents: mappedAgents.filter((agent) => agent.status === "idle" || agent.status === "running").length,
          pausedAgents: mappedAgents.filter((agent) => agent.status === "paused").length,
          errorAgents: mappedAgents.filter((agent) => agent.status === "error").length,
          openIssues: totalOpenIssues,
          blockedIssues: mappedAgents.reduce((sum, agent) => sum + agent.blockedIssues, 0),
          runningIssues: mappedAgents.reduce((sum, agent) => sum + agent.runningIssues, 0),
          runningRuns,
          failedRuns,
          concreteCloseouts,
          recentRuns: recentRuns.length,
          staleInProgressIssues: staleInProgressIssues.length,
        },
      };
    },
  };
}
