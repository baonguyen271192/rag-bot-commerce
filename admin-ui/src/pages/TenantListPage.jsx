import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useClients } from '../clients-context';
import StatusBadge from '../components/StatusBadge';

export default function TenantListPage() {
  const { backendClient, bridgeClient } = useClients();
  const [tenants, setTenants] = useState(null);
  const [statuses, setStatuses] = useState({});
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    backendClient
      .listTenants()
      .then((list) => {
        if (!cancelled) setTenants(list);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });

    bridgeClient
      .listSessions()
      .then((sessions) => {
        if (cancelled) return;
        const map = {};
        for (const s of sessions) map[s.tenantId] = s.status;
        setStatuses(map);
      })
      .catch(() => {
        // bridge unreachable: tenants still render, each shows "unknown" status
      });

    return () => {
      cancelled = true;
    };
  }, [backendClient, bridgeClient]);

  if (error) {
    return <p className="p-8 text-danger">Không tải được danh sách tenant: {error}</p>;
  }

  if (tenants === null) {
    return <p className="p-8 text-gray-500">Đang tải...</p>;
  }

  return (
    <div className="mx-auto max-w-4xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Danh sách tenant</h1>
        <Link
          to="/tenants/new"
          className="cursor-pointer rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          + Tạo tenant mới
        </Link>
      </div>
      {tenants.length === 0 ? (
        <p className="text-gray-500">Chưa có tenant nào.</p>
      ) : (
        <table className="w-full border-collapse overflow-hidden rounded-lg border border-gray-200 text-left">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-sm font-medium text-gray-600">Tên</th>
              <th className="px-4 py-3 text-sm font-medium text-gray-600">Trạng thái Zalo</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {tenants.map((tenant) => (
              <tr key={tenant.id} className="border-t border-gray-200">
                <td className="px-4 py-3 text-gray-900">{tenant.name}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={statuses[tenant.id] || 'unknown'} />
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    to={`/tenants/${tenant.id}`}
                    className="cursor-pointer text-sm font-medium text-primary hover:underline"
                  >
                    Chi tiết
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
