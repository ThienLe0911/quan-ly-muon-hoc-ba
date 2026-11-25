import type { NextResponse } from 'next/server';
import { jsonError } from '@/lib/api/response';
import { getSessionUser, type AuthenticatedUser } from './session';

type GuardResult =
  | { user: AuthenticatedUser; errorResponse?: never }
  | { user?: never; errorResponse: NextResponse };

export async function requireAuth(req?: Request): Promise<GuardResult> {
  const user = await getSessionUser(req);
  if (!user) {
    return {
      errorResponse: jsonError(
        'UNAUTHORIZED',
        'Vui lòng đăng nhập để tiếp tục.',
        401
      ),
    };
  }
  return { user };
}

export async function requireAdmin(req?: Request): Promise<GuardResult> {
  const auth = await requireAuth(req);
  if (auth.errorResponse) return auth;

  if (auth.user.role !== 'ADMIN') {
    return {
      errorResponse: jsonError(
        'FORBIDDEN',
        'Bạn không có quyền quản trị viên để thực hiện thao tác này.',
        403
      ),
    };
  }

  return auth;
}

export async function requireTeacher(req?: Request): Promise<GuardResult> {
  const auth = await requireAuth(req);
  if (auth.errorResponse) return auth;

  if (auth.user.role !== 'TEACHER') {
    return {
      errorResponse: jsonError(
        'FORBIDDEN',
        'Chỉ tài khoản giáo viên mới được phép tạo phiếu mượn học bạ (không hỗ trợ mượn hộ).',
        403
      ),
    };
  }

  return auth;
}
