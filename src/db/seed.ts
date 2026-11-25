import { eq } from 'drizzle-orm';
import type { AppDatabase } from './index';
import { systemSettings, users } from './schema';
import { getEnv } from '@/lib/env';
import { hashPassword } from '@/lib/auth/password';
import { buildUserSearchText } from '@/lib/domain/search';

export interface SeedResult {
  adminCreated: boolean;
  adminUsername: string;
}

export async function seedDatabase(db: AppDatabase): Promise<SeedResult> {
  const now = new Date().toISOString();
  const env = getEnv();

  await db
    .insert(systemSettings)
    .values([
      { key: 'default_loan_days', value: '7', updatedAt: now },
      { key: 'max_loan_days', value: '30', updatedAt: now },
    ])
    .onConflictDoNothing()
    .run();

  const existingAdmin = await db
    .select({ id: users.id, username: users.username })
    .from(users)
    .where(eq(users.role, 'ADMIN'))
    .limit(1)
    .get();

  if (existingAdmin) {
    return { adminCreated: false, adminUsername: existingAdmin.username };
  }

  const unit = 'Văn phòng';
  await db
    .insert(users)
    .values({
      username: env.seedAdminUsername,
      passwordHash: hashPassword(env.seedAdminPassword),
      fullName: env.seedAdminName,
      role: 'ADMIN',
      phone: null,
      unit,
      isActive: 1,
      mustChangePassword: env.seedAdminMustChangePassword ? 1 : 0,
      searchText: buildUserSearchText({
        username: env.seedAdminUsername,
        fullName: env.seedAdminName,
        phone: null,
        unit,
      }),
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing()
    .run();

  return { adminCreated: true, adminUsername: env.seedAdminUsername };
}

const isDirectExecution =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv[1]?.endsWith('seed.ts');

if (isDirectExecution) {
  void (async () => {
    const { getDb, getLibsqlClient } = await import('./index');
    const db = await getDb();
    const result = await seedDatabase(db);
    if (result.adminCreated) {
      console.log(`Đã khởi tạo tài khoản Admin mặc định: ${result.adminUsername}`);
    } else {
      console.log(`Tài khoản Admin đã tồn tại (${result.adminUsername}), bỏ qua tạo mới.`);
    }
    console.log('Đã đảm bảo cấu hình mặc định (default_loan_days=7, max_loan_days=30).');
    (await getLibsqlClient()).close();
  })();
}
