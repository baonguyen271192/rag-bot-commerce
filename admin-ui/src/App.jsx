import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ClientsContext } from './clients-context';
import { createBackendClient } from './api/backend';
import { createBridgeClient } from './api/bridge';

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
          <Route path="/" element={<div className="p-8">Danh sách tenant (đang xây dựng)</div>} />
          <Route path="/tenants/new" element={<div className="p-8">Tạo tenant (đang xây dựng)</div>} />
          <Route path="/tenants/:id" element={<div className="p-8">Chi tiết tenant (đang xây dựng)</div>} />
        </Routes>
      </BrowserRouter>
    </ClientsContext.Provider>
  );
}
