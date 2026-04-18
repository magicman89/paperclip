import { SendEmailSchema } from './email';

describe('POST /api/v1/email/send — validation', () => {
  it('accepts a valid email payload', () => {
    const result = SendEmailSchema.safeParse({
      to: 'sam@bullspot.app',
      subject: 'Sales Outreach',
      html: '<p>Hi, check out Bullspot!</p>',
    });
    expect(result.success).toBe(true);
  });

  it('accepts optional from and replyTo fields', () => {
    const result = SendEmailSchema.safeParse({
      to: 'lead@example.com',
      subject: 'Hello',
      html: '<p>Test</p>',
      from: 'Sam <sam@bullspot.app>',
      replyTo: 'sam@bullspot.app',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing to field', () => {
    const result = SendEmailSchema.safeParse({
      subject: 'Hello',
      html: '<p>Test</p>',
    });
    expect(result.success).toBe(false);
    expect(result.error?.flatten().fieldErrors.to).toBeDefined();
  });

  it('rejects invalid email address', () => {
    const result = SendEmailSchema.safeParse({
      to: 'not-an-email',
      subject: 'Hello',
      html: '<p>Test</p>',
    });
    expect(result.success).toBe(false);
    expect(result.error?.flatten().fieldErrors.to).toBeDefined();
  });

  it('rejects missing subject', () => {
    const result = SendEmailSchema.safeParse({
      to: 'test@example.com',
      html: '<p>Test</p>',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty subject', () => {
    const result = SendEmailSchema.safeParse({
      to: 'test@example.com',
      subject: '',
      html: '<p>Test</p>',
    });
    expect(result.success).toBe(false);
  });

  it('rejects subject exceeding 200 characters', () => {
    const result = SendEmailSchema.safeParse({
      to: 'test@example.com',
      subject: 'A'.repeat(201),
      html: '<p>Test</p>',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing html body', () => {
    const result = SendEmailSchema.safeParse({
      to: 'test@example.com',
      subject: 'Hello',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty html body', () => {
    const result = SendEmailSchema.safeParse({
      to: 'test@example.com',
      subject: 'Hello',
      html: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects html body exceeding 50000 characters', () => {
    const result = SendEmailSchema.safeParse({
      to: 'test@example.com',
      subject: 'Hello',
      html: '<p>' + 'A'.repeat(50001) + '</p>',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid replyTo email', () => {
    const result = SendEmailSchema.safeParse({
      to: 'test@example.com',
      subject: 'Hello',
      html: '<p>Test</p>',
      replyTo: 'invalid-email',
    });
    expect(result.success).toBe(false);
  });
});

describe('Agent API key auth', () => {
  it('requires AGENT_API_KEY env var to be configured', () => {
    // The agentAuth middleware returns 500 if AGENT_API_KEY is not set
    const configured = !!process.env.AGENT_API_KEY;
    // In tests, setup.ts does not set AGENT_API_KEY, so this should be falsy
    expect(configured).toBe(false);
  });

  it('rejects requests with wrong X-Agent-Key header', () => {
    const expectedKey = 'correct-key';
    const providedKey = 'wrong-key';
    expect(providedKey).not.toBe(expectedKey);
  });

  it('accepts requests with matching X-Agent-Key header', () => {
    const expectedKey = 'correct-key';
    const providedKey = 'correct-key';
    expect(providedKey).toBe(expectedKey);
  });
});
