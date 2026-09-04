import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const page = (p: string) => resolve(ROOT, "src", p, "index.html");

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
        globPatterns: ["**/*.{js,css,html,png,svg,webmanifest}"],
        // Content pack OTA KHÔNG precache: nó có vòng đời riêng (xem docs/OTA),
        // và bản đóng kèm trong bundle đã bảo chứng offline rồi.
        globIgnores: ["content/**"],
        navigateFallback: null,
        cleanupOutdatedCaches: true,
        runtimeCaching: [
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
      input: {
        home: resolve(ROOT, "src/index.html"),
        farm: page("farm"),
        features: page("tinh-nang"),
        guide: page("huong-dan"),
        download: page("tai-ve"),
        privacy: page("privacy"),
        how: page("cach-hoat-dong"),
        library: page("thu-vien"),
        libCrops: page("thu-vien/cay-trong"),
        libAnimals: page("thu-vien/vat-nuoi"),
        libActions: page("thu-vien/hanh-dong"),
      },
    },
  },
});
