import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useClients } from '../clients-context';

const ID_PATTERN = /^[a-z0-9-]+$/;

export default function CreateTenantPage() {
  const { backendClient } = useClients();
  const navigate = useNavigate();
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const idError = id.length > 0 && !ID_PATTERN.test(id) ? 'Chỉ dùng chữ thường, số và dấu gạch ngang' : null;

  async function handleSubmit(e) {
    e.preventDefault();
    if (idError) return;
    setSubmitting(true);
    setError(null);
    try {
      await backendClient.createTenant({ id, name, systemPrompt });
      navigate(`/tenants/${id}`);
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-6 text-2xl font-semibold text-gray-900">Tạo tenant mới</h1>
      <form
        onSubmit={handleSubmit}
        className="space-y-5 rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
      >
        <div>
          <label htmlFor="tenant-id" className="mb-1 block text-sm font-medium text-gray-700">
            Mã tenant (id)
          </label>
          <input
            id="tenant-id"
            value={id}
            onChange={(e) => setId(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-base focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            placeholder="truc-lam-vien"
            required
          />
          {idError && <p className="mt-1 text-sm text-danger">{idError}</p>}
        </div>
        <div>
          <label htmlFor="tenant-name" className="mb-1 block text-sm font-medium text-gray-700">
            Tên nhà hàng
          </label>
          <input
            id="tenant-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-base focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            required
          />
        </div>
        <div>
          <label htmlFor="tenant-prompt" className="mb-1 block text-sm font-medium text-gray-700">
            System prompt ban đầu
          </label>
          <textarea
            id="tenant-prompt"
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            rows={4}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-base focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            required
          />
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        <button
          type="submit"
          disabled={submitting || Boolean(idError)}
          className="cursor-pointer rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? 'Đang tạo...' : 'Tạo tenant'}
        </button>
      </form>
    </div>
  );
}
