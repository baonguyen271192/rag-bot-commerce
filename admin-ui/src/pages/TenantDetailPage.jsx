import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useClients } from '../clients-context';
import StatusBadge from '../components/StatusBadge';

const ACCEPTED_EXTENSIONS = ['.md', '.txt', '.jpg', '.jpeg', '.png'];
const QR_POLL_INTERVAL_MS = 3000;

export default function TenantDetailPage() {
  const { id } = useParams();
  const { backendClient, bridgeClient } = useClients();

  const [tenant, setTenant] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [systemPrompt, setSystemPrompt] = useState('');
  const [savingPrompt, setSavingPrompt] = useState(false);
  const [promptSaved, setPromptSaved] = useState(false);
  const [promptError, setPromptError] = useState(null);

  const [documents, setDocuments] = useState([]);
  const [uploadError, setUploadError] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [submittingUrl, setSubmittingUrl] = useState(false);

  const [qrStatus, setQrStatus] = useState({ status: 'unknown' });
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState(null);

  const fileInputRef = useRef(null);

  const loadDocuments = useCallback(() => {
    backendClient
      .listDocuments(id)
      .then(setDocuments)
      .catch((err) => setUploadError(err.message));
  }, [backendClient, id]);

  useEffect(() => {
    let cancelled = false;
    backendClient
      .getTenant(id)
      .then((t) => {
        if (cancelled) return;
        setTenant(t);
        setSystemPrompt(t.systemPrompt);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err.message);
      });
    loadDocuments();
    return () => {
      cancelled = true;
    };
  }, [backendClient, id, loadDocuments]);

  useEffect(() => {
    let cancelled = false;
    function poll() {
      bridgeClient
        .getQrStatus(id)
        .then((status) => {
          if (!cancelled) setQrStatus(status);
        })
        .catch(() => {
          if (!cancelled) setQrStatus({ status: 'unknown' });
        });
    }
    poll();
    const intervalId = setInterval(poll, QR_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [bridgeClient, id]);

  async function handleSavePrompt(e) {
    e.preventDefault();
    setSavingPrompt(true);
    setPromptSaved(false);
    setPromptError(null);
    try {
      await backendClient.updateSystemPrompt(id, systemPrompt);
      setPromptSaved(true);
    } catch (err) {
      setPromptError(err.message);
    } finally {
      setSavingPrompt(false);
    }
  }

  async function handleUpload(file) {
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    if (!ACCEPTED_EXTENSIONS.includes(ext)) {
      setUploadError(`Định dạng không hỗ trợ: ${ext}`);
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      await backendClient.uploadDocument(id, file);
      loadDocuments();
    } catch (err) {
      setUploadError(err.message);
    } finally {
      setUploading(false);
    }
  }

  async function handleUploadFromUrl(e) {
    e.preventDefault();
    if (!urlInput.trim()) return;
    setSubmittingUrl(true);
    setUploadError(null);
    try {
      await backendClient.uploadDocumentFromUrl(id, urlInput.trim());
      setUrlInput('');
      loadDocuments();
    } catch (err) {
      setUploadError(err.message);
    } finally {
      setSubmittingUrl(false);
    }
  }

  async function handleDelete(docId) {
    if (!window.confirm('Xoá tài liệu này?')) return;
    try {
      await backendClient.deleteDocument(id, docId);
      loadDocuments();
    } catch (err) {
      setUploadError(err.message);
    }
  }

  async function handleLogout() {
    if (!window.confirm('Đăng xuất tài khoản Zalo đang kết nối? Sẽ cần quét QR mới để kết nối lại.')) return;
    setLoggingOut(true);
    setLogoutError(null);
    try {
      await bridgeClient.logout(id);
    } catch (err) {
      setLogoutError(err.message);
    } finally {
      setLoggingOut(false);
    }
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files[0];
    if (file) handleUpload(file);
  }

  if (loadError) {
    return <p className="text-danger">Không tải được tenant: {loadError}</p>;
  }
  if (!tenant) {
    return <p className="text-gray-500">Đang tải...</p>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">{tenant.name}</h1>
        <StatusBadge status={qrStatus.status} />
      </div>

      <section aria-labelledby="qr-heading" className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 id="qr-heading" className="mb-3 text-lg font-medium text-gray-900">
          Đăng nhập Zalo
        </h2>
        {qrStatus.status === 'logged_in' && (
          <div className="flex items-center justify-between">
            <p className="text-accent">Đã đăng nhập, bot đang hoạt động.</p>
            <button
              type="button"
              onClick={handleLogout}
              disabled={loggingOut}
              className="cursor-pointer rounded-lg border border-danger px-3 py-1.5 text-sm font-medium text-danger hover:bg-danger/5 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loggingOut ? 'Đang đăng xuất...' : 'Đăng xuất'}
            </button>
          </div>
        )}
        {logoutError && <p className="mt-2 text-sm text-danger">{logoutError}</p>}
        {qrStatus.status === 'awaiting_qr' && qrStatus.qrUrl && (
          <div>
            <p className="mb-3 text-gray-600">Quét mã QR này bằng tài khoản Zalo của nhà hàng:</p>
            <img
              src={`${bridgeClient.baseUrl}${qrStatus.qrUrl}?t=${Date.now()}`}
              alt="QR đăng nhập Zalo"
              className="h-48 w-48 rounded-lg border border-gray-200"
            />
          </div>
        )}
        {qrStatus.status === 'error' && (
          <p className="text-danger">Lỗi đăng nhập: {qrStatus.error || 'không rõ nguyên nhân'}</p>
        )}
        {qrStatus.status === 'unknown' && (
          <p className="text-gray-500">
            Chưa kết nối với bridge — nếu vừa tạo tenant, cần khởi động lại dịch vụ bridge để nó nhận tenant mới.
          </p>
        )}
      </section>

      <section aria-labelledby="prompt-heading" className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 id="prompt-heading" className="mb-3 text-lg font-medium text-gray-900">
          System prompt
        </h2>
        <form onSubmit={handleSavePrompt} className="space-y-3">
          <label htmlFor="system-prompt" className="sr-only">
            System prompt
          </label>
          <textarea
            id="system-prompt"
            value={systemPrompt}
            onChange={(e) => {
              setSystemPrompt(e.target.value);
              setPromptSaved(false);
              setPromptError(null);
            }}
            rows={4}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-base focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={savingPrompt}
              className="cursor-pointer rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {savingPrompt ? 'Đang lưu...' : 'Lưu'}
            </button>
            {promptSaved && <span className="text-sm text-accent">Đã lưu.</span>}
            {promptError && <span className="text-sm text-danger">{promptError}</span>}
          </div>
        </form>
      </section>

      <section aria-labelledby="documents-heading" className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 id="documents-heading" className="mb-3 text-lg font-medium text-gray-900">
          Tài liệu
        </h2>
        <div
          role="button"
          tabIndex={0}
          aria-label="Chọn hoặc kéo-thả file tài liệu để upload"
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          className={`mb-4 flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 text-center transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30 ${
            dragActive ? 'border-primary bg-primary/5' : 'border-gray-300'
          }`}
        >
          <p className="text-gray-600">Kéo-thả file vào đây, hoặc bấm để chọn (.md, .txt, .jpg, .jpeg, .png)</p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".md,.txt,.jpg,.jpeg,.png"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files[0];
              if (file) handleUpload(file);
              e.target.value = '';
            }}
          />
        </div>
        <form onSubmit={handleUploadFromUrl} className="mb-4 flex gap-2">
          <label htmlFor="document-url" className="sr-only">
            Hoặc dán link tải trực tiếp
          </label>
          <input
            id="document-url"
            type="url"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="Hoặc dán link tải file trực tiếp (không phải link chia sẻ Google Drive dạng xem trước)"
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <button
            type="submit"
            disabled={submittingUrl || !urlInput.trim()}
            className="cursor-pointer rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submittingUrl ? 'Đang tải...' : 'Tải từ URL'}
          </button>
        </form>
        {uploading && <p className="mb-3 text-sm text-gray-500">Đang tải lên...</p>}
        {uploadError && <p className="mb-3 text-sm text-danger">{uploadError}</p>}
        {documents.length === 0 ? (
          <p className="text-gray-500">Chưa có tài liệu nào.</p>
        ) : (
          <ul className="divide-y divide-gray-200">
            {documents.map((doc) => (
              <li key={doc.id} className="flex items-center justify-between py-2">
                <span className="text-gray-900">
                  {doc.filename} <span className="text-sm text-gray-500">({doc.chunkCount} đoạn)</span>
                </span>
                <button
                  type="button"
                  onClick={() => handleDelete(doc.id)}
                  className="cursor-pointer text-sm font-medium text-danger hover:underline"
                >
                  Xoá
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
