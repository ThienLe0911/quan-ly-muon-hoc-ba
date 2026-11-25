'use client';

import { useState, type FormEvent } from 'react';
import { CheckCircle2, Settings } from 'lucide-react';

interface SettingsClientProps {
  initialDefaultLoanDays: number;
  initialMaxLoanDays: number;
}

export function SettingsClient({
  initialDefaultLoanDays,
  initialMaxLoanDays,
}: SettingsClientProps) {
  const [defaultLoanDays, setDefaultLoanDays] = useState(initialDefaultLoanDays);
  const [maxLoanDays, setMaxLoanDays] = useState(initialMaxLoanDays);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);

    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          defaultLoanDays: Number(defaultLoanDays),
          maxLoanDays: Number(maxLoanDays),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error?.message || 'Không thể lưu cấu hình.');
        return;
      }
      setSuccess(
        `Đã lưu cấu hình: hạn mặc định ${json.data.defaultLoanDays} ngày, hạn tối đa ${json.data.maxLoanDays} ngày.`
      );
    } catch {
      setError('Lỗi kết nối máy chủ.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Cài đặt thời hạn mượn học bạ</h1>
        <p className="text-sm text-slate-500">
          Thay đổi áp dụng cho các phiếu mượn tạo mới, không làm thay đổi hạn trả của các phiếu đã lập trước đó.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="mb-4 flex items-center gap-2">
          <Settings className="h-5 w-5 text-blue-700" />
          <h2 className="text-base font-bold text-slate-900">Quy định số ngày mượn</h2>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-800">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{success}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">
              Số ngày mượn mặc định (ngày)
            </label>
            <input
              type="number"
              min={1}
              max={90}
              required
              value={defaultLoanDays}
              onChange={(e) => setDefaultLoanDays(Number(e.target.value))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
            />
            <p className="mt-1 text-xs text-slate-500">
              Giá trị gợi ý sẵn trên biểu mẫu khi giáo viên mượn học bạ (1–90 ngày).
            </p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">
              Số ngày mượn tối đa cho phép (ngày)
            </label>
            <input
              type="number"
              min={1}
              max={365}
              required
              value={maxLoanDays}
              onChange={(e) => setMaxLoanDays(Number(e.target.value))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
            />
            <p className="mt-1 text-xs text-slate-500">
              Giáo viên không thể chọn hạn trả vượt quá số ngày này (phải ≥ hạn mặc định).
            </p>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
          >
            {submitting ? 'Đang lưu...' : 'Lưu cài đặt'}
          </button>
        </form>
      </div>
    </div>
  );
}
