import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { getSessionUser } from '@/lib/auth';
import { BrandMark } from '@/components/icons';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'כניסה למערכת' };

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) redirect(user.role === 'admin' ? '/admin' : '/report');

  return (
    <main className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      {/* ---------------------------------------------------------------- form */}
      <div className="flex items-center justify-center px-5 py-12 sm:px-10">
        <div className="w-full max-w-[380px] animate-fade-up">
          <div className="mb-9 flex items-center gap-3">
            <BrandMark className="size-9" />
            <div className="leading-tight">
              <p className="text-[15px] font-semibold text-ink">ניהול עמלות סוכנים</p>
              <p className="text-[12.5px] text-ink-muted">דיווח חודשי וחישוב עמלות</p>
            </div>
          </div>

          <h1 className="text-[26px] font-semibold leading-tight">כניסה למערכת</h1>
          <p className="mt-1.5 text-[14px] text-ink-muted">
            יש להזין את פרטי הכניסה שקיבלת ממנהל המערכת.
          </p>

          <LoginForm />
        </div>
      </div>

      {/* -------------------------------------------------------------- context */}
      <aside className="relative hidden overflow-hidden bg-brand-900 lg:block">
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.10]"
          style={{
            backgroundImage:
              'linear-gradient(var(--color-brand-200) 1px, transparent 1px), linear-gradient(90deg, var(--color-brand-200) 1px, transparent 1px)',
            backgroundSize: '52px 52px',
          }}
        />
        <div className="relative flex h-full flex-col justify-between p-12">
          <div className="max-w-md">
            <h2 className="text-[30px] font-semibold leading-snug text-white">
              דיווח חודשי מסודר,
              <br />
              חישוב עמלה מדויק.
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed text-brand-100/85">
              כל הנכסים שדווחו בחודש, החשבוניות והעמלה לתשלום – במקום אחד, עם שמירה קבועה
              והיסטוריה מלאה לכל חודש.
            </p>
          </div>

          <dl className="grid grid-cols-3 gap-6 border-t border-white/10 pt-8">
            {[
              { term: 'מע״מ', detail: 'מנוכה אוטומטית' },
              { term: '40%', detail: 'חלק הסוכן מהסכום ללא מע״מ' },
              { term: 'התראות', detail: 'זיהוי דיווחים כפולים' },
            ].map((item) => (
              <div key={item.term}>
                <dt className="text-[19px] font-semibold text-white">{item.term}</dt>
                <dd className="mt-1 text-[12.5px] leading-relaxed text-brand-100/70">{item.detail}</dd>
              </div>
            ))}
          </dl>
        </div>
      </aside>
    </main>
  );
}
