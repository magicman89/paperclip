import { Router } from "express";

export function emailRoutes() {
  const router = Router();

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const AGENT_KEY = process.env.PAPERCLIP_API_KEY || process.env.X_AGENT_KEY;

  function auth(req: any) {
    const key = req.headers["x-agent-key"] || req.headers["x-api-key"];
    // DEBUG: log what we see
    const envKey = process.env.PAPERCLIP_API_KEY || "(not set)";
    if (!envKey || envKey === "(not set)") {
      console.warn("EMAIL_AUTH: PAPERCLIP_API_KEY not set in env!");
      return false;
    }
    const match = key === envKey;
    if (!match) {
      console.warn(`EMAIL_AUTH: key mismatch. received=${key?.slice(0,8)} expected=${envKey.slice(0,8)}`);
    }
    return match;
  }

  router.post("/send", async (req: any, res: any) => {
    if (!auth(req)) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { to, subject, body, from } = req.body || {};
    if (!to || !subject || !body) {
      res.status(400).json({ error: "Missing required fields: to, subject, body" });
      return;
    }

    if (!RESEND_API_KEY) {
      res.status(500).json({ error: "Email provider not configured" });
      return;
    }

    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: from || "Paperclip <noreply@resend.zeabur.app>",
          to: Array.isArray(to) ? to : [to],
          subject,
          text: body,
        }),
      });

      const data = await response.json() as any;
      if (!response.ok) {
        res.status(response.status).json({ error: data.message || "Failed to send email" });
        return;
      }

      res.json({ id: data.id, success: true });
    } catch (err) {
      res.status(500).json({ error: "Email send failed" });
    }
  });

  return router;
}