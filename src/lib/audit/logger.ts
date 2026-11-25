import { getDb, type AppDatabase } from '@/db';
import { auditLogs } from '@/db/schema';
import { buildAuditSearchText } from '@/lib/domain/search';

export type AuditAction =
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILED'
  | 'LOGOUT'
  | 'PASSWORD_CHANGED'
  | 'USER_CREATED'
  | 'USER_UPDATED'
  | 'USER_STATUS_CHANGED'
  | 'USER_PASSWORD_RESET'
  | 'LOAN_CREATED'
  | 'LOAN_RETURNED'
  | 'LOAN_CANCELLED'
  | 'SETTINGS_UPDATED';

export type AuditTargetType = 'AUTH' | 'USER' | 'LOAN' | 'SETTING';

export interface AuditLogInput {
  actorId: number | null;
  action: AuditAction;
  targetType: AuditTargetType;
  targetId?: string | number | null;
  metadata?: Record<string, unknown>;
}

export async function writeAuditLog(
  entry: AuditLogInput,
  dbOverride?: AppDatabase
): Promise<void> {
  const db = dbOverride ?? (await getDb());
  const targetId =
    entry.targetId !== undefined && entry.targetId !== null ? String(entry.targetId) : null;
  const metadataJson = entry.metadata ? JSON.stringify(entry.metadata) : null;

  await db
    .insert(auditLogs)
    .values({
      actorId: entry.actorId,
      action: entry.action,
      targetType: entry.targetType,
      targetId,
      metadataJson,
      searchText: buildAuditSearchText({
        action: entry.action,
        targetId,
        metadataJson,
      }),
      createdAt: new Date().toISOString(),
    })
    .run();
}
