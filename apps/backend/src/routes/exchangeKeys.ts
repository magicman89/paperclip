import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { getSupabaseUser } from '../utils/supabase';
import { AuthenticatedRequest } from '../middleware/auth';
import { createError } from '../middleware/errorHandler';
import { encrypt, decrypt } from '../utils/encryption';

export const exchangeKeysRouter = Router();

const exchangeKeySchema = z.object({
  exchange: z.enum(['binance', 'coinbase', 'kraken', 'bybit']),
  label: z.string().min(1).max(50).optional(),
  api_key: z.string().min(1),
  api_secret: z.string().min(1),
  passphrase: z.string().optional(), // Coinbase only
});

const exchangeKeyUpdateSchema = z.object({
  label: z.string().min(1).max(50).optional(),
  api_key: z.string().min(1).optional(),
  api_secret: z.string().min(1).optional(),
  passphrase: z.string().optional(),
  is_active: z.boolean().optional(),
});

// POST /api/v1/exchange-keys
exchangeKeysRouter.post('/', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw createError('Not authenticated', 401, 'UNAUTHORIZED');
    }

    const body = exchangeKeySchema.safeParse(req.body);
    if (!body.success) {
      throw createError('Validation failed', 400, 'VALIDATION_ERROR', body.error.flatten());
    }

    const { exchange, label, api_key, api_secret, passphrase } = body.data;

    // Encrypt sensitive data
    const encryptedKey = encrypt(api_key);
    const encryptedSecret = encrypt(api_secret);
    const encryptedPassphrase = passphrase ? encrypt(passphrase) : null;

    const supabase = getSupabaseUser();
    const { data, error } = await supabase
      .from('exchange_keys')
      .insert({
        user_id: req.user.id,
        exchange,
        label,
        api_key_encrypted: JSON.stringify(encryptedKey),
        api_secret_encrypted: JSON.stringify(encryptedSecret),
        passphrase_encrypted: encryptedPassphrase ? JSON.stringify(encryptedPassphrase) : null,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        throw createError('An exchange key with this label already exists.', 409, 'DUPLICATE_KEY');
      }
      throw createError('Failed to store exchange key', 500, 'DATABASE_ERROR');
    }

    // Return metadata only (never return encrypted data)
    res.status(201).json({
      data: {
        id: data.id,
        exchange: data.exchange,
        label: data.label,
        is_active: data.is_active,
        last_used_at: data.last_used_at,
        created_at: data.created_at,
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/exchange-keys
exchangeKeysRouter.get('/', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw createError('Not authenticated', 401, 'UNAUTHORIZED');
    }

    const supabase = getSupabaseUser();
    const { data, error } = await supabase
      .from('exchange_keys')
      .select('id, exchange, label, is_active, last_used_at, created_at')
      .eq('user_id', req.user.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) {
      throw createError('Failed to fetch exchange keys', 500, 'DATABASE_ERROR');
    }

    res.json({ data: data || [] });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/exchange-keys/:id
exchangeKeysRouter.get('/:id', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw createError('Not authenticated', 401, 'UNAUTHORIZED');
    }

    const supabase = getSupabaseUser();
    const { data, error } = await supabase
      .from('exchange_keys')
      .select('id, exchange, label, is_active, last_used_at, created_at, updated_at')
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .is('deleted_at', null)
      .single();

    if (error || !data) {
      throw createError('Exchange key not found', 404, 'NOT_FOUND');
    }

    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/v1/exchange-keys/:id
exchangeKeysRouter.patch('/:id', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw createError('Not authenticated', 401, 'UNAUTHORIZED');
    }

    const body = exchangeKeyUpdateSchema.safeParse(req.body);
    if (!body.success) {
      throw createError('Validation failed', 400, 'VALIDATION_ERROR', body.error.flatten());
    }

    const updates: Record<string, unknown> = {};

    // Encrypt new credentials if provided
    if (body.data.api_key) {
      updates.api_key_encrypted = JSON.stringify(encrypt(body.data.api_key));
    }
    if (body.data.api_secret) {
      updates.api_secret_encrypted = JSON.stringify(encrypt(body.data.api_secret));
    }
    if (body.data.passphrase !== undefined) {
      updates.passphrase_encrypted = body.data.passphrase
        ? JSON.stringify(encrypt(body.data.passphrase))
        : null;
    }
    if (body.data.label !== undefined) updates.label = body.data.label;
    if (body.data.is_active !== undefined) updates.is_active = body.data.is_active;
    updates.updated_at = new Date().toISOString();

    const supabase = getSupabaseUser();
    const { data, error } = await supabase
      .from('exchange_keys')
      .update(updates)
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .eq('deleted_at', null)  // prevent updating deleted keys
      .select('id, exchange, label, is_active, last_used_at, updated_at, created_at')
      .single();

    if (error || !data) {
      throw createError('Exchange key not found', 404, 'NOT_FOUND');
    }

    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/exchange-keys/:id
exchangeKeysRouter.delete('/:id', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw createError('Not authenticated', 401, 'UNAUTHORIZED');
    }

    const supabase = getSupabaseUser();

    // Soft delete
    const { error } = await supabase
      .from('exchange_keys')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .eq('user_id', req.user.id);

    if (error) {
      throw createError('Failed to delete exchange key', 500, 'DATABASE_ERROR');
    }

    res.json({ data: { message: 'Exchange key deleted successfully' } });
  } catch (err) {
    next(err);
  }
});
