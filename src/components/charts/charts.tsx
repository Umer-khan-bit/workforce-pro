import type { ReactNode } from "react";

/**
 * Small, dependency-free charts for dashboards and reports. They draw with plain HTML/CSS so they render on the
 * server, follow the brand colour, and each carries a text table for screen readers.
 */

export function ChartCard({ title, hint, children, testId }: { title: string; hint?: string; children: ReactNode; testId?: string }) {
  return (
    <section className="card min-w-0" aria-label={title} data-testid={testId}>
      <h3 className="font-semibold text-zinc-900">{title}</h3>
      {hint && <p className="mt-0.5 text-xs text-zinc-500">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function ReadableTable({ caption, rows }: { caption: string; rows: { label: string; value: string }[] }) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label}>
            <th scope="row">{r.label}</th>
            <td>{r.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const Empty = ({ text }: { text: string }) => <p className="text-sm text-zinc-500">{text}</p>;

/** Horizontal bars, one per group (for example candidates by city). */
export function BarList({ title, data, hint, empty = "Nothing to show yet.", unit = "", testId }: { title: string; data: { label: string; value: number }[]; hint?: string; empty?: string; unit?: string; testId?: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const total = data.reduce((a, d) => a + d.value, 0);
  return (
    <ChartCard title={title} hint={hint} testId={testId}>
      {total === 0 ? (
        <Empty text={empty} />
      ) : (
        <>
          <ul className="flex flex-col gap-2" aria-hidden="true">
            {data.map((d) => (
              <li key={d.label} className="grid grid-cols-[7rem_1fr_3rem] items-center gap-2 text-sm">
                <span className="truncate text-zinc-700" title={d.label}>{d.label}</span>
                <span className="h-3 overflow-hidden rounded-full bg-zinc-100">
                  <span className="block h-full rounded-full bg-brand-600" style={{ width: `${(d.value / max) * 100}%` }} />
                </span>
                <span className="text-right tabular-nums text-zinc-900">{d.value.toLocaleString()}{unit}</span>
              </li>
            ))}
          </ul>
          <ReadableTable caption={title} rows={data.map((d) => ({ label: d.label, value: `${d.value}${unit}` }))} />
        </>
      )}
    </ChartCard>
  );
}

export type Series = { name: string; color: string; values: number[] };

/** Vertical columns over time (or per quartile). One or two series side by side. */
export function ColumnChart({ title, labels, series, hint, empty = "Nothing to show yet.", testId, format = (n: number) => n.toLocaleString() }: { title: string; labels: string[]; series: Series[]; hint?: string; empty?: string; testId?: string; format?: (n: number) => string }) {
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const total = series.reduce((a, s) => a + s.values.reduce((x, y) => x + y, 0), 0);
  return (
    <ChartCard title={title} hint={hint} testId={testId}>
      {total === 0 ? (
        <Empty text={empty} />
      ) : (
        <>
          <div className="flex h-44 items-end gap-1.5" aria-hidden="true">
            {labels.map((label, i) => (
              <div key={`${label}-${i}`} className="flex h-full min-w-0 flex-1 flex-col justify-end">
                <div className="flex flex-1 items-end justify-center gap-0.5">
                  {series.map((s) => (
                    <div key={s.name} className="flex w-full max-w-6 flex-col items-center justify-end" style={{ height: "100%" }}>
                      <span className="text-[10px] tabular-nums text-zinc-600">{s.values[i] ? format(s.values[i]) : ""}</span>
                      <div className="w-full rounded-t" style={{ height: `${(s.values[i] / max) * 85}%`, minHeight: s.values[i] ? 3 : 0, background: s.color }} />
                    </div>
                  ))}
                </div>
                <span className="mt-1 truncate text-center text-[10px] text-zinc-500">{label}</span>
              </div>
            ))}
          </div>
          {series.length > 1 && (
            <p className="mt-2 flex flex-wrap gap-3 text-xs text-zinc-600" aria-hidden="true">
              {series.map((s) => (
                <span key={s.name} className="inline-flex items-center gap-1">
                  <span className="inline-block size-2.5 rounded-sm" style={{ background: s.color }} />
                  {s.name}
                </span>
              ))}
            </p>
          )}
          <ReadableTable caption={title} rows={labels.map((l, i) => ({ label: l, value: series.map((s) => `${s.name}: ${format(s.values[i])}`).join(", ") }))} />
        </>
      )}
    </ChartCard>
  );
}

/** A funnel: each stage as a bar, with the share of the first stage and of the stage before it. */
export function FunnelChart({ title, steps, hint, empty = "No shortlisted candidates yet.", testId, footer }: { title: string; steps: { label: string; count: number }[]; hint?: string; empty?: string; testId?: string; footer?: ReactNode }) {
  const first = steps[0]?.count ?? 0;
  return (
    <ChartCard title={title} hint={hint} testId={testId}>
      {first === 0 ? (
        <Empty text={empty} />
      ) : (
        <>
          <ol className="flex flex-col gap-2" aria-hidden="true">
            {steps.map((s, i) => {
              const prev = i === 0 ? s.count : steps[i - 1].count;
              return (
                <li key={s.label} className="grid grid-cols-[6.5rem_1fr] items-center gap-2 text-sm">
                  <span className="text-zinc-700">{s.label}</span>
                  <span className="relative h-7 overflow-hidden rounded bg-zinc-100">
                    <span className="block h-full rounded bg-brand-600" style={{ width: `${Math.max(2, (s.count / first) * 100)}%`, opacity: 1 - i * 0.12 }} />
                    <span className="absolute inset-y-0 left-2 flex items-center text-xs font-medium text-white mix-blend-normal">
                      <span className="rounded bg-zinc-900/70 px-1.5 py-0.5">{s.count}{i > 0 && prev > 0 ? ` · ${Math.round((s.count / prev) * 100)}% of previous` : ""}</span>
                    </span>
                  </span>
                </li>
              );
            })}
          </ol>
          <ReadableTable caption={title} rows={steps.map((s) => ({ label: s.label, value: String(s.count) }))} />
          {footer}
        </>
      )}
    </ChartCard>
  );
}
