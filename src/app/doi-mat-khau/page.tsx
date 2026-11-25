import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { AppShell } from '@/components/AppShell';
import { ChangePasswordForm } from '@/components/ChangePasswordForm';

export const dynamic = 'force-dynamic';

export default async function ChangePasswordPage() {
  const user = await getSessionUser();
  if (!user) {
    redirect('/login');
  }

  return (
    <AppShell user={user}>
      <ChangePasswordForm role={user.role} mustChangePassword={user.mustChangePassword} />
    </AppShell>
  );
}
