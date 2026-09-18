import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// vitest.config.js dùng globals: false (không rải biến toàn cục) nên
// @testing-library/react KHÔNG tự nhận ra afterEach để dọn DOM giữa các test —
// phải gọi cleanup() bằng tay, nếu không component/mock DOM của test trước sẽ
// còn sót lại khi test kế tiếp render (gây sai lệch alert/nút y hệt test trước).
afterEach(() => {
  cleanup()
})
