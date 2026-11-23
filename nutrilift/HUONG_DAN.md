# Hướng dẫn sử dụng NutriLift

Mục tiêu: mở cùng một app trên **điện thoại** và **máy tính** ở bất cứ đâu (4G, wifi khác nhau…), dữ liệu tự đồng bộ.
Cần 2 thứ, đều **miễn phí**:

1. **Một địa chỉ web** cho app → GitHub Pages (hoặc Vercel/Netlify).
2. **Một nơi lưu dữ liệu đồng bộ** → Supabase (dữ liệu là của riêng bạn).

> App vẫn chạy được không cần bước 2 (dữ liệu chỉ nằm trên từng thiết bị, chuyển bằng file sao lưu).

---

## Bước 1 — Đưa app lên mạng bằng GitHub Pages (~10 phút)

1. Đăng nhập [github.com](https://github.com) → nút **New repository** → đặt tên, ví dụ `nutrilift` → chọn **Public** → **Create repository**.
   (GitHub Pages miễn phí cho repo Public. Repo chỉ chứa mã nguồn — dữ liệu cá nhân của bạn KHÔNG nằm ở đây.)
2. Đưa mã nguồn lên repo, chọn một cách:
   - **Dòng lệnh** (trong thư mục `nutrilift`):

     ```bash
     git remote add origin https://github.com/<tên-github>/nutrilift.git
     ```

     ```bash
     git push -u origin main
     ```

   - **Trên web**: trong repo mới, bấm **uploading an existing file**, kéo-thả toàn bộ nội dung thư mục (trừ `node_modules`, `dist`) → **Commit changes**.
     Lưu ý: thư mục `.github` phải được tải lên đúng chỗ (`.github/workflows/deploy.yml`).
3. Trong repo: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
4. Vào tab **Actions**, đợi workflow **Deploy GitHub Pages** chạy xong (dấu ✓ xanh, ~2 phút).
5. App có địa chỉ: `https://<tên-github>.github.io/nutrilift/` — mở thử trên máy tính và điện thoại.

Mỗi lần bạn sửa code và đẩy lên `main`, app tự cập nhật (app đã cài trên điện thoại cũng tự nhận bản mới).

**Thay thế**: [Vercel](https://vercel.com) / [Netlify](https://netlify.com) / [Cloudflare Pages](https://pages.cloudflare.com) → *Import Git repository* →
Build command `npm run build`, Output directory `dist`.

---

## Bước 2 — Bật đồng bộ giữa các thiết bị bằng Supabase (~10 phút)

1. Đăng ký tại [supabase.com](https://supabase.com) → **New project** → đặt tên, mật khẩu database (tự lưu lại), chọn vùng gần nhất
   (ví dụ *Southeast Asia (Singapore)*) → **Create**.
2. Khi project sẵn sàng: menu trái **SQL Editor → New query** → mở file [`supabase/schema.sql`](supabase/schema.sql), sao chép toàn bộ, dán vào → **Run**.
   Thấy "Success" là xong (chạy lại nhiều lần cũng không sao).
3. **Authentication → URL Configuration → Site URL**: điền địa chỉ app ở Bước 1 (ví dụ `https://<tên-github>.github.io/nutrilift/`).
   *(Muốn khỏi xác nhận email: Authentication → Sign In / Providers → Email → tắt "Confirm email".)*
4. **Project Settings → API** (hoặc *Data API*): sao chép **Project URL** và khoá **anon public**.
5. Mở NutriLift → **Cài đặt → Đồng bộ** → dán URL và khoá → **Lưu & kiểm tra**.
6. Nhập email + mật khẩu → **Tạo tài khoản** (mở email xác nhận nếu được yêu cầu) → **Đăng nhập**.
7. Trên thiết bị thứ hai: mở app → ở màn hình chào mừng chọn **"Đã dùng NutriLift trên thiết bị khác? Đăng nhập"** → dán cùng URL/khoá → đăng nhập
   cùng tài khoản. Dữ liệu sẽ tự tải về.

> 💡 Muốn khỏi dán URL/khoá trên từng thiết bị: trong repo GitHub vào **Settings → Secrets and variables → Actions → Variables**,
> tạo `SUPABASE_URL` và `SUPABASE_ANON_KEY`, rồi chạy lại workflow. Khoá *anon* là khoá công khai, an toàn vì bảng đã bật Row Level Security
> (mỗi tài khoản chỉ đọc/ghi được dữ liệu của mình).

**Lưu ý gói miễn phí của Supabase**: project bị *tạm dừng* nếu không có hoạt động 7 ngày liền. Dùng app hằng ngày thì không sao;
nếu bị dừng, vào dashboard bấm **Restore**. Trong lúc đó app vẫn chạy bình thường và tự đồng bộ lại sau khi khôi phục.

---

## Bước 3 — Cài app lên điện thoại và máy tính

- **iPhone/iPad (Safari)**: mở địa chỉ app → nút **Chia sẻ** → **Thêm vào MH chính**.
- **Android (Chrome)**: mở địa chỉ app → menu ⋮ → **Cài đặt ứng dụng** / **Thêm vào màn hình chính**.
- **Máy tính (Chrome/Edge)**: biểu tượng **Cài đặt** ở thanh địa chỉ (hoặc menu → *Cài đặt NutriLift*).

App mở toàn màn hình như ứng dụng thật, chạy được khi mất mạng; thay đổi sẽ đồng bộ khi có mạng trở lại.
Quét mã vạch cần cho phép camera (chỉ hoạt động qua HTTPS — GitHub Pages đã có sẵn).

---

## AI chụp món ăn (Gemini)

Chụp ảnh đĩa ăn → Gemini nhận diện từng món, ước tính khối lượng và calo → bạn xem lại, sửa gam → lưu.
Món nào khớp cơ sở dữ liệu món Việt sẽ dùng số liệu của CSDL (ổn định hơn), món lạ dùng số liệu AI.

> ⚠️ Gói **Gemini Plus / Google AI Pro** (app Gemini) **không** dùng được cho việc này. Cần **Gemini API key** —
> tạo **miễn phí** bằng chính tài khoản Google đó, không cần thẻ.

**Lấy khoá:** mở [aistudio.google.com/apikey](https://aistudio.google.com/apikey) → **Create API key** → sao chép (dạng `AIza...`).

**Cách 1 — đơn giản (khoá lưu trên từng thiết bị):**
App → **Cài đặt → Dữ liệu & khác → AI nhận diện món ăn** → chọn *Khoá trên thiết bị này* → dán khoá → **Kiểm tra**.
Làm lại trên điện thoại và máy tính (khoá không đồng bộ, không lên GitHub).

**Cách 2 — an toàn hơn (khoá nằm trên Supabase, mọi thiết bị dùng chung):**
1. Supabase Dashboard → **Edge Functions** → **Deploy a new function** → **Via Editor**.
2. Đặt tên **`food-vision`**, xoá code mẫu, dán toàn bộ nội dung file
   [`supabase/functions/food-vision/index.ts`](supabase/functions/food-vision/index.ts) → **Deploy function**.
3. **Edge Functions → Secrets** (hoặc *Project Settings → Edge Functions*) → **Add new secret**:
   Name `GEMINI_API_KEY`, Value = khoá `AIza...` → **Save**.
4. Trong app: **Cài đặt → AI nhận diện món ăn** → chọn *Qua Supabase* → **Kiểm tra**. (Cần đã đăng nhập đồng bộ.)

**Dùng:** *Tổng quan → nút 📷 cạnh "Thêm món ăn"*, hoặc *Dinh dưỡng → Thêm → Chụp món (AI)*.
Mẹo chụp: từ trên xuống, đủ sáng, thấy cả bát/đĩa (để AI ước lượng kích thước); có thể ghi thêm mô tả
("cơm nửa chén, ăn hết") hoặc **chỉ mô tả bằng chữ** không cần ảnh.

Độ chính xác: nhận diện món tốt; khối lượng có thể lệch ±20–30% — khi cutting chặt hãy cân các món chính.
Gói miễn phí của Gemini API có giới hạn số lượt mỗi phút/ngày (đủ cho cá nhân); nếu báo "hết hạn mức", đợi vài phút.
Ảnh được gửi tới Google để phân tích và không được lưu trong app.

---

## Dùng hằng ngày khi đang CUTTING

1. **Sáng**: cân sau khi đi vệ sinh, trước khi ăn → nhập ở Tổng quan. (App dùng *đường xu hướng*, dao động nước 1–2 kg không ảnh hưởng.)
2. **Mỗi bữa**: Dinh dưỡng → Thêm → gõ không dấu (`pho bo`, `com tam`, `uc ga`…), quét mã vạch đồ đóng gói, hoặc dùng *Gần đây*/*Yêu thích*.
   Mẹo: tạo **Công thức** cho món nấu sẵn (meal-prep) để ghi 1 chạm.
3. **Ngày tập**: Tập luyện → **Bắt đầu** buổi tiếp theo → tập, bấm ✓ từng set (đồng hồ nghỉ tự chạy) → **Kết thúc**.
   App tự tăng tạ/rep cho lần sau theo quy tắc của chương trình.
4. **Mỗi tuần**: khi thẻ **Kiểm tra hằng tuần** xuất hiện → **Áp dụng** để cập nhật TDEE theo dữ liệu thật
   (cần ≥10 ngày ghi chép + ≥4 lần cân trong 3 tuần).
5. Theo dõi **Tiến độ → Sức mạnh**: 1RM ước tính giữ trong khoảng ±2–5% nghĩa là bạn đang giữ được cơ.

Gợi ý cho cutting: tốc độ 0,5–0,75%/tuần, protein 2,0–2,4 g/kg, chương trình **"Cutting — Giữ cơ & sức mạnh"**.

## Chuyển sang BULKING

1. **Tiến độ → Giai đoạn**: chọn **Duy trì** 2–4 tuần sau khi cut xong (ổn định cân nặng), rồi chọn **Tăng cơ (Bulking)**,
   tốc độ +0,25%/tuần (lean bulk). Bật "Cập nhật protein & chất béo theo giai đoạn".
2. **Tập luyện → Chương trình**: chọn **"Bulking — Tăng cơ 5 buổi"** hoặc **Upper/Lower**, **PPL**. Ở bước cuối chỉnh mức tạ khởi điểm
   (app gợi ý từ lịch sử). Lịch sử, kỷ lục, biểu đồ vẫn giữ nguyên.
3. Tiếp tục check-in hằng tuần — nếu tăng nhanh hơn mục tiêu, app sẽ đề xuất giảm calo và ngược lại.

---

## Chuyển dữ liệu từ app cũ

**Cài đặt → Dữ liệu & khác → Chuyển dữ liệu từ app cũ**:
- **Liftosaur**: trong Liftosaur vào Settings → Export → *Export history to CSV* → chọn file CSV đó.
- **OpenNutriTracker**: Cài đặt → Xuất/Nhập dữ liệu → Xuất (JSON) → chọn file `.zip` vừa xuất.
- **Chương trình Liftosaur**: Tập luyện → Chương trình → **Dán từ Liftosaur** (sao chép văn bản chương trình trong trình soạn của Liftosaur).

---

## Câu hỏi thường gặp

**Dữ liệu lưu ở đâu?** Trên chính thiết bị (IndexedDB). Nếu bật đồng bộ thì có thêm bản trên project Supabase *của bạn*. Không có máy chủ nào khác.

**Mất mạng thì sao?** Dùng bình thường (trừ tìm món trực tuyến). Thay đổi được xếp hàng và tự gửi khi có mạng.

**Sửa cùng lúc trên 2 thiết bị?** Mỗi bản ghi giữ phiên bản sửa sau cùng. Buổi tập đang diễn ra cũng được đồng bộ — có thể bắt đầu trên
điện thoại và xem lại trên máy tính.

**Sao lưu?** Cài đặt → Dữ liệu → **Xuất bản sao lưu** (file JSON). Nên làm định kỳ dù đã bật đồng bộ.

**Giá trị món Việt có chính xác không?** Nguyên liệu cơ bản lấy theo Bảng thành phần thực phẩm Việt Nam/USDA; món chế biến (phở, cơm tấm…)
là ước tính trung bình — mỗi quán mỗi khác. Với món ăn thường xuyên, hãy tự tạo món/công thức theo khẩu phần của bạn.

**Cú pháp chương trình?** Xem tab **Cú pháp** trong trình soạn chương trình. Tóm tắt:

```
## Ngày 1
Squat / 3x5 / 60kg / 180s / progress: lp(2.5kg)
Bench Press / 3x8 / 40kg / 120s / progress: dp(2.5kg, 8, 12)
Pull Up / 3x5+ / 0kg / progress: sum(25, 2.5kg)
Lateral Raise / 3x15 / 6kg / 60s / warmup: none
```
