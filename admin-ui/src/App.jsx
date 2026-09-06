import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ClientsContext } from './clients-context';
import { createBackendClient } from './api/backend';
import { createBridgeClient } from './api/bridge';
import TenantListPage from './pages/TenantListPage';
import CreateTenantPage from './pages/CreateTenantPage';
import TenantDetailPage from './pages/TenantDetailPage';

const backendClient = createBackendClient({
  baseUrl: import.meta.env.VITE_BACKEND_URL || 'http://localhost:4001',
});
const bridgeClient = createBridgeClient({
  baseUrl: import.meta.env.VITE_BRIDGE_URL || 'http://localhost:4002',
});

export default function App() {
  return (
    <ClientsContext.Provider value={{ backendClient, bridgeClient }}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<TenantListPage />} />
          <Route path="/tenants/new" element={<CreateTenantPage />} />
          <Route path="/tenants/:id" element={<TenantDetailPage />} />
        </Routes>
      </BrowserRouter>
    </ClientsContext.Provider>
  );
}
