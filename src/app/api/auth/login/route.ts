import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { users } from '@/db/schema';
import { jsonError, jsonSuccess, parseJsonBody, withApiErrorHandling } from '@/lib/api/response';
import { loginSchema } from '@/lib/api/validators';
import { verifyPassword } from '@/lib/auth/password';
import {
  buildLoginRateKey,
  buildUsernameRateKey,
  clearLoginFailures,
  isLoginRateLimited,
  MAX_USERNAME_FAILURES,
  recordLoginFailure,
} from '@/lib/auth/rate-limit';
import { createSession, setSessionCookie } from '@/lib/auth/session';
import { writeAuditLog } from '@/lib/audit/logger';

export const POST = withApiErrorHandling(async (req: Request) => {
  const parsedBody = await parseJsonBody(req);
  if (parsedBody.errorResponse) return parsedBody.errorResponse;

  const validated = loginSchema.safeParse(parsedBody.data);
  if (!validated.success) {
    return jsonError(
      'VALIDATION_ERROR',
      validated.error.issues[0]?.message || 'Thông tin đăng nhập không hợp lệ.',
      400,
      validated.error.flatten().fieldErrors
    );
  }

  const normalizedUsername = validated.data.username.toLowerCase();
  const rateKey = buildLoginRateKey(req, normalizedUsername);
  const usernameRateKey = buildUsernameRateKey(normalizedUsername);

  if (
    (await isLoginRateLimited(rateKey)) ||
    (await isLoginRateLimited(usernameRateKey, Date.now(), MAX_USERNAME_FAILURES))
  ) {
    return jsonError(
      'TOO_MANY_ATTEMPTS',
      'Bạn đã nhập sai quá nhiều lần. Vui lòng thử lại sau 15 phút.',
      429
    );
  }

  const db = await getDb();
  const user = await db
    .select()
    .from(users)
    .where(eq(users.username, normalizedUsername))
    .limit(1)
    .get();

  if (!user) {
    await recordLoginFailure(rateKey);
    await recordLoginFailure(usernameRateKey);
    await writeAuditLog({
      actorId: null,
      action: 'LOGIN_FAILED',
      targetType: 'AUTH',
      metadata: { username: normalizedUsername, reason: 'USER_NOT_FOUND' },
    });
    return jsonError('INVALID_CREDENTIALS', 'Tên đăng nhập hoặc mật khẩu không đúng.', 401);
  }

  // MEDIUM-03: Kiểm tra mật khẩu trước khi kiểm tra trạng thái khóa để tránh account enumeration
  const passwordValid = verifyPassword(validated.data.password, user.passwordHash);
  if (!passwordValid) {
    await recordLoginFailure(rateKey);
    await recordLoginFailure(usernameRateKey);
    await writeAuditLog({
      actorId: user.id,
      action: 'LOGIN_FAILED',
      targetType: 'AUTH',
      targetId: user.id,
      metadata: { username: normalizedUsername, reason: 'WRONG_PASSWORD' },
    });
    return jsonError('INVALID_CREDENTIALS', 'Tên đăng nhập hoặc mật khẩu không đúng.', 401);
  }

  if (user.isActive !== 1) {
    await recordLoginFailure(rateKey);
    await recordLoginFailure(usernameRateKey);
    await writeAuditLog({
      actorId: user.id,
      action: 'LOGIN_FAILED',
      targetType: 'AUTH',
      targetId: user.id,
      metadata: { username: normalizedUsername, reason: 'ACCOUNT_LOCKED' },
    });
    return jsonError(
      'ACCOUNT_LOCKED',
      'Tài khoản của bạn hiện đang bị khóa. Vui lòng liên hệ văn thư.',
      403
    );
  }

  await clearLoginFailures(rateKey);
  await clearLoginFailures(usernameRateKey);
  const { rawToken, expiresAt } = await createSession(user.id);

  await writeAuditLog({
    actorId: user.id,
    action: 'LOGIN_SUCCESS',
    targetType: 'AUTH',
    targetId: user.id,
    metadata: { username: user.username, role: user.role },
  });

  const response = jsonSuccess({
    user: {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      role: user.role,
      phone: user.phone,
      unit: user.unit,
      isActive: user.isActive === 1,
      mustChangePassword: user.mustChangePassword === 1,
    },
  });

  setSessionCookie(response, rawToken, expiresAt);
  return response;
});
