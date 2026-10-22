# TideGrade — Zero-Knowledge & Quorum-Governed Grade Integrity Platform

> **RMIT Hackathon 2026 Challenge 2 (Tide UNLOCKED)**  
> *"Điểm thi bất khả xâm phạm: Không thể xem lén, không thể sửa đổi."*

![RMIT Hackathon](https://img.shields.io/badge/RMIT%20Hackathon-2026-blue)
![Tide UNLOCKED](https://img.shields.io/badge/Challenge-Tide%20UNLOCKED-9dcdaa)
![Next.js](https://img.shields.io/badge/Next.js-16%20Turbopack-black)
![Security](https://img.shields.io/badge/Security-E2EE%20%2B%20QEA%20Quorum%20(2%2F3)-green)

---

## 🎯 Giới thiệu Sản phẩm

**TideGrade** giải quyết bài toán nhức nhối bậc nhất trong giáo dục đại học và các kỳ thi quốc gia: **Hiểm họa gian lận sửa điểm từ nội bộ (Insider Threat / Rogue DBAs) và nguy cơ rò rỉ dữ liệu học vụ**.

### Điểm đột phá công nghệ:
1. **Client-side E2EE (Mã hóa đầu cuối tại Trình duyệt Giảng viên):** Điểm thi được mã hoá trực tiếp trên trình duyệt của giảng viên thông qua Tide SDK `doEncrypt`. Server và Database SQLite hoàn toàn là **Zero-Knowledge** (chỉ lưu Ciphertext). Kể cả hacker chiếm server hay DBA mở database cũng không thể đọc được điểm.
2. **Cơ chế Đồng thuận Đa bên Quorum QEA (2/3):** Bảng điểm một khi đã niêm phong thì **không một ai (kể cả Hiệu trưởng hay Superadmin) có thể tự ý sửa điểm**. Bất kỳ chỉnh sửa nào (phúc khảo) bắt buộc phải qua Hội đồng Khảo thí (ít nhất 2/3 thành viên ký duyệt độc lập trên Tide Console) mới được cấp quyền giải mã / cập nhật.
3. **DPoP & Token-Binding:** Chống cướp session hoặc replay attacks từ kẻ xấu.
4. **Live Auditor Attack Sandbox:** Cho phép Ban Giám Khảo kiểm chứng trực tiếp: Thử đọc database raw, thử can thiệp sửa ciphertext (phát hiện lỗi chữ ký số mật mã ngay lập tức).

---

## 🚀 Khởi chạy Nhanh (Quick Start)

Yêu cầu môi trường: **Node.js 24**, TideCloak đang chạy trên cổng `8080`.

```bash
# 1. Cài đặt thư viện
npm ci

# 2. Khởi chạy môi trường phát triển
npm run dev
```

Mở trình duyệt tại: **`http://localhost:3000`**

---

## 🎬 Kịch bản Demo 5 phút trước Ban Giám Khảo

Xem chi tiết kịch bản và câu trả lời Q&A tại: **[PITCH_AND_DEMO_GUIDE.md](PITCH_AND_DEMO_GUIDE.md)**

1. **Màn 1: Giảng viên Niêm phong Điểm (E2EE):**
   - Đăng nhập qua TideCloak DPoP.
   - Nhập điểm môn `COSC2759 Distributed Systems` cho sinh viên `s3912345 (Hoang Nguyen)`.
   - Bấm **"🔒 Mã Hóa E2EE & Niêm Phong Bảng Điểm"**.
2. **Màn 2: Thử thách Hacker (Live Attack Proof):**
   - Vào Tab **"🛡️ Giả Lập Tấn Công"**.
   - Bấm **"🔍 Soi Trực Tiếp Database SQLite"** ➔ Chứng minh DB chỉ có ciphertext vô nghĩa.
   - Bấm **"⚡ Giả Lập Hacker Đột Nhập Sửa Điểm Trong Database"** ➔ Khi giải mã, Tide SDK phát hiện lỗi vỡ chữ ký mật mã ngay lập tức.
3. **Màn 3: Phúc Khảo với Quorum QEA 2/3 (Điểm nhấn ăn tiền):**
   - Sinh viên gửi đơn phúc khảo.
   - Vào Tab **"🏛️ Hội Đồng Khảo Thí & Quorum QEA"** (hoặc mở [Tide Console](http://localhost:8080/realms/nextjs-test/tide-console/)):
     - Cán bộ A duyệt: Đạt `1/2 Approvals` (Pending - Vẫn khóa điểm).
     - Trưởng khoa B duyệt: Đạt `2/2 Quorum` (Tide Fabric auto-commit).
   - Quyền `_tide_case001.selfdecrypt` được cấp phát ➔ Bấm **"🔑 Giải Mã Điểm Thi"** bung ra bảng điểm chính thức `HD 9.4`!

---

## 📁 Cấu trúc Dự án

- `app/page.tsx`: Cổng đăng nhập TideGrade phong cách RMIT với Tide IDP.
- `app/home/page.tsx`: Dashboard hợp nhất 3 Tab (Giảng viên/Sinh viên, Hội đồng QEA, Sandbox Hacker).
- `app/api/cases/[id]/evidence/route.ts`: API lưu ciphertext và giải mã kiểm soát quyền.
- `app/api/audit/route.ts`: API kiểm tra database raw và giả lập tấn công tamper.
- `lib/server/db.ts`: SQLite adapter lưu trữ dữ liệu mô phỏng.
- `tidecloak.json`: Cấu hình OIDC client và Tide Fabric parameters.
