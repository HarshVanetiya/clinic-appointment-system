import type { ReactNode } from 'react'

export function StatTile({ label, value, sub, icon }: { label: string; value: string; sub?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between">
        <p className="eyebrow">{label}</p>
        {icon && <span className="text-green">{icon}</span>}
      </div>
      <p className="mt-3 font-display text-3xl font-extrabold tabular-nums">{value}</p>
      {sub && <p className="mt-1 text-sm text-muted">{sub}</p>}
    </div>
  )
}

/** Utilisation as meters (one ratio per therapist against a 100% limit), in a real table for screen readers. */
export function UtilisationTable({ rows, caption }: { rows: { id: string; name: string; rate: number; bookedMin: number; openMin: number; appointments: number }[]; caption: string }) {
  const hours = (m: number) => `${Math.round((m / 60) * 10) / 10} h`
  return (
    <table className="w-full text-sm">
      <caption className="sr-only">{caption}</caption>
      <thead className="sr-only">
        <tr>
          <th scope="col">Therapist</th>
          <th scope="col">Utilisation</th>
          <th scope="col">Booked of open hours</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const pct = Math.round(r.rate * 100)
          return (
            <tr key={r.id} className="block py-2.5 first:pt-0" title={`${r.name}: ${pct}% — ${hours(r.bookedMin)} booked of ${hours(r.openMin)} open, ${r.appointments} appointments`}>
              <th scope="row" className="mb-1.5 flex items-baseline justify-between font-medium text-ink">
                <span>{r.name}</span>
                <span className="font-display text-base font-bold tabular-nums">{pct}%</span>
              </th>
              <td className="block">
                <div className="h-2 overflow-hidden rounded-full bg-sage" role="presentation">
                  <div className="h-full rounded-full bg-green transition-[width] duration-500 ease-[var(--ease-out-soft)]" style={{ width: `${pct}%` }} />
                </div>
              </td>
              <td className="mt-1 block font-mono text-[0.7rem] text-muted">
                {hours(r.bookedMin)} booked of {hours(r.openMin)} open · {r.appointments} appts
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
