import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, Ref } from 'react';

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

/* -------------------------------------------------------------------------- */
/* Button                                                                      */
/* -------------------------------------------------------------------------- */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md';

const BUTTON_BASE =
  'inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg font-medium ' +
  'transition-[background-color,border-color,color,box-shadow] duration-150 ' +
  'disabled:cursor-not-allowed disabled:opacity-55 select-none whitespace-nowrap';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-brand-700 text-white shadow-xs hover:bg-brand-600 active:bg-brand-900 ' +
    'disabled:hover:bg-brand-700',
  secondary:
    'bg-surface text-ink-soft border border-line-strong hover:bg-canvas hover:text-ink ' +
    'active:bg-line/60',
  ghost: 'text-ink-muted hover:bg-canvas hover:text-ink',
  danger:
    'bg-surface text-danger-600 border border-danger-600/25 hover:bg-danger-50 ' +
    'hover:border-danger-600/45',
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  // 44px on touch, 36px from md up where a mouse makes the density worthwhile.
  sm: 'h-11 px-3.5 text-[14px] md:h-9 md:px-3 md:text-[13px]',
  md: 'h-11 px-4 text-[15px]',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({ variant = 'secondary', size = 'md', className, ...props }: ButtonProps) {
  return (
    <button
      {...props}
      className={cx(BUTTON_BASE, BUTTON_VARIANTS[variant], BUTTON_SIZES[size], className)}
    />
  );
}

/** An anchor that looks exactly like a Button — for navigation, not actions. */
export function linkButtonClass(variant: ButtonVariant = 'secondary', size: ButtonSize = 'md'): string {
  return cx(BUTTON_BASE, BUTTON_VARIANTS[variant], BUTTON_SIZES[size]);
}

/* -------------------------------------------------------------------------- */
/* Field + Input                                                               */
/* -------------------------------------------------------------------------- */

export const INPUT_CLASS =
  // 16px on small screens: anything smaller makes iOS Safari zoom the page on
  // focus, which is ruinous for a form people fill in twenty times in a row.
  'w-full rounded-lg border border-line-strong bg-surface px-3 text-[16px] md:text-[15px] text-ink ' +
  'placeholder:text-ink-faint transition-colors duration-150 ' +
  'hover:border-ink-faint focus:border-brand-500 focus:outline-none ' +
  'focus:ring-2 focus:ring-brand-500/25 disabled:cursor-not-allowed disabled:bg-canvas disabled:text-ink-muted';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
  /** Renders digits LTR and tabular — use for money and invoice numbers. */
  numeric?: boolean;
  ref?: Ref<HTMLInputElement>;
}

export function Input({ className, invalid, numeric, ...props }: InputProps) {
  return (
    <input
      {...props}
      aria-invalid={invalid || undefined}
      className={cx(
        INPUT_CLASS,
        'h-11',
        numeric && 'tnum',
        invalid && 'border-danger-600 focus:border-danger-600 focus:ring-danger-600/20',
        className,
      )}
    />
  );
}

export function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  error?: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      <label htmlFor={htmlFor} className="text-[13px] font-medium text-ink-soft">
        {label}
      </label>
      {children}
      {error ? (
        <p role="alert" className="text-[12.5px] text-danger-600">
          {error}
        </p>
      ) : hint ? (
        <p className="text-[12.5px] text-ink-muted">{hint}</p>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Badge                                                                       */
/* -------------------------------------------------------------------------- */

type BadgeTone = 'neutral' | 'payable' | 'pending' | 'conflict' | 'brand';

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: 'bg-canvas text-ink-muted border-line',
  payable: 'bg-payable-50 text-payable-700 border-payable-600/20',
  pending: 'bg-pending-50 text-pending-700 border-pending-200',
  conflict: 'bg-conflict-50 text-conflict-700 border-conflict-200',
  brand: 'bg-brand-50 text-brand-700 border-brand-200',
};

export function Badge({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-2 py-0.5 text-[12px] font-medium leading-5',
        BADGE_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Callout                                                                     */
/* -------------------------------------------------------------------------- */

export function Callout({
  tone = 'conflict',
  title,
  children,
  className,
  role,
}: {
  tone?: 'conflict' | 'pending' | 'brand';
  title?: string;
  children: ReactNode;
  className?: string;
  role?: 'alert' | 'status';
}) {
  const tones = {
    conflict: 'border-conflict-200 bg-conflict-50 text-conflict-700',
    pending: 'border-pending-200 bg-pending-50 text-pending-700',
    brand: 'border-brand-200 bg-brand-50 text-brand-700',
  } as const;

  return (
    <div
      role={role}
      className={cx('rounded-lg border px-4 py-3 text-[13.5px] leading-relaxed', tones[tone], className)}
    >
      {title ? <p className="mb-1 font-semibold">{title}</p> : null}
      {children}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Page furniture                                                              */
/* -------------------------------------------------------------------------- */

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-[22px] font-semibold leading-tight sm:text-[26px]">{title}</h1>
        {subtitle ? <div className="mt-1 text-[14px] text-ink-muted">{subtitle}</div> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <div
        aria-hidden
        className="flex size-11 items-center justify-center rounded-full border border-line bg-surface-sunken"
      >
        <svg viewBox="0 0 24 24" className="size-5 text-ink-faint" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M4 7h16M4 12h16M4 17h9" strokeLinecap="round" />
        </svg>
      </div>
      <div>
        <p className="text-[15px] font-medium text-ink">{title}</p>
        <p className="mx-auto mt-1 max-w-sm text-[13.5px] leading-relaxed text-ink-muted">{description}</p>
      </div>
      {action}
    </div>
  );
}
