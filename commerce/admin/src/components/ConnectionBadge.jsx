export default function ConnectionBadge({ connected }) {
  return (
    <span
      className={
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ' +
        (connected
          ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
          : 'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-400')
      }
    >
      <span className={'h-1.5 w-1.5 rounded-full ' + (connected ? 'bg-emerald-400 shadow-[0_0_6px_2px_rgba(52,211,153,0.5)]' : 'bg-amber-400')} />
      {connected ? 'Fanpage đã kết nối' : 'Fanpage chưa kết nối'}
    </span>
  )
}
