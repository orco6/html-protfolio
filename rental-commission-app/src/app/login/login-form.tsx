'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import { Button, Field, Input, Callout } from '@/components/ui';
import { AlertIcon } from '@/components/icons';
import { loginAction, type LoginState } from './actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" className="mt-1 w-full" disabled={pending}>
      {pending ? 'מתחבר…' : 'כניסה'}
    </Button>
  );
}

export function LoginForm() {
  const [state, formAction] = useActionState<LoginState, FormData>(loginAction, {});

  return (
    <form action={formAction} className="mt-8 flex flex-col gap-4" noValidate>
      {state.error ? (
        <Callout role="alert" tone="conflict" className="flex items-start gap-2 animate-fade-in">
          <AlertIcon className="mt-0.5 size-4 shrink-0" />
          <span>{state.error}</span>
        </Callout>
      ) : null}

      <Field label="דוא״ל" htmlFor="email" error={state.fields?.email}>
        <Input
          id="email"
          name="email"
          type="email"
          dir="ltr"
          className="text-start"
          autoComplete="username"
          autoFocus
          required
          defaultValue={state.email}
          placeholder="name@example.com"
          invalid={Boolean(state.fields?.email)}
        />
      </Field>

      <Field label="סיסמה" htmlFor="password" error={state.fields?.password}>
        <Input
          id="password"
          name="password"
          type="password"
          dir="ltr"
          className="text-start"
          autoComplete="current-password"
          required
          invalid={Boolean(state.fields?.password)}
        />
      </Field>

      <SubmitButton />
    </form>
  );
}
