'use client';

import { RefreshCw, Search } from 'lucide-react';
import type { LoanDto } from '@/lib/loans/enrich';
import { formatDateTimeVN, formatDateVN } from '@/lib/format-vn';
import { StatusBadge } from '@/components/StatusBadge';

interface TeacherLoansListProps {
  loans: LoanDto[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  activeTab: 'BORROWED' | 'HISTORY';
  onTabChange: (tab: 'BORROWED' | 'HISTORY') => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  page: number;
  total: number;
  totalPages: number;
  onPageChange: (nextPage: number) => void;
}

export function TeacherLoansList({
  loans,
  loading,
  error,
  onRetry,
  activeTab,
  onTabChange,
  searchQuery,
  onSearchChange,
  page,
  total,
  totalPages,
  onPageChange,
}: TeacherLoansListProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex rounded-xl bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => onTabChange('BORROWED')}
            className={`rounded-lg px-3.5 py-1.5 text-sm font-semibold transition ${
              activeTab === 'BORROWED'
                ? 'bg-white text-blue-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Đang mượn
          </button>
          <button
            type="button"
            onClick={() => onTabChange('HISTORY')}
            className={`rounded-lg px-3.5 py-1.5 text-sm font-semibold transition ${
              activeTab === 'HISTORY'
                ? 'bg-white text-blue-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Lịch sử đã trả / hủy
          </button>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Tìm theo lớp, tên học sinh, niên khóa..."
            className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm focus:border-blue-600 focus:outline-none"
          />
        </div>
      </div>

      {loading ? (
        <div className="py-10 text-center text-sm text-slate-500">Đang tải danh sách học bạ...</div>
      ) : error ? (
        <div className="flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3.5 text-sm text-red-800 sm:flex-row sm:items-center sm:justify-between">
          <span>{error}</span>
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-1.5 self-start rounded-lg bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-800"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Thử lại
          </button>
        </div>
      ) : loans.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 py-10 text-center text-sm text-slate-500">
          {activeTab === 'BORROWED'
            ? 'Bạn hiện không giữ cuốn học bạ nào.'
            : 'Chưa có lịch sử trả hoặc hủy phiếu nào.'}
        </div>
      ) : (
        <>
          {/* Hiển thị bảng trên màn hình vừa & lớn */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                  <th className="py-2.5 pr-4 font-semibold">Học bạ (Lớp · Học sinh · Niên khóa)</th>
                  <th className="py-2.5 pr-4 font-semibold">Ngày mượn</th>
                  <th className="py-2.5 pr-4 font-semibold">Hạn trả</th>
                  <th className="py-2.5 pr-4 font-semibold">Trạng thái</th>
                  <th className="py-2.5 font-semibold">Ghi chú / Trả sổ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loans.map((loan) => (
                  <tr
                    key={loan.id}
                    className={loan.isInRedList ? 'bg-red-50/60' : 'hover:bg-slate-50'}
                  >
                    <td className="py-3 pr-4">
                      <div className="font-semibold text-slate-900">
                        {loan.className} · {loan.studentName}
                      </div>
                      <div className="text-xs text-slate-500">Niên khóa: {loan.schoolYear}</div>
                    </td>
                    <td className="py-3 pr-4 text-slate-700">{formatDateTimeVN(loan.borrowedAt)}</td>
                    <td className="py-3 pr-4 font-medium text-slate-900">
                      {formatDateVN(loan.dueDate)}
                    </td>
                    <td className="py-3 pr-4">
                      <StatusBadge
                        status={loan.status}
                        timingLevel={loan.timingLevel}
                        overdueDays={loan.overdueDays}
                      />
                    </td>
                    <td className="py-3 text-xs text-slate-600">
                      {loan.borrowNote && <div>Mượn: {loan.borrowNote}</div>}
                      {loan.status === 'RETURNED' && (
                        <div className="text-emerald-700">
                          Đã trả lúc {formatDateTimeVN(loan.returnedAt)}
                          {loan.returnNote ? ` (${loan.returnNote})` : ''}
                        </div>
                      )}
                      {loan.status === 'CANCELLED' && (
                        <div className="text-slate-600">
                          Đã hủy: {loan.cancelReason || 'Không có lý do'}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Hiển thị thẻ gọn gàng trên điện thoại */}
          <div className="space-y-3 md:hidden">
            {loans.map((loan) => (
              <div
                key={loan.id}
                className={`rounded-xl border p-3.5 ${
                  loan.isInRedList ? 'border-red-300 bg-red-50/70' : 'border-slate-200 bg-white'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold text-slate-900">
                      {loan.className} · {loan.studentName}
                    </div>
                    <div className="text-xs text-slate-500">Niên khóa: {loan.schoolYear}</div>
                  </div>
                  <StatusBadge
                    status={loan.status}
                    timingLevel={loan.timingLevel}
                    overdueDays={loan.overdueDays}
                  />
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                  <span>Mượn: {formatDateTimeVN(loan.borrowedAt)}</span>
                  <span className="font-medium text-slate-800">
                    Hạn trả: {formatDateVN(loan.dueDate)}
                  </span>
                </div>
                {(loan.borrowNote || loan.status !== 'BORROWED') && (
                  <div className="mt-2 border-t border-slate-100 pt-2 text-xs text-slate-600">
                    {loan.borrowNote && <div>Ghi chú: {loan.borrowNote}</div>}
                    {loan.status === 'RETURNED' && (
                      <div className="text-emerald-700">
                        Trả lúc {formatDateTimeVN(loan.returnedAt)}
                        {loan.returnNote ? ` (${loan.returnNote})` : ''}
                      </div>
                    )}
                    {loan.status === 'CANCELLED' && <div>Lý do hủy: {loan.cancelReason}</div>}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-col items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs text-slate-600 sm:flex-row">
            <span>
              Tổng cộng <strong>{total}</strong> phiếu · Trang <strong>{page}</strong>/{totalPages}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => onPageChange(Math.max(1, page - 1))}
                className="rounded-lg border border-slate-200 px-3 py-1 font-medium hover:bg-slate-50 disabled:opacity-40"
              >
                Trang trước
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => onPageChange(Math.min(totalPages, page + 1))}
                className="rounded-lg border border-slate-200 px-3 py-1 font-medium hover:bg-slate-50 disabled:opacity-40"
              >
                Trang sau
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
