'use client';

import { useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import type { LoanDto } from '@/lib/loans/enrich';
import { formatDateVN } from '@/lib/format-vn';

interface ReturnModalProps {
  loan: LoanDto | null;
  onClose: () => void;
  onDone: () => void;
}

export function ReturnLoanModal({ loan, onClose, onDone }: ReturnModalProps) {
  const [returnNote, setReturnNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!loan) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!loan) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/loans/${loan.id}/return`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ returnNote }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error?.message || 'Không thể xác nhận trả học bạ.');
        return;
      }
      setReturnNote('');
      onDone();
    } catch {
      setError('Lỗi kết nối máy chủ.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-900">Xác nhận đã trả học bạ</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-sm">
          <div className="font-semibold text-slate-900">
            Lớp {loan.className} · {loan.studentName}
          </div>
          <div className="text-xs text-slate-600">Niên khóa: {loan.schoolYear}</div>
          <div className="mt-1 text-xs text-slate-600">
            Giáo viên mượn: <strong>{loan.teacherNameSnapshot}</strong> · Hạn trả:{' '}
            <strong>{formatDateVN(loan.dueDate)}</strong>
          </div>
        </div>

        {error && (
          <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">
              Ghi chú tình trạng sổ khi nhận lại (tùy chọn)
            </label>
            <input
              type="text"
              maxLength={300}
              value={returnNote}
              onChange={(e) => setReturnNote(e.target.value)}
              placeholder="Ví dụ: Đủ bìa, nguyên vẹn..."
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Đóng
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {submitting ? 'Đang lưu...' : 'Xác nhận đã thu hồi'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface CancelModalProps {
  loan: LoanDto | null;
  onClose: () => void;
  onDone: () => void;
}

export function CancelLoanModal({ loan, onClose, onDone }: CancelModalProps) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!loan) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!loan) return;
    setError(null);
    if (reason.trim().length < 3) {
      setError('Vui lòng nhập lý do hủy tối thiểu 3 ký tự.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/loans/${loan.id}/cancel`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error?.message || 'Không thể hủy phiếu mượn.');
        return;
      }
      setReason('');
      onDone();
    } catch {
      setError('Lỗi kết nối máy chủ.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-900">Hủy phiếu mượn nhập nhầm</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-sm">
          <div className="font-semibold text-slate-900">
            Lớp {loan.className} · {loan.studentName} ({loan.schoolYear})
          </div>
          <div className="mt-1 text-xs text-slate-600">
            Giáo viên: <strong>{loan.teacherNameSnapshot}</strong>
          </div>
        </div>

        {error && (
          <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">
              Lý do hủy phiếu <span className="text-red-600">*</span>
            </label>
            <input
              type="text"
              required
              minLength={3}
              maxLength={300}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ví dụ: Giáo viên nhập nhầm tên học sinh..."
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Đóng
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
            >
              {submitting ? 'Đang hủy...' : 'Xác nhận hủy phiếu'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
