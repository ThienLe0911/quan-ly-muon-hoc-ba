import { getDb, withWriteTransaction } from '@/db';
import { systemSettings } from '@/db/schema';
import { jsonError, jsonSuccess, parseJsonBody, withApiErrorHandling } from '@/lib/api/response';
import { updateSettingsSchema } from '@/lib/api/validators';
import { requireAdmin, requireAuth } from '@/lib/auth/guards';
import { writeAuditLog } from '@/lib/audit/logger';
import { readLoanSettings } from '@/lib/settings';

export const GET = withApiErrorHandling(async (req: Request) => {
  const auth = await requireAuth(req);
  if (auth.errorResponse) return auth.errorResponse;

  const settings = await readLoanSettings();
  return jsonSuccess(settings);
});

export const PATCH = withApiErrorHandling(async (req: Request) => {
  const auth = await requireAdmin(req);
  if (auth.errorResponse) return auth.errorResponse;

  const parsedBody = await parseJsonBody(req);
  if (parsedBody.errorResponse) return parsedBody.errorResponse;

  const validated = updateSettingsSchema.safeParse(parsedBody.data);
  if (!validated.success) {
    return jsonError(
      'VALIDATION_ERROR',
      validated.error.issues[0]?.message || 'Cấu hình hạn mượn không hợp lệ.',
      400,
      validated.error.flatten().fieldErrors
    );
  }

  const db = await getDb();
  const now = new Date().toISOString();

  await withWriteTransaction(db, async (tx) => {
    const before = await readLoanSettings(tx);

    await tx
      .insert(systemSettings)
      .values({
        key: 'default_loan_days',
        value: String(validated.data.defaultLoanDays),
        updatedAt: now,
        updatedByAdminId: auth.user.id,
      })
      .onConflictDoUpdate({
        target: systemSettings.key,
        set: {
          value: String(validated.data.defaultLoanDays),
          updatedAt: now,
          updatedByAdminId: auth.user.id,
        },
      })
      .run();

    await tx
      .insert(systemSettings)
      .values({
        key: 'max_loan_days',
        value: String(validated.data.maxLoanDays),
        updatedAt: now,
        updatedByAdminId: auth.user.id,
      })
      .onConflictDoUpdate({
        target: systemSettings.key,
        set: {
          value: String(validated.data.maxLoanDays),
          updatedAt: now,
          updatedByAdminId: auth.user.id,
        },
      })
      .run();

    await writeAuditLog(
      {
        actorId: auth.user.id,
        action: 'SETTINGS_UPDATED',
        targetType: 'SETTING',
        targetId: 'loan_days',
        metadata: {
          before,
          after: validated.data,
        },
      },
      tx
    );
  });

  return jsonSuccess(validated.data);
});
