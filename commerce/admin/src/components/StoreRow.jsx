import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { bizOf } from '../lib/business'
import ConnectionBadge from './ConnectionBadge'

export default function StoreRow({ store: s, bordered }) {
  const biz = bizOf(s)
  const Icon = biz.icon
  return (
    <Link
      to={`/stores/${s.id}`}
      className={
        'group flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-fg/[0.03] focus-visible:bg-fg/[0.03] focus-visible:outline-none ' +
        (bordered ? 'border-t border-fg/[0.06]' : '')
      }
    >
      <div className="flex items-center gap-3.5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-fg/[0.06] text-fg/70 transition-colors group-hover:bg-indigo-500/15 group-hover:text-indigo-300">
          <Icon size={18} />
        </span>
        <div>
          <h3 className="text-sm font-semibold text-fg">{s.name}</h3>
          <p className="text-xs text-fg/55">{biz.label}</p>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <ConnectionBadge connected={s.fb_connected} />
        <div className="hidden gap-4 text-sm text-fg/60 sm:flex">
          <span>{s.menu_count} món</span>
          <span>{s.order_count} đơn</span>
        </div>
        <ChevronRight size={18} className="text-fg/30 transition-transform group-hover:translate-x-0.5 group-hover:text-indigo-300" />
      </div>
    </Link>
  )
}
