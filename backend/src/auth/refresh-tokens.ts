import { createHash, randomBytes } from 'node:crypto';
import { pool } from '../db/pool.js';
import { isUserRole, type UserRole } from './tokens.js';

export const refreshTokenLifetimeSeconds = 30 * 24 * 60 * 60;

function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** Emite un token de renovación aleatorio (256 bits) y guarda solo su hash. */
export async function issueRefreshToken(userId: string): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  await pool.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, now() + make_interval(secs => $3))`,
    [userId, hashToken(token), refreshTokenLifetimeSeconds]
  );
  return token;
}

export interface RotatedSession {
  userId: string;
  businessId: string;
  role: UserRole;
  refreshToken: string;
}

/**
 * Rota un token de renovación: lo revoca y emite uno nuevo.
 * Si se presenta un token ya revocado (posible robo), se revocan todas las sesiones del usuario.
 */
export async function rotateRefreshToken(token: string): Promise<RotatedSession | null> {
  if (typeof token !== 'string' || token.length < 20 || token.length > 200) return null;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query<{
      id: string; user_id: string; revoked_at: Date | null; expired: boolean; business_id: string; role: string;
    }>(
      `SELECT r.id, r.user_id, r.revoked_at, r.expires_at <= now() AS expired, u.business_id, u.role
       FROM refresh_tokens r JOIN users u ON u.id = r.user_id
       WHERE r.token_hash = $1
       FOR UPDATE OF r`,
      [hashToken(token)]
    );
    const row = result.rows[0];
    if (!row) {
      await client.query('ROLLBACK');
      return null;
    }
    if (row.revoked_at) {
      await client.query('UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [row.user_id]);
      await client.query('COMMIT');
      return null;
    }
    if (row.expired) {
      await client.query('ROLLBACK');
      return null;
    }
    await client.query('UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1', [row.id]);
    const next = randomBytes(32).toString('base64url');
    await client.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, now() + make_interval(secs => $3))`,
      [row.user_id, hashToken(next), refreshTokenLifetimeSeconds]
    );
    await client.query('COMMIT');
    return {
      userId: row.user_id,
      businessId: row.business_id,
      role: isUserRole(row.role) ? row.role : 'staff',
      refreshToken: next
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function revokeRefreshToken(token: string): Promise<void> {
  if (typeof token !== 'string' || token.length < 20 || token.length > 200) return;
  await pool.query('UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL', [hashToken(token)]);
}
