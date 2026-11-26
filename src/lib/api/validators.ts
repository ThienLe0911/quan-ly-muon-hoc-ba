import { z } from 'zod';
import { cleanDisplayText, normalizeAndValidateSchoolYear } from '@/lib/domain/record-identity';
import { isValidDateString } from '@/lib/domain/overdue';

export const loginSchema = z.object({
  username: z
    .string()
    .trim()
    .min(1, 'Vui lòng nhập tên đăng nhập.')
    .max(50, 'Tên đăng nhập tối đa 50 ký tự.'),
  password: z.string().min(1, 'Vui lòng nhập mật khẩu.'),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Vui lòng nhập mật khẩu hiện tại.'),
  newPassword: z
    .string()
    .min(6, 'Mật khẩu mới phải có ít nhất 6 ký tự.')
    .max(100, 'Mật khẩu mới tối đa 100 ký tự.'),
});

export const createUserSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, 'Tên đăng nhập phải có ít nhất 3 ký tự.')
    .max(50, 'Tên đăng nhập tối đa 50 ký tự.')
    .regex(
      /^[a-zA-Z0-9._@-]+$/,
      'Tên đăng nhập chỉ được chứa chữ cái không dấu, số và ký tự . _ @ -'
    )
    .transform((v) => v.toLowerCase()),
  fullName: z
    .string()
    .transform(cleanDisplayText)
    .refine((v) => v.length >= 2 && v.length <= 100, 'Họ và tên phải từ 2 đến 100 ký tự.'),
  role: z.enum(['ADMIN', 'TEACHER']).default('TEACHER'),
  phone: z
    .string()
    .optional()
    .nullable()
    .transform((v) => {
      if (!v) return null;
      const cleaned = v.trim();
      return cleaned === '' ? null : cleaned;
    })
    .refine(
      (v) => v === null || /^[0-9+\s.-]{8,20}$/.test(v),
      'Số điện thoại không hợp lệ (8–20 ký tự số).'
    ),
  unit: z
    .string()
    .optional()
    .nullable()
    .transform((v) => {
      if (!v) return null;
      const cleaned = cleanDisplayText(v);
      return cleaned === '' ? null : cleaned;
    })
    .refine((v) => v === null || v.length <= 60, 'Lớp/Tổ chuyên môn tối đa 60 ký tự.'),
  password: z
    .string()
    .min(6, 'Mật khẩu tạm phải có ít nhất 6 ký tự.')
    .max(100, 'Mật khẩu tối đa 100 ký tự.'),
  mustChangePassword: z.boolean().optional().default(true),
});

export const updateUserSchema = z
  .object({
    fullName: z
      .string()
      .transform(cleanDisplayText)
      .refine((v) => v.length >= 2 && v.length <= 100, 'Họ và tên phải từ 2 đến 100 ký tự.')
      .optional(),
    phone: z
      .string()
      .nullable()
      .optional()
      .transform((v) => {
        if (v === undefined) return undefined;
        if (v === null) return null;
        const cleaned = v.trim();
        return cleaned === '' ? null : cleaned;
      })
      .refine(
        (v) => v === undefined || v === null || /^[0-9+\s.-]{8,20}$/.test(v),
        'Số điện thoại không hợp lệ.'
      ),
    unit: z
      .string()
      .nullable()
      .optional()
      .transform((v) => {
        if (v === undefined) return undefined;
        if (v === null) return null;
        const cleaned = cleanDisplayText(v);
        return cleaned === '' ? null : cleaned;
      })
      .refine((v) => v === undefined || v === null || v.length <= 60, 'Lớp/Tổ tối đa 60 ký tự.'),
    role: z.enum(['ADMIN', 'TEACHER']).optional(),
    isActive: z.boolean().optional(),
  })
  .refine(
    (data) =>
      data.fullName !== undefined ||
      data.phone !== undefined ||
      data.unit !== undefined ||
      data.role !== undefined ||
      data.isActive !== undefined,
    'Không có thông tin nào cần cập nhật.'
  );

export const resetPasswordSchema = z.object({
  newPassword: z
    .string()
    .min(6, 'Mật khẩu mới phải có ít nhất 6 ký tự.')
    .max(100, 'Mật khẩu mới tối đa 100 ký tự.'),
  mustChangePassword: z.boolean().optional().default(true),
});

export const createLoanSchema = z
  .object({
    loanType: z.enum(['INDIVIDUAL', 'WHOLE_CLASS']).optional().default('INDIVIDUAL'),
    className: z
      .string()
      .transform(cleanDisplayText)
      .refine((v) => v.length >= 1 && v.length <= 30, 'Lớp học sinh phải từ 1 đến 30 ký tự.'),
    studentName: z
      .string()
      .optional()
      .nullable()
      .transform((v) => (v ? cleanDisplayText(v) : '')),
    quantity: z
      .union([z.number(), z.null(), z.undefined()])
      .optional()
      .refine(
        (v) =>
          v === undefined ||
          v === null ||
          (Number.isInteger(v) && v >= 1 && v <= 200),
        'Số lượng học bạ phải là số nguyên từ 1 đến 200.'
      ),
    schoolYear: z.string().superRefine((val, ctx) => {
      const res = normalizeAndValidateSchoolYear(val);
      if (!res.valid) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: res.error || 'Niên khóa không hợp lệ.',
        });
      }
    }),
    dueDate: z
      .string()
      .trim()
      .refine(isValidDateString, 'Hạn ngày trả không hợp lệ (định dạng YYYY-MM-DD).'),
    borrowNote: z
      .string()
      .optional()
      .nullable()
      .transform((v) => {
        if (!v) return null;
        const cleaned = cleanDisplayText(v);
        return cleaned === '' ? null : cleaned;
      })
      .refine((v) => v === null || v.length <= 300, 'Ghi chú mượn tối đa 300 ký tự.'),
  })
  .superRefine((data, ctx) => {
    if (data.loanType === 'INDIVIDUAL') {
      if (data.studentName.length < 2 || data.studentName.length > 100) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['studentName'],
          message: 'Tên học sinh phải từ 2 đến 100 ký tự.',
        });
      }
    }
  });

export const returnLoanSchema = z.object({
  returnNote: z
    .string()
    .optional()
    .nullable()
    .transform((v) => {
      if (!v) return null;
      const cleaned = cleanDisplayText(v);
      return cleaned === '' ? null : cleaned;
    })
    .refine((v) => v === null || v.length <= 300, 'Ghi chú khi trả tối đa 300 ký tự.'),
});

export const cancelLoanSchema = z.object({
  reason: z
    .string()
    .transform(cleanDisplayText)
    .refine(
      (v) => v.length >= 3 && v.length <= 300,
      'Lý do hủy phiếu phải từ 3 đến 300 ký tự.'
    ),
});

export const updateSettingsSchema = z
  .object({
    defaultLoanDays: z
      .number()
      .int('Số ngày mượn mặc định phải là số nguyên.')
      .min(1, 'Hạn mượn mặc định tối thiểu 1 ngày.')
      .max(90, 'Hạn mượn mặc định tối đa 90 ngày.'),
    maxLoanDays: z
      .number()
      .int('Số ngày mượn tối đa phải là số nguyên.')
      .min(1, 'Hạn mượn tối đa tối thiểu 1 ngày.')
      .max(365, 'Hạn mượn tối đa không vượt quá 365 ngày.'),
  })
  .refine(
    (v) => v.maxLoanDays >= v.defaultLoanDays,
    'Số ngày mượn tối đa phải lớn hơn hoặc bằng số ngày mượn mặc định.'
  );
