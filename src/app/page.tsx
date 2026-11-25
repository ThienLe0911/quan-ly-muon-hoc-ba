import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
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
  redirect('/giao-vien');
}
