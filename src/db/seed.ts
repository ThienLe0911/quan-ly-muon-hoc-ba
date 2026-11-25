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

  if (env.isVercel && !env.hasExplicitSeedAdminPassword) {
    throw new Error(
      'Thiếu biến môi trường SEED_ADMIN_PASSWORD trên Vercel: không cho phép khởi tạo tài khoản Admin đầu tiên bằng mật khẩu mặc định công khai.'
    );
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
    const { createDbConnection } = await import('./index');
    const env = getEnv();
    const conn = await createDbConnection(env.tursoDatabaseUrl, env.tursoAuthToken);
    try {
      const result = await seedDatabase(conn.db);
      if (result.adminCreated) {
        console.log(`Đã khởi tạo tài khoản Admin mặc định: ${result.adminUsername}`);
      } else {
        console.log(`Tài khoản Admin đã tồn tại (${result.adminUsername}), bỏ qua tạo mới.`);
      }
      console.log('Đã đảm bảo cấu hình mặc định (default_loan_days=7, max_loan_days=30).');
    } finally {
      conn.client.close();
    }
  })();
}
