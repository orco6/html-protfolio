'use server';

import { revalidatePath } from 'next/cache';

import { requireAdmin } from '@/lib/auth';
import { createAgent, setAgentActive } from '@/lib/agents';
import { fieldErrors, newAgentSchema, uuidSchema } from '@/lib/validation';

export interface AgentFormState {
  ok?: boolean;
  message?: string;
  error?: string;
  fields?: Record<string, string>;
  values?: { fullName: string; email: string };
}

export async function createAgentAction(
  _prev: AgentFormState,
  formData: FormData,
): Promise<AgentFormState> {
  const admin = await requireAdmin();

  const values = {
    fullName: String(formData.get('fullName') ?? ''),
    email: String(formData.get('email') ?? ''),
  };
  const parsed = newAgentSchema.safeParse({
    ...values,
    password: String(formData.get('password') ?? ''),
  });

  if (!parsed.success) {
    return { error: 'יש לתקן את השדות המסומנים.', fields: fieldErrors(parsed.error), values };
  }

  const result = await createAgent(admin.id, parsed.data);

  if (!result.ok) {
    return {
      error: 'כתובת הדוא״ל כבר קיימת במערכת.',
      fields: { email: 'כתובת הדוא״ל כבר קיימת במערכת.' },
      values,
    };
  }

  revalidatePath('/admin/agents');
  revalidatePath('/admin');
  return { ok: true, message: `הסוכן ${result.agent.fullName} נוסף בהצלחה.` };
}

export async function setAgentActiveAction(
  agentId: string,
  isActive: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const admin = await requireAdmin();

  const id = uuidSchema.safeParse(agentId);
  if (!id.success) return { ok: false, error: 'מזהה סוכן אינו תקין.' };

  const updated = await setAgentActive(admin.id, id.data, isActive);
  if (!updated) return { ok: false, error: 'הסוכן לא נמצא.' };

  revalidatePath('/admin/agents');
  revalidatePath('/admin');
  return { ok: true };
}
