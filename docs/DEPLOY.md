# Triển khai OniFarm

Trang chạy trên **Cloudflare Pages**, project `oni-farm` → https://oni-farm.pages.dev

- Build: `npm run build` (chạy `content:build` rồi `vite build`)
- Thư mục xuất bản: `dist/` (ở gốc repo, xem `vite.config.ts` → `build.outDir`)
- Node: `22` (ghi trong `.node-version`, Cloudflare Pages đọc file này)

## Tự động deploy khi push (Pages ↔ GitHub)

Cloudflare **không cho gắn repo vào một Pages project kiểu Direct Upload đã tồn tại**
(<https://developers.cloudflare.com/pages/configuration/git-integration/>).
Project `oni-farm` ban đầu là Direct Upload, nên muốn có Git integration phải
**xoá rồi tạo lại cùng tên** để giữ tên miền `oni-farm.pages.dev`.

Các bước trên dashboard (chỉ làm một lần):

1. <https://dash.cloudflare.com> → **Workers & Pages** → `oni-farm` → **Settings**
   → cuối trang **Delete project**. (Mất lịch sử deploy cũ; tên miền
   `oni-farm.pages.dev` được giải phóng để dùng lại ngay.)
2. **Workers & Pages** → **Create application** → tab **Pages** → **Connect to Git**.
3. **Add account** → cho phép app *Cloudflare Workers and Pages* truy cập repo
   `tranbaocuongwp-wq/oni-farm` → chọn repo đó.
4. Điền cấu hình build:
   - Project name: `oni-farm`
   - Production branch: `main`
   - Framework preset: `None`
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Root directory: để trống (gốc repo)
5. **Save and Deploy**. Từ đó mỗi `git push` lên `main` sẽ tự build + deploy;
   push lên nhánh khác tạo preview deployment riêng.

Sau khi bật, không cần chạy `npm run deploy` bằng tay nữa.

## Deploy thủ công (dự phòng)

```sh
npm run build && npx wrangler pages deploy dist --project-name oni-farm --branch main
```

hoặc `npm run deploy`. Chỉ đẩy lại content pack OTA: `npm run deploy:content`.

## Ghi chú GitHub Actions

Đã từng thêm workflow Actions (`npm ci && npm run build && wrangler pages deploy`)
ở commit `e301564` nhưng gỡ bỏ vì tài khoản GitHub đang bị khoá do vấn đề thanh
toán nên job không khởi chạy được. Secret `CLOUDFLARE_ACCOUNT_ID` vẫn còn trong
repo settings nếu sau này muốn khôi phục: `git show e301564 -- .github`.
