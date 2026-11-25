import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { LoginForm } from '@/components/LoginForm';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) {
    if (user.mustChangePassword) redirect('/doi-mat-khau');
    redirect(user.role === 'ADMIN' ? '/admin' : '/giao-vien');
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-12">
      <LoginForm />
    </div>
  );
}
