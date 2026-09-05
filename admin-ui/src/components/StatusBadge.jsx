const STATUS_META = {
  logged_in: { label: 'Đã đăng nhập', className: 'bg-accent/10 text-accent border-accent/30' },
  awaiting_qr: { label: 'Chờ quét QR', className: 'bg-warning/10 text-warning border-warning/30' },
  error: { label: 'Lỗi', className: 'bg-danger/10 text-danger border-danger/30' },
  unknown: { label: 'Chưa kết nối', className: 'bg-gray-100 text-gray-600 border-gray-300' },
};

export default function StatusBadge({ status }) {
  const meta = STATUS_META[status] || STATUS_META.unknown;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm font-medium ${meta.className}`}
    >
      <span className="h-2 w-2 rounded-full bg-current" aria-hidden="true" />
      {meta.label}
    </span>
  );
}
