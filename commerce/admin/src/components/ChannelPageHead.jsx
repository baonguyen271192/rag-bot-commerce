// Tiêu đề trang cho 3 trang kênh tổng hợp — icon chip màu + tiêu đề + mô tả, khớp
// ".pagehead" trong docs/channels-ia-mockup.html. `badge` optional (vd nhãn "Beta").
export default function ChannelPageHead({ icon: Icon, tint, title, subtitle, badge, actions }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <div className="mb-2 flex items-center gap-2.5">
          <span className={'flex h-9 w-9 items-center justify-center rounded-xl ' + tint}>
            <Icon size={18} />
          </span>
        </div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-fg">
          {title}
          {badge}
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-fg/55">{subtitle}</p>
      </div>
      {actions && <div className="flex flex-wrap gap-2.5">{actions}</div>}
    </div>
  )
}
