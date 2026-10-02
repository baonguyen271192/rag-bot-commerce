// 2 "cổng" (console) riêng biệt dùng CHUNG 1 bundle React — phân biệt bằng tiền tố URL
// đọc 1 LẦN lúc load trang (window.location.pathname), không phải 2 app build riêng:
//   /admin/*  — console super admin, quản lý TẤT CẢ cửa hàng
//   /portal/* — cổng tự phục vụ cho CHỦ CỬA HÀNG, chỉ thấy cửa hàng của mình
// main.jsx dùng CONSOLE_PREFIX làm basename cho BrowserRouter (mọi route nội bộ như
// "/stores", "/channels/..." viết KHÔNG đổi theo tiền tố); AuthGuard dùng EXPECTED_ROLE
// để chặn sai cổng (vd chủ shop bấm nhầm link admin) — redirect bằng window.location
// (không phải react-router navigate) vì basename khác nhau giữa 2 tiền tố, không thể
// điều hướng nội bộ giữa chúng.
export const ADMIN_PREFIX = '/admin'
export const PORTAL_PREFIX = '/portal'

export const IS_PORTAL = window.location.pathname.startsWith(PORTAL_PREFIX)

export const CONSOLE_PREFIX = IS_PORTAL ? PORTAL_PREFIX : ADMIN_PREFIX
export const OTHER_PREFIX = IS_PORTAL ? ADMIN_PREFIX : PORTAL_PREFIX
export const EXPECTED_ROLE = IS_PORTAL ? 'tenant_owner' : 'super_admin'
