import { getDb, type AppDatabase } from '@/db';
import { systemSettings } from '@/db/schema';

export interface LoanSettings {
  defaultLoanDays: number;
  maxLoanDays: number;
}

export async function readLoanSettings(dbOverride?: AppDatabase): Promise<LoanSettings> {
  const db = dbOverride ?? (await getDb());
  const rows = await db.select().from(systemSettings).all();
  const map = new Map(rows.map((r) => [r.key, r.value]));

  const defaultParsed = Number.parseInt(map.get('default_loan_days') || '7', 10);
  const maxParsed = Number.parseInt(map.get('max_loan_days') || '30', 10);

  const defaultLoanDays = Number.isFinite(defaultParsed) && defaultParsed > 0 ? defaultParsed : 7;
  const maxLoanDays =
    Number.isFinite(maxParsed) && maxParsed >= defaultLoanDays
      ? maxParsed
      : Math.max(30, defaultLoanDays);

  return { defaultLoanDays, maxLoanDays };
}
