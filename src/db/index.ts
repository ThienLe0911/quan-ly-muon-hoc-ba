import fs from 'node:fs';
import path from 'node:path';
import { createClient, type Client } from '@libsql/client';
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql';
import * as schema from './schema';
import { getEnv, normalizeDbUrl } from '@/lib/env';
import { runMigrations } from './migrate';
import { seedDatabase } from './seed';

export type AppDatabase = LibSQLDatabase<typeof schema>;

export interface DbConnection {
  client: Client;
  db: AppDatabase;
}

const globalForDb = globalThis as unknown as {
  __hocBaDbConn?: DbConnection;
  __hocBaDbInitPromise?: Promise<DbConnection> | null;
  __hocBaTestDbConn?: DbConnection | null;
};

const txQueues = new WeakMap<object, Promise<unknown>>();

function isSqliteBusyError(err: unknown, depth: number = 0): boolean {
  if (!err || typeof err !== 'object' || depth > 3) return false;
  const record = err as { code?: unknown; message?: unknown; cause?: unknown };
  const code = record.code ? String(record.code) : '';
  const msg = record.message ? String(record.message) : '';
  if (
    code === 'SQLITE_BUSY' ||
    msg.includes('SQLITE_BUSY') ||
    msg.includes('database is locked')
  ) {
    return true;
  }
  return record.cause ? isSqliteBusyError(record.cause, depth + 1) : false;
}

/**
 * Tuần tự hóa các write transaction dùng chung 1 instance @libsql/client trong cùng process
 * (tránh lỗi "cannot start a transaction within a transaction" khi nhiều request ghi đồng thời)
 * và tự thử lại ngắn nếu gặp SQLITE_BUSY từ Turso đa instance.
 */
export async function withWriteTransaction<T>(
  db: AppDatabase,
  fn: (tx: AppDatabase) => Promise<T>
): Promise<T> {
  const prev = txQueues.get(db) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  txQueues.set(
    db,
    prev.then(
      () => current,
      () => current
    )
  );

  await prev.catch(() => undefined);
  try {
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await db.transaction(async (tx) => fn(tx as unknown as AppDatabase));
      } catch (err) {
        if (attempt < maxAttempts && isSqliteBusyError(err)) {
          await new Promise((r) => setTimeout(r, 30 * attempt));
          continue;
        }
        throw err;
      }
    }
    throw new Error('Không thể hoàn tất giao dịch cơ sở dữ liệu.');
  } finally {
    release();
  }
}

export async function createDbConnection(
  rawUrl: string,
  authToken?: string
): Promise<DbConnection> {
  const url = normalizeDbUrl(rawUrl);
  const isMemory = url === ':memory:';
  const isLocalFile = !isMemory && url.startsWith('file:');

  if (isLocalFile) {
    const filePath = url.slice('file:'.length);
    const dir = path.dirname(path.resolve(filePath));
    fs.mkdirSync(dir, { recursive: true });
  }

  const client = createClient(authToken ? { url, authToken } : { url });

  if (isLocalFile || isMemory) {
    if (isLocalFile) {
      await client.execute('PRAGMA journal_mode = WAL');
      await client.execute('PRAGMA busy_timeout = 5000');
    }
    await client.execute('PRAGMA foreign_keys = ON');
  }

  await runMigrations(client);

  const db = drizzle(client, { schema });
  return { client, db };
}

async function getConnection(): Promise<DbConnection> {
  if (globalForDb.__hocBaTestDbConn) {
    return globalForDb.__hocBaTestDbConn;
  }

  if (globalForDb.__hocBaDbConn) {
    return globalForDb.__hocBaDbConn;
  }

  if (!globalForDb.__hocBaDbInitPromise) {
    globalForDb.__hocBaDbInitPromise = (async () => {
      const env = getEnv();
      const conn = await createDbConnection(env.tursoDatabaseUrl, env.tursoAuthToken);
      if (env.tursoDatabaseUrl !== ':memory:') {
        await seedDatabase(conn.db);
      }
      globalForDb.__hocBaDbConn = conn;
      return conn;
    })().catch((err) => {
      globalForDb.__hocBaDbInitPromise = null;
      throw err;
    });
  }

  return globalForDb.__hocBaDbInitPromise;
}

export async function getDb(): Promise<AppDatabase> {
  return (await getConnection()).db;
}

export async function getLibsqlClient(): Promise<Client> {
  return (await getConnection()).client;
}

export function getActiveTestDb(): AppDatabase | null {
  return globalForDb.__hocBaTestDbConn?.db ?? null;
}

export function setDbForTests(conn: DbConnection): void {
  globalForDb.__hocBaTestDbConn = conn;
}

export function resetDbForTests(): void {
  if (globalForDb.__hocBaTestDbConn) {
    try {
      globalForDb.__hocBaTestDbConn.client.close();
    } catch {
      // Bỏ qua nếu đã đóng
    }
    globalForDb.__hocBaTestDbConn = null;
  }
}
