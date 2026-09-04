/* ============================================================================
   SPRITES — đổ hình của GAME vào các trang tài liệu.

   Vì sao không xuất PNG rồi nhúng <img>: hình trong OniFarm không phải file, nó
   là CODE — `buildAtlas()` vẽ từng con vật, từng cây từ các con số màu trong
   content. Xuất ra ảnh nghĩa là có hai bản sự thật, và bản trên trang tài liệu
   sẽ lặng lẽ cũ đi mỗi lần chỉnh màu con bò. Ở đây trang tài liệu gọi ĐÚNG hàm
   mà game gọi, nên hình trên trang luôn là hình trong game, không có độ trễ.

   Cách dùng trong HTML — không cần biết gì về atlas:

       <canvas data-sprite="crop:carrot"></canvas>   cây chín
       <canvas data-sprite="crop:carrot:0"></canvas> cây ở giai đoạn 0
       <canvas data-sprite="animal:cow"></canvas>
       <canvas data-sprite="item:tool:hoe"></canvas>
       <canvas data-sprite="player"></canvas>

   Trang tĩnh không có JS thì vẫn đọc được đủ mọi thông tin: hình chỉ là phần
   minh hoạ, còn số liệu nằm trong HTML do `scripts/build-site.mjs` sinh ra.
============================================================================ */

import { buildAtlas, type Atlas } from "../art/atlas.ts";
import { bundledContent } from "../core/content/bundled.ts";

const content = bundledContent();
const atlas = buildAtlas(content);

/** Sprite cho một khoá `data-sprite`, hoặc null nếu không có gì để vẽ. */
function spriteFor(key: string): HTMLCanvasElement | null {
  if (key === "player") return atlas.player.down[0] ?? null;
  // "ui:power" → icon 12×12 của HUD. Dùng chính bộ icon trong game thay cho
  // emoji: emoji là font của hệ điều hành nên mỗi máy ra một hình khác.
  if (key.startsWith("ui:")) return atlas.ui(key.slice(3) as Parameters<Atlas["ui"]>[0]);
  if (key.startsWith("worker:")) return atlas.worker(Number(key.slice(7)) || 0, "down", 0);
  if (key.startsWith("animal:")) return atlas.animal(key.slice(7), "down", 0);
  if (key.startsWith("vehicle:")) return atlas.vehicle(key.slice(8), "right");
  if (key.startsWith("build:")) return atlas.buildings[key.slice(6)] ?? null;
  if (key.startsWith("prop:")) return atlas.props[key.slice(5)] ?? null;
  if (key.startsWith("crop:")) {
    // "crop:carrot" = chín; "crop:carrot:2" = đúng giai đoạn đó
    const rest = key.slice(5);
    const cut = rest.lastIndexOf(":");
    const id = cut < 0 ? rest : rest.slice(0, cut);
    const frames = atlas.crops[id];
    if (!frames?.length) return null;
    if (cut < 0) return frames[frames.length - 1] ?? null;
    const i = Number(rest.slice(cut + 1));
    return frames[Math.max(0, Math.min(frames.length - 1, i))] ?? null;
  }
  return atlas.icon(key);
}

/** Khung chữ nhật nhỏ nhất còn chứa hết phần có vẽ của một sprite. */
interface Trim {
  x: number;
  y: number;
  w: number;
  h: number;
}

/* Đo một lần rồi nhớ: cùng một sprite cây xuất hiện tới năm lần trên một thẻ
   (bốn giai đoạn + hình chính), và trang cây có 61 thẻ. */
const trimCache = new WeakMap<HTMLCanvasElement, Trim>();

/**
 * Cắt bỏ viền trong suốt.
 *
 * Sprite cây cao 24px nhưng cây xà lách chỉ chiếm 9px dưới đáy — phần trên để
 * chừa cho cây cao như ngô, và trên bản đồ thì đó là đúng. Nhưng trên thẻ tra
 * cứu, vẽ nguyên ô 24px nghĩa là một cây bé xíu nằm dưới đáy một khung rỗng.
 * Cắt về đúng phần có vẽ rồi mới phóng to thì mọi cây đều lấp đầy ô của nó, dù
 * cao hay thấp.
 */
function trim(src: HTMLCanvasElement): Trim {
  const got = trimCache.get(src);
  if (got) return got;
  const full: Trim = { x: 0, y: 0, w: src.width, h: src.height };
  const g = src.getContext("2d", { willReadFrequently: true });
  if (!g) return full;
  let d: Uint8ClampedArray;
  try {
    d = g.getImageData(0, 0, src.width, src.height).data;
  } catch {
    return full; // canvas "bẩn" (ảnh khác nguồn) — hiếm, nhưng đừng để ném lỗi
  }
  let x0 = src.width;
  let y0 = src.height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < src.height; y++)
    for (let x = 0; x < src.width; x++)
      if (d[(y * src.width + x) * 4 + 3]! > 8) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  const out: Trim = x1 < 0 ? full : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  trimCache.set(src, out);
  return out;
}

/**
 * Vẽ sprite vào một canvas, phóng to bằng SỐ NGUYÊN lần.
 *
 * Pixel art phóng theo số lẻ (1,7×) là cách chắc chắn nhất để một sprite sạch
 * biến thành một mớ nhoè. Nên hệ số luôn là SỐ NGUYÊN, và ô chứa trong CSS được
 * đặt rộng hơn đích một chút để hình có làm tròn lên cũng không tràn.
 */
function paint(el: HTMLCanvasElement, src: HTMLCanvasElement, target: number): void {
  // LÀM TRÒN chứ không cắt xuống: sprite cây cao 24px với đích 64px ra hệ số
  // 2,67 — cắt xuống thành 2 là hình chỉ chiếm nửa ô và cả lưới trông rỗng.
  // Làm tròn lên 3 thì vừa khít ô, mà vẫn là số nguyên nên vẫn sắc.
  const t = trim(src);
  const k = Math.max(1, Math.round(target / Math.max(t.w, t.h)));
  el.width = t.w * k;
  el.height = t.h * k;
  el.style.width = `${el.width}px`;
  el.style.height = `${el.height}px`;
  const g = el.getContext("2d");
  if (!g) return;
  g.imageSmoothingEnabled = false;
  g.drawImage(src, t.x, t.y, t.w, t.h, 0, 0, el.width, el.height);
}

/** Đổ hình vào mọi `<canvas data-sprite>` chưa được vẽ trong `root`. */
export function hydrateSprites(root: ParentNode = document): void {
  const list = root.querySelectorAll<HTMLCanvasElement>("canvas[data-sprite]:not([data-done])");
  for (const el of list) {
    const key = el.dataset.sprite ?? "";
    const src = spriteFor(key);
    el.dataset.done = "1";
    if (!src) {
      // Không có hình thì bỏ hẳn canvas đi. Một ô trống viền xám trông như lỗi
      // tải, mà thật ra chỉ là thứ đó cố ý không có hình.
      el.remove();
      continue;
    }
    paint(el, src, Number(el.dataset.size) || 48);
  }
}

/* Chạy ngay: các trang tài liệu chỉ cần nạp file này là xong, không phải gọi gì.
   Ảnh nặng hơn màn hình đầu thì để `requestIdleCallback` — 61 cây × phóng to là
   việc đáng làm sau khi chữ đã hiện. */
if (document.readyState === "loading")
  document.addEventListener("DOMContentLoaded", () => hydrateSprites());
else hydrateSprites();
