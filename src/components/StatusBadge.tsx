import type { LoanStatus, LoanTimingLevel } from '@/lib/domain/overdue';

interface StatusBadgeProps {
  status: LoanStatus;
  timingLevel: LoanTimingLevel;
  overdueDays: number;
}

export function StatusBadge({ status, timingLevel, overdueDays }: StatusBadgeProps) {
  if (status === 'RETURNED') {
    return (
      <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800">
        Đã trả
      </span>
    );
  }

  if (status === 'CANCELLED') {
    return (
      <span className="inline-flex items-center rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-medium text-slate-700">
        Đã hủy
      </span>
    );
  }

  if (timingLevel === 'CRITICAL') {
    return (
      <span className="inline-flex items-center rounded-full bg-red-700 px-2.5 py-0.5 text-xs font-semibold text-white">
        Quá hạn {overdueDays} ngày · Nghiêm trọng
      </span>
    );
  }

  if (timingLevel === 'MODERATE') {
    return (
      <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-800 ring-1 ring-red-300">
        Quá hạn {overdueDays} ngày · Vừa
      </span>
    );
  }

  if (timingLevel === 'MILD') {
    return (
      <span className="inline-flex items-center rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-semibold text-orange-800 ring-1 ring-orange-300">
        Quá hạn {overdueDays} ngày · Nhẹ
      </span>
    );
  }

  if (timingLevel === 'DUE_TODAY') {
    return (
      <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900 ring-1 ring-amber-300">
        Đến hạn hôm nay
      </span>
    );
  }

  if (timingLevel === 'DUE_SOON') {
    return (
      <span className="inline-flex items-center rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-900">
        Còn {Math.abs(overdueDays)} ngày tới hạn
      </span>
    );
  }

  return (
    <span className="inline-flex items-center rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-medium text-sky-800">
      Đang mượn · Trong hạn
    </span>
  );
}
