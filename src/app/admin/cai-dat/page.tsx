import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { readLoanSettings } from '@/lib/settings';
import { AppShell } from '@/components/AppShell';
import { SettingsClient } from '@/components/admin/SettingsClient';

export const dynamic = 'force-dynamic';

export default async function AdminSettingsPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (user.mustChangePassword) redirect('/doi-mat-khau');
  if (user.role !== 'ADMIN') redirect('/giao-vien');

  const settings = await readLoanSettings();

  return (
    <AppShell user={user}>
      <SettingsClient
        initialDefaultLoanDays={settings.defaultLoanDays}
        initialMaxLoanDays={settings.maxLoanDays}
      />
    </AppShell>
  );
}
