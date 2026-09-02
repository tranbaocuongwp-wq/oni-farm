import { defineConfig } from "vite";
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
      },
    },
  },
});
