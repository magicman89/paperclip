import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { errorHandler } from "../middleware/index.js";
import { agentCockpitRoutes } from "../routes/agent-cockpit.js";

const mockAgentCockpitService = vi.hoisted(() => ({
  overview: vi.fn(),
}));

vi.mock("../services/index.js", () => ({
  agentCockpitService: vi.fn(() => mockAgentCockpitService),
}));

function createApp(actor: any) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.actor = actor;
    next();
  });
  app.use("/api", agentCockpitRoutes({} as any));
  app.use(errorHandler);
  return app;
}

describe("agent cockpit routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAgentCockpitService.overview.mockResolvedValue({
      companyId: "company-1",
      generatedAt: "2026-04-29T00:00:00.000Z",
      agents: [
        {
          id: "agent-1",
          name: "Final Boss",
          role: "ceo",
          title: "Coordinator",
          status: "idle",
          adapterType: "codex_local",
          lastHeartbeatAt: "2026-04-29T00:00:00.000Z",
          openIssues: 2,
          blockedIssues: 1,
          runningIssues: 1,
          latestRun: {
            id: "run-1",
            status: "running",
            invocationSource: "on_demand",
            triggerDetail: "manual wake",
            startedAt: "2026-04-29T00:01:00.000Z",
            finishedAt: null,
            error: null,
          },
        },
      ],
      totals: {
        agents: 1,
        activeAgents: 1,
        pausedAgents: 0,
        errorAgents: 0,
        openIssues: 2,
        blockedIssues: 1,
        runningIssues: 1,
        runningRuns: 1,
        failedRuns: 0,
      },
    });
  });

  it("returns a read-only agent cockpit overview for a company", async () => {
    const app = createApp({
      type: "board",
      userId: "local-board",
      source: "local_implicit",
      isInstanceAdmin: true,
    });

    const res = await request(app).get("/api/companies/company-1/agent-cockpit");

    expect(res.status).toBe(200);
    expect(mockAgentCockpitService.overview).toHaveBeenCalledWith("company-1");
    expect(res.body.totals.runningRuns).toBe(1);
    expect(res.body.agents[0].latestRun.status).toBe("running");
  });

  it("rejects actors without company access", async () => {
    const app = createApp({
      type: "agent",
      agentId: "agent-2",
      companyId: "company-2",
    });

    const res = await request(app).get("/api/companies/company-1/agent-cockpit");

    expect(res.status).toBe(403);
    expect(mockAgentCockpitService.overview).not.toHaveBeenCalled();
  });
});
