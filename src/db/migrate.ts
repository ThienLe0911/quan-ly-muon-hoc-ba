import type { Client } from '@libsql/client';
import { MIGRATIONS } from './migrations/registry';
import {
  buildAuditSearchText,
  buildClassNameNorm,
  buildLoanSearchText,
  buildUserSearchText,
} from '@/lib/domain/search';

async function backfillSearchColumns(client: Client): Promise<void> {
  const userRows = await client.execute(
    "SELECT id, username, full_name, phone, unit FROM users WHERE search_text = ''"
  );
  for (const row of userRows.rows) {
    const searchText = buildUserSearchText({
      username: String(row.username ?? ''),
      fullName: String(row.full_name ?? ''),
      phone: row.phone !== null && row.phone !== undefined ? String(row.phone) : null,
      unit: row.unit !== null && row.unit !== undefined ? String(row.unit) : null,
    });
    await client.execute({
      sql: 'UPDATE users SET search_text = ? WHERE id = ?',
      args: [searchText, Number(row.id)],
    });
  }

  const loanRows = await client.execute(
    "SELECT id, student_name, class_name, school_year, teacher_name_snapshot, teacher_unit_snapshot, teacher_phone_snapshot FROM loan_records WHERE search_text = '' OR class_name_norm = ''"
  );
  for (const row of loanRows.rows) {
    const className = String(row.class_name ?? '');
    const classNameNorm = buildClassNameNorm(className);
    const searchText = buildLoanSearchText({
      studentName: String(row.student_name ?? ''),
      className,
      schoolYear: String(row.school_year ?? ''),
      teacherNameSnapshot: String(row.teacher_name_snapshot ?? ''),
      teacherUnitSnapshot:
        row.teacher_unit_snapshot !== null && row.teacher_unit_snapshot !== undefined
          ? String(row.teacher_unit_snapshot)
          : null,
      teacherPhoneSnapshot:
        row.teacher_phone_snapshot !== null && row.teacher_phone_snapshot !== undefined
          ? String(row.teacher_phone_snapshot)
          : null,
    });
    await client.execute({
      sql: 'UPDATE loan_records SET class_name_norm = ?, search_text = ? WHERE id = ?',
      args: [classNameNorm, searchText, Number(row.id)],
    });
  }

  const auditRows = await client.execute(
    "SELECT id, action, target_id, metadata_json FROM audit_logs WHERE search_text = ''"
  );
  for (const row of auditRows.rows) {
    const searchText = buildAuditSearchText({
      action: String(row.action ?? ''),
      targetId: row.target_id !== null && row.target_id !== undefined ? String(row.target_id) : null,
      metadataJson:
        row.metadata_json !== null && row.metadata_json !== undefined
          ? String(row.metadata_json)
          : null,
    });
    await client.execute({
      sql: 'UPDATE audit_logs SET search_text = ? WHERE id = ?',
      args: [searchText, Number(row.id)],
    });
  }
}

export async function runMigrations(client: Client): Promise<string[]> {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `);

  const appliedRes = await client.execute('SELECT name FROM _migrations');
  const applied = new Set(appliedRes.rows.map((r) => String(r.name)));

  const newlyApplied: string[] = [];

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.name)) continue;

    const tx = await client.transaction('write');
    try {
      for (const stmt of migration.statements) {
        await tx.execute(stmt);
      }
      await tx.execute({
        sql: 'INSERT OR IGNORE INTO _migrations (name, applied_at) VALUES (?, ?)',
        args: [migration.name, new Date().toISOString()],
      });
      await tx.commit();
      newlyApplied.push(migration.name);
    } catch (err) {
      try {
        await tx.rollback();
      } catch {
        // Bỏ qua nếu transaction đã đóng
      }
      throw err;
    }

    if (migration.name === '0001_turso_search_and_ratelimit.sql') {
      await backfillSearchColumns(client);
    }
  }

  return newlyApplied;
}

const isDirectExecution =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv[1]?.endsWith('migrate.ts');

if (isDirectExecution) {
  void (async () => {
    const { getLibsqlClient } = await import('./index');
    const client = await getLibsqlClient();
    const applied = await runMigrations(client);
    console.log(
      applied.length > 0
        ? `Đã áp dụng migration: ${applied.join(', ')}`
        : 'Cơ sở dữ liệu đã ở phiên bản migration mới nhất.'
    );
    client.close();
  })();
}
