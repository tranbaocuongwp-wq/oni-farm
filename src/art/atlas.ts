/* ============================================================================
   ATLAS — TOÀN BỘ mỹ thuật của game, sinh bằng code lúc khởi động.

   Không có file PNG nào. Lý do:
     · thật sự offline, không tải asset, không lo bản quyền
     · TẤT ĐỊNH — cùng seed luôn ra cùng một hình, cỏ không nhảy múa mỗi lần chạy
     · cây trồng vẽ THEO THAM SỐ lấy từ content → thêm cây mới chỉ là thêm một
       object JSON, không phải ngồi vẽ tay 4-5 giai đoạn

   ĐÂY LÀ ĐIỂM THAY THẾ DUY NHẤT nếu sau này muốn dùng tileset PNG thật:
   giữ nguyên hình dạng `Atlas` trả về, đổi ruột các hàm make*() thành cắt ảnh
   từ spritesheet. Không file nào khác phải sửa.

   Mọi thứ vẽ ở độ phân giải 1 pixel = 1 pixel màn hình gốc, rồi renderer phóng
   to bằng số nguyên với imageSmoothingEnabled=false — đó là cái làm nên nét
   pixel sắc cạnh.

   BA LUẬT ĐỒ HOẠ CHO MÀN HÌNH NHỎ (bản thiết kế lại):

   1. **Mọi vật thể có VIỀN.** Trên điện thoại một ô chỉ ~32px; sprite không
      viền tan vào nền cỏ. `outline()` chạy sau mỗi sprite đứng trên mặt đất
      (vật thể, cây trồng, công trình, nhân vật) — nền đất thì không, để mặt
      ruộng vẫn liền.
   2. **Đọc được bằng HÌNH DẠNG, không chỉ bằng màu.** Đất cày có luống, đất
      ướt có vệt bóng, cây chín có QUẢ + LẤP LÁNH, bờ nước có bọt — nhìn qua
      cũng phân biệt được kể cả khi màn hình đang ngả tối về đêm.
   3. **Bảng màu ít mà tương phản.** Cỏ tối hơn một chút để vật thể sáng nổi
      lên; đất cày nâu đỏ tách hẳn khỏi lối đi vàng nhạt.
============================================================================ */

import type { AnimalArt, CharSkin, Content, CropArt, CropDef } from "../game/types.ts";
import { hash2, mulberry32 } from "../core/rng.ts";

export const TILE = 16;
/** Cây được vẽ trên khung cao hơn ô để cây cao vươn lên trên viền ô. */
export const CROP_H = 24;
/** Nhân vật: 0 đứng · 1-4 bước đi · 5 CHẠM (vung xuống) · 6 GIƠ (công cụ trên đầu). */
export const PLAYER_FRAMES = 7;
export const PLAYER_ACT_FRAME = 5;
export const PLAYER_RAISE_FRAME = 6;

/* ---------------------------------------------------------------------------
   Bảng màu. Gom một chỗ để chỉnh tông cả game bằng vài dòng.
--------------------------------------------------------------------------- */
const P = {
  outline: "#1c1410",
  grass: ["#4f8a3c", "#579644", "#478034", "#5a9c47"],
  grassTuft: "#7cc25a",
  grassDark: "#3b6b2c",
  flower: ["#f9e26b", "#f7f2e8", "#f28bb3"],
  path: ["#c9ab7a", "#bf9f6e", "#d3b686"],
  pathDark: "#9a7d54",
  asphalt: ["#4a4a52", "#53535c", "#434349"],
  asphaltDark: "#35353b",
  asphaltLine: "#c9c07a",
  soil: ["#7a4f2f", "#86593a", "#6b4328"],
  soilWet: ["#4e3220", "#573a26", "#432a19"],
  soilEdge: "#54331e",
  water: ["#2d6fcf", "#3b82e0", "#2a5fb0"],
  waterFoam: "#a8d4ff",
  trunk: "#5a3d24",
  trunkDark: "#3d2816",
  leaf: ["#2f6b33", "#3d8a3f", "#245227", "#4da04a"],
  rock: ["#8a8f98", "#a2a8b1", "#6b7078"],
  bush: ["#3f7a3a", "#4f9647", "#2e5c2b"],
  roof: "#3c4658",
  roofLight: "#56627a",
  roofDark: "#28303f",
  wall: "#f1ede2",
  wallDark: "#cfc7b6",
  wallTrim: "#8a6440",
  glass: "#5e81ac",
  glassLight: "#9fd0e8",
  wood: "#8a5c34",
  woodDark: "#5a3b21",
  metal: "#c3ced9",
  metalDark: "#5d7186",
  skin: "#f3c793",
  skinDark: "#d59a63",
  hair: "#4a2f1e",
  cap: "#e04d4d",
  capDark: "#a83030",
  capLight: "#ff7a7a",
  shirt: "#f4f6f8",
  shirtDark: "#c9d1d9",
  denim: "#3f6bb0",
  denimDark: "#2b4a80",
  boot: "#4a3420",
  plank: ["#b0824f", "#9e7344", "#bf9160"],
  plankDark: "#6b4a2c",
  cloth: "#e8dcbf",
  quilt: "#d0584a",
  quiltDark: "#8a4a3a",
  shadow: "rgba(0,0,0,0.24)",
  gold: "#ffd84a",
  goldDark: "#c9931a",
} as const;

/* ---------------------------------------------------------------------------
   Bút vẽ pixel. Mọi toạ độ là số nguyên; không có anti-alias ở đâu cả.
--------------------------------------------------------------------------- */

export interface Surface {
  c: HTMLCanvasElement;
  g: CanvasRenderingContext2D;
  px(x: number, y: number, color: string): void;
  rect(x: number, y: number, w: number, h: number, color: string): void;
  hline(x: number, y: number, w: number, color: string): void;
  vline(x: number, y: number, h: number, color: string): void;
  /** hình tròn đặc theo kiểu pixel (không khử răng cưa) */
  disc(cx: number, cy: number, r: number, color: string): void;
  /** bóng đổ ellipse mờ dưới chân vật thể */
  shadow(cx: number, cy: number, rx: number, ry: number): void;
}

function surface(w: number, h: number): Surface {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  // willReadFrequently: outline() và vài hàm vẽ tán cây đọc lại pixel bằng
  // getImageData; không bật cờ này thì trình duyệt cảnh báo và chậm.
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.imageSmoothingEnabled = false;
  const px = (x: number, y: number, color: string) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    g.fillStyle = color;
    g.fillRect(Math.floor(x), Math.floor(y), 1, 1);
  };
  return {
    c,
    g,
    px,
    rect(x, y, rw, rh, color) {
      g.fillStyle = color;
      g.fillRect(Math.floor(x), Math.floor(y), Math.floor(rw), Math.floor(rh));
    },
    hline(x, y, lw, color) {
      g.fillStyle = color;
      g.fillRect(Math.floor(x), Math.floor(y), Math.floor(lw), 1);
    },
    vline(x, y, lh, color) {
      g.fillStyle = color;
      g.fillRect(Math.floor(x), Math.floor(y), 1, Math.floor(lh));
    },
    disc(cx, cy, r, color) {
      for (let y = -r; y <= r; y++)
        for (let x = -r; x <= r; x++)
          if (x * x + y * y <= r * r + r * 0.35) px(cx + x, cy + y, color);
    },
    shadow(cx, cy, rx, ry) {
      g.fillStyle = P.shadow;
      g.beginPath();
      g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      g.fill();
    },
  };
}

const pick = <T,>(arr: readonly T[], r: number): T => arr[Math.floor(r * arr.length) % arr.length]!;

/**
 * Viền 1px quanh mọi pixel đặc. Đây là thay đổi đơn lẻ có tác dụng lớn nhất
 * cho màn hình nhỏ: sprite 16px phóng ×2 mà không viền thì tan vào nền.
 *
 * Pixel "đặc" = alpha ≥ 128 (bóng đổ mờ không tính, nên bóng không bị viền).
 * Viền vẽ đè lên pixel trong suốt/mờ kề bên theo 4 hướng.
 */
function outline(s: Surface, color: string = P.outline): Surface {
  const w = s.c.width;
  const h = s.c.height;
  const data = s.g.getImageData(0, 0, w, h).data;
  const solid = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < w && y < h && data[(y * w + x) * 4 + 3]! >= 128;
  s.g.fillStyle = color;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (solid(x, y)) continue;
      if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1))
        s.g.fillRect(x, y, 1, 1);
    }
  }
  return s;
}

/* ---------------------------------------------------------------------------
   NỀN ĐẤT — mỗi loại có vài biến thể, renderer chọn theo băm toạ độ ô nên
   ruộng trông có hoa văn tự nhiên mà state không phải lưu thêm gì.
--------------------------------------------------------------------------- */

function makeGrass(variant: number): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  const rnd = mulberry32(0x61a55 + variant * 7919);
  s.rect(0, 0, TILE, TILE, P.grass[0]!);
  // đốm màu thưa hơn bản cũ: nền càng "phẳng" thì vật thể càng nổi
  for (let i = 0; i < 28; i++) {
    const x = Math.floor(rnd() * TILE);
    const y = Math.floor(rnd() * TILE);
    s.px(x, y, pick(P.grass, rnd()));
  }
  // vài cọng cỏ dựng đứng cho đỡ phẳng
  for (let i = 0; i < 2 + (variant % 3); i++) {
    const x = 1 + Math.floor(rnd() * (TILE - 2));
    const y = 3 + Math.floor(rnd() * (TILE - 5));
    s.px(x, y, P.grassTuft);
    s.px(x, y + 1, P.grassDark);
  }
  // hai biến thể cuối có một bông hoa nhỏ — đủ hiếm để không thành hoa văn
  if (variant >= 4) {
    const x = 3 + Math.floor(rnd() * 10);
    const y = 3 + Math.floor(rnd() * 9);
    const col = pick(P.flower, rnd());
    s.px(x, y, col);
    s.px(x - 1, y, col);
    s.px(x + 1, y, col);
    s.px(x, y - 1, col);
    s.px(x, y + 1, col);
    s.px(x, y, P.gold);
  }
  return s.c;
}

function makeTuft(): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  const rnd = mulberry32(0x7c1f);
  for (let i = 0; i < 5; i++) {
    const x = 3 + Math.floor(rnd() * 10);
    const y = 8 + Math.floor(rnd() * 5);
    const h = 3 + Math.floor(rnd() * 3);
    for (let k = 0; k < h; k++) s.px(x, y - k, k === h - 1 ? P.grassTuft : P.grassDark);
  }
  return s.c;
}

/**
 * Đường nhựa. Bốn biến thể để mặt đường không lặp lại trông như giấy dán tường;
 * vạch kẻ vàng đứt quãng nằm ở biến thể 1 và 3 nên rải ra thành nét đứt tự
 * nhiên theo hàm băm toạ độ, không cần autotile.
 */
function makeAsphalt(variant: number): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  const rnd = mulberry32(0x5c2f + variant * 92821);
  s.rect(0, 0, TILE, TILE, P.asphalt[0]!);
  for (let i = 0; i < 46; i++)
    s.px(Math.floor(rnd() * TILE), Math.floor(rnd() * TILE), pick(P.asphalt, rnd()));
  // vài hạt sạn tối cho có mặt nhám
  for (let i = 0; i < 5; i++)
    s.px(1 + Math.floor(rnd() * 14), 1 + Math.floor(rnd() * 14), P.asphaltDark);
  if (variant % 2 === 1) {
    // vạch kẻ giữa, đứt quãng
    for (let y = 3; y < 13; y++) if (y % 5 !== 0) s.px(8, y, P.asphaltLine);
  }
  return s.c;
}

function makePath(variant: number): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  const rnd = mulberry32(0x9a71 + variant * 104729);
  s.rect(0, 0, TILE, TILE, P.path[0]!);
  for (let i = 0; i < 40; i++)
    s.px(Math.floor(rnd() * TILE), Math.floor(rnd() * TILE), pick(P.path, rnd()));
  // sỏi
  for (let i = 0; i < 4; i++) {
    const x = 2 + Math.floor(rnd() * 12);
    const y = 2 + Math.floor(rnd() * 12);
    s.px(x, y, P.pathDark);
    if (rnd() > 0.5) s.px(x + 1, y, P.pathDark);
  }
  return s.c;
}

function makeSoil(wet: boolean, variant: number): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  const pal = wet ? P.soilWet : P.soil;
  const rnd = mulberry32((wet ? 0x50117 : 0x50110) + variant * 31337);
  s.rect(0, 0, TILE, TILE, pal[0]!);
  // luống cày: các rãnh ngang, dấu hiệu đọc được ngay cả khi thu nhỏ
  for (let y = 2; y < TILE; y += 4) {
    s.hline(0, y, TILE, pal[2]!);
    s.hline(0, y + 1, TILE, pal[1]!);
  }
  for (let i = 0; i < 22; i++)
    s.px(Math.floor(rnd() * TILE), Math.floor(rnd() * TILE), pick(pal, rnd()));
  if (wet) {
    // vệt nước bắt sáng — hình dạng "lấp loáng" chứ không chỉ là màu tối hơn
    for (let i = 0; i < 4; i++) {
      const x = 1 + Math.floor(rnd() * 12);
      const y = 2 + Math.floor(rnd() * 12);
      s.px(x, y, "#7f9db8");
      s.px(x + 1, y, "#6a8aa6");
    }
  }
  return s.c;
}

/** Mép luống: viền tối ở cạnh nào KHÔNG kề ô đã cày — ruộng thành từng lô
 *  rõ ràng thay vì một mảng nâu. Renderer chọn theo hàng xóm. */
function makeSoilEdge(side: "n" | "s" | "w" | "e"): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  const col = P.soilEdge;
  if (side === "n") s.hline(0, 0, TILE, col);
  if (side === "s") s.hline(0, TILE - 1, TILE, col);
  if (side === "w") s.vline(0, 0, TILE, col);
  if (side === "e") s.vline(TILE - 1, 0, TILE, col);
  return s.c;
}

/** Sàn gỗ trong nhà: các thanh ván so le, có khe tối để đọc ra hướng. */
function makePlank(variant: number): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  const rnd = mulberry32(0x51a2b + variant * 7717);
  s.rect(0, 0, TILE, TILE, P.plank[0]!);
  for (let y = 0; y < TILE; y += 5) {
    s.hline(0, y, TILE, P.plankDark);
    for (let x = 0; x < TILE; x++)
      if (rnd() > 0.72) s.px(x, y + 1 + Math.floor(rnd() * 3), pick(P.plank, rnd()));
  }
  s.vline((variant * 7) % TILE, 0, 5, P.plankDark);
  s.vline((variant * 7 + 9) % TILE, 5, 5, P.plankDark);
  s.vline((variant * 7 + 4) % TILE, 10, 6, P.plankDark);
  return s.c;
}

function makeWater(frame: number): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  const rnd = mulberry32(0xa2e1);
  s.rect(0, 0, TILE, TILE, P.water[0]!);
  for (let y = 0; y < TILE; y++)
    for (let x = 0; x < TILE; x++) {
      const w = Math.sin((x + frame * 2) * 0.7 + y * 0.5) + Math.sin((y - frame) * 0.9);
      if (w > 1.1) s.px(x, y, P.water[1]!);
      else if (w < -1.1) s.px(x, y, P.water[2]!);
    }
  for (let i = 0; i < 3; i++) {
    const x = Math.floor(rnd() * TILE);
    const y = (Math.floor(rnd() * TILE) + frame * 3) % TILE;
    s.hline(x, y, 2, P.waterFoam);
  }
  return s.c;
}

/** Bọt ở bờ: dải sáng 2px ở cạnh nước giáp đất. Có nó thì ao đọc ra là AO
 *  chứ không phải một mảng xanh dán lên cỏ. 2 khung để bọt nhấp nhô. */
/**
 * BÓNG SÂU ở mép nước — dải tối bên TRONG mặt nước, sát bờ.
 *
 * Đây là thứ làm cái hồ TRŨNG XUỐNG thay vì nằm phẳng lì cùng mặt cỏ: trong
 * tranh nhìn từ trên, chiều sâu đọc ra từ cái bóng mà bờ cao đổ xuống mặt
 * nước. Không có nó thì hồ chỉ là một vũng màu xanh dán lên đồng cỏ.
 *
 * Vẽ ĐẬM dần vào trong rồi nhạt đi — bờ dốc, không phải một bậc thang.
 */
function makeBankShadow(side: "n" | "s" | "w" | "e"): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  const lop = ["rgba(6,22,44,0.55)", "rgba(6,22,44,0.40)", "rgba(6,22,44,0.24)", "rgba(6,22,44,0.10)"];
  for (let d = 0; d < lop.length; d++) {
    const c = lop[d]!;
    for (let i = 0; i < TILE; i++) {
      if (side === "n") s.px(i, d, c);
      else if (side === "s") s.px(i, TILE - 1 - d, c);
      else if (side === "w") s.px(d, i, c);
      else s.px(TILE - 1 - d, i, c);
    }
  }
  return s.c;
}

/**
 * GỜ ĐẤT phía BỜ — dải đất lộ ra ở mép ô ĐẤT giáp nước, kèm một vệt tối.
 *
 * Đi cùng `makeBankShadow` (bóng phía dưới nước) thành một BẬC: nhìn từ trên
 * xuống, một bậc đọc ra là "chỗ này thấp hơn". Chỉ có bóng dưới nước thôi thì
 * mặt cỏ vẫn chạy phẳng lì tới sát mép, và cái hồ trông như dán lên.
 */
function makeBankRim(side: "n" | "s" | "w" | "e"): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  /* Bốn lớp, đọc từ mép nước vào trong bờ:
       0  mặt đứng của bờ, tối nhất — đây là cái làm ra BẬC
       1  đất ẩm sát mép
       2  đất khô
       3  vài hạt đất lẻ tãi vào cỏ, để mép không thành một đường kẻ thẳng
     Từng lớp đủ ĐẬM để nhìn ra ở cỡ 16px: một dải nâu nhạt 1px thì mắt gộp
     luôn vào vệt bọt nước và cái bờ coi như không có. */
  const mat = ["rgba(38,26,14,0.62)", "#7a6038", "#9a7c4c"];
  const put = (d: number, i: number, c: string) => {
    if (side === "n") s.px(i, d, c);
    else if (side === "s") s.px(i, TILE - 1 - d, c);
    else if (side === "w") s.px(d, i, c);
    else s.px(TILE - 1 - d, i, c);
  };
  for (let i = 0; i < TILE; i++) {
    put(0, i, mat[0]!);
    put(1, i, mat[1]!);
    put(2, i, mat[2]!);
    if ((i * 7) % 5 === 0) put(3, i, mat[2]!);   // hạt đất lẻ, mép lượn
  }
  return s.c;
}

function makeShore(side: "n" | "s" | "w" | "e", frame: number): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  const foam = P.waterFoam;
  const deep = "#5aa0f0";
  for (let i = 0; i < TILE; i++) {
    const wobble = (i + frame * 3) % 4 === 0 ? 1 : 0;
    if (side === "n") {
      s.px(i, 0, foam);
      s.px(i, 1 + wobble, deep);
    } else if (side === "s") {
      s.px(i, TILE - 1, foam);
      s.px(i, TILE - 2 - wobble, deep);
    } else if (side === "w") {
      s.px(0, i, foam);
      s.px(1 + wobble, i, deep);
    } else {
      s.px(TILE - 1, i, foam);
      s.px(TILE - 2 - wobble, i, deep);
    }
  }
  return s.c;
}

/** Ô NGOÀI BIÊN bản đồ. Camera giữ nhân vật ở tâm nên sát mép sẽ lộ vùng ngoài;
 *  thay vì màu đen, vẽ tán rừng rậm (ngoài trời) hoặc tường tối (trong nhà) —
 *  đọc ra là "hết đất, không đi được" chứ không phải lỗi. */
function makeVoid(variant: number, indoor: boolean): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  const rnd = mulberry32(0x0ff + variant * 4099);
  if (indoor) {
    s.rect(0, 0, TILE, TILE, "#1a1410");
    for (let i = 0; i < 6; i++) s.px(Math.floor(rnd() * TILE), Math.floor(rnd() * TILE), "#211a14");
    return s.c;
  }
  s.rect(0, 0, TILE, TILE, "#1f3d1c");
  // tán cây chen nhau: vài đĩa tối/sáng chồng lên
  for (let i = 0; i < 5; i++) {
    const cx = Math.floor(rnd() * TILE);
    const cy = Math.floor(rnd() * TILE);
    s.disc(cx, cy, 3 + Math.floor(rnd() * 2), rnd() > 0.5 ? "#274a22" : "#1a3318");
  }
  for (let i = 0; i < 10; i++) s.px(Math.floor(rnd() * TILE), Math.floor(rnd() * TILE), "#2f5a2a");
  return s.c;
}

/* ---------------------------------------------------------------------------
   VẬT THỂ TĨNH
--------------------------------------------------------------------------- */

function makeTree(art: PropArt): HTMLCanvasElement {
  const s = surface(TILE, TILE * 2); // cây cao 2 ô, phần trên tràn lên ô phía trên
  const rnd = mulberry32(0x77ee);
  const baseY = TILE * 2;
  s.shadow(8, baseY - 2, 6, 2.5);
  // thân
  s.rect(6, baseY - 10, 4, 9, art.accent);
  s.vline(6, baseY - 10, 9, P.trunkDark);
  s.px(9, baseY - 6, P.trunkDark);
  // tán: ba cụm chồng lên nhau
  const blobs: [number, number, number][] = [
    [8, baseY - 19, 7],
    [4, baseY - 14, 5],
    [12, baseY - 14, 5],
    [8, baseY - 12, 6],
  ];
  for (const [cx, cy, r] of blobs) s.disc(cx, cy, r, art.body);
  // đốm sáng/tối cho tán có khối: sáng phía trên-trái, tối phía dưới-phải
  for (let i = 0; i < 80; i++) {
    const x = Math.floor(rnd() * TILE);
    const y = baseY - 26 + Math.floor(rnd() * 18);
    const img = s.g.getImageData(x, y, 1, 1).data;
    if (img[3]! === 0) continue;
    const lit = x + y < baseY - 14;
    s.px(x, y, lit ? (rnd() > 0.5 ? P.leaf[3]! : P.leaf[1]!) : rnd() > 0.4 ? art.dark : art.body);
  }
  return outline(s).c;
}

function makeRock(art: PropArt): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  s.shadow(8, 14, 5, 2);
  s.disc(8, 10, 5, art.body);
  s.disc(6, 8, 3, art.accent);
  s.disc(11, 11, 3, art.dark);
  s.px(5, 8, art.accent);
  s.px(6, 7, art.accent);
  s.px(5, 7, "#ffffff");
  return outline(s).c;
}

function makeBush(art: PropArt): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  const rnd = mulberry32(0x51b1);
  s.shadow(8, 14, 6, 2);
  s.disc(8, 10, 5, art.body);
  s.disc(5, 9, 3, art.accent);
  s.disc(11, 10, 3, art.dark);
  for (let i = 0; i < 20; i++) {
    const x = 2 + Math.floor(rnd() * 12);
    const y = 5 + Math.floor(rnd() * 9);
    if (s.g.getImageData(x, y, 1, 1).data[3]! > 0) s.px(x, y, pick(P.bush, rnd()));
  }
  // vài quả mọng
  for (let i = 0; i < 3; i++) s.px(4 + Math.floor(rnd() * 9), 7 + Math.floor(rnd() * 6), "#e0507a");
  return outline(s).c;
}

/** Cây gỗ NHỎ: một ô, tán bé, chặt vài nhát là xong. */
function makeSapling(art: PropArt): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  const rnd = mulberry32(0x5a91);
  s.shadow(8, 14, 4, 1.6);
  s.rect(7, 8, 2, 6, art.accent);
  s.disc(8, 6, 4, art.body);
  s.disc(6, 5, 2, P.leaf[3]!);
  for (let i = 0; i < 18; i++) {
    const x = 3 + Math.floor(rnd() * 10);
    const y = 1 + Math.floor(rnd() * 9);
    if (s.g.getImageData(x, y, 1, 1).data[3]! > 0) s.px(x, y, rnd() > 0.5 ? art.dark : art.body);
  }
  return outline(s).c;
}

/** Gốc cây còn lại sau khi hạ cây lớn — vẫn chặt tiếp được để lấy nốt gỗ. */
function makeStump(art: PropArt): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  s.shadow(8, 14, 5, 2);
  s.rect(4, 8, 8, 5, art.body);
  s.rect(4, 8, 8, 2, art.accent);
  s.hline(4, 12, 8, art.dark);
  s.rect(6, 9, 4, 1, art.dark);
  s.px(7, 8, art.dark);
  s.px(8, 8, art.dark);
  s.vline(4, 10, 3, art.dark);
  s.vline(11, 10, 3, art.dark);
  return outline(s).c;
}

/** Giếng nước: thành đá tròn, mái che, nước xanh bên trong. */
function makeWell(art: PropArt): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  s.shadow(8, 14, 6, 2);
  s.rect(2, 8, 12, 6, art.dark);
  s.rect(3, 9, 10, 4, art.body);
  s.rect(4, 10, 8, 2, art.accent);
  s.px(5, 10, P.waterFoam);
  s.hline(2, 8, 12, art.body);
  s.vline(3, 3, 5, P.wood);
  s.vline(12, 3, 5, P.wood);
  s.rect(1, 1, 14, 3, P.roof);
  s.hline(1, 1, 14, P.roofLight);
  s.px(8, 4, P.woodDark);
  return outline(s).c;
}

/** Giường — chỉ chỗ này mới ngủ được, không phải cái cửa. */
function makeBed(art: PropArt): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  s.rect(2, 1, 12, 14, P.woodDark);
  s.rect(3, 2, 10, 12, art.body);
  s.rect(3, 2, 10, 4, "#fbf6ea");
  s.rect(4, 3, 8, 2, "#e9e1cf");
  s.rect(3, 7, 10, 7, art.accent);
  s.hline(3, 7, 10, art.dark);
  s.hline(3, 10, 10, art.dark);
  s.px(6, 9, art.dark);
  s.px(10, 12, art.dark);
  s.rect(2, 0, 12, 1, P.wood);
  s.rect(2, 15, 12, 1, P.wood);
  return outline(s).c;
}

/** Bàn chế tạo. */
/**
 * MÁNG THỨC ĂN — cái máng gỗ trong khu chuồng.
 *
 * Hình chữ V nông nhìn từ trên chếch xuống, hai đầu cao hơn thành: nhìn một cái
 * là biết đây là thứ ĐỔ ĐỒ VÀO, chứ không phải một cái ghế hay một cái thùng.
 * Vạt rơm vàng ở lòng máng cố ý vẽ CỐ ĐỊNH, không theo số phần còn lại — vẽ
 * theo mức thì mỗi lần con vật ăn một miếng là cả ô nhấp nháy, mà người chơi
 * cần biết mức thì đứng vào là nút đã nói.
 */
/**
 * CẦU GỖ trên mặt nước — ván ngang, hai thanh dọc, đầu ván hở ra mép ô.
 *
 * Vẽ CHỪA hai mép trên/dưới một chút để mặt nước còn lộ ra hai bên: người chơi
 * phải thấy mình đang đi TRÊN nước, chứ không phải trên một dải sàn gỗ.
 */
function makePier(art: PropArt): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  s.rect(0, 3, TILE, 10, art.dark);
  s.rect(0, 4, TILE, 8, art.body);
  for (let x = 1; x < TILE; x += 5) s.vline(x, 4, 8, art.dark);   // khe giữa các tấm ván
  s.hline(0, 4, TILE, art.accent);
  s.hline(0, 11, TILE, art.dark);
  s.px(2, 13, art.dark);                                          // chân cọc
  s.px(11, 13, art.dark);
  return s.c;
}

function makeTrough(art: PropArt): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  s.shadow(8, 13, 11, 2);
  // hai chân
  s.rect(3, 11, 2, 3, art.dark);
  s.rect(11, 11, 2, 3, art.dark);
  // lòng máng
  s.rect(2, 6, 12, 6, art.dark);
  s.rect(3, 7, 10, 4, art.body);
  // vạt thức ăn
  s.rect(4, 8, 8, 2, art.accent);
  s.hline(4, 8, 8, "#f0dca0");
  // thành trước, và hai đầu nhô cao
  s.hline(2, 11, 12, art.dark);
  s.rect(2, 5, 2, 7, art.body);
  s.rect(12, 5, 2, 7, art.body);
  s.hline(2, 5, 2, "#c9a06a");
  s.hline(12, 5, 2, "#c9a06a");
  return outline(s).c;
}

function makeBench(art: PropArt): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  s.shadow(8, 14, 6, 2);
  s.rect(1, 6, 14, 3, art.body);
  s.hline(1, 6, 14, "#c9a06a");
  s.hline(1, 8, 14, art.dark);
  s.rect(2, 9, 2, 5, art.dark);
  s.rect(12, 9, 2, 5, art.dark);
  s.rect(4, 3, 5, 2, art.accent);
  s.px(3, 4, art.accent);
  s.rect(10, 2, 2, 4, P.wood);
  s.rect(9, 2, 4, 2, art.accent);
  s.px(5, 4, "#ffffff");
  return outline(s).c;
}

/** Tường trong nhà. */
function makeWall(art: PropArt): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  s.rect(0, 0, TILE, TILE, art.body);
  for (let y = 0; y < TILE; y += 4) {
    s.hline(0, y, TILE, art.dark);
    for (let x = (y / 4) % 2 === 0 ? 0 : 4; x < TILE; x += 8) s.vline(x, y, 4, art.dark);
  }
  s.hline(0, 0, TILE, art.accent);
  return s.c;
}

/** Cửa ra vào nhìn từ trong phòng. */
function makeDoorIn(art: PropArt): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  s.rect(0, 0, TILE, TILE, P.roofDark);
  s.rect(2, 2, 12, 14, art.body);
  s.rect(3, 3, 10, 6, art.accent);
  s.vline(8, 3, 12, art.dark);
  s.hline(2, 9, 12, art.dark);
  s.px(5, 11, P.gold);
  // dấu mũi tên ra — cửa là lối RA, cần đọc được ngay
  s.px(8, 13, P.gold);
  s.px(7, 12, P.gold);
  s.px(9, 12, P.gold);
  return s.c;
}

export type Neighbors = { up: boolean; down: boolean; left: boolean; right: boolean };

/** Ba màu mà content khai cho mỗi vật thể. Nhờ vậy đổi tông một loại địa hình
 *  chỉ là sửa props.json, không đụng code. */
export interface PropArt {
  body: string;
  dark: string;
  accent: string;
}

function makeHouseTile(n: Neighbors, door: boolean): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  const isRoof = !n.up;

  if (isRoof) {
    s.rect(0, 0, TILE, TILE, P.roof);
    for (let y = 1; y < TILE; y += 4) {
      s.hline(0, y, TILE, P.roofDark);
      for (let x = (y / 4) % 2 === 0 ? 0 : 2; x < TILE; x += 4) s.vline(x, y, 3, P.roofDark);
    }
    s.hline(0, 0, TILE, P.roofLight);
    s.hline(0, 1, TILE, P.roofLight);
    if (!n.left) s.vline(0, 0, TILE, P.roofDark);
    if (!n.right) s.vline(TILE - 1, 0, TILE, P.roofDark);
    // diềm mái nhô ra ở hàng dưới cùng của mái
    if (n.down) {
      s.hline(0, TILE - 2, TILE, P.roofLight);
      s.hline(0, TILE - 1, TILE, P.roofDark);
    }
    // tấm pin nhỏ trên mái — nhà "hiện đại"
    if (!n.left && n.right) {
      s.rect(3, 4, 6, 4, "#1e3a5f");
      s.hline(3, 4, 6, "#4fa3e3");
      s.vline(6, 4, 4, "#0f1f36");
    }
    return s.c;
  }

  s.rect(0, 0, TILE, TILE, P.wall);
  s.hline(0, 0, TILE, P.wallDark);
  if (!n.left) s.vline(0, 0, TILE, P.wallTrim);
  if (!n.right) s.vline(TILE - 1, 0, TILE, P.wallTrim);
  if (!n.down) {
    s.hline(0, TILE - 1, TILE, P.wallTrim);
    s.hline(0, TILE - 2, TILE, P.wallDark);
  }

  if (door) {
    // cửa kính lớn kiểu nhà hiện đại, có bậc thềm
    s.rect(3, 2, 10, 14, P.roofDark);
    s.rect(4, 3, 8, 12, P.glass);
    s.rect(4, 3, 8, 4, P.glassLight);
    s.vline(8, 3, 12, P.roofDark);
    s.px(6, 10, P.gold);
    s.px(9, 10, P.gold);
    s.hline(2, TILE - 1, 12, P.pathDark);
  } else {
    // cửa sổ băng ngang có khung gỗ
    s.rect(2, 4, 12, 7, P.wallTrim);
    s.rect(3, 5, 10, 5, P.glass);
    s.rect(3, 5, 10, 2, P.glassLight);
    s.vline(8, 5, 5, P.wallTrim);
    s.px(4, 6, "#ffffff");
  }
  return s.c;
}

function makeShop(): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  s.shadow(8, 15, 6, 1.6);
  s.rect(2, 1, 12, 14, P.metalDark);
  s.rect(3, 2, 10, 12, P.metal);
  s.rect(4, 3, 8, 7, P.glass);
  s.rect(4, 3, 8, 2, P.glassLight);
  s.rect(5, 6, 2, 3, "#6cc94f");
  s.rect(8, 6, 2, 3, "#e8452f");
  s.rect(11, 6, 1, 3, "#f08a1d");
  s.rect(4, 11, 8, 2, P.metalDark);
  s.px(12, 4, "#4ade80");
  s.rect(1, 0, 14, 2, P.cap);
  s.hline(1, 0, 14, P.capLight);
  return outline(s).c;
}

function makeCounter(): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  s.shadow(8, 15, 7, 1.6);
  s.rect(1, 7, 14, 8, P.woodDark);
  s.rect(2, 8, 12, 6, P.wood);
  s.hline(2, 8, 12, "#a67a4a");
  s.rect(3, 2, 10, 5, P.metalDark);
  s.rect(4, 3, 8, 3, "#1e2a3a");
  s.px(5, 4, "#4ade80");
  s.px(6, 4, "#4ade80");
  s.px(8, 4, P.gold);
  s.px(10, 4, "#4ade80");
  s.rect(9, 5, 4, 2, P.metal);
  // vài nông sản bày trên quầy
  s.px(4, 10, "#e8452f");
  s.px(6, 11, "#9be86b");
  s.px(9, 10, "#f08a1d");
  return outline(s).c;
}

/* --- địa hình tự nhiên mới (core 1.3): khúc gỗ, cỏ non/dày, bụi nhỏ/lớn --- */

function makeLog(art: PropArt): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  s.shadow(8, 14, 6, 1.8);
  // thân nằm ngang, hai đầu lộ vân gỗ
  s.rect(2, 8, 12, 5, art.body);
  s.rect(2, 8, 12, 1, art.accent);
  s.rect(2, 12, 12, 1, art.dark);
  s.disc(2, 10, 2, art.accent);
  s.px(2, 10, art.dark);
  s.disc(13, 10, 2, art.body);
  s.px(13, 10, art.dark);
  s.px(6, 10, art.dark);
  s.px(9, 9, art.dark);
  s.px(11, 11, art.dark);
  return outline(s).c;
}

function makeGrassProp(art: PropArt, tall: boolean): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  const rnd = mulberry32(tall ? 0x6a2d : 0x3c19);
  const blades = tall ? 11 : 7;
  for (let i = 0; i < blades; i++) {
    const x = 2 + Math.floor(rnd() * 12);
    const h = (tall ? 5 : 3) + Math.floor(rnd() * 3);
    const lean = rnd() > 0.5 ? 1 : -1;
    for (let k = 0; k < h; k++) {
      const xx = x + (k > h - 2 ? lean : 0);
      s.px(xx, 14 - k, k === h - 1 ? art.accent : k === 0 ? art.dark : art.body);
    }
  }
  // cỏ dày có vài bông cỏ khô nhạt
  if (tall) for (let i = 0; i < 3; i++) s.px(3 + Math.floor(rnd() * 10), 7 + Math.floor(rnd() * 3), "#d8d08a");
  // KHÔNG viền: cỏ là nền mềm, viền đen sẽ thành mảng bẩn trên bãi cỏ
  return s.c;
}

function makeBushSmall(art: PropArt): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  const rnd = mulberry32(0x22b7);
  s.shadow(8, 14, 4, 1.5);
  s.disc(8, 11, 3, art.body);
  s.disc(6, 10, 2, art.accent);
  s.px(10, 12, art.dark);
  for (let i = 0; i < 8; i++) {
    const x = 4 + Math.floor(rnd() * 8);
    const y = 8 + Math.floor(rnd() * 6);
    if (s.g.getImageData(x, y, 1, 1).data[3]! > 0) s.px(x, y, rnd() > 0.5 ? art.dark : art.accent);
  }
  return outline(s).c;
}

function makeBushBig(art: PropArt): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  const rnd = mulberry32(0x77c3);
  s.shadow(8, 14, 6.5, 2);
  s.disc(8, 9, 6, art.body);
  s.disc(5, 8, 3, art.accent);
  s.disc(11, 10, 3, art.dark);
  s.disc(8, 5, 2, art.accent);
  for (let i = 0; i < 24; i++) {
    const x = 1 + Math.floor(rnd() * 14);
    const y = 3 + Math.floor(rnd() * 11);
    if (s.g.getImageData(x, y, 1, 1).data[3]! > 0) s.px(x, y, pick([art.dark, art.body, art.accent] as const, rnd()));
  }
  return outline(s).c;
}

/**
 * Vẽ một vật thể theo id. Đây là chỗ DUY NHẤT ánh xạ id trong props.json sang
 * hình. Id lạ (content mới đẩy qua OTA, core chưa biết vẽ) vẫn ra một hình cọc
 * dễ nhận, chứ không làm trắng màn hình.
 */
/**
 * Tường nhà kho — tôn múi ngang, xám kim loại.
 *
 * Không dùng autotile như ngôi nhà: kho là một khối chữ nhật đặc, và mái đã
 * được gợi ý bằng dải sáng ở hàng trên cùng, nên ô nào cũng vẽ giống nhau vẫn
 * ra hình cái nhà kho. Đỡ được 32 biến thể mà mắt không nhận ra khác biệt.
 */
function makeWarehouse(art: PropArt): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  s.rect(0, 0, TILE, TILE, art.body);
  // tôn múi: sọc dọc xen kẽ
  for (let x = 0; x < TILE; x += 3) s.vline(x, 0, TILE, art.dark);
  // dải sáng trên cùng = mép mái
  s.hline(0, 0, TILE, art.accent);
  s.hline(0, 1, TILE, art.dark);
  return s.c;
}

/** Cửa kho — cửa cuốn kim loại, có tay nắm vàng cho dễ nhận ra là chỗ bấm. */
function makeStoreDoor(art: PropArt): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  s.rect(0, 0, TILE, TILE, art.body);
  for (let x = 0; x < TILE; x += 3) s.vline(x, 0, TILE, art.dark);
  s.hline(0, 0, TILE, art.accent);
  s.hline(0, 1, TILE, art.dark);
  // khung cửa cuốn
  s.rect(3, 4, 10, 12, art.dark);
  for (let y = 5; y < TILE; y += 2) s.hline(4, y, 8, art.body);
  s.rect(7, 10, 2, 2, art.accent);
  return s.c;
}

function makeProp(id: string, art: PropArt): HTMLCanvasElement {
  switch (id) {
    case "warehouse": return makeWarehouse(art);
    case "store_door": return makeStoreDoor(art);
    case "tree": return makeTree(art);
    case "sapling": return makeSapling(art);
    case "stump": return makeStump(art);
    case "rock": return makeRock(art);
    case "bush": return makeBush(art);
    case "well": return makeWell(art);
    case "bed": return makeBed(art);
    case "bench": return makeBench(art);
    case "trough": return makeTrough(art);
    case "pier": return makePier(art);
    case "wall": return makeWall(art);
    case "door_in": return makeDoorIn(art);
    case "shop": return makeShop();
    case "counter": return makeCounter();
    case "log": return makeLog(art);
    case "grass_short": return makeGrassProp(art, false);
    case "grass_tall": return makeGrassProp(art, true);
    case "bush_small": return makeBushSmall(art);
    case "bush_big": return makeBushBig(art);
    default: {
      const s = surface(TILE, TILE);
      s.rect(2, 3, 12, 11, art.dark);
      s.rect(3, 4, 10, 9, art.body);
      s.rect(7, 6, 2, 4, art.accent);
      s.rect(7, 11, 2, 2, art.accent);
      return outline(s).c;
    }
  }
}

/* ---------------------------------------------------------------------------
   CÔNG TRÌNH HIỆN ĐẠI — màu lấy từ content nên đổi tông qua OTA được.
--------------------------------------------------------------------------- */

function makeBuilding(id: string, art: PropArt, kind: "floor" | "object"): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  switch (id) {
    case "sprinkler": {
      s.shadow(8, 14, 5, 2);
      s.rect(6, 8, 4, 6, art.dark);
      s.rect(7, 8, 2, 6, art.body);
      s.rect(4, 5, 8, 3, art.body);
      s.rect(4, 5, 8, 1, art.dark);
      s.px(3, 6, art.accent);
      s.px(12, 6, art.accent);
      s.px(2, 4, art.accent);
      s.px(13, 4, art.accent);
      s.px(8, 3, art.accent);
      s.px(1, 3, P.waterFoam);
      s.px(14, 3, P.waterFoam);
      break;
    }
    case "greenhouse": {
      s.rect(0, 0, TILE, TILE, art.body);
      s.g.globalAlpha = 0.5;
      s.rect(0, 0, TILE, TILE, art.accent);
      s.g.globalAlpha = 1;
      s.hline(0, 0, TILE, art.dark);
      s.vline(0, 0, TILE, art.dark);
      s.hline(0, 8, TILE, art.dark);
      s.vline(8, 0, TILE, art.dark);
      for (let i = 0; i < 4; i++) s.px(2 + i, 3 + i, "#ffffff");
      for (let i = 0; i < 3; i++) s.px(10 + i, 11 + i, "#ffffff");
      break;
    }
    default: {
      s.rect(2, 2, 12, 12, art.dark);
      s.rect(3, 3, 10, 10, art.body);
      s.rect(7, 5, 2, 4, art.accent);
      s.rect(7, 10, 2, 2, art.accent);
    }
  }
  return kind === "object" ? outline(s).c : s.c;
}

/* ---------------------------------------------------------------------------
   CÂY TRỒNG — vẽ theo tham số, không vẽ tay từng giai đoạn.
--------------------------------------------------------------------------- */

function makeCrop(def: CropDef, stage: number): HTMLCanvasElement {
  const s = surface(TILE, CROP_H);
  const a = def.art;
  const maxStage = def.growthDays.length;
  const t = maxStage === 0 ? 1 : stage / maxStage;
  const ripe = stage >= maxStage;
  const baseY = CROP_H - 3;
  const rnd = mulberry32(hash2(def.id.length, stage, 0x3a1));

  if (stage === 0) {
    // mầm mới nhú: hai lá mầm bé — vẫn phải viền để thấy trên đất tối
    s.px(8, baseY, a.stem);
    s.px(8, baseY - 1, a.stem);
    s.px(7, baseY - 2, a.leaf);
    s.px(9, baseY - 2, a.leaf);
    s.px(8, baseY - 2, a.leafDark);
    return outline(s).c;
  }

  const ctx: FormCtx = { s, a, t, ripe, baseY, rnd };
  switch (a.form ?? "leafy") {
    case "head":
      drawHead(ctx);
      break;
    case "herb":
      drawHerb(ctx);
      break;
    case "bulb":
      drawBulb(ctx);
      break;
    case "melon":
      drawMelon(ctx);
      break;
    case "root":
      drawRoot(ctx);
      break;
    case "vine":
      drawVine(ctx);
      break;
    case "stalk":
      drawStalk(ctx);
      break;
    case "bush":
      drawBush(ctx);
      break;
    case "grain":
      drawGrain(ctx);
      break;
    case "flower":
      drawFlower(ctx);
      break;
    default:
      drawLeafy(ctx);
  }
  return outline(s).c;
}

/** Tham số chung mọi dáng cây dùng. `t` là độ lớn 0..1, `ripe` là đã chín. */
interface FormCtx {
  s: Surface;
  a: CropArt;
  t: number;
  ripe: boolean;
  baseY: number;
  rnd: () => number;
}

/** Quả tròn có bóng sáng góc trên trái — dùng lại cho mọi dáng. */
function berry(s: Surface, a: CropArt, cx: number, cy: number, r: number) {
  s.disc(cx, cy, r, a.fruit);
  s.disc(cx + 1, cy + 1, Math.max(0, r - 2), a.fruitDark);
  s.px(cx - r + 1, cy - r + 1, "#ffffff");
}

/* --- head: BẮP tròn ôm sát đất — bắp cải, xà lách, su hào ----------------
   Tách khỏi `leafy` vì mười bảy loại rau lá vẽ chung một dáng thì ra mười bảy
   bụi xanh giống hệt nhau. Bắp tròn có bóng dáng khác hẳn túm lá xoè, nên
   người chơi phân biệt được từ xa mà không phải đọc chữ. */
function drawHead({ s, a, t, ripe, baseY, rnd }: FormCtx) {
  const r = Math.max(2, Math.round((a.fruitSize + a.spread) * 0.32 * (0.45 + 0.55 * t)));
  const cy = baseY - r + 1;

  // lá ngoài xoè ra hai bên, thấp và rộng
  const wing = r + Math.max(1, Math.round(a.spread * 0.35 * t));
  for (let x = -wing; x <= wing; x++) {
    const drop = Math.round((Math.abs(x) / Math.max(1, wing)) * 2);
    s.px(8 + x, baseY - drop, a.leafDark);
    if (Math.abs(x) < wing) s.px(8 + x, baseY - drop - 1, a.leaf);
  }

  // bắp: đĩa tròn, sáng ở trên trái
  s.disc(8, cy, r, ripe ? a.fruit : a.leaf);
  s.disc(8 + 1, cy + 1, Math.max(0, r - 2), ripe ? a.fruitDark : a.leafDark);
  s.px(8 - r + 1, cy - r + 1, "#ffffff");
  // gân lá cuộn quanh bắp
  for (let k = -r + 1; k <= r - 1; k += 2) s.px(8 + k, cy - Math.round(r * 0.4), a.leafDark);
  if (rnd() > 0.5) s.px(8, cy - r, a.stem);
}

/* --- herb: BÚI LÁ MẢNH dựng đứng — hành, hẹ, sả, húng ---------------------
   Không có quả: người ta ăn chính cái lá. Nên dáng phải mảnh và cao, đọc ra
   ngay là "rau thơm" chứ không phải "bụi rau". */
function drawHerb({ s, a, t, ripe, baseY, rnd }: FormCtx) {
  const h = Math.max(3, Math.round((a.height + 4) * (0.4 + 0.6 * t)));
  const n = Math.max(3, Math.round((a.leaves + 2) * (0.5 + 0.5 * t)));
  for (let i = 0; i < n; i++) {
    const frac = n === 1 ? 0.5 : i / (n - 1);
    const lean = (frac - 0.5) * 2;
    const len = Math.max(2, Math.round(h * (0.65 + 0.35 * (1 - Math.abs(lean)))));
    for (let k = 0; k < len; k++) {
      const x = 8 + Math.round(lean * (a.spread * 0.55) * (k / Math.max(1, len)));
      const y = baseY - k;
      // ngọn nhạt hơn gốc: nhìn ra chiều cao mà không cần vẽ bóng
      s.px(x, y, k > len - 3 ? a.leaf : a.leafDark);
    }
  }
  // gốc trắng của hành, chỉ hiện khi đã tới lứa
  if (ripe) {
    s.hline(7, baseY, 3, a.fruit);
    s.px(8, baseY - 1, a.fruit);
    if (rnd() > 0.6) s.px(7, baseY - 1, a.fruitDark);
  }
}

/* --- bulb: CỦ TRÒN nổi trên mặt đất, ngọn mảnh — hành tây, tỏi ------------ */
function drawBulb({ s, a, t, ripe, baseY }: FormCtx) {
  const r = Math.max(2, Math.round(a.fruitSize * 0.5 * (0.5 + 0.5 * t)));
  const cy = baseY - Math.round(r * 0.6);
  // ngọn lá mảnh chĩa lên
  const h = Math.max(3, Math.round(a.height * (0.4 + 0.6 * t)));
  for (const lean of [-1, 0, 1]) {
    for (let k = 0; k < h; k++) {
      const x = 8 + Math.round(lean * (k / Math.max(1, h)) * 2);
      s.px(x, cy - r - k, k > h - 3 ? a.leaf : a.leafDark);
    }
  }
  if (ripe) {
    s.disc(8, cy, r, a.fruit);
    s.disc(8 + 1, cy + 1, Math.max(0, r - 2), a.fruitDark);
    s.px(8 - r + 1, cy - r + 1, "#ffffff");
    // vằn dọc trên vỏ củ — nét nhận diện của hành tây
    for (let k = -r + 1; k <= r - 1; k += 2) s.px(8 + k, cy, a.fruitDark);
  } else {
    s.disc(8, cy, Math.max(1, r - 1), a.leafDark);
  }
}

/* --- melon: QUẢ TO NẰM TRÊN ĐẤT, lá bò quanh — dưa hấu, bí đỏ ------------- */
function drawMelon({ s, a, t, ripe, baseY, rnd }: FormCtx) {
  // dây lá bò lan trên mặt đất
  const spread = Math.max(2, Math.round(a.spread * (0.5 + 0.5 * t)));
  for (let x = -spread; x <= spread; x++) {
    if (x === 0) continue;
    const y = baseY - (Math.abs(x) % 2);
    s.px(8 + x, y, a.leafDark);
    if (rnd() > 0.5) s.px(8 + x, y - 1, a.leaf);
  }
  const r = Math.max(2, Math.round(a.fruitSize * 0.55 * (0.35 + 0.65 * t)));
  const cy = baseY - r + 1;
  s.disc(8, cy, r, ripe ? a.fruit : a.leaf);
  s.disc(8 + 1, cy + 1, Math.max(0, r - 2), ripe ? a.fruitDark : a.leafDark);
  s.px(8 - r + 1, cy - r + 1, "#ffffff");
  // sọc dưa — thứ làm quả dưa ra quả dưa
  if (ripe && r >= 3)
    for (let k = -r + 1; k <= r - 1; k += 2)
      for (let dy = -r + 1; dy <= r - 1; dy++)
        if (k * k + dy * dy <= (r - 1) * (r - 1)) s.px(8 + k, cy + dy, a.fruitDark);
  // cuống
  s.px(8, cy - r, a.stem);
  s.px(8, cy - r - 1, a.stem);
}

/* --- leafy: thân đứng, lá so le hai bên, quả quanh thân ------------------- */

function drawLeafy({ s, a, t, ripe, baseY, rnd }: FormCtx) {
  const h = Math.max(2, Math.round(a.height * (0.35 + 0.65 * t)));
  const spread = Math.max(1, Math.round(a.spread * (0.4 + 0.6 * t)));
  const leaves = Math.max(2, Math.round(a.leaves * (0.4 + 0.6 * t)));

  for (let k = 0; k < h; k++) {
    const y = baseY - k;
    s.px(8, y, a.stem);
    if (k > h * 0.3 && k % 3 === 0) s.px(9, y, a.leafDark);
  }

  for (let i = 0; i < leaves; i++) {
    const frac = i / Math.max(1, leaves - 1);
    const y = baseY - Math.round(2 + frac * (h - 2));
    const side = i % 2 === 0 ? -1 : 1;
    const len = Math.max(1, Math.round(spread * (0.5 + 0.5 * (1 - frac))));
    for (let k = 1; k <= len; k++) {
      const x = 8 + side * k;
      s.px(x, y, k === len ? a.leafDark : a.leaf);
      if (k < len && rnd() > 0.45) s.px(x, y - 1, a.leaf);
      // lá dày hơn ở gần thân
      if (k === 1 && len > 2) s.px(x, y + 1, a.leafDark);
    }
  }

  if (ripe) {
    const r = Math.max(1, Math.round(a.fruitSize / 2));
    for (let i = 0; i < a.fruitCount; i++) {
      const ang = (i / Math.max(1, a.fruitCount)) * Math.PI * 2 + 0.6;
      const cx = 8 + Math.round(Math.cos(ang) * (a.fruitCount === 1 ? 0 : spread * 0.7));
      const cy =
        a.fruitCount === 1
          ? baseY - Math.round(h * 0.45)
          : baseY - Math.round(h * (0.35 + 0.4 * Math.abs(Math.sin(ang))));
      berry(s, a, cx, cy, r);
      s.px(cx, cy - r, a.leafDark);
    }
  }
}

/* --- root: túm lá xoè, chín thì nhô vai củ khỏi mặt đất ------------------- */

function drawRoot({ s, a, t, ripe, baseY, rnd }: FormCtx) {
  const h = Math.max(3, Math.round(a.height * (0.4 + 0.6 * t)));
  const spread = Math.max(2, Math.round(a.spread * (0.5 + 0.5 * t)));

  // vai củ: chỉ ló ra khi đã chín, đó là tín hiệu "nhổ được rồi"
  if (ripe) {
    const r = Math.max(2, Math.round(a.fruitSize / 2));
    s.disc(8, baseY, r, a.fruit);
    s.disc(8 + 1, baseY + 1, Math.max(0, r - 2), a.fruitDark);
    s.px(8 - r + 1, baseY - r + 1, "#ffffff");
    // đất vun quanh vai củ cho khỏi trông như quả đặt trên nền
    s.px(8 - r - 1, baseY + 1, a.fruitDark);
    s.px(8 + r + 1, baseY + 1, a.fruitDark);
  }

  // túm lá xoè hình quạt từ một gốc
  const top = baseY - (ripe ? 1 : 0);
  const blades = Math.max(3, Math.round(a.leaves * (0.5 + 0.5 * t)));
  for (let i = 0; i < blades; i++) {
    const frac = blades === 1 ? 0.5 : i / (blades - 1);
    const lean = (frac - 0.5) * 2; // -1..1
    const len = Math.max(2, Math.round(h * (0.6 + 0.4 * (1 - Math.abs(lean)))));
    for (let k = 0; k < len; k++) {
      const x = 8 + Math.round(lean * spread * (k / Math.max(1, len)));
      const y = top - k;
      s.px(x, y, k > len - 2 ? a.leafDark : a.leaf);
      if (k > 0 && rnd() > 0.7) s.px(x + (lean < 0 ? -1 : 1), y, a.leafDark);
    }
  }
  // cuống lá tụ lại ở cổ củ
  s.px(8, top, a.stem);
  s.px(8, top - 1, a.stem);
}

/* --- vine: dây bò ngang, quả to nằm trên đất ------------------------------ */

function drawVine({ s, a, t, ripe, baseY, rnd }: FormCtx) {
  const reach = Math.max(2, Math.round((a.spread + 2) * (0.5 + 0.5 * t)));
  const leaves = Math.max(3, Math.round(a.leaves * (0.5 + 0.5 * t)));

  // hai nhánh dây bò sang hai bên, gợn lên xuống 1px cho có nhịp
  for (let side = -1 as -1 | 1; ; side = 1) {
    for (let k = 1; k <= reach; k++) {
      const x = 8 + side * k;
      const y = baseY - (k % 3 === 0 ? 1 : 0);
      s.px(x, y, a.stem);
    }
    if (side === 1) break;
  }

  // lá xoè dọc dây, so le trên/dưới
  for (let i = 0; i < leaves; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const k = 1 + Math.round((i / Math.max(1, leaves - 1)) * (reach - 1));
    const cx = 8 + side * k;
    const cy = baseY - 2 - (i % 3);
    s.disc(cx, cy, 1, a.leaf);
    s.px(cx, cy + 1, a.leafDark);
    if (rnd() > 0.5) s.px(cx + side, cy, a.leafDark);
  }

  // quả to nằm bệt trên mặt đất — đây là điểm nhìn của dáng này
  if (ripe) {
    const r = Math.max(2, Math.round(a.fruitSize / 2));
    const n = Math.max(1, Math.min(2, a.fruitCount));
    for (let i = 0; i < n; i++) {
      const cx = n === 1 ? 8 : 8 + (i === 0 ? -3 : 3);
      const cy = baseY - r + 1;
      s.disc(cx, cy, r, a.fruit);
      // sọc dưa: vài vệt dọc màu tối, chỉ vẽ khi quả đủ to mới thấy được
      if (r >= 3) {
        for (let y = cy - r + 1; y <= cy + r - 1; y++) {
          s.px(cx - Math.round(r * 0.6), y, a.fruitDark);
          s.px(cx + Math.round(r * 0.6), y, a.fruitDark);
        }
      } else {
        s.disc(cx + 1, cy + 1, Math.max(0, r - 2), a.fruitDark);
      }
      s.px(cx - r + 1, cy - r + 1, "#ffffff");
      s.px(cx, cy - r, a.stem);
    }
  }
}

/* --- stalk: một cọng cao, bắp/quả bám dọc thân --------------------------- */

function drawStalk({ s, a, t, ripe, baseY, rnd }: FormCtx) {
  const h = Math.max(4, Math.round((a.height + 4) * (0.4 + 0.6 * t)));
  const spread = Math.max(2, Math.round(a.spread * (0.5 + 0.5 * t)));

  // thân dày 2px cho ra dáng cây cao
  for (let k = 0; k < h; k++) {
    s.px(8, baseY - k, a.stem);
    s.px(9, baseY - k, k % 4 === 0 ? a.leafDark : a.stem);
  }

  // lá dài rủ xuống, mọc so le dọc thân
  const leaves = Math.max(3, Math.round(a.leaves * (0.5 + 0.5 * t)));
  for (let i = 0; i < leaves; i++) {
    const frac = i / Math.max(1, leaves - 1);
    const y0 = baseY - Math.round(2 + frac * (h - 2));
    const side = i % 2 === 0 ? -1 : 1;
    const len = Math.max(2, Math.round(spread * (0.6 + 0.4 * frac)));
    for (let k = 1; k <= len; k++) {
      const x = 8 + side * k + (side < 0 ? 0 : 1);
      const y = y0 + Math.round((k / len) * 1.5); // rủ xuống dần
      s.px(x, y, k === len ? a.leafDark : a.leaf);
    }
  }

  // ngọn cờ (bông ngô) khi đã chín
  if (ripe) {
    s.px(8, baseY - h, a.leafDark);
    s.px(9, baseY - h - 1, a.leafDark);
    const r = Math.max(1, Math.round(a.fruitSize / 2));
    const n = Math.max(1, a.fruitCount);
    for (let i = 0; i < n; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const cy = baseY - Math.round(h * (0.35 + 0.25 * i));
      const cx = 8 + side * 2 + (side < 0 ? 0 : 1);
      // bắp thuôn dài: chồng hai đĩa lệch nhau theo chiều dọc
      s.disc(cx, cy, r, a.fruit);
      s.disc(cx, cy + r, r, a.fruit);
      s.px(cx + (side < 0 ? -1 : 1), cy, a.fruitDark);
      s.px(cx, cy - r, a.leafDark);
      if (rnd() > 0.5) s.px(cx, cy + r + 1, a.fruitDark);
    }
  }
}

/* --- bush: bụi tròn thấp, quả nhỏ rải khắp tán --------------------------- */

function drawBush({ s, a, t, ripe, baseY, rnd }: FormCtx) {
  const r = Math.max(2, Math.round((a.spread + 2) * (0.45 + 0.55 * t)));
  const cy = baseY - r + 1;

  s.disc(8, cy, r, a.leaf);
  // mảng tối ở nửa dưới phải cho tán có khối, không phẳng như cái đĩa
  s.disc(8 + 1, cy + 1, Math.max(1, r - 1), a.leafDark);
  s.disc(8 - 1, cy - 1, Math.max(1, r - 2), a.leaf);
  // rìa lởm chởm để không thành hình tròn hoàn hảo
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2;
    if (rnd() > 0.45)
      s.px(8 + Math.round(Math.cos(ang) * (r + 1)), cy + Math.round(Math.sin(ang) * (r + 1)), a.leaf);
  }
  s.px(8, baseY, a.stem);
  s.px(8, baseY - 1, a.stem);

  if (ripe) {
    const fr = Math.max(1, Math.round(a.fruitSize / 2));
    const n = Math.max(1, a.fruitCount);
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + 0.9;
      const d = r * 0.55;
      berry(s, a, 8 + Math.round(Math.cos(ang) * d), cy + Math.round(Math.sin(ang) * d), fr);
    }
  }
}

/* --- grain: nhiều cọng mảnh, bông trĩu đầu ngọn -------------------------- */

function drawGrain({ s, a, t, ripe, baseY, rnd }: FormCtx) {
  const h = Math.max(3, Math.round(a.height * (0.45 + 0.55 * t)));
  const n = Math.max(3, Math.round(a.leaves * (0.5 + 0.5 * t)));
  const spread = Math.max(1, Math.round(a.spread * (0.5 + 0.5 * t)));

  for (let i = 0; i < n; i++) {
    const frac = n === 1 ? 0.5 : i / (n - 1);
    const lean = (frac - 0.5) * 2;
    const x0 = 8 + Math.round(lean * spread);
    const hh = Math.max(2, h - Math.round(Math.abs(lean) * 2));
    for (let k = 0; k < hh; k++) {
      const x = x0 + Math.round(lean * (k / Math.max(1, hh)) * 1.5);
      s.px(x, baseY - k, k > hh * 0.6 ? a.leaf : a.stem);
    }
    // bông ở ngọn: chín thì trĩu và đổi màu
    const tipX = x0 + Math.round(lean * 1.5);
    const tipY = baseY - hh;
    if (ripe) {
      s.px(tipX, tipY, a.fruit);
      s.px(tipX, tipY - 1, a.fruit);
      s.px(tipX + (lean < 0 ? -1 : 1), tipY, a.fruitDark);
      if (rnd() > 0.5) s.px(tipX, tipY - 2, a.fruitDark);
    } else {
      s.px(tipX, tipY, a.leafDark);
    }
  }
}

/* --- flower: một bông to trên đỉnh thân ---------------------------------- */

function drawFlower({ s, a, t, ripe, baseY, rnd }: FormCtx) {
  const h = Math.max(3, Math.round(a.height * (0.4 + 0.6 * t)));
  for (let k = 0; k < h; k++) s.px(8, baseY - k, a.stem);

  // hai lá thấp
  const spread = Math.max(1, Math.round(a.spread * 0.6));
  for (let k = 1; k <= spread; k++) {
    s.px(8 - k, baseY - Math.round(h * 0.3), k === spread ? a.leafDark : a.leaf);
    s.px(8 + k, baseY - Math.round(h * 0.55), k === spread ? a.leafDark : a.leaf);
  }

  const cy = baseY - h;
  if (!ripe) {
    // nụ khép
    s.disc(8, cy, 1, a.leafDark);
    s.px(8, cy - 1, a.leaf);
    return;
  }

  const r = Math.max(2, Math.round(a.fruitSize / 2) + 1);
  // cánh: 8 chấm quanh tâm
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2;
    const px2 = 8 + Math.round(Math.cos(ang) * r);
    const py = cy + Math.round(Math.sin(ang) * r);
    s.disc(px2, py, 1, a.fruit);
    if (rnd() > 0.6) s.px(px2, py + 1, a.fruitDark);
  }
  // nhuỵ
  s.disc(8, cy, Math.max(1, r - 2), a.fruitDark);
  s.px(8 - 1, cy - 1, "#ffffff");
}

/* ---------------------------------------------------------------------------
   NHÂN VẬT — vẽ theo bộ phận, 4 hướng × 6 khung hình.

   Thiết kế lại cho màn nhỏ: đầu to hơn (kiểu chibi), mũ đỏ là điểm nhận diện,
   viền đen quanh người, bước đi 4 khung (chân so le + nhún) thay vì 2 để
   chuyển động mượt ở tốc độ chạy.
--------------------------------------------------------------------------- */

const DIRS = ["down", "up", "left", "right"] as const;
export type PlayerDir = (typeof DIRS)[number];

/** Làm tối/ sáng một mã màu #rrggbb — đủ để dựng bóng đổ và viền từ một màu
 *  duy nhất, nên bảng màu trong content chỉ cần khai màu chính. */
function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  const r = f((n >> 16) & 255);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}
const darken = (hex: string) => shade(hex, 0.68);
const lighten = (hex: string) => shade(hex, 1.28);

/** Bảng màu mặc định = ĐÚNG các hằng của nhân vật chính, nên khi không truyền
 *  gì thì không một pixel nào đổi. */
const DEFAULT_SKIN: CharSkin = {
  shirt: P.shirt,
  shirtDark: P.shirtDark,
  pants: P.denim,
  cap: P.cap,
  hair: P.hair,
};

/**
 * Nhân vật. `skin` cho phép người làm thuê dùng lại NGUYÊN bộ 28 khung này —
 * cả khung vung công cụ — mà chỉ tốn năm mã màu trong content.
 */
function makePlayer(dir: PlayerDir, frame: number, skin: CharSkin = DEFAULT_SKIN): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  const act = frame === PLAYER_ACT_FRAME;
  const raise = frame === PLAYER_RAISE_FRAME;
  // bước đi: 1 = chân trái trước, 2 = chụm (nhún), 3 = chân phải trước, 4 = chụm
  const walk = !act && !raise && frame > 0;
  const step = !walk ? 0 : frame === 1 ? 1 : frame === 3 ? -1 : 0;
  const bob = walk && (frame === 2 || frame === 4) ? 1 : 0;
  // chạm: nghiêng người về hướng làm; giơ: ngả nhẹ về phía sau (lấy đà)
  const lx = act ? (dir === "left" ? -1 : dir === "right" ? 1 : 0) : raise ? (dir === "left" ? 1 : dir === "right" ? -1 : 0) : 0;
  const ly = act ? (dir === "up" ? -1 : dir === "down" ? 1 : 0) : raise ? -1 : 0;

  s.shadow(8, 15, 4.5, 1.6);

  const top = 1 + bob;

  // chân
  const legY = 12 + bob;
  if (dir === "left" || dir === "right") {
    const front = dir === "right" ? 8 : 5;
    const back = dir === "right" ? 5 : 8;
    s.rect(back + (step < 0 ? 0 : 0), legY, 3, 3 - bob, darken(skin.pants));
    s.rect(front + step, legY - (step !== 0 ? 1 : 0), 3, 3 - bob, skin.pants);
    s.rect(back, 15 - bob, 3, 1, P.boot);
    s.rect(front + step, 15 - bob, 3, 1, P.boot);
  } else {
    s.rect(5, legY - (step > 0 ? 1 : 0), 3, 3 - bob, step >= 0 ? skin.pants : darken(skin.pants));
    s.rect(9, legY - (step < 0 ? 1 : 0), 3, 3 - bob, step >= 0 ? darken(skin.pants) : skin.pants);
    s.rect(5, 15 - bob, 3, 1, P.boot);
    s.rect(9, 15 - bob, 3, 1, P.boot);
  }

  s.g.save();
  s.g.translate(lx, ly);
  // thân — áo trắng + yếm quần bò
  s.rect(5, top + 6, 7, 6, skin.shirt);
  s.rect(5, top + 8, 7, 4, skin.pants);
  s.vline(7, top + 6, 3, skin.pants);
  s.vline(10, top + 6, 3, skin.pants);
  s.px(6, top + 10, darken(skin.pants));
  s.px(11, top + 10, darken(skin.pants));
  s.px(5, top + 7, skin.shirtDark);

  // tay
  const armY = top + 7;
  if (act) {
    if (dir === "left") {
      s.rect(1, armY + 2, 5, 2, P.skin);
      s.rect(0, armY + 1, 2, 2, P.metal);
    } else if (dir === "right") {
      s.rect(10, armY + 2, 5, 2, P.skin);
      s.rect(14, armY + 1, 2, 2, P.metal);
    } else if (dir === "up") {
      s.rect(4, top + 1, 2, 5, P.skin);
      s.rect(10, top + 1, 2, 5, P.skin);
      s.rect(7, top - 1, 2, 2, P.metal);
    } else {
      s.rect(3, armY + 3, 2, 4, P.skin);
      s.rect(12, armY + 3, 2, 4, P.skin);
      s.rect(6, armY + 6, 4, 2, P.metal);
    }
  } else if (raise) {
    // Hai tay giơ lên trên đầu (công cụ vẽ riêng ở renderer, chồng lên đây).
    if (dir === "left") s.rect(4, top - 1, 2, 7, P.skin);
    else if (dir === "right") s.rect(11, top - 1, 2, 7, P.skin);
    else {
      s.rect(3, top, 2, 6, P.skin);
      s.rect(12, top, 2, 6, P.skin);
    }
  } else if (dir === "left") {
    s.rect(4, armY + (step > 0 ? -1 : step < 0 ? 1 : 0), 2, 4, P.skin);
  } else if (dir === "right") {
    s.rect(11, armY + (step > 0 ? -1 : step < 0 ? 1 : 0), 2, 4, P.skin);
  } else {
    s.rect(3, armY - (step > 0 ? 1 : 0), 2, 4, P.skin);
    s.rect(12, armY + (step > 0 ? 1 : 0), 2, 4, P.skin);
  }

  // đầu (to hơn thân — chibi)
  s.rect(4, top + 1, 9, 6, P.skin);
  s.hline(4, top + 6, 9, P.skinDark);

  // mũ lưỡi trai — nét nhận diện chính ở kích thước nhỏ
  s.rect(3, top - 1, 11, 3, skin.cap);
  s.hline(4, top - 1, 9, lighten(skin.cap));
  s.hline(3, top + 1, 11, darken(skin.cap));
  if (dir === "down") s.rect(3, top + 2, 11, 1, darken(skin.cap));
  else if (dir === "left") s.rect(1, top + 2, 6, 1, darken(skin.cap));
  else if (dir === "right") s.rect(10, top + 2, 6, 1, darken(skin.cap));

  // mặt
  if (dir === "down") {
    s.px(6, top + 4, P.outline);
    s.px(10, top + 4, P.outline);
    s.px(8, top + 5, P.skinDark);
    s.px(7, top + 5, "#e08a8a");
    s.px(10, top + 5, "#e08a8a");
  } else if (dir === "up") {
    s.rect(4, top + 3, 9, 3, skin.hair);
  } else if (dir === "left") {
    s.px(5, top + 4, P.outline);
    s.rect(9, top + 3, 4, 3, skin.hair);
  } else {
    s.px(11, top + 4, P.outline);
    s.rect(4, top + 3, 4, 3, skin.hair);
  }
  s.g.restore();
  return outline(s).c;
}

/* ---------------------------------------------------------------------------
   CÔNG CỤ TRONG TAY — sprite nhỏ 8×8, renderer đặt vào tay nhân vật theo hướng
   và pha vung (giơ lên / chạm xuống). Nhờ vậy "diễn hoạt dùng công cụ" đọc được
   ngay cả ở cỡ 2×: thấy cái cuốc giơ lên rồi bổ xuống, cái bình nghiêng đổ.
--------------------------------------------------------------------------- */

export type HeldKind = "TILL" | "WATER" | "CHOP" | "MINE" | "seed" | "build" | "hand";

function makeHeld(kind: HeldKind, steel: boolean): HTMLCanvasElement {
  const s = surface(8, 8);
  const head = steel ? "#dde5ee" : "#c3ced9";
  const headDark = steel ? "#7c8794" : "#5d7186";
  switch (kind) {
    case "TILL":
      for (let i = 0; i < 6; i++) s.px(1 + i, 7 - i, P.wood);
      s.rect(5, 0, 3, 2, head);
      s.px(7, 2, head);
      s.px(5, 1, headDark);
      break;
    case "WATER":
      s.rect(1, 3, 5, 4, head);
      s.hline(1, 3, 5, "#eef4fa");
      s.rect(5, 1, 2, 2, head);
      s.px(7, 0, "#7fb6ec");
      s.px(2, 1, headDark);
      s.px(3, 1, headDark);
      s.hline(1, 6, 5, headDark);
      break;
    case "CHOP":
      for (let i = 0; i < 6; i++) s.px(1 + i, 7 - i, P.wood);
      s.rect(5, 0, 3, 3, head);
      s.vline(5, 0, 3, headDark);
      break;
    case "MINE":
      for (let i = 0; i < 6; i++) s.px(1 + i, 7 - i, P.wood);
      s.rect(4, 0, 4, 2, head);
      s.px(3, 1, head);
      s.px(7, 2, headDark);
      break;
    case "seed":
      s.rect(1, 1, 6, 6, P.cloth);
      s.rect(1, 1, 6, 1, "#c9b48a");
      s.px(3, 4, "#6cc94f");
      s.px(4, 4, "#6cc94f");
      s.px(2, 6, "#a8916a");
      break;
    case "build":
      s.rect(1, 1, 6, 6, P.metalDark);
      s.rect(2, 2, 4, 4, P.metal);
      s.px(3, 3, "#4fa3e3");
      break;
    case "hand":
      return s.c;
  }
  return outline(s).c;
}

/* ---------------------------------------------------------------------------
   Con trỏ ô, dấu đích, lấp lánh, icon HUD
--------------------------------------------------------------------------- */

function makeCursor(ok: boolean): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  const bright = ok ? "#ffffff" : "#ff8a8a";
  const wash = ok ? "rgba(255,255,255,0.16)" : "rgba(255,90,90,0.20)";
  const dark = "rgba(0,0,0,0.55)";
  const L = 6;
  const T = 2;

  s.rect(0, 0, TILE, TILE, wash);
  s.hline(0, 0, TILE, dark);
  s.hline(0, TILE - 1, TILE, dark);
  s.vline(0, 0, TILE, dark);
  s.vline(TILE - 1, 0, TILE, dark);
  s.rect(0, 0, L, T, bright);
  s.rect(0, 0, T, L, bright);
  s.rect(TILE - L, 0, L, T, bright);
  s.rect(TILE - T, 0, T, L, bright);
  s.rect(0, TILE - T, L, T, bright);
  s.rect(0, TILE - L, T, L, bright);
  s.rect(TILE - L, TILE - T, L, T, bright);
  s.rect(TILE - T, TILE - L, T, L, bright);
  return s.c;
}

/** Dấu ĐÍCH đang đi tới: vòng tròn vàng co lại theo 3 khung. Khác với con
 *  trỏ (ô đang ngắm) để người chơi phân biệt "sẽ tới đó" và "sẽ làm ở đó". */
function makeNavMark(frame: number): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  const r = 6 - frame;
  const col = P.gold;
  for (let a = 0; a < 32; a++) {
    const ang = (a / 32) * Math.PI * 2;
    s.px(8 + Math.round(Math.cos(ang) * r), 8 + Math.round(Math.sin(ang) * r), col);
  }
  s.px(8, 8, "#ffffff");
  return outline(s, "rgba(0,0,0,0.5)").c;
}

/** Ngôi sao lấp lánh trên cây chín — 3 khung, 7×7. */
function makeSparkle(frame: number): HTMLCanvasElement {
  const s = surface(7, 7);
  const c = frame === 1 ? "#ffffff" : P.gold;
  const len = frame === 2 ? 1 : frame === 1 ? 3 : 2;
  for (let k = -len; k <= len; k++) {
    s.px(3 + k, 3, c);
    s.px(3, 3 + k, c);
  }
  if (frame === 1) {
    s.px(2, 2, P.goldDark);
    s.px(4, 4, P.goldDark);
  }
  return s.c;
}

function makeDrop(): HTMLCanvasElement {
  const s = surface(5, 6);
  s.px(2, 0, "#a8d4ff");
  s.rect(1, 1, 3, 1, "#7fb6ec");
  s.rect(0, 2, 5, 3, "#4a90d9");
  s.rect(1, 5, 3, 1, "#2f6fc4");
  s.px(1, 3, "#dff0ff");
  return s.c;
}

/**
 * Icon 12×12 cho HUD và MENU.
 *
 * Menu dùng icon vẽ tay ở đây chứ không dùng emoji, vì emoji là FONT của hệ
 * điều hành: cùng một ký tự ra một hình trên iPhone, một hình khác trên
 * Android, và trên vài máy Linux thì ra ô vuông rỗng. Trong một game mà từng
 * điểm ảnh đều do mình vẽ, một cái emoji bóng loáng của Apple nằm giữa menu là
 * thứ lộ ra ngay.
 */
export type UiIcon =
  | "coin" | "sun" | "moon" | "energy" | "water" | "power" | "goal" | "day" | "bag"
  | "gear" | "help" | "build" | "install" | "bug" | "save" | "load" | "file" | "reload";

function makeUiIcon(name: UiIcon): HTMLCanvasElement {
  const s = surface(12, 12);
  switch (name) {
    case "coin":
      s.disc(6, 6, 5, P.goldDark);
      s.disc(6, 6, 4, P.gold);
      s.rect(5, 3, 2, 6, P.goldDark);
      s.px(4, 4, "#fff4b0");
      s.px(3, 5, "#fff4b0");
      break;
    case "sun":
      s.disc(6, 6, 3, P.gold);
      s.px(6, 0, P.gold); s.px(6, 11, P.gold); s.px(0, 6, P.gold); s.px(11, 6, P.gold);
      s.px(2, 2, P.gold); s.px(9, 2, P.gold); s.px(2, 9, P.gold); s.px(9, 9, P.gold);
      s.px(5, 5, "#fff4b0");
      break;
    case "moon":
      s.disc(6, 6, 5, "#cfd8ea");
      s.disc(8, 5, 4, "rgba(0,0,0,0)");
      s.g.globalCompositeOperation = "destination-out";
      s.disc(8, 4, 4, "#000");
      s.g.globalCompositeOperation = "source-over";
      s.px(4, 7, "#ffffff");
      break;
    case "energy":
      // tia sét
      s.px(7, 0, P.gold); s.px(6, 1, P.gold); s.px(6, 2, P.gold); s.px(5, 3, P.gold);
      s.rect(4, 4, 3, 1, P.gold); s.rect(5, 5, 3, 1, P.gold); s.px(7, 6, P.gold);
      s.px(6, 7, P.gold); s.px(6, 8, P.gold); s.px(5, 9, P.gold); s.px(4, 10, P.gold);
      s.px(5, 6, P.goldDark); s.px(4, 5, P.goldDark);
      break;
    case "water":
      s.px(6, 1, "#a8d4ff");
      s.rect(5, 2, 3, 2, "#7fb6ec");
      s.rect(4, 4, 5, 3, "#4a90d9");
      s.rect(3, 6, 7, 3, "#3b82e0");
      s.rect(4, 9, 5, 1, "#2f6fc4");
      s.px(4, 6, "#dff0ff");
      s.px(5, 5, "#dff0ff");
      break;
    case "power":
      s.rect(3, 4, 6, 6, "#4fa3e3");
      s.rect(4, 5, 4, 4, "#1e3a5f");
      s.rect(4, 2, 1, 2, "#cfd8ea");
      s.rect(7, 2, 1, 2, "#cfd8ea");
      s.px(5, 6, P.gold);
      s.px(6, 7, P.gold);
      break;
    case "goal":
      s.rect(3, 1, 1, 10, "#cfd8ea");
      s.rect(4, 1, 6, 4, "#6cc94f");
      s.px(9, 2, "#a7e88f");
      s.px(10, 2, "#6cc94f");
      break;
    case "bag":
      // balo: thân nâu, nắp, khoá vàng
      s.rect(2, 3, 8, 8, "#8a5c34");
      s.rect(2, 3, 8, 3, "#a67a4a");
      s.rect(4, 1, 4, 2, "#5a3b21");
      s.rect(4, 6, 4, 3, "#5a3b21");
      s.px(5, 7, P.gold);
      s.px(6, 7, P.gold);
      s.vline(1, 4, 6, "#5a3b21");
      s.vline(10, 4, 6, "#5a3b21");
      break;
    case "day":
      s.rect(1, 2, 10, 9, "#f1ede2");
      s.rect(1, 2, 10, 3, P.cap);
      s.px(3, 1, "#cfd8ea"); s.px(8, 1, "#cfd8ea");
      s.rect(3, 6, 2, 2, P.outline);
      s.rect(6, 6, 2, 2, "#b9a68d");
      s.rect(3, 9, 2, 1, "#b9a68d");
      break;

    /* ---- icon của MENU ------------------------------------------------- */
    case "gear": {
      // bánh răng: đĩa + bốn răng trục, lỗ giữa tối
      const g = "#b9c4d0";
      const gd = "#7b8794";
      s.disc(6, 6, 4, gd);
      s.disc(6, 6, 3, g);
      s.rect(5, 0, 2, 2, g); s.rect(5, 10, 2, 2, g);
      s.rect(0, 5, 2, 2, g); s.rect(10, 5, 2, 2, g);
      s.px(2, 2, g); s.px(9, 2, g); s.px(2, 9, g); s.px(9, 9, g);
      s.disc(6, 6, 1, "#2b2118");
      break;
    }
    case "help":
      s.disc(6, 6, 5, P.goldDark);
      s.disc(6, 6, 4, P.gold);
      // dấu hỏi bằng pixel, cỡ 12px thì đây là hình đọc được nhỏ nhất
      s.hline(4, 3, 4, "#2b2118");
      s.px(8, 4, "#2b2118");
      s.px(7, 5, "#2b2118");
      s.px(6, 6, "#2b2118");
      s.px(6, 7, "#2b2118");
      s.px(6, 9, "#2b2118");
      break;
    case "build":
      // búa: cán gỗ chéo + đầu búa thép
      s.rect(2, 1, 6, 3, "#b9c4d0");
      s.hline(2, 1, 6, "#7b8794");
      s.px(1, 2, "#7b8794"); s.px(1, 3, "#7b8794");
      s.px(6, 4, "#8a5c34"); s.px(6, 5, "#8a5c34");
      s.px(5, 6, "#8a5c34"); s.px(5, 7, "#8a5c34");
      s.px(4, 8, "#8a5c34"); s.px(4, 9, "#8a5c34");
      s.px(3, 10, "#5a3b21");
      break;
    case "install":
      // mũi tên xuống + vạch đáy: ký hiệu "tải về máy" quen thuộc nhất
      s.rect(5, 1, 2, 5, "#6cc94f");
      s.hline(3, 6, 6, "#6cc94f");
      s.hline(4, 7, 4, "#6cc94f");
      s.px(6, 8, "#6cc94f"); s.px(5, 8, "#6cc94f");
      s.hline(2, 10, 8, "#3d6b2a");
      break;
    case "bug":
      // con bọ: thân bầu dục, hai râu, ba cặp chân
      s.disc(6, 6, 3, "#8a4f2f");
      s.disc(6, 5, 2, "#a06438");
      s.px(4, 1, "#5c3320"); s.px(8, 1, "#5c3320");
      s.px(5, 2, "#5c3320"); s.px(7, 2, "#5c3320");
      s.px(2, 5, "#5c3320"); s.px(10, 5, "#5c3320");
      s.px(2, 7, "#5c3320"); s.px(10, 7, "#5c3320");
      s.px(3, 9, "#5c3320"); s.px(9, 9, "#5c3320");
      s.px(5, 4, "#f6ecdc"); s.px(7, 4, "#f6ecdc");
      break;
    case "save":
      // đĩa mềm: vỏ, nhãn trắng, cửa trượt
      s.rect(1, 1, 10, 10, "#4a6b8a");
      s.rect(3, 1, 6, 4, "#cfd8ea");
      s.rect(5, 2, 2, 3, "#3a4a5c");
      s.rect(3, 7, 6, 4, "#f1ede2");
      s.hline(4, 8, 4, "#7b8794");
      s.hline(4, 9, 4, "#7b8794");
      break;
    case "load":
      // thư mục mở
      s.rect(1, 3, 10, 8, "#c9931a");
      s.rect(1, 2, 5, 2, "#e0a92a");
      s.rect(2, 5, 8, 5, "#ffd84a");
      break;
    case "file":
      // trang giấy có góc gập
      s.rect(2, 1, 8, 10, "#f1ede2");
      s.px(9, 1, "#b9a68d"); s.px(8, 1, "#b9a68d"); s.px(9, 2, "#b9a68d");
      s.hline(4, 4, 5, "#8a7a66");
      s.hline(4, 6, 5, "#8a7a66");
      s.hline(4, 8, 3, "#8a7a66");
      break;
    case "reload":
      // mũi tên vòng: đọc ra "làm lại / cập nhật"
      s.disc(6, 6, 5, "#5aa9e6");
      s.disc(6, 6, 3, "rgba(0,0,0,0)");
      s.g.globalCompositeOperation = "destination-out";
      s.disc(6, 6, 3, "#000");
      s.rect(6, 0, 6, 5, "#000");
      s.g.globalCompositeOperation = "source-over";
      s.px(6, 0, "#5aa9e6"); s.px(7, 1, "#5aa9e6"); s.px(8, 2, "#5aa9e6");
      s.px(7, 3, "#5aa9e6"); s.px(6, 4, "#5aa9e6"); s.px(5, 3, "#5aa9e6");
      break;
  }
  return s.c;
}

/* ---------------------------------------------------------------------------
   THỜI TIẾT & TÌNH TRẠNG CÂY (core 1.3)
--------------------------------------------------------------------------- */

/** Dấu "đã tới lứa" 7×7 cố định trên cây chín — không nhấp nháy, thấy ngay. */
function makeRipeBadge(): HTMLCanvasElement {
  const s = surface(7, 7);
  s.disc(3, 3, 3, P.outline);
  s.disc(3, 3, 2, P.gold);
  // dấu tick
  s.px(2, 3, "#ffffff");
  s.px(3, 4, "#ffffff");
  s.px(4, 3, "#ffffff");
  s.px(5, 2, "#ffffff");
  return s.c;
}

/** Đốm bệnh phủ lên cây 16×24: chấm nâu rải ở tán. */
function makeSickOverlay(): HTMLCanvasElement {
  const s = surface(TILE, CROP_H);
  const rnd = mulberry32(0x5e11);
  for (let i = 0; i < 9; i++) {
    const x = 3 + Math.floor(rnd() * 10);
    const y = 6 + Math.floor(rnd() * 14);
    s.px(x, y, "#6b3f1a");
    if (rnd() > 0.5) s.px(x + 1, y, "#8a5a2a");
  }
  return s.c;
}

/** Lớp ngả vàng cho cây héo (nắng gắt chưa tưới), alpha thấp. */
function makeWiltOverlay(): HTMLCanvasElement {
  const s = surface(TILE, CROP_H);
  s.g.globalAlpha = 0.35;
  s.rect(0, 0, TILE, CROP_H, "#c9a23a");
  s.g.globalAlpha = 1;
  return s.c;
}

/** Vệt mưa 3 khung: cao 6px, nghiêng nhẹ. */
function makeRainDrop(frame: number): HTMLCanvasElement {
  const s = surface(3, 7);
  const c = frame === 1 ? "#dbeeff" : "#a8d4ff";
  for (let k = 0; k < 5; k++) s.px(k < 2 ? 2 : k < 4 ? 1 : 0, k + 1, c);
  if (frame === 2) s.px(1, 6, "#ffffff");
  return s.c;
}

/** Icon 12×12 cho HUD theo id thời tiết. Id lạ (content mới) → mặt trời. */
function makeWeatherIcon(id: string): HTMLCanvasElement {
  const s = surface(12, 12);
  const cloud = (x: number, y: number, col: string, dark: string) => {
    s.disc(x + 3, y + 3, 2, col);
    s.disc(x + 6, y + 2, 3, col);
    s.disc(x + 9, y + 3, 2, col);
    s.rect(x + 1, y + 3, 10, 3, col);
    s.hline(x + 1, y + 6, 10, dark);
  };
  switch (id) {
    case "hot":
      s.disc(6, 6, 4, "#f59e0b");
      s.disc(6, 6, 2, "#fff4b0");
      s.px(6, 0, "#f59e0b"); s.px(6, 11, "#f59e0b"); s.px(0, 6, "#f59e0b"); s.px(11, 6, "#f59e0b");
      s.px(2, 2, "#f59e0b"); s.px(9, 2, "#f59e0b"); s.px(2, 9, "#f59e0b"); s.px(9, 9, "#f59e0b");
      break;
    case "overcast":
      cloud(0, 3, "#b8c2d0", "#7f8a9a");
      break;
    case "rain":
      cloud(0, 1, "#9fb0c4", "#6f7d90");
      s.px(3, 9, "#7fb6ec"); s.px(6, 10, "#7fb6ec"); s.px(9, 9, "#7fb6ec");
      s.px(3, 10, "#3b82e0"); s.px(6, 11, "#3b82e0"); s.px(9, 10, "#3b82e0");
      break;
    case "storm":
      cloud(0, 0, "#6b7486", "#3f4756");
      s.px(6, 6, P.gold); s.px(5, 7, P.gold); s.px(6, 8, P.gold); s.px(5, 9, P.gold); s.px(4, 10, P.gold);
      s.px(2, 9, "#7fb6ec"); s.px(9, 9, "#7fb6ec");
      break;
    case "fog":
      s.hline(1, 3, 10, "#dfe6f0"); s.hline(2, 5, 8, "#cfd8e6"); s.hline(1, 7, 10, "#dfe6f0"); s.hline(3, 9, 7, "#cfd8e6");
      break;
    default: // sunny và id lạ
      s.disc(6, 6, 3, P.gold);
      s.px(6, 0, P.gold); s.px(6, 11, P.gold); s.px(0, 6, P.gold); s.px(11, 6, P.gold);
      s.px(2, 2, P.gold); s.px(9, 2, P.gold); s.px(2, 9, P.gold); s.px(9, 9, P.gold);
      s.px(5, 5, "#fff4b0");
  }
  return s.c;
}

/* ---------------------------------------------------------------------------
   API
--------------------------------------------------------------------------- */

export type Side = "n" | "s" | "w" | "e";

export interface Atlas {
  grass: HTMLCanvasElement[];
  path: HTMLCanvasElement[];
  asphalt: HTMLCanvasElement[];
  soil: HTMLCanvasElement[];
  soilWet: HTMLCanvasElement[];
  /** Viền lô đất theo cạnh giáp ô chưa cày. */
  soilEdge: Record<Side, HTMLCanvasElement>;
  water: HTMLCanvasElement[];
  /** [side][frame] bọt bờ nước, phủ lên ô nước giáp đất. */
  shore: Record<Side, HTMLCanvasElement[]>;
  /** Bóng của bờ đổ xuống mặt nước — thứ làm cái hồ trũng xuống. */
  bank: Record<Side, HTMLCanvasElement>;
  /** Gờ đất ở mép ô ĐẤT giáp nước. Đi cùng `bank` thành một bậc. */
  bankRim: Record<Side, HTMLCanvasElement>;
  wood: HTMLCanvasElement[];
  tuft: HTMLCanvasElement;
  /** Ô ngoài biên bản đồ: [ngoài trời (rừng)] và [trong nhà (tối)]. */
  voidOut: HTMLCanvasElement[];
  voidIn: HTMLCanvasElement[];
  /** Mọi vật thể, dựng theo props.json. Cao 32px nếu prop khai `tall`. */
  props: Record<string, HTMLCanvasElement>;
  /** công trình tự nối: id → (khoá bitmask → sprite) */
  autotiles: Record<string, Map<string, HTMLCanvasElement>>;
  /** vật nuôi: dựng LƯỜI ở lần dùng đầu tiên để thời gian khởi động không đổi */
  animal(defId: string, dir: PlayerDir, frame: number, pose?: AnimalPose): HTMLCanvasElement | null;
  /** Bong bóng cảm xúc 9×9 nổi trên đầu con vật / người làm. */
  emote(kind: EmoteKind): HTMLCanvasElement;
  /** người làm thuê: cùng 28 khung với nhân vật chính, khác bảng màu */
  worker(skin: number, dir: PlayerDir, frame: number): HTMLCanvasElement;
  /** xe: 4 hướng, không cần khung đi (bánh quay không thấy ở cỡ này) */
  vehicle(defId: string, dir: PlayerDir): HTMLCanvasElement | null;
  /** khoá = "u d l r" dạng bit + có phải cửa không */
  house: Map<string, HTMLCanvasElement>;
  /** [dir][frame] — PLAYER_FRAMES khung: 0 đứng, 1-4 đi, 5 chạm, 6 giơ */
  player: Record<PlayerDir, HTMLCanvasElement[]>;
  /** Công cụ trong tay, 8×8, theo loại việc; `steel` cho công cụ thép. */
  held(kind: HeldKind, steel?: boolean): HTMLCanvasElement;
  /** [cropId][stage] */
  crops: Record<string, HTMLCanvasElement[]>;
  buildings: Record<string, HTMLCanvasElement>;
  cursorOk: HTMLCanvasElement;
  cursorNo: HTMLCanvasElement;
  /** dấu đích đang đi tới, 3 khung */
  navMark: HTMLCanvasElement[];
  /** lấp lánh trên cây chín, 3 khung 7×7 */
  sparkle: HTMLCanvasElement[];
  drop: HTMLCanvasElement;
  /** icon 16x16 cho UI: hạt, nông sản, công cụ, công trình */
  icon(id: string): HTMLCanvasElement | null;
  /** icon 12×12 cho HUD */
  ui(name: UiIcon): HTMLCanvasElement;
  /** dấu "tới lứa" 7×7 trên cây chín */
  ripeBadge: HTMLCanvasElement;
  /** đốm bệnh 16×24 phủ lên cây */
  sickOverlay: HTMLCanvasElement;
  /** lớp ngả vàng 16×24 cho cây héo */
  wiltOverlay: HTMLCanvasElement;
  /** vệt mưa, 3 khung */
  rainDrop: HTMLCanvasElement[];
  /** icon 12×12 theo id thời tiết (id lạ → mặt trời) */
  weatherIcon(id: string): HTMLCanvasElement;
}

/**
 * Một ô hàng rào, hình phụ thuộc HÀNG XÓM.
 *
 * Sinh hoàn toàn từ tham số màu trong content, không switch theo id — nên thêm
 * kiểu rào mới (rào đá, rào lưới) chỉ là thêm một object JSON.
 *
 * Luôn có trụ ở giữa; mỗi hướng có hàng xóm thì nối thêm hai thanh ngang ra
 * mép. Nhờ vậy rào cụt vẫn ra hình cái cọc, còn rào dài thì liền mạch.
 */
function makeFence(art: { body: string; dark: string; accent: string }, n: Neighbors): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  const TOP = 5; // ngọn trụ
  const BAR1 = 8;
  const BAR2 = 12;

  const rail = (x0: number, x1: number, y: number) => {
    s.hline(x0, y, x1 - x0 + 1, art.body);
    s.hline(x0, y + 1, x1 - x0 + 1, art.dark);
  };
  // thanh ngang sang trái/phải
  if (n.left) {
    rail(0, 7, BAR1);
    rail(0, 7, BAR2);
  }
  if (n.right) {
    rail(8, TILE - 1, BAR1);
    rail(8, TILE - 1, BAR2);
  }
  // thanh dọc lên/xuống — rào chạy theo trục dọc thì nối bằng thanh đứng
  const post = (x: number, y0: number, y1: number, c: string) => s.vline(x, y0, y1 - y0 + 1, c);
  if (n.up) {
    post(6, 0, BAR1, art.body);
    post(9, 0, BAR1, art.dark);
  }
  if (n.down) {
    post(6, BAR2, TILE - 1, art.body);
    post(9, BAR2, TILE - 1, art.dark);
  }
  // trụ đứng ở giữa, luôn có
  s.rect(6, TOP, 4, TILE - TOP - 1, art.body);
  s.vline(9, TOP, TILE - TOP - 1, art.dark);
  s.hline(6, TOP, 4, art.accent);
  s.shadow(8, TILE - 1, 3, 1.2);
  return outline(s).c;
}

function houseKey(n: Neighbors, door: boolean): string {
  return `${n.up ? 1 : 0}${n.down ? 1 : 0}${n.left ? 1 : 0}${n.right ? 1 : 0}${door ? "D" : "-"}`;
}

export function houseVariantKey(n: Neighbors, door: boolean) {
  return houseKey(n, door);
}

/** Khoá bitmask 16 cho vật tự nối (hàng rào). Cùng thứ tự với `houseKey`. */
export function tileMaskKey(n: Neighbors): string {
  return `${n.up ? 1 : 0}${n.down ? 1 : 0}${n.left ? 1 : 0}${n.right ? 1 : 0}`;
}

/**
 * Gói hạt — mang HÌNH CÂY SẼ MỌC RA trên nhãn.
 *
 * Bản trước vẽ đúng một cái túi giấy giống hệt nhau cho cả sáu mươi mốt loại,
 * khác nhau ở một chấm màu 2px. Ở cỡ 16px trên hotbar thì sáu mươi mốt gói đó
 * là một gói: người chơi không phân biệt được hạt cà chua với hạt bí đỏ, và
 * phải nhấn giữ từng ô để đọc tên. Nhãn có hình cây thì nhìn là biết — đúng
 * cùng lý do cửa hàng bày thẻ có ảnh cây chín thay vì một danh sách chữ.
 *
 * Nhận sẵn khung cây CHÍN thay vì tự vẽ lại: một nguồn hình duy nhất, nên đổi
 * dáng cây qua OTA thì gói hạt đổi theo mà không phải nhớ sửa hai chỗ.
 */
function makeSeedIcon(def: CropDef, ripe?: HTMLCanvasElement): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  // Giấy túi ngả theo màu lá: thêm một tầng phân biệt nữa ở cỡ nhỏ, khi hình
  // trên nhãn mới chỉ còn vài pixel.
  s.rect(3, 3, 10, 11, shade(def.art.leaf, 1.55));
  s.rect(3, 3, 10, 2, "#c9b48a");
  s.hline(3, 13, 10, "#a8916a");
  // cửa sổ nhãn — nền sáng để hình cây nổi lên
  s.rect(4, 5, 8, 8, "#fbf7ee");

  if (ripe) {
    /* Cây cao 24px nhưng phần có vẽ nằm ở ĐÁY. Lấy 12px dưới cùng rồi ép vào ô
       8×8: nếu lấy cả 24px thì hai phần ba nhãn là khoảng trống. */
    s.g.imageSmoothingEnabled = false;
    s.g.drawImage(ripe, 2, ripe.height - 12, 12, 12, 4, 5, 8, 8);
  } else {
    s.disc(8, 9, 2, def.art.fruit);
    s.px(7, 8, def.art.fruitDark);
  }

  // vài hạt lộ ra ở miệng túi
  s.px(5, 2, "#8a6440");
  s.px(9, 2, "#8a6440");
  return outline(s).c;
}

function makeCropIcon(def: CropDef): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  const a = def.art;
  const r = Math.max(2, Math.min(6, Math.round(a.fruitSize / 2) + 1));
  s.disc(8, 9, r, a.fruit);
  s.disc(9, 10, Math.max(1, r - 2), a.fruitDark);
  s.px(8, 9 - r - 1, a.leafDark);
  s.px(9, 9 - r, a.leaf);
  s.px(7, 9 - r, a.leaf);
  s.px(6 - Math.floor(r / 3), 6, "#ffffff");
  return outline(s).c;
}

/** Vật liệu thô: gỗ, đá, sợi cỏ. */
function makeMaterialIcon(id: string): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  if (id === "wood") {
    s.rect(2, 5, 12, 6, "#8a6440");
    s.rect(2, 5, 12, 2, "#a37c52");
    s.hline(2, 10, 12, "#5a3b21");
    s.rect(1, 5, 3, 6, "#c49a6a");
    s.rect(2, 6, 1, 4, "#8a6440");
    s.px(2, 7, "#6b4a2c");
  } else if (id === "stone") {
    s.disc(7, 9, 4, "#8a8f98");
    s.disc(11, 11, 3, "#6b7078");
    s.disc(6, 7, 2, "#a2a8b1");
    s.px(4, 9, "#6b7078");
    s.px(5, 6, "#ffffff");
  } else if (id === "hay") {
    // BÓ RƠM: vàng, buộc dây ngang. Phải khác hẳn "cỏ khô" — hai thứ này đứng
    // cạnh nhau trong tab Thức ăn, mà cùng một hình thì tab đó vô dụng.
    for (let i = 0; i < 6; i++) s.vline(2 + i * 2, 2 + (i % 2), 11, i % 2 ? "#d9b24a" : "#efd07a");
    s.rect(2, 7, 12, 2, "#8a6440");
    s.hline(2, 7, 12, "#a37c52");
  } else if (id === "fodder") {
    // CỎ KHÔ: bó thấp hơn, ngả xanh-ô-liu, buộc hai dây.
    for (let i = 0; i < 5; i++) s.vline(3 + i * 2, 4 + (i % 2), 9, i % 2 ? "#6aa84f" : "#9ab86a");
    s.rect(2, 7, 12, 1, "#6b4a2c");
    s.rect(2, 10, 12, 1, "#6b4a2c");
  } else if (id === "feedmix") {
    // BAO CÁM: cái bao đứng, miệng gấp, có vệt hạt đổ ra.
    s.rect(3, 4, 10, 10, "#c9a06a");
    s.rect(4, 5, 8, 8, "#e0bd8a");
    s.rect(3, 3, 10, 2, "#8a6440");
    s.rect(5, 8, 6, 3, "#a3762f");
    s.px(6, 9, "#efd07a");
    s.px(9, 9, "#efd07a");
    s.px(8, 10, "#efd07a");
  } else if (id === "fishfeed") {
    // CÁM CÁ: hộp xanh nước, viên tròn nổi bên trên.
    s.rect(3, 6, 10, 8, "#2f6f8a");
    s.rect(4, 7, 8, 6, "#4a9ab5");
    s.rect(3, 5, 10, 2, "#1f4d61");
    s.disc(6, 3, 1, "#efd07a");
    s.disc(9, 3, 1, "#d9b24a");
    s.px(8, 1, "#efd07a");
  } else {
    for (let i = 0; i < 5; i++) {
      const x = 3 + i * 2;
      s.vline(x, 3 + (i % 2), 10, i % 2 ? "#6aa84f" : "#8ac46a");
    }
    s.rect(2, 8, 12, 2, "#c2ad82");
  }
  return outline(s).c;
}

function makeToolIcon(id: string, action: string): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  const steel = id.endsWith("2");
  const head = steel ? "#dde5ee" : "#b8c6d4";
  const headDark = steel ? "#7c8794" : "#5d7186";
  if (action === "CHOP") {
    for (let i = 0; i < 11; i++) s.px(4 + i, 13 - i, P.wood);
    for (let i = 0; i < 11; i++) s.px(5 + i, 13 - i, P.woodDark);
    s.rect(10, 1, 5, 5, head);
    s.rect(10, 1, 2, 5, headDark);
    s.px(9, 3, headDark);
    s.px(13, 2, "#ffffff");
    return outline(s).c;
  }
  if (action === "MINE") {
    for (let i = 0; i < 11; i++) s.px(4 + i, 13 - i, P.wood);
    for (let i = 0; i < 11; i++) s.px(5 + i, 13 - i, P.woodDark);
    s.rect(9, 2, 6, 2, head);
    s.px(8, 3, head);
    s.px(15, 1, head);
    s.px(8, 1, headDark);
    s.px(14, 3, headDark);
    return outline(s).c;
  }
  if (id === "hoe") {
    for (let i = 0; i < 10; i++) s.px(4 + i, 12 - i, P.wood);
    for (let i = 0; i < 10; i++) s.px(5 + i, 12 - i, P.woodDark);
    s.rect(11, 2, 4, 2, P.metal);
    s.rect(13, 2, 2, 4, P.metal);
    s.hline(11, 2, 4, P.metalDark);
    s.px(12, 2, "#ffffff");
  } else {
    const big = id.endsWith("2");
    const top = big ? 5 : 7;
    s.rect(3, top, 8, 14 - top, head);
    s.rect(3, top, 8, 1, "#eef4fa");
    s.hline(3, 13, 8, headDark);
    s.rect(10, top - 2, 4, 2, head);
    s.rect(13, top - 4, 2, 3, head);
    s.rect(5, top - 3, 4, 3, headDark);
    s.px(15, top - 4, "#7fb6ec");
    s.px(15, top - 2, "#7fb6ec");
    s.px(4, top + 1, "#ffffff");
  }
  return outline(s).c;
}

/* ============================================================================
   VẬT NUÔI — sinh hoàn toàn từ tham số, KHÔNG switch theo id.

   Đây là điểm khác nhau giữa cây trồng và vật thể trong file này: cây trồng đọc
   `art.form` rồi gọi hàm vẽ theo DÁNG, nên thêm cây mới là thêm một object JSON;
   vật thể thì `switch (id)` với mười mấy case cứng, nên thêm vật thể mới là thêm
   code. Vật nuôi đi theo cây trồng.

   Lý do không bắt chước vật thể: cái giếng và cái ghế băng không chia sẻ giải
   phẫu nào nên switch là hợp lý, còn tám loài vật thì cùng một bộ xương — thân,
   đầu, chân, đuôi. Mà số loài sẽ còn phình ra (thỏ, ngựa, ong), và 8 loài × 4
   hướng × 3 khung đã là 96 canvas: vẽ tay từng con là không bảo trì nổi, và mỗi
   loài mới lại thành một lần phát hành core thay vì một lần đẩy OTA.
============================================================================ */


/* ------------------------------------------------------------ bong bóng cảm xúc

   Một ký hiệu nổi trên đầu, đọc được từ đầu kia ruộng.

   Vì sao cần: trước đây "con vật đang cần bạn" chỉ có MỘT tín hiệu — lớp phủ
   đốm bệnh khi đói. Nhưng con vật có nhiều trạng thái đáng biết hơn thế, và ba
   trong số đó khiến người chơi phải đi tới tận nơi bấm thử mới biết: đã tới lứa
   sữa chưa, vừa được cho ăn chưa, người làm đang mệt hay đang làm. Ký hiệu nổi
   trả lời từ xa, và đó đúng là thứ biến một cái chuồng tĩnh thành một cái chuồng
   đang sống.

   Cố ý dùng bóng thoại pixel có đuôi nhọn thay vì icon trần: đuôi nhọn nói rõ
   "cái này thuộc về con bên dưới" khi hai con đứng sát nhau.
--------------------------------------------------------------------------- */

export type EmoteKind =
  /** đói — dấu chấm than đỏ */
  | "hungry"
  /** tới lứa: sữa/trứng/lông — chấm vàng */
  | "ready"
  /** vừa được cho ăn / vui — trái tim */
  | "love"
  /** đang ngủ — chữ Z */
  | "sleep"
  /** người làm đang mệt — giọt mồ hôi */
  | "tired";

const EMOTE = 9;

function makeEmote(kind: EmoteKind): HTMLCanvasElement {
  const s = surface(EMOTE, EMOTE + 2);
  const bg = "#f6ecdc";
  const edge = "#2b2118";
  // bóng thoại: hộp bo góc 9×8 + đuôi nhọn 2px chỉ xuống
  s.rect(1, 0, EMOTE - 2, 8, bg);
  s.rect(0, 1, EMOTE, 6, bg);
  s.hline(1, 0, EMOTE - 2, edge);
  s.hline(1, 7, EMOTE - 2, edge);
  s.vline(0, 1, 6, edge);
  s.vline(EMOTE - 1, 1, 6, edge);
  s.px(4, 8, bg);
  s.px(3, 8, edge);
  s.px(5, 8, edge);
  s.px(4, 9, edge);

  const ink =
    kind === "hungry" ? "#e05d5d" : kind === "ready" ? "#c9931a" : kind === "love" ? "#e05d8a" : "#5aa9e6";

  if (kind === "hungry") {
    s.vline(4, 2, 3, ink);
    s.px(4, 6, ink);
  } else if (kind === "ready") {
    // giọt/quả tròn đầy đặn: "có thứ để lấy"
    s.rect(3, 2, 3, 4, ink);
    s.px(2, 3, ink);
    s.px(6, 3, ink);
    s.px(4, 1, ink);
  } else if (kind === "love") {
    s.px(2, 2, ink); s.px(3, 2, ink); s.px(5, 2, ink); s.px(6, 2, ink);
    s.hline(2, 3, 5, ink);
    s.hline(3, 4, 3, ink);
    s.px(4, 5, ink);
  } else if (kind === "sleep") {
    s.hline(2, 2, 5, ink);
    s.px(5, 3, ink);
    s.px(4, 4, ink);
    s.px(3, 5, ink);
    s.hline(2, 6, 5, ink);
  } else {
    // giọt mồ hôi
    s.px(4, 2, ink);
    s.hline(3, 3, 3, ink);
    s.hline(3, 4, 3, ink);
    s.px(4, 5, ink);
  }
  return s.c;
}

const ANIMAL_FRAMES = 3;

/** Bốn hướng × ba khung (0 đứng, 1-2 bước chân). */
/**
 * TƯ THẾ của con vật, ngoài chuyện đi hay đứng.
 *
 * Vì sao đáng làm: một cái chuồng đầy bò mà con nào cũng một dáng thì nó là một
 * hàng hình dán, không phải một cái chuồng. Ba tư thế này là ba trạng thái người
 * chơi THẬT SỰ cần đọc từ xa — con nào đang gặm cỏ (khoẻ, không cần gì), con nào
 * đang ngủ (đêm rồi, đừng chờ sữa), con nào đang đi.
 *
 * Cùng một hàm vẽ, chỉ đổi vài con số: chi phí gần bằng không so với vẽ ba bộ
 * sprite riêng, và một loài mới thêm bằng JSON vẫn tự có đủ ba tư thế.
 */
export type AnimalPose = "walk" | "eat" | "sleep";

function makeAnimal(
  art: AnimalArt,
  dir: PlayerDir,
  frame: number,
  pose: AnimalPose = "walk",
): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  const side = dir === "left" || dir === "right";
  const flip = dir === "left";
  // nhún theo khung: chân trước/chân sau đổi nhau, thân nhấp nhô 1px
  const bob = frame === 2 ? 1 : 0;
  const w = Math.max(3, Math.min(14, Math.round(art.w * (side ? 1 : 0.72))));
  const h0 = Math.max(3, Math.min(12, Math.round(art.h)));
  /* NGỦ: nằm bẹp xuống — thân dẹt đi một phần ba và chân thu hết vào trong.
     Cá thì không: cá ngủ vẫn là cá đang bơi. */
  const nam = pose === "sleep" && art.form !== "fish";
  const h = nam ? Math.max(3, h0 - 2) : h0;
  const legLen = art.form === "fish" ? 0 : nam ? 0 : art.form === "bird" ? 2 : 3;

  const bodyY = TILE - 1 - legLen - h + bob;
  const bodyX = Math.round((TILE - w) / 2);

  if (art.form !== "fish") s.shadow(8, TILE - 1, w / 2 + 0.5, 1.4);

  // ---- chân ----
  if (legLen > 0) {
    const feet: number[] =
      art.form === "bird"
        ? [bodyX + Math.round(w * 0.35), bodyX + Math.round(w * 0.65)]
        : side
          ? [bodyX + 1, bodyX + Math.round(w * 0.34), bodyX + Math.round(w * 0.66), bodyX + w - 2]
          : [bodyX + 1, bodyX + w - 2];
    feet.forEach((fx, i) => {
      const lift = frame === 0 ? 0 : (i + frame) % 2;
      s.vline(fx, bodyY + h - lift, legLen + lift, art.bodyDark);
    });
  }

  // ---- thân ----
  s.rect(bodyX, bodyY, w, h, art.body);
  s.hline(bodyX, bodyY, w, art.bodyDark);
  s.hline(bodyX, bodyY + h - 1, w, art.bodyDark);
  // bụng sáng
  if (h >= 4) s.hline(bodyX + 1, bodyY + h - 2, Math.max(1, w - 2), art.belly);

  // ---- xù lông (cừu) ----
  const fluff = art.fluff ?? 0;
  if (fluff > 0) {
    const rnd = mulberry32(0x51e + Math.round(fluff * 977));
    for (let i = 0; i < Math.round(w * h * 0.5 * fluff); i++) {
      const px = bodyX + Math.floor(rnd() * w);
      const py = bodyY + Math.floor(rnd() * h);
      s.px(px, py, rnd() > 0.5 ? art.belly : art.body);
    }
    // viền bông trên lưng
    for (let x = bodyX; x < bodyX + w; x += 2) s.px(x, bodyY - 1, art.belly);
  }

  // ---- đốm (bò sữa) ----
  const patch = art.patch ?? 0;
  if (patch > 0) {
    const rnd = mulberry32(0x9a2 + Math.round(patch * 613));
    for (let i = 0; i < Math.round(w * h * 0.35 * patch); i++) {
      const px = bodyX + 1 + Math.floor(rnd() * Math.max(1, w - 2));
      const py = bodyY + 1 + Math.floor(rnd() * Math.max(1, h - 2));
      s.px(px, py, art.bodyDark);
      if (rnd() > 0.6) s.px(px + 1, py, art.bodyDark);
    }
  }

  // ---- đầu ----
  const headSize = Math.max(3, Math.round(h * 0.8));
  let hx: number;
  let hy: number;
  if (art.form === "fish") {
    hx = flip ? bodyX : bodyX + w - headSize;
    hy = bodyY + 1;
  } else if (side) {
    hx = flip ? bodyX - 1 : bodyX + w - headSize + 1;
    hy = bodyY - Math.round(headSize * 0.5);
  } else {
    hx = bodyX + Math.round((w - headSize) / 2);
    hy = dir === "up" ? bodyY - 1 : bodyY + h - Math.round(headSize * 0.6);
  }
  /* ĂN: đầu cúi sát đất. NGỦ: đầu gục xuống nửa chừng. Chỉ dịch toạ độ đầu —
     phần vẽ mỏ/sừng/mắt bên dưới bám theo `hy` nên tự đi theo, không phải sửa
     một dòng nào ở đó. */
  if (pose === "eat" && art.form !== "fish") hy += Math.max(2, Math.round(headSize * 0.55));
  else if (nam) hy += Math.max(1, Math.round(headSize * 0.3));
  if (art.form !== "fish") {
    s.rect(hx, hy, headSize, headSize, art.body);
    s.hline(hx, hy, headSize, art.bodyDark);
  }

  // ---- mỏ / mũi / sừng ----
  if (art.form === "bird") {
    /* Mỏ và mào phải TO hơn một pixel mới thấy được ở cỡ 16px — con gà với con
       vịt chỉ khác nhau ở đúng hai chi tiết này, vẽ mờ thì thành hai cục giống
       nhau. Mỏ dài 2px và mào cao 2px là ngưỡng tối thiểu để đọc ra. */
    const my = hy + Math.round(headSize / 2);
    if (side) {
      const bx = flip ? hx - 2 : hx + headSize;
      s.rect(flip ? bx : bx, my, 2, 2, art.accent);
    } else {
      s.rect(hx + Math.round(headSize / 2) - 1, my, 2, 2, art.accent);
    }
    // mào trên đỉnh đầu, ba chấm so le
    const mx = hx + Math.round(headSize / 2);
    s.px(mx, hy - 2, art.accent);
    s.px(mx - 1, hy - 1, art.accent);
    s.px(mx + 1, hy - 1, art.accent);
    // đuôi xoè phía sau thân
    if (side) {
      const tx = flip ? bodyX + w : bodyX - 1;
      s.vline(tx, bodyY - 2, 3, art.bodyDark);
      s.px(tx + (flip ? 1 : -1), bodyY - 3, art.bodyDark);
    }
  } else if (art.form === "fish") {
    // vây đuôi ở phía sau
    const tx = flip ? bodyX + w : bodyX - 2;
    s.vline(tx, bodyY, h, art.bodyDark);
    s.px(tx + (flip ? 1 : -1), bodyY - 1, art.bodyDark);
    s.px(tx + (flip ? 1 : -1), bodyY + h, art.bodyDark);
    s.px(flip ? bodyX + 1 : bodyX + w - 2, bodyY + 1, art.accent);
  } else {
    const horn = art.horn ?? 0;
    for (let i = 0; i < horn; i++) {
      s.px(hx + i, hy - 1, art.accent);
      s.px(hx + headSize - 1 - i, hy - 1, art.accent);
    }
  }

  // ---- mắt: chỉ vẽ khi KHÔNG quay lưng, nếu không con vật thành có mắt sau gáy
  if (dir !== "up" && art.form !== "fish") {
    const ey = hy + Math.round(headSize * 0.45);
    if (side) s.px(flip ? hx + 1 : hx + headSize - 2, ey, "#1b1410");
    else {
      s.px(hx + 1, ey, "#1b1410");
      s.px(hx + headSize - 2, ey, "#1b1410");
    }
  }

  // ---- đuôi (loài critter: đuôi to là nét nhận diện) ----
  if (art.form === "critter" && side) {
    const tx = flip ? bodyX + w : bodyX - 1;
    s.vline(tx, bodyY - 2, h, art.bodyDark);
    s.px(tx + (flip ? 1 : -1), bodyY - 3, art.bodyDark);
  }

  return outline(s).c;
}

/**
 * Xe tải. Nhìn từ trên xuống nên chỉ có hai dáng thật: DỌC (đi lên/xuống) và
 * NGANG (đi trái/phải). Ở 16×16 thì bánh xe quay không ai thấy, nên không cần
 * khung hoạt hoạ — đỡ được 3/4 số canvas mà mắt không nhận ra khác biệt.
 */
function makeVehicle(
  art: { body: string; dark: string; glass: string; accent: string },
  dir: PlayerDir,
): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  const doc = dir === "up" || dir === "down";
  const w = doc ? 10 : 14;
  const h = doc ? 14 : 10;
  const x0 = Math.round((TILE - w) / 2);
  const y0 = Math.round((TILE - h) / 2);

  s.shadow(8, TILE - 1, w / 2, 1.5);
  // thùng xe
  s.rect(x0, y0, w, h, art.body);
  s.hline(x0, y0, w, art.dark);
  s.hline(x0, y0 + h - 1, w, art.dark);
  s.vline(x0, y0, h, art.dark);
  s.vline(x0 + w - 1, y0, h, art.dark);

  // ca-bin + kính, đặt về phía ĐẦU xe
  if (doc) {
    const cy = dir === "up" ? y0 + 1 : y0 + h - 5;
    s.rect(x0 + 1, cy, w - 2, 4, art.dark);
    s.rect(x0 + 2, cy + 1, w - 4, 2, art.glass);
  } else {
    const cx = dir === "left" ? x0 + 1 : x0 + w - 5;
    s.rect(cx, y0 + 1, 4, h - 2, art.dark);
    s.rect(cx + 1, y0 + 2, 2, h - 4, art.glass);
  }

  // đèn + sọc
  if (doc) {
    const ly = dir === "up" ? y0 : y0 + h - 1;
    s.px(x0 + 1, ly, art.accent);
    s.px(x0 + w - 2, ly, art.accent);
    s.hline(x0 + 1, y0 + Math.round(h / 2), w - 2, art.accent);
  } else {
    const lx = dir === "left" ? x0 : x0 + w - 1;
    s.px(lx, y0 + 1, art.accent);
    s.px(lx, y0 + h - 2, art.accent);
    s.vline(x0 + Math.round(w / 2), y0 + 1, h - 2, art.accent);
  }
  return outline(s).c;
}

export function buildAtlas(content: Content): Atlas {
  const grass = [0, 1, 2, 3, 4, 5].map(makeGrass);
  const path = [0, 1, 2, 3].map(makePath);
  const asphalt = [0, 1, 2, 3].map(makeAsphalt);
  const wood = [0, 1, 2, 3].map(makePlank);
  const soil = [0, 1].map((v) => makeSoil(false, v));
  const soilWet = [0, 1].map((v) => makeSoil(true, v));
  const water = [0, 1, 2, 3].map(makeWater);
  const sides: Side[] = ["n", "s", "w", "e"];
  const soilEdge = {} as Record<Side, HTMLCanvasElement>;
  const bank = {} as Record<Side, HTMLCanvasElement>;
  const bankRim = {} as Record<Side, HTMLCanvasElement>;
  const shore = {} as Record<Side, HTMLCanvasElement[]>;
  for (const sd of sides) {
    soilEdge[sd] = makeSoilEdge(sd);
    shore[sd] = [0, 1].map((f) => makeShore(sd, f));
    bank[sd] = makeBankShadow(sd);
    bankRim[sd] = makeBankRim(sd);
  }

  const house = new Map<string, HTMLCanvasElement>();
  for (let m = 0; m < 16; m++) {
    const n: Neighbors = {
      up: !!(m & 1),
      down: !!(m & 2),
      left: !!(m & 4),
      right: !!(m & 8),
    };
    for (const door of [false, true])
      house.set(houseKey(n, door), makeHouseTile(n, door));
  }

  const player = {} as Record<PlayerDir, HTMLCanvasElement[]>;
  for (const d of DIRS)
    player[d] = Array.from({ length: PLAYER_FRAMES }, (_, f) => makePlayer(d, f));

  const crops: Record<string, HTMLCanvasElement[]> = {};
  for (const id of content.cropOrder) {
    const def = content.crops[id]!;
    crops[id] = Array.from({ length: def.growthDays.length + 1 }, (_, st) => makeCrop(def, st));
  }

  /* Vật nuôi dựng LƯỜI: 10 loài × 4 hướng × 3 khung = 120 canvas, dựng hết lúc
     khởi động thì màn hình chờ dài thêm mà phần lớn không dùng tới (ván mới
     chưa có con nào). Dựng lần đầu cần đến rồi nhớ luôn. */
  const vehCache = new Map<string, HTMLCanvasElement>();
  const vehicleOf = (defId: string, dir: PlayerDir): HTMLCanvasElement | null => {
    const def = content.vehicles[defId];
    if (!def) return null;
    const key = `${defId}|${dir}`;
    let c = vehCache.get(key);
    if (!c) {
      c = makeVehicle(def.art, dir);
      vehCache.set(key, c);
    }
    return c;
  };

  const workerCache = new Map<string, HTMLCanvasElement>();
  const workerOf = (skin: number, dir: PlayerDir, frame: number): HTMLCanvasElement => {
    const skins = content.workers.skins;
    const si = skins.length ? ((skin % skins.length) + skins.length) % skins.length : 0;
    const f = Math.max(0, Math.min(PLAYER_FRAMES - 1, frame));
    const key = `${si}|${dir}|${f}`;
    let c = workerCache.get(key);
    if (!c) {
      c = makePlayer(dir, f, skins[si] ?? undefined);
      workerCache.set(key, c);
    }
    return c;
  };

  const emoteCache = new Map<EmoteKind, HTMLCanvasElement>();
  const emoteOf = (kind: EmoteKind): HTMLCanvasElement => {
    let c = emoteCache.get(kind);
    if (!c) {
      c = makeEmote(kind);
      emoteCache.set(kind, c);
    }
    return c;
  };

  const animalCache = new Map<string, HTMLCanvasElement>();
  const animalOf = (
    defId: string,
    dir: PlayerDir,
    frame: number,
    pose: AnimalPose = "walk",
  ): HTMLCanvasElement | null => {
    const def = content.animals[defId];
    if (!def) return null;
    const f = ((frame % ANIMAL_FRAMES) + ANIMAL_FRAMES) % ANIMAL_FRAMES;
    const key = `${defId}|${dir}|${f}|${pose}`;
    let c = animalCache.get(key);
    if (!c) {
      c = makeAnimal(def.art, dir, f, pose);
      animalCache.set(key, c);
    }
    return c;
  };

  const buildings: Record<string, HTMLCanvasElement> = {};
  const autotiles: Record<string, Map<string, HTMLCanvasElement>> = {};
  for (const id of content.buildingOrder) {
    const def = content.buildings[id]!;
    buildings[id] = makeBuilding(id, def.art, def.kind);
    if (def.autotile === "fence") {
      // 16 tổ hợp hàng xóm, dựng sẵn một lần — rẻ hơn hẳn dựng lại mỗi khung hình
      const m = new Map<string, HTMLCanvasElement>();
      for (let b = 0; b < 16; b++) {
        const n: Neighbors = {
          up: (b & 8) !== 0,
          down: (b & 4) !== 0,
          left: (b & 2) !== 0,
          right: (b & 1) !== 0,
        };
        m.set(tileMaskKey(n), makeFence(def.art, n));
      }
      autotiles[id] = m;
    }
  }

  const FALLBACK_ART: PropArt = { body: "#8a8f98", dark: "#4a4f56", accent: "#c8cfdb" };
  const props: Record<string, HTMLCanvasElement> = {};
  for (const id of content.propOrder) {
    if (id === "house" || id === "door") continue;
    props[id] = makeProp(id, content.props[id]?.art ?? FALLBACK_ART);
  }

  const icons = new Map<string, HTMLCanvasElement>();
  for (const id of content.toolOrder)
    icons.set(`tool:${id}`, makeToolIcon(id, content.tools[id]?.action ?? "TILL"));
  for (const id of content.materialOrder) icons.set(`item:${id}`, makeMaterialIcon(id));
  for (const id of content.cropOrder) {
    const def = content.crops[id]!;
    const frames = crops[id];
    icons.set(`seed:${id}`, makeSeedIcon(def, frames?.[frames.length - 1]));
    icons.set(`crop:${id}`, makeCropIcon(def));
  }
  for (const id of content.buildingOrder) icons.set(`build:${id}`, buildings[id]!);

  const heldCache = new Map<string, HTMLCanvasElement>();
  const held = (kind: HeldKind, steel = false) => {
    const k = `${kind}:${steel ? 1 : 0}`;
    let c = heldCache.get(k);
    if (!c) {
      c = makeHeld(kind, steel);
      heldCache.set(k, c);
    }
    return c;
  };

  const uiIcons = new Map<UiIcon, HTMLCanvasElement>();
  const ui = (name: UiIcon) => {
    let c = uiIcons.get(name);
    if (!c) {
      c = makeUiIcon(name);
      uiIcons.set(name, c);
    }
    return c;
  };
  const wxIcons = new Map<string, HTMLCanvasElement>();
  const weatherIcon = (id: string) => {
    let c = wxIcons.get(id);
    if (!c) {
      c = makeWeatherIcon(id);
      wxIcons.set(id, c);
    }
    return c;
  };

  return {
    grass, path, asphalt, soil, soilWet, soilEdge, water, shore, bank, bankRim, wood,
    autotiles,
    animal: animalOf,
    emote: emoteOf,
    worker: workerOf,
    vehicle: vehicleOf,
    tuft: makeTuft(),
    voidOut: [0, 1, 2, 3].map((v) => makeVoid(v, false)),
    voidIn: [0, 1].map((v) => makeVoid(v, true)),
    props,
    house,
    player,
    crops,
    buildings,
    cursorOk: makeCursor(true),
    cursorNo: makeCursor(false),
    navMark: [0, 1, 2].map(makeNavMark),
    sparkle: [0, 1, 2].map(makeSparkle),
    drop: makeDrop(),
    icon: (id) => icons.get(id) ?? null,
    ui,
    held,
    ripeBadge: makeRipeBadge(),
    sickOverlay: makeSickOverlay(),
    wiltOverlay: makeWiltOverlay(),
    rainDrop: [0, 1, 2].map(makeRainDrop),
    weatherIcon,
  };
}

/** Chọn biến thể theo toạ độ ô — cùng ô luôn ra cùng hoa văn. */
export function variantFor(x: number, y: number, count: number): number {
  return hash2(x, y) % count;
}
