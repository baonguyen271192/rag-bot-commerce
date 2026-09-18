import { describe, it, expect, vi, afterEach } from 'vitest'
import { api } from '../../src/lib/api'

function mockFetchOnce(response) {
  global.fetch = vi.fn().mockResolvedValue(response)
}

afterEach(() => {
  vi.restoreAllMocks()
  delete global.fetch
})

describe('api.js — đường chạy thuận lợi', () => {
  it('listStores gọi đúng path và trả JSON khi 200', async () => {
    mockFetchOnce({ ok: true, status: 200, json: async () => [{ id: 'default' }] })
    const result = await api.listStores()
    expect(global.fetch).toHaveBeenCalledWith('/api/admin/stores', expect.any(Object))
    expect(result).toEqual([{ id: 'default' }])
  })

  it('deleteStore trả null khi backend trả 204 No Content (không có body)', async () => {
    mockFetchOnce({ ok: true, status: 204 })
    const result = await api.deleteStore('default')
    expect(result).toBeNull()
  })
})

describe('api.js — trường hợp biên', () => {
  it('setChannel gửi đúng method PUT + đúng path theo store id/ctype', async () => {
    mockFetchOnce({ ok: true, status: 200, json: async () => ({ enabled: true }) })
    await api.setChannel('default', 'facebook', { enabled: true })
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/admin/stores/default/channels/facebook',
      expect.objectContaining({ method: 'PUT' })
    )
  })

  it('restartZaloBridge là STUB — gọi đúng endpoint CHƯA tồn tại ở backend, và khi backend trả 404 thì throw đúng Error để trang gọi bắt được', async () => {
    mockFetchOnce({
      ok: false,
      status: 404,
      json: async () => ({ detail: 'Not Found' }),
    })
    await expect(api.restartZaloBridge()).rejects.toThrow('Not Found')
    expect(global.fetch).toHaveBeenCalledWith('/api/admin/zalo-bridge/restart', expect.objectContaining({ method: 'POST' }))
  })
})

describe('api.js — đầu vào sai / lỗi HTTP phải thất bại đúng cách', () => {
  it('lỗi HTTP có body JSON detail -> Error.message = detail (không phải "Lỗi <status>" chung)', async () => {
    mockFetchOnce({ ok: false, status: 400, json: async () => ({ detail: 'page_id đã thuộc store khác' }) })
    await expect(api.listStores()).rejects.toThrow('page_id đã thuộc store khác')
  })

  it('lỗi HTTP KHÔNG có body JSON hợp lệ (vd 502 trả HTML) -> vẫn throw Error "Lỗi <status>", không crash im lặng', async () => {
    mockFetchOnce({
      ok: false,
      status: 502,
      json: async () => {
        throw new SyntaxError('Unexpected token < in JSON')
      },
    })
    await expect(api.listStores()).rejects.toThrow('Lỗi 502')
  })

  it('fetch tự nó reject (mất mạng/backend chưa lên) -> promise reject, không phải resolve với giá trị rác', async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(api.listStores()).rejects.toThrow('Failed to fetch')
  })
})
