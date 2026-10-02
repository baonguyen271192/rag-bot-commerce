import { useState } from 'react'

// Gom logic mở ConfirmDialog + busy state cho 1 hành động async — dùng chung cho mọi nơi
// trước đây gọi window.confirm() rồi await trực tiếp (xoá món, gỡ kênh, xoá cửa hàng...).
// Lỗi của action vẫn do NƠI GỌI tự bắt/hiện (ErrorBanner sẵn có của trang đó) — hook này
// chỉ đóng dialog sau khi action xong, không tự hiện lỗi, để không có 2 chỗ báo lỗi trùng.
export function useConfirm() {
  const [state, setState] = useState(null)
  const [busy, setBusy] = useState(false)

  function ask(opts) {
    setState(opts)
  }

  async function handleConfirm() {
    if (!state) return
    setBusy(true)
    try {
      await state.onConfirm()
    } finally {
      setBusy(false)
      setState(null)
    }
  }

  function handleCancel() {
    if (busy) return
    setState(null)
  }

  return {
    ask,
    dialogProps: {
      open: Boolean(state),
      title: state?.title,
      message: state?.message,
      confirmLabel: state?.confirmLabel,
      danger: state?.danger,
      busy,
      onConfirm: handleConfirm,
      onCancel: handleCancel,
    },
  }
}
