/* ============================================================================
   Sinh icon PNG bằng code — cùng triết lý với mỹ thuật trong game: không có
   file ảnh nào nằm sẵn trong repo, mọi thứ dựng lại được từ mã nguồn.

   Chạy:  node scripts/make-icons.mjs

   Xuất ra:
     public/favicon.svg       (tab trình duyệt — nét ở mọi cỡ)
     public/favicon-32.png    (dự phòng cho trình duyệt không đọc favicon SVG)
     public/icon-180.png      (apple-touch-icon)
     public/icon-192.png, public/icon-512.png   (PWA / manifest)
     public/icon-source.png   (1024px — nguồn dự phòng, dùng khi cần cỡ khác)

   Tự viết bộ mã hoá PNG vì chỉ cần đúng ba chunk; kéo thêm thư viện cho việc
   này là thừa. zlib có sẵn trong Node.
============================================================================ */

import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public");

/* ---- CRC32 (bảng dựng sẵn một lần) ---- */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** rgba: Uint8Array dài w*h*4 */
function encodePng(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  // 10,11,12 = compression/filter/interlace = 0

  // mỗi hàng phải có một byte filter ở đầu; dùng filter 0 (None) cho đơn giản
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(
      raw,
      y * (w * 4 + 1) + 1,
    );
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* ---- vẽ icon ở lưới 32×32 rồi phóng to bằng lấy mẫu gần nhất --------------

   CÂY, không phải ngôi nhà. Ngôi nhà cũ đọc ra là "bất động sản" nhiều hơn là
   "nông trại", và ở cỡ 16px trên tab trình duyệt thì mái nhà, tường, cửa sổ và
   luống đất dồn lại thành một vệt xám không nhận ra hình gì. Một cái cây thì
   chỉ có hai khối — tán và thân — nên nó vẫn là cái cây ở mọi cỡ.

   ĐỢT 26 vẽ lại ở lưới 32×32, và dựng bằng ĐÚNG CÁCH GAME DỰNG CÂY: tán là năm
   khối tròn chồng nhau, viền tính tự động từ pixel đặc. Trước đó là một lưới
   16×16 gõ tay — bốn lần ít chi tiết hơn game, nên trên màn hình chính điện
   thoại (192px) icon trông thô hơn hẳn thứ nó dẫn vào.

   Ba điều kiện của một icon dùng được, và hình này thoả cả ba:

   · MASKABLE. Android cắt icon theo hình tuỳ máy (tròn, vuông bo, giọt nước),
     chỉ đảm bảo giữ được vòng tròn giữa. Nên nền phủ KÍN, và cả cái cây nằm
     gọn trong 24/32 ô ở giữa — cắt kiểu nào cũng không xén mất ngọn hay gốc.
   · ĐỌC ĐƯỢC Ở 16px. Tán sáng trên nền cỏ sẫm, viền tối bao quanh: ba mức đậm
     nhạt rõ ràng, không dựa vào chi tiết nhỏ hơn một pixel lưới. Ở 16px thì hai
     pixel lưới mới thành một pixel màn hình — nên mọi khối đều dày ít nhất hai
     ô, không có nét một ô nào để mất.
   · MANG MÀU THƯƠNG HIỆU. Hai quả vàng `#f5c542` — đúng màu vàng của HUD và
     của chữ ONI trên trang web — nên icon, trang tĩnh và game nói cùng một
     ngôn ngữ màu.
*/

const N = 32; // cạnh lưới nguồn

const C = {
  nen: [79, 138, 60, 255], // nền cỏ — icon maskable cần phủ kín
  nenToi: [66, 118, 50, 255], // vệt cỏ cho nền đỡ phẳng
  vien: [26, 19, 14, 255],
  tanSang: [150, 232, 104, 255],
  tan: [104, 190, 78, 255],
  tanToi: [66, 141, 58, 255],
  qua: [245, 197, 66, 255],
  quaToi: [200, 148, 30, 255],
  than: [128, 87, 51, 255],
  thanSang: [160, 113, 68, 255],
  thanToi: [78, 51, 27, 255],
  go: [63, 112, 48, 255], // gò cỏ dưới gốc
  goToi: [50, 92, 38, 255],
};

/** Một lưới màu N×N, mỗi ô là một mảng RGBA hoặc null (chưa vẽ gì). */
function luoiMoi() {
  return Array.from({ length: N }, () => Array.from({ length: N }, () => null));
}

const dat = (g, x, y, c) => {
  const xi = Math.round(x);
  const yi = Math.round(y);
  if (xi < 0 || yi < 0 || xi >= N || yi >= N) return;
  g[yi][xi] = c;
};

/** Khối tròn — cùng cách `disc()` trong art/atlas.ts dựng tán cây. */
function dia(g, cx, cy, r, c) {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      if (dx * dx + dy * dy <= r * r + r * 0.3) dat(g, x, y, c);
    }
}

function hop(g, x0, y0, w, h, c) {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) dat(g, x, y, c);
}

/** Viền một pixel quanh mọi ô đã vẽ — cùng lối với `outline()` bên atlas. */
function vien(g, c) {
  const dac = g.map((h) => h.map((v) => v !== null));
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      if (dac[y][x]) continue;
      const ke =
        (x > 0 && dac[y][x - 1]) ||
        (x < N - 1 && dac[y][x + 1]) ||
        (y > 0 && dac[y - 1][x]) ||
        (y < N - 1 && dac[y + 1][x]);
      if (ke) g[y][x] = c;
    }
}

/** Cái cây — vẽ một lần, dùng cho cả PNG lẫn SVG. */
const CAY = (() => {
  const g = luoiMoi();

  // GÒ CỎ dưới gốc: một vòm dẹt, cho cái cây có chỗ đứng
  for (let x = 6; x <= 25; x++) {
    const h = Math.round(2.4 * Math.sin((Math.PI * (x - 6)) / 19));
    for (let d = 0; d <= h; d++) dat(g, x, 26 - d, C.go);
    dat(g, x, 26 - h, C.go);
    dat(g, x, 27, C.goToi);
  }

  // THÂN: có bờ rễ loe ra hai bên — cột thẳng đứng đọc ra là cái cọc
  hop(g, 14, 15, 4, 12, C.than);
  for (let y = 15; y < 27; y++) dat(g, 14, y, C.thanSang);
  for (let y = 15; y < 27; y++) dat(g, 17, y, C.thanToi);
  for (const [x, y] of [[13, 24], [13, 25], [13, 26], [18, 24], [18, 25], [18, 26], [12, 26], [19, 26]])
    dat(g, x, y, x < 16 ? C.than : C.thanToi);

  // TÁN: năm khối tròn chồng nhau, hai tông — đường bao gợn mới ra vòm lá
  for (const [cx, cy, r] of [
    [10, 13.5, 5.4],
    [22, 13.5, 5.4],
    [16, 14, 5.8],
    [11.5, 8.5, 5.2],
    [20.5, 8.5, 5.2],
    [16, 6.5, 6.2],
  ])
    dia(g, cx, cy, r, C.tan);
  /* Mặt tối chỉ ở SƯỜN PHẢI, không lan vào giữa tán: vệt tối giữa tán đọc ra
     là một cái bóng lạ chứ không ra khối lá. */
  for (const [cx, cy, r] of [
    [21.5, 14.5, 4.2],
    [19, 16, 3.2],
  ])
    dia(g, cx, cy, r, C.tanToi);
  // nắng chếch trên-trái
  for (const [cx, cy, r] of [
    [12.5, 6.5, 3.4],
    [16.5, 4.5, 2.8],
  ])
    dia(g, cx, cy, r, C.tanSang);

  // HAI QUẢ vàng — màu thương hiệu, đặt lệch nhau cho khỏi đối xứng
  for (const [cx, cy] of [[11, 11.5], [21, 9.5]]) {
    dia(g, cx, cy, 1.9, C.quaToi);
    dia(g, cx - 0.3, cy - 0.3, 1.4, C.qua);
  }

  vien(g, C.vien);
  return g;
})();

function render(size) {
  const rgba = new Uint8Array(size * size * 4);
  const scale = size / N;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const sx = Math.min(N - 1, Math.floor(x / scale));
      const sy = Math.min(N - 1, Math.floor(y / scale));
      /* Nền cỏ có vệt sẫm theo hàm băm toạ độ: nền phẳng lì ở 512px trông như
         một mảng màu, mà icon PWA thì hiện ở đúng cỡ đó trên màn hình chính. */
      const nen = (sx * 7 + sy * 13) % 11 < 2 ? C.nenToi : C.nen;
      const c = CAY[sy][sx] ?? nen;
      const i = (y * size + x) * 4;
      rgba[i] = c[0];
      rgba[i + 1] = c[1];
      rgba[i + 2] = c[2];
      rgba[i + 3] = c[3];
    }
  }
  return encodePng(size, size, rgba);
}

/* ---- favicon SVG, dựng từ CHÍNH lưới trên ----------------------------------

   Vì sao có: cả trang web lẫn trang game trước giờ chỉ khai `apple-touch-icon`,
   không khai `icon` nào — nên tab trình duyệt hiện icon mặc định của trình
   duyệt, và trang web trông như một trang chưa ai dựng xong.

   Vì sao SVG chứ không chỉ PNG: favicon SVG nét ở mọi cỡ và mọi mật độ màn
   hình, mà file lại nhỏ hơn một PNG 32px. Dựng từ đúng cái lưới ở trên nên nó
   không bao giờ trôi khỏi icon PWA — sửa một chỗ là cả bộ đổi theo.

   Gộp các pixel cùng màu LIỀN NHAU trên một hàng thành một `<rect>`: 1024 ô
   xuống còn khoảng 150 hình, file nhỏ đi nhiều lần mà vẽ ra y hệt. */
function renderSvg() {
  const hex = (c) => "#" + c.slice(0, 3).map((v) => v.toString(16).padStart(2, "0")).join("");
  const o = [`<rect width="${N}" height="${N}" fill="${hex(C.nen)}"/>`];
  for (let y = 0; y < N; y++) {
    let x = 0;
    while (x < N) {
      const c = CAY[y][x];
      if (!c) {
        x++;
        continue;
      }
      let n = 1;
      while (x + n < N && CAY[y][x + n] === c) n++;
      o.push(`<rect x="${x}" y="${y}" width="${n}" height="1" fill="${hex(c)}"/>`);
      x += n;
    }
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${N} ${N}" shape-rendering="crispEdges">` +
    o.join("") +
    `</svg>\n`
  );
}

mkdirSync(OUT, { recursive: true });
for (const [name, size] of [
  ["favicon-32.png", 32], // dự phòng cho trình duyệt không đọc favicon SVG
  ["icon-180.png", 180], // apple-touch-icon đúng cỡ Apple khuyến nghị
  ["icon-192.png", 192],
  ["icon-512.png", 512],
  ["icon-source.png", 1024],
]) {
  writeFileSync(join(OUT, name), render(size));
  console.log(`✓ public/${name} (${size}×${size})`);
}
writeFileSync(join(OUT, "favicon.svg"), renderSvg());
console.log("✓ public/favicon.svg");
