import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { sendEmail } from '../services/email';

export const emailRouter = Router();

export const SendEmailSchema = z.object({
  to: z.string().email('Invalid recipient email address'),
  subject: z.string().min(1, 'Subject is required').max(200, 'Subject too long'),
  html: z.string().min(1, 'Email body is required').max(50000, 'Email body too long'),
  from: z.string().optional(),
  replyTo: z.string().email().optional(),
});

/**
 * Agent API key middleware.
 * CLI agents (like Sam) authenticate with the `X-Agent-Key` header.
 * In production this env var must be set on Railway.
 */
function agentAuth(req: Request, res: Response, next: () => void): void {
  const key = req.headers['x-agent-key'] as string | undefined;
  const expected = process.env.AGENT_API_KEY;

  if (!expected) {
    console.error('[Email] AGENT_API_KEY not configured on server');
    res.status(500).json({ error: { code: 'CONFIG_ERROR', message: 'Email service not configured' } });
    return;
  }

  if (!key || key !== expected) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid or missing X-Agent-Key header' } });
    return;
  }

  next();
}

// POST /api/v1/email/send — Agent-accessible email endpoint
emailRouter.post('/send', agentAuth, async (req: Request, res: Response) => {
  const parsed = SendEmailSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request body',
        details: parsed.error.flatten(),
      },
    });
    return;
  }

  const { to, subject, html, from, replyTo } = parsed.data;

  const result = await sendEmail({ to, subject, html, from, replyTo });

  if (!result.success) {
    res.status(500).json({ error: { code: 'SEND_FAILED', message: result.error } });
    return;
  }

  res.json({ data: { messageId: result.messageId }, meta: {} });
});
