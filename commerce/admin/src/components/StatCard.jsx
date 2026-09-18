export default function StatCard({ icon: Icon, label, value, sub, accent }) {
  return (
    <div className="card flex items-center gap-4 p-5">
      <span
        className={
          'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ' +
          (accent || 'bg-indigo-500/15 text-indigo-400')
        }
      >
        <Icon size={22} />
      </span>
      <div className="min-w-0">
        <div className="text-3xl font-semibold tracking-tight text-fg">{value}</div>
        <div className="text-sm font-medium text-fg/60">{label}</div>
        {sub && <div className="mt-0.5 truncate text-xs text-fg/45">{sub}</div>}
      </div>
    </div>
  )
}
