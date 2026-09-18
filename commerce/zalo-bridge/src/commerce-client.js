'use strict';

class CommerceClient {
  constructor({ baseUrl, bridgeSecret = '', fetchImpl = fetch }) {
    this.baseUrl = baseUrl;
    this.bridgeSecret = bridgeSecret;
    this.fetch = fetchImpl;
  }

  _headers(extra = {}) {
    // Trust boundary chính là bind localhost 2 chiều; ZALO_BRIDGE_SECRET là lớp phòng
    // vệ THÊM, tuỳ chọn (xem kế hoạch multi-tenant câu 11 + commerce/app/main.py
    // _require_bridge_secret).
    const headers = { ...extra };
    if (this.bridgeSecret) headers['X-Bridge-Secret'] = this.bridgeSecret;
    return headers;
  }

  async listTenants() {
    const res = await this.fetch(`${this.baseUrl}/api/admin/stores`, { headers: this._headers() });
    if (!res.ok) {
      throw new Error(`listTenants failed with status ${res.status}`);
    }
    const allStores = await res.json();
    // Chỉ store đã BẬT kênh Zalo cá nhân mới cần 1 phiên zca-js sống. Discover 1 lần
    // lúc start (không poll) -- thêm store bật Zalo cá nhân sau đó cần restart sidecar
    // (cố hữu, đã ghi trong CLAUDE.md), khác FB/Zalo OA (đọc live từ commerce).
    return allStores.filter((s) => s.zalo_enabled === true).map((s) => ({ id: s.id }));
  }

  async askCommerce(storeId, { senderId, text }) {
    const res = await this.fetch(`${this.baseUrl}/channels/zalo/message`, {
      method: 'POST',
      headers: this._headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ store_id: storeId, sender_id: senderId, text }),
    });
    if (!res.ok) {
      throw new Error(`askCommerce failed with status ${res.status}`);
    }
    const data = await res.json();
    return { sends: data.sends || [] };
  }

  async downloadImageByUrl(url) {
    // TODO(cần chốt câu 12): CHƯA chạy thử live liệu zca-js sendMessage() có nhận
    // AttachmentSource dạng string = URL từ xa trực tiếp không (chỉ thấy dùng
    // {data: Buffer} trong bridge/ gốc, chưa từng thấy truyền URL trần -- xem
    // kế hoạch multi-tenant câu 12). Đang dùng phương án AN TOÀN: luôn tự tải bytes rồi
    // truyền {data: Buffer} (tenant-session.js/buildSendMessageArg) -- nếu sau này xác
    // nhận URL trần chạy được thì có thể bỏ bước tải này để giảm 1 round-trip HTTP.
    // Ảnh sản phẩm của commerce là URL công khai (hoặc qua tunnel) -- khác backend-client.js
    // gốc (bridge/) tải qua endpoint per-tenant CÓ AUTH của backend, endpoint đó không tồn
    // tại ở commerce nên KHÔNG dùng lại được (xem kế hoạch B3).
    const res = await this.fetch(url);
    if (!res.ok) {
      throw new Error(`downloadImageByUrl failed with status ${res.status}`);
    }
    const contentType = res.headers.get('content-type') || 'image/jpeg';
    const buffer = Buffer.from(await res.arrayBuffer());
    return { data: buffer, contentType };
  }
}

module.exports = { CommerceClient };
