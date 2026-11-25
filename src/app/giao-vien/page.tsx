import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { addCalendarDays, getTodayVNDateString } from '@/lib/domain/overdue';
import { readLoanSettings } from '@/lib/settings';
import { AppShell } from '@/components/AppShell';
import { TeacherPortalClient } from '@/components/teacher/TeacherPortalClient';

export const dynamic = 'force-dynamic';

export default async function TeacherPortalPage() {
  const user = await getSessionUser();
  if (!user) {
    redirect('/login');
  }
  if (user.mustChangePassword) {
    redirect('/doi-mat-khau');
  }
  if (user.role === 'ADMIN') {
    redirect('/admin');
  }

  const settings = await readLoanSettings();
  const todayVN = getTodayVNDateString();
  const defaultDueDate = addCalendarDays(todayVN, settings.defaultLoanDays);
  const maxDueDate = addCalendarDays(todayVN, settings.maxLoanDays);

  return (
    <AppShell user={user}>
      <TeacherPortalClient
        teacherName={user.fullName}
        teacherUnit={user.unit}
        todayVN={todayVN}
        defaultDueDate={defaultDueDate}
        maxDueDate={maxDueDate}
        defaultLoanDays={settings.defaultLoanDays}
        maxLoanDays={settings.maxLoanDays}
      />
    </AppShell>
  );
}
