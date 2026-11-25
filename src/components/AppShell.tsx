'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  BookOpen,
  History,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  Users,
  X,
} from 'lucide-react';
import type { AuthenticatedUser } from '@/lib/auth/session';

interface AppShellProps {
  user: AuthenticatedUser;
  children: React.ReactNode;
}

export function AppShell({ user, children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const navItems =
    user.role === 'ADMIN'
      ? [
          { href: '/admin', label: 'Dashboard & Danh sách đỏ', icon: LayoutDashboard },
          { href: '/admin/giao-vien', label: 'Giáo viên', icon: Users },
          { href: '/admin/cai-dat', label: 'Cài đặt hạn mượn', icon: Settings },
          { href: '/admin/nhat-ky', label: 'Nhật ký thao tác', icon: History },
        ]
      : [{ href: '/giao-vien', label: 'Mượn & theo dõi học bạ', icon: BookOpen }];

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      router.push('/login');
      router.refresh();
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white shadow-xs">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <Link
              href={user.role === 'ADMIN' ? '/admin' : '/giao-vien'}
              className="flex items-center gap-2.5 text-slate-900"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-700 text-white">
                <BookOpen className="h-5 w-5" />
              </span>
              <div>
                <div className="text-sm font-bold leading-tight sm:text-base">
                  Sổ Học Bạ Tiểu Học
                </div>
                <div className="text-xs text-slate-500">
                  {user.role === 'ADMIN' ? 'Cổng Văn thư / Quản trị' : 'Cổng Giáo viên'}
                </div>
              </div>
            </Link>
          </div>

          <nav className="hidden items-center gap-1 md:flex">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition ${
                    active
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="hidden items-center gap-3 md:flex">
            <div className="text-right">
              <div className="text-sm font-semibold text-slate-900">{user.fullName}</div>
              <div className="text-xs text-slate-500">
                {user.role === 'ADMIN' ? 'Admin' : user.unit ? `Giáo viên · ${user.unit}` : 'Giáo viên'}
              </div>
            </div>
            <Link
              href="/doi-mat-khau"
              title="Đổi mật khẩu"
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
            >
              <KeyRound className="h-3.5 w-3.5" />
              Đổi mật khẩu
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              disabled={loggingOut}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              <LogOut className="h-3.5 w-3.5" />
              {loggingOut ? 'Đang thoát...' : 'Đăng xuất'}
            </button>
          </div>

          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            className="inline-flex items-center justify-center rounded-lg border border-slate-200 p-2 text-slate-700 md:hidden"
            aria-label="Mở menu"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {mobileOpen && (
          <div className="border-t border-slate-200 bg-white px-4 py-3 md:hidden">
            <div className="mb-3 border-b border-slate-100 pb-2">
              <div className="text-sm font-semibold text-slate-900">{user.fullName}</div>
              <div className="text-xs text-slate-500">
                {user.role === 'ADMIN' ? 'Admin văn thư' : user.unit ? `Giáo viên · ${user.unit}` : 'Giáo viên'}
              </div>
            </div>
            <div className="flex flex-col gap-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${
                      active ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}
              <Link
                href="/doi-mat-khau"
                onClick={() => setMobileOpen(false)}
                className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                <KeyRound className="h-4 w-4" />
                Đổi mật khẩu
              </Link>
              <button
                type="button"
                onClick={handleLogout}
                disabled={loggingOut}
                className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-red-700 hover:bg-red-50"
              >
                <LogOut className="h-4 w-4" />
                {loggingOut ? 'Đang đăng xuất...' : 'Đăng xuất'}
              </button>
            </div>
          </div>
        )}
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
