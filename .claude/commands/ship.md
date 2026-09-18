---
description: Chay tron day chuyen 4 agent cho mot yeu cau tinh nang
argument-hint: [mo ta tinh nang]
---

Chạy trọn dây chuyền làm tính năng cho: $ARGUMENTS

Làm lần lượt, không nhảy cóc. Sau mỗi chặng, kiểm tra file bàn giao đã tồn tại và
đọc qua nó, rồi mới sang chặng kế tiếp.

**Chặng 0 — chuẩn bị**
- Chạy `git branch --show-current`. Nếu đang ở `main` hoặc `master`, DỪNG LẠI và
  báo tôi biết, không chạy tiếp.
- Chạy `git status --porcelain`. Nếu có thay đổi chưa commit, báo tôi biết trước
  khi tiếp tục.
- Xoá các file của lần chạy trước trong `.bangiao/`: ke-hoach.md, thay-doi.md,
  ket-qua-test.md, danh-gia.md.

**Chặng 1 — Planner**
- Giao việc cho subagent `planner` kèm nguyên văn yêu cầu ở trên.
- Chờ tới khi `.bangiao/ke-hoach.md` tồn tại, rồi đọc nó.

**Chặng 2 — Coder**
- Nếu kế hoạch có mục CÂU HỎI CÒN BỎ NGỎ: DỪNG LẠI, đưa các câu hỏi đó cho tôi.
- Nếu không: giao việc cho subagent `coder`.
- Chờ tới khi `.bangiao/thay-doi.md` tồn tại.

**Chặng 3 — Tester**
- Giao việc cho subagent `tester`.
- Chờ tới khi `.bangiao/ket-qua-test.md` tồn tại.
- Có test fail: DỪNG LẠI, cho tôi xem phần fail. Không tự sửa, không gọi lại coder.

**Chặng 4 — Reviewer**
- Giao việc cho subagent `reviewer`.
- Nếu reviewer trả phán quyết ra output thay vì file, hãy ghi nguyên văn vào
  `.bangiao/danh-gia.md`.
- Cho tôi xem toàn văn `.bangiao/danh-gia.md`.

Cuối cùng báo lại phán quyết. Tuyệt đối không merge, không push, không tạo pull
request, không commit. Để nguyên nhánh đó cho tôi tự xem.
