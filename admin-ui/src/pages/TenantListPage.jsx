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
    return <p className="text-danger">Không tải được danh sách tenant: {error}</p>;
  }

  if (tenants === null) {
    return <p className="text-gray-500">Đang tải...</p>;
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Danh sách tenant</h1>
        <Link
          to="/tenants/new"
          className="cursor-pointer rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          + Tạo tenant mới
        </Link>
      </div>
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {tenants.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                className="h-6 w-6"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 21h18M5 21V7l7-4 7 4v14M9 9h1m4 0h1m-6 4h1m4 0h1m-6 4h1m4 0h1"
                />
              </svg>
            </div>
            <p className="text-base font-medium text-gray-900">Chưa có tenant nào</p>
            <p className="max-w-sm text-sm text-gray-500">
              Tạo tenant đầu tiên để bắt đầu quản lý nhà hàng và bot Zalo.
            </p>
            <Link
              to="/tenants/new"
              className="mt-2 cursor-pointer rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              + Tạo tenant mới
            </Link>
          </div>
        ) : (
          <table className="w-full text-left">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-4 py-3 text-sm font-medium text-gray-600">
                  Tên
                </th>
                <th scope="col" className="px-4 py-3 text-sm font-medium text-gray-600">
                  Trạng thái Zalo
                </th>
                <th scope="col" className="px-4 py-3">
                  <span className="sr-only">Hành động</span>
                </th>
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
    </div>
  );
}
