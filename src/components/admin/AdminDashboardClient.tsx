'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, BookOpen, CheckCircle2, Clock, RefreshCw } from 'lucide-react';
import type { LoanDto } from '@/lib/loans/enrich';
import { RedListPanel } from './RedListPanel';
import { LoansTable, type TeacherFilterOption } from './LoansTable';
import { CancelLoanModal, ReturnLoanModal } from './ReturnCancelModals';

interface DashboardData {
  todayVN: string;
  kpi: {
    totalBorrowed: number;
    overdueCount: number;
    dueSoonOrTodayCount: number;
    returnedLast7Days: number;
    returnedThisMonth: number;
  };
  redList: LoanDto[];
  attentionSummary: {
    critical: number;
    moderate: number;
    mild: number;
    dueToday: number;
    dueSoon: number;
  };
}

export function AdminDashboardClient({
  initialTodayVN,
  teachers,
}: {
  initialTodayVN: string;
  teachers: TeacherFilterOption[];
}) {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const [returnTarget, setReturnTarget] = useState<LoanDto | null>(null);
  const [cancelTarget, setCancelTarget] = useState<LoanDto | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch('/api/dashboard/admin', { cache: 'no-store' });
        const json = await res.json();
        if (!active) return;
        if (res.ok) {
          setDashboard(json.data);
          setDashboardError(null);
        } else {
          setDashboardError(json.error?.message || 'Không thể tải dữ liệu Dashboard.');
        }
      } catch {
        if (active) {
          setDashboardError('Không thể kết nối máy chủ để tải dữ liệu Dashboard.');
        }
      } finally {
        if (active) setDashboardLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [reloadTick]);

  function handleRetryDashboard() {
    setDashboardLoading(true);
    setDashboardError(null);
    setReloadTick((k) => k + 1);
  }

  function handleActionDone() {
    setReturnTarget(null);
    setCancelTarget(null);
    setReloadTick((k) => k + 1);
  }

  const kpi = dashboard?.kpi ?? {
    totalBorrowed: 0,
    overdueCount: 0,
    dueSoonOrTodayCount: 0,
    returnedLast7Days: 0,
    returnedThisMonth: 0,
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Bảng điều khiển Giáo vụ (Admin)</h1>
        <p className="text-sm text-slate-500">
          Theo dõi học bạ đang lưu hành, cảnh báo danh sách đỏ quá hạn và xác nhận thu hồi sổ giấy.
        </p>
      </div>

      {/* 4 Thẻ KPI */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase text-slate-500">Đang mượn</span>
            <BookOpen className="h-5 w-5 text-blue-600" />
          </div>
          <div className="mt-2 text-3xl font-bold text-slate-900">
            {dashboardLoading && !dashboard ? '—' : kpi.totalBorrowed}
          </div>
          <div className="mt-1 text-xs text-slate-500">Học bạ đang ở ngoài văn phòng</div>
        </div>

        <div
          className={`rounded-2xl border p-4 shadow-xs ${
            kpi.overdueCount > 0 ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-white'
          }`}
        >
          <div className="flex items-center justify-between">
            <span
              className={`text-xs font-semibold uppercase ${
                kpi.overdueCount > 0 ? 'text-red-800' : 'text-slate-500'
              }`}
            >
              Danh sách đỏ (Quá hạn)
            </span>
            <AlertTriangle
              className={`h-5 w-5 ${kpi.overdueCount > 0 ? 'text-red-600' : 'text-slate-400'}`}
            />
          </div>
          <div
            className={`mt-2 text-3xl font-bold ${
              kpi.overdueCount > 0 ? 'text-red-700' : 'text-slate-900'
            }`}
          >
            {dashboardLoading && !dashboard ? '—' : kpi.overdueCount}
          </div>
          <div
            className={`mt-1 text-xs ${
              kpi.overdueCount > 0 ? 'font-medium text-red-700' : 'text-slate-500'
            }`}
          >
            Lố hạn trả từ 1 ngày trở lên
          </div>
        </div>

        <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase text-amber-800">
              Hôm nay & Sắp đến hạn
            </span>
            <Clock className="h-5 w-5 text-amber-600" />
          </div>
          <div className="mt-2 text-3xl font-bold text-amber-900">
            {dashboardLoading && !dashboard ? '—' : kpi.dueSoonOrTodayCount}
          </div>
          <div className="mt-1 text-xs text-amber-700">Cần nhắc giáo viên trong 0–2 ngày tới</div>
        </div>

        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase text-emerald-800">
              Đã thu hồi trong tháng
            </span>
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          </div>
          <div className="mt-2 text-3xl font-bold text-emerald-900">
            {dashboardLoading && !dashboard ? '—' : kpi.returnedThisMonth}
          </div>
          <div className="mt-1 text-xs text-emerald-700">
            7 ngày gần nhất: {dashboardLoading && !dashboard ? '—' : kpi.returnedLast7Days} lượt trả
          </div>
        </div>
      </div>

      {/* Khối Danh sách đỏ: tách biệt rõ loading / lỗi / dữ liệu thật */}
      {dashboardLoading && !dashboard ? (
        <div className="rounded-2xl border border-slate-200 bg-white px-5 py-6 text-sm text-slate-500">
          Đang kiểm tra Danh sách đỏ quá hạn...
        </div>
      ) : dashboardError ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-800 sm:flex-row sm:items-center sm:justify-between">
          <span>{dashboardError}</span>
          <button
            type="button"
            onClick={handleRetryDashboard}
            className="inline-flex items-center gap-1.5 self-start rounded-lg bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-800"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Thử lại
          </button>
        </div>
      ) : (
        <RedListPanel
          redList={dashboard?.redList ?? []}
          onReturnClick={(loan) => setReturnTarget(loan)}
          onCancelClick={(loan) => setCancelTarget(loan)}
        />
      )}

      {/* Bảng 3 góc nhìn */}
      <LoansTable
        todayVN={dashboard?.todayVN ?? initialTodayVN}
        refreshKey={reloadTick}
        teachers={teachers}
        attentionSummary={
          dashboard?.attentionSummary ?? {
            critical: 0,
            moderate: 0,
            mild: 0,
            dueToday: 0,
            dueSoon: 0,
          }
        }
        onReturnClick={(loan) => setReturnTarget(loan)}
        onCancelClick={(loan) => setCancelTarget(loan)}
      />

      <ReturnLoanModal
        key={`return-${returnTarget?.id ?? 'none'}`}
        loan={returnTarget}
        onClose={() => setReturnTarget(null)}
        onDone={handleActionDone}
      />

      <CancelLoanModal
        key={`cancel-${cancelTarget?.id ?? 'none'}`}
        loan={cancelTarget}
        onClose={() => setCancelTarget(null)}
        onDone={handleActionDone}
      />
    </div>
  );
}
