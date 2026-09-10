/* ============================================================================
   CỔNG SAU BUILD — canh những gì service worker sẽ TẢI VỀ MỖI LẦN PHÁT HÀNH.

   Vì sao cần một cổng riêng cho việc này: precache là thứ quyết định người
   chơi phải chờ bao lâu để nhận bản mới, mà nó KHÔNG nằm trong mã nguồn — nó
   là kết quả của một mẫu glob khớp với cây thư mục lúc build. Cả hai vế đều
   trôi được, và không vế nào làm typecheck hay kịch bản sim đỏ.

   Đã trôi thật một lần: `globIgnores` liệt kê tên thư mục wiki đời cũ, wiki
   dựng lại với bộ tên khác, danh sách cấm thôi khớp trong im lặng. Kết quả là
   192 trang tra cứu (1.415 KiB, 70% precache) chui vào bản offline của game,
   và vì mỗi trang đều đóng dấu số phiên bản lõi nên MỖI LẦN phát hành cả 192
   trang đều đổi — người chơi tải lại 1,4 MB thứ họ không đọc trước khi bản
   game mới được nhận.

   Cổng này đọc `dist/sw.js` — tức ĐỌC KẾT QUẢ THẬT, không đọc ý định.
============================================================================ */

import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const DIST = resolve(dirname(fileURLToPath(import.meta.url)), "..", "dist");

/** Trần dung lượng precache. Không phải con số thẩm mỹ: đây là thứ tải về
 *  trước khi bản mới được nhận, nên nó LÀ thời gian chờ của người chơi. */
const TRAN_KIB = 900;

const sw = readFileSync(resolve(DIST, "sw.js"), "utf8");
const duong = [...sw.matchAll(/\{url:"([^"]+)"/g)].map((m) => m[1]);
if (!duong.length) {
  console.error("✗ precache: không đọc được mục nào trong dist/sw.js — mẫu tìm đã lệch?");
  process.exit(1);
}

const co = (u) => {
  try {
    return statSync(resolve(DIST, u)).size;
  } catch {
    return 0;
  }
};
const tong = duong.reduce((a, u) => a + co(u), 0);

const loi = [];

/* --- (a) Chỉ GAME được nằm trong bản offline ---
   Mọi `index.html` khác `farm/index.html` đều là trang wiki. Luật viết theo
   HÌNH DẠNG đường dẫn chứ không theo tên thư mục, nên thêm một mục wiki mới
   không bao giờ làm nó mục ruỗng như danh sách cấm đời trước. */
const wiki = duong.filter((u) => u.endsWith("index.html") && u !== "farm/index.html");
if (wiki.length)
  loi.push(
    `${wiki.length} trang wiki lọt vào precache (${(wiki.reduce((a, u) => a + co(u), 0) / 1024).toFixed(0)} KiB). ` +
      `Chỉ /farm/ mới cần chạy offline; trang wiki đi đường NetworkFirst.\n     ` +
      wiki.slice(0, 5).join("\n     ") +
      (wiki.length > 5 ? `\n     …và ${wiki.length - 5} trang nữa` : ""),
  );

/* --- (b) Content pack có vòng đời riêng, không được precache --- */
const pack = duong.filter((u) => u.startsWith("content/"));
if (pack.length) loi.push(`content pack lọt vào precache: ${pack.join(", ")} — nó phải đi đường OTA`);

/* --- (c) Trần dung lượng --- */
if (tong / 1024 > TRAN_KIB)
  loi.push(`precache ${(tong / 1024).toFixed(0)} KiB, vượt trần ${TRAN_KIB} KiB — đây là thời gian người chơi phải chờ để nhận bản mới`);

/* --- (d) …và game phải THẬT SỰ có trong đó --- */
if (!duong.includes("farm/index.html")) loi.push("thiếu farm/index.html — game sẽ không chạy offline");
if (!duong.some((u) => /^assets\/farm-.*\.js$/.test(u))) loi.push("thiếu bundle chính của game trong precache");

if (loi.length) {
  console.error("\n✗ precache KHÔNG đạt:\n");
  for (const e of loi) console.error("   · " + e);
  console.error("");
  process.exit(1);
}

console.log(`  precache: ${duong.length} mục · ${(tong / 1024).toFixed(0)} KiB (trần ${TRAN_KIB})`);
