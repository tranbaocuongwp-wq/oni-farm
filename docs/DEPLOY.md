# Triển khai OniFarm

**Tên miền chính: <https://oni-farm.pages.dev>**
Cloudflare Pages · account `992bee08…c34f` · project `oni-farm` · production branch `main`
· chưa gắn custom domain.

- Build: `npm run build` (chạy `content:build` rồi `vite build`)
- Thư mục xuất bản: `dist/` ở gốc repo (xem `vite.config.ts` → `build.outDir`)
- Node: `22` (ghi trong `.node-version`, Cloudflare Pages đọc file này)

## Cách đang dùng: Cloudflare Pages Git integration

Project `oni-farm` nối thẳng với repo GitHub `tranbaocuongwp-wq/oni-farm`.
**Push lên `main` là xong** — Cloudflare tự clone, `npm install`, chạy `npm run build`,
rồi publish `dist/` vào Production, `oni-farm.pages.dev` cập nhật theo.
Mất khoảng 6–8 phút mỗi lần (phần lớn là khởi tạo máy ảo + cài phụ thuộc).

Push lên nhánh khác sinh **preview deployment** riêng, không đụng production.

Không cần cài gì trên máy cá nhân, không cần GitHub Actions, không cần wrangler.
Sửa ở Claude Code trên cloud, GitHub web, hay máy bất kỳ — push là lên.

Theo dõi tiến độ: dashboard → **Workers & Pages → oni-farm → Deployments**, hoặc:

```sh
curl -s -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects/oni-farm/deployments?per_page=3"
```

### Cấu hình build của project

| Mục | Giá trị |
|---|---|
| Production branch | `main` |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | (gốc repo) |
| Preview deployments | mọi nhánh |

Project này được tạo bằng Pages API (`POST /accounts/{id}/pages/projects` kèm
`source.type = "github"`). Lưu ý: Cloudflare **không cho thêm Git integration vào
project Direct Upload đã tồn tại**
(<https://developers.cloudflare.com/pages/configuration/git-integration/>) — bản
`oni-farm` cũ là Direct Upload nên đã phải xoá rồi tạo lại cùng tên để giữ tên miền.
Vì vậy **đừng xoá project này**; muốn đổi cấu hình thì PATCH chứ đừng tạo lại.

## Đường lui

**Deploy tay từ máy:**

```sh
npm run deploy          # build + đẩy cả site
npm run deploy:content  # chỉ đẩy lại content pack OTA
```

**GitHub Actions:** `.github/workflows/deploy.yml` làm đúng việc đó trên máy chủ GitHub,
nhưng để `workflow_dispatch` (chạy tay ở tab Actions → Run workflow) để không deploy
trùng với Git integration. Cần 2 secret đã đặt sẵn trong repo:
`CLOUDFLARE_API_TOKEN` (quyền **Account · Cloudflare Pages · Edit**) và
`CLOUDFLARE_ACCOUNT_ID`.

## Sự cố đã gặp

- **Job Actions chết sau ~3 giây, "your account is locked due to a billing issue"** —
  khoá ở cấp tài khoản GitHub, không liên quan repo hay secret. Gỡ tại
  <https://github.com/settings/billing>. Đây chính là lý do chuyển sang Git integration:
  Cloudflare build trên hạ tầng của Cloudflare nên không dính khoá của GitHub.
