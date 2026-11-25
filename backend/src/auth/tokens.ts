import { errors, SignJWT, jwtVerify } from 'jose';
import { env } from '../config/env.js';

const ISSUER = 'mypes-vinto-api';
const AUDIENCE = 'mypes-vinto-client';
const TOKEN_LIFETIME_SECONDS = 900;
const signingKey = new TextEncoder().encode(env.jwtSecret);

export type UserRole = 'owner' | 'staff';

export interface AuthClaims {
  userId: string;
  businessId: string;
  role: UserRole;
}

export interface AccessTokenInput {
  userId: string;
  businessId: string;
  /** Rol del usuario. Si no se indica, se emite como propietario (compatibilidad). */
  role?: UserRole;
}

export function isUserRole(value: unknown): value is UserRole {
  return value === 'owner' || value === 'staff';
}

export async function createAccessToken(claims: AccessTokenInput): Promise<string> {
  return new SignJWT({ businessId: claims.businessId, role: claims.role ?? 'owner' })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(claims.userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${TOKEN_LIFETIME_SECONDS}s`)
    .sign(signingKey);
}

export async function verifyAccessToken(token: string): Promise<AuthClaims | null> {
  try {
    const { payload } = await jwtVerify(token, signingKey, {
      algorithms: ['HS256'],
      issuer: ISSUER,
      audience: AUDIENCE
    });
    if (!payload.sub || typeof payload.businessId !== 'string') return null;
    // Tokens emitidos antes de incluir el rol se tratan con el menor privilegio.
    const role: UserRole = isUserRole(payload.role) ? payload.role : 'staff';
    return { userId: payload.sub, businessId: payload.businessId, role };
  } catch (error) {
    if (error instanceof errors.JOSEError) return null;
    throw error;
  }
}

export const accessTokenLifetimeSeconds = TOKEN_LIFETIME_SECONDS;
