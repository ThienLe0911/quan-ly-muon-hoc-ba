import { jsonSuccess, withApiErrorHandling } from '@/lib/api/response';
import { requireAuth } from '@/lib/auth/guards';

export const GET = withApiErrorHandling(async (req: Request) => {
  const auth = await requireAuth(req);
  if (auth.errorResponse) return auth.errorResponse;

  return jsonSuccess({ user: auth.user });
});
