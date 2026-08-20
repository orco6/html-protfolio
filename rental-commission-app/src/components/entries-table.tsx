'use client';

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Badge, Button, EmptyState, Input, cx } from './ui';
import { AlertIcon, CheckIcon, CloseIcon, EditIcon, PlusIcon, TrashIcon } from './icons';
import { calculateEntry, calculateTotals } from '@/lib/commission';
import { formatAmount, formatILS, parseAmountToAgorot, toInputValue } from '@/lib/money';
import { flagEntries } from '@/lib/duplicates';
import { MESSAGES } from '@/lib/validation';
import type { Period } from '@/lib/periods';
import {
  createEntryAction,
  deleteEntryAction,
  updateEntryAction,
  type ActionResult,
} from '@/app/(app)/report/actions';

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

export interface ClientEntry {
  id: string;
  agentId: string;
  propertyAddress: string;
  amountCollected: number;
  hasInvoice: boolean;
  invoiceNumber: string | null;
  addressKey: string | null;
  invoiceKey: string | null;
}

interface DraftValues {
  propertyAddress: string;
  amountCollected: string;
  hasInvoice: boolean;
  invoiceNumber: string;
}

const EMPTY_DRAFT: DraftValues = {
  propertyAddress: '',
  amountCollected: '',
  hasInvoice: false,
  invoiceNumber: '',
};

type FieldErrors = Partial<Record<'propertyAddress' | 'amountCollected' | 'invoiceNumber', string>>;

/** Client-side mirror of the server schema, so mistakes surface before a round trip. */
function validateDraft(draft: DraftValues): FieldErrors {
  const errors: FieldErrors = {};

  if (!draft.propertyAddress.trim()) errors.propertyAddress = MESSAGES.addressRequired;
  else if (draft.propertyAddress.trim().length > 200) errors.propertyAddress = MESSAGES.addressTooLong;

  if (!draft.amountCollected.trim()) errors.amountCollected = MESSAGES.amountRequired;
  else if (parseAmountToAgorot(draft.amountCollected) === null) errors.amountCollected = MESSAGES.amountInvalid;

  if (draft.hasInvoice && !draft.invoiceNumber.trim()) errors.invoiceNumber = MESSAGES.invoiceRequired;
  else if (draft.invoiceNumber.trim().length > 50) errors.invoiceNumber = MESSAGES.invoiceTooLong;

  return errors;
}

function toDraft(entry: ClientEntry): DraftValues {
  return {
    propertyAddress: entry.propertyAddress,
    amountCollected: toInputValue(entry.amountCollected),
    hasInvoice: entry.hasInvoice,
    invoiceNumber: entry.invoiceNumber ?? '',
  };
}

/* -------------------------------------------------------------------------- */
/* Shared field bits                                                           */
/* -------------------------------------------------------------------------- */

function InvoiceToggle({
  checked,
  onChange,
  id,
  label = 'קיימת חשבונית',
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  id: string;
  label?: string;
}) {
  return (
    <label
      htmlFor={id}
      className="inline-flex h-11 cursor-pointer select-none items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 text-[14px] text-ink-soft transition-colors hover:border-ink-faint has-checked:border-payable-600/40 has-checked:bg-payable-50 has-checked:text-payable-700"
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="size-4 accent-[var(--color-payable-600)]"
      />
      {label}
    </label>
  );
}

function ErrorText({ children }: { children?: string }) {
  if (!children) return null;
  return (
    <p role="alert" className="mt-1 text-[12px] leading-snug text-danger-600">
      {children}
    </p>
  );
}

/* -------------------------------------------------------------------------- */
/* Entries table                                                               */
/* -------------------------------------------------------------------------- */

export function EntriesTable({
  entries,
  onEntriesChange,
  period,
  editable,
}: {
  entries: ClientEntry[];
  onEntriesChange: (next: ClientEntry[]) => void;
  period: Period;
  editable: boolean;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<DraftValues>(EMPTY_DRAFT);
  const [editErrors, setEditErrors] = useState<FieldErrors>({});
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [status, setStatus] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!status) return;
    const timer = setTimeout(() => setStatus(null), 4000);
    return () => clearTimeout(timer);
  }, [status]);

  const duplicateFlags = useMemo(() => flagEntries(entries), [entries]);
  const totals = useMemo(() => calculateTotals(entries), [entries]);

  const beginEdit = (entry: ClientEntry) => {
    setConfirmDeleteId(null);
    setEditErrors({});
    setEditDraft(toDraft(entry));
    setEditingId(entry.id);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditErrors({});
  };

  const handleResult = <T,>(result: ActionResult<T>, onSuccess: (data: T) => void, okText: string) => {
    if (result.ok) {
      onSuccess(result.data);
      setStatus({ tone: 'ok', text: okText });
      return true;
    }
    setStatus({ tone: 'error', text: result.error });
    return false;
  };

  const saveEdit = async (id: string) => {
    const errors = validateDraft(editDraft);
    if (Object.keys(errors).length > 0) {
      setEditErrors(errors);
      return;
    }

    setBusyId(id);
    const result = await updateEntryAction({
      id,
      propertyAddress: editDraft.propertyAddress,
      amountCollected: editDraft.amountCollected,
      hasInvoice: editDraft.hasInvoice,
      invoiceNumber: editDraft.invoiceNumber,
    });
    setBusyId(null);

    if (!result.ok && result.fields) setEditErrors(result.fields as FieldErrors);

    handleResult(
      result,
      (updated) => {
        onEntriesChange(entries.map((e) => (e.id === id ? { ...e, ...updated } : e)));
        setEditingId(null);
        setEditErrors({});
      },
      'הדיווח עודכן.',
    );
  };

  const confirmDelete = async (id: string) => {
    setBusyId(id);
    const result = await deleteEntryAction(id);
    setBusyId(null);
    handleResult(
      result,
      () => {
        onEntriesChange(entries.filter((e) => e.id !== id));
        setConfirmDeleteId(null);
      },
      'הדיווח נמחק.',
    );
  };

  const addEntry = useCallback(
    async (draft: DraftValues): Promise<boolean> => {
      const result = await createEntryAction({
        year: period.year,
        month: period.month,
        propertyAddress: draft.propertyAddress,
        amountCollected: draft.amountCollected,
        hasInvoice: draft.hasInvoice,
        invoiceNumber: draft.invoiceNumber,
      });

      if (result.ok) {
        onEntriesChange([...entries, result.data]);
        setStatus({ tone: 'ok', text: 'הנכס נוסף לדיווח.' });
        return true;
      }
      setStatus({ tone: 'error', text: result.error });
      return false;
    },
    [entries, onEntriesChange, period.month, period.year],
  );

  return (
    <section className="card overflow-hidden" data-print="plain">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3.5 sm:px-5">
        <h2 className="text-[15px] font-semibold">פירוט הנכסים</h2>
        <p className="text-[13px] text-ink-muted">
          {entries.length > 0 ? (
            <>
              <bdi className="tnum">{entries.length}</bdi> שורות
            </>
          ) : (
            'אין שורות'
          )}
        </p>
      </div>

      {entries.length === 0 ? (
        <EmptyState
          title="אין נכסים בחודש זה"
          description={
            editable
              ? 'אפשר להתחיל להזין נכסים בטופס שבתחתית המסך. כל שורה נשמרת מיד בשרת.'
              : 'הסוכן לא דיווח על נכסים בחודש שנבחר.'
          }
        />
      ) : (
        <>
          <DesktopTable
            entries={entries}
            duplicateFlags={duplicateFlags}
            editable={editable}
            editingId={editingId}
            editDraft={editDraft}
            editErrors={editErrors}
            busyId={busyId}
            confirmDeleteId={confirmDeleteId}
            totals={totals}
            onDraftChange={setEditDraft}
            onBeginEdit={beginEdit}
            onCancelEdit={cancelEdit}
            onSaveEdit={saveEdit}
            onAskDelete={setConfirmDeleteId}
            onConfirmDelete={confirmDelete}
          />
          <MobileList
            entries={entries}
            duplicateFlags={duplicateFlags}
            editable={editable}
            editingId={editingId}
            editDraft={editDraft}
            editErrors={editErrors}
            busyId={busyId}
            confirmDeleteId={confirmDeleteId}
            onDraftChange={setEditDraft}
            onBeginEdit={beginEdit}
            onCancelEdit={cancelEdit}
            onSaveEdit={saveEdit}
            onAskDelete={setConfirmDeleteId}
            onConfirmDelete={confirmDelete}
          />
        </>
      )}

      {editable ? <AddRowForm onAdd={addEntry} /> : null}

      <p
        aria-live="polite"
        className={cx(
          'px-4 pb-3 text-[13px] sm:px-5 no-print',
          !status && 'sr-only',
          status?.tone === 'error' ? 'text-danger-600' : 'text-payable-700',
        )}
      >
        {status?.text ?? ''}
      </p>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Desktop table                                                               */
/* -------------------------------------------------------------------------- */

interface RowControlProps {
  entries: ClientEntry[];
  duplicateFlags: Map<string, { duplicateAddress: boolean; duplicateInvoice: boolean }>;
  editable: boolean;
  editingId: string | null;
  editDraft: DraftValues;
  editErrors: FieldErrors;
  busyId: string | null;
  confirmDeleteId: string | null;
  onDraftChange: (draft: DraftValues) => void;
  onBeginEdit: (entry: ClientEntry) => void;
  onCancelEdit: () => void;
  onSaveEdit: (id: string) => void;
  onAskDelete: (id: string | null) => void;
  onConfirmDelete: (id: string) => void;
}

const TH = 'px-3 py-2.5 text-start text-[12px] font-semibold uppercase tracking-wide text-ink-muted';
const TD = 'px-3 py-2.5 align-middle text-[14px]';

function DesktopTable(props: RowControlProps & { totals: ReturnType<typeof calculateTotals> }) {
  const { entries, totals } = props;
  const reduceMotion = useReducedMotion();

  return (
    <div className="hidden overflow-x-auto md:block">
      <table className="w-full min-w-[860px] border-collapse">
        <thead className="border-b border-line bg-surface-sunken">
          <tr>
            <th scope="col" className={cx(TH, 'w-10 text-center')}>
              #
            </th>
            <th scope="col" className={TH}>
              כתובת הנכס
            </th>
            <th scope="col" className={cx(TH, 'w-36')}>
              סכום שנגבה
            </th>
            <th scope="col" className={cx(TH, 'w-32')}>
              חשבונית
            </th>
            <th scope="col" className={cx(TH, 'w-40')}>
              מספר חשבונית
            </th>
            <th scope="col" className={cx(TH, 'w-32')}>
              ללא מע״מ
            </th>
            <th scope="col" className={cx(TH, 'w-36')}>
              עמלה לתשלום
            </th>
            {props.editable ? (
              <th scope="col" className={cx(TH, 'w-28 no-print')}>
                <span className="sr-only">פעולות</span>
              </th>
            ) : null}
          </tr>
        </thead>

        <tbody className="divide-y divide-[var(--color-line)]">
          <AnimatePresence initial={false}>
            {entries.map((entry, index) => {
              const editing = props.editingId === entry.id;
              const flags = props.duplicateFlags.get(entry.id);
              const draft = editing ? props.editDraft : toDraft(entry);
              const preview = calculateEntry({
                amountCollected: parseAmountToAgorot(draft.amountCollected) ?? 0,
                hasInvoice: draft.hasInvoice,
              });
              const busy = props.busyId === entry.id;

              return (
                <motion.tr
                  key={entry.id}
                  layout={false}
                  initial={reduceMotion ? false : { opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
                  transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                  className={cx(
                    'transition-colors',
                    editing ? 'bg-brand-50/60' : 'hover:bg-surface-sunken',
                    busy && 'opacity-60',
                  )}
                >
                  <td className={cx(TD, 'tnum text-center text-[13px] text-ink-faint')}>{index + 1}</td>

                  <td className={TD}>
                    {editing ? (
                      <>
                        <Input
                          aria-label="כתובת הנכס"
                          value={draft.propertyAddress}
                          onChange={(e) =>
                            props.onDraftChange({ ...props.editDraft, propertyAddress: e.target.value })
                          }
                          invalid={Boolean(props.editErrors.propertyAddress)}
                          className="h-10"
                        />
                        <ErrorText>{props.editErrors.propertyAddress}</ErrorText>
                      </>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-ink">{entry.propertyAddress}</span>
                        {flags?.duplicateAddress ? (
                          <Badge tone="conflict">
                            <AlertIcon className="size-3.5" />
                            כתובת כפולה
                          </Badge>
                        ) : null}
                      </div>
                    )}
                  </td>

                  <td className={TD}>
                    {editing ? (
                      <>
                        <Input
                          aria-label="סכום שנגבה"
                          numeric
                          inputMode="decimal"
                          value={draft.amountCollected}
                          onChange={(e) =>
                            props.onDraftChange({ ...props.editDraft, amountCollected: e.target.value })
                          }
                          invalid={Boolean(props.editErrors.amountCollected)}
                          className="h-10"
                        />
                        <ErrorText>{props.editErrors.amountCollected}</ErrorText>
                      </>
                    ) : (
                      <span className="tnum font-medium">{formatAmount(entry.amountCollected)}</span>
                    )}
                  </td>

                  <td className={TD}>
                    {editing ? (
                      <label className="inline-flex cursor-pointer items-center gap-2 text-[13.5px]">
                        <input
                          type="checkbox"
                          className="size-4 accent-[var(--color-payable-600)]"
                          checked={draft.hasInvoice}
                          onChange={(e) =>
                            props.onDraftChange({ ...props.editDraft, hasInvoice: e.target.checked })
                          }
                        />
                        יש חשבונית
                      </label>
                    ) : entry.hasInvoice ? (
                      <Badge tone="payable">
                        <CheckIcon className="size-3.5" />
                        קיימת
                      </Badge>
                    ) : (
                      <Badge tone="pending">חסרה</Badge>
                    )}
                  </td>

                  <td className={TD}>
                    {editing ? (
                      <>
                        <Input
                          aria-label="מספר חשבונית"
                          numeric
                          value={draft.invoiceNumber}
                          disabled={!draft.hasInvoice}
                          onChange={(e) =>
                            props.onDraftChange({ ...props.editDraft, invoiceNumber: e.target.value })
                          }
                          invalid={Boolean(props.editErrors.invoiceNumber)}
                          className="h-10"
                        />
                        <ErrorText>{props.editErrors.invoiceNumber}</ErrorText>
                      </>
                    ) : entry.invoiceNumber ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="tnum text-ink-soft">{entry.invoiceNumber}</span>
                        {flags?.duplicateInvoice ? (
                          <Badge tone="conflict">
                            <AlertIcon className="size-3.5" />
                            כפולה
                          </Badge>
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-ink-faint">—</span>
                    )}
                  </td>

                  <td className={cx(TD, 'tnum text-ink-soft')}>{formatAmount(preview.net)}</td>

                  <td className={TD}>
                    <span
                      className={cx(
                        'tnum font-semibold',
                        preview.payable > 0 ? 'text-payable-700' : 'text-ink-faint',
                      )}
                    >
                      {preview.payable > 0 ? formatAmount(preview.payable) : '—'}
                    </span>
                  </td>

                  {props.editable ? (
                    <td className={cx(TD, 'no-print')}>
                      {editing ? (
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            variant="primary"
                            size="sm"
                            disabled={busy}
                            onClick={() => props.onSaveEdit(entry.id)}
                          >
                            שמירה
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={props.onCancelEdit}
                            aria-label="ביטול עריכה"
                          >
                            <CloseIcon className="size-4" />
                          </Button>
                        </div>
                      ) : props.confirmDeleteId === entry.id ? (
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            variant="danger"
                            size="sm"
                            disabled={busy}
                            onClick={() => props.onConfirmDelete(entry.id)}
                          >
                            למחוק?
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => props.onAskDelete(null)}
                            aria-label="ביטול מחיקה"
                          >
                            <CloseIcon className="size-4" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-0.5">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="size-9 p-0"
                            aria-label={`עריכת ${entry.propertyAddress}`}
                            onClick={() => props.onBeginEdit(entry)}
                          >
                            <EditIcon className="size-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="size-9 p-0 hover:text-danger-600"
                            aria-label={`מחיקת ${entry.propertyAddress}`}
                            onClick={() => props.onAskDelete(entry.id)}
                          >
                            <TrashIcon className="size-4" />
                          </Button>
                        </div>
                      )}
                    </td>
                  ) : null}
                </motion.tr>
              );
            })}
          </AnimatePresence>
        </tbody>

        {entries.length > 0 ? (
          <tfoot className="border-t-2 border-line-strong bg-surface-sunken">
            <tr>
              <td className={cx(TD, 'font-semibold')} colSpan={2}>
                סה״כ
              </td>
              <td className={cx(TD, 'tnum font-semibold')}>{formatAmount(totals.grossTotal)}</td>
              <td className={cx(TD, 'text-[13px] text-ink-muted')} colSpan={2}>
                <bdi className="tnum">{totals.invoicedCount}</bdi> מתוך{' '}
                <bdi className="tnum">{totals.entryCount}</bdi> עם חשבונית
              </td>
              <td className={cx(TD, 'tnum font-semibold')}>{formatAmount(totals.netTotal)}</td>
              <td className={cx(TD, 'tnum font-bold text-payable-700')}>{formatAmount(totals.payableTotal)}</td>
              {props.editable ? <td className="no-print" /> : null}
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Mobile card list                                                            */
/* -------------------------------------------------------------------------- */

function MobileList(props: RowControlProps) {
  const reduceMotion = useReducedMotion();

  return (
    <ul className="divide-y divide-[var(--color-line)] md:hidden">
      <AnimatePresence initial={false}>
        {props.entries.map((entry, index) => {
          const editing = props.editingId === entry.id;
          const flags = props.duplicateFlags.get(entry.id);
          const draft = editing ? props.editDraft : toDraft(entry);
          const preview = calculateEntry({
            amountCollected: parseAmountToAgorot(draft.amountCollected) ?? 0,
            hasInvoice: draft.hasInvoice,
          });
          const busy = props.busyId === entry.id;

          return (
            <motion.li
              key={entry.id}
              initial={reduceMotion ? false : { opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16 }}
              className={cx('px-4 py-4', editing && 'bg-brand-50/60', busy && 'opacity-60')}
            >
              {editing ? (
                <div className="flex flex-col gap-3">
                  <div>
                    <Input
                      aria-label="כתובת הנכס"
                      value={draft.propertyAddress}
                      onChange={(e) =>
                        props.onDraftChange({ ...props.editDraft, propertyAddress: e.target.value })
                      }
                      invalid={Boolean(props.editErrors.propertyAddress)}
                      placeholder="כתובת הנכס"
                    />
                    <ErrorText>{props.editErrors.propertyAddress}</ErrorText>
                  </div>
                  <div>
                    <Input
                      aria-label="סכום שנגבה"
                      numeric
                      inputMode="decimal"
                      value={draft.amountCollected}
                      onChange={(e) =>
                        props.onDraftChange({ ...props.editDraft, amountCollected: e.target.value })
                      }
                      invalid={Boolean(props.editErrors.amountCollected)}
                      placeholder="סכום שנגבה"
                    />
                    <ErrorText>{props.editErrors.amountCollected}</ErrorText>
                  </div>
                  <InvoiceToggle
                    id={`m-invoice-${entry.id}`}
                    checked={draft.hasInvoice}
                    onChange={(next) => props.onDraftChange({ ...props.editDraft, hasInvoice: next })}
                  />
                  {draft.hasInvoice ? (
                    <div>
                      <Input
                        aria-label="מספר חשבונית"
                        numeric
                        value={draft.invoiceNumber}
                        onChange={(e) =>
                          props.onDraftChange({ ...props.editDraft, invoiceNumber: e.target.value })
                        }
                        invalid={Boolean(props.editErrors.invoiceNumber)}
                        placeholder="מספר חשבונית"
                      />
                      <ErrorText>{props.editErrors.invoiceNumber}</ErrorText>
                    </div>
                  ) : null}
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      className="flex-1"
                      disabled={busy}
                      onClick={() => props.onSaveEdit(entry.id)}
                    >
                      שמירה
                    </Button>
                    <Button type="button" variant="secondary" size="sm" onClick={props.onCancelEdit}>
                      ביטול
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-[15px] font-medium leading-snug">
                        <bdi className="tnum text-[12px] text-ink-faint">{index + 1}.</bdi>
                        <span className="break-words">{entry.propertyAddress}</span>
                      </p>
                      <p className="mt-1 text-[13px] text-ink-muted">
                        נגבה <bdi className="tnum">{formatILS(entry.amountCollected)}</bdi>
                      </p>
                    </div>
                    <div className="shrink-0 text-end">
                      <p
                        className={cx(
                          'tnum text-[15px] font-semibold',
                          preview.payable > 0 ? 'text-payable-700' : 'text-ink-faint',
                        )}
                      >
                        {preview.payable > 0 ? formatILS(preview.payable) : '—'}
                      </p>
                      <p className="text-[11.5px] text-ink-faint">עמלה</p>
                    </div>
                  </div>

                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                    {entry.hasInvoice ? (
                      <Badge tone="payable">
                        <CheckIcon className="size-3.5" />
                        חשבונית <bdi className="tnum">{entry.invoiceNumber}</bdi>
                      </Badge>
                    ) : (
                      <Badge tone="pending">ללא חשבונית</Badge>
                    )}
                    {flags?.duplicateAddress ? <Badge tone="conflict">כתובת כפולה</Badge> : null}
                    {flags?.duplicateInvoice ? <Badge tone="conflict">חשבונית כפולה</Badge> : null}
                  </div>

                  {props.editable ? (
                    props.confirmDeleteId === entry.id ? (
                      <div className="mt-3 flex items-center gap-2 rounded-lg border border-danger-600/25 bg-danger-50 px-3 py-2">
                        <span className="text-[13px] text-danger-700">למחוק את הדיווח?</span>
                        <div className="ms-auto flex gap-1.5">
                          <Button
                            type="button"
                            variant="danger"
                            size="sm"
                            disabled={busy}
                            onClick={() => props.onConfirmDelete(entry.id)}
                          >
                            מחיקה
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => props.onAskDelete(null)}
                          >
                            ביטול
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-3 flex gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          className="flex-1"
                          onClick={() => props.onBeginEdit(entry)}
                        >
                          <EditIcon className="size-4" />
                          עריכה
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="hover:text-danger-600"
                          aria-label={`מחיקת ${entry.propertyAddress}`}
                          onClick={() => props.onAskDelete(entry.id)}
                        >
                          <TrashIcon className="size-4" />
                        </Button>
                      </div>
                    )
                  ) : null}
                </>
              )}
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ul>
  );
}

/* -------------------------------------------------------------------------- */
/* Add row                                                                     */
/* -------------------------------------------------------------------------- */

function AddRowForm({ onAdd }: { onAdd: (draft: DraftValues) => Promise<boolean> }) {
  const [draft, setDraft] = useState<DraftValues>(EMPTY_DRAFT);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  const addressRef = useRef<HTMLInputElement>(null);

  const preview = calculateEntry({
    amountCollected: parseAmountToAgorot(draft.amountCollected) ?? 0,
    hasInvoice: draft.hasInvoice,
  });

  const submit = async () => {
    const found = validateDraft(draft);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setSaving(true);
    const ok = await onAdd(draft);
    setSaving(false);

    if (ok) {
      // Reset and return the caret to the first field — this form is used
      // dozens of times in a row at month end.
      setDraft(EMPTY_DRAFT);
      setErrors({});
      addressRef.current?.focus();
    }
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void submit();
    }
  };

  return (
    <div className="border-t border-line bg-surface-sunken px-4 py-4 sm:px-5 no-print">
      <div className="mb-3 flex items-center gap-2">
        <PlusIcon className="size-4 text-ink-muted" />
        <h3 className="text-[13.5px] font-semibold text-ink-soft">הוספת נכס לדיווח</h3>
        {preview.payable > 0 ? (
          <span className="ms-auto text-[12.5px] text-payable-700">
            עמלה משוערת: <bdi className="tnum">{formatILS(preview.payable)}</bdi>
          </span>
        ) : null}
      </div>

      <div
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_10rem_11rem_11rem_auto]"
        onKeyDown={onKeyDown}
      >
        <div>
          <label htmlFor="new-address" className="sr-only">
            כתובת הנכס
          </label>
          <Input
            id="new-address"
            ref={addressRef}
            placeholder="כתובת הנכס"
            value={draft.propertyAddress}
            onChange={(e) => setDraft((d) => ({ ...d, propertyAddress: e.target.value }))}
            invalid={Boolean(errors.propertyAddress)}
            autoComplete="off"
          />
          <ErrorText>{errors.propertyAddress}</ErrorText>
        </div>

        <div>
          <label htmlFor="new-amount" className="sr-only">
            סכום שנגבה
          </label>
          <Input
            id="new-amount"
            numeric
            inputMode="decimal"
            placeholder="סכום שנגבה"
            value={draft.amountCollected}
            onChange={(e) => setDraft((d) => ({ ...d, amountCollected: e.target.value }))}
            invalid={Boolean(errors.amountCollected)}
            autoComplete="off"
          />
          <ErrorText>{errors.amountCollected}</ErrorText>
        </div>

        <InvoiceToggle
          id="new-has-invoice"
          checked={draft.hasInvoice}
          onChange={(next) =>
            setDraft((d) => ({ ...d, hasInvoice: next, invoiceNumber: next ? d.invoiceNumber : '' }))
          }
        />

        <div>
          <label htmlFor="new-invoice" className="sr-only">
            מספר חשבונית
          </label>
          <Input
            id="new-invoice"
            numeric
            placeholder="מספר חשבונית"
            value={draft.invoiceNumber}
            disabled={!draft.hasInvoice}
            onChange={(e) => setDraft((d) => ({ ...d, invoiceNumber: e.target.value }))}
            invalid={Boolean(errors.invoiceNumber)}
            autoComplete="off"
          />
          <ErrorText>{errors.invoiceNumber}</ErrorText>
        </div>

        <Button
          type="button"
          variant="primary"
          onClick={() => void submit()}
          disabled={saving}
          className="h-11 lg:w-32"
        >
          <PlusIcon className="size-4" />
          {saving ? 'מוסיף…' : 'הוספה'}
        </Button>
      </div>

      <p className="mt-2.5 text-[12px] text-ink-faint">
        לחיצה על Enter מוסיפה את השורה ומחזירה את הסמן לשדה הכתובת.
      </p>
    </div>
  );
}
