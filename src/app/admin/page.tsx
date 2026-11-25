import { asc, eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { getDb } from '@/db';
import { users } from '@/db/schema';
import { getSessionUser } from '@/lib/auth/session';
import { getTodayVNDateString } from '@/lib/domain/overdue';
import { AppShell } from '@/components/AppShell';
import { AdminDashboardClient } from '@/components/admin/AdminDashboardClient';

export const dynamic = 'force-dynamic';

export default async function AdminDashboardPage() {
  const user = await getSessionUser();
  if (!user) {
    redirect('/login');
  }
  if (user.mustChangePassword) {
    redirect('/doi-mat-khau');
  }
  if (user.role !== 'ADMIN') {
    redirect('/giao-vien');
  }

  const db = await getDb();
  const teachers = await db
    .select({
      id: users.id,
      fullName: users.fullName,
      unit: users.unit,
    })
    .from(users)
    .where(eq(users.role, 'TEACHER'))
    .orderBy(asc(users.fullName))
    .all();

  return (
    <AppShell user={user}>
      <AdminDashboardClient
        initialTodayVN={getTodayVNDateString()}
        teachers={teachers}
      />
    </AppShell>
  );
}
