import fs from 'node:fs';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { createDbConnection, type AppDatabase } from './index';
import { users } from './schema';
import { getEnv } from '@/lib/env';
import { hashPassword } from '@/lib/auth/password';
import { writeAuditLog } from '@/lib/audit/logger';
import { cleanDisplayText } from '@/lib/domain/record-identity';
import { buildUserSearchText } from '@/lib/domain/search';

export interface TeacherImportInput {
  fullName: string;
  phone: string;
  unit?: string | null;
  role?: 'ADMIN' | 'TEACHER';
}

export interface ImportSummary {
  totalInput: number;
  created: number;
  skippedExisting: number;
  invalid: Array<{ index: number; reason: string }>;
}

function normalizePhone(raw: string): string {
  return raw.replace(/[\s.-]+/g, '').trim();
}

export async function importTeachers(
  db: AppDatabase,
  records: TeacherImportInput[],
  options: {
    defaultPassword: string;
    mustChangePassword: boolean;
  }
): Promise<ImportSummary> {
  const summary: ImportSummary = {
    totalInput: records.length,
    created: 0,
    skippedExisting: 0,
    invalid: [],
  };

  const now = new Date().toISOString();

  for (let idx = 0; idx < records.length; idx++) {
    const item = records[idx];
    const fullName = cleanDisplayText(item.fullName || '');
    const phone = normalizePhone(item.phone || '');
    const unit = item.unit ? cleanDisplayText(item.unit) : null;
    const role = item.role === 'ADMIN' ? 'ADMIN' : 'TEACHER';

    if (fullName.length < 2 || fullName.length > 100) {
      summary.invalid.push({ index: idx + 1, reason: 'Họ và tên không hợp lệ.' });
      continue;
    }

    if (!/^[0-9]{8,20}$/.test(phone)) {
      summary.invalid.push({
        index: idx + 1,
        reason: `Số điện thoại không hợp lệ cho "${fullName}".`,
      });
      continue;
    }

    const username = phone.toLowerCase();
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, username))
      .limit(1)
      .get();

    if (existing) {
      summary.skippedExisting += 1;
      continue;
    }

    const inserted = await db
      .insert(users)
      .values({
        username,
        passwordHash: hashPassword(options.defaultPassword),
        fullName,
        role,
        phone,
        unit,
        isActive: 1,
        mustChangePassword: options.mustChangePassword ? 1 : 0,
        searchText: buildUserSearchText({ username, fullName, phone, unit }),
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: users.id })
      .get();

    await writeAuditLog(
      {
        actorId: null,
        action: 'USER_CREATED',
        targetType: 'USER',
        targetId: inserted.id,
        metadata: {
          username,
          fullName,
          role,
          unit,
          source: 'import-teachers-cli',
        },
      },
      db
    );

    summary.created += 1;
  }

  return summary;
}

function parseCliArgs(argv: string[]): {
  filePath: string;
  password: string;
  mustChangePassword: boolean;
} {
  let filePath = 'data/teachers-import.json';
  let password = process.env.IMPORT_TEACHER_PASSWORD?.trim() || 'password@123';
  let mustChangePassword = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--file' && argv[i + 1]) {
      filePath = argv[++i];
    } else if (arg === '--password' && argv[i + 1]) {
      password = argv[++i];
    } else if (arg === '--must-change-password') {
      mustChangePassword = true;
    } else if (arg === '--no-must-change-password') {
      mustChangePassword = false;
    }
  }

  return { filePath, password, mustChangePassword };
}

const isDirectExecution =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv[1]?.endsWith('import-teachers.ts');

if (isDirectExecution) {
  void (async () => {
    const { filePath, password, mustChangePassword } = parseCliArgs(process.argv.slice(2));
    const resolvedFile = path.resolve(process.cwd(), filePath);

    if (!fs.existsSync(resolvedFile)) {
      console.error(`Không tìm thấy file danh sách giáo viên: ${resolvedFile}`);
      process.exit(1);
    }

    const raw = fs.readFileSync(resolvedFile, 'utf8');
    const parsed = JSON.parse(raw) as TeacherImportInput[];
    if (!Array.isArray(parsed)) {
      console.error('File JSON phải là một mảng danh sách giáo viên.');
      process.exit(1);
    }

    const env = getEnv();
    const isRemoteTurso = /^(libsql|https?|wss?):/i.test(env.tursoDatabaseUrl);
    console.log(
      `Đang kết nối cơ sở dữ liệu (${isRemoteTurso ? 'Turso Cloud' : 'SQLite cục bộ'})...`
    );

    const conn = await createDbConnection(env.tursoDatabaseUrl, env.tursoAuthToken);
    try {
      const result = await importTeachers(conn.db, parsed, {
        defaultPassword: password,
        mustChangePassword,
      });

      console.log('--- KẾT QUẢ IMPORT TÀI KHOẢN GIÁO VIÊN ---');
      console.log(`Tổng số dòng đầu vào : ${result.totalInput}`);
      console.log(`Đã tạo mới           : ${result.created}`);
      console.log(`Bỏ qua (đã tồn tại)  : ${result.skippedExisting}`);
      console.log(`Lỗi định dạng        : ${result.invalid.length}`);
      if (result.invalid.length > 0) {
        for (const err of result.invalid) {
          console.error(`  - Dòng ${err.index}: ${err.reason}`);
        }
        process.exitCode = 1;
      }
    } finally {
      conn.client.close();
    }
  })();
}
