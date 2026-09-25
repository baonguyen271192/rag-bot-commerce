import { Route, Routes } from 'react-router-dom'
import AppShell from './components/AppShell'
import OverviewPage from './pages/OverviewPage'
import StoreListPage from './pages/StoreListPage'
import CreateStorePage from './pages/CreateStorePage'
import StoreDetailPage from './pages/StoreDetailPage'
import FacebookChannelPage from './pages/channels/FacebookChannelPage'
import ZaloPersonalChannelPage from './pages/channels/ZaloPersonalChannelPage'
import ZaloOaChannelPage from './pages/channels/ZaloOaChannelPage'

export default function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<OverviewPage />} />
        <Route path="/stores" element={<StoreListPage />} />
        <Route path="/stores/new" element={<CreateStorePage />} />
        <Route path="/stores/:id" element={<StoreDetailPage />} />
        <Route path="/channels/facebook" element={<FacebookChannelPage />} />
        <Route path="/channels/zalo-personal" element={<ZaloPersonalChannelPage />} />
        <Route path="/channels/zalo-oa" element={<ZaloOaChannelPage />} />
      </Routes>
    </AppShell>
  )
}
