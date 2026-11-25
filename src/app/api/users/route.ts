import { and, desc, eq, or, sql } from 'drizzle-orm';
import { getDb, withWriteTransaction } from '@/db';
import { loanRecords, users } from '@/db/schema';
import {
  escapeLikePattern,
  isSqliteUniqueError,
  jsonError,
  jsonSuccess,
  parseJsonBody,
  withApiErrorHandling,
} from '@/lib/api/response';
import { createUserSchema } from '@/lib/api/validators';
import { requireAdmin } from '@/lib/auth/guards';
import { hashPassword } from '@/lib/auth/password';
import { writeAuditLog } from '@/lib/audit/logger';
import { buildUserSearchText, normalizeVietnameseText } from '@/lib/domain/search';

export const GET = withApiErrorHandling(async (req: Request) => {
  const auth = await requireAdmin(req);
  if (auth.errorResponse) return auth.errorResponse;

  const url = new URL(req.url);
  const q = url.searchParams.get('q')?.trim() || '';
  const role = url.searchParams.get('role')?.trim() || '';
  const isActiveParam = url.searchParams.get('isActive')?.trim() || '';
  const page = Math.max(1, Number.parseInt(url.searchParams.get('page') || '1', 10) || 1);
  const pageSize = Math.min(
    100,
    Math.max(1, Number.parseInt(url.searchParams.get('pageSize') || '20', 10) || 20)
  );

  const conditions = [];
  if (role === 'ADMIN' || role === 'TEACHER') {
    conditions.push(eq(users.role, role));
  }
  if (isActiveParam === 'true' || isActiveParam === '1') {
    conditions.push(eq(users.isActive, 1));
  } else if (isActiveParam === 'false' || isActiveParam === '0') {
    conditions.push(eq(users.isActive, 0));
  }
  if (q) {
    const normQ = normalizeVietnameseText(q);
    const pattern = `%${escapeLikePattern(normQ)}%`;
    const searchCond = or(
      sql`${users.searchText} LIKE ${pattern} ESCAPE '\\'`,
      sql`lower(${users.username}) LIKE ${pattern} ESCAPE '\\'`,
      sql`lower(${users.fullName}) LIKE ${pattern} ESCAPE '\\'`
    );
    if (searchCond) conditions.push(searchCond);
  }

  const db = await getDb();
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const activeLoanCounts = await db
    .select({
      teacherId: loanRecords.teacherId,
      count: sql<number>`count(*)`,
    })
    .from(loanRecords)
    .where(eq(loanRecords.status, 'BORROWED'))
    .groupBy(loanRecords.teacherId)
    .all();
  const countMap = new Map(activeLoanCounts.map((c) => [c.teacherId, Number(c.count)]));

  const totalRow = await db
    .select({ count: sql<number>`count(*)` })
    .from(users)
    .where(whereClause)
    .get();
  const total = Number(totalRow?.count ?? 0);

  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      fullName: users.fullName,
      role: users.role,
      phone: users.phone,
      unit: users.unit,
      isActive: users.isActive,
      mustChangePassword: users.mustChangePassword,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    })
    .from(users)
    .where(whereClause)
    .orderBy(desc(users.createdAt), desc(users.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize)
    .all();

  const items = rows.map((r) => ({
    ...r,
    isActive: r.isActive === 1,
    mustChangePassword: r.mustChangePassword === 1,
    activeLoanCount: countMap.get(r.id) ?? 0,
  }));

  return jsonSuccess(items, {
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  });
});

export const POST = withApiErrorHandling(async (req: Request) => {
  const auth = await requireAdmin(req);
  if (auth.errorResponse) return auth.errorResponse;

  const parsedBody = await parseJsonBody(req);
  if (parsedBody.errorResponse) return parsedBody.errorResponse;

  const validated = createUserSchema.safeParse(parsedBody.data);
  if (!validated.success) {
    return jsonError(
      'VALIDATION_ERROR',
      validated.error.issues[0]?.message || 'Thông tin tài khoản không hợp lệ.',
      400,
      validated.error.flatten().fieldErrors
    );
  }

  const db = await getDb();
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, validated.data.username))
    .limit(1)
    .get();

  if (existing) {
    return jsonError(
      'DUPLICATE_USERNAME',
      `Tên đăng nhập "${validated.data.username}" đã tồn tại.`,
      409
    );
  }

  const now = new Date().toISOString();
  try {
    const created = await withWriteTransaction(db, async (tx) => {
      const inserted = await tx
        .insert(users)
        .values({
          username: validated.data.username,
          passwordHash: hashPassword(validated.data.password),
          fullName: validated.data.fullName,
          role: validated.data.role,
          phone: validated.data.phone,
          unit: validated.data.unit,
          isActive: 1,
          mustChangePassword: validated.data.mustChangePassword ? 1 : 0,
          searchText: buildUserSearchText({
            username: validated.data.username,
            fullName: validated.data.fullName,
            phone: validated.data.phone,
            unit: validated.data.unit,
          }),
          createdAt: now,
          updatedAt: now,
        })
        .returning({
          id: users.id,
          username: users.username,
          fullName: users.fullName,
          role: users.role,
          phone: users.phone,
          unit: users.unit,
          isActive: users.isActive,
          mustChangePassword: users.mustChangePassword,
          createdAt: users.createdAt,
          updatedAt: users.updatedAt,
        })
        .get();

      await writeAuditLog(
        {
          actorId: auth.user.id,
          action: 'USER_CREATED',
          targetType: 'USER',
          targetId: inserted.id,
          metadata: {
            username: inserted.username,
            fullName: inserted.fullName,
            role: inserted.role,
            unit: inserted.unit,
          },
        },
        tx
      );

      return inserted;
    });

    return jsonSuccess(
      {
        ...created,
        isActive: created.isActive === 1,
        mustChangePassword: created.mustChangePassword === 1,
        activeLoanCount: 0,
      },
      undefined,
      201
    );
  } catch (err) {
    if (isSqliteUniqueError(err)) {
      return jsonError(
        'DUPLICATE_USERNAME',
        `Tên đăng nhập "${validated.data.username}" đã tồn tại.`,
        409
      );
    }
    throw err;
  }
});
