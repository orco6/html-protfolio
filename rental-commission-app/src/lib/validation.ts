import { z } from 'zod';

import { MIN_YEAR } from './periods';
import { parseAmountToAgorot } from './money';

export const MESSAGES = {
  addressRequired: 'יש להזין כתובת נכס',
  addressTooLong: 'הכתובת ארוכה מדי (עד 200 תווים)',
  amountRequired: 'יש להזין סכום שנגבה',
  amountInvalid: 'הסכום אינו תקין – יש להזין מספר חיובי, עד שתי ספרות אחרי הנקודה',
  amountTooLarge: 'הסכום גבוה מהמותר',
  invoiceRequired: 'יש להזין מספר חשבונית',
  invoiceTooLong: 'מספר החשבונית ארוך מדי (עד 50 תווים)',
  emailInvalid: 'כתובת דוא״ל אינה תקינה',
  passwordTooShort: 'הסיסמה חייבת להכיל לפחות 8 תווים',
  nameRequired: 'יש להזין שם מלא',
  periodInvalid: 'החודש שנבחר אינו תקין',
} as const;

const MAX_AMOUNT_AGOROT = 100_000_000_00; // ₪100,000,000

const amountField = z
  .string()
  .trim()
  .min(1, MESSAGES.amountRequired)
  .transform((value, ctx) => {
    const agorot = parseAmountToAgorot(value);
    if (agorot === null) {
      ctx.addIssue({ code: 'custom', message: MESSAGES.amountInvalid });
      return z.NEVER;
    }
    if (agorot > MAX_AMOUNT_AGOROT) {
      ctx.addIssue({ code: 'custom', message: MESSAGES.amountTooLarge });
      return z.NEVER;
    }
    return agorot;
  });

export const periodSchema = z.object({
  year: z.coerce.number().int().min(MIN_YEAR, MESSAGES.periodInvalid).max(2200, MESSAGES.periodInvalid),
  month: z.coerce.number().int().min(1, MESSAGES.periodInvalid).max(12, MESSAGES.periodInvalid),
});

export const entryInputSchema = z
  .object({
    propertyAddress: z
      .string()
      .trim()
      .min(1, MESSAGES.addressRequired)
      .max(200, MESSAGES.addressTooLong),
    amountCollected: amountField,
    hasInvoice: z.coerce.boolean(),
    invoiceNumber: z
      .string()
      .trim()
      .max(50, MESSAGES.invoiceTooLong)
      .optional()
      .transform((v) => (v ? v : null)),
  })
  .superRefine((value, ctx) => {
    if (value.hasInvoice && !value.invoiceNumber) {
      ctx.addIssue({ code: 'custom', path: ['invoiceNumber'], message: MESSAGES.invoiceRequired });
    }
  })
  .transform((value) => ({
    ...value,
    // an invoice number without an invoice is meaningless; drop it
    invoiceNumber: value.hasInvoice ? value.invoiceNumber : null,
  }));

export type EntryInput = z.infer<typeof entryInputSchema>;

export const createEntrySchema = periodSchema.and(entryInputSchema);

export const loginSchema = z.object({
  email: z.string().trim().min(1, MESSAGES.emailInvalid).pipe(z.email(MESSAGES.emailInvalid)),
  password: z.string().min(1, 'יש להזין סיסמה'),
});

export const newAgentSchema = z.object({
  fullName: z.string().trim().min(1, MESSAGES.nameRequired).max(80),
  email: z.string().trim().min(1, MESSAGES.emailInvalid).pipe(z.email(MESSAGES.emailInvalid)),
  password: z.string().min(8, MESSAGES.passwordTooShort).max(128),
});

export const uuidSchema = z.uuid('מזהה אינו תקין');

/** Flattens a ZodError into `{ field: firstMessage }` for inline form display. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    out[key] ??= issue.message;
  }
  return out;
}
