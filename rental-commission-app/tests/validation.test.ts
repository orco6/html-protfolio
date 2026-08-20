import { describe, expect, it } from 'vitest';

import { entryInputSchema, loginSchema, newAgentSchema } from '../src/lib/validation';

describe('entryInputSchema', () => {
  it('accepts a complete invoiced row and converts the amount to agorot', () => {
    const result = entryInputSchema.safeParse({
      propertyAddress: '  הרצל 5, תל אביב ',
      amountCollected: '4,200.00',
      hasInvoice: true,
      invoiceNumber: ' 1041 ',
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.propertyAddress).toBe('הרצל 5, תל אביב');
    expect(result.data.amountCollected).toBe(420_000);
    expect(result.data.invoiceNumber).toBe('1041');
  });

  it('accepts a row with no invoice', () => {
    const result = entryInputSchema.safeParse({
      propertyAddress: 'דיזנגוף 210',
      amountCollected: '2950.50',
      hasInvoice: false,
      invoiceNumber: '',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.invoiceNumber).toBeNull();
  });

  it('drops an invoice number when the invoice flag is off', () => {
    const result = entryInputSchema.safeParse({
      propertyAddress: 'דיזנגוף 210',
      amountCollected: '100',
      hasInvoice: false,
      invoiceNumber: '9999',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.invoiceNumber).toBeNull();
  });

  it('requires an invoice number when the invoice flag is on', () => {
    const result = entryInputSchema.safeParse({
      propertyAddress: 'דיזנגוף 210',
      amountCollected: '100',
      hasInvoice: true,
      invoiceNumber: '   ',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('invoiceNumber'))).toBe(true);
    }
  });

  it('rejects an empty address', () => {
    const result = entryInputSchema.safeParse({
      propertyAddress: '   ',
      amountCollected: '100',
      hasInvoice: false,
      invoiceNumber: '',
    });
    expect(result.success).toBe(false);
  });

  it.each(['-100', 'abc', '1.234', '', '1e5'])('rejects the amount %s', (amount) => {
    const result = entryInputSchema.safeParse({
      propertyAddress: 'הרצל 5',
      amountCollected: amount,
      hasInvoice: false,
      invoiceNumber: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an absurdly large amount', () => {
    const result = entryInputSchema.safeParse({
      propertyAddress: 'הרצל 5',
      amountCollected: '999999999999',
      hasInvoice: false,
      invoiceNumber: '',
    });
    expect(result.success).toBe(false);
  });

  it('returns Hebrew error messages', () => {
    const result = entryInputSchema.safeParse({
      propertyAddress: '',
      amountCollected: 'x',
      hasInvoice: false,
      invoiceNumber: '',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.every((i) => /[֐-׿]/.test(i.message))).toBe(true);
    }
  });
});

describe('loginSchema', () => {
  it('accepts a valid address', () => {
    expect(loginSchema.safeParse({ email: ' uri@nadlan.co.il ', password: 'x' }).success).toBe(true);
  });

  it('rejects a malformed address', () => {
    expect(loginSchema.safeParse({ email: 'not-an-email', password: 'x' }).success).toBe(false);
  });

  it('rejects an empty password', () => {
    expect(loginSchema.safeParse({ email: 'uri@nadlan.co.il', password: '' }).success).toBe(false);
  });
});

describe('newAgentSchema', () => {
  it('requires a password of at least eight characters', () => {
    const base = { fullName: 'דנה לוי', email: 'dana@nadlan.co.il' };
    expect(newAgentSchema.safeParse({ ...base, password: 'short' }).success).toBe(false);
    expect(newAgentSchema.safeParse({ ...base, password: 'longenough1' }).success).toBe(true);
  });

  it('requires a name', () => {
    expect(
      newAgentSchema.safeParse({ fullName: '  ', email: 'dana@nadlan.co.il', password: 'longenough1' })
        .success,
    ).toBe(false);
  });
});
