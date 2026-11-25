'use client';

import { AlertOctagon, CheckCircle2, Phone } from 'lucide-react';
import type { LoanDto } from '@/lib/loans/enrich';
import { formatDateTimeVN, formatDateVN } from '@/lib/format-vn';
import { StatusBadge } from '@/components/StatusBadge';

interface RedListPanelProps {
  redList: LoanDto[];
  onReturnClick: (loan: LoanDto) => void;
  onCancelClick: (loan: LoanDto) => void;
}

export function RedListPanel({ redList, onReturnClick, onCancelClick }: RedListPanelProps) {
  if (redList.length === 0) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-emerald-900">
        <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-600" />
        <div>
          <div className="text-sm font-bold">Danh sách đỏ trống — Không có học bạ quá hạn</div>
          <div className="text-xs text-emerald-700">
            Tất cả học bạ đang mượn hiện vẫn nằm trong thời hạn trả quy định.
          </div>
        </div>
      </div>
    );
  }

  return (
    <section
      aria-label="Danh sách đỏ quá hạn"
      className="rounded-2xl border-2 border-red-300 bg-red-50/70 p-5 shadow-xs"
    >
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-600 text-white">
            <AlertOctagon className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-base font-bold text-red-900">
              DANH SÁCH ĐỎ — Quá hạn trả ({redList.length} hồ sơ)
            </h2>
            <p className="text-xs text-red-700">
              Sắp xếp ưu tiên từ hồ sơ lố hạn nhiều ngày nhất. Cần liên hệ giáo viên thu hồi ngay.
            </p>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-red-200 bg-white">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-red-100 bg-red-50/80 text-xs uppercase text-red-900">
              <th className="px-4 py-2.5 font-semibold">Học bạ (Lớp · Học sinh · Niên khóa)</th>
              <th className="px-4 py-2.5 font-semibold">Giáo viên giữ & SĐT</th>
              <th className="px-4 py-2.5 font-semibold">Ngày mượn</th>
              <th className="px-4 py-2.5 font-semibold">Hạn trả</th>
              <th className="px-4 py-2.5 font-semibold">Mức độ lố hạn</th>
              <th className="px-4 py-2.5 text-right font-semibold">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-red-100">
            {redList.map((loan) => (
              <tr key={loan.id} className="hover:bg-red-50/40">
                <td className="px-4 py-3">
                  <div className="font-semibold text-slate-900">
                    {loan.className} · {loan.studentName}
                  </div>
                  <div className="text-xs text-slate-500">Niên khóa: {loan.schoolYear}</div>
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-900">{loan.teacherNameSnapshot}</div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                    {loan.teacherUnitSnapshot && <span>{loan.teacherUnitSnapshot}</span>}
                    {loan.teacherPhoneSnapshot && (
                      <a
                        href={`tel:${loan.teacherPhoneSnapshot}`}
                        className="inline-flex items-center gap-1 font-medium text-blue-700 hover:underline"
                      >
                        <Phone className="h-3 w-3" />
                        {loan.teacherPhoneSnapshot}
                      </a>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-xs text-slate-700">
                  {formatDateTimeVN(loan.borrowedAt)}
                </td>
                <td className="px-4 py-3 font-semibold text-red-700">
                  {formatDateVN(loan.dueDate)}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge
                    status={loan.status}
                    timingLevel={loan.timingLevel}
                    overdueDays={loan.overdueDays}
                  />
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="inline-flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => onReturnClick(loan)}
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                    >
                      Xác nhận trả
                    </button>
                    <button
                      type="button"
                      onClick={() => onCancelClick(loan)}
                      className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
                    >
                      Hủy
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
