import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join, extname } from 'path'

// Test tĩnh (đọc file nguồn, không render) — bảo vệ bất biến "không còn màu
// trắng/nền tối hardcode nằm ngoài hệ token" mà PHẦN 1 (theme sáng/tối) của
// .bangiao/thay-doi.md yêu cầu. Nếu ai sau này lỡ thêm lại `text-white`/`bg-white`/
// hex nền cũ mà quên đổi sang token, test này phải đỏ.
//
// Dùng process.cwd() (vitest luôn chạy từ commerce/admin/, xem package.json
// script "test": "vitest run") thay vì import.meta.url — tránh lỗi "URL must be
// of scheme file" khi vite-node transform module theo cách khác lúc chạy test.
const SRC_DIR = join(process.cwd(), 'src')

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) walk(full, out)
    else if (['.js', '.jsx'].includes(extname(full))) out.push(full)
  }
  return out
}

// Ngoại lệ CỐ Ý đã biết (xem .bangiao/thay-doi.md, mục "Refactor màu ở mọi file
// còn lại"): icon/thumb luôn trắng bất kể theme vì luôn nằm trên nền màu cố định
// (gradient accent / toggle switch), không phải nền trắng-trên-trắng thật.
const ALLOWED_WHITE = new Set([
  'src/components/AppShell.jsx', // icon logo trên badge gradient indigo→violet
  'src/components/ChannelsTab.jsx', // thumb tròn của Toggle
  'src/pages/CreateStorePage.jsx', // icon "Tạo cửa hàng" trên badge gradient
  // Không có trong danh sách ngoại lệ mà .bangiao/thay-doi.md liệt kê tên (chỉ nêu
  // đúng 3 file trên) NHƯNG cùng bản chất: text-white đặt trên nút nền
  // bg-indigo-500 cố định (nút "Kết nối"), không phải nền trắng/surface theo theme.
  // -> ghi vào whitelist để test không đỏ oan, nhưng CẦN NÊU LẠI với coder/reviewer
  // vì báo cáo thay-doi.md nói "chỉ có 3 ngoại lệ" mà thực tế code có 4.
  'src/pages/channels/FacebookChannelPage.jsx',
])

describe('index.css — 4 lớp override theme (đường chạy thuận lợi)', () => {
  const css = readFileSync(join(SRC_DIR, 'index.css'), 'utf8')

  it('có khai báo token mặc định (tối) qua @theme', () => {
    expect(css).toMatch(/@theme\s*\{[^}]*--color-app:\s*#08090d/s)
  })

  it('có override khi người dùng CHỌN sáng: :root[data-theme="light"]', () => {
    expect(css).toMatch(/:root\[data-theme="light"\]\s*\{[^}]*--color-app:\s*#f6f7fb/s)
  })

  it('có fallback theo prefers-color-scheme CHỈ khi chưa từng chọn (:root:not([data-theme]))', () => {
    expect(css).toMatch(/@media \(prefers-color-scheme: light\)\s*\{\s*:root:not\(\[data-theme\]\)/)
  })

  it('có override khi người dùng CHỌN tối (thắng cả prefers-color-scheme ngược lại): :root[data-theme="dark"]', () => {
    expect(css).toMatch(/:root\[data-theme="dark"\]\s*\{[^}]*--color-app:\s*#08090d/s)
  })

  it('có @custom-variant dark gắn theo [data-theme="dark"] (không dùng media query mặc định của Tailwind)', () => {
    expect(css).toMatch(/@custom-variant dark \(&:where\(\[data-theme="dark"\]/)
  })
})

describe('src/** — không còn text-white/bg-white/border-white/divide-white hardcode ngoài whitelist (trường hợp biên đã nêu trong nhiệm vụ)', () => {
  const files = walk(SRC_DIR).filter((f) => !f.endsWith('index.css'))
  const pattern = /\b(text|bg|border|divide)-white(\/\d+)?\b/

  it('mọi occurrence còn lại đều nằm trong whitelist ngoại lệ cố ý đã biết', () => {
    const offenders = []
    for (const file of files) {
      const rel = 'src/' + file.slice(SRC_DIR.length + 1).replace(/\\/g, '/')
      const content = readFileSync(file, 'utf8')
      if (pattern.test(content) && !ALLOWED_WHITE.has(rel)) {
        offenders.push(rel)
      }
    }
    expect(offenders).toEqual([])
  })

  it('whitelist không có entry THỪA (nếu ai xoá hết white ở 1 file thì phải gỡ khỏi whitelist, tránh whitelist "chết" che giấu regression thật)', () => {
    const stale = []
    for (const rel of ALLOWED_WHITE) {
      const full = join(process.cwd(), rel)
      const content = readFileSync(full, 'utf8')
      if (!pattern.test(content)) stale.push(rel)
    }
    expect(stale).toEqual([])
  })
})

describe('src/** — không còn hex nền tối hardcode (#08090d/#12141b/#0a0b10) ngoài index.css', () => {
  it('index.css là NƠI DUY NHẤT còn các hex này (đó là định nghĩa token, hợp lệ)', () => {
    const files = walk(SRC_DIR)
    const hexPattern = /#08090d|#12141b|#0a0b10/i
    const offenders = files.filter((f) => !f.endsWith('index.css') && hexPattern.test(readFileSync(f, 'utf8')))
    expect(offenders).toEqual([])
  })
})

describe('src/** — đầu vào sai: phát hiện đúng khi CÓ hardcode mới bị thêm vào (kiểm hàm walk/pattern tự nó không bị false-negative)', () => {
  it('pattern text-white khớp đúng biến thể có opacity modifier (vd text-white/70) — không chỉ khớp dạng trần', () => {
    const pattern = /\b(text|bg|border|divide)-white(\/\d+)?\b/
    expect(pattern.test('className="text-white/70 something"')).toBe(true)
    expect(pattern.test('className="text-fg/70 something"')).toBe(false)
  })
})
