import { NextResponse } from 'next/server';

export function jsonSuccess<T>(
  data: T,
  meta?: Record<string, unknown>,
  status: number = 200
): NextResponse {
  const body = meta ? { data, meta } : { data };
  return NextResponse.json(body, { status });
}

export function jsonError(
  code: string,
  message: string,
  status: number,
  details?: unknown
): NextResponse {
  const errorPayload: Record<string, unknown> = { code, message };
  if (details !== undefined) {
    errorPayload.details = details;
  }
  return NextResponse.json({ error: errorPayload }, { status });
}

export async function parseJsonBody(
  req: Request
): Promise<{ data: unknown; errorResponse?: never } | { data?: never; errorResponse: NextResponse }> {
  try {
    const data = await req.json();
    return { data };
  } catch {
    return {
      errorResponse: jsonError(
        'INVALID_JSON',
        'Dữ liệu gửi lên không đúng định dạng JSON.',
        400
      ),
    };
  }
}

export function escapeLikePattern(input: string): string {
  return input.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

export function isSqliteUniqueError(err: unknown, depth: number = 0): boolean {
  if (!err || typeof err !== 'object' || depth > 3) return false;
  const record = err as { code?: unknown; message?: unknown; cause?: unknown };
  const code = record.code ? String(record.code) : '';
  const msg = record.message ? String(record.message) : '';
  if (
    code === 'SQLITE_CONSTRAINT_UNIQUE' ||
    msg.includes('UNIQUE constraint failed') ||
    (code === 'SQLITE_CONSTRAINT' && msg.toUpperCase().includes('UNIQUE'))
  ) {
    return true;
  }
  if (record.cause) {
    return isSqliteUniqueError(record.cause, depth + 1);
  }
  return false;
}

export function withApiErrorHandling<TArgs extends unknown[]>(
  handler: (...args: TArgs) => Promise<Response>
): (...args: TArgs) => Promise<Response> {
  return async (...args: TArgs) => {
    try {
      return await handler(...args);
    } catch (err) {
      console.error('[API Error]', err);
      return jsonError(
        'INTERNAL_ERROR',
        'Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau.',
        500
      );
    }
  };
}
