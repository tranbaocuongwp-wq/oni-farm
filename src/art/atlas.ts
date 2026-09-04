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

import type { Content, CropDef } from "../game/types.ts";
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

/**
 * Vẽ một vật thể theo id. Đây là chỗ DUY NHẤT ánh xạ id trong props.json sang
 * hình. Id lạ (content mới đẩy qua OTA, core chưa biết vẽ) vẫn ra một hình cọc
 * dễ nhận, chứ không làm trắng màn hình.
 */
function makeProp(id: string, art: PropArt): HTMLCanvasElement {
  switch (id) {
    case "tree": return makeTree(art);
    case "sapling": return makeSapling(art);
    case "stump": return makeStump(art);
    case "rock": return makeRock(art);
    case "bush": return makeBush(art);
    case "well": return makeWell(art);
    case "bed": return makeBed(art);
    case "bench": return makeBench(art);
    case "wall": return makeWall(art);
    case "door_in": return makeDoorIn(art);
    case "shop": return makeShop();
    case "counter": return makeCounter();
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
    case "solar": {
      s.shadow(8, 14, 6, 2);
      s.rect(4, 11, 2, 4, P.metalDark);
      s.rect(10, 11, 2, 4, P.metalDark);
      s.rect(1, 4, 14, 8, art.dark);
      s.rect(2, 5, 12, 6, art.body);
      for (let x = 4; x < 14; x += 3) s.vline(x, 5, 6, art.dark);
      s.hline(2, 8, 12, art.dark);
      s.hline(2, 5, 12, art.accent);
      s.px(3, 6, "#ffffff");
      break;
    }
    case "drone": {
      s.shadow(8, 15, 4, 1.5);
      s.rect(5, 7, 6, 4, art.body);
      s.rect(5, 7, 6, 1, art.dark);
      s.rect(6, 11, 4, 1, art.dark);
      s.px(6, 9, art.accent);
      s.px(9, 9, art.accent);
      s.rect(1, 5, 4, 1, art.dark);
      s.rect(11, 5, 4, 1, art.dark);
      s.vline(2, 6, 2, art.dark);
      s.vline(13, 6, 2, art.dark);
      s.rect(0, 4, 5, 1, P.metal);
      s.rect(11, 4, 5, 1, P.metal);
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
      s.disc(cx, cy, r, a.fruit);
      s.disc(cx + 1, cy + 1, Math.max(0, r - 2), a.fruitDark);
      s.px(cx - r + 1, cy - r + 1, "#ffffff");
      s.px(cx, cy - r, a.leafDark);
    }
  }
  return outline(s).c;
}

/* ---------------------------------------------------------------------------
   NHÂN VẬT — vẽ theo bộ phận, 4 hướng × 6 khung hình.

   Thiết kế lại cho màn nhỏ: đầu to hơn (kiểu chibi), mũ đỏ là điểm nhận diện,
   viền đen quanh người, bước đi 4 khung (chân so le + nhún) thay vì 2 để
   chuyển động mượt ở tốc độ chạy.
--------------------------------------------------------------------------- */

const DIRS = ["down", "up", "left", "right"] as const;
export type PlayerDir = (typeof DIRS)[number];

function makePlayer(dir: PlayerDir, frame: number): HTMLCanvasElement {
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
    s.rect(back + (step < 0 ? 0 : 0), legY, 3, 3 - bob, P.denimDark);
    s.rect(front + step, legY - (step !== 0 ? 1 : 0), 3, 3 - bob, P.denim);
    s.rect(back, 15 - bob, 3, 1, P.boot);
    s.rect(front + step, 15 - bob, 3, 1, P.boot);
  } else {
    s.rect(5, legY - (step > 0 ? 1 : 0), 3, 3 - bob, step >= 0 ? P.denim : P.denimDark);
    s.rect(9, legY - (step < 0 ? 1 : 0), 3, 3 - bob, step >= 0 ? P.denimDark : P.denim);
    s.rect(5, 15 - bob, 3, 1, P.boot);
    s.rect(9, 15 - bob, 3, 1, P.boot);
  }

  s.g.save();
  s.g.translate(lx, ly);
  // thân — áo trắng + yếm quần bò
  s.rect(5, top + 6, 7, 6, P.shirt);
  s.rect(5, top + 8, 7, 4, P.denim);
  s.vline(7, top + 6, 3, P.denim);
  s.vline(10, top + 6, 3, P.denim);
  s.px(6, top + 10, P.denimDark);
  s.px(11, top + 10, P.denimDark);
  s.px(5, top + 7, P.shirtDark);

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
  s.rect(3, top - 1, 11, 3, P.cap);
  s.hline(4, top - 1, 9, P.capLight);
  s.hline(3, top + 1, 11, P.capDark);
  if (dir === "down") s.rect(3, top + 2, 11, 1, P.capDark);
  else if (dir === "left") s.rect(1, top + 2, 6, 1, P.capDark);
  else if (dir === "right") s.rect(10, top + 2, 6, 1, P.capDark);

  // mặt
  if (dir === "down") {
    s.px(6, top + 4, P.outline);
    s.px(10, top + 4, P.outline);
    s.px(8, top + 5, P.skinDark);
    s.px(7, top + 5, "#e08a8a");
    s.px(10, top + 5, "#e08a8a");
  } else if (dir === "up") {
    s.rect(4, top + 3, 9, 3, P.hair);
  } else if (dir === "left") {
    s.px(5, top + 4, P.outline);
    s.rect(9, top + 3, 4, 3, P.hair);
  } else {
    s.px(11, top + 4, P.outline);
    s.rect(4, top + 3, 4, 3, P.hair);
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

/** Icon 12×12 cho HUD: tiền, giờ, năng lượng, nước, điện, mục tiêu. */
export type UiIcon = "coin" | "sun" | "moon" | "energy" | "water" | "power" | "goal" | "day" | "bag";

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
  soil: HTMLCanvasElement[];
  soilWet: HTMLCanvasElement[];
  /** Viền lô đất theo cạnh giáp ô chưa cày. */
  soilEdge: Record<Side, HTMLCanvasElement>;
  water: HTMLCanvasElement[];
  /** [side][frame] bọt bờ nước, phủ lên ô nước giáp đất. */
  shore: Record<Side, HTMLCanvasElement[]>;
  wood: HTMLCanvasElement[];
  tuft: HTMLCanvasElement;
  /** Ô ngoài biên bản đồ: [ngoài trời (rừng)] và [trong nhà (tối)]. */
  voidOut: HTMLCanvasElement[];
  voidIn: HTMLCanvasElement[];
  /** Mọi vật thể, dựng theo props.json. Cao 32px nếu prop khai `tall`. */
  props: Record<string, HTMLCanvasElement>;
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
}

function houseKey(n: Neighbors, door: boolean): string {
  return `${n.up ? 1 : 0}${n.down ? 1 : 0}${n.left ? 1 : 0}${n.right ? 1 : 0}${door ? "D" : "-"}`;
}

export function houseVariantKey(n: Neighbors, door: boolean) {
  return houseKey(n, door);
}

function makeSeedIcon(def: CropDef): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  // gói hạt: túi giấy có nhãn màu quả
  s.rect(3, 3, 10, 11, P.cloth);
  s.rect(3, 3, 10, 2, "#c9b48a");
  s.hline(3, 13, 10, "#a8916a");
  s.rect(4, 6, 8, 6, "#fbf7ee");
  s.disc(8, 9, 2, def.art.fruit);
  s.px(7, 8, def.art.fruitDark);
  s.px(8, 6, def.art.leafDark);
  s.px(9, 6, def.art.leaf);
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

export function buildAtlas(content: Content): Atlas {
  const grass = [0, 1, 2, 3, 4, 5].map(makeGrass);
  const path = [0, 1, 2, 3].map(makePath);
  const wood = [0, 1, 2, 3].map(makePlank);
  const soil = [0, 1].map((v) => makeSoil(false, v));
  const soilWet = [0, 1].map((v) => makeSoil(true, v));
  const water = [0, 1, 2, 3].map(makeWater);
  const sides: Side[] = ["n", "s", "w", "e"];
  const soilEdge = {} as Record<Side, HTMLCanvasElement>;
  const shore = {} as Record<Side, HTMLCanvasElement[]>;
  for (const sd of sides) {
    soilEdge[sd] = makeSoilEdge(sd);
    shore[sd] = [0, 1].map((f) => makeShore(sd, f));
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

  const buildings: Record<string, HTMLCanvasElement> = {};
  for (const id of content.buildingOrder) {
    const def = content.buildings[id]!;
    buildings[id] = makeBuilding(id, def.art, def.kind);
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
    icons.set(`seed:${id}`, makeSeedIcon(def));
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

  return {
    grass, path, soil, soilWet, soilEdge, water, shore, wood,
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
  };
}

/** Chọn biến thể theo toạ độ ô — cùng ô luôn ra cùng hoa văn. */
export function variantFor(x: number, y: number, count: number): number {
  return hash2(x, y) % count;
}
