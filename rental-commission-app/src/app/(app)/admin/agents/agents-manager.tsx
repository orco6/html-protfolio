'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useRef, useState, useTransition } from 'react';
import { useFormStatus } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';

import { Badge, Button, Callout, Field, Input, cx } from '@/components/ui';
import { AlertIcon, CheckIcon, PlusIcon } from '@/components/icons';
import type { AgentProfile } from '@/lib/agents';
import { createAgentAction, setAgentActiveAction, type AgentFormState } from './actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    // The spacer mirrors a Field's label row so the button's top edge lines up
    // with the inputs beside it, regardless of any hint text below them.
    <div className="flex flex-col gap-1.5">
      <span aria-hidden className="hidden text-[13px] font-medium leading-5 lg:block">
        &nbsp;
      </span>
      <Button type="submit" variant="primary" disabled={pending}>
        <PlusIcon className="size-4" />
        {pending ? 'מוסיף…' : 'הוספת סוכן'}
      </Button>
    </div>
  );
}

function NewAgentForm() {
  const [state, formAction] = useActionState<AgentFormState, FormData>(createAgentAction, {});
  const formRef = useRef<HTMLFormElement>(null);
  const focusRef = useRef<HTMLInputElement>(null);

  /**
   * Clear the fields after a successful add, ready for the next one.
   *
   * `form.reset()` rather than remounting the form with a changing `key`:
   * a remount tears the subtree down, and because the action's own
   * `revalidatePath` refreshes the route in the same window, the confirmation
   * could be destroyed before it was ever painted. Resetting leaves every
   * node — and therefore the action state — in place.
   */
  useEffect(() => {
    if (!state.ok) return;
    formRef.current?.reset();
    focusRef.current?.focus();
  }, [state.ok, state.message]);

  return (
    <section className="card overflow-hidden">
      <div className="border-b border-line px-4 py-3.5 sm:px-5">
        <h2 className="text-[15px] font-semibold">הוספת סוכן</h2>
        <p className="mt-0.5 text-[12.5px] text-ink-muted">
          הסוכן יוכל להתחבר עם כתובת הדוא״ל והסיסמה שתגדירו כאן.
        </p>
      </div>

      {state.error || (state.ok && state.message) ? (
        <div className="px-4 pt-4 sm:px-5">
          {state.error ? (
            <Callout role="alert" tone="conflict" className="flex items-start gap-2">
              <AlertIcon className="mt-0.5 size-4 shrink-0" />
              <span>{state.error}</span>
            </Callout>
          ) : (
            <Callout role="status" tone="brand" className="flex items-start gap-2">
              <CheckIcon className="mt-0.5 size-4 shrink-0" />
              <span>{state.message}</span>
            </Callout>
          )}
        </div>
      ) : null}

      <form
        ref={formRef}
        action={formAction}
        className="flex flex-col gap-4 px-4 py-4 sm:px-5"
        noValidate
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
          <Field label="שם מלא" htmlFor="fullName" error={state.fields?.fullName}>
            <Input
              id="fullName"
              name="fullName"
              ref={focusRef}
              required
              autoComplete="off"
              placeholder="לדוגמה: דנה לוי"
              defaultValue={state.values?.fullName}
              invalid={Boolean(state.fields?.fullName)}
            />
          </Field>

          <Field label="דוא״ל" htmlFor="agentEmail" error={state.fields?.email}>
            <Input
              id="agentEmail"
              name="email"
              type="email"
              dir="ltr"
              className="text-start"
              required
              autoComplete="off"
              placeholder="name@example.com"
              defaultValue={state.values?.email}
              invalid={Boolean(state.fields?.email)}
            />
          </Field>

          <Field
            label="סיסמה ראשונית"
            htmlFor="agentPassword"
            error={state.fields?.password}
            hint="לפחות 8 תווים"
          >
            <Input
              id="agentPassword"
              name="password"
              type="text"
              dir="ltr"
              className="text-start"
              required
              autoComplete="new-password"
              invalid={Boolean(state.fields?.password)}
            />
          </Field>

          <SubmitButton />
        </div>
      </form>
    </section>
  );
}

function ActivationButton({ agent }: { agent: AgentProfile }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = () => {
    setError(null);
    startTransition(async () => {
      const result = await setAgentActiveAction(agent.id, !agent.isActive);
      if (!result.ok) setError(result.error ?? 'הפעולה נכשלה.');
      else {
        setConfirming(false);
        router.refresh();
      }
    });
  };

  if (agent.isActive) {
    return confirming ? (
      <div className="flex items-center gap-1.5">
        <Button type="button" variant="danger" size="sm" disabled={pending} onClick={toggle}>
          {pending ? 'משבית…' : 'להשבית?'}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)}>
          ביטול
        </Button>
        {error ? <span className="text-[12px] text-danger-600">{error}</span> : null}
      </div>
    ) : (
      <Button type="button" variant="secondary" size="sm" onClick={() => setConfirming(true)}>
        השבתה
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={toggle}>
        {pending ? 'מפעיל…' : 'הפעלה מחדש'}
      </Button>
      {error ? <span className="text-[12px] text-danger-600">{error}</span> : null}
    </div>
  );
}

const TH =
  'px-4 py-2.5 text-start text-[12px] font-semibold uppercase tracking-wide text-ink-muted';
const TD = 'px-4 py-3 align-middle text-[14px]';

export function AgentsManager({ agents }: { agents: AgentProfile[] }) {
  const reduceMotion = useReducedMotion();
  const activeCount = agents.filter((a) => a.isActive).length;

  return (
    <div className="flex flex-col gap-5">
      <NewAgentForm />

      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3.5 sm:px-5">
          <h2 className="text-[15px] font-semibold">רשימת הסוכנים</h2>
          <p className="text-[13px] text-ink-muted">
            <bdi className="tnum">{activeCount}</bdi> פעילים מתוך{' '}
            <bdi className="tnum">{agents.length}</bdi>
          </p>
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[720px] border-collapse">
            <thead className="border-b border-line bg-surface-sunken">
              <tr>
                <th scope="col" className={TH}>
                  שם הסוכן
                </th>
                <th scope="col" className={TH}>
                  דוא״ל
                </th>
                <th scope="col" className={cx(TH, 'w-32')}>
                  סטטוס
                </th>
                <th scope="col" className={cx(TH, 'w-36')}>
                  סה״כ דיווחים
                </th>
                <th scope="col" className={cx(TH, 'w-44')}>
                  <span className="sr-only">פעולות</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-line)]">
              <AnimatePresence initial={false}>
                {agents.map((agent) => (
                  <motion.tr
                    key={agent.id}
                    initial={reduceMotion ? false : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.16 }}
                    className={cx(
                      'transition-colors hover:bg-surface-sunken',
                      !agent.isActive && 'opacity-75',
                    )}
                  >
                    <td className={cx(TD, 'font-medium')}>
                      <Link
                        prefetch={false}
                        href={`/admin/agents/${agent.id}`}
                        className="text-ink hover:text-brand-600 hover:underline"
                      >
                        {agent.fullName}
                      </Link>
                    </td>
                    <td className={cx(TD, 'text-ink-muted')} dir="ltr">
                      <span className="block text-start">{agent.email}</span>
                    </td>
                    <td className={TD}>
                      {agent.isActive ? (
                        <Badge tone="payable">
                          <CheckIcon className="size-3.5" />
                          פעיל
                        </Badge>
                      ) : (
                        <Badge tone="neutral">לא פעיל</Badge>
                      )}
                    </td>
                    <td className={cx(TD, 'tnum text-ink-soft')}>{agent.entryCount}</td>
                    <td className={TD}>
                      <ActivationButton agent={agent} />
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </div>

        <ul className="divide-y divide-[var(--color-line)] md:hidden">
          {agents.map((agent) => (
            <li key={agent.id} className={cx('px-4 py-4', !agent.isActive && 'opacity-75')}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link
                    prefetch={false}
                    href={`/admin/agents/${agent.id}`}
                    className="text-[15px] font-medium hover:underline"
                  >
                    {agent.fullName}
                  </Link>
                  <p className="mt-0.5 text-[12.5px] text-ink-muted" dir="ltr">
                    <span className="block text-start">{agent.email}</span>
                  </p>
                  <p className="mt-1 text-[12px] text-ink-muted">
                    <bdi className="tnum">{agent.entryCount}</bdi> דיווחים בסך הכול
                  </p>
                </div>
                {agent.isActive ? (
                  <Badge tone="payable">פעיל</Badge>
                ) : (
                  <Badge tone="neutral">לא פעיל</Badge>
                )}
              </div>
              <div className="mt-3">
                <ActivationButton agent={agent} />
              </div>
            </li>
          ))}
        </ul>

        {agents.length > 0 ? (
          <p className="border-t border-line bg-surface-sunken px-4 py-3 text-[12px] leading-relaxed text-ink-muted sm:px-5">
            השבתת סוכן חוסמת את הכניסה שלו למערכת ומונעת דיווחים חדשים, אך כל הדיווחים ההיסטוריים
            נשארים זמינים בדוחות ובסקירה החודשית.
          </p>
        ) : null}
      </section>
    </div>
  );
}
