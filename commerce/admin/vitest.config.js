// Config test riêng cho vitest — KHÔNG đụng vite.config.js (file build sản phẩm).
// Repo này trước đợt test này không có framework test nào; vitest là lựa chọn tự
// nhiên cho stack Vite + React hiện có, không cần thêm runner khác.
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.js'],
    globals: false,
  },
})
