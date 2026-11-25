'use client';

import { useEffect, useState } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import { formatDateTimeVN } from '@/lib/format-vn';

interface AuditRow {
  id: number;
  actorId: number | null;
  actorName: string | null;
  actorUsername: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  metadataJson: string | null;
  createdAt: string;
}

const ACTION_LABELS: Record<string, string> = {
  LOGIN_SUCCESS: 'Đăng nhập thành công',
  LOGIN_FAILED: 'Đăng nhập thất bại',
  LOGOUT: 'Đăng xuất',
  PASSWORD_CHANGED: 'Đổi mật khẩu',
  USER_CREATED: 'Tạo tài khoản',
  USER_UPDATED: 'Cập nhật tài khoản',
  USER_STATUS_CHANGED: 'Khóa / Mở khóa tài khoản',
  USER_PASSWORD_RESET: 'Đặt lại mật khẩu',
  LOAN_CREATED: 'Tạo phiếu mượn',
  LOAN_RETURNED: 'Xác nhận trả học bạ',
  LOAN_CANCELLED: 'Hủy phiếu mượn',
  SETTINGS_UPDATED: 'Cập nhật cài đặt',
};

export function AuditLogsClient() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const [action, setAction] = useState('');
  const [qInput, setQInput] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQ(qInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [qInput]);

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('pageSize', '20');
    if (action) params.set('action', action);
    if (debouncedQ) params.set('q', debouncedQ);

    (async () => {
      try {
        const res = await fetch(`/api/audit-logs?${params.toString()}`, { cache: 'no-store' });
        const json = await res.json();
        if (!active) return;
        if (res.ok) {
          setError(null);
          setRows(json.data || []);
          setTotal(json.meta?.total ?? 0);
          setTotalPages(json.meta?.totalPages ?? 1);
        } else {
          setError(json.error?.message || 'Không thể tải nhật ký thao tác.');
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
  }, [page, action, debouncedQ, reloadTick]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Nhật ký thao tác hệ thống</h1>
        <p className="text-sm text-slate-500">
          Ghi lại toàn bộ lịch sử đăng nhập, quản lý tài khoản và mượn/trả/hủy học bạ.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <select
            value={action}
            onChange={(e) => {
              setAction(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm sm:w-64"
          >
            <option value="">Tất cả loại thao tác</option>
            {Object.entries(ACTION_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>

          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="search"
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              placeholder="Tìm người thực hiện, học sinh, mã phiếu..."
              className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm focus:border-blue-600 focus:outline-none"
            />
          </div>
        </div>

        {loading ? (
          <div className="py-10 text-center text-sm text-slate-500">Đang tải nhật ký...</div>
        ) : error ? (
          <div className="flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3.5 text-sm text-red-800 sm:flex-row sm:items-center sm:justify-between">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => {
                setError(null);
                setLoading(true);
                setReloadTick((k) => k + 1);
              }}
              className="inline-flex items-center gap-1.5 self-start rounded-lg bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-800"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Thử lại
            </button>
          </div>
        ) : rows.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-500">Chưa có bản ghi nhật ký nào.</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                    <th className="py-2.5 pr-4 font-semibold">Thời gian (VN)</th>
                    <th className="py-2.5 pr-4 font-semibold">Người thực hiện</th>
                    <th className="py-2.5 pr-4 font-semibold">Hành động</th>
                    <th className="py-2.5 pr-4 font-semibold">Đối tượng</th>
                    <th className="py-2.5 font-semibold">Chi tiết</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50">
                      <td className="py-2.5 pr-4 text-xs text-slate-600">
                        {formatDateTimeVN(row.createdAt)}
                      </td>
                      <td className="py-2.5 pr-4 text-xs">
                        {row.actorName ? (
                          <div>
                            <span className="font-semibold text-slate-900">{row.actorName}</span>{' '}
                            <span className="text-slate-500">(@{row.actorUsername})</span>
                          </div>
                        ) : (
                          <span className="text-slate-500">Hệ thống / Khách</span>
                        )}
                      </td>
                      <td className="py-2.5 pr-4">
                        <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-800">
                          {ACTION_LABELS[row.action] || row.action}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4 text-xs text-slate-600">
                        {row.targetType}
                        {row.targetId ? ` #${row.targetId}` : ''}
                      </td>
                      <td className="max-w-md break-all py-2.5 font-mono text-[11px] text-slate-600">
                        {row.metadataJson || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex flex-col items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs text-slate-600 sm:flex-row">
              <span>
                Tổng cộng <strong>{total}</strong> bản ghi · Trang <strong>{page}</strong>/{totalPages}
              </span>
              <div className="flex gap-2">
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
      </div>
    </div>
  );
}
