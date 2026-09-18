import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getStoredTheme, getSystemTheme, getCurrentTheme, applyTheme } from '../../src/lib/theme'

const STORAGE_KEY = 'commerce-admin-theme'

function setMatchMedia(matchesLight) {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: query === '(prefers-color-scheme: light)' ? matchesLight : false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
}

beforeEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
  setMatchMedia(false) // mặc định OS = dark trừ khi test khác set lại
})

describe('theme.js — đường chạy thuận lợi', () => {
  it('getStoredTheme trả đúng giá trị đã lưu trong localStorage', () => {
    localStorage.setItem(STORAGE_KEY, 'light')
    expect(getStoredTheme()).toBe('light')
    localStorage.setItem(STORAGE_KEY, 'dark')
    expect(getStoredTheme()).toBe('dark')
  })

  it('getSystemTheme trả "light" khi OS ưu tiên sáng, "dark" khi ưu tiên tối', () => {
    setMatchMedia(true)
    expect(getSystemTheme()).toBe('light')
    setMatchMedia(false)
    expect(getSystemTheme()).toBe('dark')
  })

  it('applyTheme set data-theme trên <html> VÀ ghi localStorage', () => {
    applyTheme('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    expect(localStorage.getItem(STORAGE_KEY)).toBe('light')

    applyTheme('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(localStorage.getItem(STORAGE_KEY)).toBe('dark')
  })

  it('getCurrentTheme đọc lại đúng theme vừa applyTheme (đã có data-theme trên html)', () => {
    applyTheme('light')
    expect(getCurrentTheme()).toBe('light')
  })
})

describe('theme.js — trường hợp biên', () => {
  it('getStoredTheme trả null khi chưa từng lưu gì (localStorage trống)', () => {
    expect(getStoredTheme()).toBeNull()
  })

  it('getStoredTheme trả null khi localStorage bị chặn (throw) — KHÔNG được throw ra ngoài', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError: localStorage blocked (private mode)')
    })
    expect(() => getStoredTheme()).not.toThrow()
    expect(getStoredTheme()).toBeNull()
    spy.mockRestore()
  })

  it('applyTheme KHÔNG throw khi localStorage.setItem bị chặn — vẫn set được data-theme', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('SecurityError: localStorage blocked (private mode)')
    })
    expect(() => applyTheme('light')).not.toThrow()
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    spy.mockRestore()
  })

  it('getCurrentTheme khi CHƯA có data-theme trên html và CHƯA có localStorage → theo prefers-color-scheme (OS)', () => {
    setMatchMedia(true) // OS = light
    expect(getCurrentTheme()).toBe('light')

    setMatchMedia(false) // OS = dark
    expect(getCurrentTheme()).toBe('dark')
  })

  it('getCurrentTheme ưu tiên localStorage hơn OS khi CHƯA có data-theme trên html', () => {
    localStorage.setItem(STORAGE_KEY, 'light')
    setMatchMedia(false) // OS nói dark, nhưng đã có lựa chọn lưu là light
    expect(getCurrentTheme()).toBe('light')
  })
})

describe('theme.js — đầu vào sai/không hợp lệ', () => {
  it('getStoredTheme trả null (không phải giá trị rác) khi localStorage chứa chuỗi không hợp lệ', () => {
    localStorage.setItem(STORAGE_KEY, 'blue')
    expect(getStoredTheme()).toBeNull()

    localStorage.setItem(STORAGE_KEY, '')
    expect(getStoredTheme()).toBeNull()
  })

  it('getCurrentTheme không nhận giá trị rác từ data-theme trên html (fallback đúng, không trả nguyên giá trị rác)', () => {
    document.documentElement.setAttribute('data-theme', 'blue')
    setMatchMedia(false)
    // attr không hợp lệ ('blue') không được coi là 'light'/'dark' -> phải rơi về stored/system
    expect(getCurrentTheme()).not.toBe('blue')
    expect(['light', 'dark']).toContain(getCurrentTheme())
  })
})
