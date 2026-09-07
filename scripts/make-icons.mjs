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

/* ---- vẽ icon ở lưới 16×16 rồi phóng to bằng số nguyên ----

   CÂY, không phải ngôi nhà. Ngôi nhà cũ đọc ra là "bất động sản" nhiều hơn là
   "nông trại", và ở cỡ 16px trên tab trình duyệt thì mái nhà, tường, cửa sổ và
   luống đất dồn lại thành một vệt xám không nhận ra hình gì. Một cái cây thì
   chỉ có hai khối — tán và thân — nên nó vẫn là cái cây ở mọi cỡ.

   Ba điều kiện của một icon dùng được, và hình này thoả cả ba:

   · MASKABLE. Android cắt icon theo hình tuỳ máy (tròn, vuông bo, giọt nước),
     chỉ đảm bảo giữ được vòng tròn giữa. Nên nền phủ KÍN, và cả cái cây nằm
     gọn trong 12/16 ô ở giữa — cắt kiểu nào cũng không xén mất ngọn hay gốc.
   · ĐỌC ĐƯỢC Ở 16px. Tán sáng trên nền cỏ sẫm, viền tối bao quanh: ba mức đậm
     nhạt rõ ràng, không dựa vào chi tiết nhỏ hơn một pixel lưới.
   · MANG MÀU THƯƠNG HIỆU. Hai quả vàng `#f5c542` — đúng màu vàng của HUD và
     của chữ ONI trên trang web — nên icon, trang tĩnh và game nói cùng một
     ngôn ngữ màu.
*/
// . = nền (cỏ) · các chữ cái tra trong PAL
const ART = [
  "................",
  "................",
  ".....oooooo.....",
  "....oGGGGGgo....",
  "...oGGGGGGggo...",
  "..oGGGGGGggggo..",
  "..oGGGGGgAgggo..",
  "..oGGgGggggggo..",
  "...oGAggggggo...",
  "....oGgggggo....",
  ".....ooTToo.....",
  ".......Tt.......",
  ".......Tt.......",
  ".......Tt.......",
  "....ssssssss....",
  "................",
];

const PAL = {
  o: [28, 20, 16, 255], // viền
  G: [140, 224, 95, 255], // tán sáng
  g: [95, 179, 72, 255], // tán tối
  A: [245, 197, 66, 255], // quả — vàng thương hiệu
  T: [122, 82, 48, 255], // thân
  t: [74, 48, 24, 255], // thân, mặt tối
  s: [63, 112, 48, 255], // gò cỏ dưới gốc
};

const BG = [79, 138, 60, 255]; // nền cỏ — icon maskable cần phủ kín

function render(size) {
  const rgba = new Uint8Array(size * size * 4);
  const scale = size / 16;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const sx = Math.floor(x / scale);
      const sy = Math.floor(y / scale);
      const ch = ART[sy]?.[sx] ?? ".";
      const c = ch === "." ? BG : (PAL[ch] ?? BG);
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

   Gộp các pixel cùng màu LIỀN NHAU trên một hàng thành một `<rect>`: 256 ô
   xuống còn khoảng 60 hình, file nhỏ đi ba lần mà vẽ ra y hệt. */
function renderSvg() {
  const hex = (c) => "#" + c.slice(0, 3).map((v) => v.toString(16).padStart(2, "0")).join("");
  const o = [`<rect width="16" height="16" fill="${hex(BG)}"/>`];
  for (let y = 0; y < 16; y++) {
    let x = 0;
    while (x < 16) {
      const ch = ART[y]?.[x] ?? ".";
      if (ch === ".") {
        x++;
        continue;
      }
      let n = 1;
      while (x + n < 16 && ART[y]?.[x + n] === ch) n++;
      o.push(`<rect x="${x}" y="${y}" width="${n}" height="1" fill="${hex(PAL[ch] ?? BG)}"/>`);
      x += n;
    }
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">` +
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
