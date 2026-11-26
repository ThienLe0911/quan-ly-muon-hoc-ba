'use client';

import { useState, type FormEvent } from 'react';
import { AlertTriangle, CheckCircle2, PlusCircle, User, Users } from 'lucide-react';
import type { LoanType } from '@/lib/domain/record-identity';
import { formatDateVN } from '@/lib/format-vn';

interface BorrowFormProps {
  defaultDueDate: string;
  minDueDate: string;
  maxDueDate: string;
  defaultLoanDays: number;
  maxLoanDays: number;
  defaultUnit: string | null;
  onCreated: () => void;
}

function getDefaultSchoolYear(todayVN: string): string {
  const year = Number.parseInt(todayVN.slice(0, 4), 10);
  const month = Number.parseInt(todayVN.slice(5, 7), 10);
  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    return '2025-2026';
  }
  return month >= 8 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
}

export function BorrowForm({
  defaultDueDate,
  minDueDate,
  maxDueDate,
  defaultLoanDays,
  maxLoanDays,
  defaultUnit,
  onCreated,
}: BorrowFormProps) {
  const [loanType, setLoanType] = useState<LoanType>('INDIVIDUAL');
  const [className, setClassName] = useState(defaultUnit || '');
  const [studentName, setStudentName] = useState('');
  const [quantityInput, setQuantityInput] = useState('');
  const [schoolYear, setSchoolYear] = useState(() => getDefaultSchoolYear(minDueDate));
  const [dueDate, setDueDate] = useState(defaultDueDate);
  const [borrowNote, setBorrowNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [duplicateInfo, setDuplicateInfo] = useState<{
    teacherName: string;
    borrowedAt: string;
    dueDate: string;
  } | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function handleLoanTypeChange(nextType: LoanType) {
    if (nextType === loanType) return;
    setLoanType(nextType);
    setError(null);
    setDuplicateInfo(null);
    setSuccessMsg(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setDuplicateInfo(null);
    setSuccessMsg(null);

    let parsedQuantity: number | null = null;
    if (loanType === 'WHOLE_CLASS' && quantityInput.trim() !== '') {
      const num = Number(quantityInput.trim());
      if (!Number.isInteger(num) || num < 1 || num > 200) {
        setError('Số lượng học bạ phải là số nguyên từ 1 đến 200.');
        return;
      }
      parsedQuantity = num;
    }

    setSubmitting(true);

    try {
      const payload =
        loanType === 'WHOLE_CLASS'
          ? {
              loanType: 'WHOLE_CLASS' as const,
              className,
              schoolYear,
              quantity: parsedQuantity,
              dueDate,
              borrowNote,
            }
          : {
              loanType: 'INDIVIDUAL' as const,
              className,
              studentName,
              schoolYear,
              dueDate,
              borrowNote,
            };

      const res = await fetch('/api/loans', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();

      if (!res.ok) {
        setError(json.error?.message || 'Không thể tạo phiếu mượn.');
        if (res.status === 409 && json.error?.details?.existingLoan) {
          const ex = json.error.details.existingLoan;
          setDuplicateInfo({
            teacherName: ex.teacherNameSnapshot,
            borrowedAt: ex.borrowedAt,
            dueDate: ex.dueDate,
          });
        }
        return;
      }

      const created = json.data;
      if (created.loanType === 'WHOLE_CLASS') {
        const qtySuffix = created.quantity ? ` (${created.quantity} quyển)` : '';
        setSuccessMsg(
          `Đã ghi nhận mượn toàn bộ học bạ lớp ${created.className} (${created.schoolYear})${qtySuffix}. Hạn trả: ${formatDateVN(created.dueDate)}.`
        );
      } else {
        setSuccessMsg(
          `Đã ghi nhận mượn học bạ lớp ${created.className} - ${created.studentName} (${created.schoolYear}). Hạn trả: ${formatDateVN(created.dueDate)}.`
        );
      }
      setStudentName('');
      setQuantityInput('');
      setBorrowNote('');
      setDueDate(defaultDueDate);
      onCreated();
    } catch {
      setError('Không thể kết nối máy chủ.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
      <div className="mb-4 flex items-center gap-2">
        <PlusCircle className="h-5 w-5 text-blue-700" />
        <h2 className="text-base font-bold text-slate-900">Tạo phiếu mượn học bạ mới</h2>
      </div>

      {/* Chọn loại mượn: Toàn bộ 1 lớp hoặc Riêng lẻ học sinh */}
      <div className="mb-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2" role="radiogroup" aria-label="Loại mượn học bạ">
        <button
          type="button"
          role="radio"
          aria-checked={loanType === 'WHOLE_CLASS'}
          onClick={() => handleLoanTypeChange('WHOLE_CLASS')}
          className={`flex items-start gap-3 rounded-xl border p-3 text-left transition ${
            loanType === 'WHOLE_CLASS'
              ? 'border-indigo-600 bg-indigo-50/70 ring-1 ring-indigo-600'
              : 'border-slate-200 bg-white hover:bg-slate-50'
          }`}
        >
          <span
            className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
              loanType === 'WHOLE_CLASS'
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-100 text-slate-500'
            }`}
          >
            <Users className="h-4 w-4" />
          </span>
          <div>
            <div className="text-sm font-bold text-slate-900">Mượn toàn bộ 1 lớp</div>
            <div className="text-xs text-slate-600">
              Nhập Lớp, Niên khóa và Số lượng quyển (tùy chọn)
            </div>
          </div>
        </button>

        <button
          type="button"
          role="radio"
          aria-checked={loanType === 'INDIVIDUAL'}
          onClick={() => handleLoanTypeChange('INDIVIDUAL')}
          className={`flex items-start gap-3 rounded-xl border p-3 text-left transition ${
            loanType === 'INDIVIDUAL'
              ? 'border-blue-600 bg-blue-50/70 ring-1 ring-blue-600'
              : 'border-slate-200 bg-white hover:bg-slate-50'
          }`}
        >
          <span
            className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
              loanType === 'INDIVIDUAL'
                ? 'bg-blue-700 text-white'
                : 'bg-slate-100 text-slate-500'
            }`}
          >
            <User className="h-4 w-4" />
          </span>
          <div>
            <div className="text-sm font-bold text-slate-900">Mượn riêng lẻ học sinh</div>
            <div className="text-xs text-slate-600">
              Nhập Lớp, Họ tên học sinh và Niên khóa
            </div>
          </div>
        </button>
      </div>

      {error && (
        <div
          role="alert"
          className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3.5 text-sm text-red-800"
        >
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
            <div>
              <p className="font-semibold">{error}</p>
              {duplicateInfo && (
                <p className="mt-1 text-xs text-red-700">
                  Người đang giữ: <strong>{duplicateInfo.teacherName}</strong> · Ngày mượn:{' '}
                  <strong>{formatDateVN(duplicateInfo.borrowedAt)}</strong> · Hạn trả:{' '}
                  <strong>{formatDateVN(duplicateInfo.dueDate)}</strong>
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {successMsg && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-sm text-emerald-800">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          <span>{successMsg}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-700">
            Lớp <span className="text-red-600">*</span>
          </label>
          <input
            type="text"
            required
            maxLength={30}
            value={className}
            onChange={(e) => setClassName(e.target.value)}
            placeholder="Ví dụ: 3A, 5/2"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
          />
        </div>

        {loanType === 'INDIVIDUAL' ? (
          <div className="sm:col-span-1 lg:col-span-2">
            <label className="mb-1 block text-xs font-semibold text-slate-700">
              Họ và tên học sinh <span className="text-red-600">*</span>
            </label>
            <input
              type="text"
              required
              minLength={2}
              maxLength={100}
              value={studentName}
              onChange={(e) => setStudentName(e.target.value)}
              placeholder="Ví dụ: Nguyễn Văn An"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
            />
          </div>
        ) : (
          <div className="sm:col-span-1 lg:col-span-2">
            <label className="mb-1 block text-xs font-semibold text-slate-700">
              Số lượng học bạ (tùy chọn)
            </label>
            <input
              type="number"
              min={1}
              max={200}
              step={1}
              value={quantityInput}
              onChange={(e) => setQuantityInput(e.target.value)}
              placeholder="Ví dụ: 35 (để Giáo vụ đối chiếu khi trả)"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-600 focus:outline-none"
            />
            <p className="mt-1 text-[11px] text-slate-500">
              Mượn cả bộ học bạ của lớp — để trống nếu chưa đếm sẵn
            </p>
          </div>
        )}

        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-700">
            Niên khóa (YYYY-YYYY) <span className="text-red-600">*</span>
          </label>
          <input
            type="text"
            required
            value={schoolYear}
            onChange={(e) => setSchoolYear(e.target.value)}
            placeholder="2025-2026"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
          />
          <p className="mt-1 text-[11px] text-slate-500">Vd: 2025-2026 hoặc 2021-2026</p>
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-700">
            Hạn ngày trả <span className="text-red-600">*</span>
          </label>
          <input
            type="date"
            required
            min={minDueDate}
            max={maxDueDate}
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
          />
          <p className="mt-1 text-[11px] text-slate-500">
            Mặc định {defaultLoanDays} ngày (tối đa {maxLoanDays} ngày)
          </p>
        </div>

        <div className="sm:col-span-2 lg:col-span-2">
          <label className="mb-1 block text-xs font-semibold text-slate-700">
            Ghi chú / Lý do mượn
          </label>
          <input
            type="text"
            maxLength={300}
            value={borrowNote}
            onChange={(e) => setBorrowNote(e.target.value)}
            placeholder={
              loanType === 'WHOLE_CLASS'
                ? 'Ví dụ: Ghi nhận xét cuối kỳ cả lớp, đối chiếu hồ sơ tổng kết...'
                : 'Ví dụ: Bổ sung nhận xét cuối kỳ, làm hồ sơ chuyển trường...'
            }
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
          />
        </div>

        <div className="flex items-end sm:col-span-2 lg:col-span-1">
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:opacity-60"
          >
            {submitting
              ? 'Đang lưu phiếu...'
              : loanType === 'WHOLE_CLASS'
                ? 'Mượn toàn bộ lớp'
                : 'Xác nhận mượn'}
          </button>
        </div>
      </form>
    </div>
  );
}
