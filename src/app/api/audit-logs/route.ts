import { and, desc, eq, or, sql, type SQL } from 'drizzle-orm';
import { getDb } from '@/db';
import { auditLogs, users } from '@/db/schema';
import { escapeLikePattern, jsonSuccess, withApiErrorHandling } from '@/lib/api/response';
import { requireAdmin } from '@/lib/auth/guards';
import { normalizeVietnameseText } from '@/lib/domain/search';

export const GET = withApiErrorHandling(async (req: Request) => {
  const auth = await requireAdmin(req);
  if (auth.errorResponse) return auth.errorResponse;

  const url = new URL(req.url);
  const action = url.searchParams.get('action')?.trim() || '';
  const targetType = url.searchParams.get('targetType')?.trim() || '';
  const actorIdParam = url.searchParams.get('actorId')?.trim() || '';
  const q = url.searchParams.get('q')?.trim() || '';
  const page = Math.max(1, Number.parseInt(url.searchParams.get('page') || '1', 10) || 1);
  const pageSize = Math.min(
    100,
    Math.max(1, Number.parseInt(url.searchParams.get('pageSize') || '20', 10) || 20)
  );

  const conditions: SQL[] = [];
  if (action) conditions.push(eq(auditLogs.action, action));
  if (targetType) conditions.push(eq(auditLogs.targetType, targetType));
  if (actorIdParam && /^\d+$/.test(actorIdParam)) {
    conditions.push(eq(auditLogs.actorId, Number.parseInt(actorIdParam, 10)));
  }

  if (q) {
    const normQ = normalizeVietnameseText(q);
    const pattern = `%${escapeLikePattern(normQ)}%`;
    const searchCond = or(
      sql`${auditLogs.searchText} LIKE ${pattern} ESCAPE '\\'`,
      sql`COALESCE(${users.searchText}, '') LIKE ${pattern} ESCAPE '\\'`
    );
    if (searchCond) conditions.push(searchCond);
  }

  const db = await getDb();
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const totalRow = await db
    .select({ count: sql<number>`count(*)` })
    .from(auditLogs)
    .leftJoin(users, eq(auditLogs.actorId, users.id))
    .where(whereClause)
    .get();
  const total = Number(totalRow?.count ?? 0);

  const rows = await db
    .select({
      id: auditLogs.id,
      actorId: auditLogs.actorId,
      actorName: users.fullName,
      actorUsername: users.username,
      action: auditLogs.action,
      targetType: auditLogs.targetType,
      targetId: auditLogs.targetId,
      metadataJson: auditLogs.metadataJson,
      createdAt: auditLogs.createdAt,
    })
    .from(auditLogs)
    .leftJoin(users, eq(auditLogs.actorId, users.id))
    .where(whereClause)
    .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize)
    .all();

  return jsonSuccess(rows, {
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  });
});
