export interface AppEnv {
  tursoDatabaseUrl: string;
  tursoAuthToken?: string;
  isVercel: boolean;
  authCookieSecure: boolean;
  trustProxy: boolean;
  sessionTtlDays: number;
  seedAdminUsername: string;
  seedAdminPassword: string;
  seedAdminName: string;
  seedAdminMustChangePassword: boolean;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === '') return fallback;
  return value.trim().toLowerCase() === 'true';
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function normalizeDbUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (trimmed === ':memory:' || trimmed === 'file::memory:') {
    return ':memory:';
  }
  if (/^(libsql|https?|wss?|file):/i.test(trimmed)) {
    return trimmed;
  }
  return `file:${trimmed}`;
}

export function getEnv(): AppEnv {
  const isVercel =
    process.env.VERCEL === '1' || process.env.VERCEL?.trim().toLowerCase() === 'true';

  const rawDbUrl =
    process.env.TURSO_DATABASE_URL?.trim() ||
    process.env.DATABASE_PATH?.trim() ||
    'file:./data/app.db';

  return {
    tursoDatabaseUrl: normalizeDbUrl(rawDbUrl),
    tursoAuthToken: process.env.TURSO_AUTH_TOKEN?.trim() || undefined,
    isVercel,
    authCookieSecure: parseBoolean(process.env.AUTH_COOKIE_SECURE, isVercel),
    trustProxy: parseBoolean(process.env.TRUST_PROXY, isVercel),
    sessionTtlDays: parsePositiveInt(process.env.SESSION_TTL_DAYS, 7),
    seedAdminUsername: (process.env.SEED_ADMIN_USERNAME?.trim() || 'admin').toLowerCase(),
    seedAdminPassword: process.env.SEED_ADMIN_PASSWORD?.trim() || 'Admin@123456',
    seedAdminName: process.env.SEED_ADMIN_NAME?.trim() || 'Văn thư nhà trường',
    seedAdminMustChangePassword: parseBoolean(process.env.SEED_ADMIN_MUST_CHANGE_PASSWORD, false),
  };
}
