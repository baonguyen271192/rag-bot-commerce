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
        <div className="flex items-start gap-3 rounded-lg bg-primary/5 p-3 text-sm text-gray-700">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            className="mt-0.5 h-5 w-5 shrink-0 text-primary"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"
            />
          </svg>
          <p>
            Chưa cần nhập số điện thoại Zalo ở đây. Sau khi tạo xong, bạn sẽ quét mã QR ở trang chi tiết
            tenant bằng điện thoại đã đăng nhập Zalo của nhà hàng để kết nối.
          </p>
        </div>
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
          <p className="mt-1 text-sm text-gray-500">
            Định danh kỹ thuật, dùng nội bộ — chỉ chữ thường, số và dấu gạch ngang, không dấu, không khoảng
            trắng.
          </p>
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
            placeholder="Trúc Lâm Viên"
            required
          />
          <p className="mt-1 text-sm text-gray-500">Tên hiển thị, khách sẽ không thấy trực tiếp — chỉ để bạn quản lý dễ hơn.</p>
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
            placeholder="Bạn là trợ lý AI của nhà hàng Trúc Lâm Viên. Trả lời khách hàng thân thiện, ngắn gọn, dựa trên tài liệu menu và thông tin nhà hàng đã cung cấp."
            required
          />
          <p className="mt-1 text-sm text-gray-500">
            Mô tả vai trò và giọng điệu của bot khi trả lời khách. Có thể sửa lại sau ở trang chi tiết
            tenant.
          </p>
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
