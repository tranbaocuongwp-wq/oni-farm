import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { readdirSync } from "node:fs";

const ROOT = dirname(fileURLToPath(import.meta.url));
/**
 * Mọi `index.html` nằm bất kỳ đâu dưới `src/` là một trang. Khoá của rollup lấy
 * từ đường dẫn nên ổn định qua các lần build.
 *
 * (Cố ý KHÔNG viết mẫu glob hai sao ở đây: dấu sao-gạch chéo của nó đóng luôn
 *  khối chú thích này, và esbuild đổ ngay ở dòng dưới.)
 *
 * `build-site.mjs` chạy TRƯỚC vite (xem `npm run build`), nên các trang sinh
 * tự động đã nằm trên đĩa lúc hàm này quét.
 */
function trangTinh(): Record<string, string> {
  const src = resolve(ROOT, "src");
  const out: Record<string, string> = {};
  const quet = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = resolve(d, e.name);
      if (e.isDirectory()) quet(p);
      else if (e.name === "index.html") {
        const rel = relative(src, p).replace(/(^|[\\/])index\.html$/, "");
        out[rel === "" ? "home" : rel.replace(/[\\/]/g, "-")] = p;
      }
    }
  };
  quet(src);
  return out;
}

// Site NHIỀU TRANG: trang chủ + các trang tĩnh ở gốc, game ở /farm/.
// `base: "/"` (đường dẫn tuyệt đối) để các trang con không bị lệch một cấp.
// publicDir trỏ ra <root>/public — nơi scripts/build-content.mjs xuất bản
// content pack OTA (dist/content/...), tách khỏi content đóng kèm trong bundle.
export default defineConfig({
  root: "src",
  base: "/",
  publicDir: resolve(ROOT, "public"),
  clearScreen: false,
  server: {
    // Cho phép PORT ghi đè để chạy song song khi 1420 đã bị chiếm.
    port: Number(process.env.PORT) || 1420,
    strictPort: !process.env.PORT,
    host: "localhost",
  },
  plugins: [
    /* PWA. Bản viết tay trước đây cache DẦN theo lúc dùng, nên cài game vào màn
       hình chính rồi mất mạng NGAY là mở ra trắng: HTML có trong cache nhưng
       bundle JS thì chưa. Workbox precache đúng danh sách file của lần build,
       kể cả tên có hash — thứ không thể liệt kê bằng tay.

       `registerType: "prompt"`: KHÔNG tự động chiếm quyền. Người chơi đang giữa
       một ngày trong game mà trang tự tải lại thì mất phần chưa lưu. Thay vào
       đó UI hiện một dòng "có bản mới", bấm mới tải lại. */
    VitePWA({
      registerType: "prompt",
      // manifest đã có sẵn trong public/, đừng sinh cái thứ hai đè lên
      manifest: false,
      injectRegister: null,
      workbox: {
        /* DANH SÁCH CHO PHÉP, không phải danh sách cấm.

           Chỉ GAME mới cần chạy offline; trang wiki đi đường `runtimeCaching`
           NetworkFirst bên dưới — có mạng thì luôn là bản mới nhất, mất mạng
           thì vẫn còn trang đã ghé. Lý do gốc: precache phục vụ bản đã lưu
           TRƯỚC, mà service worker có phạm vi cả `/`, nên ai từng mở game rồi
           quay lại trang chủ sẽ đọc bản CŨ vô thời hạn, không có nút nào thoát.

           VÌ SAO LÀ CHO PHÉP CHỨ KHÔNG PHẢI CẤM: bản trước viết đúng ý này
           nhưng viết bằng `globIgnores` liệt kê tên thư mục wiki — `tinh-nang`,
           `thu-vien`, `huong-dan`, `cach-hoat-dong`, `tai-ve`, `luat-choi`.
           Wiki sau đó dựng lại với bộ tên khác (`cay-trong`, `dia-hinh`,
           `vat-nuoi`, `vat-pham`…), và danh sách cấm lặng lẽ thôi khớp: sáu
           trên bảy mục trỏ vào thư mục KHÔNG CÒN TỒN TẠI. Đo lúc phát hiện:
           **192 trang wiki, 1.415 KiB — 70% precache** — và vì `build-site.mjs`
           đóng dấu số phiên bản lõi vào từng trang, MỖI LẦN phát hành cả 192
           trang đều đổi. Người chơi phải tải lại 1,4 MB trang tra cứu họ không
           đọc, TRƯỚC khi bản game mới được nhận. Đó chính là chỗ "cập nhật lâu".

           Danh sách cho phép thì không mục ruỗng được: nó nêu tên thứ game
           THẬT SỰ cần, và thứ đó không đổi tên theo mùa. Thêm một mục wiki mới
           cũng không lọt vào đây được nữa. `scripts/check-precache.mjs` canh
           lại kết quả sau mỗi lần build. */
        globPatterns: [
          "farm/index.html",
          "assets/*.{js,css}",
          "*.{png,svg,webmanifest}",
        ],
        navigateFallback: null,
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            /* Trang giới thiệu: MẠNG TRƯỚC, cache chỉ là lưới đỡ khi mất mạng.
               Không đụng `/farm/` — game phải chạy được cả khi offline hẳn. */
            urlPattern: ({ request, url }) =>
              request.mode === "navigate" && !url.pathname.startsWith("/farm"),
            handler: "NetworkFirst",
            options: {
              cacheName: "oni-trang-tinh",
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            // pack OTA: luôn thử mạng trước, hỏng thì thôi — không bao giờ để
            // người chơi kẹt ở một pack cũ vì cache.
            urlPattern: ({ url }) => url.pathname.startsWith("/content/"),
            handler: "NetworkFirst",
            options: { cacheName: "oni-content", networkTimeoutSeconds: 4 },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],

  build: {
    outDir: resolve(ROOT, "dist"),
    emptyOutDir: true,
    target: "es2022",
    sourcemap: true,
    rollupOptions: {
      /* TỰ QUÉT, không liệt kê tay.
         Danh sách gõ tay ở đây là bản sao thứ hai của danh sách trang trong
         `scripts/build-site.mjs` — thêm một trang mà quên một trong hai chỗ
         thì trang đó hoặc không được build, hoặc build ra mà không ai tới
         được. Quét cây thư mục `src/` tìm mọi `index.html` thì chỉ còn một
         nguồn sự thật, và nó là chính hệ thống tệp. */
      input: trangTinh(),
    },
  },
});
