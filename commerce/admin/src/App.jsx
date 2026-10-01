import { Route, Routes } from 'react-router-dom'
import AppShell from './components/AppShell'
import AuthGuard from './components/AuthGuard'
import LoginPage from './pages/LoginPage'
import OverviewPage from './pages/OverviewPage'
import StoreListPage from './pages/StoreListPage'
import CreateStorePage from './pages/CreateStorePage'
import StoreDetailPage from './pages/StoreDetailPage'
import AccountPage from './pages/AccountPage'
import FacebookChannelPage from './pages/channels/FacebookChannelPage'
import ZaloPersonalChannelPage from './pages/channels/ZaloPersonalChannelPage'
import ZaloOaChannelPage from './pages/channels/ZaloOaChannelPage'
import { useAuth } from './lib/auth'

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
        <Route path="/stores/:id" element={<StoreDetailPage />} />
        <Route path="/account" element={<AccountPage />} />
        <Route path="/channels/facebook" element={<FacebookChannelPage />} />
        <Route path="/channels/zalo-personal" element={<ZaloPersonalChannelPage />} />
        <Route path="/channels/zalo-oa" element={<ZaloOaChannelPage />} />
      </Routes>
    </AppShell>
  )
}
