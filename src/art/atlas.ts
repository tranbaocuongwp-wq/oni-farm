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
============================================================================ */

import type { Content, CropDef } from "../game/types.ts";
import { hash2, mulberry32 } from "../core/rng.ts";

export const TILE = 16;
/** Cây được vẽ trên khung cao hơn ô để cây cao vươn lên trên viền ô. */
export const CROP_H = 24;

/* ---------------------------------------------------------------------------
   Bảng màu. Gom một chỗ để chỉnh tông cả game bằng vài dòng.
--------------------------------------------------------------------------- */
const P = {
  grass: ["#4a7c3f", "#528a44", "#43703a"],
  grassTuft: "#6aa84f",
  grassDark: "#3a6130",
  path: ["#b09268", "#a5875e", "#bb9d73"],
  pathDark: "#8a7050",
  soil: ["#6f4c30", "#7a5537", "#654429"],
  soilWet: ["#4a3220", "#523827", "#412b1b"],
  water: ["#2f6fc4", "#3b81d8", "#2a5fa8"],
  waterFoam: "#7fb6ec",
  trunk: "#5a3d24",
  trunkDark: "#402b19",
  leaf: ["#2f6b33", "#3d8a3f", "#245227"],
  rock: ["#8a8f98", "#a2a8b1", "#6b7078"],
  bush: ["#3f7a3a", "#4f9647", "#2e5c2b"],
  roof: "#3b4252",
  roofLight: "#4c566a",
  roofDark: "#2b313d",
  wall: "#e5e9f0",
  wallDark: "#c8cfdb",
  glass: "#5e81ac",
  glassLight: "#88c0d0",
  wood: "#7a5230",
  woodDark: "#5a3b21",
  metal: "#b8c6d4",
  metalDark: "#5d7186",
  skin: "#f0c088",
  skinDark: "#d09a63",
  hair: "#4a3524",
  cap: "#d94f4f",
  capDark: "#a83636",
  shirt: "#e8eef5",
  denim: "#3f6493",
  denimDark: "#2d4a70",
  boot: "#4a3a2a",
  plank: ["#a97d4e", "#966d43", "#b98a58"],
  plankDark: "#6b4a2c",
  voidBg: "#0d0b09",
  cloth: "#d9c9a3",
  quilt: "#c25b48",
  quiltDark: "#8a4a3a",
  shadow: "rgba(0,0,0,0.22)",
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
}

function surface(w: number, h: number): Surface {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  // willReadFrequently: vài hàm vẽ (tán cây, bụi) đọc lại pixel bằng getImageData
  // để tô bóng theo hình đã có; không bật cờ này thì trình duyệt cảnh báo và chậm.
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
  };
}

const pick = <T,>(arr: readonly T[], r: number): T => arr[Math.floor(r * arr.length) % arr.length]!;

/* ---------------------------------------------------------------------------
   NỀN ĐẤT — mỗi loại có vài biến thể, renderer chọn theo băm toạ độ ô nên
   ruộng trông có hoa văn tự nhiên mà state không phải lưu thêm gì.
--------------------------------------------------------------------------- */

function makeGrass(variant: number): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  const rnd = mulberry32(0x61a55 + variant * 7919);
  s.rect(0, 0, TILE, TILE, P.grass[0]!);
  for (let i = 0; i < 46; i++) {
    const x = Math.floor(rnd() * TILE);
    const y = Math.floor(rnd() * TILE);
    s.px(x, y, pick(P.grass, rnd()));
  }
  // vài cọng cỏ dựng đứng cho đỡ phẳng
  for (let i = 0; i < 3 + variant; i++) {
    const x = 1 + Math.floor(rnd() * (TILE - 2));
    const y = 3 + Math.floor(rnd() * (TILE - 5));
    s.px(x, y, P.grassTuft);
    s.px(x, y + 1, P.grassDark);
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
  for (let i = 0; i < 60; i++)
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
  for (let i = 0; i < 26; i++)
    s.px(Math.floor(rnd() * TILE), Math.floor(rnd() * TILE), pick(pal, rnd()));
  if (wet) {
    // vài đốm nước bắt sáng
    for (let i = 0; i < 5; i++)
      s.px(1 + Math.floor(rnd() * 14), 1 + Math.floor(rnd() * 14), "#6f8fa8");
  }
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
  // khe dọc so le giữa các hàng ván
  s.vline((variant * 7) % TILE, 0, 5, P.plankDark);
  s.vline((variant * 7 + 9) % TILE, 5, 5, P.plankDark);
  s.vline((variant * 7 + 4) % TILE, 10, 6, P.plankDark);
  return s.c;
}

/** Ô "hư vô" — vùng ngoài phòng, người chơi không bao giờ tới được. */
function makeVoid(): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  s.rect(0, 0, TILE, TILE, P.voidBg);
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

/* ---------------------------------------------------------------------------
   VẬT THỂ TĨNH
--------------------------------------------------------------------------- */

function makeTree(art: PropArt): HTMLCanvasElement {
  const s = surface(TILE, TILE * 2); // cây cao 2 ô, phần trên tràn lên ô phía trên
  const rnd = mulberry32(0x77ee);
  const baseY = TILE * 2;
  // bóng đổ
  s.g.fillStyle = P.shadow;
  s.g.beginPath();
  s.g.ellipse(8, baseY - 2, 6, 2.5, 0, 0, Math.PI * 2);
  s.g.fill();
  // thân
  s.rect(6, baseY - 10, 4, 9, art.accent);
  s.vline(6, baseY - 10, 9, P.trunkDark);
  s.px(9, baseY - 6, P.trunkDark);
  // tán: ba cụm chồng lên nhau
  const blobs: [number, number, number][] = [
    [8, baseY - 18, 7],
    [4, baseY - 14, 5],
    [12, baseY - 14, 5],
    [8, baseY - 12, 6],
  ];
  for (const [cx, cy, r] of blobs) s.disc(cx, cy, r, art.body);
  // đốm sáng/tối cho tán có khối
  for (let i = 0; i < 70; i++) {
    const x = Math.floor(rnd() * TILE);
    const y = baseY - 24 + Math.floor(rnd() * 16);
    const img = s.g.getImageData(x, y, 1, 1).data;
    if (img[3]! === 0) continue;
    s.px(x, y, rnd() > 0.55 ? P.leaf[1]! : art.dark);
  }
  return s.c;
}

function makeRock(art: PropArt): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  s.g.fillStyle = P.shadow;
  s.g.beginPath();
  s.g.ellipse(8, 14, 5, 2, 0, 0, Math.PI * 2);
  s.g.fill();
  s.disc(8, 10, 5, art.body);
  s.disc(6, 8, 3, art.accent);
  s.disc(11, 11, 3, art.dark);
  s.px(5, 8, art.accent);
  s.px(6, 7, art.accent);
  return s.c;
}

function makeBush(art: PropArt): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  const rnd = mulberry32(0x51b1);
  s.g.fillStyle = P.shadow;
  s.g.beginPath();
  s.g.ellipse(8, 14, 6, 2, 0, 0, Math.PI * 2);
  s.g.fill();
  s.disc(8, 10, 5, art.body);
  s.disc(5, 9, 3, art.accent);
  s.disc(11, 10, 3, art.dark);
  for (let i = 0; i < 20; i++) {
    const x = 2 + Math.floor(rnd() * 12);
    const y = 5 + Math.floor(rnd() * 9);
    if (s.g.getImageData(x, y, 1, 1).data[3]! > 0) s.px(x, y, pick(P.bush, rnd()));
  }
  // vài quả mọng
  for (let i = 0; i < 3; i++) s.px(4 + Math.floor(rnd() * 9), 7 + Math.floor(rnd() * 6), "#d94f6f");
  return s.c;
}

/** Cây gỗ NHỎ: một ô, tán bé, chặt vài nhát là xong. */
function makeSapling(art: PropArt): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  const rnd = mulberry32(0x5a91);
  s.g.fillStyle = P.shadow;
  s.g.beginPath();
  s.g.ellipse(8, 14, 4, 1.6, 0, 0, Math.PI * 2);
  s.g.fill();
  s.rect(7, 8, 2, 6, art.accent);
  s.disc(8, 6, 4, art.body);
  s.disc(6, 5, 2, art.dark);
  for (let i = 0; i < 18; i++) {
    const x = 3 + Math.floor(rnd() * 10);
    const y = 1 + Math.floor(rnd() * 9);
    if (s.g.getImageData(x, y, 1, 1).data[3]! > 0) s.px(x, y, rnd() > 0.5 ? art.dark : art.body);
  }
  return s.c;
}

/** Gốc cây còn lại sau khi hạ cây lớn — vẫn chặt tiếp được để lấy nốt gỗ. */
function makeStump(art: PropArt): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  s.g.fillStyle = P.shadow;
  s.g.beginPath();
  s.g.ellipse(8, 14, 5, 2, 0, 0, Math.PI * 2);
  s.g.fill();
  s.rect(4, 8, 8, 5, art.body);
  s.rect(4, 8, 8, 2, art.accent); // mặt cắt sáng hơn
  s.hline(4, 12, 8, art.dark);
  // vân gỗ đồng tâm
  s.rect(6, 9, 4, 1, art.dark);
  s.px(7, 8, art.dark);
  s.px(8, 8, art.dark);
  s.vline(4, 10, 3, art.dark);
  s.vline(11, 10, 3, art.dark);
  return s.c;
}

/** Giếng nước: thành đá tròn, mái che, nước xanh bên trong. */
function makeWell(art: PropArt): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  s.g.fillStyle = P.shadow;
  s.g.beginPath();
  s.g.ellipse(8, 14, 6, 2, 0, 0, Math.PI * 2);
  s.g.fill();
  s.rect(2, 8, 12, 6, art.dark); // thành giếng
  s.rect(3, 9, 10, 4, art.body);
  s.rect(4, 10, 8, 2, art.accent); // mặt nước
  s.hline(2, 8, 12, art.body);
  // cột và mái
  s.vline(3, 3, 5, P.wood);
  s.vline(12, 3, 5, P.wood);
  s.rect(1, 1, 14, 3, P.roof);
  s.hline(1, 1, 14, P.roofLight);
  return s.c;
}

/** Giường — chỉ chỗ này mới ngủ được, không phải cái cửa. */
function makeBed(art: PropArt): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  s.rect(2, 1, 12, 14, P.woodDark);
  s.rect(3, 2, 10, 12, art.body); // đệm
  s.rect(3, 2, 10, 4, "#f2ecdd"); // gối
  s.rect(3, 7, 10, 7, art.accent); // chăn
  s.hline(3, 7, 10, art.dark);
  s.hline(3, 10, 10, art.dark);
  s.rect(2, 0, 12, 1, P.wood);
  s.rect(2, 15, 12, 1, P.wood);
  return s.c;
}

/** Bàn chế tạo. */
function makeBench(art: PropArt): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  s.g.fillStyle = P.shadow;
  s.g.beginPath();
  s.g.ellipse(8, 14, 6, 2, 0, 0, Math.PI * 2);
  s.g.fill();
  s.rect(1, 6, 14, 3, art.body); // mặt bàn
  s.hline(1, 6, 14, "#b8905e");
  s.hline(1, 8, 14, art.dark);
  s.rect(2, 9, 2, 5, art.dark); // chân
  s.rect(12, 9, 2, 5, art.dark);
  // dụng cụ trên bàn
  s.rect(4, 3, 5, 2, art.accent);
  s.px(3, 4, art.accent);
  s.rect(10, 2, 2, 4, P.wood);
  s.rect(9, 2, 4, 2, art.accent);
  return s.c;
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
  s.px(5, 11, "#f5d76e");
  return s.c;
}

/** Nhà tự ghép ô (autotile): mỗi ô nhìn 4 hàng xóm để biết mình là mái, tường
 *  hay góc. Nhờ vậy sửa hình dạng nhà trong farm.ascii là hình tự khớp theo,
 *  không cần vẽ lại gì. */
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
    // ngói: các hàng so le
    for (let y = 1; y < TILE; y += 4) {
      s.hline(0, y, TILE, P.roofDark);
      for (let x = (y / 4) % 2 === 0 ? 0 : 2; x < TILE; x += 4) s.vline(x, y, 3, P.roofDark);
    }
    s.hline(0, 0, TILE, P.roofLight);
    if (!n.left) s.vline(0, 0, TILE, P.roofDark);
    if (!n.right) s.vline(TILE - 1, 0, TILE, P.roofDark);
    // diềm mái nhô ra ở hàng dưới cùng của mái
    if (n.down) s.hline(0, TILE - 1, TILE, P.roofLight);
    return s.c;
  }

  s.rect(0, 0, TILE, TILE, P.wall);
  s.hline(0, 0, TILE, P.wallDark);
  if (!n.left) s.vline(0, 0, TILE, P.wallDark);
  if (!n.right) s.vline(TILE - 1, 0, TILE, P.wallDark);
  if (!n.down) s.hline(0, TILE - 1, TILE, P.wallDark);

  if (door) {
    // cửa kính lớn kiểu nhà hiện đại
    s.rect(3, 3, 10, 13, P.roofDark);
    s.rect(4, 4, 8, 12, P.glass);
    s.rect(4, 4, 8, 5, P.glassLight);
    s.vline(8, 4, 12, P.roofDark);
    s.px(6, 11, "#f5d76e"); // tay nắm
  } else {
    // cửa sổ băng ngang
    s.rect(2, 4, 12, 7, P.roofDark);
    s.rect(3, 5, 10, 5, P.glass);
    s.rect(3, 5, 10, 2, P.glassLight);
    s.vline(8, 5, 5, P.roofDark);
  }
  return s.c;
}

function makeShop(): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  // máy bán hạt giống tự động — thùng kim loại, mặt kính, đèn
  s.rect(2, 2, 12, 14, P.metalDark);
  s.rect(3, 3, 10, 12, P.metal);
  s.rect(4, 4, 8, 7, P.glass);
  s.rect(4, 4, 8, 2, P.glassLight);
  // các gói hạt sau kính
  s.rect(5, 7, 2, 3, "#6cc94f");
  s.rect(8, 7, 2, 3, "#e8452f");
  s.rect(11, 7, 1, 3, "#f08a1d");
  s.rect(4, 12, 8, 2, P.metalDark);
  s.px(12, 5, "#4ade80"); // đèn báo
  return s.c;
}

function makeCounter(): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  // quầy thu mua — bàn gỗ + cân + bảng giá
  s.rect(1, 7, 14, 8, P.woodDark);
  s.rect(2, 8, 12, 6, P.wood);
  s.hline(2, 8, 12, "#96683f");
  // bảng giá
  s.rect(3, 2, 10, 5, P.metalDark);
  s.rect(4, 3, 8, 3, "#1e2a3a");
  s.px(5, 4, "#4ade80");
  s.px(6, 4, "#4ade80");
  s.px(8, 4, "#4ade80");
  s.px(10, 4, "#4ade80");
  // cân
  s.rect(9, 5, 4, 2, P.metal);
  return s.c;
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
      return s.c;
    }
  }
}

/* ---------------------------------------------------------------------------
   CÔNG TRÌNH HIỆN ĐẠI — màu lấy từ content nên đổi tông qua OTA được.
--------------------------------------------------------------------------- */

function makeBuilding(id: string, art: { body: string; dark: string; accent: string }): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  switch (id) {
    case "sprinkler": {
      s.g.fillStyle = P.shadow;
      s.g.beginPath();
      s.g.ellipse(8, 14, 5, 2, 0, 0, Math.PI * 2);
      s.g.fill();
      s.rect(6, 8, 4, 6, art.dark); // đế
      s.rect(7, 8, 2, 6, art.body);
      s.rect(4, 5, 8, 3, art.body); // đầu phun
      s.rect(4, 5, 8, 1, art.dark);
      s.px(3, 6, art.accent);
      s.px(12, 6, art.accent);
      // tia nước
      s.px(2, 4, art.accent);
      s.px(13, 4, art.accent);
      s.px(8, 3, art.accent);
      break;
    }
    case "greenhouse": {
      // sàn kính: nền sáng + khung ô vuông
      s.rect(0, 0, TILE, TILE, art.body);
      s.g.globalAlpha = 0.5;
      s.rect(0, 0, TILE, TILE, art.accent);
      s.g.globalAlpha = 1;
      s.hline(0, 0, TILE, art.dark);
      s.vline(0, 0, TILE, art.dark);
      s.hline(0, 8, TILE, art.dark);
      s.vline(8, 0, TILE, art.dark);
      // ánh sáng phản chiếu
      for (let i = 0; i < 4; i++) s.px(2 + i, 3 + i, "#ffffff");
      break;
    }
    case "solar": {
      s.g.fillStyle = P.shadow;
      s.g.beginPath();
      s.g.ellipse(8, 14, 6, 2, 0, 0, Math.PI * 2);
      s.g.fill();
      s.rect(4, 11, 2, 4, P.metalDark); // chân
      s.rect(10, 11, 2, 4, P.metalDark);
      s.rect(1, 4, 14, 8, art.dark); // tấm pin nghiêng
      s.rect(2, 5, 12, 6, art.body);
      for (let x = 4; x < 14; x += 3) s.vline(x, 5, 6, art.dark);
      s.hline(2, 8, 12, art.dark);
      s.hline(2, 5, 12, art.accent); // vệt nắng
      break;
    }
    case "drone": {
      s.g.fillStyle = P.shadow;
      s.g.beginPath();
      s.g.ellipse(8, 15, 4, 1.5, 0, 0, Math.PI * 2);
      s.g.fill();
      s.rect(5, 7, 6, 4, art.body); // thân
      s.rect(5, 7, 6, 1, art.dark);
      s.rect(6, 11, 4, 1, art.dark);
      s.px(6, 9, art.accent); // đèn
      s.px(9, 9, art.accent);
      s.rect(1, 5, 4, 1, art.dark); // càng
      s.rect(11, 5, 4, 1, art.dark);
      s.vline(2, 6, 2, art.dark);
      s.vline(13, 6, 2, art.dark);
      s.rect(0, 4, 5, 1, P.metal); // cánh quạt
      s.rect(11, 4, 5, 1, P.metal);
      break;
    }
    default: {
      // công trình lạ (content mới, core chưa biết vẽ) — hộp có chấm hỏi,
      // vẫn chơi được thay vì lỗi trắng màn hình
      s.rect(2, 2, 12, 12, art.dark);
      s.rect(3, 3, 10, 10, art.body);
      s.rect(7, 5, 2, 4, art.accent);
      s.rect(7, 10, 2, 2, art.accent);
    }
  }
  return s.c;
}

/* ---------------------------------------------------------------------------
   CÂY TRỒNG — vẽ theo tham số, không vẽ tay từng giai đoạn.

   `t` là tiến độ 0..1 theo giai đoạn. Thân cao dần, lá nhiều dần, quả chỉ
   xuất hiện ở giai đoạn chín. Thêm cây mới = thêm object trong crops.json.
--------------------------------------------------------------------------- */

function makeCrop(def: CropDef, stage: number): HTMLCanvasElement {
  const s = surface(TILE, CROP_H);
  const a = def.art;
  const maxStage = def.growthDays.length;
  const t = maxStage === 0 ? 1 : stage / maxStage;
  const ripe = stage >= maxStage;
  const baseY = CROP_H - 3; // mặt đất trong khung
  const rnd = mulberry32(hash2(def.id.length, stage, 0x3a1));

  if (stage === 0) {
    // mầm mới nhú: hai lá mầm bé
    s.px(8, baseY, a.stem);
    s.px(8, baseY - 1, a.stem);
    s.px(7, baseY - 2, a.leaf);
    s.px(9, baseY - 2, a.leaf);
    s.px(8, baseY - 2, a.leafDark);
    return s.c;
  }

  const h = Math.max(2, Math.round(a.height * (0.35 + 0.65 * t)));
  const spread = Math.max(1, Math.round(a.spread * (0.4 + 0.6 * t)));
  const leaves = Math.max(2, Math.round(a.leaves * (0.4 + 0.6 * t)));

  // thân
  for (let k = 0; k < h; k++) {
    const y = baseY - k;
    s.px(8, y, a.stem);
    if (k > h * 0.3 && k % 3 === 0) s.px(9, y, a.leafDark);
  }

  // lá toả đều hai bên, dày dần lên trên
  for (let i = 0; i < leaves; i++) {
    const frac = i / Math.max(1, leaves - 1);
    const y = baseY - Math.round(2 + frac * (h - 2));
    const side = i % 2 === 0 ? -1 : 1;
    const len = Math.max(1, Math.round(spread * (0.5 + 0.5 * (1 - frac))));
    for (let k = 1; k <= len; k++) {
      const x = 8 + side * k;
      s.px(x, y, k === len ? a.leafDark : a.leaf);
      if (k < len && rnd() > 0.45) s.px(x, y - 1, a.leaf);
    }
  }

  // quả — chỉ khi chín, để người chơi nhìn phát biết ngay là thu hoạch được
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
      s.disc(cx - 1, cy - 1, Math.max(0, r - 2), a.fruitDark);
      s.px(cx - r + 1, cy - r + 1, "#ffffff"); // đốm sáng
      s.px(cx, cy - r, a.leafDark); // cuống
    }
  }
  return s.c;
}

/* ---------------------------------------------------------------------------
   NHÂN VẬT — vẽ theo bộ phận, 4 hướng × 3 khung hình.
   Dựng bằng tham số thay vì spritesheet để đổi trang phục/màu chỉ là đổi hằng số.
--------------------------------------------------------------------------- */

const DIRS = ["down", "up", "left", "right"] as const;
export type PlayerDir = (typeof DIRS)[number];

function makePlayer(dir: PlayerDir, frame: number): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  // frame 0 = đứng, 1 và 2 = hai nhịp bước, 3 = ĐANG THAO TÁC (vung tay).
  // Khung 3 là phản hồi hình ảnh cho cơ chế khoá tuần tự: nhìn là biết nhân vật
  // đang bận, chứ không phải game bị đơ.
  const act = frame === 3;
  const step = frame === 0 || act ? 0 : frame === 1 ? 1 : -1;
  const bob = frame === 0 || act ? 0 : 1; // nhún nhẹ khi đi cho có sức sống
  // nghiêng người về hướng đang làm
  const lx = act ? (dir === "left" ? -1 : dir === "right" ? 1 : 0) : 0;
  const ly = act ? (dir === "up" ? -1 : dir === "down" ? 1 : 0) : 0;

  s.g.fillStyle = P.shadow;
  s.g.beginPath();
  s.g.ellipse(8, 15, 4.5, 1.6, 0, 0, Math.PI * 2);
  s.g.fill();

  const top = 1 + bob;

  // chân
  const legY = 12 + bob;
  if (dir === "left" || dir === "right") {
    s.rect(6, legY, 3, 3 - bob, P.denimDark);
    s.rect(8, legY - (step > 0 ? 1 : 0), 3, 3 - bob, P.denim);
    s.rect(6, 15 - bob, 3, 1, P.boot);
    s.rect(8, 15 - bob, 3, 1, P.boot);
  } else {
    s.rect(5, legY, 3, 3 - bob, step >= 0 ? P.denim : P.denimDark);
    s.rect(9, legY, 3, 3 - bob, step >= 0 ? P.denimDark : P.denim);
    s.rect(5, 15 - bob, 3, 1, P.boot);
    s.rect(9, 15 - bob, 3, 1, P.boot);
  }

  // thân — áo + yếm quần bò (nghiêng nhẹ về hướng đang thao tác)
  s.g.save();
  s.g.translate(lx, ly);
  s.rect(5, top + 6, 7, 6, P.shirt);
  s.rect(5, top + 8, 7, 4, P.denim);
  s.vline(7, top + 6, 3, P.denim); // dây yếm
  s.vline(10, top + 6, 3, P.denim);
  s.px(6, top + 10, P.denimDark);
  s.px(11, top + 10, P.denimDark);

  // tay
  const armY = top + 7;
  if (act) {
    // Hai tay vươn về phía trước + một vệt kim loại làm đầu công cụ.
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
  } else if (dir === "left") {
    s.rect(4, armY + (step > 0 ? -1 : 0), 2, 4, P.skin);
  } else if (dir === "right") {
    s.rect(11, armY + (step > 0 ? -1 : 0), 2, 4, P.skin);
  } else {
    s.rect(3, armY - (step > 0 ? 1 : 0), 2, 4, P.skin);
    s.rect(12, armY + (step > 0 ? 1 : 0), 2, 4, P.skin);
  }

  // đầu
  s.rect(5, top + 1, 7, 6, P.skin);
  s.hline(5, top + 6, 7, P.skinDark);

  // mũ lưỡi trai — nét nhận diện chính ở kích thước nhỏ
  s.rect(4, top, 9, 3, P.cap);
  s.hline(4, top, 9, P.capDark);
  if (dir === "down") s.rect(4, top + 3, 9, 1, P.capDark);
  else if (dir === "left") s.rect(2, top + 3, 5, 1, P.capDark);
  else if (dir === "right") s.rect(10, top + 3, 5, 1, P.capDark);

  // mặt
  if (dir === "down") {
    s.px(7, top + 4, "#2b2b2b");
    s.px(10, top + 4, "#2b2b2b");
    s.px(8, top + 5, P.skinDark);
    s.px(9, top + 5, P.skinDark);
  } else if (dir === "up") {
    s.rect(5, top + 3, 7, 3, P.hair);
  } else if (dir === "left") {
    s.px(6, top + 4, "#2b2b2b");
    s.rect(9, top + 3, 3, 3, P.hair);
  } else {
    s.px(10, top + 4, "#2b2b2b");
    s.rect(5, top + 3, 3, 3, P.hair);
  }
  s.g.restore();
  return s.c;
}

/* ---------------------------------------------------------------------------
   Con trỏ ô + biểu tượng phụ
--------------------------------------------------------------------------- */

/**
 * Con trỏ ô. Đây là thứ người chơi NGẮM trên màn hình nhỏ, nên nó phải nổi bật
 * trên mọi màu nền — cỏ xanh, đất nâu, nước xanh, ban đêm.
 *
 * Bản đầu chỉ là 12 chấm 1px ở bốn góc: trên desktop phóng ×7 thì đủ thấy, nhưng
 * trên điện thoại phóng ×2 thì thành vài chấm mờ, gần như vô hình. Bản này dùng
 * ba lớp: nền mờ để cả ô sáng lên, viền tối 1px để tách khỏi nền, rồi ngoặc góc
 * dày 2px làm hình dạng nhận biết.
 */
function makeCursor(ok: boolean): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  const bright = ok ? "#ffffff" : "#ff8a8a";
  const wash = ok ? "rgba(255,255,255,0.16)" : "rgba(255,90,90,0.20)";
  const dark = "rgba(0,0,0,0.55)";
  const L = 6; // chiều dài ngoặc góc
  const T = 2; // độ dày

  s.rect(0, 0, TILE, TILE, wash);

  // viền tối quanh mép: không có nó thì con trỏ trắng chìm nghỉm trên nền sáng
  s.hline(0, 0, TILE, dark);
  s.hline(0, TILE - 1, TILE, dark);
  s.vline(0, 0, TILE, dark);
  s.vline(TILE - 1, 0, TILE, dark);

  // bốn ngoặc góc
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

function makeDrop(): HTMLCanvasElement {
  const s = surface(5, 6);
  s.px(2, 0, "#7fb6ec");
  s.rect(1, 1, 3, 1, "#7fb6ec");
  s.rect(0, 2, 5, 3, "#4a90d9");
  s.rect(1, 5, 3, 1, "#2f6fc4");
  s.px(1, 3, "#a8d4ff");
  return s.c;
}

/* ---------------------------------------------------------------------------
   API
--------------------------------------------------------------------------- */

export interface Atlas {
  grass: HTMLCanvasElement[];
  path: HTMLCanvasElement[];
  soil: HTMLCanvasElement[];
  soilWet: HTMLCanvasElement[];
  water: HTMLCanvasElement[];
  wood: HTMLCanvasElement[];
  voidTile: HTMLCanvasElement;
  tuft: HTMLCanvasElement;
  /** Mọi vật thể, dựng theo props.json. Cao 32px nếu prop khai `tall`. */
  props: Record<string, HTMLCanvasElement>;
  /** khoá = "u d l r" dạng bit + có phải cửa không */
  house: Map<string, HTMLCanvasElement>;
  player: Record<PlayerDir, HTMLCanvasElement[]>;
  /** [cropId][stage] */
  crops: Record<string, HTMLCanvasElement[]>;
  buildings: Record<string, HTMLCanvasElement>;
  cursorOk: HTMLCanvasElement;
  cursorNo: HTMLCanvasElement;
  drop: HTMLCanvasElement;
  /** icon 16x16 cho UI: hạt, nông sản, công cụ, công trình */
  icon(id: string): HTMLCanvasElement | null;
}

function houseKey(n: Neighbors, door: boolean): string {
  return `${n.up ? 1 : 0}${n.down ? 1 : 0}${n.left ? 1 : 0}${n.right ? 1 : 0}${door ? "D" : "-"}`;
}

export function houseVariantKey(n: Neighbors, door: boolean) {
  return houseKey(n, door);
}

function makeSeedIcon(def: CropDef): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  // gói hạt: túi giấy có hình quả bên trên
  s.rect(3, 4, 10, 10, "#d9c9a3");
  s.rect(3, 4, 10, 2, "#c2ad82");
  s.hline(3, 13, 10, "#a8916a");
  s.disc(8, 9, 3, def.art.fruit);
  s.disc(7, 8, 1, def.art.fruitDark);
  return s.c;
}

function makeCropIcon(def: CropDef): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  const a = def.art;
  const r = Math.max(2, Math.min(6, Math.round(a.fruitSize / 2) + 1));
  s.disc(8, 9, r, a.fruit);
  s.disc(7, 8, Math.max(1, r - 2), a.fruitDark);
  s.px(8, 9 - r - 1, a.leafDark);
  s.px(9, 9 - r, a.leaf);
  s.px(7, 9 - r, a.leaf);
  s.px(6 - Math.floor(r / 3), 6, "#ffffff");
  return s.c;
}

/** Vật liệu thô: gỗ, đá, sợi cỏ. */
function makeMaterialIcon(id: string): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  if (id === "wood") {
    // khúc gỗ nhìn nghiêng, thấy mặt cắt
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
  } else {
    // bó sợi cỏ
    for (let i = 0; i < 5; i++) {
      const x = 3 + i * 2;
      s.vline(x, 3 + (i % 2), 10, i % 2 ? "#6aa84f" : "#8ac46a");
    }
    s.rect(2, 8, 12, 2, "#c2ad82");
  }
  return s.c;
}

function makeToolIcon(id: string, action: string): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  // Công cụ cùng loại chỉ khác màu đầu (gỗ vs thép), nên thêm bậc nâng cấp mới
  // chỉ là thêm một dòng trong items.json.
  const steel = id.endsWith("2");
  const head = steel ? "#cdd6e0" : "#b8c6d4";
  const headDark = steel ? "#7c8794" : "#5d7186";
  if (action === "CHOP") {
    for (let i = 0; i < 11; i++) s.px(4 + i, 13 - i, P.wood);
    for (let i = 0; i < 11; i++) s.px(5 + i, 13 - i, P.woodDark);
    s.rect(10, 1, 5, 5, head);
    s.rect(10, 1, 2, 5, headDark);
    s.px(9, 3, headDark);
    return s.c;
  }
  if (action === "MINE") {
    for (let i = 0; i < 11; i++) s.px(4 + i, 13 - i, P.wood);
    for (let i = 0; i < 11; i++) s.px(5 + i, 13 - i, P.woodDark);
    s.rect(9, 2, 6, 2, head);
    s.px(8, 3, head);
    s.px(15, 1, head);
    s.px(8, 1, headDark);
    s.px(14, 3, headDark);
    return s.c;
  }
  if (id === "hoe") {
    for (let i = 0; i < 10; i++) s.px(4 + i, 12 - i, P.wood);
    for (let i = 0; i < 10; i++) s.px(5 + i, 12 - i, P.woodDark);
    s.rect(11, 2, 4, 2, P.metal);
    s.rect(13, 2, 2, 4, P.metal);
    s.hline(11, 2, 4, P.metalDark);
  } else {
    // bình tưới — bản lớn thì thân cao hơn
    const big = id.endsWith("2");
    const top = big ? 5 : 7;
    s.rect(3, top, 8, 14 - top, head);
    s.rect(3, top, 8, 1, "#dbe6f0");
    s.hline(3, 13, 8, headDark);
    s.rect(10, top - 2, 4, 2, head); // vòi
    s.rect(13, top - 4, 2, 3, head);
    s.rect(5, top - 3, 4, 3, headDark); // quai
    s.px(15, top - 4, "#7fb6ec");
    s.px(15, top - 2, "#7fb6ec");
  }
  return s.c;
}

export function buildAtlas(content: Content): Atlas {
  const grass = [0, 1, 2, 3].map(makeGrass);
  const path = [0, 1, 2, 3].map(makePath);
  const wood = [0, 1, 2, 3].map(makePlank);
  const soil = [0, 1].map((v) => makeSoil(false, v));
  const soilWet = [0, 1].map((v) => makeSoil(true, v));
  const water = [0, 1, 2, 3].map(makeWater);

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
  // 4 khung: đứng, bước 1, bước 2, đang thao tác
  for (const d of DIRS) player[d] = [0, 1, 2, 3].map((f) => makePlayer(d, f));

  const crops: Record<string, HTMLCanvasElement[]> = {};
  for (const id of content.cropOrder) {
    const def = content.crops[id]!;
    crops[id] = Array.from({ length: def.growthDays.length + 1 }, (_, st) => makeCrop(def, st));
  }

  const buildings: Record<string, HTMLCanvasElement> = {};
  for (const id of content.buildingOrder)
    buildings[id] = makeBuilding(id, content.buildings[id]!.art);

  // Vật thể dựng theo content: thêm một loại địa hình chỉ là thêm object trong
  // props.json, không phải đụng vào danh sách nào ở đây.
  const FALLBACK_ART: PropArt = { body: "#8a8f98", dark: "#4a4f56", accent: "#c8cfdb" };
  const props: Record<string, HTMLCanvasElement> = {};
  for (const id of content.propOrder) {
    // house/door do lớp autotile của ngôi nhà lo, không vẽ riêng
    if (id === "house" || id === "door") continue;
    props[id] = makeProp(id, content.props[id]?.art ?? FALLBACK_ART);
  }

  // icon cho UI — dựng sẵn để menu không phải vẽ lại mỗi lần mở
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

  return {
    grass, path, soil, soilWet, water, wood,
    voidTile: makeVoid(),
    tuft: makeTuft(),
    props,
    house,
    player,
    crops,
    buildings,
    cursorOk: makeCursor(true),
    cursorNo: makeCursor(false),
    drop: makeDrop(),
    icon: (id) => icons.get(id) ?? null,
  };
}

/** Chọn biến thể theo toạ độ ô — cùng ô luôn ra cùng hoa văn. */
export function variantFor(x: number, y: number, count: number): number {
  return hash2(x, y) % count;
}
