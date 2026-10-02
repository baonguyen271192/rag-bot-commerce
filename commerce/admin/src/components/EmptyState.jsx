export default function EmptyState({ icon: Icon, text }) {
  return (
    <div className="card flex flex-col items-center gap-2 py-14 text-fg/35">
      <Icon size={24} />
      <p className="text-sm">{text}</p>
    </div>
  )
}
