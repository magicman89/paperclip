import type {} from "express-serve-static-core";

export type PaperclipActor = {
  type: "board" | "agent" | "none";
  userId?: string;
  agentId?: string;
  companyId?: string;
  companyIds?: string[];
  isInstanceAdmin?: boolean;
  keyId?: string;
  runId?: string;
  source?: "local_implicit" | "session" | "board_key" | "agent_key" | "agent_jwt" | "none";
};

declare global {
  namespace Express {
    interface Request {
      actor: PaperclipActor;
    }
  }
}

declare module "express-serve-static-core" {
  interface Request {
    actor: PaperclipActor;
  }
}
