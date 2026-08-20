import { Badge, Callout } from './ui';
import { AlertIcon } from './icons';
import { formatILS } from '@/lib/money';
import type { DuplicateKind } from '@/lib/duplicates';

interface PanelEntry {
  id: string;
  agentId: string;
  agentName?: string;
  propertyAddress: string;
  invoiceNumber: string | null;
  amountCollected: number;
}

/**
 * The presentation-only shape of a duplicate group. Deliberately narrower than
 * `DuplicateGroup` — the panel is handed exactly the fields it renders, so no
 * unrendered column of another agent's row can reach the client bundle.
 */
export interface PanelGroup<T extends PanelEntry = PanelEntry> {
  kind: DuplicateKind;
  key: string;
  label: string;
  entries: T[];
  crossAgent: boolean;
  agentNames: string[];
}

/**
 * Duplicate warnings.
 *
 * `scope` only changes the wording and whether agent names are rendered — the
 * caller has already restricted which rows exist. In the agent scope the rows
 * handed in are exclusively that agent's own (enforced by RLS), so no other
 * agent's name, invoice or property can appear here even by accident.
 */
export function DuplicatePanel<T extends PanelEntry>({
  groups,
  scope,
}: {
  groups: PanelGroup<T>[];
  scope: 'agent' | 'admin';
}) {
  if (groups.length === 0) return null;

  const crossAgentCount = groups.filter((g) => g.crossAgent).length;

  return (
    <section className="card overflow-hidden border-conflict-200" data-print="plain">
      <div className="flex items-start gap-3 border-b border-conflict-200 bg-conflict-50 px-4 py-3.5 sm:px-5">
        <AlertIcon className="mt-0.5 size-[18px] shrink-0 text-conflict-600" />
        <div>
          <h2 className="text-[15px] font-semibold text-conflict-700">
            {scope === 'agent' ? 'התראות על דיווח כפול' : 'התראות על דיווחים כפולים'}
          </h2>
          <p className="mt-0.5 text-[13px] leading-relaxed text-conflict-700/80">
            {scope === 'agent'
              ? 'נמצאו שורות בדיווח שלך עם אותה כתובת או אותו מספר חשבונית. יש לבדוק ולתקן במידת הצורך.'
              : crossAgentCount > 0
                ? `נמצאו ${groups.length} התאמות, מתוכן ${crossAgentCount} בין סוכנים שונים.`
                : `נמצאו ${groups.length} התאמות בתוך דיווחים של אותו סוכן.`}
          </p>
        </div>
      </div>

      <ul className="divide-y divide-[var(--color-line)]">
        {groups.map((group) => (
          <li
            key={`${group.kind}-${group.key}`}
            className="grid gap-2 px-4 py-3.5 sm:px-5 md:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] md:items-start md:gap-6"
          >
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="conflict">
                {group.kind === 'address' ? 'כתובת זהה' : 'מספר חשבונית זהה'}
              </Badge>
              <span className="text-[14.5px] font-medium text-ink">
                {group.kind === 'address' ? (
                  <bdi>{group.label}</bdi>
                ) : (
                  <>
                    חשבונית <bdi className="tnum">{group.label}</bdi>
                  </>
                )}
              </span>
              <span className="text-[12.5px] text-ink-muted">
                <bdi className="tnum">{group.entries.length}</bdi> שורות
              </span>
              {scope === 'admin' && group.crossAgent ? (
                <Badge tone="pending">בין סוכנים שונים</Badge>
              ) : null}
            </div>

            <ul className="flex flex-col gap-1 md:pt-0.5">
              {group.entries.map((entry) => (
                <li key={entry.id} className="text-[13px] text-ink-muted">
                  {scope === 'admin' && entry.agentName ? (
                    <span className="font-medium text-ink-soft">{entry.agentName}</span>
                  ) : (
                    <span className="font-medium text-ink-soft">
                      {group.kind === 'address' ? 'שורה בדיווח' : entry.propertyAddress}
                    </span>
                  )}
                  {' · '}
                  {group.kind === 'address' ? (
                    <>
                      {entry.invoiceNumber ? (
                        <>
                          חשבונית <bdi className="tnum">{entry.invoiceNumber}</bdi>
                        </>
                      ) : (
                        'ללא חשבונית'
                      )}
                      {' · '}
                    </>
                  ) : (
                    <>
                      <bdi>{entry.propertyAddress}</bdi>
                      {' · '}
                    </>
                  )}
                  <bdi className="tnum">{formatILS(entry.amountCollected)}</bdi>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>

      {scope === 'agent' ? (
        <div className="px-4 pb-4 sm:px-5">
          <Callout tone="pending" className="text-[12.5px]">
            ההתראות מתייחסות אך ורק לדיווחים שלך. אין לך גישה לנתוני סוכנים אחרים.
          </Callout>
        </div>
      ) : null}
    </section>
  );
}
