import { describe, it, expect } from 'vitest'
import { rowsForChannel, channelCounts, badgeTone, maskId, CHANNEL_TYPES } from '../../src/lib/channels'

const stores = [
  { id: 'default', name: 'Default', channels: { facebook: { enabled: true, connected: true, page_id: '123456789012' } } },
  { id: 'shop2', name: 'Shop2', channels: { facebook: { enabled: true, connected: false, page_id: null } } },
  { id: 'chao', name: 'Chao', channels: { facebook: { enabled: false, connected: false } } },
]

describe('channels.js — đường chạy thuận lợi', () => {
  it('rowsForChannel gắn đúng cfg của loại kênh cho từng store', () => {
    const rows = rowsForChannel(stores, 'facebook')
    expect(rows).toHaveLength(3)
    expect(rows[0].store.id).toBe('default')
    expect(rows[0].cfg.enabled).toBe(true)
    expect(rows[0].cfg.connected).toBe(true)
  })

  it('channelCounts đếm đúng active/total theo cờ enabled', () => {
    expect(channelCounts(stores, 'facebook')).toEqual({ active: 2, total: 3 })
  })

  it('maskId che đúng phần giữa, giữ đầu/cuối', () => {
    expect(maskId('123456789012')).toBe('123456••••12')
  })

  it('CHANNEL_TYPES đúng 3 loại kênh mà 3 trang kênh + AppShell dùng', () => {
    expect(CHANNEL_TYPES).toEqual(['facebook', 'zalo_personal', 'zalo_oa'])
  })
})

describe('channels.js — trường hợp biên (badgeTone: 3 mốc active/total)', () => {
  it('0 cửa hàng tồn tại (total=0) -> muted', () => {
    expect(badgeTone(0, 0)).toBe('muted')
  })

  it('có cửa hàng nhưng 0 cửa hàng bật (active=0, total>0) -> muted', () => {
    expect(badgeTone(0, 3)).toBe('muted')
  })

  it('bật một phần (0 < active < total) -> amber', () => {
    expect(badgeTone(1, 3)).toBe('amber')
    expect(badgeTone(2, 3)).toBe('amber')
  })

  it('bật hết 100% (active === total > 0) -> emerald', () => {
    expect(badgeTone(3, 3)).toBe('emerald')
    expect(badgeTone(1, 1)).toBe('emerald')
  })
})

describe('channels.js — trường hợp biên khác (maskId, rowsForChannel/channelCounts với dữ liệu rỗng/thiếu)', () => {
  it('maskId trả "—" khi value rỗng/null/undefined', () => {
    expect(maskId(null)).toBe('—')
    expect(maskId(undefined)).toBe('—')
    expect(maskId('')).toBe('—')
  })

  it('maskId trả nguyên chuỗi (KHÔNG che) khi chuỗi đủ ngắn (<= keepStart+keepEnd)', () => {
    expect(maskId('abcd', 6, 2)).toBe('abcd') // 4 <= 8
    expect(maskId('12345678', 6, 2)).toBe('12345678') // đúng biên = 8
  })

  it('maskId che đúng khi chuỗi dài hơn biên đúng 1 ký tự', () => {
    expect(maskId('123456789', 6, 2)).toBe('123456••••89') // 9 > 8
  })

  it('rowsForChannel trả [] khi stores là null/undefined (không throw)', () => {
    expect(rowsForChannel(null, 'facebook')).toEqual([])
    expect(rowsForChannel(undefined, 'facebook')).toEqual([])
  })

  it('rowsForChannel trả cfg={} khi store chưa có channels hoặc chưa có loại kênh đó', () => {
    const noChannels = [{ id: 'x', name: 'X' }]
    expect(rowsForChannel(noChannels, 'zalo_oa')).toEqual([{ store: noChannels[0], cfg: {} }])

    const noZaloOa = [{ id: 'y', channels: { facebook: { enabled: true } } }]
    expect(rowsForChannel(noZaloOa, 'zalo_oa')).toEqual([{ store: noZaloOa[0], cfg: {} }])
  })

  it('channelCounts trả {active:0, total:0} khi stores null/[] (dùng bởi AppShell khi API chưa trả về)', () => {
    expect(channelCounts(null, 'facebook')).toEqual({ active: 0, total: 0 })
    expect(channelCounts([], 'facebook')).toEqual({ active: 0, total: 0 })
  })
})

describe('channels.js — đầu vào sai', () => {
  it('badgeTone với số âm/NaN không rơi vào nhánh "emerald" sai (an toàn khi dữ liệu bất thường)', () => {
    // active âm không hợp lệ về nghiệp vụ nhưng hàm không được crash và không được
    // báo "emerald" (đã bật hết) một cách sai lệch khi active không thực sự bằng total dương.
    expect(() => badgeTone(-1, 3)).not.toThrow()
    expect(badgeTone(-1, 3)).not.toBe('emerald')
  })

  it('maskId với value không phải string (number) vẫn hoạt động nhờ String() ép kiểu, không throw', () => {
    expect(() => maskId(123456789012)).not.toThrow()
    expect(maskId(123456789012)).toBe('123456••••12')
  })

  it('rowsForChannel/channelCounts với ctype không tồn tại trong CHANNEL_TYPES vẫn không throw, trả cfg rỗng', () => {
    const rows = rowsForChannel(stores, 'khong_ton_tai')
    expect(rows.every((r) => Object.keys(r.cfg).length === 0)).toBe(true)
    expect(channelCounts(stores, 'khong_ton_tai')).toEqual({ active: 0, total: 3 })
  })
})
