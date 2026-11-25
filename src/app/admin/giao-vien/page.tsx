import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { AppShell } from '@/components/AppShell';
import { TeacherManagerClient } from '@/components/admin/TeacherManagerClient';

export const dynamic = 'force-dynamic';

export default async function AdminTeachersPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (user.mustChangePassword) redirect('/doi-mat-khau');
  if (user.role !== 'ADMIN') redirect('/giao-vien');

  return (
    <AppShell user={user}>
      <TeacherManagerClient currentUserId={user.id} />
    </AppShell>
  );
}
