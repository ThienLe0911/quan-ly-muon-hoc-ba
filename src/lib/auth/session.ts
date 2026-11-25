import { createHash, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import type { NextResponse } from 'next/server';
import { and, eq, gt, ne } from 'drizzle-orm';
import { getDb, type AppDatabase } from '@/db';
import { sessions, users } from '@/db/schema';
import { getEnv } from '@/lib/env';

export const SESSION_COOKIE_NAME = 'hb_session';

export interface AuthenticatedUser {
  id: number;
  username: string;
  fullName: string;
  role: 'ADMIN' | 'TEACHER';
  phone: string | null;
  unit: string | null;
  isActive: boolean;
  mustChangePassword: boolean;
}

export function hashSessionToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

export function parseCookieHeader(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    if (key === name) {
      const rawVal = part.slice(idx + 1).trim();
      if (!rawVal) return null;
      try {
        const decoded = decodeURIComponent(rawVal);
        return /^[a-f0-9]{64}$/i.test(decoded) ? decoded : null;
      } catch {
        return null;
      }
    }
  }
  return null;
}

export async function getSessionTokenFromRequest(req?: Request): Promise<string | null> {
  if (req) {
    return parseCookieHeader(req.headers.get('cookie'), SESSION_COOKIE_NAME);
  }
  const cookieStore = await cookies();
  const value = cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;
  if (!value) return null;
  return /^[a-f0-9]{64}$/i.test(value) ? value : null;
}

export async function createSession(
  userId: number
): Promise<{ rawToken: string; expiresAt: Date }> {
  const db = await getDb();
  const env = getEnv();
  const rawToken = randomBytes(32).toString('hex');
  const tokenHash = hashSessionToken(rawToken);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + env.sessionTtlDays * 86_400_000);

  await db
    .insert(sessions)
    .values({
      id: tokenHash,
      userId,
      expiresAt: expiresAt.toISOString(),
      createdAt: now.toISOString(),
    })
    .run();

  return { rawToken, expiresAt };
}

export function setSessionCookie(
  response: NextResponse,
  rawToken: string,
  expiresAt: Date
): void {
  const env = getEnv();
  response.cookies.set(SESSION_COOKIE_NAME, rawToken, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: env.authCookieSecure,
    expires: expiresAt,
  });
}

export function clearSessionCookie(response: NextResponse): void {
  const env = getEnv();
  response.cookies.set(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: env.authCookieSecure,
    maxAge: 0,
  });
}

export async function revokeSessionByToken(
  rawToken: string,
  dbOverride?: AppDatabase
): Promise<void> {
  const db = dbOverride ?? (await getDb());
  const tokenHash = hashSessionToken(rawToken);
  await db.delete(sessions).where(eq(sessions.id, tokenHash)).run();
}

export async function revokeAllUserSessions(
  userId: number,
  exceptRawToken?: string,
  dbOverride?: AppDatabase
): Promise<void> {
  const db = dbOverride ?? (await getDb());
  if (!exceptRawToken) {
    await db.delete(sessions).where(eq(sessions.userId, userId)).run();
    return;
  }
  const keepHash = hashSessionToken(exceptRawToken);
  await db
    .delete(sessions)
    .where(and(eq(sessions.userId, userId), ne(sessions.id, keepHash)))
    .run();
}

export async function getSessionUser(req?: Request): Promise<AuthenticatedUser | null> {
  const rawToken = await getSessionTokenFromRequest(req);
  if (!rawToken) return null;

  const db = await getDb();
  const tokenHash = hashSessionToken(rawToken);
  const nowIso = new Date().toISOString();

  const row = await db
    .select({
      id: users.id,
      username: users.username,
      fullName: users.fullName,
      role: users.role,
      phone: users.phone,
      unit: users.unit,
      isActive: users.isActive,
      mustChangePassword: users.mustChangePassword,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.id, tokenHash), gt(sessions.expiresAt, nowIso)))
    .limit(1)
    .get();

  if (!row || row.isActive !== 1) {
    return null;
  }

  return {
    id: row.id,
    username: row.username,
    fullName: row.fullName,
    role: row.role,
    phone: row.phone,
    unit: row.unit,
    isActive: row.isActive === 1,
    mustChangePassword: row.mustChangePassword === 1,
  };
}
