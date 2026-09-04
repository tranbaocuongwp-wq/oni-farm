# Triển khai OniFarm

**Tên miền chính: <https://oni-farm.pages.dev>**
Cloudflare Pages · account `992bee08…c34f` · project `oni-farm` · production branch `main`
· không có custom domain (danh sách `domains` chỉ chứa chính subdomain pages.dev).

- Build: `npm run build` (chạy `content:build` rồi `vite build`)
- Thư mục xuất bản: `dist/` ở gốc repo (xem `vite.config.ts` → `build.outDir`)
- Node: `22` (ghi trong `.node-version`)

## Cách đang dùng: GitHub Actions (không cần máy cá nhân)

`.github/workflows/deploy.yml` chạy trên máy chủ GitHub mỗi khi push lên `main`:

```
npm ci → npm run test:all → npm run build → wrangler pages deploy dist \
    --project-name=oni-farm --branch=main --commit-dirty=true
```

`--branch=main` trùng production branch của project ⇒ Cloudflare xếp bản deploy vào
**Production**, nên `oni-farm.pages.dev` được cập nhật (không phải preview URL).

Hai secret trong *Settings → Secrets and variables → Actions*:

- `CLOUDFLARE_API_TOKEN` — cần quyền **Cloudflare Pages: Edit** trên account chứa project.
- `CLOUDFLARE_ACCOUNT_ID` — `992bee08cd30f08fddd80b5a0cb4c34f`.

Tạo lại token khi cần: dash.cloudflare.com → **My Profile → API Tokens → Create Token**
→ *Create Custom Token* → Permissions: **Account · Cloudflare Pages · Edit** → giới hạn
Account Resources vào đúng account trên. Rồi `gh secret set CLOUDFLARE_API_TOKEN` (dán
qua stdin, đừng để lọt vào log).

## Vì sao không dùng Git integration của Pages

Cloudflare **không cho gắn repo vào Pages project kiểu Direct Upload đã tồn tại**
(<https://developers.cloudflare.com/pages/configuration/git-integration/>). Project
`oni-farm` là Direct Upload, muốn dùng Git integration phải xoá rồi tạo lại cùng tên —
mất lịch sử deploy và có gián đoạn. GitHub Actions đạt cùng kết quả mà không phải xoá gì.

## Deploy tay (đường lui)

```sh
npm run deploy          # build + đẩy cả site
npm run deploy:content  # chỉ đẩy lại content pack OTA
```

## Sự cố đã gặp

- **Job Actions chết sau ~3 giây, "your account is locked due to a billing issue"** —
  khoá ở cấp tài khoản GitHub, không liên quan repo hay secret. Gỡ tại
  <https://github.com/settings/billing>. Trong lúc chờ, deploy tay bằng lệnh trên.
