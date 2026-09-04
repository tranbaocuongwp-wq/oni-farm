/* ============================================================================
   Sinh icon PNG bằng code — cùng triết lý với mỹ thuật trong game: không có
   file ảnh nào nằm sẵn trong repo, mọi thứ dựng lại được từ mã nguồn.

   Chạy:  node scripts/make-icons.mjs

   Xuất ra:
     public/icon-192.png, public/icon-512.png   (PWA / manifest)
     public/icon-source.png  (1024px — nguồn dự phòng, dùng khi cần cỡ khác)

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

/* ---- vẽ icon ở lưới 16×16 rồi phóng to bằng số nguyên ---- */
// . trong suốt · các chữ cái tra trong PAL
const ART = [
  "................",
  ".....ooooo......",
  "....oGGGGGo.....",
  "...oGgGGGgGo....",
  "..obbbbbbbbbo...",
  "..bbbbbbbbbbb...",
  "..bwwwwwwwwwb...",
  "..bwSSwDDwSSb...",
  "..bwwwwwDDwwb...",
  "..obbbbbbbbbo...",
  ".odddddddddddo..",
  ".dLLddLLddLLdd..",
  ".dddddddddddd...",
  ".ddLLddLLddLLd..",
  ".odddddddddddo..",
  "................",
];

const PAL = {
  o: [28, 20, 16, 255], // viền
  g: [61, 138, 63, 255], // lá cây tối
  G: [108, 201, 79, 255], // lá cây sáng
  b: [60, 70, 88, 255], // mái nhà
  w: [241, 237, 226, 255], // tường
  S: [94, 129, 172, 255], // cửa sổ
  D: [40, 48, 63, 255], // cửa
  d: [122, 79, 47, 255], // luống đất
  L: [108, 201, 79, 255], // mầm trên luống
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

mkdirSync(OUT, { recursive: true });
for (const [name, size] of [
  ["icon-192.png", 192],
  ["icon-512.png", 512],
  ["icon-source.png", 1024],
]) {
  writeFileSync(join(OUT, name), render(size));
  console.log(`✓ public/${name} (${size}×${size})`);
}
