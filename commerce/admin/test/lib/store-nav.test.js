import { describe, it, expect } from 'vitest'
import {
  STORE_SECTIONS,
  DEFAULT_STORE_SECTION,
  isStoreSection,
  storeSectionPath,
  storeIdFromPath,
} from '../../src/lib/store-nav'

describe('store-nav.js — đường chạy thuận lợi', () => {
  it('STORE_SECTIONS đúng 7 mục, đúng thứ tự, đủ label/icon', () => {
    expect(STORE_SECTIONS.map((s) => s.key)).toEqual([
      'config', 'channels', 'menu', 'orders', 'conversations', 'customers', 'coupons',
    ])
    for (const s of STORE_SECTIONS) {
      expect(s.label).toBeTruthy()
      expect(s.icon).toBeTruthy()
    }
  })

  it("storeSectionPath('abc', 'menu') -> '/stores/abc/menu'", () => {
    expect(storeSectionPath('abc', 'menu')).toBe('/stores/abc/menu')
  })

  it("storeIdFromPath('/stores/abc/menu') -> 'abc'", () => {
    expect(storeIdFromPath('/stores/abc/menu')).toBe('abc')
  })
})

describe('store-nav.js — trường hợp biên', () => {
  it("storeIdFromPath('/stores/abc') -> 'abc' (không có segment section)", () => {
    expect(storeIdFromPath('/stores/abc')).toBe('abc')
  })

  it("storeIdFromPath('/stores/abc/menu/extra') -> 'abc'", () => {
    expect(storeIdFromPath('/stores/abc/menu/extra')).toBe('abc')
  })

  it("storeIdFromPath('/stores/new') -> null (trang tạo mới, không phải cửa hàng)", () => {
    expect(storeIdFromPath('/stores/new')).toBeNull()
  })

  it("storeIdFromPath('/stores') và '/stores/' -> null", () => {
    expect(storeIdFromPath('/stores')).toBeNull()
    expect(storeIdFromPath('/stores/')).toBeNull()
  })

  it("storeIdFromPath('/'), '/channels/facebook', '/storesX/abc' -> null", () => {
    expect(storeIdFromPath('/')).toBeNull()
    expect(storeIdFromPath('/channels/facebook')).toBeNull()
    expect(storeIdFromPath('/storesX/abc')).toBeNull()
  })

  it("storeSectionPath('abc', 'khong-ton-tai') -> '/stores/abc/config' (rơi về mặc định)", () => {
    expect(storeSectionPath('abc', 'khong-ton-tai')).toBe(`/stores/abc/${DEFAULT_STORE_SECTION}`)
  })

  it("isStoreSection('config') -> true; isStoreSection('tab') -> false", () => {
    expect(isStoreSection('config')).toBe(true)
    expect(isStoreSection('tab')).toBe(false)
  })
})

describe('store-nav.js — đầu vào sai (không ném lỗi)', () => {
  it('storeIdFromPath(undefined/null/123) -> null, không throw', () => {
    expect(() => storeIdFromPath(undefined)).not.toThrow()
    expect(storeIdFromPath(undefined)).toBeNull()
    expect(storeIdFromPath(null)).toBeNull()
    expect(storeIdFromPath(123)).toBeNull()
  })

  it("storeSectionPath('', 'menu') và storeSectionPath(null, 'menu') -> '/stores', không sinh chuỗi hỏng", () => {
    expect(storeSectionPath('', 'menu')).toBe('/stores')
    expect(storeSectionPath(null, 'menu')).toBe('/stores')
  })
})
