export default function ConnectionBadge({ connected }) {
  return (
    <span
      className={
        'stamp ' + (connected ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400')
      }
    >
      {connected ? 'Fanpage đã kết nối' : 'Fanpage chưa kết nối'}
    </span>
  )
}
