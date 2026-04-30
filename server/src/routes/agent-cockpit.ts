import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { agentCockpitService } from "../services/index.js";
import { assertCompanyAccess } from "./authz.js";

export function agentCockpitRoutes(db: Db) {
  const router = Router();
  const svc = agentCockpitService(db);

  router.get("/companies/:companyId/agent-cockpit", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const overview = await svc.overview(companyId);
    res.json(overview);
  });

  return router;
}
