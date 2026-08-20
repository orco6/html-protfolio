'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { login } from '@/lib/auth';
import { loginSchema, fieldErrors } from '@/lib/validation';

export interface LoginState {
  error?: string;
  fields?: Record<string, string>;
  email?: string;
}

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get('email') ?? '');
  const parsed = loginSchema.safeParse({ email, password: String(formData.get('password') ?? '') });

  if (!parsed.success) {
    return { fields: fieldErrors(parsed.error), email };
  }

  const userAgent = (await headers()).get('user-agent') ?? undefined;
  const result = await login(parsed.data.email, parsed.data.password, userAgent);

  if (!result.ok) {
    const messages = {
      inactive: 'המשתמש אינו פעיל. יש לפנות למנהל המערכת.',
      throttled: 'בוצעו יותר מדי ניסיונות כניסה. יש להמתין 15 דקות ולנסות שוב.',
      invalid_credentials: 'שם משתמש או סיסמה שגויים.',
    } as const;
    return { email, error: messages[result.reason] };
  }

  redirect(result.user.role === 'admin' ? '/admin' : '/report');
}
