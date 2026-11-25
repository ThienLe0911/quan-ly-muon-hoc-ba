export function cleanDisplayText(input: string): string {
  return input.normalize('NFC').trim().replace(/\s+/g, ' ');
}

export interface SchoolYearValidationResult {
  valid: boolean;
  normalized: string;
  error?: string;
}

export function normalizeAndValidateSchoolYear(input: string): SchoolYearValidationResult {
  const normalized = input
    .normalize('NFC')
    .trim()
    .replace(/\s*[–—−-]\s*/g, '-')
    .replace(/\s+/g, '');

  const match = /^(\d{4})-(\d{4})$/.exec(normalized);
  if (!match) {
    return {
      valid: false,
      normalized,
      error: 'Niên khóa bắt buộc đúng định dạng YYYY-YYYY (ví dụ: 2025-2026 hoặc 2021-2026).',
    };
  }

  const startYear = Number.parseInt(match[1], 10);
  const endYear = Number.parseInt(match[2], 10);

  if (startYear < 1990 || endYear > 2100) {
    return {
      valid: false,
      normalized,
      error: 'Năm trong niên khóa phải nằm trong khoảng 1990–2100.',
    };
  }

  const diff = endYear - startYear;
  if (diff <= 0) {
    return {
      valid: false,
      normalized,
      error: 'Năm kết thúc niên khóa phải lớn hơn năm bắt đầu.',
    };
  }

  if (diff > 10) {
    return {
      valid: false,
      normalized,
      error: 'Khoảng cách niên khóa không hợp lệ (tối đa 10 năm).',
    };
  }

  return { valid: true, normalized };
}

export interface NormalizedRecordIdentity {
  className: string;
  studentName: string;
  schoolYear: string;
  recordIdentityKey: string;
}

export function buildRecordIdentityKey(
  className: string,
  studentName: string,
  schoolYear: string
): string {
  const c = cleanDisplayText(className).toLocaleLowerCase('vi-VN');
  const s = cleanDisplayText(studentName).toLocaleLowerCase('vi-VN');
  const y = schoolYear.normalize('NFC').trim().toLocaleLowerCase('vi-VN');
  return `${c}|${s}|${y}`;
}

export function normalizeRecordIdentity(params: {
  className: string;
  studentName: string;
  schoolYear: string;
}): NormalizedRecordIdentity {
  const className = cleanDisplayText(params.className);
  const studentName = cleanDisplayText(params.studentName);
  const schoolYearCheck = normalizeAndValidateSchoolYear(params.schoolYear);

  if (!schoolYearCheck.valid) {
    throw new Error(schoolYearCheck.error || 'Niên khóa không hợp lệ.');
  }

  return {
    className,
    studentName,
    schoolYear: schoolYearCheck.normalized,
    recordIdentityKey: buildRecordIdentityKey(className, studentName, schoolYearCheck.normalized),
  };
}
