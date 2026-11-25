'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, BookOpen, Clock } from 'lucide-react';
import type { LoanDto } from '@/lib/loans/enrich';
import { BorrowForm } from './BorrowForm';
import { TeacherLoansList } from './TeacherLoansList';

interface TeacherPortalClientProps {
  teacherName: string;
  teacherUnit: string | null;
  todayVN: string;
  defaultDueDate: string;
  maxDueDate: string;
  defaultLoanDays: number;
  maxLoanDays: number;
}

export function TeacherPortalClient({
  teacherName,
  teacherUnit,
  defaultDueDate,
  todayVN,
  maxDueDate,
  defaultLoanDays,
  maxLoanDays,
}: TeacherPortalClientProps) {
  const [activeTab, setActiveTab] = useState<'BORROWED' | 'HISTORY'>('BORROWED');
  const [searchInput, setSearchInput] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [page, setPage] = useState(1);
  const [loans, setLoans] = useState<LoanDto[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [activeSummary, setActiveSummary] = useState({ total: 0, overdue: 0, dueSoon: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQ(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('pageSize', '20');
    params.set('status', activeTab === 'BORROWED' ? 'BORROWED' : 'HISTORY');
    if (debouncedQ) params.set('q', debouncedQ);

    (async () => {
      try {
        const res = await fetch(`/api/loans?${params.toString()}`, { cache: 'no-store' });
        const json = await res.json();
        if (!active) return;
        if (res.ok) {
          setError(null);
          setLoans(json.data || []);
          setTotal(json.meta?.total ?? 0);
          setTotalPages(json.meta?.totalPages ?? 1);
          if (json.meta?.teacherSummary) {
            setActiveSummary({
              total: json.meta.teacherSummary.totalActive ?? 0,
              overdue: json.meta.teacherSummary.overdueCount ?? 0,
              dueSoon: json.meta.teacherSummary.dueSoonCount ?? 0,
            });
          }
        } else {
          setError(json.error?.message || 'Không thể tải danh sách học bạ.');
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
  }, [activeTab, debouncedQ, page, reloadTick]);

  function handleTabChange(nextTab: 'BORROWED' | 'HISTORY') {
    if (nextTab === activeTab && page === 1) return;
    setActiveTab(nextTab);
    setPage(1);
    setError(null);
    setLoading(true);
  }

  function handleRetry() {
    setError(null);
    setLoading(true);
    setReloadTick((k) => k + 1);
  }

  function handleCreated() {
    setActiveTab('BORROWED');
    setPage(1);
    setError(null);
    setReloadTick((k) => k + 1);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Xin chào, {teacherName}</h1>
          <p className="text-sm text-slate-500">
            {teacherUnit ? `Đơn vị: ${teacherUnit} · ` : ''}
            Lưu ý: Khi trả học bạ giấy, vui lòng bàn giao trực tiếp để văn thư xác nhận trên hệ thống.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm">
            <BookOpen className="h-4 w-4 text-blue-600" />
            <span>
              Đang mượn: <strong>{activeSummary.total}</strong>
            </span>
          </div>
          {activeSummary.overdue > 0 && (
            <div className="flex items-center gap-2 rounded-xl border border-red-300 bg-red-50 px-3.5 py-2 text-sm text-red-800">
              <AlertCircle className="h-4 w-4 text-red-600" />
              <span>
                Quá hạn: <strong>{activeSummary.overdue}</strong>
              </span>
            </div>
          )}
          {activeSummary.dueSoon > 0 && (
            <div className="flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2 text-sm text-amber-800">
              <Clock className="h-4 w-4 text-amber-600" />
              <span>
                Sắp/đến hạn: <strong>{activeSummary.dueSoon}</strong>
              </span>
            </div>
          )}
        </div>
      </div>

      <BorrowForm
        defaultDueDate={defaultDueDate}
        minDueDate={todayVN}
        maxDueDate={maxDueDate}
        defaultLoanDays={defaultLoanDays}
        maxLoanDays={maxLoanDays}
        defaultUnit={teacherUnit}
        onCreated={handleCreated}
      />

      <TeacherLoansList
        loans={loans}
        loading={loading}
        error={error}
        onRetry={handleRetry}
        activeTab={activeTab}
        onTabChange={handleTabChange}
        searchQuery={searchInput}
        onSearchChange={setSearchInput}
        page={page}
        total={total}
        totalPages={totalPages}
        onPageChange={(nextPage) => {
          if (nextPage === page) return;
          setPage(nextPage);
          setError(null);
          setLoading(true);
        }}
      />
    </div>
  );
}
