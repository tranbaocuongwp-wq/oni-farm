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
  /* Bê tông sàn chuồng. Xám ngả VÀNG chứ không xám xanh như đường nhựa: hai
     mặt cứng cạnh nhau mà cùng tông thì cái chuồng đọc ra như một khúc đường
     cụt. Sáng hơn hẳn để nổi trên cỏ. */
  concrete: ["#9a958a", "#a29d92", "#928d83", "#a6a196"],
  asphaltDark: "#35353b",
  /** Mạch đổ giữa hai tấm bê tông — tối vừa đủ để thấy, không thành lưới kẻ. */
  concreteSeam: "#7f7a70",
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
  /**
   * Hình ELIP đặc. Nhận bán kính THỰC (số lẻ được) và tâm ở giữa pixel, nên
   * đủ mịn để dựng khối cơ thể: con vật là những khối bầu, không phải hình
   * chữ nhật. Đây là nét khác lớn nhất giữa "một cục màu" và "một con vật".
   */
  ell(cx: number, cy: number, rx: number, ry: number, color: string): void;
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
    ell(cx, cy, rx, ry, color) {
      const ax = Math.max(0.5, rx);
      const ay = Math.max(0.5, ry);
      for (let y = Math.floor(cy - ay); y <= Math.ceil(cy + ay); y++)
        for (let x = Math.floor(cx - ax); x <= Math.ceil(cx + ax); x++) {
          const dx = (x + 0.5 - cx) / ax;
          const dy = (y + 0.5 - cy) / ay;
          if (dx * dx + dy * dy <= 1) px(x, y, color);
        }
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

/**
 * BÊ TÔNG — sàn của các khu chuồng.
 *
 * Vẽ có MẠCH ĐỔ: một đường rãnh mờ chạy dọc và ngang, lệch pha theo biến thể
 * nên cả sàn ra hình các tấm bê tông đổ riêng chứ không phải một mảng xám
 * phẳng lì. Đó là thứ làm mắt đọc ra "mặt sàn nhân tạo" ngay lập tức, và tách
 * hẳn nó khỏi mặt đường nhựa cạnh đó.
 */
function makeConcrete(variant: number): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  const rnd = mulberry32(0x3b71 + variant * 40503);
  s.rect(0, 0, TILE, TILE, P.concrete[0]!);
  // lốm đốm hạt sỏi
  for (let i = 0; i < 40; i++)
    s.px(Math.floor(rnd() * TILE), Math.floor(rnd() * TILE), pick(P.concrete, rnd()));
  // mạch đổ: một dọc một ngang, vị trí đổi theo biến thể
  const mx = variant % 2 === 0 ? 0 : 8;
  const my = variant < 2 ? 0 : 8;
  s.vline(mx, 0, TILE, P.concreteSeam);
  s.hline(0, my, TILE, P.concreteSeam);
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

/** Giếng nước: thành đá tròn, mái che, nước xanh bên trong. */
/* ---------------------------------------------------------------------------
   ĐỊA HÌNH TỰ NHIÊN — cây, bụi, cỏ, đá, gỗ.

   Đây là thứ phủ kín bản đồ, nên nó quyết định "nông trại trông thế nào" nhiều
   hơn bất cứ sprite nào khác. Bản trước dựng tất cả bằng ĐĨA TRÒN + RẮC PIXEL
   NGẪU NHIÊN: `disc` cho tán, rồi một vòng lặp chấm bừa vài chục pixel sáng
   tối lên trên. Cách đó cho ra hình có nhiễu chứ không cho ra hình có KHỐI —
   nhìn xa là những cục tròn lốm đốm, và cây gỗ lớn với bụi rậm chỉ khác nhau
   ở đường kính.

   Bản này dựng theo ba luật, đúng ba luật đã dùng cho cây trồng và con vật:

   · CỤM, không phải đĩa. Tán lá là năm-sáu cụm chồng nhau, mỗi cụm vẽ VÀNH TỐI
     rồi mới vẽ RUỘT SÁNG, và vẽ từng cụm một. Vành tối của cụm sau cắt vào cụm
     trước, nên đường bao lởm chởm ra tán lá thay vì tròn ra quả bóng.
   · KHỐI, không phải nhiễu. Nắng đến từ trên-trái: mọi thứ đều có mặt sáng ở
     trên-trái và mặt tối ở dưới-phải. Đốm ngẫu nhiên chỉ dùng để phá đều, và
     luôn bám theo hướng sáng đó.
   · CẤU TRÚC riêng. Vỏ cây có thớ dọc, gốc cây có vòng năm, hòn đá có MẶT
     PHẲNG và cạnh gãy chứ không phải ba đĩa tròn chồng lên.
--------------------------------------------------------------------------- */

/** Một cụm lá: vành tối rồi ruột sáng. Vẽ từng cụm để cụm sau cắt vào cụm trước. */
function cumLa(
  s: Surface,
  cx: number,
  cy: number,
  r: number,
  giua: string,
  toi: string,
  sang?: string,
): void {
  s.ell(cx, cy, r, r * 0.92, toi);
  s.ell(cx, cy - 0.5, r - 0.85, r * 0.92 - 0.85, giua);
  if (sang) s.ell(cx - r * 0.3, cy - r * 0.38, Math.max(0.5, r * 0.36), Math.max(0.5, r * 0.26), sang);
}

/** Thớ vỏ cây: vệt dọc so le, tối bên phải vì nắng đến từ trên-trái. */
function voCay(s: Surface, x: number, y: number, w: number, h: number, mau: string, toi: string, sang: string) {
  s.rect(x, y, w, h, mau);
  s.vline(x, y, h, sang);
  s.vline(x + w - 1, y, h, toi);
  const rnd = mulberry32(0x8e21 + x * 31 + y);
  for (let i = 0; i < Math.round(h * 0.6); i++) {
    const px2 = x + 1 + Math.floor(rnd() * Math.max(1, w - 2));
    const py2 = y + Math.floor(rnd() * h);
    s.px(px2, py2, toi);
    if (rnd() > 0.6) s.px(px2, py2 + 1, toi);
  }
}

function makeTree(art: PropArt): HTMLCanvasElement {
  const s = surface(TILE, TILE * 2); // cây cao 2 ô, phần trên tràn lên ô phía trên
  const rnd = mulberry32(0x77ee);
  const baseY = TILE * 2;
  const toi = art.dark;
  const giua = art.body;
  const sang = lighten(art.body);

  s.shadow(8, baseY - 2, 6, 2.5);

  /* Thân: có BỜ RỄ loe ra ở gốc. Cái cột thẳng đứng cắm xuống đất là thứ đọc
     ra "cái cọc"; bờ rễ loe là thứ đọc ra "cái cây". */
  voCay(s, 6, baseY - 11, 4, 10, P.trunk, P.trunkDark, shade(P.trunk, 1.22));
  s.px(5, baseY - 2, P.trunk);
  s.px(5, baseY - 3, P.trunkDark);
  s.px(10, baseY - 2, P.trunk);
  s.px(10, baseY - 3, P.trunkDark);
  // một cành cụt chìa ra — phá thế đối xứng
  s.px(10, baseY - 9, P.trunk);
  s.px(11, baseY - 10, P.trunkDark);

  // Tán: sáu cụm, vẽ từ SAU ra TRƯỚC (cụm dưới trước, cụm trên sau)
  const cum: [number, number, number][] = [
    [4, baseY - 14, 4.6],
    [12, baseY - 14, 4.6],
    [8, baseY - 12, 4.8],
    [5, baseY - 18, 4.4],
    [11, baseY - 18, 4.4],
    [8, baseY - 20, 5.2],
  ];
  for (const [cx, cy, r] of cum) cumLa(s, cx, cy, r, giua, toi);
  // nắng phủ lên nửa trên-trái của cả tán
  for (const [cx, cy, r] of cum)
    if (cx <= 8 && cy <= baseY - 16) s.ell(cx - r * 0.25, cy - r * 0.35, r * 0.5, r * 0.34, sang);

  /* Vài LỖ THỦNG trong tán: chỗ thấy trời qua kẽ lá. Không có nó thì tán là
     một mảng đặc, và mảng đặc thì đọc ra là quả bóng chứ không ra vòm lá. */
  for (let i = 0; i < 5; i++) {
    const x = 3 + Math.floor(rnd() * 11);
    const y = baseY - 22 + Math.floor(rnd() * 12);
    s.px(x, y, toi);
    if (rnd() > 0.5) s.px(x + 1, y, toi);
  }
  // lấm tấm lá bắt nắng
  for (let i = 0; i < 14; i++) {
    const x = 2 + Math.floor(rnd() * 12);
    const y = baseY - 23 + Math.floor(rnd() * 13);
    if (s.g.getImageData(x, y, 1, 1).data[3]! === 0) continue;
    s.px(x, y, x + y < baseY - 12 ? sang : toi);
  }
  return outline(s, shade(art.dark, 0.6)).c;
}

/** Cây gỗ NHỎ: một ô, thân mảnh, tán ba cụm — chặt vài nhát là xong. */
function makeSapling(art: PropArt): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  const rnd = mulberry32(0x5a91);
  const toi = art.dark;
  const giua = art.body;
  const sang = lighten(art.body);
  s.shadow(8, 14, 4, 1.6);

  voCay(s, 7, 7, 2, 7, P.trunk, P.trunkDark, shade(P.trunk, 1.22));
  s.px(6, 13, P.trunkDark);
  s.px(9, 13, P.trunkDark);

  for (const [cx, cy, r] of [
    [5.5, 7, 3],
    [10.5, 7, 3],
    [8, 4.5, 3.6],
  ] as [number, number, number][])
    cumLa(s, cx, cy, r, giua, toi, cx <= 8 ? sang : undefined);

  for (let i = 0; i < 6; i++) {
    const x = 3 + Math.floor(rnd() * 10);
    const y = 1 + Math.floor(rnd() * 9);
    if (s.g.getImageData(x, y, 1, 1).data[3]! === 0) continue;
    s.px(x, y, x + y < 10 ? sang : toi);
  }
  return outline(s, shade(art.dark, 0.6)).c;
}

/** Gốc cây: mặt cắt có VÒNG NĂM — thứ duy nhất nói "cây này vừa bị chặt". */
function makeStump(art: PropArt): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  s.shadow(8, 14, 5, 1.8);
  // thân gốc
  voCay(s, 4, 8, 8, 5, art.body, art.dark, lighten(art.body));
  // bờ rễ toả ra bốn phía
  for (const [x, y] of [
    [3, 12],
    [12, 12],
    [4, 13],
    [11, 13],
  ] as [number, number][])
    s.px(x, y, art.dark);
  /* Mặt cắt: gỗ TƯƠI nên sáng hơn hẳn vỏ — đó là thứ nói "vừa bị chặt". Lấy
     đúng `accent` của content thì nó chỉ nhạt hơn vỏ một nấc và cả cái gốc ra
     một khối nâu trơn. */
  const mat = shade(art.accent, 1.3);
  s.ell(8, 8, 4.4, 2.3, art.dark);
  s.ell(8, 8, 3.9, 1.9, mat);
  s.ell(8, 8, 2.8, 1.3, shade(mat, 0.86));
  s.ell(8, 8, 1.7, 0.8, mat);
  s.ell(8, 8, 0.7, 0.5, shade(mat, 0.7));
  // một vết nứt từ tâm ra mép — gỗ khô nào cũng có
  s.px(10, 7, shade(mat, 0.66));
  s.px(11, 7, shade(mat, 0.66));
  return outline(s, shade(art.dark, 0.65)).c;
}

function makeLog(art: PropArt): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  s.shadow(8, 14, 6, 1.8);
  // thân nằm ngang: nắng trên, bóng dưới, thớ vỏ chạy dọc
  s.rect(2, 7, 12, 6, art.body);
  s.hline(2, 7, 12, lighten(art.body));
  s.hline(2, 12, 12, art.dark);
  const rnd = mulberry32(0x4c19);
  for (let i = 0; i < 8; i++) {
    const x = 3 + Math.floor(rnd() * 10);
    const y = 8 + Math.floor(rnd() * 4);
    s.px(x, y, art.dark);
    if (rnd() > 0.5) s.px(x + 1, y, art.dark);
  }
  // hai đầu: mặt cắt có vòng năm, đầu gần sáng hơn đầu xa
  s.ell(2, 10, 1.6, 3, art.dark);
  s.ell(2, 10, 1, 2.2, art.accent);
  s.ell(13.5, 10, 1.8, 3.1, art.accent);
  s.ell(13.5, 10, 1.1, 2.1, lighten(art.accent));
  s.px(14, 10, art.dark);
  return outline(s, shade(art.dark, 0.65)).c;
}

/** Tảng đá: MẶT PHẲNG và cạnh gãy, không phải ba đĩa tròn chồng lên nhau. */
function makeRock(art: PropArt): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  s.shadow(8, 14, 5.5, 2);
  const sang = art.accent;
  const giua = art.body;
  const toi = art.dark;

  /* Ba MẶT, dựng bằng cách quét từng hàng: mặt trên hứng nắng, mặt trái mờ,
     mặt phải trong bóng. Cạnh giữa hai mặt là một đường gãy thẳng — đó là thứ
     làm hòn đá ra đá chứ không ra cục bột. */
  for (let y = 4; y <= 13; y++) {
    const u = (y - 4) / 9;
    const w = Math.round(3 + u * 4.2); // nở dần xuống chân
    for (let x = 8 - w; x <= 8 + w; x++) {
      const canh = x - (8 - w);
      s.px(x, y, canh < w * 0.75 ? giua : toi);
    }
  }
  // mặt trên: mảng sáng phẳng có cạnh gãy
  for (let y = 4; y <= 8; y++) {
    const w = Math.round(2 + (y - 4) * 0.7);
    for (let x = 7 - w; x <= 7 + Math.round(w * 0.35); x++) s.px(x, y, sang);
  }
  // đường gãy chạy chéo
  for (let i = 0; i < 4; i++) s.px(9 + i, 8 + i, toi);
  s.px(6, 11, toi);
  s.px(7, 12, toi);
  // đốm sáng nhất ở mép trên-trái
  s.px(5, 5, "#ffffff");
  // vài viên nhỏ dưới chân cho hòn đá có chỗ đứng
  s.px(2, 13, giua);
  s.px(3, 13, sang);
  s.px(13, 13, toi);
  return outline(s).c;
}

/** Bụi có QUẢ MỌNG: tán cụm + vài quả đỏ nấp trong lá. */
function makeBush(art: PropArt): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  const rnd = mulberry32(0x51b1);
  s.shadow(8, 14, 6, 2);
  const cum: [number, number, number][] = [
    [4.5, 10.5, 3.6],
    [11.5, 10.5, 3.6],
    [8, 8, 4.2],
    [6, 12, 3],
    [10.5, 12.5, 3],
  ];
  for (const [cx, cy, r] of cum) cumLa(s, cx, cy, r, art.body, art.dark, cx <= 8 ? art.accent : undefined);
  for (let i = 0; i < 4; i++) {
    const x = 4 + Math.floor(rnd() * 9);
    const y = 7 + Math.floor(rnd() * 6);
    if (s.g.getImageData(x, y, 1, 1).data[3]! === 0) continue;
    s.px(x, y, "#c9364f");
    s.px(x, y - 1, "#e0507a");
  }
  return outline(s, shade(art.dark, 0.6)).c;
}

function makeBushSmall(art: PropArt): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  s.shadow(8, 14, 4, 1.5);
  cumLa(s, 6, 11, 2.8, art.body, art.dark, art.accent);
  cumLa(s, 10, 11.5, 2.6, art.body, art.dark);
  cumLa(s, 8, 9, 2.8, art.body, art.dark, art.accent);
  return outline(s, shade(art.dark, 0.6)).c;
}

function makeBushBig(art: PropArt): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  const rnd = mulberry32(0x77c3);
  s.shadow(8, 14, 6.5, 2);
  const cum: [number, number, number][] = [
    [4, 10, 4],
    [12, 10, 4],
    [8, 11.5, 4],
    [5.5, 6.5, 3.6],
    [10.5, 7, 3.6],
    [8, 5, 3.4],
  ];
  for (const [cx, cy, r] of cum) cumLa(s, cx, cy, r, art.body, art.dark, cx <= 8 && cy <= 8 ? art.accent : undefined);
  for (let i = 0; i < 8; i++) {
    const x = 2 + Math.floor(rnd() * 12);
    const y = 3 + Math.floor(rnd() * 10);
    if (s.g.getImageData(x, y, 1, 1).data[3]! === 0) continue;
    s.px(x, y, x + y < 13 ? art.accent : art.dark);
  }
  return outline(s, shade(art.dark, 0.6)).c;
}

/**
 * Vạt cỏ. KHÔNG viền: cỏ là nền mềm, viền đen sẽ thành mảng bẩn trên bãi cỏ.
 *
 * Mỗi lá cỏ là một SỢI hai pixel — một sáng một tối — nên dù cắm dày tới đâu
 * hai lá kề nhau vẫn tách được. Bản trước vẽ lá cỏ bằng một cột pixel đơn sắc,
 * và một vạt cỏ dày ra một mảng xanh đặc.
 */
function makeGrassProp(art: PropArt, tall: boolean): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  const rnd = mulberry32(tall ? 0x6a2d : 0x3c19);
  const n = tall ? 9 : 6;
  const goc = 14;
  for (let i = 0; i < n; i++) {
    const x = 2 + Math.round((i / Math.max(1, n - 1)) * 11) + (rnd() > 0.5 ? 1 : 0);
    const h = (tall ? 6 : 3.5) + rnd() * 3;
    const lean = (rnd() - 0.5) * (tall ? 3.4 : 2);
    soi(s, x, goc, x + lean, goc - h, rnd() > 0.45 ? art.body : art.accent, art.dark);
  }
  // cỏ dày có bông cỏ chín: hạt nhạt ở đầu vài lá
  if (tall)
    for (let i = 0; i < 3; i++) {
      const x = 3 + Math.floor(rnd() * 10);
      const y = 5 + Math.floor(rnd() * 3);
      s.px(x, y, "#d8d08a");
      s.px(x, y + 1, "#b8ae6a");
    }
  return s.c;
}

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

/**
 * BIỂN CẮM khu. Một tấm ván nhỏ trên cọc, cao chưa tới nửa ô.
 *
 * Cố ý VẼ TRỐNG — chữ trên biển không nằm trong sprite. Tên khu là chữ VIỆT có
 * dấu và dài ngắn khác nhau ("Lô A1" cạnh "Khu gia cầm"), nhét vào một tấm ván
 * 10×5 pixel thì hoặc là không đọc được, hoặc là phải vẽ tay từng bộ chữ cho
 * từng cái tên. Chữ vì thế do `drawSignLabels` in ra ở lớp trên, theo phông của
 * trang; tấm ván ở đây chỉ để mắt biết CÓ một cái biển cắm ở đó.
 */
function makeSign(art: PropArt): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  /* NẰM SÁT GÓC TRÊN-TRÁI của ô, không đứng giữa.
     Ô mang biển là một ô LỐI ĐI, và lối đi ở đây rộng đúng một ô — một tấm
     biển to đùng giữa ô thì nhìn ra là "cái biển cắm giữa đường" chứ không ra
     "cái biển đánh dấu góc lô". Nên cả cái cọc lẫn tấm ván gói trong 9×9 pixel
     ở góc, chừa hẳn phần dưới-phải của ô cho mặt lối đi hiện ra. `draw.ts` lật
     nó sang góc khác theo `side` của từng tấm biển. */
  s.shadow(4, 10, 5, 1.2);
  s.rect(3, 6, 2, 4, art.dark);          // cọc, ngắn
  s.px(3, 6, art.accent);
  s.rect(0, 1, 9, 6, art.dark);          // viền tấm ván
  s.rect(1, 2, 7, 4, art.body);
  s.hline(1, 2, 7, art.accent);          // mặt trên ăn nắng
  s.hline(1, 5, 7, art.dark);
  return outline(s).c;
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
    case "sign": return makeSign(art);
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

/* ---------------------------------------------------------------------------
   CÂY TRỒNG.

   Bản trước vẽ cây bằng ĐĨA TRÒN và VỆT THẲNG: một `disc` cho tán, vài `px`
   xếp hàng cho lá, một chấm trắng cho bóng sáng, rồi viền đen quanh tất cả. Ở
   cỡ 16×24 thì cái gì cũng ra một hình hình học đối xứng dán trên nền đất, và
   mười một dáng cây chỉ khác nhau ở đường bao.

   Bản này đổi ba thứ, và cả ba đều là chuyện KHỐI chứ không phải chuyện thêm
   chi tiết:

   · VIỀN THEO MÀU CÂY, không phải màu đen. Viền đen tuyền biến mọi thứ thành
     hình dán. Viền bằng chính màu lá tối đi hai nấc thì cái cây vẫn tách khỏi
     nền mà không thành sticker — đây là thay đổi một dòng có tác dụng lớn nhất
     trong cả file này.
   · LÁ LÀ HÌNH GIỌT NƯỚC, có gân. Phình ở giữa, thon về ngọn, gân sáng chạy
     dọc. Một vệt thẳng đều đọc ra "một nét vẽ"; hình giọt nước đọc ra "cái lá".
   · QUẢ CÓ KHỐI. Ba tông đồng tâm lệch nhau, cộng cái cuống. Đĩa tròn một màu
     với một chấm trắng ở góc đọc ra "hình tròn tô màu".

   Và mọi cây đều có BÓNG TIẾP ĐẤT: cây mọc TỪ đất, không phải nằm trên đất.
--------------------------------------------------------------------------- */

/** Tham số chung mọi dáng cây dùng. `t` là độ lớn 0..1, `ripe` là đã chín. */
interface FormCtx {
  s: Surface;
  a: CropArt;
  t: number;
  ripe: boolean;
  baseY: number;
  rnd: () => number;
}

/** Bóng tiếp đất — cái làm cây "đứng trên" đất chứ không "dán lên" đất. */
function chanDat(s: Surface, baseY: number, r: number): void {
  s.shadow(8, baseY + 1, Math.max(1.6, r), 1.1);
}

/**
 * Một chiếc LÁ hình giọt nước: từ gốc (x0,y0) vươn tới ngọn (x1,y1).
 *
 * Bề ngang phình ở khoảng 40% chiều dài rồi thon về ngọn. Mép dưới tối một
 * nấc, gân giữa sáng một nấc — đủ để cái lá có mặt trên và mặt dưới, tức là
 * có hướng, tức là mắt đọc ra nó nằm trong không gian chứ không nằm phẳng.
 */
function la(
  s: Surface,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  day: number,
  mau: string,
  toi: string,
  gan?: string,
): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const n = Math.max(2, Math.round(len));
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const cx = x0 + dx * u;
    const cy = y0 + dy * u;
    const r = day * Math.sin(Math.PI * (0.16 + 0.84 * u));
    /* Mép tối ở CẢ HAI bên, không phải một bên. Đây là chỗ bản trước hỏng:
       hai chiếc lá vẽ cạnh nhau, mỗi chiếc chỉ tối một mép, thì mép sáng của
       chiếc này dính liền vào ruột chiếc kia và cả túm lá gộp thành một mảng
       đặc. Một pixel tối chen giữa là đủ để mắt tách chúng ra. */
    /* Bề dày mép tối phải THEO bề ngang lá. Lấy một hằng số 0,85 px thì lá
       mảnh (r ≈ 1) hoá ra TỐI HẾT — cả túm lá thành một mảng đen, đúng cái vừa
       xảy ra với cây rau thơm và bụi lúa. Lấy nửa bề ngang thì lá nào cũng còn
       một lõi sáng, mà hai lá kề nhau vẫn có đường ngăn. */
    const mep = Math.max(r - 0.85, r * 0.5);
    for (let k = -r; k <= r; k += 0.5) {
      s.px(Math.round(cx + nx * k), Math.round(cy + ny * k), Math.abs(k) >= mep ? toi : mau);
    }
  }
  if (gan)
    for (let i = 1; i < n; i++) {
      const u = i / n;
      s.px(Math.round(x0 + dx * u), Math.round(y0 + dy * u), gan);
    }
}

/**
 * Một SỢI lá mảnh: nét sáng 1px, kèm một nét TỐI áp sát phía gốc.
 *
 * Vì sao cần cái này bên cạnh `la()`: `la()` vẽ hình giọt nước có bề ngang,
 * hợp với lá to (cải, dưa, bí). Lá MẢNH — hành, lúa, cà rốt — thì bề ngang chỉ
 * còn một pixel, mà một pixel thì không chứa nổi cả lõi sáng lẫn hai mép tối;
 * kết quả là cả túm lá gộp thành một mảng đặc. Sợi giải bài toán ấy bằng cách
 * cho mỗi lá ĐÚNG hai pixel: một tối một sáng. Hai sợi kề nhau vì thế luôn có
 * một đường ngăn, dù có chen sát tới đâu.
 */
function soi(
  s: Surface,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  mau: string,
  toi: string,
): void {
  const n = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0)));
  const d = x1 >= x0 ? -1 : 1; // nét tối nằm phía trong búi
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const x = Math.round(x0 + (x1 - x0) * u);
    const y = Math.round(y0 + (y1 - y0) * u);
    s.px(x + d, y, toi);
    s.px(x, y, mau);
  }
}

/** Quả: ba tông đồng tâm lệch nhau + cuống. Có khối, không phải đĩa tròn. */
function qua(s: Surface, a: CropArt, cx: number, cy: number, r: number, cuong = true): void {
  s.ell(cx, cy, r, r, a.fruitDark);
  s.ell(cx, cy - 0.35, Math.max(0.6, r - 0.7), Math.max(0.6, r - 0.7), a.fruit);
  s.ell(
    cx - r * 0.32,
    cy - r * 0.34,
    Math.max(0.5, r * 0.4),
    Math.max(0.5, r * 0.3),
    lighten(a.fruit),
  );
  if (cuong) s.px(Math.round(cx), Math.round(cy - r), a.stem);
}

/** Thân: cột dọc, mép trái ăn nắng. */
function than(s: Surface, a: CropArt, x: number, yTop: number, yBot: number, day = 1): void {
  for (let y = yTop; y <= yBot; y++) {
    s.hline(x, y, day, a.stem);
    if (day > 1) s.px(x, y, lighten(a.stem));
    else if (y % 2 === 0) s.px(x, y, lighten(a.stem));
  }
}

function makeCrop(def: CropDef, stage: number): HTMLCanvasElement {
  const s = surface(TILE, CROP_H);
  const a = def.art;
  const maxStage = def.growthDays.length;
  const t = maxStage === 0 ? 1 : stage / maxStage;
  const ripe = stage >= maxStage;
  const baseY = CROP_H - 3;
  const rnd = mulberry32(hash2(def.id.length, stage, 0x3a1));

  if (stage === 0) {
    /* Mầm mới nhú: hai lá mầm bé xoè sang hai bên trên một cọng mảnh. Đây là
       hình người trồng cây nào cũng nhận ra ngay, và nó phải KHÁC HẲN giai
       đoạn sau — đó là thông tin "vừa gieo, còn lâu mới thu". */
    chanDat(s, baseY, 2);
    than(s, a, 8, baseY - 2, baseY);
    /* Vẽ TAY từng pixel chứ không gọi `la()`: ở cỡ hai lá mầm thì mọi phép
       hình học đều tròn về cùng một cụm pixel, và hai chiếc lá dính thành một
       cái nêm. Bốn pixel đặt tay đọc ra hình chữ V ngay. */
    for (const k of [-1, 1]) {
      s.px(8 + k, baseY - 3, a.leafDark);
      s.px(8 + k * 2, baseY - 3, a.leaf);
      s.px(8 + k * 2, baseY - 4, a.leafDark);
      s.px(8 + k * 3, baseY - 4, lighten(a.leaf));
    }
    return outline(s, shade(a.leafDark, 0.58)).c;
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
  /* Viền bằng chính màu lá tối đi, không phải màu đen: cây cỏ không có đường
     bao đen: viền đen tuyền làm cái cây thành hình dán trên nền đất. */
  return outline(s, shade(a.leafDark, 0.58)).c;
}

/* --- head: BẮP cuộn ôm sát đất — bắp cải, xà lách, cải thìa ---------------
   Tách khỏi `leafy` vì mười bảy loại rau lá vẽ chung một dáng thì ra mười bảy
   bụi xanh giống hệt nhau. Bắp cuộn có bóng dáng khác hẳn túm lá xoè. */
function drawHead({ s, a, t, ripe, baseY, rnd }: FormCtx) {
  const r = Math.max(2, (a.fruitSize + a.spread) * 0.3 * (0.5 + 0.5 * t));
  const wing = r + Math.max(1, a.spread * 0.42 * t);
  chanDat(s, baseY, wing);

  // lá ngoài: bốn chiếc bò sát đất, toả ra hai bên
  for (const k of [-1, 1]) {
    la(s, 8, baseY - 1, 8 + k * wing, baseY - 1, 1.5, a.leafDark, shade(a.leafDark, 0.8));
    la(s, 8, baseY - 1, 8 + k * wing * 0.72, baseY - r * 0.9, 1.6, a.leaf, a.leafDark);
  }

  // bắp: khối cầu cuộn, sáng chếch trên-trái
  const cy = baseY - r * 0.9;
  const mau = ripe ? a.fruit : a.leaf;
  const toi = ripe ? a.fruitDark : a.leafDark;
  s.ell(8, cy, r, r * 0.94, toi);
  s.ell(8, cy - 0.5, r - 0.8, r * 0.94 - 0.8, mau);
  s.ell(8 - r * 0.3, cy - r * 0.34, r * 0.42, r * 0.3, lighten(mau));
  /* Gân cuộn: hai vòng cung ôm theo bắp. Đây là thứ phân biệt "bắp cải" với
     "một quả bóng màu xanh" — lá cuộn thì có nếp. */
  for (const g of [0.45, 0.8]) {
    for (let x = -r * g; x <= r * g; x += 0.5) {
      const y = cy - Math.sqrt(Math.max(0, (r * g) ** 2 - x * x)) * 0.9;
      s.px(Math.round(8 + x), Math.round(y), toi);
      s.px(Math.round(8 + x), Math.round(y) + 1, lighten(mau));
    }
  }
  if (rnd() > 0.5) s.px(8, Math.round(cy - r), a.stem);
}

/* --- herb: BÚI LÁ MẢNH dựng đứng — hành lá, hẹ, sả, húng ------------------
   Không có quả: người ta ăn chính cái lá. Dáng phải mảnh và cao, đọc ra ngay
   là "rau thơm" chứ không phải "bụi rau". */
function drawHerb({ s, a, t, baseY, rnd }: FormCtx) {
  const h = Math.max(3, (a.height + 4) * (0.42 + 0.58 * t));
  /* ÍT cọng và MẢNH: cả chục cọng dày mọc từ cùng một điểm thì dính thành một
     mảng đặc, và cây rau thơm đọc ra thành một cục màu. Bảy cọng là trần. */
  const n = Math.max(3, Math.min(5, Math.round((a.leaves * 0.5 + 1) * (0.5 + 0.5 * t))));
  chanDat(s, baseY, 2 + a.spread * 0.3);
  for (let i = 0; i < n; i++) {
    const frac = n === 1 ? 0.5 : i / (n - 1);
    const nghieng = (frac - 0.5) * 2; // −1..1
    const cao = h * (0.6 + 0.4 * (1 - Math.abs(nghieng)));
    /* Gốc mỗi cọng LỆCH NHAU: cả chục cọng mọc từ đúng một pixel thì phần
       gốc chồng lên nhau thành một mảng đặc, và cái búi mất hết đường ngăn. */
    soi(
      s,
      8 + nghieng * 1.2,
      baseY,
      8 + nghieng * (a.spread * 0.85 + 1.4),
      baseY - cao,
      i % 2 ? a.leaf : lighten(a.leaf),
      a.leafDark,
    );
  }
  // gốc bó lại: vài pixel thân sáng ở chân búi
  than(s, a, 8, Math.round(baseY - 1), baseY);
  if (rnd() > 0.6) s.px(7, baseY, a.stem);
}

/* --- bulb: CỦ nằm ngay mặt đất, lá ống dựng lên — hành tây, tỏi ----------- */
function drawBulb({ s, a, t, ripe, baseY }: FormCtx) {
  const r = Math.max(2, a.fruitSize * 0.45 * (0.5 + 0.5 * t));
  const h = Math.max(4, (a.height + 3) * (0.45 + 0.55 * t));
  chanDat(s, baseY, r + 1);

  // lá ống: ba cọng rỗng vươn thẳng, hơi loe
  for (const k of [-1, 0, 1]) {
    soi(s, 8 + k * 1.2, baseY - r * 0.4, 8 + k * 2.6, baseY - h, a.leaf, a.leafDark);
    if (k !== 0) soi(s, 8 + k * 1.9, baseY - r * 0.4, 8 + k * 3.6, baseY - h * 0.75, lighten(a.leaf), a.leafDark);
  }

  if (ripe || t > 0.6) {
    // củ: khối cầu hơi dẹt, có VẰN dọc — vằn là thứ đọc ra "củ hành"
    const cy = baseY - r * 0.55;
    s.ell(8, cy, r, r * 1.02, a.fruitDark);
    s.ell(8, cy - 0.4, r - 0.8, r * 1.02 - 0.8, a.fruit);
    s.ell(8 - r * 0.3, cy - r * 0.3, r * 0.4, r * 0.32, lighten(a.fruit));
    for (const k of [-0.55, 0.05, 0.6])
      for (let y = -r * 0.8; y <= r * 0.7; y += 1)
        s.px(Math.round(8 + k * r + y * k * 0.12), Math.round(cy + y), a.fruitDark);
    // rễ chùm
    s.px(7, baseY, shade(a.fruitDark, 0.8));
    s.px(9, baseY, shade(a.fruitDark, 0.8));
  }
}

/* --- melon: DÂY BÒ mặt đất, một quả to — dưa hấu, bí đỏ ------------------- */
function drawMelon({ s, a, t, ripe, baseY, rnd }: FormCtx) {
  const spread = Math.max(2, a.spread * (0.6 + 0.4 * t));
  chanDat(s, baseY, spread + 1);

  // dây bò ngang, lá to hình thuỳ nằm sát đất
  for (const k of [-1, 1]) {
    s.hline(Math.round(8 + (k < 0 ? -spread : 1)), baseY - 1, Math.round(spread), a.stem);
    la(s, 8 + k * 1.5, baseY - 1, 8 + k * spread, baseY - 2 - spread * 0.45, 1.5, a.leaf, a.leafDark, lighten(a.leaf));
  }
  la(s, 8, baseY - 2, 8 - 1, baseY - 3 - spread * 0.7, 1.3, a.leaf, a.leafDark, lighten(a.leaf));

  const r = Math.max(2, a.fruitSize * 0.5 * (ripe ? 1 : 0.45 + 0.4 * t));
  if (t > 0.35 || ripe) {
    const cy = baseY - r * 0.85;
    s.ell(8, cy, r * 1.05, r, a.fruitDark);
    s.ell(8, cy - 0.4, r * 1.05 - 0.8, r - 0.8, a.fruit);
    s.ell(8 - r * 0.34, cy - r * 0.36, r * 0.42, r * 0.3, lighten(a.fruit));
    /* SỌC theo múi: hai đường cong ôm quả. Quả dưa không sọc thì ở cỡ này nó
       chỉ là một quả bóng — sọc là thứ duy nhất nói nó là quả dưa. */
    if (r >= 3)
      for (const g of [-0.45, 0.45]) {
        for (let y = -r * 0.85; y <= r * 0.85; y += 1) {
          const x = g * r * Math.sqrt(Math.max(0, 1 - (y / (r * 0.95)) ** 2)) * 1.15;
          s.px(Math.round(8 + x), Math.round(cy + y), a.fruitDark);
        }
      }
    if (rnd() > 0.4) s.px(8, Math.round(cy - r), a.stem);
  }
}

/* --- leafy: THÂN ĐỨNG, lá so le hai bên — cải, rau muống ------------------ */
function drawLeafy({ s, a, t, ripe, baseY, rnd }: FormCtx) {
  const h = Math.max(3, a.height * (0.4 + 0.6 * t));
  const spread = Math.max(1.5, a.spread * (0.45 + 0.55 * t));
  const n = Math.max(3, Math.round(a.leaves * (0.45 + 0.55 * t)));
  chanDat(s, baseY, spread * 0.8);

  than(s, a, 8, Math.round(baseY - h), baseY);

  for (let i = 0; i < n; i++) {
    const frac = i / Math.max(1, n - 1);
    const y = baseY - 1 - frac * (h - 1);
    const k = i % 2 === 0 ? -1 : 1;
    /* Lá dưới DÀI hơn lá trên: cây mọc từ dưới lên nên lá gốc già và to nhất.
       Đảo lại là ra hình cái chổi ngược, đọc thấy sai ngay dù khó gọi tên. */
    const len = spread * (1 - 0.42 * frac);
    la(
      s,
      8,
      y,
      8 + k * len,
      y - len * 0.55,
      1.35,
      i % 2 ? a.leaf : lighten(a.leaf),
      a.leafDark,
      lighten(a.leaf),
    );
  }

  if (ripe && a.fruitCount > 0) {
    const r = Math.max(1, a.fruitSize * 0.42);
    for (let i = 0; i < a.fruitCount; i++) {
      const ang = (i / Math.max(1, a.fruitCount)) * Math.PI * 2 + 0.6;
      const cx = 8 + Math.cos(ang) * (a.fruitCount === 1 ? 0 : spread * 0.55);
      const cy = baseY - h * (a.fruitCount === 1 ? 0.5 : 0.35 + 0.4 * Math.abs(Math.sin(ang)));
      qua(s, a, cx, cy, r);
    }
    if (rnd() > 0.8) s.px(8, Math.round(baseY - h), a.leafDark);
  }
}

/* --- root: TÚM LÁ XẺ, chín thì nhô vai củ khỏi mặt đất — cà rốt, củ cải --- */
function drawRoot({ s, a, t, ripe, baseY, rnd }: FormCtx) {
  const h = Math.max(3, a.height * (0.45 + 0.55 * t));
  const spread = Math.max(2, a.spread * (0.5 + 0.5 * t));
  chanDat(s, baseY, spread * 0.8);

  /* Vai củ ló lên khỏi mặt đất khi chín — đó là tín hiệu "nhổ được rồi", và nó
     phải nằm DƯỚI túm lá nên vẽ trước. */
  if (ripe) {
    const r = Math.max(2, a.fruitSize * 0.52);
    s.ell(8, baseY, r, r * 0.85, a.fruitDark);
    s.ell(8, baseY - 0.4, r - 0.7, r * 0.85 - 0.6, a.fruit);
    s.ell(8 - r * 0.3, baseY - r * 0.3, r * 0.38, r * 0.26, lighten(a.fruit));
    // đất vun quanh vai củ: không có nó thì củ trông như quả đặt trên nền
    s.px(Math.round(8 - r - 1), baseY + 1, P.soilEdge);
    s.px(Math.round(8 + r + 1), baseY + 1, P.soilEdge);
  }

  // túm lá: xoè hình quạt, lá giữa cao nhất, mỗi lá có gân
  const n = Math.max(3, Math.round(a.leaves * (0.5 + 0.5 * t)));
  for (let i = 0; i < n; i++) {
    const frac = n === 1 ? 0.5 : i / (n - 1);
    const nghieng = (frac - 0.5) * 2;
    const cao = h * (0.55 + 0.45 * (1 - Math.abs(nghieng)));
    soi(
      s,
      8 + nghieng * 1.1,
      baseY - 1,
      8 + nghieng * spread,
      baseY - 1 - cao,
      i % 2 ? a.leaf : lighten(a.leaf),
      a.leafDark,
    );
  }
  if (rnd() > 0.7) s.px(8, Math.round(baseY - h - 1), a.leaf);
}

/* --- vine: DÂY LEO ngang, quả treo bên dưới — dưa leo, đậu đũa ------------ */
function drawVine({ s, a, t, ripe, baseY }: FormCtx) {
  const spread = Math.max(3, a.spread * (0.6 + 0.4 * t));
  const h = Math.max(3, a.height * (0.4 + 0.6 * t));
  chanDat(s, baseY, spread * 0.9);

  // thân leo: cong lên rồi vắt ngang
  than(s, a, 8, Math.round(baseY - h), baseY);
  const yNgang = Math.round(baseY - h);
  s.hline(Math.round(8 - spread), yNgang, Math.round(spread * 2), a.stem);

  // tua cuốn: một móc xoắn ở mỗi đầu, thấp thôi — cao quá thành cái ăng-ten
  for (const k of [-1, 1]) {
    const x = Math.round(8 + k * spread);
    s.px(x, yNgang - 1, a.leafDark);
    s.px(x + k, yNgang - 2, a.leafDark);
  }

  // lá to mọc trên giàn
  const n = Math.max(2, Math.round(a.leaves * 0.5 * (0.5 + 0.5 * t)));
  for (let i = 0; i < n; i++) {
    const k = i % 2 === 0 ? -1 : 1;
    const x = 8 + k * spread * (0.35 + 0.6 * (i / Math.max(1, n)));
    la(s, x, yNgang, x + k * 1.4, yNgang - 3, 1.2, a.leaf, a.leafDark, lighten(a.leaf));
  }

  // quả TREO xuống từ giàn — đó là cả cái ý của giàn leo
  if (t > 0.55 || ripe) {
    /* Quả TREO xuống từ giàn — cả cái ý của giàn leo nằm ở đây, nên nó phải
       THẤY ĐƯỢC: quả to hơn, và lúc chưa chín thì xanh đậm hơn lá chứ không
       cùng màu lá (cùng màu thì nó biến mất trong tán). */
    const mau = ripe ? a.fruit : shade(a.leaf, 0.72);
    const toi = shade(ripe ? a.fruitDark : a.leafDark, 0.55);
    const r = Math.max(1.3, a.fruitSize * 0.5);
    const dai = Math.max(4, a.fruitSize * 1.3 * (ripe ? 1 : 0.7));
    const n2 = Math.max(1, Math.min(3, a.fruitCount));
    for (let i = 0; i < n2; i++) {
      const k = n2 === 1 ? 0 : (i / (n2 - 1) - 0.5) * 1.15;
      const x = 8 + k * spread;
      for (let y = 0; y < dai; y++) {
        const rr = r * Math.sin(Math.PI * (0.3 + 0.7 * (y / dai)));
        const yy = yNgang + 1 + y;
        s.hline(Math.round(x - rr), yy, Math.max(1, Math.round(rr * 2 + 1)), mau);
        // vành tối CẢ HAI bên: quả treo giữa tán lá cùng màu thì không có vành
        // tối là nó biến mất trong tán, đúng như quả dưa leo vừa rồi.
        s.px(Math.round(x + rr), yy, toi);
        s.px(Math.round(x - rr), yy, toi);
        if (rr > 1) s.px(Math.round(x - rr + 1), yy, lighten(mau));
      }
      s.px(Math.round(x), yNgang + 1, a.stem);
    }
  }
}

/* --- stalk: THÂN CỨNG CAO, lá dài cong — ngô, mía --------------------------- */
function drawStalk({ s, a, t, ripe, baseY, rnd }: FormCtx) {
  const h = Math.max(4, (a.height + 2) * (0.45 + 0.55 * t));
  const spread = Math.max(2, a.spread * (0.5 + 0.5 * t));
  chanDat(s, baseY, spread * 0.6);

  // thân dày 2px có đốt
  than(s, a, 7, Math.round(baseY - h), baseY, 2);
  for (let y = Math.round(baseY - h) + 2; y < baseY; y += 3) s.hline(7, y, 2, shade(a.stem, 0.75));

  // lá DÀI CONG rủ xuống, so le hai bên — dáng đặc trưng của cây ngô
  const n = Math.max(2, Math.min(5, Math.round(a.leaves * 0.5 * (0.4 + 0.6 * t))));
  for (let i = 0; i < n; i++) {
    const frac = i / Math.max(1, n - 1);
    const y = baseY - 1 - frac * (h - 2);
    const k = i % 2 === 0 ? -1 : 1;
    const len = spread * (1.05 - 0.35 * frac);
    // vẽ hai đoạn: vươn lên rồi rủ xuống, thành hình cung
    const mx = 8 + k * len * 0.6;
    const my = y - len * 0.5;
    la(s, 8, y, mx, my, 0.85, a.leaf, a.leafDark, lighten(a.leaf));
    la(s, mx, my, 8 + k * len, y - len * 0.1, 0.7, a.leaf, a.leafDark);
  }

  // BÔNG CỜ trên ngọn
  if (t > 0.7 || ripe) {
    const yy = Math.round(baseY - h);
    for (const k of [-1, 0, 1]) s.vline(8 + k, yy - 2, 2, a.leafDark);
  }

  // BẮP: ôm sát thân, có râu — chỉ hiện khi chín
  if (ripe) {
    const r = Math.max(1.4, a.fruitSize * 0.34);
    const cy = baseY - h * 0.45;
    for (let i = 0; i < Math.min(2, a.fruitCount); i++) {
      const k = i === 0 ? 1 : -1;
      const cx = 8 + k * (r + 0.5);
      s.ell(cx, cy, r, r * 1.5, a.fruitDark);
      s.ell(cx, cy - 0.4, r - 0.6, r * 1.5 - 0.8, a.fruit);
      s.ell(cx - r * 0.3, cy - r * 0.6, r * 0.35, r * 0.5, lighten(a.fruit));
      // râu ngô
      s.px(Math.round(cx), Math.round(cy - r * 1.5) - 1, "#d9b96a");
      s.px(Math.round(cx + k), Math.round(cy - r * 1.5) - 2, "#d9b96a");
      if (rnd() > 0.5) s.px(Math.round(cx - k), Math.round(cy - r * 1.5) - 1, "#d9b96a");
    }
  }
}

/* --- bush: BỤI TÁN TRÒN, quả nấp trong tán — cà chua, ớt, đậu ------------- */
function drawBush({ s, a, t, ripe, baseY, rnd }: FormCtx) {
  const r = Math.max(2.4, (a.spread + a.height * 0.55) * 0.46 * (0.5 + 0.5 * t));
  const cy = baseY - r * 0.85;
  chanDat(s, baseY, r);

  than(s, a, 8, Math.round(cy), baseY);

  /* Tán dựng bằng NĂM CỤM lá chồng nhau, không phải một đĩa tròn: đường bao
     lởm chởm mới đọc ra là tán lá, đường bao tròn trơn đọc ra là quả bóng. */
  const cum: [number, number, number][] = [
    [0, -r * 0.55, r * 0.62],
    [-r * 0.62, -r * 0.1, r * 0.58],
    [r * 0.62, -r * 0.1, r * 0.58],
    [-r * 0.34, r * 0.45, r * 0.5],
    [r * 0.34, r * 0.45, r * 0.5],
  ];
  /* Vẽ TỪNG cụm một — tối rồi mới sáng — chứ không phải tối hết rồi sáng hết.
     Vẽ theo lớp thì lớp sáng lấp mất mọi đường ngăn giữa các cụm, và năm cụm
     gộp lại thành đúng một khối lồi. Vẽ từng cụm thì vành tối của cụm sau cắt
     vào cụm trước, và đường bao mới lởm chởm ra tán lá. */
  for (const [dx, dy, rr] of cum) {
    s.ell(8 + dx, cy + dy, rr, rr * 0.92, a.leafDark);
    s.ell(8 + dx, cy + dy - 0.6, rr - 0.8, rr * 0.92 - 0.8, a.leaf);
  }
  s.ell(8 - r * 0.35, cy - r * 0.5, r * 0.4, r * 0.3, lighten(a.leaf));

  if (ripe || t > 0.75) {
    const fr = Math.max(1, a.fruitSize * 0.4);
    for (let i = 0; i < a.fruitCount; i++) {
      const ang = (i / Math.max(1, a.fruitCount)) * Math.PI * 2 + 1.1;
      const fx = 8 + Math.cos(ang) * r * 0.6;
      const fy = cy + Math.sin(ang) * r * 0.45 + r * 0.15;
      if (ripe) qua(s, a, fx, fy, fr);
      else s.ell(fx, fy, fr * 0.8, fr * 0.8, a.leafDark);
    }
    if (rnd() > 0.7) s.px(8, Math.round(cy - r), a.leaf);
  }
}

/* --- grain: NHIỀU CỌNG mảnh, bông rủ xuống khi chín — lúa, lúa mì --------- */
function drawGrain({ s, a, t, ripe, baseY }: FormCtx) {
  const h = Math.max(4, (a.height + 2) * (0.45 + 0.55 * t));
  const n = Math.max(3, Math.round(a.leaves * 0.7));
  const spread = Math.max(2.2, a.spread * 1.05 * (0.5 + 0.5 * t));
  chanDat(s, baseY, spread + 1);

  for (let i = 0; i < n; i++) {
    const frac = n === 1 ? 0.5 : i / (n - 1);
    const nghieng = (frac - 0.5) * 2;
    const cao = h * (0.72 + 0.28 * (1 - Math.abs(nghieng)));
    const tx = 8 + nghieng * spread;
    const ty = baseY - cao;
    /* Cọng LUÔN xanh, kể cả khi chín: chỉ cái BÔNG mới ngả vàng. Nhuộm vàng
       cả cây thì ruộng lúa chín ra một đám tia lửa, không ra ruộng lúa. */
    soi(s, 8 + nghieng * 1.2, baseY, tx, ty, i % 2 ? a.leaf : lighten(a.leaf), a.leafDark);
    if (ripe) {
      /* BÔNG RỦ: đầu cọng cong gập xuống vì nặng hạt. Đây là hình duy nhất nói
         "lúa đã chín" mà không cần đổi màu cả cây. */
      const bx = tx + nghieng * 0.7;
      for (let k = 0; k < 4; k++) {
        const x = Math.round(bx + nghieng * k * 0.45);
        const y = Math.round(ty - 1 + k);
        s.px(x, y, a.fruit);
        s.px(x + 1, y, a.fruitDark);
        if (k % 2 === 0) s.px(x - 1, y, lighten(a.fruit));
      }
    } else {
      s.px(Math.round(tx), Math.round(ty) - 1, a.leafDark);
    }
  }
}

/* --- flower: THÂN THẲNG, một BÔNG to trên ngọn — hướng dương, cúc --------- */
function drawFlower({ s, a, t, ripe, baseY, rnd }: FormCtx) {
  const h = Math.max(4, (a.height + 1) * (0.45 + 0.55 * t));
  const cy = baseY - h;
  chanDat(s, baseY, 2.4);

  than(s, a, 8, Math.round(cy), baseY);
  // hai lá lớn ôm thân
  for (const k of [-1, 1]) {
    const y = baseY - h * (k < 0 ? 0.36 : 0.58);
    la(s, 8, y, 8 + k * a.spread * 0.85, y - a.spread * 0.35, 1.5, a.leaf, a.leafDark, lighten(a.leaf));
  }

  if (t < 0.55) {
    // nụ: bọc đài xanh, chưa nở
    s.ell(8, cy + 1, 1.6, 2, a.leafDark);
    s.ell(8, cy + 0.6, 1.1, 1.5, a.leaf);
    return;
  }

  const r = Math.max(2, a.fruitSize * 0.5 * (ripe ? 1 : 0.75));
  // cánh: tám cánh toả đều, mỗi cánh là một chiếc lá nhỏ
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2 + (rnd() - 0.5) * 0.12;
    la(
      s,
      8 + Math.cos(ang) * r * 0.42,
      cy + Math.sin(ang) * r * 0.42,
      8 + Math.cos(ang) * r * 1.15,
      cy + Math.sin(ang) * r * 1.15,
      1.15,
      a.fruit,
      a.fruitDark,
    );
  }
  // nhuỵ: đĩa hạt ở giữa, tối và có vân
  s.ell(8, cy, r * 0.52, r * 0.52, shade(a.fruitDark, 0.62));
  s.ell(8 - r * 0.12, cy - r * 0.12, r * 0.34, r * 0.34, a.fruitDark);
  s.px(Math.round(8 - r * 0.3), Math.round(cy - r * 0.3), lighten(a.fruit));
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
  concrete: HTMLCanvasElement[];
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
/* ---------------------------------------------------------------------------
   BIỂU TƯỢNG VẬT TƯ.

   Bản trước có sáu hình vẽ tay và MỘT nhánh `else` gom tất cả phần còn lại —
   nghĩa là mười bốn món (sữa, sữa dê, trứng gà, trứng vịt, len, thuốc, và tám
   loại thịt) dùng CHUNG đúng một hình "bó cỏ". Trong túi đồ, trong kho, trong
   quầy bán, chúng là mười bốn ô giống hệt nhau và người chơi phải đọc chữ mới
   biết mình đang cầm gì. Đó không phải chuyện thẩm mỹ mà là một lỗi dùng được.

   Nay mỗi món có DÁNG riêng lấy từ bảng dưới, còn màu thì mỗi món một bộ. Dáng
   trước, màu sau: hai chai sữa khác màu vẫn là hai chai sữa, nên dáng phải nói
   được "đây là sữa" trước khi màu nói "của con nào".
--------------------------------------------------------------------------- */

type MatKind = "chai" | "trung" | "long" | "thit" | "ca" | "soi";

const MAT: Record<string, { kind: MatKind; mau: string; toi: string; nhan?: string }> = {
  medicine: { kind: "chai", mau: "#7fd4a8", toi: "#3f8c68", nhan: "#e8f7ef" },
  milk: { kind: "chai", mau: "#f6f4ee", toi: "#c9c4b6", nhan: "#e05050" },
  goatmilk: { kind: "chai", mau: "#f2eee0", toi: "#c0b9a4", nhan: "#7f9ad8" },
  egg: { kind: "trung", mau: "#f6ead2", toi: "#cbb692" },
  duckegg: { kind: "trung", mau: "#e2eee6", toi: "#a8c4b4" },
  wool: { kind: "long", mau: "#f5f2ec", toi: "#c8c2b6" },
  beef: { kind: "thit", mau: "#c04a48", toi: "#8a2f32" },
  pork: { kind: "thit", mau: "#e59a9c", toi: "#b06a6e" },
  mutton: { kind: "thit", mau: "#b8524e", toi: "#7f3234" },
  goatmeat: { kind: "thit", mau: "#a8564a", toi: "#743330" },
  chickenmeat: { kind: "thit", mau: "#e8c9a0", toi: "#b8946a" },
  duckmeat: { kind: "thit", mau: "#d8a880", toi: "#a67a54" },
  fishmeat: { kind: "ca", mau: "#f0b49a", toi: "#c07f66" },
  fiber: { kind: "soi", mau: "#9ab86a", toi: "#6a8a44" },
};

function veVatTu(s: Surface, kind: MatKind, mau: string, toi: string, nhan?: string): void {
  const sang = lighten(mau);
  if (kind === "chai") {
    // CHAI: cổ hẹp, vai xuôi, thân đứng — bóng sáng dọc mép trái
    s.rect(6, 1, 4, 3, toi);
    s.rect(6, 1, 4, 1, sang);
    s.rect(4, 4, 8, 10, toi);
    s.rect(5, 5, 6, 8, mau);
    s.vline(5, 5, 8, sang);
    s.hline(5, 5, 6, sang);
    if (nhan) {
      s.rect(4, 8, 8, 3, nhan);
      s.hline(4, 8, 8, shade(nhan, 0.8));
    }
    return;
  }
  if (kind === "trung") {
    // TRỨNG: bầu dưới, thon trên — không phải hình tròn
    s.ell(8, 9, 4, 5.2, toi);
    s.ell(8, 9.4, 3.2, 4.4, mau);
    s.ell(6.6, 6.8, 1.4, 1.6, sang);
    // quả thứ hai nấp phía sau cho ra "một mẻ trứng"
    s.ell(12, 12, 2.4, 3, toi);
    s.ell(12, 12.3, 1.7, 2.3, mau);
    return;
  }
  if (kind === "long") {
    // CUỘN LEN: cầu bông + vệt xoắn + đầu sợi thò ra
    s.ell(8, 9, 5.6, 5.2, toi);
    s.ell(8, 9.3, 4.7, 4.3, mau);
    s.ell(6, 6.8, 1.8, 1.4, sang);
    for (let i = -3; i <= 3; i++) {
      s.px(8 + i, Math.round(9 + i * 0.7), toi);
      s.px(8 + i, Math.round(9 - i * 0.7), toi);
    }
    s.px(13, 5, mau);
    s.px(14, 4, toi);
    return;
  }
  if (kind === "thit") {
    // MIẾNG THỊT: khối vuông bo góc, có VÂN MỠ trắng và một khúc xương lộ ra
    s.ell(7.5, 9, 5.4, 4.4, toi);
    s.ell(7.5, 8.6, 4.6, 3.6, mau);
    s.ell(5.8, 7, 1.8, 1.2, sang);
    for (const [x, y] of [
      [5, 9],
      [7, 10],
      [9, 8],
      [10, 10],
    ] as [number, number][])
      s.px(x, y, "#f3ded0");
    s.rect(11, 10, 4, 2, "#efe7d6");
    s.rect(13, 9, 2, 4, "#efe7d6");
    s.px(14, 10, "#cfc4ad");
    return;
  }
  if (kind === "ca") {
    // PHI LÊ CÁ: hình thoi dẹt, có vân thịt chạy chéo và một mảnh da bạc
    s.ell(8, 9, 6, 3.4, toi);
    s.ell(8, 8.6, 5.2, 2.6, mau);
    for (let i = -3; i <= 3; i++) s.px(8 + i, Math.round(9 + Math.abs(i) * 0.3), sang);
    s.hline(3, 11, 10, "#cfd8de");
    s.hline(3, 12, 10, "#a8b4bd");
    return;
  }
  // SỢI: bó sợi xoắn, buộc một nút ở giữa
  for (let i = 0; i < 5; i++) {
    const x = 3 + i * 2;
    soi(s, x, 13, x + (i % 2 ? 1 : -1), 3, i % 2 ? mau : sang, toi);
  }
  s.rect(3, 8, 10, 2, "#c2ad82");
  s.hline(3, 8, 10, "#e0cfa8");
}

function makeMaterialIcon(id: string): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  if (id === "wood") {
    // KHÚC GỖ XẺ: mặt cắt có vòng năm ở đầu, thớ dọc trên mặt
    s.rect(2, 5, 12, 7, "#8a6440");
    s.hline(2, 5, 12, "#a37c52");
    s.hline(2, 11, 12, "#5a3b21");
    for (const y of [7, 9]) s.hline(4, y, 9, "#7a5636");
    s.ell(2.5, 8.5, 1.8, 3.4, "#c49a6a");
    s.ell(2.5, 8.5, 1.1, 2.3, "#a37c52");
    s.px(2, 8, "#6b4a2c");
  } else if (id === "stone") {
    // HÒN ĐÁ: có MẶT, giống hệt tảng đá ngoài đồng thu nhỏ
    for (let y = 4; y <= 12; y++) {
      const w = Math.round(2.4 + ((y - 4) / 8) * 3.6);
      for (let x = 8 - w; x <= 8 + w; x++)
        s.px(x, y, x - (8 - w) < w * 0.75 ? "#8a8f98" : "#6b7078");
    }
    for (let y = 4; y <= 8; y++) {
      const w = Math.round(1.6 + (y - 4) * 0.6);
      for (let x = 7 - w; x <= 7; x++) s.px(x, y, "#a2a8b1");
    }
    for (let i = 0; i < 3; i++) s.px(9 + i, 8 + i, "#5b6068");
    s.px(5, 5, "#ffffff");
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
    const m = MAT[id] ?? { kind: "soi" as MatKind, mau: "#9ab86a", toi: "#6a8a44" };
    veVatTu(s, m.kind, m.mau, m.toi, m.nhan);
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
/* ---------------------------------------------------------------------------
   GIẢI PHẪU con vật.

   Bản trước dựng con vật bằng HÌNH CHỮ NHẬT: thân một khối vuông, đầu một khối
   vuông nhỏ hơn dán vào cạnh. Ở 16px thì cái gì cũng ra "một cục màu có hai
   chấm mắt", và tám loài chỉ khác nhau ở màu. Bản này dựng bằng KHỐI BẦU và
   dựng theo đúng thứ tự một hoạ sĩ vẽ: bóng đổ → phần ở XA (chân sau, đuôi) →
   thân → phần ở GẦN (chân trước) → cổ → đầu → chi tiết mặt.

   Ba thứ làm nên "chân thực" ở cỡ này, không thứ nào là thêm chi tiết:

   · KHỐI, không phải mảng phẳng. `khoi()` vẽ ba tông: vành tối ôm mép dưới,
     thân giữa, vệt nắng trên vai. Mắt đọc ra hình cầu chứ không đọc ra hình
     tròn tô màu.
   · CHIỀU SÂU. Chân sau tối hơn chân trước và vẽ TRƯỚC, nên bị thân che một
     phần — đó là toàn bộ lý do con vật trông có bề dày.
   · TỈ LỆ RIÊNG. Mõm lợn, mào gà, mỏ bẹt vịt, đuôi cong của chó, sừng dê: mỗi
     loài một nét đọc được từ xa, lấy từ content chứ không phải `switch (id)`.

   Vẽ luôn quay MẶT PHẢI rồi lật cả canvas khi đi trái. Rẻ hơn và không bao giờ
   lệch: mọi chi tiết tự đối xứng theo, không phải nhớ đảo dấu ở mười chỗ.
--------------------------------------------------------------------------- */

/** Khối bầu ba tông: vành tối ôm mép, thân giữa, vệt nắng chếch trên-trái. */
function khoi(
  s: Surface,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  giua: string,
  sang: string,
  toi: string,
): void {
  s.ell(cx, cy, rx, ry, toi);
  s.ell(cx, cy - 0.5, Math.max(0.6, rx - 0.8), Math.max(0.6, ry - 0.7), giua);
  s.ell(cx - rx * 0.26, cy - ry * 0.44, Math.max(0.5, rx * 0.46), Math.max(0.5, ry * 0.3), sang);
}

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
  const giua = art.body;
  const sang = lighten(art.body);
  /* HAI tông tối, hai vai khác nhau — trộn chúng làm một là lỗi của bản trước:
     · `vien` là MẶT TỐI của chính màu thân, dùng để dựng khối. Con bò trắng có
       mặt tối màu XÁM, không phải màu đen; lấy `bodyDark` (#2e2a26, màu đốm)
       làm vành khối thì cả con bò viền đen kịt và đọc ra một cái sọ.
     · `toi` = `bodyDark` là màu VẬT LIỆU KHÁC: đốm, tai, đuôi, móng. */
  const vien = shade(art.body, 0.7);
  const toi = art.bodyDark;
  /* Tông của phần Ở XA: tối hơn hẳn thân. Đây là mẹo rẻ nhất để có chiều sâu —
     mắt đọc "cái này ở phía bên kia con vật" mà không cần thêm một pixel nào. */
  const xa = shade(vien, 0.78);

  const nam = pose === "sleep" && art.form !== "fish";
  const an = pose === "eat" && art.form !== "fish";
  /* Nhún theo khung. Khung 2 là lúc cả bốn chân chạm đất nên thân hạ xuống 1px;
     đó là toàn bộ chuyển động mà mắt đọc ra ở cỡ này. */
  const bob = frame === 2 ? 1 : 0;

  const W = Math.max(5, Math.min(14, Math.round(art.w)));
  const H = Math.max(4, Math.min(11, Math.round(art.h)));
  const DAT = TILE - 1; // hàng pixel chạm đất

  if (art.form === "fish") ve_ca();
  else if (art.form === "bird") ve_chim(side);
  else if (art.form === "critter") ve_thu_nho(side);
  else ve_bon_chan(side);

  const done = outline(s);
  if (!flip) return done.c;
  const m = surface(TILE, TILE);
  m.g.save();
  m.g.translate(TILE, 0);
  m.g.scale(-1, 1);
  m.g.drawImage(done.c, 0, 0);
  m.g.restore();
  return m.c;

  /* ---------------------------------------------------------------- bốn chân
     Bò, dê, lợn, cừu, chó. Nhìn NGANG là dáng đọc được nhiều nhất nên nó được
     đầu tư nhất; nhìn thẳng/nhìn sau thu về một khối hẹp hơn với hai chân. */
  function ve_bon_chan(ngang: boolean) {
    const chan = nam ? 0 : 3;
    const w = ngang ? W : Math.max(4, Math.round(W * 0.66));
    const h = nam ? Math.max(3, H - 2) : H;
    const day = ngang ? 2 : 1; // bề ngang một cái chân
    const bot = DAT - chan + bob;
    const cy = bot - h / 2;
    const cx = ngang ? 7.4 : 8;
    const rx = w / 2;
    const ry = h / 2;

    s.shadow(8, DAT, rx + 0.6, 1.5);

    if (ngang) {
      /* Đuôi vẽ TRƯỚC thân: nó mọc từ mông, phía sau con vật. Chó dựng đuôi
         lên, các loài khác thõng xuống rồi cong nhẹ ra sau. */
      const tx = cx - rx - 0.4;
      if (!art.tailUp) {
        s.vline(Math.round(tx), Math.round(cy - ry * 0.4), Math.max(2, Math.round(h * 0.7)), xa);
        s.px(Math.round(tx) - 1, Math.round(cy + ry * 0.9), toi);
      }

      // chân SAU (ở xa): tối hơn, vẽ trước nên bị thân che một phần
      if (chan > 0) chan_doi(cx - rx * 0.66, cx - rx * 0.2, bot - 1, chan + 1, xa, day, 1);
    }

    // ---- thân
    khoi(s, cx, cy, rx, ry, giua, sang, vien);
    // Bụng sáng hẳn: ánh sáng dội từ mặt đất lên, và nó cắt hình khỏi bóng đổ.
    // Con xù lông thì bỏ — vệt sáng trơn nằm giữa đám lông đọc ra là một vết
    // lỗi vẽ chứ không ra cái bụng.
    if (!art.fluff) s.ell(cx, cy + ry * 0.62, rx * 0.7, ry * 0.26, art.belly);

    if (art.fluff) bong_cuu(cx, cy, rx, ry);
    if (art.patch) dom(cx, cy, rx, ry);

    /* Đuôi DỰNG (chó) vẽ SAU thân: nó cong lên trên lưng nên phần gốc phải đè
       lên thân, không phải bị thân đè mất. */
    if (ngang && art.tailUp) {
      const tx = Math.round(cx - rx + 0.5);
      s.vline(tx, Math.round(cy - ry - 2), 4, toi);
      s.px(tx + 1, Math.round(cy - ry - 3), toi);
      s.px(tx + 2, Math.round(cy - ry - 3), toi);
    }

    // chân TRƯỚC (ở gần)
    if (chan > 0) {
      if (ngang) chan_doi(cx + rx * 0.24, cx + rx * 0.68, bot - 1, chan + 1, vien, day, 0);
      else chan_doi(cx - rx * 0.5, cx + rx * 0.5, bot - 1, chan + 1, vien, day, 0);
    }

    // ---- cổ và đầu
    const hs = Math.max(2.2, h * 0.42); // bán kính đầu
    let hx: number;
    let hy: number;
    if (ngang) {
      hx = cx + rx * 0.92 + hs * 0.5;
      hy = cy - ry * 0.62 - hs * 0.1;
      if (an) {
        hx = cx + rx * 0.98 + hs * 0.35;
        hy = bot - hs * 0.7;
      } else if (nam) hy = cy - ry * 0.1;
    } else {
      hx = cx;
      hy = dir === "up" ? cy - ry - hs * 0.55 : cy + ry * 0.35 + hs * 0.2;
      if (an) hy += hs * 0.8;
    }

    // cổ: nối vai với đầu bằng hai khối bầu chồng lên nhau
    if (ngang) {
      const nx = (cx + rx * 0.7 + hx) / 2;
      const ny = (cy - ry * 0.3 + hy) / 2;
      khoi(s, nx, ny, Math.max(1.3, hs * 0.72), Math.max(1.3, hs * 0.9), giua, sang, vien);
    }

    khoi(s, hx, hy, hs, hs * 0.92, giua, sang, vien);

    /* ---- mõm
       Mõm là THỊT, không phải cái mũi: vẽ nó bằng tông thân (sáng hơn một
       nấc) rồi mới chấm CHÓP MŨI bằng `accent`. Tô cả cái mõm bằng accent là
       con chó có một cục đen chiếm nửa mặt — accent của nó vốn là màu mũi. */
    const mom = art.snout ?? 0;
    if (mom > 0) {
      const mx = ngang ? hx + hs * 0.8 : hx;
      const my = ngang ? hy + hs * 0.34 : hy + hs * 0.5;
      const mr = Math.max(1, hs * (0.34 + 0.3 * mom));
      khoi(s, mx, my, mr, mr * 0.8, sang, lighten(sang), giua);
      // chóp mũi
      const nx = Math.round(mx + (ngang ? mr * 0.55 : 0));
      s.px(nx, Math.round(my - mr * 0.2), art.accent);
      if (mom > 0.7) {
        s.px(nx, Math.round(my - mr * 0.2) + 1, art.accent);
        s.px(nx + (ngang ? 0 : 1), Math.round(my - mr * 0.2), art.accent);
      }
    }

    // ---- tai: nêm nhỏ ở đỉnh-sau của đầu
    const tai = Math.max(1, Math.round(hs * 0.5));
    if (ngang) {
      s.vline(Math.round(hx - hs * 0.55), Math.round(hy - hs * 0.75 - tai), tai, toi);
    } else {
      for (const k of [-1, 1])
        s.vline(Math.round(hx + k * hs * 0.7), Math.round(hy - hs * 0.7 - tai), tai, toi);
    }

    // ---- sừng
    const horn = Math.max(0, Math.min(3, Math.round(art.horn ?? 0)));
    if (horn > 0) {
      /* Sừng VUỐT RA SAU, không dựng thẳng: sừng thẳng đứng ở 16px đọc ra là
         cái ăng-ten. Mỗi nấc `horn` thêm một đốt lùi về sau và lên trên. */
      if (ngang) {
        let sx = Math.round(hx + hs * 0.2);
        let sy = Math.round(hy - hs * 0.9);
        for (let i = 0; i <= horn; i++) {
          s.px(sx, sy, art.accent);
          sx -= 1;
          sy -= i === 0 ? 1 : 0;
        }
      } else {
        for (const k of [-1, 1]) {
          let sx = Math.round(hx + k * hs * 0.5);
          let sy = Math.round(hy - hs * 0.85);
          for (let i = 0; i <= horn; i++) {
            s.px(sx, sy, art.accent);
            sx += k;
            sy -= i === 0 ? 1 : 0;
          }
        }
      }
    }

    if (nam) mat_nham(hx, hy, hs, ngang);
    else mat(hx, hy, hs, ngang);
  }

  /* ------------------------------------------------------------------- chim
     Gà và vịt chỉ khác nhau ở hai chi tiết, và đó đúng là hai chi tiết người
     ta dùng để phân biệt chúng ngoài đời: cái MÀO và cái MỎ. `crest` bật mào
     đỏ + yếm (gà); tắt thì mỏ bẹt ra thành mỏ vịt. */
  function ve_chim(ngang: boolean) {
    const chan = nam ? 0 : 2;
    const w = ngang ? W : Math.max(4, Math.round(W * 0.8));
    const h = nam ? Math.max(3, H - 2) : H;
    const bot = DAT - chan + bob;
    const cy = bot - h / 2;
    const cx = 7.6;
    const rx = w / 2;
    const ry = h / 2;

    s.shadow(8, DAT, rx + 0.4, 1.3);

    // đuôi: nêm chếch lên phía sau
    if (ngang) {
      const tx = Math.round(cx - rx - 1);
      for (let i = 0; i < 3; i++) s.vline(tx - i, Math.round(cy - ry * 0.4 - i), 2 + i, i === 0 ? vien : xa);
    }

    if (chan > 0) {
      const cc = art.accent;
      const c1 = Math.round(cx - rx * 0.2);
      const c2 = Math.round(cx + rx * 0.35);
      const l1 = frame === 1 ? chan - 1 : chan;
      const l2 = frame === 3 ? chan - 1 : chan;
      s.vline(c1, bot, l1, cc);
      s.vline(c2, bot, l2, cc);
      s.hline(c1 - 1, bot + l1 - 1, 3, cc);
      s.hline(c2 - 1, bot + l2 - 1, 3, cc);
    }

    // thân: quả trứng, đầu to phía trước
    khoi(s, cx, cy, rx, ry * 1.05, giua, sang, vien);
    s.ell(cx, cy + ry * 0.6, rx * 0.62, ry * 0.3, art.belly);
    // cánh xếp: một vòng cung tối áp vào sườn
    s.ell(cx - rx * 0.1, cy + ry * 0.05, rx * 0.62, ry * 0.5, vien);
    s.ell(cx - rx * 0.1, cy - ry * 0.05, rx * 0.5, ry * 0.38, giua);

    // đầu
    const hs = Math.max(2, h * 0.38);
    let hx = ngang ? cx + rx * 0.72 + hs * 0.5 : cx;
    let hy = cy - ry * 0.85 - hs * 0.5;
    if (an) {
      hx = ngang ? cx + rx * 0.9 : cx;
      hy = bot - hs * 0.6;
    } else if (nam) hy = cy - ry * 0.5;
    if (!ngang && dir === "down") hy = cy - ry * 0.2;
    khoi(s, hx, hy, hs, hs, giua, sang, vien);

    // mỏ
    const my = Math.round(hy + hs * 0.25);
    if (art.crest) {
      // mỏ nhọn 2px
      const bx = Math.round(hx + hs * 0.8);
      s.hline(ngang ? bx : Math.round(hx), my, 2, art.accent);
      s.px(ngang ? bx + 1 : Math.round(hx) + 1, my + 1, shade(art.accent, 0.75));
      // mào: ba bướu tròn trên đỉnh
      const mx = Math.round(hx);
      s.px(mx, Math.round(hy - hs) - 1, art.accent);
      s.px(mx - 1, Math.round(hy - hs), art.accent);
      s.px(mx + 1, Math.round(hy - hs), art.accent);
      // yếm dưới mỏ
      s.px(ngang ? bx : mx, my + 2, art.accent);
    } else {
      // mỏ VỊT: bẹt và dài, hạ thấp hơn
      const bx = Math.round(hx + hs * 0.7);
      s.rect(ngang ? bx : Math.round(hx - 1), my, 3, 2, art.accent);
      s.hline(ngang ? bx : Math.round(hx - 1), my + 1, 3, shade(art.accent, 0.72));
    }

    if (nam) mat_nham(hx, hy, hs, ngang);
    else mat(hx, hy, hs, ngang);
  }

  /* -------------------------------------------------------------------- cá
     Cá không có tư thế nằm và không có bóng đổ trên cạn: nó luôn đang bơi. */
  function ve_ca() {
    const w = Math.max(6, W);
    const h = Math.max(4, H);
    const cx = 8;
    const cy = 8 + (frame % 2 === 0 ? 0 : 1) - 1;
    const rx = w / 2;
    const ry = h / 2;

    // đuôi: hai nêm toả ra sau
    const tx = Math.round(cx - rx - 1);
    for (let i = 0; i < 3; i++) {
      s.px(tx - i, Math.round(cy - 1 - i), i === 0 ? toi : xa);
      s.px(tx - i, Math.round(cy + 1 + i), i === 0 ? toi : xa);
      s.px(tx - i, Math.round(cy), toi);
    }
    // vây lưng
    for (let i = 0; i < Math.max(2, Math.round(rx * 0.6)); i++)
      s.vline(Math.round(cx - rx * 0.4) + i, Math.round(cy - ry - 1), 1 + (i % 2), toi);

    // thân: hình thoi bo tròn, thon về đuôi
    khoi(s, cx, cy, rx, ry, giua, sang, vien);
    s.ell(cx + rx * 0.15, cy + ry * 0.55, rx * 0.6, ry * 0.34, art.belly);
    // nắp mang
    s.vline(Math.round(cx + rx * 0.28), Math.round(cy - ry * 0.5), Math.max(2, Math.round(ry)), toi);
    // vây bụng
    s.px(Math.round(cx), Math.round(cy + ry), art.accent);
    s.px(Math.round(cx + 1), Math.round(cy + ry), art.accent);

    // mắt: có tròng, nên đọc ra là mắt cá chứ không phải một chấm bẩn
    const ex = Math.round(cx + rx * 0.62);
    const ey = Math.round(cy - ry * 0.2);
    s.px(ex, ey, "#ffffff");
    s.px(ex + 1, ey, "#1b1410");
  }

  /* --------------------------------------------------------------- thú nhỏ
     Chuột, sóc. Nét nhận diện là TAI TO và ĐUÔI DÀI — thân thì bé tí. */
  function ve_thu_nho(ngang: boolean) {
    const chan = nam ? 0 : 2;
    const w = ngang ? W : Math.max(4, Math.round(W * 0.72));
    const h = nam ? Math.max(3, H - 1) : H;
    const bot = DAT - chan + bob;
    const cy = bot - h / 2;
    const cx = 7.6;
    const rx = w / 2;
    const ry = h / 2;

    s.shadow(8, DAT, rx + 0.4, 1.2);

    // đuôi dài cong lên
    if (ngang) {
      const tx = Math.round(cx - rx);
      for (let i = 0; i < 4; i++) s.px(tx - i, Math.round(cy - i * 0.9), i < 2 ? toi : xa);
    }
    if (chan > 0) {
      s.vline(Math.round(cx - rx * 0.5), bot, chan, vien);
      s.vline(Math.round(cx + rx * 0.5), bot, chan, vien);
    }

    khoi(s, cx, cy, rx, ry, giua, sang, vien);
    s.ell(cx, cy + ry * 0.6, rx * 0.6, ry * 0.28, art.belly);

    const hs = Math.max(1.8, h * 0.44);
    const hx = ngang ? cx + rx * 0.8 + hs * 0.4 : cx;
    const hy = cy - ry * 0.2;
    khoi(s, hx, hy, hs, hs, giua, sang, vien);
    // tai tròn to
    const tr = Math.max(1, Math.round(hs * 0.7));
    s.disc(Math.round(hx - hs * 0.5), Math.round(hy - hs * 0.9), tr, toi);
    s.disc(Math.round(hx - hs * 0.5), Math.round(hy - hs * 0.9), Math.max(0, tr - 1), art.accent);
    // mũi nhọn
    s.px(Math.round(hx + hs), Math.round(hy + hs * 0.3), art.accent);
    mat(hx, hy, hs, ngang);
  }

  /* ------------------------------------------------------------- chi tiết */

  /** Một CẶP chân: `pha` lệch nhau nên khung nào cũng có chân trước chân sau. */
  function chan_doi(
    x1: number,
    x2: number,
    top: number,
    len: number,
    mau: string,
    day: number,
    pha: number,
  ) {
    const lift = (i: number) => (frame === 0 || frame === 2 ? 0 : (i + pha + frame) % 2);
    [x1, x2].forEach((x, i) => {
      const l = lift(i);
      s.rect(Math.round(x - (day - 1) / 2), top - l, day, len + l, mau);
      // móng: hàng cuối tối hẳn
      s.rect(Math.round(x - (day - 1) / 2), top + len - l - 1, day, 1, shade(mau, 0.6));
    });
  }

  /** Mắt có lòng trắng — chấm đen trơn ở 16px đọc ra là một lỗ thủng. */
  function mat(hx: number, hy: number, hs: number, ngang: boolean) {
    if (dir === "up") return; // quay lưng thì không có mắt sau gáy
    const ey = Math.round(hy - hs * 0.05);
    if (ngang) {
      const ex = Math.round(hx + hs * 0.25);
      s.px(ex, ey, "#ffffff");
      s.px(ex + 1, ey, "#1b1410");
    } else {
      for (const k of [-1, 1]) {
        const ex = Math.round(hx + k * hs * 0.5);
        s.px(ex, ey, "#1b1410");
      }
    }
  }

  /** Mắt nhắm: một gạch ngang. Đây là thứ đọc ra "đang ngủ" nhanh nhất. */
  function mat_nham(hx: number, hy: number, hs: number, ngang: boolean) {
    if (dir === "up") return;
    const ey = Math.round(hy - hs * 0.05);
    if (ngang) s.hline(Math.round(hx + hs * 0.2), ey, 2, "#1b1410");
    else for (const k of [-1, 1]) s.hline(Math.round(hx + k * hs * 0.6) - 1, ey, 2, "#1b1410");
  }

  /** Lông cừu: viền bướu quanh mép trên + đốm xoáy trong thân. */
  function bong_cuu(cx: number, cy: number, rx: number, ry: number) {
    const rnd = mulberry32(0x51e + Math.round((art.fluff ?? 0) * 977));
    for (let i = 0; i < Math.round(rx * ry * 1.1); i++) {
      const a = rnd() * Math.PI * 2;
      const r = Math.sqrt(rnd());
      s.px(
        Math.round(cx + Math.cos(a) * rx * r * 0.8),
        Math.round(cy + Math.sin(a) * ry * r * 0.8),
        rnd() > 0.55 ? art.belly : giua,
      );
    }
    // bướu lông quanh lưng: cứ hai pixel một bướu nhô lên
    for (let x = Math.round(cx - rx + 1); x <= Math.round(cx + rx - 1); x += 2) {
      const dx = (x - cx) / rx;
      const y = Math.round(cy - ry * Math.sqrt(Math.max(0, 1 - dx * dx)));
      s.px(x, y - 1, art.belly);
    }
  }

  /** Đốm bò: vài MẢNG lớn, không phải mưa pixel — mảng mới đọc ra là đốm. */
  function dom(cx: number, cy: number, rx: number, ry: number) {
    const rnd = mulberry32(0x9a2 + Math.round((art.patch ?? 0) * 613));
    /* Hai đốm là đủ, và cả hai dồn về NỬA SAU thân. Rải đều cả con thì cái đốm
       nào rơi lên vai sẽ dính vào vành tối của đầu, và cả con bò đọc ra thành
       một cái sọ đen trắng. Mặt để trắng thì con bò mới còn ra mặt. */
    const n = 2;
    for (let i = 0; i < n; i++) {
      const px2 = cx - rx * (0.12 + i * 0.42) + rnd() * 0.6;
      const py2 = cy + (i === 0 ? -ry * 0.28 : ry * 0.2) + rnd() * 0.5;
      const pr = Math.max(1.1, rx * (0.16 + rnd() * 0.08));
      // cắt đốm theo thân: chỉ tô pixel còn nằm trong khối
      for (let y = Math.floor(py2 - pr); y <= Math.ceil(py2 + pr); y++)
        for (let x = Math.floor(px2 - pr); x <= Math.ceil(px2 + pr); x++) {
          const ddx = (x + 0.5 - px2) / pr;
          const ddy = (y + 0.5 - py2) / (pr * 0.8);
          if (ddx * ddx + ddy * ddy > 1) continue;
          const bx = (x + 0.5 - cx) / (rx - 0.9);
          const by = (y + 0.5 - cy + 0.5) / (ry - 0.9);
          if (bx * bx + by * by > 1) continue;
          s.px(x, y, toi);
        }
    }
  }
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
  const concrete = [0, 1, 2, 3].map(makeConcrete);
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
    grass, path, asphalt, concrete, soil, soilWet, soilEdge, water, shore, bank, bankRim, wood,
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
