import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { AppShell } from '@/components/AppShell';
import { AuditLogsClient } from '@/components/admin/AuditLogsClient';

export const dynamic = 'force-dynamic';

export default async function AdminAuditLogsPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (user.mustChangePassword) redirect('/doi-mat-khau');
  if (user.role !== 'ADMIN') redirect('/giao-vien');

  return (
    <AppShell user={user}>
      <AuditLogsClient />
    </AppShell>
  );
}
