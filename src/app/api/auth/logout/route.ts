import { jsonSuccess, withApiErrorHandling } from '@/lib/api/response';
import {
  clearSessionCookie,
  getSessionTokenFromRequest,
  getSessionUser,
  revokeSessionByToken,
} from '@/lib/auth/session';
import { writeAuditLog } from '@/lib/audit/logger';

export const POST = withApiErrorHandling(async (req: Request) => {
  const user = await getSessionUser(req);
  const rawToken = await getSessionTokenFromRequest(req);

  if (rawToken) {
    await revokeSessionByToken(rawToken);
  }

  if (user) {
    await writeAuditLog({
      actorId: user.id,
      action: 'LOGOUT',
      targetType: 'AUTH',
      targetId: user.id,
      metadata: { username: user.username },
    });
  }

  const response = jsonSuccess({ loggedOut: true });
  clearSessionCookie(response);
  return response;
});
