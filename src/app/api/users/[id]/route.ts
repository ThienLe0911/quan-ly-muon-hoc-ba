import { and, eq, sql } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { getDb, withWriteTransaction } from '@/db';
import { users } from '@/db/schema';
import { jsonError, jsonSuccess, parseJsonBody, withApiErrorHandling } from '@/lib/api/response';
import { updateUserSchema } from '@/lib/api/validators';
import { requireAdmin } from '@/lib/auth/guards';
import { revokeAllUserSessions } from '@/lib/auth/session';
import { writeAuditLog } from '@/lib/audit/logger';
import { buildUserSearchText } from '@/lib/domain/search';

export const PATCH = withApiErrorHandling(
  async (req: NextRequest, context: { params: Promise<{ id: string }> }) => {
    const auth = await requireAdmin(req);
    if (auth.errorResponse) return auth.errorResponse;

    const { id: rawId } = await context.params;
    const userId = /^\d+$/.test(rawId) ? Number.parseInt(rawId, 10) : NaN;
    if (!Number.isFinite(userId) || userId <= 0) {
      return jsonError('INVALID_ID', 'Mã tài khoản không hợp lệ.', 400);
    }

    const parsedBody = await parseJsonBody(req);
    if (parsedBody.errorResponse) return parsedBody.errorResponse;

    const validated = updateUserSchema.safeParse(parsedBody.data);
    if (!validated.success) {
      return jsonError(
        'VALIDATION_ERROR',
        validated.error.issues[0]?.message || 'Dữ liệu cập nhật không hợp lệ.',
        400,
        validated.error.flatten().fieldErrors
      );
    }

    const db = await getDb();
    const now = new Date().toISOString();

    const result = await withWriteTransaction(db, async (tx) => {
      const target = await tx.select().from(users).where(eq(users.id, userId)).limit(1).get();
      if (!target) {
        return { kind: 'NOT_FOUND' as const };
      }

      const nextRole = validated.data.role ?? target.role;
      const nextIsActive =
        validated.data.isActive !== undefined ? (validated.data.isActive ? 1 : 0) : target.isActive;

      if (target.id === auth.user.id && nextIsActive === 0) {
        return {
          kind: 'ERR' as const,
          code: 'CANNOT_LOCK_SELF',
          message: 'Bạn không thể tự khóa tài khoản đang đăng nhập.',
          status: 400,
        };
      }

      if (target.id === auth.user.id && nextRole !== 'ADMIN') {
        return {
          kind: 'ERR' as const,
          code: 'CANNOT_DEMOTE_SELF',
          message: 'Bạn không thể tự hạ quyền quản trị của chính mình.',
          status: 400,
        };
      }

      const wasActiveAdmin = target.role === 'ADMIN' && target.isActive === 1;
      const staysActiveAdmin = nextRole === 'ADMIN' && nextIsActive === 1;
      if (wasActiveAdmin && !staysActiveAdmin) {
        const activeAdmins = await tx
          .select({ count: sql<number>`count(*)` })
          .from(users)
          .where(and(eq(users.role, 'ADMIN'), eq(users.isActive, 1)))
          .get();

        if (Number(activeAdmins?.count ?? 0) <= 1) {
          return {
            kind: 'ERR' as const,
            code: 'LAST_ACTIVE_ADMIN',
            message: 'Không thể khóa hoặc hạ quyền tài khoản Admin hoạt động duy nhất còn lại.',
            status: 409,
          };
        }
      }

      const nextFullName = validated.data.fullName ?? target.fullName;
      const nextPhone = validated.data.phone !== undefined ? validated.data.phone : target.phone;
      const nextUnit = validated.data.unit !== undefined ? validated.data.unit : target.unit;

      const updated = await tx
        .update(users)
        .set({
          fullName: nextFullName,
          phone: nextPhone,
          unit: nextUnit,
          role: nextRole,
          isActive: nextIsActive,
          searchText: buildUserSearchText({
            username: target.username,
            fullName: nextFullName,
            phone: nextPhone,
            unit: nextUnit,
          }),
          updatedAt: now,
        })
        .where(eq(users.id, userId))
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

      const statusChanged = target.isActive !== nextIsActive;
      if (statusChanged && nextIsActive === 0) {
        await revokeAllUserSessions(userId, undefined, tx);
      }

      await writeAuditLog(
        {
          actorId: auth.user.id,
          action: statusChanged ? 'USER_STATUS_CHANGED' : 'USER_UPDATED',
          targetType: 'USER',
          targetId: userId,
          metadata: {
            username: target.username,
            before: {
              fullName: target.fullName,
              phone: target.phone,
              unit: target.unit,
              role: target.role,
              isActive: target.isActive === 1,
            },
            after: {
              fullName: nextFullName,
              phone: nextPhone,
              unit: nextUnit,
              role: nextRole,
              isActive: nextIsActive === 1,
            },
          },
        },
        tx
      );

      return { kind: 'OK' as const, updated };
    });

    if (result.kind === 'NOT_FOUND') {
      return jsonError('USER_NOT_FOUND', 'Không tìm thấy tài khoản.', 404);
    }
    if (result.kind === 'ERR') {
      return jsonError(result.code, result.message, result.status);
    }

    return jsonSuccess({
      ...result.updated,
      isActive: result.updated.isActive === 1,
      mustChangePassword: result.updated.mustChangePassword === 1,
    });
  }
);
