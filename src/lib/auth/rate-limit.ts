import { eq, lte, sql } from 'drizzle-orm';
import { getActiveTestDb, getDb } from '@/db';
import { loginRateLimits } from '@/db/schema';
import { getEnv } from '@/lib/env';

const MAX_FAILURES = 5;
export const MAX_USERNAME_FAILURES = 15;
const WINDOW_MS = 15 * 60 * 1000;

export function getClientIp(req: Request): string {
  if (!getEnv().trustProxy) {
    return 'direct';
  }
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0]?.trim() || 'unknown';
  }
  return req.headers.get('x-real-ip')?.trim() || 'local';
}

export function buildLoginRateKey(req: Request, username: string): string {
  return `ip:${getClientIp(req)}|${username.trim().toLowerCase()}`;
}

export function buildUsernameRateKey(username: string): string {
  return `user:${username.trim().toLowerCase()}`;
}

export async function isLoginRateLimited(
  key: string,
  now: number = Date.now(),
  maxFailures: number = MAX_FAILURES
): Promise<boolean> {
  const db = await getDb();
  const entry = await db
    .select()
    .from(loginRateLimits)
    .where(eq(loginRateLimits.key, key))
    .limit(1)
    .get();

  if (!entry) return false;
  if (now >= entry.resetAt) {
    await db.delete(loginRateLimits).where(eq(loginRateLimits.key, key)).run();
    return false;
  }
  return entry.failures >= maxFailures;
}

export async function recordLoginFailure(key: string, now: number = Date.now()): Promise<void> {
  const db = await getDb();
  const nextResetAt = now + WINDOW_MS;

  // Dọn các bản ghi đã hết hạn và tăng bộ đếm bằng 1 câu SQL UPSERT nguyên tử (tránh lost update đa instance)
  await db.delete(loginRateLimits).where(lte(loginRateLimits.resetAt, now)).run();
  await db
    .insert(loginRateLimits)
    .values({ key, failures: 1, resetAt: nextResetAt })
    .onConflictDoUpdate({
      target: loginRateLimits.key,
      set: {
        failures: sql`CASE WHEN ${loginRateLimits.resetAt} <= ${now} THEN 1 ELSE ${loginRateLimits.failures} + 1 END`,
        resetAt: sql`CASE WHEN ${loginRateLimits.resetAt} <= ${now} THEN ${nextResetAt} ELSE ${loginRateLimits.resetAt} END`,
      },
    })
    .run();
}

export async function clearLoginFailures(key: string): Promise<void> {
  const db = await getDb();
  await db.delete(loginRateLimits).where(eq(loginRateLimits.key, key)).run();
}

export async function resetRateLimiterForTests(): Promise<void> {
  const testDb = getActiveTestDb();
  if (!testDb) return;
  try {
    await testDb.delete(loginRateLimits).run();
  } catch {
    // Bỏ qua nếu kết nối test đã bị đóng chủ đích trong bài test lỗi DB
  }
}
