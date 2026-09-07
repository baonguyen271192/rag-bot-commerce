import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useClients } from '../clients-context';

const ID_PATTERN = /^[a-z0-9-]+$/;

function slugify(text) {
  return text
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export default function CreateTenantPage() {
  const { backendClient } = useClients();
  const navigate = useNavigate();
  const [id, setId] = useState('');
  const [idTouched, setIdTouched] = useState(false);
  const [name, setName] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const idError = id.length > 0 && !ID_PATTERN.test(id) ? 'Chỉ dùng chữ thường, số và dấu gạch ngang' : null;

  function handleNameChange(value) {
    setName(value);
    if (!idTouched) setId(slugify(value));
  }

  function handleIdChange(value) {
    setIdTouched(true);
    setId(value);
  }

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
      <h1 className="text-2xl font-semibold text-gray-900">Tạo cửa hàng mới</h1>
      <p className="mt-1 mb-6 text-sm text-gray-500">
        Kết nối Zalo bằng quét mã QR ở bước sau, không cần nhập số điện thoại ở đây.
      </p>
      <form
        onSubmit={handleSubmit}
        className="space-y-5 rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
      >
        <div>
          <label htmlFor="tenant-name" className="mb-1 block text-sm font-medium text-gray-700">
            Tên cửa hàng / doanh nghiệp
          </label>
          <input
            id="tenant-name"
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-base focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            placeholder="VD: Cà Phê Bình Minh"
            required
          />
        </div>
        <div>
          <label htmlFor="tenant-prompt" className="mb-1 block text-sm font-medium text-gray-700">
            Vai trò &amp; giọng điệu của bot
          </label>
          <textarea
            id="tenant-prompt"
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            rows={4}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-base focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            placeholder="Bạn là trợ lý AI, trả lời khách hàng thân thiện, ngắn gọn, dựa trên thông tin đã cung cấp."
            required
          />
          <p className="mt-1 text-sm text-gray-500">Có thể sửa lại bất cứ lúc nào sau khi tạo xong.</p>
        </div>
        <div>
          <div className="mb-1 flex items-baseline justify-between">
            <label htmlFor="tenant-id" className="text-sm font-medium text-gray-700">
              Mã định danh
            </label>
            <span className="text-xs text-gray-400">tự động tạo từ tên, có thể sửa</span>
          </div>
          <input
            id="tenant-id"
            value={id}
            onChange={(e) => handleIdChange(e.target.value)}
            className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 font-mono text-sm text-gray-600 focus:border-primary focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
            required
          />
          {idError && <p className="mt-1 text-sm text-danger">{idError}</p>}
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        <button
          type="submit"
          disabled={submitting || Boolean(idError)}
          className="cursor-pointer rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? 'Đang tạo...' : 'Tạo cửa hàng'}
        </button>
      </form>
    </div>
  );
}
