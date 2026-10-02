import { Navigate, Route, Routes, useParams, useSearchParams } from 'react-router-dom'
import AppShell from './components/AppShell'
import AuthGuard from './components/AuthGuard'
import LoginPage from './pages/LoginPage'
import OverviewPage from './pages/OverviewPage'
import StoreListPage from './pages/StoreListPage'
import CreateStorePage from './pages/CreateStorePage'
import StoreLayout from './pages/store/StoreLayout'
import StoreConfigPage from './pages/store/StoreConfigPage'
import StoreChannelsPage from './pages/store/StoreChannelsPage'
import StoreMenuPage from './pages/store/StoreMenuPage'
import StoreOrdersPage from './pages/store/StoreOrdersPage'
import StoreConversationsPage from './pages/store/StoreConversationsPage'
import StoreCustomersPage from './pages/store/StoreCustomersPage'
import StoreCouponsPage from './pages/store/StoreCouponsPage'
import AccountPage from './pages/AccountPage'
import { useAuth } from './lib/auth'
import { DEFAULT_STORE_SECTION, isStoreSection, storeSectionPath } from './lib/store-nav'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/*"
        element={
          <AuthGuard>
            <AdminShellRoutes />
          </AuthGuard>
        }
      />
    </Routes>
  )
}

function AdminShellRoutes() {
  const { user } = useAuth()
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<OverviewPage />} />
        <Route path="/stores" element={<StoreListPage />} />
        {user?.role === 'super_admin' && <Route path="/stores/new" element={<CreateStorePage />} />}
        <Route path="/stores/:id" element={<StoreLayout />}>
          <Route index element={<StoreIndexRedirect />} />
          <Route path="config" element={<StoreConfigPage />} />
          <Route path="channels" element={<StoreChannelsPage />} />
          <Route path="menu" element={<StoreMenuPage />} />
          <Route path="orders" element={<StoreOrdersPage />} />
          <Route path="conversations" element={<StoreConversationsPage />} />
          <Route path="customers" element={<StoreCustomersPage />} />
          <Route path="coupons" element={<StoreCouponsPage />} />
          {/* Segment lạ (vd link cũ hỏng, gõ tay sai) -> về trang Cấu hình thay vì màn
              hình trắng/404 cục bộ trong khung cửa hàng. */}
          <Route path="*" element={<StoreIndexRedirect />} />
        </Route>
        <Route path="/account" element={<AccountPage />} />
      </Routes>
    </AppShell>
  )
}

// Tương thích ngược cho URL cũ `/stores/:id` và `/stores/:id` kèm query param `tab`
// (trước khi tách 6 tab thành 6 route riêng) — nhảy sang route mới tương ứng, giá trị
// `tab` lạ/không có thì rơi về DEFAULT_STORE_SECTION, không báo lỗi.
function StoreIndexRedirect() {
  const { id } = useParams()
  const [sp] = useSearchParams()
  const tab = sp.get('tab')
  return <Navigate to={storeSectionPath(id, isStoreSection(tab) ? tab : DEFAULT_STORE_SECTION)} replace />
}
