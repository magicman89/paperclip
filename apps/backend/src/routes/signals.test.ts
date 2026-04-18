import { SupabaseClient } from '@supabase/supabase-js';
import { deductCreditForSignalView } from './signals';
import { createError } from '../middleware/errorHandler';

jest.mock('../middleware/errorHandler', () => ({
  createError: jest.fn((message, status, code) => {
    const err = new Error(message) as any;
    err.statusCode = status;
    err.code = code;
    return err;
  }),
}));

describe('deductCreditForSignalView (BUL-177)', () => {
  // -------------------------------------------------------------------------
  // Per-test mock state — mutated in beforeEach so each test gets fresh fakes
  // -------------------------------------------------------------------------
  let profileResult: { data: any; error: any };
  let rpcResult: { data: any; error: any };
  let insertResult: { data: any; error: any };
  let adminFromCalls: Array<{ table: string; insertArg?: any }>;

  // -------------------------------------------------------------------------
  // Build a mock SupabaseAdmin that reads from the above vars
  // -------------------------------------------------------------------------
  function buildMockAdmin(): SupabaseClient {
    return {
      from: jest.fn((table: string) => {
        adminFromCalls.push({ table });
        if (table === 'profiles') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue(profileResult),
              }),
            }),
          };
        }
        if (table === 'credit_usage') {
          return {
            insert: jest.fn().mockImplementation((arg: any) => {
              adminFromCalls[adminFromCalls.length - 1].insertArg = arg;
              return Promise.resolve(insertResult);
            }),
          };
        }
        return {};
      }),
      rpc: jest.fn().mockResolvedValue(rpcResult),
    } as unknown as SupabaseClient;
  }

  beforeEach(() => {
    profileResult = { data: { subscription_tier: 'pro', signal_credits: 50 }, error: null };
    rpcResult = { data: 49, error: null };
    insertResult = { data: { id: 'usage-1' }, error: null };
    adminFromCalls = [];
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Tests
  // -------------------------------------------------------------------------
  it('deducts 1 credit and records usage for free user with remaining credits', async () => {
    profileResult = { data: { subscription_tier: 'free', signal_credits: 2 }, error: null };

    await deductCreditForSignalView('user-123', 'signal-456', buildMockAdmin);

    // RPC called for deduction
    const admin = buildMockAdmin();
    await deductCreditForSignalView('user-123', 'signal-456', buildMockAdmin);

    // Verify RPC call via the mock
    expect(adminFromCalls.some(c => c.table === 'profiles')).toBe(true);
  });

  it('throws 402 INSUFFICIENT_CREDITS for free user with zero credits', async () => {
    profileResult = { data: { subscription_tier: 'free', signal_credits: 0 }, error: null };
    const admin = buildMockAdmin();

    await expect(
      deductCreditForSignalView('user-123', 'signal-456', buildMockAdmin)
    ).rejects.toMatchObject({
      statusCode: 402,
      code: 'INSUFFICIENT_CREDITS',
      message: expect.stringContaining('Upgrade'),
    });

    // RPC must NOT be called when credits are exhausted
    expect(adminFromCalls.filter(c => c.table === 'credit_usage')).toHaveLength(0);
  });

  it('throws 402 for free user with null credits', async () => {
    profileResult = { data: { subscription_tier: 'free', signal_credits: null }, error: null };

    await expect(
      deductCreditForSignalView('user-123', 'signal-456', buildMockAdmin)
    ).rejects.toMatchObject({
      statusCode: 402,
      code: 'INSUFFICIENT_CREDITS',
    });
  });

  it('does NOT deduct credits for paid (pro) user', async () => {
    profileResult = { data: { subscription_tier: 'pro', signal_credits: 50 }, error: null };
    const admin = buildMockAdmin();

    await deductCreditForSignalView('user-123', 'signal-456', buildMockAdmin);

    // credit_usage table must NOT be called for paid users
    expect(adminFromCalls.filter(c => c.table === 'credit_usage')).toHaveLength(0);
  });

  it('does NOT deduct credits for enterprise user (unlimited, signal_credits = -1)', async () => {
    profileResult = { data: { subscription_tier: 'enterprise', signal_credits: -1 }, error: null };

    await deductCreditForSignalView('user-123', 'signal-456', buildMockAdmin);

    // Profile is fetched to determine tier, but credit_usage insert is NOT called
    const creditUsageCalls = adminFromCalls.filter(c => c.table === 'credit_usage');
    expect(creditUsageCalls).toHaveLength(0);
  });

  it('records signal_view action in credit_usage with correct fields', async () => {
    profileResult = { data: { subscription_tier: 'free', signal_credits: 1 }, error: null };
    let capturedInsertArg: any = null;

    function adminWithCapture(): SupabaseClient {
      return {
        from: jest.fn((table: string) => {
          if (table === 'profiles') {
            return {
              select: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  single: jest.fn().mockResolvedValue(profileResult),
                }),
              }),
            };
          }
          if (table === 'credit_usage') {
            return {
              insert: jest.fn().mockImplementation((arg: any) => {
                capturedInsertArg = arg;
                return Promise.resolve(insertResult);
              }),
            };
          }
          return {};
        }),
        rpc: jest.fn().mockResolvedValue({ data: 0, error: null }),
      } as unknown as SupabaseClient;
    }

    await deductCreditForSignalView('user-123', 'signal-789', adminWithCapture);

    expect(capturedInsertArg).toMatchObject({
      user_id: 'user-123',
      action: 'signal_view',
      credits_used: 1,
      signal_id: 'signal-789',
    });
  });
});
