export function normalizeVietnameseText(val: string | null | undefined): string {
  if (val === null || val === undefined) return '';
  return String(val).normalize('NFC').toLocaleLowerCase('vi-VN');
}

export function stripVietnameseAccents(val: string): string {
  return val
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd');
}

/**
 * Chuẩn hóa chuỗi tìm kiếm lưu trên DB (tương thích Turso không cần SQLite JS UDF):
 * - Giữ bản NFC chữ thường theo tiếng Việt để khớp chính xác có dấu và NFD từ client.
 * - Kèm bản không dấu để hỗ trợ tìm kiếm không dấu tiện lợi cho giáo vụ/giáo viên.
 * - Ngăn cách bằng '\n' để không tạo chuỗi giả chứa wildcard '_' hay '%'.
 */
export function buildSearchText(parts: Array<string | null | undefined>): string {
  const tokens = new Set<string>();
  for (const part of parts) {
    const nfc = normalizeVietnameseText(part).trim();
    if (!nfc) continue;
    tokens.add(nfc);
    const ascii = stripVietnameseAccents(nfc);
    if (ascii && ascii !== nfc) {
      tokens.add(ascii);
    }
  }
  return Array.from(tokens).join('\n');
}

export function buildUserSearchText(input: {
  fullName: string;
  username: string;
  phone?: string | null;
  unit?: string | null;
}): string {
  return buildSearchText([input.fullName, input.username, input.phone, input.unit]);
}

export function buildLoanSearchText(input: {
  studentName: string;
  className: string;
  schoolYear: string;
  teacherNameSnapshot: string;
  teacherUnitSnapshot?: string | null;
  teacherPhoneSnapshot?: string | null;
  loanType?: 'INDIVIDUAL' | 'WHOLE_CLASS';
}): string {
  return buildSearchText([
    input.studentName,
    input.loanType === 'WHOLE_CLASS' ? 'Cả lớp' : null,
    input.className,
    input.schoolYear,
    input.teacherNameSnapshot,
    input.teacherUnitSnapshot,
    input.teacherPhoneSnapshot,
  ]);
}

export function buildClassNameNorm(className: string): string {
  return buildSearchText([className]);
}

export function buildAuditSearchText(input: {
  action: string;
  targetId?: string | null;
  metadataJson?: string | null;
}): string {
  return buildSearchText([input.action, input.targetId, input.metadataJson]);
}
