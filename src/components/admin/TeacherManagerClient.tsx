'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { KeyRound, Lock, Pencil, RefreshCw, Search, Unlock, UserPlus, X } from 'lucide-react';

interface UserItem {
  id: number;
  username: string;
  fullName: string;
  role: 'ADMIN' | 'TEACHER';
  phone: string | null;
  unit: string | null;
  isActive: boolean;
  mustChangePassword: boolean;
  activeLoanCount: number;
  createdAt: string;
}

export function TeacherManagerClient({ currentUserId }: { currentUserId: number }) {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [qInput, setQInput] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'true' | 'false'>('ALL');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<UserItem | null>(null);
  const [resetTarget, setResetTarget] = useState<UserItem | null>(null);
  const [lockTarget, setLockTarget] = useState<UserItem | null>(null);
  const [lockSubmitting, setLockSubmitting] = useState(false);

  // Create form state
  const [cUsername, setCUsername] = useState('');
  const [cFullName, setCFullName] = useState('');
  const [cPhone, setCPhone] = useState('');
  const [cUnit, setCUnit] = useState('');
  const [cRole, setCRole] = useState<'TEACHER' | 'ADMIN'>('TEACHER');
  const [cPassword, setCPassword] = useState('');
  const [cMustChange, setCMustChange] = useState(true);
  const [cError, setCError] = useState<string | null>(null);
  const [cSubmitting, setCSubmitting] = useState(false);

  // Edit form state
  const [eFullName, setEFullName] = useState('');
  const [ePhone, setEPhone] = useState('');
  const [eUnit, setEUnit] = useState('');
  const [eError, setEError] = useState<string | null>(null);
  const [eSubmitting, setESubmitting] = useState(false);

  const [reloadTick, setReloadTick] = useState(0);
  // Reset password state
  const [rPassword, setRPassword] = useState('');
  const [rMustChange, setRMustChange] = useState(true);
  const [rError, setRError] = useState<string | null>(null);
  const [rSubmitting, setRSubmitting] = useState(false);

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
    if (debouncedQ) params.set('q', debouncedQ);
    if (statusFilter !== 'ALL') params.set('isActive', statusFilter);

    (async () => {
      try {
        const res = await fetch(`/api/users?${params.toString()}`, { cache: 'no-store' });
        const json = await res.json();
        if (!active) return;
        if (res.ok) {
          setLoadError(null);
          setUsers(json.data || []);
          setTotal(json.meta?.total ?? 0);
          setTotalPages(json.meta?.totalPages ?? 1);
        } else {
          setLoadError(json.error?.message || 'Không thể tải danh sách tài khoản.');
        }
      } catch {
        if (active) {
          setLoadError('Không thể kết nối máy chủ. Vui lòng thử lại.');
        }
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [debouncedQ, statusFilter, page, reloadTick]);

  const reloadUsers = () => setReloadTick((k) => k + 1);

  function openEdit(u: UserItem) {
    setEditTarget(u);
    setEFullName(u.fullName);
    setEPhone(u.phone || '');
    setEUnit(u.unit || '');
    setEError(null);
  }

  function openReset(u: UserItem) {
    setResetTarget(u);
    setRPassword('');
    setRMustChange(true);
    setRError(null);
  }

  function generateTempPassword(setter: (val: string) => void) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    const randomValues = new Uint32Array(10);
    window.crypto.getRandomValues(randomValues);
    let out = '';
    for (let i = 0; i < randomValues.length; i++) {
      out += chars[randomValues[i] % chars.length];
    }
    setter(out);
  }

  async function handleCreateSubmit(e: FormEvent) {
    e.preventDefault();
    setCError(null);
    setCSubmitting(true);
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          username: cUsername,
          fullName: cFullName,
          phone: cPhone,
          unit: cUnit,
          role: cRole,
          password: cPassword,
          mustChangePassword: cMustChange,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setCError(json.error?.message || 'Không thể tạo tài khoản.');
        return;
      }
      setCreateOpen(false);
      setCUsername('');
      setCFullName('');
      setCPhone('');
      setCUnit('');
      setCPassword('');
      setFeedback({
        type: 'ok',
        msg: `Đã tạo tài khoản ${json.data.fullName} (${json.data.username}).`,
      });
      setPage(1);
      reloadUsers();
    } catch {
      setCError('Lỗi kết nối máy chủ.');
    } finally {
      setCSubmitting(false);
    }
  }

  async function handleEditSubmit(e: FormEvent) {
    e.preventDefault();
    if (!editTarget) return;
    setEError(null);
    setESubmitting(true);
    try {
      const res = await fetch(`/api/users/${editTarget.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          fullName: eFullName,
          phone: ePhone,
          unit: eUnit,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setEError(json.error?.message || 'Không thể cập nhật tài khoản.');
        return;
      }
      setEditTarget(null);
      setFeedback({ type: 'ok', msg: `Đã cập nhật thông tin tài khoản ${json.data.fullName}.` });
      reloadUsers();
    } catch {
      setEError('Lỗi kết nối máy chủ.');
    } finally {
      setESubmitting(false);
    }
  }

  async function handleResetSubmit(e: FormEvent) {
    e.preventDefault();
    if (!resetTarget) return;
    setRError(null);
    setRSubmitting(true);
    try {
      const res = await fetch(`/api/users/${resetTarget.id}/reset-password`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          newPassword: rPassword,
          mustChangePassword: rMustChange,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setRError(json.error?.message || 'Không thể đặt lại mật khẩu.');
        return;
      }
      setResetTarget(null);
      setFeedback({
        type: 'ok',
        msg: `Đã đặt lại mật khẩu cho ${resetTarget.fullName} (${resetTarget.username}). Phiên đăng nhập cũ đã bị thu hồi.`,
      });
      reloadUsers();
    } catch {
      setRError('Lỗi kết nối máy chủ.');
    } finally {
      setRSubmitting(false);
    }
  }

  async function handleToggleLockConfirmed() {
    if (!lockTarget || lockSubmitting) return;
    setLockSubmitting(true);
    const nextActive = !lockTarget.isActive;
    try {
      const res = await fetch(`/api/users/${lockTarget.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ isActive: nextActive }),
      });
      const json = await res.json();
      if (!res.ok) {
        setFeedback({ type: 'err', msg: json.error?.message || 'Thao tác thất bại.' });
      } else {
        setFeedback({
          type: 'ok',
          msg: nextActive
            ? `Đã mở khóa tài khoản ${lockTarget.fullName}.`
            : `Đã khóa tài khoản ${lockTarget.fullName} và thu hồi phiên đăng nhập.`,
        });
        reloadUsers();
      }
    } catch {
      setFeedback({ type: 'err', msg: 'Lỗi kết nối máy chủ.' });
    } finally {
      setLockSubmitting(false);
      setLockTarget(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Quản lý tài khoản Giáo viên & Admin</h1>
          <p className="text-sm text-slate-500">
            Cấp tài khoản, cập nhật lớp/tổ chuyên môn, số điện thoại và khóa tài khoản khi cần.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setCreateOpen(true);
            setCError(null);
          }}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800"
        >
          <UserPlus className="h-4 w-4" />
          Thêm tài khoản mới
        </button>
      </div>

      {feedback && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            feedback.type === 'ok'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {feedback.msg}
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-2">
            {(
              [
                { value: 'ALL', label: 'Tất cả' },
                { value: 'true', label: 'Đang hoạt động' },
                { value: 'false', label: 'Đã khóa' },
              ] as const
            ).map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => {
                  setStatusFilter(f.value);
                  setPage(1);
                }}
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                  statusFilter === f.value
                    ? 'border-blue-600 bg-blue-50 text-blue-700'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="search"
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              placeholder="Tìm họ tên, username, SĐT, lớp..."
              className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm focus:border-blue-600 focus:outline-none"
            />
          </div>
        </div>

        {loading ? (
          <div className="py-10 text-center text-sm text-slate-500">Đang tải danh sách...</div>
        ) : loadError ? (
          <div className="flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3.5 text-sm text-red-800 sm:flex-row sm:items-center sm:justify-between">
            <span>{loadError}</span>
            <button
              type="button"
              onClick={() => {
                setLoadError(null);
                setLoading(true);
                reloadUsers();
              }}
              className="inline-flex items-center gap-1.5 self-start rounded-lg bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-800"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Thử lại
            </button>
          </div>
        ) : users.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-500">Không có tài khoản nào.</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                    <th className="py-2.5 pr-4 font-semibold">Họ tên & Tài khoản</th>
                    <th className="py-2.5 pr-4 font-semibold">Vai trò</th>
                    <th className="py-2.5 pr-4 font-semibold">Lớp / Tổ chuyên môn</th>
                    <th className="py-2.5 pr-4 font-semibold">Số điện thoại</th>
                    <th className="py-2.5 pr-4 font-semibold">Đang giữ học bạ</th>
                    <th className="py-2.5 pr-4 font-semibold">Trạng thái</th>
                    <th className="py-2.5 text-right font-semibold">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {users.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-50">
                      <td className="py-3 pr-4">
                        <div className="font-semibold text-slate-900">{u.fullName}</div>
                        <div className="text-xs text-slate-500">@{u.username}</div>
                      </td>
                      <td className="py-3 pr-4">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            u.role === 'ADMIN'
                              ? 'bg-purple-100 text-purple-800'
                              : 'bg-blue-100 text-blue-800'
                          }`}
                        >
                          {u.role === 'ADMIN' ? 'Admin' : 'Giáo viên'}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-slate-700">{u.unit || '—'}</td>
                      <td className="py-3 pr-4 text-slate-700">{u.phone || '—'}</td>
                      <td className="py-3 pr-4 font-semibold text-slate-800">
                        {u.activeLoanCount > 0 ? `${u.activeLoanCount} phiếu` : '0'}
                      </td>
                      <td className="py-3 pr-4">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            u.isActive
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {u.isActive ? 'Hoạt động' : 'Đã khóa'}
                        </span>
                      </td>
                      <td className="py-3 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEdit(u)}
                            title="Chỉnh sửa thông tin"
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            Sửa
                          </button>
                          <button
                            type="button"
                            onClick={() => openReset(u)}
                            title="Đặt lại mật khẩu"
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                          >
                            <KeyRound className="h-3.5 w-3.5" />
                            Reset MK
                          </button>
                          {u.id !== currentUserId && (
                            <button
                              type="button"
                              onClick={() => setLockTarget(u)}
                              className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-semibold ${
                                u.isActive
                                  ? 'border-red-200 text-red-700 hover:bg-red-50'
                                  : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                              }`}
                            >
                              {u.isActive ? (
                                <>
                                  <Lock className="h-3.5 w-3.5" /> Khóa
                                </>
                              ) : (
                                <>
                                  <Unlock className="h-3.5 w-3.5" /> Mở khóa
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex flex-col items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs text-slate-600 sm:flex-row">
              <span>
                Tổng cộng <strong>{total}</strong> tài khoản · Trang <strong>{page}</strong>/
                {totalPages}
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

      {/* Modal thêm tài khoản */}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">Thêm tài khoản mới</h3>
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {cError && (
              <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {cError}
              </div>
            )}
            <form onSubmit={handleCreateSubmit} className="space-y-3.5">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    Tên đăng nhập <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={cUsername}
                    onChange={(e) => setCUsername(e.target.value)}
                    placeholder="vd: gv_lan"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    Vai trò
                  </label>
                  <select
                    value={cRole}
                    onChange={(e) => setCRole(e.target.value as 'TEACHER' | 'ADMIN')}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    <option value="TEACHER">Giáo viên</option>
                    <option value="ADMIN">Admin (Giáo vụ)</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  Họ và tên <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={cFullName}
                  onChange={(e) => setCFullName(e.target.value)}
                  placeholder="vd: Nguyễn Thị Lan"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    Lớp chủ nhiệm / Tổ CM
                  </label>
                  <input
                    type="text"
                    value={cUnit}
                    onChange={(e) => setCUnit(e.target.value)}
                    placeholder="vd: 3A hoặc Tổ 4-5"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    Số điện thoại
                  </label>
                  <input
                    type="text"
                    value={cPhone}
                    onChange={(e) => setCPhone(e.target.value)}
                    placeholder="vd: 0901234567"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  Mật khẩu tạm <span className="text-red-600">*</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    minLength={6}
                    value={cPassword}
                    onChange={(e) => setCPassword(e.target.value)}
                    placeholder="Tối thiểu 6 ký tự"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => generateTempPassword(setCPassword)}
                    className="shrink-0 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Tạo ngẫu nhiên
                  </button>
                </div>
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={cMustChange}
                  onChange={(e) => setCMustChange(e.target.checked)}
                />
                Yêu cầu đổi mật khẩu khi đăng nhập lần đầu
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCreateOpen(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={cSubmitting}
                  className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
                >
                  {cSubmitting ? 'Đang tạo...' : 'Tạo tài khoản'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal sửa thông tin */}
      {editTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">
                Cập nhật tài khoản @{editTarget.username}
              </h3>
              <button
                type="button"
                onClick={() => setEditTarget(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {eError && (
              <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {eError}
              </div>
            )}
            <form onSubmit={handleEditSubmit} className="space-y-3.5">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">Họ và tên</label>
                <input
                  type="text"
                  required
                  value={eFullName}
                  onChange={(e) => setEFullName(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  Lớp / Tổ chuyên môn
                </label>
                <input
                  type="text"
                  value={eUnit}
                  onChange={(e) => setEUnit(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  Số điện thoại
                </label>
                <input
                  type="text"
                  value={ePhone}
                  onChange={(e) => setEPhone(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditTarget(null)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
                >
                  Đóng
                </button>
                <button
                  type="submit"
                  disabled={eSubmitting}
                  className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
                >
                  {eSubmitting ? 'Đang lưu...' : 'Lưu thay đổi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal reset mật khẩu */}
      {resetTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">
                Đặt lại mật khẩu: {resetTarget.fullName}
              </h3>
              <button
                type="button"
                onClick={() => setResetTarget(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {rError && (
              <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {rError}
              </div>
            )}
            <form onSubmit={handleResetSubmit} className="space-y-3.5">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  Mật khẩu tạm mới <span className="text-red-600">*</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    minLength={6}
                    value={rPassword}
                    onChange={(e) => setRPassword(e.target.value)}
                    placeholder="Tối thiểu 6 ký tự"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => generateTempPassword(setRPassword)}
                    className="shrink-0 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Tạo ngẫu nhiên
                  </button>
                </div>
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={rMustChange}
                  onChange={(e) => setRMustChange(e.target.checked)}
                />
                Bắt buộc đổi mật khẩu ở lần đăng nhập kế tiếp
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setResetTarget(null)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
                >
                  Đóng
                </button>
                <button
                  type="submit"
                  disabled={rSubmitting}
                  className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
                >
                  {rSubmitting ? 'Đang đặt lại...' : 'Xác nhận đặt lại'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal xác nhận khóa/mở khóa */}
      {lockTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-base font-bold text-slate-900">
              {lockTarget.isActive ? 'Khóa tài khoản?' : 'Mở khóa tài khoản?'}
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              {lockTarget.isActive
                ? `Tài khoản ${lockTarget.fullName} (@${lockTarget.username}) sẽ bị đăng xuất ngay và không thể tạo phiếu mượn mới. Các học bạ giáo viên này đang giữ vẫn hiển thị để theo dõi thu hồi.`
                : `Cho phép ${lockTarget.fullName} (@${lockTarget.username}) đăng nhập và mượn học bạ trở lại.`}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={lockSubmitting}
                onClick={() => setLockTarget(null)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={lockSubmitting}
                onClick={handleToggleLockConfirmed}
                className={`rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 ${
                  lockTarget.isActive
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                {lockSubmitting
                  ? 'Đang xử lý...'
                  : lockTarget.isActive
                    ? 'Xác nhận khóa'
                    : 'Xác nhận mở khóa'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
