'use client';

import { useEffect, useState } from 'react';
import { ArrowDownUp, Calendar, RefreshCw, Search, X } from 'lucide-react';
import type { LoanDto } from '@/lib/loans/enrich';
import { addCalendarDays } from '@/lib/domain/overdue';
import { formatDateTimeVN, formatDateVN } from '@/lib/format-vn';
import { StatusBadge } from '@/components/StatusBadge';

export type AdminViewTab = 'ALL_LIST' | 'BY_BORROW_TIME' | 'BY_OVERDUE_SEVERITY';

export interface TeacherFilterOption {
  id: number;
  fullName: string;
  unit: string | null;
}

interface AttentionSummary {
  critical: number;
  moderate: number;
  mild: number;
  dueToday: number;
  dueSoon: number;
}

interface LoansTableProps {
  todayVN: string;
  refreshKey: number;
  attentionSummary: AttentionSummary;
  teachers: TeacherFilterOption[];
  onReturnClick: (loan: LoanDto) => void;
  onCancelClick: (loan: LoanDto) => void;
}

export function LoansTable({
  todayVN,
  refreshKey,
  attentionSummary,
  teachers,
  onReturnClick,
  onCancelClick,
}: LoansTableProps) {
  const [tab, setTab] = useState<AdminViewTab>('ALL_LIST');
  const [qInput, setQInput] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [loanTypeFilter, setLoanTypeFilter] = useState('');
  const [teacherIdFilter, setTeacherIdFilter] = useState('');
  const [classInput, setClassInput] = useState('');
  const [debouncedClass, setDebouncedClass] = useState('');
  const [schoolYearInput, setSchoolYearInput] = useState('');
  const [debouncedSchoolYear, setDebouncedSchoolYear] = useState('');

  const [timePreset, setTimePreset] = useState<'ALL' | 'TODAY' | '7D' | '30D' | 'MONTH' | 'CUSTOM'>(
    'ALL'
  );
  const [borrowedFrom, setBorrowedFrom] = useState('');
  const [borrowedTo, setBorrowedTo] = useState('');
  const [timeSort, setTimeSort] = useState<'borrowed_desc' | 'borrowed_asc'>('borrowed_desc');
  const [overdueTier, setOverdueTier] = useState<
    'ATTENTION' | 'CRITICAL' | 'MODERATE' | 'MILD' | 'DUE_TODAY' | 'DUE_SOON'
  >('ATTENTION');

  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<LoanDto[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [localRetryTick, setLocalRetryTick] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQ(qInput.trim());
      setDebouncedClass(classInput.trim());
      setDebouncedSchoolYear(schoolYearInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [qInput, classInput, schoolYearInput]);

  const applyTimePreset = (preset: 'ALL' | 'TODAY' | '7D' | '30D' | 'MONTH') => {
    setTimePreset(preset);
    setPage(1);
    if (preset === 'ALL') {
      setBorrowedFrom('');
      setBorrowedTo('');
    } else if (preset === 'TODAY') {
      setBorrowedFrom(todayVN);
      setBorrowedTo(todayVN);
    } else if (preset === '7D') {
      setBorrowedFrom(addCalendarDays(todayVN, -6));
      setBorrowedTo(todayVN);
    } else if (preset === '30D') {
      setBorrowedFrom(addCalendarDays(todayVN, -29));
      setBorrowedTo(todayVN);
    } else if (preset === 'MONTH') {
      setBorrowedFrom(`${todayVN.slice(0, 7)}-01`);
      setBorrowedTo(todayVN);
    }
  };

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('pageSize', '20');
    if (debouncedQ) params.set('q', debouncedQ);

    if (tab === 'ALL_LIST') {
      params.set('status', statusFilter);
      params.set('sort', 'borrowed_desc');
      if (loanTypeFilter) params.set('loanType', loanTypeFilter);
      if (teacherIdFilter) params.set('teacherId', teacherIdFilter);
      if (debouncedClass) params.set('className', debouncedClass);
      if (debouncedSchoolYear) params.set('schoolYear', debouncedSchoolYear);
    } else if (tab === 'BY_BORROW_TIME') {
      params.set('sort', timeSort);
      if (borrowedFrom) params.set('borrowedFrom', borrowedFrom);
      if (borrowedTo) params.set('borrowedTo', borrowedTo);
    } else if (tab === 'BY_OVERDUE_SEVERITY') {
      params.set('overdueTier', overdueTier);
      params.set('sort', 'overdue_desc');
    }

    (async () => {
      try {
        const res = await fetch(`/api/loans?${params.toString()}`, { cache: 'no-store' });
        const json = await res.json();
        if (!active) return;
        if (res.ok) {
          setError(null);
          setRows(json.data || []);
          setTotal(json.meta?.total ?? 0);
          setTotalPages(json.meta?.totalPages ?? 1);
        } else {
          setError(json.error?.message || 'Không thể tải danh sách phiếu mượn.');
        }
      } catch {
        if (active) {
          setError('Không thể kết nối máy chủ. Vui lòng thử lại.');
        }
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [
    tab,
    page,
    debouncedQ,
    statusFilter,
    loanTypeFilter,
    teacherIdFilter,
    debouncedClass,
    debouncedSchoolYear,
    timeSort,
    borrowedFrom,
    borrowedTo,
    overdueTier,
    refreshKey,
    localRetryTick,
  ]);

  const handleTabChange = (nextTab: AdminViewTab) => {
    if (nextTab === tab && page === 1) return;
    setTab(nextTab);
    setPage(1);
    setError(null);
    setLoading(true);
  };

  const handleRetry = () => {
    setError(null);
    setLoading(true);
    setLocalRetryTick((k) => k + 1);
  };

  const hasAllListExtraFilter =
    statusFilter !== 'ALL' ||
    loanTypeFilter !== '' ||
    teacherIdFilter !== '' ||
    classInput !== '' ||
    schoolYearInput !== '' ||
    qInput !== '';

  const resetAllListFilters = () => {
    setStatusFilter('ALL');
    setLoanTypeFilter('');
    setTeacherIdFilter('');
    setClassInput('');
    setSchoolYearInput('');
    setQInput('');
    setDebouncedClass('');
    setDebouncedSchoolYear('');
    setDebouncedQ('');
    setPage(1);
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="inline-flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => handleTabChange('ALL_LIST')}
            className={`rounded-lg px-3.5 py-2 text-sm font-semibold transition ${
              tab === 'ALL_LIST'
                ? 'bg-white text-blue-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Danh sách mượn
          </button>
          <button
            type="button"
            onClick={() => handleTabChange('BY_BORROW_TIME')}
            className={`rounded-lg px-3.5 py-2 text-sm font-semibold transition ${
              tab === 'BY_BORROW_TIME'
                ? 'bg-white text-blue-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Theo thời gian mượn
          </button>
          <button
            type="button"
            onClick={() => handleTabChange('BY_OVERDUE_SEVERITY')}
            className={`rounded-lg px-3.5 py-2 text-sm font-semibold transition ${
              tab === 'BY_OVERDUE_SEVERITY'
                ? 'bg-white text-red-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Theo độ lố hạn cần lưu ý
          </button>
        </div>

        <div className="relative w-full lg:w-80">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="search"
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder="Tìm học sinh, lớp, niên khóa, giáo viên..."
            className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm focus:border-blue-600 focus:outline-none"
          />
        </div>
      </div>

      {/* Bộ lọc riêng cho từng Tab */}
      {tab === 'ALL_LIST' && (
        <div className="mb-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            {[
              { value: 'ALL', label: 'Tất cả' },
              { value: 'BORROWED', label: 'Đang mượn' },
              { value: 'OVERDUE', label: 'Đang quá hạn' },
              { value: 'RETURNED', label: 'Đã trả' },
              { value: 'CANCELLED', label: 'Đã hủy' },
            ].map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  setStatusFilter(opt.value);
                  setPage(1);
                }}
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                  statusFilter === opt.value
                    ? 'border-blue-600 bg-blue-50 text-blue-700'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-2.5 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2 lg:grid-cols-5">
            <select
              aria-label="Lọc theo loại mượn"
              value={loanTypeFilter}
              onChange={(e) => {
                setLoanTypeFilter(e.target.value);
                setPage(1);
              }}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 focus:border-blue-600 focus:outline-none"
            >
              <option value="">Tất cả loại mượn</option>
              <option value="WHOLE_CLASS">Mượn toàn bộ lớp</option>
              <option value="INDIVIDUAL">Mượn riêng lẻ học sinh</option>
            </select>

            <select
              aria-label="Lọc theo giáo viên"
              value={teacherIdFilter}
              onChange={(e) => {
                setTeacherIdFilter(e.target.value);
                setPage(1);
              }}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 focus:border-blue-600 focus:outline-none"
            >
              <option value="">Tất cả giáo viên</option>
              {teachers.map((t) => (
                <option key={t.id} value={String(t.id)}>
                  {t.fullName}
                  {t.unit ? ` (${t.unit})` : ''}
                </option>
              ))}
            </select>

            <input
              type="text"
              aria-label="Lọc theo lớp"
              value={classInput}
              onChange={(e) => setClassInput(e.target.value)}
              placeholder="Lọc theo lớp (vd: 3A)"
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs focus:border-blue-600 focus:outline-none"
            />

            <input
              type="text"
              aria-label="Lọc theo niên khóa"
              value={schoolYearInput}
              onChange={(e) => setSchoolYearInput(e.target.value)}
              placeholder="Lọc niên khóa (vd: 2025-2026)"
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs focus:border-blue-600 focus:outline-none"
            />

            <div className="flex items-center justify-end">
              {hasAllListExtraFilter && (
                <button
                  type="button"
                  onClick={resetAllListFilters}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                >
                  <X className="h-3.5 w-3.5" />
                  Xóa bộ lọc
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === 'BY_BORROW_TIME' && (
        <div className="mb-4 flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-1.5">
            <Calendar className="mr-1 h-4 w-4 text-slate-500" />
            {(
              [
                { id: 'ALL', label: 'Tất cả thời gian' },
                { id: 'TODAY', label: 'Hôm nay' },
                { id: '7D', label: '7 ngày qua' },
                { id: '30D', label: '30 ngày qua' },
                { id: 'MONTH', label: 'Tháng này' },
              ] as const
            ).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => applyTimePreset(p.id)}
                className={`rounded-lg border px-2.5 py-1 text-xs font-medium ${
                  timePreset === p.id
                    ? 'border-blue-600 bg-blue-600 text-white'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <label className="flex items-center gap-1 text-slate-600">
              Từ:
              <input
                type="date"
                value={borrowedFrom}
                onChange={(e) => {
                  setTimePreset('CUSTOM');
                  setBorrowedFrom(e.target.value);
                  setPage(1);
                }}
                className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
              />
            </label>
            <label className="flex items-center gap-1 text-slate-600">
              Đến:
              <input
                type="date"
                value={borrowedTo}
                onChange={(e) => {
                  setTimePreset('CUSTOM');
                  setBorrowedTo(e.target.value);
                  setPage(1);
                }}
                className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
              />
            </label>
            <button
              type="button"
              onClick={() => {
                setTimeSort((s) => (s === 'borrowed_desc' ? 'borrowed_asc' : 'borrowed_desc'));
                setPage(1);
              }}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 font-semibold text-slate-700 hover:bg-slate-100"
            >
              <ArrowDownUp className="h-3.5 w-3.5" />
              {timeSort === 'borrowed_desc' ? 'Mới mượn trước' : 'Mượn lâu nhất trước'}
            </button>
          </div>
        </div>
      )}

      {tab === 'BY_OVERDUE_SEVERITY' && (
        <div className="mb-4 flex flex-wrap gap-2">
          {[
            {
              value: 'ATTENTION' as const,
              label: `Tất cả cần lưu ý (${
                attentionSummary.critical +
                attentionSummary.moderate +
                attentionSummary.mild +
                attentionSummary.dueToday +
                attentionSummary.dueSoon
              })`,
              cls: 'border-slate-300 bg-slate-100 text-slate-800',
            },
            {
              value: 'CRITICAL' as const,
              label: `Nghiêm trọng ≥ 8 ngày (${attentionSummary.critical})`,
              cls: 'border-red-700 bg-red-700 text-white',
            },
            {
              value: 'MODERATE' as const,
              label: `Vừa 4–7 ngày (${attentionSummary.moderate})`,
              cls: 'border-red-300 bg-red-100 text-red-900',
            },
            {
              value: 'MILD' as const,
              label: `Nhẹ 1–3 ngày (${attentionSummary.mild})`,
              cls: 'border-orange-300 bg-orange-100 text-orange-900',
            },
            {
              value: 'DUE_TODAY' as const,
              label: `Đến hạn hôm nay (${attentionSummary.dueToday})`,
              cls: 'border-amber-300 bg-amber-100 text-amber-900',
            },
            {
              value: 'DUE_SOON' as const,
              label: `Sắp đến hạn 1–2 ngày (${attentionSummary.dueSoon})`,
              cls: 'border-yellow-300 bg-yellow-100 text-yellow-900',
            },
          ].map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => {
                setOverdueTier(item.value);
                setPage(1);
              }}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                overdueTier === item.value
                  ? `${item.cls} ring-2 ring-slate-900/20`
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center text-sm text-slate-500">Đang tải danh sách phiếu mượn...</div>
      ) : error ? (
        <div className="flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3.5 text-sm text-red-800 sm:flex-row sm:items-center sm:justify-between">
          <span>{error}</span>
          <button
            type="button"
            onClick={handleRetry}
            className="inline-flex items-center gap-1.5 self-start rounded-lg bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-800"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Thử lại
          </button>
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 py-12 text-center text-sm text-slate-500">
          Không tìm thấy phiếu mượn nào phù hợp với bộ lọc hiện tại.
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                  <th className="py-2.5 pr-4 font-semibold">Học bạ</th>
                  <th className="py-2.5 pr-4 font-semibold">Giáo viên mượn</th>
                  <th className="py-2.5 pr-4 font-semibold">Thời gian mượn</th>
                  <th className="py-2.5 pr-4 font-semibold">Hạn trả</th>
                  <th className="py-2.5 pr-4 font-semibold">Trạng thái</th>
                  <th className="py-2.5 pr-4 font-semibold">Ghi chú / Lịch sử trả</th>
                  <th className="py-2.5 text-right font-semibold">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((loan) => (
                  <tr
                    key={loan.id}
                    className={
                      loan.isInRedList ? 'bg-red-50/40 hover:bg-red-50/70' : 'hover:bg-slate-50'
                    }
                  >
                    <td className="py-3 pr-4">
                      <div className="flex flex-wrap items-center gap-1.5 font-semibold text-slate-900">
                        {loan.loanType === 'WHOLE_CLASS' ? (
                          <span className="inline-flex items-center rounded-md bg-indigo-100 px-1.5 py-0.5 text-[11px] font-bold text-indigo-800">
                            Cả lớp
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600">
                            Riêng lẻ
                          </span>
                        )}
                        <span>
                          {loan.className} · {loan.studentName}
                        </span>
                      </div>
                      <div className="mt-0.5 text-xs text-slate-500">
                        Niên khóa: {loan.schoolYear}
                        {loan.loanType === 'WHOLE_CLASS' && loan.quantity
                          ? ` · ${loan.quantity} quyển`
                          : ''}
                      </div>
                    </td>
                    <td className="py-3 pr-4">
                      <div className="font-medium text-slate-900">{loan.teacherNameSnapshot}</div>
                      <div className="text-xs text-slate-500">
                        {[loan.teacherUnitSnapshot, loan.teacherPhoneSnapshot]
                          .filter(Boolean)
                          .join(' · ') || '—'}
                      </div>
                    </td>
                    <td className="py-3 pr-4 text-xs text-slate-700">
                      {formatDateTimeVN(loan.borrowedAt)}
                    </td>
                    <td className="py-3 pr-4 text-xs font-semibold text-slate-900">
                      {formatDateVN(loan.dueDate)}
                    </td>
                    <td className="py-3 pr-4">
                      <StatusBadge
                        status={loan.status}
                        timingLevel={loan.timingLevel}
                        overdueDays={loan.overdueDays}
                      />
                    </td>
                    <td className="max-w-xs py-3 pr-4 text-xs text-slate-600">
                      {loan.borrowNote && <div>Mượn: {loan.borrowNote}</div>}
                      {loan.status === 'RETURNED' && (
                        <div className="text-emerald-700">
                          Trả: {formatDateTimeVN(loan.returnedAt)}
                          {loan.returnedByAdminName ? ` (${loan.returnedByAdminName})` : ''}
                          {loan.returnNote ? ` · ${loan.returnNote}` : ''}
                        </div>
                      )}
                      {loan.status === 'CANCELLED' && (
                        <div className="text-slate-600">
                          Hủy: {loan.cancelReason}
                          {loan.cancelledByAdminName ? ` (${loan.cancelledByAdminName})` : ''}
                        </div>
                      )}
                    </td>
                    <td className="py-3 text-right">
                      {loan.status === 'BORROWED' ? (
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => onReturnClick(loan)}
                            className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
                          >
                            Đã trả
                          </button>
                          <button
                            type="button"
                            onClick={() => onCancelClick(loan)}
                            className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
                          >
                            Hủy
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">Đã đóng</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-col items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs text-slate-600 sm:flex-row">
            <span>
              Tổng cộng <strong>{total}</strong> phiếu · Trang <strong>{page}</strong>/{totalPages}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-lg border border-slate-200 px-3 py-1 font-medium hover:bg-slate-50 disabled:opacity-40"
              >
                Trang trước
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="rounded-lg border border-slate-200 px-3 py-1 font-medium hover:bg-slate-50 disabled:opacity-40"
              >
                Trang sau
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
