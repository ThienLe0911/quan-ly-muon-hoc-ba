import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Sổ Học Bạ — Quản Lý Mượn Trả Học Bạ Tiểu Học',
  description:
    'Hệ thống theo dõi mượn, trả học bạ và cảnh báo quá hạn dành cho văn phòng Trường Tiểu học.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
