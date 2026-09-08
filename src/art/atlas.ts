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

import type {
  AnimalArt,
  CharSkin,
  Content,
  CropArt,
  CropDef,
  FruitPattern,
} from "../game/types.ts";
import { hash2, mulberry32 } from "../core/rng.ts";

export const TILE = 16;
/** Cây được vẽ trên khung cao hơn ô để cây cao vươn lên trên viền ô. */
export const CROP_H = 24;
/** Nhân vật: 0 đứng · 1-4 bước đi · 5 CHẠM (vung xuống) · 6 GIƠ (công cụ trên đầu). */
/* ---------------------------------------------------------------------------
   KHUNG HÌNH NGƯỜI — Cường: "mấy người làm ít động tác quá, tăng thêm cho tôi đi".

   Bảy khung (đứng · bốn bước đi · chạm · giơ) là đủ cho NGƯỜI CHƠI, vì người
   chơi lúc nào cũng đang làm gì đó do tay mình bấm. Nhưng người làm thuê thì
   phần lớn thời gian đang đi, đang bê, đang nghỉ, đang nói chuyện — và cả bốn
   việc ấy trước giờ dùng chung đúng một khung ĐỨNG. Nhìn ra nông trại thì thấy
   ba người đứng như tượng, thỉnh thoảng trượt sang chỗ khác.

   Nay mười tám khung. Mười một khung mới đều là TƯ THẾ CẢ NGƯỜI, không phải
   thêm khung đi: thêm khung đi chỉ làm bước chân mượt hơn, còn thứ thiếu là
   người ta ĐANG LÀM GÌ.
--------------------------------------------------------------------------- */
export const PLAYER_FRAMES = 18;
export const PLAYER_ACT_FRAME = 5;
export const PLAYER_RAISE_FRAME = 6;
/** BÊ ĐỒ: hai tay đưa ra trước, hơi ngả người ra sau cho cân. */
export const PF_CARRY = 7;
/** MỆT: vai xuôi, đầu cúi, hai tay thõng. */
export const PF_TIRED = 8;
/** NGỒI NGHỈ: gập chân, thân thấp hẳn xuống. */
export const PF_SIT = 9;
/** VẪY TAY chào. */
export const PF_WAVE = 10;
/** NÓI CHUYỆN: một tay khoát ra. */
export const PF_CHAT = 11;
/** NGỒI XỔM: gieo hạt, vuốt ve con vật. */
export const PF_CROUCH = 12;
/** NGHIÊNG BÌNH tưới. */
export const PF_POUR = 13;
/** QUỆT MỒ HÔI. */
export const PF_WIPE = 14;
/** GIƠ HAI TAY mừng. */
export const PF_CHEER = 15;
/** ĐẨY/KÉO: chúi người về trước, hai tay duỗi. */
export const PF_PUSH = 16;
/** CHỈ TAY: một tay chỉ về phía trước. */
export const PF_POINT = 17;

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
  /**
   * ĐÚNG MỘT pixel HD, toạ độ vẫn nhận theo đơn vị cũ.
   *
   * `px` luôn tô một khối `ART × ART` — đó là thứ giữ cho art CHƯA vẽ lại trông
   * y như trước, và nó phải giữ nguyên như thế. Nhưng sprite ĐÃ vẽ lại thì cần
   * một cây bút thật sự mảnh, nếu không "HD" chỉ có nghĩa là hình tròn mượt hơn
   * còn nét vẫn thô gấp đôi. `dot(8.5, 3)` chấm đúng pixel HD thứ 17.
   */
  dot(x: number, y: number, color: string): void;
}

/* ============================================================================
   HỆ SỐ NGHỆ THUẬT — "HD pixel art" mà không đụng một dòng luật chơi nào.

   `TILE` mang HAI vai từ đầu dự án: một ô ăn 16 đơn vị THẾ GIỚI (toạ độ nằm
   trong bản lưu, hộp va chạm, A*), và một sprite rộng 16 PIXEL. Hai vai trùng
   giá trị nên chưa ai phải tách — cho tới lúc muốn nét đẹp hơn.

   `ART` tách chúng: một ô vẫn là 16 đơn vị thế giới, nhưng sprite của nó rộng
   `TILE * ART` pixel. Trên màn hình kích thước KHÔNG đổi một pixel nào (lớp vẽ
   dán ảnh với cỡ đích tường minh), chỉ mật độ chi tiết gấp `ART²`.

   Đo trước khi làm: ở khổ 1000×700 hệ số phóng đang là 4, tức mỗi pixel sprite
   bị thổi thành một ô vuông 4×4 — đó chính là chỗ hình trông thô. Và HD gần như
   miễn phí lúc chạy: sprite 32px vẽ ở hệ số 2 tô đúng ngần ấy pixel đích như
   sprite 16px vẽ ở hệ số 4; atlas chỉ phình từ 0,59 MB lên ~2,35 MB.

   Toạ độ trong các hàm vẽ vẫn viết ở đơn vị CŨ (0..16 cho một ô), nên art chưa
   vẽ lại chạy y nguyên — `px` tô một khối `ART × ART`, tức trông hệt như trước.
   Art ĐÃ vẽ lại dùng `s.dot(x, y)` để chấm đúng một pixel HD, và `Q = 1/ART`
   làm bước lưới. Hai cây bút, một hệ toạ độ: chỗ nào còn `px` là chỗ chưa vẽ
   lại, và điều đó đọc ra được ngay khi nhìn code.
============================================================================ */
export const ART = 2;

/** Cỡ PIXEL của một ô sprite (khác `TILE` — thứ là đơn vị thế giới). */
export const TILE_PX = TILE * ART;
/** Cỡ PIXEL của một sprite cây trồng (cao hơn một ô). */
export const CROP_PX = CROP_H * ART;

function surface(w: number, h: number): Surface {
  const c = document.createElement("canvas");
  c.width = w * ART;
  c.height = h * ART;
  // willReadFrequently: outline() và vài hàm vẽ tán cây đọc lại pixel bằng
  // getImageData; không bật cờ này thì trình duyệt cảnh báo và chậm.
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.imageSmoothingEnabled = false;
  /* Một "pixel" của hàm vẽ là một ô vuông ART×ART trên canvas thật. Nhận toạ độ
     LẺ thì ô ấy nhỏ lại đúng theo — đó là cách một sprite vẽ lại lấy được chi
     tiết mịn mà không cần bộ bút thứ hai. */
  const px = (x: number, y: number, color: string) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    g.fillStyle = color;
    g.fillRect(Math.floor(x * ART), Math.floor(y * ART), ART, ART);
  };
  return {
    c,
    g,
    px,
    rect(x, y, rw, rh, color) {
      g.fillStyle = color;
      g.fillRect(
        Math.floor(x * ART),
        Math.floor(y * ART),
        Math.max(1, Math.floor(rw * ART)),
        Math.max(1, Math.floor(rh * ART)),
      );
    },
    hline(x, y, lw, color) {
      g.fillStyle = color;
      g.fillRect(Math.floor(x * ART), Math.floor(y * ART), Math.max(1, Math.floor(lw * ART)), ART);
    },
    vline(x, y, lh, color) {
      g.fillStyle = color;
      g.fillRect(Math.floor(x * ART), Math.floor(y * ART), ART, Math.max(1, Math.floor(lh * ART)));
    },
    /* `disc` và `ell` lặp trong đơn vị HD chứ không trong đơn vị cũ: lặp thô rồi
       tô khối ART×ART thì hình tròn vẫn răng cưa y như trước, tức HD mà không
       được gì. Ở đây mỗi pixel HD được xét riêng. */
    disc(cx, cy, r, color) {
      const R = r * ART;
      const CX = cx * ART;
      const CY = cy * ART;
      g.fillStyle = color;
      for (let y = -R; y <= R; y++)
        for (let x = -R; x <= R; x++)
          if (x * x + y * y <= R * R + R * 0.35) {
            const hx = Math.floor(CX + x);
            const hy = Math.floor(CY + y);
            if (hx >= 0 && hy >= 0 && hx < c.width && hy < c.height) g.fillRect(hx, hy, 1, 1);
          }
    },
    ell(cx, cy, rx, ry, color) {
      const ax = Math.max(0.5, rx) * ART;
      const ay = Math.max(0.5, ry) * ART;
      const CX = cx * ART;
      const CY = cy * ART;
      g.fillStyle = color;
      for (let y = Math.floor(CY - ay); y <= Math.ceil(CY + ay); y++)
        for (let x = Math.floor(CX - ax); x <= Math.ceil(CX + ax); x++) {
          const dx = (x + 0.5 - CX) / ax;
          const dy = (y + 0.5 - CY) / ay;
          if (dx * dx + dy * dy <= 1 && x >= 0 && y >= 0 && x < c.width && y < c.height)
            g.fillRect(x, y, 1, 1);
        }
    },
    shadow(cx, cy, rx, ry) {
      g.fillStyle = P.shadow;
      g.beginPath();
      g.ellipse(cx * ART, cy * ART, rx * ART, ry * ART, 0, 0, Math.PI * 2);
      g.fill();
    },
    dot(x, y, color) {
      const hx = Math.floor(x * ART);
      const hy = Math.floor(y * ART);
      if (hx < 0 || hy < 0 || hx >= c.width || hy >= c.height) return;
      g.fillStyle = color;
      g.fillRect(hx, hy, 1, 1);
    },
  };
}

/** Bước lưới HD tính bằng ĐƠN VỊ CŨ — khoảng cách giữa hai pixel HD kề nhau. */
const Q = 1 / ART;

/* ---------------------------------------------------------------------------
   LẬT và XOAY một sprite đã vẽ xong.

   Ba chỗ trong file này từng tự viết phép lật bằng `translate`/`scale` với toạ
   độ ĐƠN VỊ CŨ — mà `translate` ăn PIXEL ẢNH. Từ Đợt 24 hai hệ ấy lệch nhau
   `ART` lần, nên mọi con vật quay TRÁI bị cắt mất một nửa, và xe quay trái/lên/
   xuống thì trôi khỏi ô. Gom về hai hàm để phép nhân `ART` chỉ tồn tại một chỗ
   và không ai phải nhớ nó nữa.
--------------------------------------------------------------------------- */

/** Lật ngang. `w`,`h` là cỡ ô tính bằng ĐƠN VỊ CŨ. */
function latNgang(src: CanvasImageSource, w: number, h: number): HTMLCanvasElement {
  const m = surface(w, h);
  m.g.save();
  m.g.translate(w * ART, 0);
  m.g.scale(-1, 1);
  m.g.drawImage(src, 0, 0);
  m.g.restore();
  return m.c;
}

/** Xoay quanh tâm ô vuông cạnh `w` (đơn vị cũ), `goc` tính bằng radian. */
function xoayQuanhTam(src: CanvasImageSource, w: number, goc: number): HTMLCanvasElement {
  const m = surface(w, w);
  const nua = (w * ART) / 2;
  m.g.save();
  m.g.translate(nua, nua);
  m.g.rotate(goc);
  m.g.drawImage(src, -nua, -nua);
  m.g.restore();
  return m.c;
}

const pick = <T,>(arr: readonly T[], r: number): T => arr[Math.floor(r * arr.length) % arr.length]!;

/**
 * Viền 1px quanh mọi pixel đặc. Đây là thay đổi đơn lẻ có tác dụng lớn nhất
 * cho màn hình nhỏ: sprite 16px phóng ×2 mà không viền thì tan vào nền.
 *
 * Pixel "đặc" = alpha ≥ 128 (bóng đổ mờ không tính, nên bóng không bị viền).
 * Viền vẽ đè lên pixel trong suốt/mờ kề bên theo 4 hướng.
 */
function outline(s: Surface, color: string = P.outline, day: number = ART): Surface {
  const w = s.c.width;
  const h = s.c.height;
  const data = s.g.getImageData(0, 0, w, h).data;
  const solid = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < w && y < h && data[(y * w + x) * 4 + 3]! >= 128;
  /* `day` = bề dày viền tính bằng PIXEL HD. Mặc định `ART` giữ đúng diện mạo cũ
     (viền dày bằng một "pixel" của hệ toạ độ cũ); sprite đã vẽ lại truyền `1`
     để có nét mảnh kiểu pixel art độ phân giải cao. Nhờ tham số này mà việc đổi
     sang viền mảnh đi được theo TỪNG LÔ, không phải một cú lật toàn bộ. */
  const d = Math.max(1, Math.floor(day));
  s.g.fillStyle = color;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (solid(x, y)) continue;
      let gan = false;
      for (let k = 1; k <= d && !gan; k++)
        if (solid(x - k, y) || solid(x + k, y) || solid(x, y - k) || solid(x, y + k)) gan = true;
      if (gan) s.g.fillRect(x, y, 1, 1);
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

/* ---------------------------------------------------------------------------
   BA LOẠI NƯỚC.

   Cường: "suối chảy nước chảy thác nước, sóng biển nữa — mấy cái này rất quan
   trọng". Đúng, và bản trước sai một cách rất dễ bỏ qua: hồ cá, con sông và cả
   mặt biển dùng CHUNG một hình gợn lăn tăn. Nghĩa là dòng sông không chảy về
   đâu cả, và mặt biển thì đứng im — mà nước đứng im là thứ mắt người phát hiện
   ra ngay cả khi không gọi được tên.

   Nay ba loại, và lớp vẽ tự SUY ra loại nào từ hình dạng của chính vùng nước
   (xem `loaiNuoc` trong render/draw.ts) — không thêm một ô nào vào bản lưu, và
   bản đồ cũ không phải sửa một ký tự:

     · HỒ TĨNH — gợn lăn tăn, như cũ.
     · SUỐI / SÔNG — vệt dòng chảy kéo dài theo hướng chảy, trôi đều mỗi khung.
     · BIỂN — sóng lừng cuộn về phía bờ, đỉnh sóng có bọt trắng.

   Hồ tĩnh vẽ bằng sprite 16×16 như cũ. Suối và biển thì KHÔNG: chúng vẽ bằng
   một mảng lặp 64×64 tô thẳng bằng `fillRect` (xem `tamNuoc` trong
   render/draw.ts), vì vệt nước phải chảy XUYÊN QUA ranh giới ô — vẽ bằng
   sprite thì mọi ô nước giống hệt nhau và cả con sông ra một tấm lưới ô vuông.
--------------------------------------------------------------------------- */

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


/* ---------------------------------------------------------------------------
   BẢY LOÀI CÂY RỪNG — Cường: "THÊM 5-7 loại cây rừng".

   Một khu rừng chỉ có đúng một loài cây là một khu rừng trồng, không phải rừng.
   Và ở cỡ này thì thứ phân biệt loài cây là ĐƯỜNG BAO của tán chứ không phải
   màu lá: thông là cái nêm, bạch dương là cột trắng có tán thưa, dừa là mấy tàu
   lá toả từ một điểm, liễu là màn lá rủ, phong là quả cầu, tre là bó cọng, cây
   khô là mấy cành trơ. Bảy đường bao ấy nhìn từ xa vẫn tách nhau ra được.
--------------------------------------------------------------------------- */

/** THÔNG: nêm ba tầng, thân thẳng, tán cụp xuống — bóng dáng không lẫn vào đâu. */
function makePine(art: PropArt): HTMLCanvasElement {
  const s = surface(TILE, TILE * 2);
  const baseY = TILE * 2;
  const rnd = mulberry32(0x31a7);
  s.shadow(8, baseY - 2, 5, 2.2);
  voCay(s, 7, baseY - 8, 2.5, 7, P.trunk, P.trunkDark, shade(P.trunk, 1.2));

  /* Ba tầng nêm, tầng dưới rộng nhất. Mép tầng vẽ RĂNG CƯA chứ không thẳng: lá
     kim mọc thành chùm, nên đường bao của thông là một đường gãy khúc. */
  const tang: [number, number, number][] = [
    [baseY - 9, 6.5, 5.5],
    [baseY - 14, 5.2, 5],
    [baseY - 19, 3.6, 4.5],
  ];
  for (const [dy, rong, cao] of tang) {
    for (let d = 0; d <= cao; d += Q) {
      const u = d / cao;
      const w = rong * (1 - u) + 0.6;
      const rang = (Math.floor(d * ART) % 3 === 0 ? 0.4 : 0) + rnd() * 0.3;
      for (let x = -w - rang; x <= w + rang; x += Q)
        s.dot(8 + x, dy - d, Math.abs(x) > w - 0.6 ? art.dark : art.body);
      if (u > 0.25) s.dot(8 - w * 0.45, dy - d, lighten(art.body));
    }
    // gờ tối dưới mỗi tầng — cái làm ba tầng tách nhau ra
    for (let x = -rong - 0.5; x <= rong + 0.5; x += Q) s.dot(8 + x, dy + Q, shade(art.dark, 0.75));
  }
  // ngọn nhọn
  for (let d = 0; d < 1.6; d += Q) s.dot(8, baseY - 24 - d, art.dark);
  return outline(s, shade(art.dark, 0.62), 1).c;
}

/** BẠCH DƯƠNG: thân TRẮNG có vệt đen, tán thưa và cao — sáng nhất trong rừng. */
function makeBirch(art: PropArt): HTMLCanvasElement {
  const s = surface(TILE, TILE * 2);
  const baseY = TILE * 2;
  const rnd = mulberry32(0x9b21);
  s.shadow(8, baseY - 2, 4.5, 2);

  // thân trắng, hơi nghiêng, có mắt gỗ đen
  const vo = art.accent;
  for (let d = 0; d < 15; d += Q) {
    const x = 7.5 + Math.sin(d * 0.12) * 0.5;
    for (let w = 0; w < 1.6; w += Q) s.dot(x + w, baseY - 2 - d, vo);
    s.dot(x, baseY - 2 - d, lighten(vo));
    s.dot(x + 1.5, baseY - 2 - d, shade(vo, 0.78));
  }
  for (let i = 0; i < 6; i++) {
    const y = baseY - 4 - rnd() * 12;
    const x = 7.5 + Math.sin((baseY - 2 - y) * 0.12) * 0.5;
    for (let w = 0; w < 1 + rnd(); w += Q) s.dot(x + w + 0.2, y, "#3a352e");
  }
  // cành chìa ra hai bên
  for (const [by, k, len] of [[baseY - 12, -1, 3], [baseY - 15, 1, 3.5], [baseY - 9, 1, 2]] as const)
    for (let d = 0; d < len; d += Q) s.dot(7.8 + k * d, by - d * 0.5, shade(vo, 0.7));

  /* Tán THƯA: năm cụm nhỏ rời nhau, chừa nhiều trời lọt qua. Bạch dương mà tán
     đặc thì nó chỉ là một cái cây xanh có thân trắng. */
  const cum: [number, number, number][] = [
    [4.5, baseY - 17, 3],
    [11.5, baseY - 18, 3.2],
    [8, baseY - 21, 3.6],
    [5.5, baseY - 22.5, 2.6],
    [11, baseY - 23, 2.4],
  ];
  for (const [cx, cy, r] of cum) cumLa(s, cx, cy, r, art.body, art.dark);
  for (const [cx, cy, r] of cum)
    if (cx <= 8) s.ell(cx - r * 0.2, cy - r * 0.3, r * 0.45, r * 0.3, lighten(art.body));
  return outline(s, shade(art.dark, 0.6), 1).c;
}

/** DỪA: thân cong, bảy tàu lá toả từ ngọn, buồng quả dưới tán. */
function makePalm(art: PropArt): HTMLCanvasElement {
  const s = surface(TILE, TILE * 2);
  const baseY = TILE * 2;
  s.shadow(8, baseY - 2, 5, 2.2);

  // thân CONG — cây dừa thẳng đứng thì thành cái cột điện có lá
  const ngonX = 10;
  const ngonY = baseY - 17;
  const than: [number, number][] = [];
  for (let t = 0; t <= 1; t += Q / 16) {
    const x = 6.5 + t * t * (ngonX - 6.5);
    const y = baseY - 2 - t * (baseY - 2 - ngonY);
    than.push([x, y]);
    for (let w = 0; w < 2.2 - t * 0.8; w += Q) s.dot(x + w, y, art.accent);
    s.dot(x, y, lighten(art.accent));
    s.dot(x + 2 - t * 0.8, y, shade(art.accent, 0.7));
    // ngấn thân
    if (Math.floor(y * ART) % 5 === 0) s.dot(x + 0.5, y, shade(art.accent, 0.6));
  }

  // TÀU LÁ: bảy tàu toả đều, mỗi tàu là một cung rủ có gân giữa và lá kép
  for (let i = 0; i < 7; i++) {
    const goc = Math.PI * (1.06 + (i / 6) * 0.88);
    const dai = 6.2 + (i % 2) * 1.1;
    for (let d = 0; d <= dai; d += Q) {
      const u = d / dai;
      const ru = u * u * 3.4; // đầu tàu rủ xuống
      const x = ngonX + Math.cos(goc) * d;
      const y = ngonY + Math.sin(goc) * d + ru;
      s.dot(x, y, art.dark);
      s.dot(x, y - Q, i % 2 ? art.body : lighten(art.body));
      // lá kép chìa ra hai bên gân
      if (u > 0.15 && Math.floor(d * ART) % 2 === 0) {
        const w = (1 - u) * 1.5 + 0.4;
        s.dot(x, y - Q * 2 - w * 0.4, art.body);
        s.dot(x, y + Q + w * 0.3, art.dark);
      }
    }
  }
  // buồng quả dưới tán
  for (const [dx, dy] of [[-0.5, 1.2], [0.8, 1.6], [0, 2.4]] as const) {
    s.ell(ngonX + dx, ngonY + dy, 1, 1, shade("#8a6a2a", 0.7));
    s.ell(ngonX + dx, ngonY + dy - Q, 1 - Q, 1 - Q, "#b8912f");
  }
  return outline(s, shade(art.dark, 0.6), 1).c;
}

/** LIỄU: tán bè ra, và những dải lá RỦ THẲNG xuống gần chạm đất. */
function makeWillow(art: PropArt): HTMLCanvasElement {
  const s = surface(TILE, TILE * 2);
  const baseY = TILE * 2;
  const rnd = mulberry32(0x4c1d);
  s.shadow(8, baseY - 2, 6, 2.4);
  voCay(s, 6.5, baseY - 9, 3, 8, P.trunk, P.trunkDark, shade(P.trunk, 1.2));

  // tán bè ngang
  const cum: [number, number, number][] = [
    [4, baseY - 15, 4.4],
    [12, baseY - 15, 4.4],
    [8, baseY - 17.5, 5],
  ];
  for (const [cx, cy, r] of cum) cumLa(s, cx, cy, r, art.body, art.dark);
  for (const [cx, cy, r] of cum)
    if (cx <= 8) s.ell(cx - r * 0.2, cy - r * 0.35, r * 0.5, r * 0.3, lighten(art.body));

  /* DẢI LÁ RỦ: mười một dải buông thẳng từ mép tán. Đây là toàn bộ cái làm nên
     cây liễu — bỏ nó đi thì nó chỉ là một cái cây tán bè. */
  for (let i = 0; i < 11; i++) {
    const x = 2 + i * 1.2 + rnd() * 0.4;
    const tren = baseY - 13 + Math.abs(x - 8) * 0.55;
    const dai = 4 + rnd() * 5;
    for (let d = 0; d < dai; d += Q) {
      const lech = Math.sin(d * 0.6 + i) * 0.35;
      s.dot(x + lech, tren + d, d < 1 ? art.dark : i % 2 ? art.body : lighten(art.body));
      if (Math.floor(d * ART) % 3 === 0) s.dot(x + lech + Q, tren + d, art.dark);
    }
  }
  return outline(s, shade(art.dark, 0.6), 1).c;
}

/** PHONG: tán cầu ĐẶC và cao, thân chẻ đôi — cây rợp bóng của khu rừng. */
function makeMaple(art: PropArt): HTMLCanvasElement {
  const s = surface(TILE, TILE * 2);
  const baseY = TILE * 2;
  const rnd = mulberry32(0x7f52);
  s.shadow(8, baseY - 2, 6, 2.5);
  voCay(s, 6.5, baseY - 10, 3, 9, art.accent, shade(art.accent, 0.65), shade(art.accent, 1.25));
  // thân CHẺ ĐÔI ở ngang ngực — nét riêng, phá thế cột thẳng
  for (let d = 0; d < 5; d += Q) {
    s.dot(6 - d * 0.35, baseY - 11 - d, art.accent);
    s.dot(9.5 + d * 0.3, baseY - 11 - d, shade(art.accent, 0.7));
  }

  const cum: [number, number, number][] = [
    [4.5, baseY - 15, 4.6],
    [11.5, baseY - 15, 4.6],
    [8, baseY - 14, 4.4],
    [5.5, baseY - 19.5, 4.4],
    [10.5, baseY - 19.5, 4.4],
    [8, baseY - 22, 4.8],
  ];
  for (const [cx, cy, r] of cum) cumLa(s, cx, cy, r, art.body, art.dark);
  for (const [cx, cy, r] of cum)
    if (cx <= 8 && cy <= baseY - 17) s.ell(cx - r * 0.25, cy - r * 0.35, r * 0.5, r * 0.34, lighten(art.body));
  for (let i = 0; i < 6; i++) {
    const x = 3 + Math.floor(rnd() * 11);
    const y = baseY - 23 + Math.floor(rnd() * 12);
    s.dot(x, y, art.dark);
  }
  return outline(s, shade(art.dark, 0.6), 1).c;
}

/** TRE: một BÓ cọng cao, thân có đốt, lá nhỏ ở ngọn. Cao và mảnh, không có tán. */
function makeBamboo(art: PropArt): HTMLCanvasElement {
  const s = surface(TILE, TILE * 2);
  const baseY = TILE * 2;
  const rnd = mulberry32(0x2ae9);
  s.shadow(8, baseY - 2, 4.5, 2);

  const cong: [number, number, number][] = [
    [5.5, 16, -0.8],
    [8, 21, 0.2],
    [10.5, 18, 1],
    [7, 13, -0.4],
    [9.5, 12, 0.7],
  ];
  for (let i = 0; i < cong.length; i++) {
    const [x0, cao, nghieng] = cong[i]!;
    const mau = i % 2 ? art.body : lighten(art.body);
    for (let d = 0; d < cao; d += Q) {
      const u = d / cao;
      const x = x0 + nghieng * u * u * 2.4;
      for (let w = 0; w < 1; w += Q) s.dot(x + w, baseY - 2 - d, mau);
      s.dot(x, baseY - 2 - d, lighten(mau));
      s.dot(x + 1, baseY - 2 - d, art.dark);
      // ĐỐT: một vòng tối cứ mỗi bốn đơn vị — cái làm cây tre ra cây tre
      if (Math.floor(d) % 4 === 0) {
        s.dot(x, baseY - 2 - d, art.dark);
        s.dot(x + 0.5, baseY - 2 - d, art.dark);
        s.dot(x + 1, baseY - 2 - d, art.dark);
      }
    }
    // lá ở ngọn: ba lá mác toả ra
    const nx = x0 + nghieng * 2.4;
    const ny = baseY - 2 - cao;
    for (let k = -1; k <= 1; k++) {
      const goc = Math.PI * (1.15 + (k + 1) * 0.35);
      for (let d = 0; d < 3.5 + rnd(); d += Q) {
        s.dot(nx + Math.cos(goc) * d, ny + Math.sin(goc) * d + d * d * 0.06, art.dark);
        s.dot(nx + Math.cos(goc) * d, ny + Math.sin(goc) * d + d * d * 0.06 - Q, art.body);
      }
    }
  }
  return outline(s, shade(art.dark, 0.62), 1).c;
}

/** CÂY KHÔ: chỉ còn cành trơ, xám bạc. Chỗ nghỉ mắt giữa một rừng toàn xanh. */
function makeDeadTree(art: PropArt): HTMLCanvasElement {
  const s = surface(TILE, TILE * 2);
  const baseY = TILE * 2;
  s.shadow(8, baseY - 2, 4.5, 2);
  voCay(s, 6.5, baseY - 13, 3, 12, art.body, art.dark, lighten(art.body));

  /* Cành đâm ra theo cung, nhỏ dần và chẻ nhánh ở chót. Cành thẳng đuồn đuột
     thì cây khô trông như một cái chổi cắm ngược. */
  const canh: [number, number, number, number][] = [
    [baseY - 13, -1, 5, -0.55],
    [baseY - 16, 1, 5.5, -0.6],
    [baseY - 19, -1, 4, -0.75],
    [baseY - 21, 1, 3.5, -0.8],
    [baseY - 10, 1, 3, -0.35],
  ];
  for (const [by, k, dai, doc] of canh) {
    let ex = 8;
    let ey = by;
    for (let d = 0; d < dai; d += Q) {
      ex = 8 + k * d;
      ey = by + doc * d;
      s.dot(ex, ey, art.body);
      s.dot(ex, ey + Q, art.dark);
    }
    // chẻ hai nhánh nhỏ ở chót cành
    for (const k2 of [-1, 1])
      for (let d = 0; d < 1.8; d += Q) s.dot(ex + k * d * 0.5, ey - d * (k2 > 0 ? 1 : 0.2), art.dark);
  }
  // ngọn gãy
  for (let d = 0; d < 2.5; d += Q) s.dot(8, baseY - 25 - d, art.dark);
  return outline(s, shade(art.accent, 0.85), 1).c;
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

/* ---------------------------------------------------------------------------
   BA LOẠI ĐÁ NỮA — Cường: "thêm nhiều loại đá".

   Một nông trại chỉ có đúng một hòn đá xám thì mọi chỗ có đá đều trông giống
   nhau, và mắt thôi để ý tới địa hình. Ba loại dưới đây khác nhau ở việc CHÚNG
   LÀM GÌ chứ không chỉ ở hình: đá quặng đập lâu mà cho nhiều đá, đống sỏi nhặt
   được ngay, phiến đá thì đi qua được — nó là mặt sàn, không phải chướng ngại.
--------------------------------------------------------------------------- */

/** ĐÁ QUẶNG — khối đá sẫm có vỉa khoáng vàng lấp lánh, đập sáu nhát. */
function makeRockOre(art: PropArt): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  const rnd = mulberry32(0x6d31);
  s.shadow(8, 14, 5.5, 1.8);
  /* Khối đá GÃY GÓC: sáu mặt phẳng, mỗi mặt một tông. Đá tròn trơn đọc ra là
     quả trứng; đá quặng thì phải trông như vừa bị tách ra khỏi vách núi. */
  const mat: [number, number, number, number, string][] = [
    [2.5, 9, 6, 5, art.dark],
    [4, 6, 6, 5, art.body],
    [8, 7.5, 5.5, 6, shade(art.body, 0.86)],
    [5.5, 4, 4.5, 4, lighten(art.body)],
  ];
  for (const [x0, y0, w, h, mau] of mat)
    for (let y = 0; y < h; y += Q)
      for (let x = 0; x < w; x += Q) {
        // vát bốn góc để mặt đá thành hình đa giác chứ không phải ô vuông
        const u = x / w;
        const v = y / h;
        if (u + v < 0.16 || u + v > 1.84 || u - v > 0.86 || v - u > 0.86) continue;
        s.dot(x0 + x, y0 + y, mau);
      }
  // cạnh gãy: nét sáng ở mép trên mỗi mặt
  for (const [x0, y0, w, , ] of mat) for (let x = 0.5; x < w - 0.5; x += Q) s.dot(x0 + x, y0 + 0.5, lighten(art.body));
  /* VỈA QUẶNG: ba mạch vàng chạy theo cạnh gãy, mỗi mạch có một chấm sáng
     hơn. Rải hạt vàng đều khắp thì nó thành ra đá bị đổ sơn. */
  for (let i = 0; i < 3; i++) {
    const x0 = 4 + rnd() * 6;
    const y0 = 6 + rnd() * 5;
    const goc = rnd() * Math.PI;
    for (let d = 0; d < 2.5 + rnd() * 1.5; d += Q) {
      const x = x0 + Math.cos(goc) * d;
      const y = y0 + Math.sin(goc) * d * 0.6;
      s.dot(x, y, art.accent);
      if (d < Q * 2) s.dot(x, y - Q, lighten(art.accent));
    }
  }
  return outline(s, shade(art.dark, 0.55), 1).c;
}

/** ĐỐNG SỎI — năm hòn nhỏ chồng nhau, nhặt được ngay. */
function makeRockPile(art: PropArt): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  s.shadow(8, 14, 5, 1.6);
  const hon: [number, number, number][] = [
    [4.5, 12, 2.4],
    [11, 12.5, 2],
    [8, 11.5, 2.6],
    [6, 9.5, 1.9],
    [10, 9, 1.6],
  ];
  for (const [cx, cy, r] of hon) {
    s.ell(cx, cy, r, r * 0.78, art.dark);
    s.ell(cx, cy - Q, r - Q, r * 0.78 - Q, art.body);
    s.ell(cx - r * 0.3, cy - r * 0.38, r * 0.36, r * 0.24, art.accent);
  }
  return outline(s, shade(art.dark, 0.6), 1).c;
}

/** PHIẾN ĐÁ — tấm đá phẳng nằm sát đất, ĐI QUA ĐƯỢC. Nó là mặt sàn, không phải
 *  chướng ngại: vẽ nó THẤP và không có bóng dựng, để mắt đọc ra ngay là "chỗ
 *  giẫm lên được" chứ không phải "chỗ phải đi vòng". */
function makeRockFlat(art: PropArt): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  const rnd = mulberry32(0x1f7c);
  for (let y = 4; y < 14; y += Q) {
    const u = (y - 4) / 10;
    const w = 6.4 * Math.sin(Math.PI * (0.18 + 0.72 * u));
    for (let x = -w; x <= w; x += Q) s.dot(8 + x, y, art.body);
    s.dot(8 - w, y, art.dark);
    s.dot(8 + w, y, art.dark);
    if (u < 0.4) s.dot(8 - w + Q, y, art.accent);
  }
  // vết nứt và vài đốm địa y
  for (let d = 0; d < 6; d += Q) s.dot(6 + d * 0.7, 6.5 + d * 0.5, art.dark);
  for (let i = 0; i < 7; i++) {
    const x = 4 + rnd() * 8;
    const y = 5 + rnd() * 8;
    s.dot(x, y, rnd() > 0.5 ? "#7f9e5a" : shade(art.dark, 1.2));
  }
  return outline(s, shade(art.dark, 0.62), 1).c;
}

/**
 * ĐÁ RÊU — tảng đá lớn ven suối, mặt trên phủ rêu.
 *
 * Cường: "ghềnh đá + suối + đá rong trên đá cho chân thực vô". Cái rêu mới là
 * phần quan trọng: một tảng đá xám trơn nằm cạnh dòng nước đọc ra là một cục
 * bê tông, còn có vạt rêu bám mặt hướng nắng thì nó đọc ra là đá NẰM ĐÓ ĐÃ LÂU.
 * Rêu bám mặt TRÊN và rìa hướng nước, không rải đều — rêu rải đều thành ra con
 * đá bị sơn xanh.
 */
function makeBoulder(art: PropArt): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  const rnd = mulberry32(0x8e11);
  const da = art.body;
  const toi = art.dark;
  const sang = lighten(art.body);
  const reu = art.accent;
  const reuToi = shade(art.accent, 0.68);

  s.shadow(8, 14, 6, 2);

  /* Khối đá: một đa giác lệch chứ không phải hình tròn. Đá tròn đều đọc ra là
     quả trứng; đá có cạnh gãy mới đọc ra là đá. */
  const dinh: [number, number][] = [
    [2.5, 11.5], [3, 7.5], [5.5, 4.5], [9, 3.5], [12.5, 5.5], [13.5, 9], [13, 12.5], [8, 13.5],
  ];
  for (let y = 3; y <= 14; y += Q) {
    // biên trái/phải tại độ cao này, nội suy theo đa giác
    let tr = 99;
    let ph = -99;
    for (let i = 0; i < dinh.length; i++) {
      const [ax, ay] = dinh[i]!;
      const [bx, by] = dinh[(i + 1) % dinh.length]!;
      if ((ay <= y && by >= y) || (by <= y && ay >= y)) {
        const t = Math.abs(by - ay) < 1e-6 ? 0 : (y - ay) / (by - ay);
        const x = ax + (bx - ax) * t;
        tr = Math.min(tr, x);
        ph = Math.max(ph, x);
      }
    }
    if (ph < tr) continue;
    for (let x = tr; x <= ph; x += Q) s.dot(x, y, da);
    s.dot(tr, y, toi);
    s.dot(ph, y, toi);
    if (y < 9) s.dot(tr + Q, y, sang);
  }
  // hai vết nứt chéo — cạnh gãy của đá
  for (let d = 0; d < 5; d += Q) s.dot(6 + d * 0.8, 6 + d, toi);
  for (let d = 0; d < 3.5; d += Q) s.dot(11 - d * 0.5, 8 + d, toi);

  /* RÊU: bám mặt trên và đổ xuống mép trái, thành từng vạt lởm chởm. Vẽ bằng
     những cụm nhỏ chồng nhau nên rìa vạt rêu gợn — rìa thẳng thì nó thành một
     vệt sơn. */
  for (let i = 0; i < 14; i++) {
    const cx = 4.5 + rnd() * 7;
    const cy = 4 + rnd() * 3.4;
    const r = 0.8 + rnd() * 1.1;
    for (let dy = -r; dy <= r; dy += Q)
      for (let dx = -r; dx <= r; dx += Q) {
        if (dx * dx + dy * dy > r * r) continue;
        const x = cx + dx;
        const y = cy + dy;
        if (y > 9.5 || x < 3.2 || x > 13) continue;
        s.dot(x, y, dy < -r * 0.3 ? lighten(reu) : reu);
      }
  }
  // vài sợi rêu rủ xuống khỏi vạt — cái làm nó "sống"
  for (let i = 0; i < 6; i++) {
    const x = 4.5 + rnd() * 7.5;
    const h = 1 + rnd() * 2;
    for (let d = 0; d < h; d += Q) s.dot(x, 7.5 + rnd() * 1.5 + d, reuToi);
  }
  return outline(s, shade(art.dark, 0.6), 1).c;
}

/**
 * THÁC NƯỚC — phần TĨNH: gờ đá ở mép trên và hai tảng đá chẻ dòng.
 *
 * Phần ĐỘNG (màn nước đổ) do lớp vẽ lo bằng một mảng lặp trôi nhanh xuống dưới,
 * cùng cách với mặt sông và mặt biển. Tách hai phần vì lý do rất thực tế: vật
 * thể trong atlas là ẢNH TĨNH, một hình một id — muốn nó chảy thì hoặc phải
 * dựng cả một dải khung cho riêng nó, hoặc để lớp vẽ tô đè lên. Cách thứ hai
 * vừa mượt hơn (trôi liên tục, không giật theo khung) vừa rẻ hơn.
 */
function makeWaterfall(art: PropArt): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  const da = art.accent;
  const daToi = shade(art.accent, 0.62);
  // GỜ ĐÁ ở mép trên: chỗ nước bắt đầu đổ
  for (let x = 0; x < TILE; x += Q) {
    const cao = 2.2 + Math.sin(x * 0.9) * 0.5 + (hash2(Math.floor(x * ART), 3, 17) % 3) * 0.25;
    for (let y = 0; y < cao; y += Q) s.dot(x, y, y > cao - 0.6 ? daToi : da);
    s.dot(x, 0, lighten(da));
    // mép nước tràn qua gờ: một vệt sáng ngay dưới gờ
    s.dot(x, cao, art.body);
  }
  // hai tảng đá chẻ dòng, cho màn nước không phẳng lì
  for (const [cx, cy, r] of [
    [4.5, 8.5, 1.8],
    [11.5, 11.5, 1.5],
  ] as const) {
    s.ell(cx, cy, r, r * 0.78, daToi);
    s.ell(cx, cy - Q, r - Q, r * 0.78 - Q, da);
    s.ell(cx - r * 0.3, cy - r * 0.35, r * 0.35, r * 0.24, lighten(da));
    // bọt trắng dồn phía trên tảng đá — nước đập vào đá thì bắn lên
    for (let x = -r; x <= r; x += Q) s.dot(cx + x, cy - r * 0.82, art.body);
  }
  return outline(s, shade(art.dark, 0.7), 1).c;
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
const KHONG_LAN_CAN: Neighbors = { up: false, down: false, left: false, right: false };

function makePier(art: PropArt, rail: Neighbors = KHONG_LAN_CAN): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  s.rect(0, 3, TILE, 10, art.dark);
  s.rect(0, 4, TILE, 8, art.body);
  for (let x = 1; x < TILE; x += 5) s.vline(x, 4, 8, art.dark);   // khe giữa các tấm ván
  s.hline(0, 4, TILE, art.accent);
  s.hline(0, 11, TILE, art.dark);
  s.px(2, 13, art.dark);                                          // chân cọc
  s.px(11, 13, art.dark);
  /* LAN CAN ở cạnh giáp nước (Đợt 21). Cột 2px + thanh ngang sáng; cạnh trên
     và hai bên vẽ ở đây (nằm SAU người đi trên cầu), cạnh dưới nằm ở
     `makePierOver` để vẽ ĐÈ lên người. */
  const cot = shade(art.dark, 0.8);
  const thanh = art.accent;
  if (rail.left) {
    s.rect(0, 1, 2, 11, cot);
    s.hline(0, 1, 2, thanh);
    s.px(0, 6, thanh);
    s.px(1, 6, thanh);
  }
  if (rail.right) {
    s.rect(TILE - 2, 1, 2, 11, cot);
    s.hline(TILE - 2, 1, 2, thanh);
    s.px(TILE - 2, 6, thanh);
    s.px(TILE - 1, 6, thanh);
  }
  if (rail.up) {
    s.rect(0, 0, TILE, 2, cot);
    s.hline(0, 0, TILE, thanh);
    for (let x = 2; x < TILE; x += 5) s.vline(x, 1, 3, cot);
  }
  return s.c;
}

/** Lan can CẠNH DƯỚI của cầu tàu — vẽ sau người đứng trên ô, nên là canvas riêng. */
function makePierOver(art: PropArt): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  const cot = shade(art.dark, 0.8);
  s.rect(0, 12, TILE, 2, cot);
  s.hline(0, 12, TILE, art.accent);
  for (let x = 2; x < TILE; x += 5) s.vline(x, 12, 4, cot);
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

/**
 * Màu VẠT THỨC ĂN theo MÓN đang nằm trong máng (hoặc nổi trên mặt nước).
 *
 * Bảng tay cho vật tư, và suy từ content cho nông sản: đổ củ cải vào máng heo
 * thì vạt thức ăn mang đúng màu củ cải mà `crops.json` khai, không cần thêm một
 * dòng nào ở đây. Món lạ hoàn toàn thì rơi về màu cám trung tính — thà một máng
 * màu chung chung còn hơn một máng vô hình.
 */
const MON_MAU: Record<string, [string, string]> = {
  "item:hay": ["#e3c257", "#a8862a"],
  "item:fodder": ["#93bd5c", "#5f8a34"],
  "item:feedmix": ["#d29a54", "#96662b"],
  // Cám cá màu NÂU ẤM, không phải xanh: nó nằm trên mặt nước xanh, và một
  // vệt xanh trên nền xanh thì bằng như không vẽ.
  "item:fishfeed": ["#f0cf94", "#a8763c"],
};

function mauMon(id: string | null, content: Content): [string, string] {
  if (!id) return ["#000000", "#000000"];
  const t = MON_MAU[id];
  if (t) return t;
  if (id.startsWith("crop:")) {
    const a = content.crops[id.slice(5)]?.art;
    if (a) return [a.fruit, a.fruitDark];
  }
  if (id.startsWith("item:")) {
    const m = MAT[id.slice(5)];
    if (m) return [m.mau, m.toi];
  }
  return ["#c8a86a", "#8a6e40"];
}

/**
 * Cái MÁNG, bốn mức đầy và mang đúng màu món đang nằm trong đó.
 *
 * Trước đây chỉ có MỘT hình, vẽ sẵn một vạt thức ăn màu kem — nên máng cạn và
 * máng đầy nhìn y hệt nhau, và người chơi không có cách nào biết vì sao đàn bò
 * đang đói. Cường bắt đúng chỗ đó.
 *
 *   0 — trống, nhìn thấy đáy gỗ
 *   1 — một lớp mỏng dưới đáy
 *   2 — quá nửa
 *   3 — đầy có ngọn, nhô lên khỏi thành máng
 */
function makeTrough(art: PropArt, muc: number, mau: string, toi: string): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  s.shadow(8, 13, 11, 2);
  // hai chân
  s.rect(3, 11, 2, 3, art.dark);
  s.rect(11, 11, 2, 3, art.dark);
  // lòng máng
  s.rect(2, 6, 12, 6, art.dark);
  s.rect(3, 7, 10, 4, art.body);

  if (muc > 0) {
    /* Vạt thức ăn dâng từ ĐÁY lên: đáy lòng máng ở y=10, miệng ở y=7. Mức 3
       tràn lên trên miệng một pixel — cái nhô lên khỏi thành là thứ nhìn từ xa
       cũng thấy, và đó chính là điều người chơi cần thấy từ bên kia sân. */
    const cao = muc === 1 ? 1 : muc === 2 ? 2 : 3;
    const y = 11 - cao;
    s.rect(4, y, 8, cao, toi);
    s.rect(4, y, 8, Math.max(1, cao - 1), mau);
    s.hline(4, y, 8, lighten(mau));
    if (muc >= 3) {
      // ngọn: hai mô nhô lên khỏi miệng máng
      s.rect(5, y - 1, 3, 1, mau);
      s.rect(9, y - 1, 2, 1, mau);
      s.px(6, y - 2, lighten(mau));
    }
  }

  // thành trước, và hai đầu nhô cao
  s.hline(2, 11, 12, art.dark);
  s.rect(2, 5, 2, 7, art.body);
  s.rect(12, 5, 2, 7, art.body);
  s.hline(2, 5, 2, "#c9a06a");
  s.hline(12, 5, 2, "#c9a06a");
  return outline(s).c;
}

/**
 * Mẻ thức ăn NỔI trên mặt nước — lớp phủ lên ô nước, không phải một ô riêng.
 *
 * Có nó vì rắc cám xuống hồ giờ để lại thức ăn THẬT nằm đó chờ cá tới ăn. Không
 * vẽ ra thì luật mới vô hình y như luật cũ, và Cường lại hỏi đúng câu cũ.
 */
function makePondFeed(muc: number, mau: string, toi: string): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  // Vị trí hạt CỐ ĐỊNH theo mức, không ngẫu nhiên: cùng một mẻ cám thì khung
  // hình nào cũng nằm yên một chỗ, chứ không nhảy lung tung mỗi lần vẽ lại.
  const hat: [number, number][] = [
    [7, 7], [5, 9], [10, 8],
    [4, 6], [9, 11], [12, 9],
    [6, 12], [11, 5], [3, 10],
  ];
  const n = muc <= 1 ? 3 : muc === 2 ? 6 : 9;
  for (let i = 0; i < n && i < hat.length; i++) {
    const [x, y] = hat[i]!;
    /* Viền TỐI quanh mỗi hạt. Không có nó thì mẻ cám chìm nghỉm vào mặt nước —
       màu nào cũng vậy, vì nước là một mảng đặc cùng độ sáng. Viền tách hạt ra
       khỏi nền, đúng cách mọi vật thể khác trong game đang làm. */
    s.px(x, y + 2, "#1d3a52");
    s.px(x + 2, y, "#1d3a52");
    s.px(x + 2, y + 1, "#1d3a52");
    s.px(x + 1, y + 2, "#1d3a52");
    s.px(x, y, toi);
    s.px(x + 1, y, mau);
    s.px(x, y + 1, mau);
    s.px(x + 1, y + 1, toi);
  }
  return s.c;
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
/* Màu tường trong nhà — cố định, vì đồ treo tường (đồng hồ, tranh) phải vẽ CẢ
   mảng tường phía sau chúng, mà chúng lại có bảng màu của riêng mình. */
const TUONG: PropArt = { body: "#6b5540", dark: "#3a2c20", accent: "#8a6f52" };

/** Mảng TƯỜNG gạch — tách riêng vì đồ treo tường vẽ đè lên chính nó. */
function makeWallSurface(): Surface {
  const s = surface(TILE, TILE);
  for (let y = 0; y < TILE; y += Q) for (let x = 0; x < TILE; x += Q) s.dot(x, y, TUONG.body);
  /* Gạch xây SO LE: hàng dưới lệch nửa viên so với hàng trên. Mạch vữa sáng
     hơn viên gạch một nấc, và mép dưới mỗi viên tối một nấc — chừng ấy là đủ
     để bức tường có bề dày thay vì là một mảng màu kẻ ô. */
  const cao = 4;
  const rong = 8;
  for (let hy = 0; hy < TILE; hy += cao) {
    const lech = ((hy / cao) % 2) * (rong / 2);
    for (let x = 0; x < TILE; x += Q) {
      s.dot(x, hy, TUONG.dark);
      s.dot(x, hy + cao - Q, shade(TUONG.body, 0.88));
    }
    for (let x = -rong; x < TILE + rong; x += rong)
      for (let d = Q; d < cao - Q; d += Q) s.dot(x + lech, hy + d, TUONG.dark);
  }
  for (let x = 0; x < TILE; x += Q) {
    s.dot(x, 0, TUONG.accent);
    s.dot(x, Q, lighten(TUONG.accent));
  }
  return s;
}

function makeWall(art: PropArt): HTMLCanvasElement {
  void art;
  return makeWallSurface().c;
}

/** Cửa ra vào nhìn từ trong phòng. */
/* ---------------------------------------------------------------------------
   CỬA MỞ RA ĐƯỢC — Cường: "toà nhà thì cũng phải có hiệu ứng sprite: đóng cửa
   mở cửa… để diễn hoạt động tương tác".

   Cách làm rẻ nhất mà vẫn đúng: cánh cửa là một LỚP PHỦ vẽ đè lên ô nhà, chứ
   không phải một bộ ô nhà thứ hai. Ô nhà có 16 biến thể tự nối × 2 (có cửa /
   không); nhân thêm mười kiểu mở là 320 hình phải dựng lúc mở game, cho một thứ
   chỉ hiện ra khi người chơi đứng sát cửa. Lớp phủ thì mười hình, dựng LƯỜI, và
   ở kiểu 0 nó rỗng — tức là cửa đóng thì không tốn một lệnh vẽ nào.
--------------------------------------------------------------------------- */
function makeDoor(art: PropArt, kieu: number): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  if (kieu <= 0) return s.c; // đóng: lớp phủ rỗng, ô nhà tự lo
  const u = Math.min(1, kieu / 9); // 0 khép, 1 mở hẳn
  const trong = "#241d18";
  // KHUNG CỬA và lòng nhà tối
  for (let y = 2.5; y < TILE - 1; y += Q) for (let x = 3.5; x < 12.5; x += Q) s.dot(x, y, trong);
  /* ÁNH ĐÈN hắt ra: một hình thang sáng loe dần xuống thềm. Đây là thứ làm cái
     cửa đọc ra là ĐANG MỞ chứ không phải một lỗ đen trên tường. */
  for (let y = 3; y < TILE - 1; y += Q) {
    const v = (y - 3) / (TILE - 4);
    const w = (1.5 + v * 2.5) * u;
    for (let x = -w; x <= w; x += Q) s.dot(8 + x, y, v < 0.5 ? "#f7e6b8" : "#e8cf94");
  }
  /* CÁNH CỬA xoay: nhìn từ trên xuống thì nó THU HẸP dần khi mở ra — bề ngang
     cánh bằng cos của góc mở. Cánh trượt sang ngang là cửa lùa, không phải cửa
     bản lề. */
  const rong = Math.max(Q, 4.3 * Math.cos((u * Math.PI) / 2.1));
  for (let y = 2.5; y < TILE - 1; y += Q) {
    for (let x = 0; x < rong; x += Q) s.dot(3.5 + x, y, art.body);
    s.dot(3.5, y, art.accent);
    s.dot(3.5 + rong - Q, y, art.dark);
  }
  if (rong > 1.5) {
    for (let y = 4; y < 9; y += Q) for (let x = 0.5; x < rong - 0.5; x += Q) s.dot(3.5 + x, y, P.glass);
    s.dot(4, 4.5, P.glassLight);
  }
  if (rong > 1) s.dot(3.5 + rong - 0.5, 9.5, P.gold);
  return outline(s, shade(art.dark, 0.6), 1).c;
}

/** Cửa RA của bản đồ trong nhà — cùng cách mở, thêm mũi tên chỉ lối ra. */
function makeDoorIn(art: PropArt, kieu = 0): HTMLCanvasElement {
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
  if (kieu > 0) {
    /* MỞ: cánh thu hẹp về mép trái, lộ ra khoảng sáng ngoài trời. */
    const u = Math.min(1, kieu / 9);
    for (let y = 2; y < TILE - 1; y += Q) for (let x = 2; x < 14; x += Q) s.dot(x, y, "#cfe3f2");
    for (let y = 3; y < TILE - 2; y += Q) for (let x = 3; x < 13; x += Q) s.dot(x, y, "#eaf4ff");
    const rong = Math.max(Q, 11 * Math.cos((u * Math.PI) / 2.1));
    for (let y = 2; y < TILE - 1; y += Q) {
      for (let x = 0; x < rong; x += Q) s.dot(2 + x, y, art.body);
      s.dot(2 + rong - Q, y, art.dark);
    }
    if (rong > 3) for (let y = 3; y < 9; y += Q) for (let x = 1; x < rong - 1; x += Q) s.dot(2 + x, y, art.accent);
    if (rong > 1) s.dot(2 + rong - 0.5, 11, P.gold);
  }
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

/* ---------------------------------------------------------------------------
   NHÀ — Cường: "mấy cái công trình toà nhà" (chưa vẽ lại).

   Nhà là công trình NHIỀU Ô: mỗi ô tự biết bốn hàng xóm của nó (`Neighbors`) và
   vẽ đúng mảnh mình cần, nên một cái nhà 8×3 hay 3×2 đều dựng từ cùng một hàm.
   Ô không có hàng xóm phía trên là MÁI, còn lại là TƯỜNG.

   Bản trước vẽ mái bằng mấy vạch ngang và tường bằng một mảng phẳng. Ở nét HD
   thì cả hai đọc ra là giấy dán tường. Nay mái có NGÓI xếp so le từng hàng
   (hàng dưới đè lên hàng trên, đúng cách lợp thật), tường có ván ốp ngang và
   chân tường, cửa sổ có khung, bậu và một vệt phản chiếu chéo.
--------------------------------------------------------------------------- */
function makeHouseTile(n: Neighbors, door: boolean): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  const isRoof = !n.up;

  if (isRoof) {
    for (let y = 0; y < TILE; y += Q) for (let x = 0; x < TILE; x += Q) s.dot(x, y, P.roof);
    /* NGÓI: bốn hàng, mỗi hàng lệch nửa viên so với hàng trên. Mép dưới mỗi
       viên tối hẳn — đó là cái bóng viên dưới hắt lên viên trên, và cũng là
       thứ duy nhất làm mái có ĐỘ DÀY thay vì là một mảng màu. */
    const cao = 4;
    const rong = 5;
    for (let hy = 0; hy < TILE; hy += cao) {
      const lech = ((hy / cao) % 2) * (rong / 2);
      for (let x = -rong; x < TILE + rong; x += rong) {
        const vx = x + lech;
        // khe dọc giữa hai viên
        for (let d = 0; d < cao - Q; d += Q) s.dot(vx, hy + d, P.roofDark);
        // mép dưới viên: bóng
        for (let d = 0; d < rong; d += Q) {
          s.dot(vx + d, hy + cao - Q, P.roofDark);
          s.dot(vx + d, hy + cao - Q * 2, shade(P.roof, 0.86));
        }
        // đỉnh viên bắt nắng
        for (let d = Q; d < rong - Q; d += Q) s.dot(vx + d, hy, shade(P.roofLight, 1.02));
      }
    }
    // NÓC: hai hàng ngói úp chạy suốt đỉnh mái
    for (let x = 0; x < TILE; x += Q) {
      s.dot(x, 0, P.roofLight);
      s.dot(x, Q, P.roofLight);
      s.dot(x, Q * 2, shade(P.roofLight, 0.8));
    }
    for (let x = 0; x < TILE; x += 2) s.dot(x, Q, shade(P.roofLight, 0.75));
    if (!n.left) for (let y = 0; y < TILE; y += Q) s.dot(0, y, P.roofDark);
    if (!n.right) for (let y = 0; y < TILE; y += Q) s.dot(TILE - Q, y, P.roofDark);
    // DIỀM MÁI nhô ra ở hàng dưới cùng, có ván diềm và bóng đổ xuống tường
    if (n.down) {
      for (let x = 0; x < TILE; x += Q) {
        s.dot(x, TILE - 1.5, P.roofLight);
        s.dot(x, TILE - 1, P.roofDark);
        s.dot(x, TILE - Q, shade(P.roofDark, 0.7));
      }
    }
    // TẤM PIN trên mái — nhà "hiện đại", đặt ở một góc cố định nên không lặp
    if (!n.left && n.right) {
      for (let y = 4; y < 9; y += Q) for (let x = 3; x < 10; x += Q) s.dot(x, y, "#16304f");
      for (let x = 3; x < 10; x += Q) s.dot(x, 4, "#4fa3e3");
      for (let x = 3.5; x < 10; x += 2) for (let y = 4; y < 9; y += Q) s.dot(x, y, "#0d1c30");
      for (let x = 3; x < 10; x += Q) s.dot(x, 9 - Q, "#0a1420");
      s.dot(4, 5, "#9fd0e8");
      s.dot(4.5, 5, "#9fd0e8");
    }
    return s.c;
  }

  // ---- TƯỜNG: ván ốp ngang, có khe và chân tường
  for (let y = 0; y < TILE; y += Q) for (let x = 0; x < TILE; x += Q) s.dot(x, y, P.wall);
  for (let y = 2; y < TILE; y += 3) {
    for (let x = 0; x < TILE; x += Q) {
      s.dot(x, y, P.wallDark);
      s.dot(x, y - Q, shade(P.wall, 0.96));
    }
  }
  for (let x = 0; x < TILE; x += Q) s.dot(x, 0, P.wallDark);
  if (!n.left) for (let y = 0; y < TILE; y += Q) s.dot(0, y, P.wallTrim);
  if (!n.right) for (let y = 0; y < TILE; y += Q) s.dot(TILE - Q, y, P.wallTrim);
  if (!n.down) {
    // chân tường: một dải gỗ đậm, và bóng sát đất
    for (let x = 0; x < TILE; x += Q) {
      s.dot(x, TILE - 1.5, P.wallTrim);
      s.dot(x, TILE - 1, P.wallTrim);
      s.dot(x, TILE - Q, shade(P.wallTrim, 0.6));
    }
  }

  if (door) {
    /* CỬA KÍNH lớn: khung gỗ, hai cánh, tay nắm đồng, và bậc thềm đá. */
    for (let y = 1.5; y < TILE - 0.5; y += Q)
      for (let x = 2.5; x < 13.5; x += Q) s.dot(x, y, P.roofDark);
    for (let y = 2.5; y < TILE - 1.5; y += Q)
      for (let x = 3.5; x < 12.5; x += Q) s.dot(x, y, P.glass);
    // phản chiếu chéo trên mặt kính
    for (let i = 0; i < 14; i++) {
      const x = 4 + i * 0.5;
      for (let d = 0; d < 2.5; d += Q) if (x - d > 3.5) s.dot(x - d, 3 + d, P.glassLight);
    }
    for (let y = 2.5; y < TILE - 1.5; y += Q) s.dot(8, y, P.roofDark); // khe hai cánh
    s.dot(7.5, 9, P.gold);
    s.dot(7.5, 9.5, P.gold);
    s.dot(8.5, 9, P.gold);
    s.dot(8.5, 9.5, P.gold);
    // bậc thềm
    for (let x = 1.5; x < 14.5; x += Q) {
      s.dot(x, TILE - 1, P.pathDark);
      s.dot(x, TILE - Q, shade(P.pathDark, 0.72));
    }
  } else {
    /* CỬA SỔ băng ngang: khung gỗ, bậu cửa nhô ra, chia bốn ô kính. */
    for (let y = 3.5; y < 11; y += Q) for (let x = 1.5; x < 14.5; x += Q) s.dot(x, y, P.wallTrim);
    for (let y = 4.5; y < 10; y += Q) for (let x = 2.5; x < 13.5; x += Q) s.dot(x, y, P.glass);
    for (let y = 4.5; y < 7; y += Q) for (let x = 2.5; x < 13.5; x += Q) s.dot(x, y, P.glassLight);
    for (let y = 4.5; y < 10; y += Q) s.dot(8, y, P.wallTrim);
    for (let x = 2.5; x < 13.5; x += Q) s.dot(x, 7, P.wallTrim);
    // bậu cửa nhô ra và đổ bóng
    for (let x = 1; x < 15; x += Q) {
      s.dot(x, 11, P.wallTrim);
      s.dot(x, 11.5, shade(P.wallTrim, 0.62));
    }
    s.dot(3, 5, "#ffffff");
    s.dot(3.5, 5, "#ffffff");
  }
  return s.c;
}



/* --- địa hình tự nhiên mới (core 1.3): khúc gỗ, cỏ non/dày, bụi nhỏ/lớn --- */

/**
 * Vẽ một vật thể theo id. Đây là chỗ DUY NHẤT ánh xạ id trong props.json sang
 * hình. Id lạ (content mới đẩy qua OTA, core chưa biết vẽ) vẫn ra một hình cọc
 * dễ nhận, chứ không làm trắng màn hình.
 */



/* ---------------------------------------------------------------------------
   KHO — tôn múi. Ở nét HD, "sọc dọc xen kẽ" của bản trước đọc ra là giấy kẻ ô;
   tôn múi thật có SƯỜN nổi: mỗi múi một mặt bắt nắng, một mặt khuất, và một khe
   tối giữa hai múi. Ba tông cạnh nhau là đủ để tấm tôn có hình khối.
--------------------------------------------------------------------------- */
function makeWarehouse(art: PropArt): HTMLCanvasElement {
  const s = makeWarehouseSurface(art);
  // vệt gỉ và đinh tán rải theo băm toạ độ — tất định, không lặp thành hoa văn
  for (let i = 0; i < 5; i++) {
    const x = (hash2(i, 3, 41) % (TILE * ART)) / ART;
    const y = 3 + (hash2(i, 5, 17) % ((TILE - 4) * ART)) / ART;
    s.dot(x, y, shade(art.dark, 0.85));
  }
  return s.c;
}

/** Cửa kho — cửa cuốn kim loại, có nan ngang, ray hai bên và tay nắm đồng. */
function makeStoreDoor(art: PropArt, kieu = 0): HTMLCanvasElement {
  const s = makeWarehouseSurface(art);
  const u = Math.min(1, Math.max(0, kieu / 9)); // 0 kín, 1 cuốn hết lên
  // hốc cửa
  for (let y = 3.5; y < TILE; y += Q)
    for (let x = 2.5; x < 13.5; x += Q) s.dot(x, y, shade(art.dark, 0.6));
  // ray hai bên
  for (let y = 3.5; y < TILE; y += Q) {
    s.dot(2.5, y, art.dark);
    s.dot(13, y, art.dark);
  }
  /* CỬA CUỐN KÉO LÊN: mép dưới của rèm nan trượt lên theo `kieu`, phần đã cuốn
     lộ ra lòng kho tối. Cửa cuốn mà "mở" bằng cách mờ đi thì nó không phải cửa
     cuốn — cái nan phải thật sự đi lên. */
  const day = 3.5 + u * 11;
  for (let y = 3.5; y < day; y += Q) for (let x = 3; x < 13; x += Q) s.dot(x, y, "#241d18");
  if (u > 0.15) for (let x = 3; x < 13; x += Q) s.dot(x, day - Q, shade(art.dark, 0.5));
  for (let y = day; y < TILE - 0.5; y += 1.5) {
    for (let x = 3; x < 13; x += Q) {
      s.dot(x, y, lighten(art.body));
      s.dot(x, y + 0.5, art.body);
      s.dot(x, y + 1, shade(art.dark, 0.8));
    }
  }
  // hộp cuốn ở đỉnh: nan cuốn phải đi đâu đó
  for (let y = 3.5; y < 5; y += Q) for (let x = 3; x < 13; x += Q) s.dot(x, y, art.dark);
  for (let x = 3; x < 13; x += 1.5) for (let y = 3.5; y < 5; y += Q) s.dot(x, y, shade(art.body, 0.8));
  // tay nắm bám theo mép dưới rèm
  if (day < TILE - 3)
    for (let x = 7; x < 9.5; x += Q) {
      s.dot(x, day + 1.5, art.accent);
      s.dot(x, day + 2, shade(art.accent, 0.7));
    }
  return outline(s, shade(art.dark, 0.55), 1).c;
}

/** Nền tôn dùng chung cho kho và cửa kho — cùng một tấm tôn, khác cái cửa. */
function makeWarehouseSurface(art: PropArt): Surface {
  const s = surface(TILE, TILE);
  const sang = lighten(art.body);
  for (let x = 0; x < TILE; x += Q) {
    const pha = (Math.floor(x * ART) % 6) / 6;
    const mau = pha < 0.18 ? art.dark : pha < 0.5 ? sang : pha < 0.85 ? art.body : shade(art.body, 0.82);
    for (let y = 0; y < TILE; y += Q) s.dot(x, y, mau);
  }
  for (let x = 0; x < TILE; x += Q) {
    s.dot(x, 0, art.accent);
    s.dot(x, Q, lighten(art.accent));
    s.dot(x, 1, art.dark);
    s.dot(x, 1.5, shade(art.dark, 0.75));
  }
  return s;
}

/** CỬA HÀNG — mặt tiền kính, mái hiên sọc, biển hiệu, hàng bày trong tủ. */
function makeShop(): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  s.shadow(8, 15, 6.5, 1.6);
  // thân nhà
  for (let y = 1; y < 15.5; y += Q) for (let x = 1.5; x < 14.5; x += Q) s.dot(x, y, P.metal);
  for (let y = 1; y < 15.5; y += Q) {
    s.dot(1.5, y, P.metalDark);
    s.dot(14, y, P.metalDark);
  }
  // TỦ KÍNH: khung, kính, và ba dãy hàng bày bên trong
  for (let y = 4; y < 11; y += Q) for (let x = 3; x < 13; x += Q) s.dot(x, y, P.glass);
  for (let y = 4; y < 6.5; y += Q) for (let x = 3; x < 13; x += Q) s.dot(x, y, P.glassLight);
  for (const [hx, mau] of [[4, "#6cc94f"], [7, "#e8452f"], [10, "#f08a1d"]] as const) {
    for (let y = 7; y < 9.5; y += Q) for (let x = hx; x < hx + 2; x += Q) s.dot(x, y, mau);
    for (let x = hx; x < hx + 2; x += Q) s.dot(x, 7, lighten(mau));
    for (let x = hx; x < hx + 2; x += Q) s.dot(x, 9.5, shade(mau, 0.7));
  }
  // kệ ngang
  for (let x = 3; x < 13; x += Q) s.dot(x, 10, P.metalDark);
  // khung tủ
  for (let y = 3.5; y < 11; y += Q) { s.dot(3, y, P.metalDark); s.dot(12.5, y, P.metalDark); }
  for (let x = 3; x < 13; x += Q) { s.dot(x, 3.5, P.metalDark); s.dot(x, 11, P.metalDark); }
  // MÁI HIÊN sọc, mép dưới răng cưa
  for (let x = 0.5; x < 15.5; x += Q) {
    const soc = Math.floor(x * ART / 3) % 2 === 0;
    for (let y = 0; y < 2.5; y += Q) s.dot(x, y, soc ? P.cap : "#f2ede2");
  }
  for (let x = 0.5; x < 15.5; x += 1) {
    s.dot(x, 2.5, shade(P.cap, 0.7));
    s.dot(x + 0.5, 3, shade(P.cap, 0.7));
  }
  for (let x = 0.5; x < 15.5; x += Q) s.dot(x, 0, P.capLight);
  // đèn hiệu xanh — dấu "đang mở cửa"
  s.dot(12, 12, "#4ade80");
  s.dot(12.5, 12, "#4ade80");
  return outline(s, P.outline, 1).c;
}

/** QUẦY THU MUA — bàn gỗ, cân, máy tính tiền, và nông sản xếp trên mặt quầy. */
function makeCounter(): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  s.shadow(8, 15, 7, 1.6);
  // MẶT QUẦY: ván gỗ ngang, mép trước dày
  for (let y = 7; y < 14.5; y += Q) for (let x = 1; x < 15; x += Q) s.dot(x, y, P.wood);
  for (let y = 8; y < 14; y += 2) for (let x = 1; x < 15; x += Q) s.dot(x, y, shade(P.wood, 0.85));
  for (let x = 1; x < 15; x += Q) {
    s.dot(x, 7, lighten(P.wood));
    s.dot(x, 14, P.woodDark);
    s.dot(x, 14.5, shade(P.woodDark, 0.7));
  }
  // CÂN bàn: đĩa cân và mặt số
  for (let y = 4.5; y < 7; y += Q) for (let x = 2; x < 6; x += Q) s.dot(x, y, P.metalDark);
  for (let x = 1.5; x < 6.5; x += Q) s.dot(x, 4.5, P.metal);
  s.dot(3.5, 5.5, "#e8e8e8");
  s.dot(4, 5.5, "#e8e8e8");
  s.dot(3.5, 6, P.gold);
  // MÁY TÍNH TIỀN: màn hình xanh, phím
  for (let y = 2.5; y < 7; y += Q) for (let x = 8; x < 13.5; x += Q) s.dot(x, y, P.metalDark);
  for (let y = 3; y < 5; y += Q) for (let x = 8.5; x < 13; x += Q) s.dot(x, y, "#16283a");
  s.dot(9, 3.5, "#4ade80"); s.dot(9.5, 3.5, "#4ade80"); s.dot(10.5, 3.5, P.gold);
  for (let x = 8.5; x < 13; x += 1) { s.dot(x, 5.5, P.metal); s.dot(x, 6.2, P.metal); }
  // NÔNG SẢN xếp trên quầy
  for (const [cx, mau] of [[3, "#e8452f"], [6, "#9be86b"], [11.5, "#f08a1d"]] as const) {
    s.ell(cx, 10.5, 1.3, 1.1, shade(mau, 0.7));
    s.ell(cx, 10.2, 1.3 - Q, 1.1 - Q, mau);
    s.dot(cx - 0.5, 9.8, lighten(mau));
  }
  return outline(s, P.outline, 1).c;
}

/** NHÀ CHÓ — mái dốc lợp ván, cửa vòm tối, ván tên treo dưới mái. */
function makeKennel(art: PropArt): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  s.shadow(8, 15, 5, 1.6);
  // thân: ván dọc
  for (let y = 6.5; y < 15; y += Q) for (let x = 2; x < 14; x += Q) s.dot(x, y, art.body);
  for (let x = 3; x < 14; x += 2) for (let y = 6.5; y < 15; y += Q) s.dot(x, y, shade(art.body, 0.86));
  for (let x = 2; x < 14; x += Q) {
    s.dot(x, 14.5, art.dark);
    s.dot(x, 15 - Q, shade(art.dark, 0.7));
  }
  /* MÁI DỐC: hai mặt nghiêng gặp nhau ở nóc, mỗi mặt lợp ván ngang. Bản trước
     là ba hình chữ nhật xếp bậc thang — ở HD nó đọc ra là cái bánh kem. */
  for (let d = 0; d <= 4.5; d += Q) {
    const w = 6.5 - d * 1.1;
    for (let x = -w; x <= w; x += Q) s.dot(8 + x, 6.5 - d, x < 0 ? art.dark : shade(art.dark, 0.82));
    if (Math.floor(d * ART) % 3 === 0)
      for (let x = -w; x <= w; x += Q) s.dot(8 + x, 6.5 - d, shade(art.dark, 0.62));
  }
  for (let x = -1.5; x <= 1.5; x += Q) s.dot(8 + x, 2, art.accent); // nóc
  // CỬA VÒM
  for (let y = 8; y < 15; y += Q) {
    const w = y < 9.5 ? 2 * Math.sin(Math.PI * ((y - 7.5) / 2.5)) + 0.8 : 2.2;
    for (let x = -w; x <= w; x += Q) s.dot(8 + x, y, "#171210");
  }
  for (let y = 8.5; y < 15; y += Q) s.dot(8 - 2.2, y, shade(art.body, 0.6));
  // ván tên
  for (let y = 7.5; y < 9; y += Q) for (let x = 11; x < 13.5; x += Q) s.dot(x, y, art.accent);
  for (let x = 11; x < 13.5; x += Q) s.dot(x, 9, shade(art.accent, 0.65));
  return outline(s, P.outline, 1).c;
}

/** GIẾNG — thành đá xếp, mái ngói nhỏ, ròng rọc và cái gàu treo. */
function makeWell(art: PropArt): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  s.shadow(8, 14.5, 6, 2);
  // THÀNH GIẾNG: đá xếp so le, hai hàng
  for (let y = 8; y < 14; y += Q) for (let x = 2; x < 14; x += Q) s.dot(x, y, art.body);
  for (let hy = 8; hy < 14; hy += 2.5) {
    const lech = ((hy - 8) / 2.5) % 2 ? 1.25 : 0;
    for (let x = 2 + lech; x < 14; x += 2.5) for (let d = 0; d < 2; d += Q) s.dot(x, hy + d, art.dark);
    for (let x = 2; x < 14; x += Q) s.dot(x, hy, shade(art.body, 0.8));
  }
  for (let x = 2; x < 14; x += Q) {
    s.dot(x, 8, lighten(art.body));
    s.dot(x, 13.5, art.dark);
  }
  // MẶT NƯỚC trong lòng giếng
  for (let y = 9.5; y < 12; y += Q) for (let x = 4; x < 12; x += Q) s.dot(x, y, "#2a5fb0");
  for (let x = 4.5; x < 11.5; x += 1.5) s.dot(x, 10, P.waterFoam);
  for (let x = 4; x < 12; x += Q) s.dot(x, 9.5, "#1b3f78");
  // HAI CỘT và MÁI
  for (let y = 3; y < 8.5; y += Q) {
    for (const cx of [3, 12.5]) {
      s.dot(cx, y, P.wood);
      s.dot(cx + 0.5, y, P.woodDark);
    }
  }
  for (let d = 0; d <= 2.5; d += Q) {
    const w = 7 - d * 1.6;
    for (let x = -w; x <= w; x += Q) s.dot(8 + x, 3 - d + 1, x < 0 ? P.roof : shade(P.roof, 0.85));
  }
  for (let x = -7; x <= 7; x += Q) s.dot(8 + x, 4, P.roofDark);
  for (let x = -2; x <= 2; x += Q) s.dot(8 + x, 1, P.roofLight);
  // TRỤC QUAY và GÀU
  for (let x = 3; x < 13; x += Q) s.dot(x, 5.5, P.woodDark);
  for (let d = 0; d < 2; d += Q) s.dot(8, 5.5 + d, "#c9c4b6"); // dây
  for (let y = 7; y < 8.5; y += Q) for (let x = 7; x < 9.2; x += Q) s.dot(x, y, P.wood);
  for (let x = 7; x < 9.2; x += Q) s.dot(x, 7, lighten(P.wood));
  return outline(s, P.outline, 1).c;
}


/* ---------------------------------------------------------------------------
   MƯỜI MỘT LOẠI ĐÁ và MƯỜI LĂM THỨ GỖ CHẾT — Cường: "đá lớn đá nhỏ 10 mấy loại
   khác nhau", "cây chết cành cây khúc cây ngang đường 10 tới 15 loại khác nhau".

   Một nông trại chỉ có đúng một hòn đá xám và một khúc gỗ nâu thì mọi chỗ có đá
   đều trông giống nhau, và mắt thôi để ý tới địa hình. Nhiều loại KHÔNG phải là
   nhiều bảng màu: mỗi thứ dưới đây khác ở BÓNG DÁNG (cột đá dựng đứng khác hẳn
   phiến đá nằm), và phần lớn còn khác ở VIỆC CHÚNG LÀM (đá bazan đập sáu nhát,
   cành khô nhặt một nhát và đi qua được).
--------------------------------------------------------------------------- */

/** Khối đá gãy góc dùng chung: quét từng hàng, hai mép tối, mặt trên bắt nắng. */
function khoiDa(
  s: Surface,
  cx: number,
  yTren: number,
  yDuoi: number,
  rong: (u: number) => number,
  mau: string,
  toi: string,
  sang: string,
): void {
  const h = yDuoi - yTren;
  for (let y = yTren; y <= yDuoi; y += Q) {
    const w = rong((y - yTren) / h);
    if (w <= 0) continue;
    for (let x = -w; x <= w; x += Q) s.dot(cx + x, y, mau);
    s.dot(cx - w, y, toi);
    s.dot(cx + w, y, toi);
    if (y < yTren + h * 0.45) s.dot(cx - w + Q, y, sang);
  }
}

/** CỘT ĐÁ — khối đứng cao, đỉnh vát, chân loe. Bóng dáng thẳng đứng duy nhất. */
function makeRockTall(art: PropArt): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  s.shadow(8, 14.5, 4, 1.6);
  khoiDa(s, 8, 1.5, 14, (u) => 2.2 + u * 2.6 + (u > 0.85 ? 1 : 0), art.body, art.dark, art.accent);
  // hai vết nứt dọc
  for (let d = 0; d < 8; d += Q) s.dot(7 + d * 0.12, 3.5 + d, art.dark);
  for (let d = 0; d < 5; d += Q) s.dot(10 - d * 0.1, 6 + d, art.dark);
  return outline(s, shade(art.dark, 0.55), 1).c;
}

/** ĐÁ PHA LÊ — bệ đá xám, ba tinh thể sáu cạnh mọc lên, trong và sáng. */
function makeRockCrystal(art: PropArt): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  s.shadow(8, 14.5, 5, 1.7);
  khoiDa(s, 8, 9, 14, (u) => 3.2 + u * 1.8, art.body, art.dark, lighten(art.body));
  const tinh: [number, number, number][] = [
    [6, 8.5, 4.5],
    [9.5, 8, 6],
    [11.5, 9.5, 3.2],
  ];
  for (const [cx, cy, cao] of tinh) {
    for (let d = 0; d <= cao; d += Q) {
      const u = d / cao;
      const w = Math.max(Q, 1.35 * (1 - u * 0.85));
      for (let x = -w; x <= w; x += Q) s.dot(cx + x, cy - d, x < 0 ? art.accent : shade(art.accent, 0.78));
      s.dot(cx - w, cy - d, shade(art.accent, 0.6));
      s.dot(cx + w, cy - d, shade(art.accent, 0.6));
    }
    // mặt vát ở đỉnh và một tia sáng bên trong
    s.dot(cx, cy - cao - Q, "#eafcff");
    for (let d = cao * 0.2; d < cao * 0.75; d += Q) s.dot(cx - 0.5, cy - d, "#dff6ff");
  }
  return outline(s, shade(art.dark, 0.55), 1).c;
}

/** ĐÁ NỨT ĐÔI — hai nửa tách ra, khe giữa tối hẳn. */
function makeRockSplit(art: PropArt): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  s.shadow(8, 14.5, 6, 1.8);
  khoiDa(s, 4.5, 5.5, 14, (u) => 1.6 + u * 2.2, art.body, art.dark, art.accent);
  khoiDa(s, 11.5, 6.5, 14, (u) => 1.4 + u * 2, shade(art.body, 0.92), art.dark, art.accent);
  // khe nứt: hai mặt trong tối, hở dần về phía trên
  for (let y = 5.5; y <= 14; y += Q) {
    const w = 0.6 + (14 - y) * 0.12;
    for (let x = -w; x <= w; x += Q) s.dot(8 + x, y, shade(art.dark, 0.55));
  }
  return outline(s, shade(art.dark, 0.55), 1).c;
}

/** ĐÁ SA THẠCH — khối bè, VÂN NGANG từng lớp: đá trầm tích thì có thớ. */
function makeRockSand(art: PropArt): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  s.shadow(8, 14.5, 6.5, 1.8);
  khoiDa(s, 8, 6.5, 14, (u) => 4 + u * 2.2, art.body, art.dark, art.accent);
  for (let y = 7.5; y < 14; y += 1.5) {
    const w = 4 + ((y - 6.5) / 7.5) * 2.2 - 0.5;
    for (let x = -w; x <= w; x += Q) s.dot(8 + x, y, shade(art.body, 0.86));
    for (let x = -w + 1; x <= w - 1; x += Q) s.dot(8 + x, y - Q, art.accent);
  }
  return outline(s, shade(art.dark, 0.6), 1).c;
}

/** ĐÁ BAZAN — sẫm, mặt gãy thành cột lục giác. Loại cứng nhất, đập sáu nhát. */
function makeRockDark(art: PropArt): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  s.shadow(8, 14.5, 5.5, 1.8);
  khoiDa(s, 8, 4.5, 14, (u) => 3 + u * 2.4, art.body, art.dark, art.accent);
  /* Mặt gãy thành CỘT: ba đường dọc và hai đường xiên chia mặt đá thành những
     ô nhiều cạnh. Đây là nét riêng của đá núi lửa, và nó cũng là thứ duy nhất
     tách con này khỏi "một hòn đá màu tối". */
  for (const [x0, y0, dx] of [[6.5, 5.5, 0.1], [9.5, 5, -0.08], [8, 7.5, 0.05]] as const)
    for (let d = 0; d < 6.5; d += Q) s.dot(x0 + dx * d, y0 + d, shade(art.dark, 0.7));
  for (let d = 0; d < 4; d += Q) s.dot(5.5 + d, 9 - d * 0.3, shade(art.dark, 0.7));
  for (let d = 0; d < 3.5; d += Q) s.dot(10 + d, 10 + d * 0.25, shade(art.dark, 0.7));
  return outline(s, shade(art.dark, 0.5), 1).c;
}

/** ĐÁ BIỂN — đá ướt bám rong và mấy con hà trắng ở chân. */
function makeRockSea(art: PropArt): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  const rnd = mulberry32(0x3ba9);
  s.shadow(8, 14.5, 5.5, 1.8);
  khoiDa(s, 8, 6, 14, (u) => 3.4 + u * 2.2, art.body, art.dark, lighten(art.body));
  // rong bám mặt trên
  for (let i = 0; i < 10; i++) {
    const cx = 5 + rnd() * 6;
    const cy = 6.5 + rnd() * 2.4;
    const r = 0.7 + rnd() * 0.8;
    for (let dy = -r; dy <= r; dy += Q)
      for (let dx = -r; dx <= r; dx += Q)
        if (dx * dx + dy * dy <= r * r) s.dot(cx + dx, cy + dy, dy < 0 ? lighten(art.accent) : art.accent);
  }
  // hà bám chân đá
  for (let i = 0; i < 7; i++) {
    const x = 4 + rnd() * 8;
    const y = 11.5 + rnd() * 2;
    s.dot(x, y, "#e6e2d8");
    s.dot(x, y + Q, "#b8b2a4");
  }
  return outline(s, shade(art.dark, 0.55), 1).c;
}

/** Một KHÚC GỖ nằm ngang: trụ tròn, mặt cắt có vòng năm ở một đầu. */
function khucGo(
  s: Surface,
  x0: number,
  x1: number,
  cy: number,
  r: number,
  mau: string,
  toi: string,
  ruot: string,
): void {
  for (let x = x0; x <= x1; x += Q) {
    for (let y = -r; y <= r; y += Q) s.dot(x, cy + y, mau);
    s.dot(x, cy - r, lighten(mau));
    s.dot(x, cy + r, toi);
    s.dot(x, cy - r + Q, mau);
  }
  // MẶT CẮT ở đầu phải: vòng năm đồng tâm — thứ nói "đây là chỗ vừa bị cưa"
  for (let y = -r; y <= r; y += Q) {
    for (let d = 0; d < 1.4; d += Q) s.dot(x1 + d, cy + y, ruot);
  }
  for (const rr of [r * 0.32, r * 0.62, r * 0.9]) {
    for (let a = 0; a < Math.PI * 2; a += 0.22)
      s.dot(x1 + 0.7 + Math.cos(a) * 0.4, cy + Math.sin(a) * rr, toi);
  }
  s.dot(x1 + 0.7, cy, toi);
}

/** KHÚC GỖ RÊU — nằm lâu ngày, mặt trên phủ rêu và mọc mấy tai nấm. */
function makeLogMoss(art: PropArt): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  const rnd = mulberry32(0x77b3);
  s.shadow(8, 13.5, 6.5, 1.6);
  khucGo(s, 1.5, 12.5, 10.5, 2.6, art.body, art.dark, "#c9a06a");
  for (let i = 0; i < 16; i++) {
    const x = 2 + rnd() * 10;
    const r = 0.6 + rnd() * 0.7;
    for (let dy = -r; dy <= r; dy += Q)
      for (let dx = -r; dx <= r; dx += Q)
        if (dx * dx + dy * dy <= r * r) s.dot(x + dx, 8.4 + dy * 0.8, dy < 0 ? lighten(art.accent) : art.accent);
  }
  // ba tai nấm mọc trên lưng khúc gỗ
  for (const [mx, mr] of [[4, 1.3], [7, 1], [10.5, 0.9]] as const) {
    s.ell(mx, 7.4, mr, mr * 0.6, "#c96a3a");
    s.ell(mx, 7.2, mr - Q, mr * 0.6 - Q, "#e08a56");
    for (let d = 0; d < 1; d += Q) s.dot(mx, 7.6 + d, "#e8dcc0");
  }
  return outline(s, shade(art.dark, 0.6), 1).c;
}

/** KHÚC GỖ RỖNG — ruột mục thành một cái hang tối; thú nhỏ chui vừa. */
function makeLogHollow(art: PropArt): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  s.shadow(8, 13.5, 6.5, 1.6);
  khucGo(s, 1.5, 12.5, 10.5, 2.8, art.body, art.dark, "#b8905c");
  // miệng hang ở đầu phải
  for (let y = -1.9; y <= 1.9; y += Q) {
    const w = 1.4 * Math.sqrt(Math.max(0, 1 - (y / 1.9) ** 2));
    for (let x = -w; x <= w; x += Q) s.dot(12.6 + x, 10.5 + y, art.accent);
  }
  for (let y = -1.6; y <= 1.6; y += Q) s.dot(11.6, 10.5 + y, shade(art.dark, 0.7));
  // vỏ cây bong tróc
  for (const [x, w] of [[3.5, 2], [6.5, 1.5], [9, 2.5]] as const)
    for (let d = 0; d < w; d += Q) s.dot(x + d, 9.2, shade(art.dark, 0.85));
  return outline(s, shade(art.dark, 0.6), 1).c;
}

/** KHÚC GỖ CHẺ — bổ dọc làm đôi, lộ ruột gỗ sáng và thớ dọc. */
function makeLogSplit(art: PropArt): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  s.shadow(8, 13.5, 6, 1.6);
  // nửa dưới nằm ngửa, lộ mặt chẻ
  for (let x = 2; x <= 13; x += Q) {
    for (let y = -2.2; y <= 1.2; y += Q) s.dot(x, 11 + y, y < -0.6 ? art.accent : art.body);
    s.dot(x, 8.8, lighten(art.accent));
    s.dot(x, 12.2, art.dark);
  }
  // thớ gỗ chạy dọc mặt chẻ
  for (let y = -1.8; y <= -0.8; y += 0.5)
    for (let x = 2.5; x <= 12.5; x += Q) s.dot(x, 11 + y, shade(art.accent, 0.86));
  // nửa trên kê chéo lên
  khucGo(s, 3.5, 11, 6.4, 1.8, art.body, art.dark, art.accent);
  return outline(s, shade(art.dark, 0.6), 1).c;
}

/** CÀNH GÃY — một nhánh trơ có hai nhánh con. Đi qua được. */
function makeBranch(art: PropArt): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  s.shadow(8, 13, 5, 1.2);
  for (let d = 0; d < 12; d += Q) {
    const x = 2 + d;
    const y = 11.5 - Math.sin(d * 0.24) * 2.2;
    for (let w = 0; w < 0.9; w += Q) s.dot(x, y + w, art.body);
    s.dot(x, y, art.accent);
    s.dot(x, y + 0.9, art.dark);
  }
  for (const [x0, y0, k, len] of [[5.5, 10.2, -1, 3], [9, 9.6, 1, 2.4]] as const)
    for (let d = 0; d < len; d += Q) {
      s.dot(x0 + d * 0.7, y0 + k * d * 0.7, art.body);
      s.dot(x0 + d * 0.7, y0 + k * d * 0.7 + Q, art.dark);
    }
  return outline(s, shade(art.dark, 0.6), 1).c;
}

/** ĐỐNG CÀNH — mấy nhánh chất chéo lên nhau. */
function makeBranchPile(art: PropArt): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  const rnd = mulberry32(0x51c8);
  s.shadow(8, 13.5, 6, 1.5);
  for (let i = 0; i < 7; i++) {
    const x0 = 2 + rnd() * 3;
    const y0 = 9 + rnd() * 4;
    const goc = -0.5 + rnd() * 1;
    const dai = 5 + rnd() * 5;
    const mau = i % 2 ? art.body : shade(art.body, 0.86);
    for (let d = 0; d < dai; d += Q) {
      const x = x0 + Math.cos(goc) * d;
      const y = y0 + Math.sin(goc) * d;
      s.dot(x, y, mau);
      s.dot(x, y + Q, art.dark);
      if (d < Q * 2) s.dot(x, y, art.accent);
    }
  }
  return outline(s, shade(art.dark, 0.6), 1).c;
}

/** GỐC CÂY RÊU — gốc cũ phủ rêu, có nấm mọc quanh chân. */
function makeStumpMoss(art: PropArt): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  const rnd = mulberry32(0x2c71);
  s.shadow(8, 14, 5.5, 1.8);
  // thân gốc, có bờ rễ loe
  for (let y = 7; y <= 14; y += Q) {
    const w = 3.6 + ((y - 7) / 7) * 1.8;
    for (let x = -w; x <= w; x += Q) s.dot(8 + x, y, art.body);
    s.dot(8 - w, y, art.dark);
    s.dot(8 + w, y, art.dark);
    s.dot(8 - w + Q, y, lighten(art.body));
  }
  // mặt cắt trên, có vòng năm
  s.ell(8, 6.8, 3.8, 1.6, art.dark);
  s.ell(8, 6.6, 3.4, 1.3, "#c9a06a");
  for (const rr of [1.1, 2.2, 3]) s.ell(8, 6.6, rr, rr * 0.4, shade("#c9a06a", 0.82));
  // rêu phủ mép trên và đổ xuống một bên
  for (let i = 0; i < 14; i++) {
    const cx = 5 + rnd() * 6;
    const cy = 6 + rnd() * 3;
    const r = 0.6 + rnd() * 0.7;
    for (let dy = -r; dy <= r; dy += Q)
      for (let dx = -r; dx <= r; dx += Q)
        if (dx * dx + dy * dy <= r * r && cy + dy > 5.6) s.dot(cx + dx, cy + dy, dy < 0 ? lighten(art.accent) : art.accent);
  }
  // nấm ở chân gốc
  for (const [mx, my] of [[3.5, 13], [12.5, 13.5]] as const) {
    s.ell(mx, my, 1.2, 0.7, "#c04a48");
    s.ell(mx, my - Q, 1.2 - Q, 0.7 - Q, "#e06a62");
    for (let d = 0; d < 1; d += Q) s.dot(mx, my + 0.4 + d, "#e8dcc0");
  }
  return outline(s, shade(art.dark, 0.6), 1).c;
}

/** GỐC CÂY CHÁY — than đen, mép cháy xém, tro rải quanh chân. */
function makeStumpBurnt(art: PropArt): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  const rnd = mulberry32(0x8d40);
  s.shadow(8, 14, 5, 1.8);
  for (let y = 6.5; y <= 14; y += Q) {
    const w = 3.2 + ((y - 6.5) / 7.5) * 1.6;
    for (let x = -w; x <= w; x += Q) s.dot(8 + x, y, art.body);
    s.dot(8 - w, y, art.dark);
    s.dot(8 + w, y, art.dark);
  }
  /* MÉP TRÊN GÃY NHỌN: cây cháy thì ngọn gãy nham nhở, không phải bị cưa
     phẳng. Đây là thứ tách nó khỏi một cái gốc cây bình thường sơn đen. */
  for (let x = -3.4; x <= 3.4; x += Q) {
    const cao = 6.5 - Math.abs(Math.sin(x * 1.7)) * 1.6 - (rnd() > 0.7 ? 0.5 : 0);
    for (let y = cao; y < 7; y += Q) s.dot(8 + x, y, art.dark);
    s.dot(8 + x, cao, "#1b1714");
  }
  // vệt than nứt và tro
  for (let i = 0; i < 9; i++) {
    const x = 5 + rnd() * 6;
    const y = 8 + rnd() * 5;
    s.dot(x, y, "#1b1714");
    if (rnd() > 0.6) s.dot(x, y + Q, art.accent);
  }
  for (let i = 0; i < 8; i++) s.dot(3 + rnd() * 10, 13.5 + rnd() * 1.2, art.accent);
  return outline(s, shade(art.dark, 0.6), 1).c;
}

/** CÂY ĐỔ — thân to nằm chéo qua ô, rễ bật lên ở một đầu. */
function makeDeadfall(art: PropArt): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  s.shadow(8, 13.5, 7, 1.8);
  // thân nằm chéo
  for (let d = 0; d <= 14; d += Q) {
    const x = 1 + d;
    const y = 12 - d * 0.34;
    for (let w = -2.4; w <= 2.4; w += Q) s.dot(x, y + w, art.body);
    s.dot(x, y - 2.4, lighten(art.body));
    s.dot(x, y + 2.4, art.dark);
  }
  // thớ vỏ dọc thân
  for (const off of [-1.2, 0.2, 1.4])
    for (let d = 1; d < 13; d += Q) s.dot(1 + d, 12 - d * 0.34 + off, shade(art.body, 0.84));
  // BẦU RỄ bật lên ở đầu trái — cái nói "cây này bị bật gốc", không phải bị cưa
  for (let i = 0; i < 9; i++) {
    const goc = Math.PI * (0.62 + (i / 8) * 0.76);
    for (let d = 0; d < 3.5; d += Q) {
      const x = 2 + Math.cos(goc) * d;
      const y = 11.5 + Math.sin(goc) * d;
      s.dot(x, y, art.accent);
      s.dot(x, y + Q, shade(art.accent, 0.66));
    }
  }
  return outline(s, shade(art.dark, 0.6), 1).c;
}

/** GỖ TRÔI — bạc phếch vì nước biển, nhẵn, có lỗ mọt. */
function makeDriftwood(art: PropArt): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  const rnd = mulberry32(0x6f2a);
  s.shadow(8, 13.5, 6, 1.4);
  for (let d = 0; d <= 13; d += Q) {
    const x = 1.5 + d;
    const y = 11 + Math.sin(d * 0.4) * 0.9;
    const r = 1.6 - Math.abs(d / 13 - 0.5) * 1.1;
    for (let w = -r; w <= r; w += Q) s.dot(x, y + w, art.body);
    s.dot(x, y - r, art.accent);
    s.dot(x, y + r, art.dark);
  }
  // hai nhánh cụt và mấy lỗ mọt
  for (let d = 0; d < 3; d += Q) s.dot(6 + d * 0.5, 10.5 - d, art.body);
  for (let d = 0; d < 2.2; d += Q) s.dot(10 - d * 0.4, 12 + d * 0.6, art.body);
  for (let i = 0; i < 6; i++) s.dot(3 + rnd() * 9, 10.4 + rnd() * 1.4, art.dark);
  return outline(s, shade(art.dark, 0.65), 1).c;
}

/** RỄ TRỒI — mấy sống rễ nổi lên khỏi mặt đất. Đi qua được. */
function makeRoots(art: PropArt): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  for (let i = 0; i < 4; i++) {
    const y0 = 6.5 + i * 2.2;
    const bien = i % 2 ? 1 : -1;
    for (let d = 0; d <= 13; d += Q) {
      const x = 1.5 + d;
      const y = y0 + Math.sin(d * 0.32 + i) * 1.1 * bien;
      s.dot(x, y, art.body);
      s.dot(x, y + Q, art.dark);
      if (Math.floor(d * ART) % 7 === 0) s.dot(x, y - Q, art.accent);
    }
  }
  return outline(s, shade(art.dark, 0.7), 1).c;
}

/** CÀNH KHÔ — dăm que nhỏ rải trên cỏ. Nhặt một nhát, đi qua được. */
function makeTwigs(art: PropArt): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  const rnd = mulberry32(0x9a4e);
  for (let i = 0; i < 9; i++) {
    const x0 = 2 + rnd() * 10;
    const y0 = 6 + rnd() * 7;
    const goc = rnd() * Math.PI;
    const dai = 1.8 + rnd() * 2.6;
    for (let d = 0; d < dai; d += Q) {
      s.dot(x0 + Math.cos(goc) * d, y0 + Math.sin(goc) * d, i % 3 ? art.body : art.accent);
      s.dot(x0 + Math.cos(goc) * d, y0 + Math.sin(goc) * d + Q, art.dark);
    }
  }
  return outline(s, shade(art.dark, 0.72), 1).c;
}

/** ĐỐNG CỦI — củi xếp thành chồng, đầu khúc quay ra ngoài. */
function makeLogPile(art: PropArt): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  s.shadow(8, 14, 6.5, 1.7);
  /* Xếp ba hàng, hàng trên lệch nửa khúc. Nhìn thẳng vào ĐẦU khúc nên mỗi khúc
     là một mặt cắt tròn có vòng năm — đó là hình một đống củi xếp gọn, khác
     hẳn một mớ cành chất bừa (`branch_pile`). */
  for (let hang = 0; hang < 3; hang++) {
    const cy = 13 - hang * 2.4;
    const lech = (hang % 2) * 1.2;
    for (let i = 0; i < 5; i++) {
      const cx = 3 + lech + i * 2.4;
      if (cx > 13.5) continue;
      s.ell(cx, cy, 1.2, 1.15, art.dark);
      s.ell(cx, cy - Q, 1.2 - Q, 1.15 - Q, art.accent);
      s.ell(cx, cy, 0.55, 0.5, shade(art.accent, 0.82));
      s.dot(cx, cy, art.dark);
      s.dot(cx - 0.5, cy - 0.5, lighten(art.accent));
    }
  }
  return outline(s, shade(art.dark, 0.6), 1).c;
}


/* ---------------------------------------------------------------------------
   ĐỒ ĐẠC TRONG NHÀ — Cường: "thêm 1 số đồ đạc bàn ghế ở trong nhà nữa bạn".

   Trong nhà trước giờ là mười bốn ô ván sàn với đúng một cái giường. Người chơi
   bước vào, thấy một căn phòng trống, rồi bước ra — cả bản đồ ấy không có lý do
   nào để tồn tại ngoài chỗ ngủ.

   Mười bốn món dưới đây đều nhìn TỪ TRÊN XUỐNG, cùng góc với cả game: cái bàn
   là mặt bàn nhìn từ trên, cái ghế là mặt ngồi và cái lưng tựa đổ về sau. Vẽ
   chúng như nhìn ngang (kiểu ảnh danh mục nội thất) là lỗi mà con thuyền đã
   mắc, và nó đọc ra "kì" ngay lập tức.
--------------------------------------------------------------------------- */

/** Mặt gỗ có thớ dọc — dùng chung cho bàn, kệ, tủ, thùng. */
function matGo(s: Surface, x0: number, y0: number, w: number, h: number, art: PropArt): void {
  for (let y = 0; y < h; y += Q) for (let x = 0; x < w; x += Q) s.dot(x0 + x, y0 + y, art.body);
  for (let x = 1; x < w; x += 2.5) for (let y = 0; y < h; y += Q) s.dot(x0 + x, y0 + y, shade(art.body, 0.88));
  for (let x = 0; x < w; x += Q) {
    s.dot(x0 + x, y0, lighten(art.body));
    s.dot(x0 + x, y0 + h - Q, art.dark);
  }
  for (let y = 0; y < h; y += Q) {
    s.dot(x0, y0 + y, shade(art.body, 0.9));
    s.dot(x0 + w - Q, y0 + y, art.dark);
  }
}

/** BÀN ĂN — mặt bàn nhìn từ trên, bốn chân thò ra bốn góc, một bộ đồ ăn bày sẵn. */
function makeTable(art: PropArt): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  s.shadow(8, 14, 6.5, 1.6);
  for (const [cx, cy] of [[2.5, 12.5], [12, 12.5], [2.5, 3], [12, 3]] as const)
    for (let y = 0; y < 2; y += Q) for (let x = 0; x < 1.5; x += Q) s.dot(cx + x, cy + y, art.dark);
  matGo(s, 1.5, 2.5, 13, 11, art);
  // đĩa và cốc bày trên bàn
  s.ell(6, 7.5, 2.2, 1.8, shade(art.accent, 0.82));
  s.ell(6, 7.2, 1.8, 1.4, art.accent);
  s.ell(6, 7.2, 0.7, 0.6, "#d8b276");
  s.ell(10.5, 6.5, 1.1, 1, "#e8e4d8");
  s.ell(10.5, 6.3, 0.8, 0.7, "#ffffff");
  return outline(s, shade(art.dark, 0.6), 1).c;
}

/** GHẾ — mặt ngồi vuông, lưng tựa đổ về phía sau (phía trên ô). */
function makeChair(art: PropArt): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  s.shadow(8, 14, 4, 1.4);
  // lưng tựa: ba nan dọc
  for (let x = 4.5; x < 11.5; x += Q) for (let y = 3; y < 4.5; y += Q) s.dot(x, y, art.dark);
  for (const nx of [5.5, 7.5, 9.5]) for (let y = 4.5; y < 6.5; y += Q) s.dot(nx, y, art.body);
  for (let x = 4.5; x < 11.5; x += Q) s.dot(x, 3, art.accent);
  // mặt ngồi
  matGo(s, 4, 6.5, 8, 5, art);
  // bốn chân
  for (const cx of [4.5, 10.5]) for (let y = 11.5; y < 13.5; y += Q) for (let x = 0; x < 1; x += Q) s.dot(cx + x, y, art.dark);
  return outline(s, shade(art.dark, 0.6), 1).c;
}

/** THẢM — nằm sát sàn, ĐI QUA ĐƯỢC: viền hoa văn và tua rua hai đầu. */
function makeRug(art: PropArt): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  for (let y = 1; y < 15; y += Q) for (let x = 0; x < TILE; x += Q) s.dot(x, y, art.body);
  for (let y = 2; y < 14; y += Q) for (let x = 1; x < 15; x += Q) s.dot(x, y, art.dark);
  for (let y = 3.5; y < 12.5; y += Q) for (let x = 2.5; x < 13.5; x += Q) s.dot(x, y, art.body);
  // hoa văn quả trám ở giữa
  for (let d = 0; d <= 3; d += Q) {
    for (let k = -d; k <= d; k += Q) {
      s.dot(8 + k, 8 - (3 - d), art.accent);
      s.dot(8 + k, 8 + (3 - d), art.accent);
    }
  }
  // tua rua hai đầu
  for (let x = 0.5; x < 15.5; x += 1) {
    s.dot(x, 0.5, art.accent);
    s.dot(x, 15, art.accent);
  }
  return s.c;
}

/** KỆ SÁCH — ba tầng, sách xếp đứng đủ màu. */
function makeShelf(art: PropArt): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  s.shadow(8, 14.5, 6, 1.5);
  matGo(s, 1.5, 2, 13, 12.5, art);
  const mau = ["#c04a48", "#4a7fa6", "#c9a02a", "#4f8a3f", "#8a5ca8", "#c96a3a"];
  for (let tang = 0; tang < 3; tang++) {
    const y0 = 3 + tang * 4;
    for (let x = 1.5; x < 14.5; x += Q) s.dot(x, y0 + 3.2, art.dark);
    let x = 2.5;
    let i = tang * 2;
    while (x < 13.5) {
      const w = 0.5 + ((i * 7) % 3) * 0.5;
      const c = mau[(i + tang) % mau.length]!;
      for (let dx = 0; dx < w; dx += Q) for (let y = y0; y < y0 + 3; y += Q) s.dot(x + dx, y, c);
      for (let dx = 0; dx < w; dx += Q) s.dot(x + dx, y0, lighten(c));
      x += w + Q;
      i++;
    }
  }
  return outline(s, shade(art.dark, 0.6), 1).c;
}

/** TỦ ĐỨNG — hai cánh, tay nắm đồng, gờ chân tủ. */
function makeCabinet(art: PropArt): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  s.shadow(8, 14.5, 5.5, 1.5);
  matGo(s, 2, 1.5, 12, 13, art);
  for (let y = 2.5; y < 13.5; y += Q) s.dot(8, y, art.dark);
  // tay nắm đồng trên hai cánh, và gờ chân tủ
  for (const cx of [6.5, 9.5]) for (let y = 7; y < 9; y += Q) s.dot(cx, y, art.accent);
  for (let y = 3.5; y < 12.5; y += Q) { s.dot(3.5, y, shade(art.body, 0.86)); s.dot(12.5, y, shade(art.body, 0.86)); }
  for (let x = 2; x < 14; x += Q) { s.dot(x, 12.5, art.dark); s.dot(x, 13, shade(art.dark, 0.7)); }
  return outline(s, shade(art.dark, 0.6), 1).c;
}

/** BẾP LÒ — mặt bếp bốn vòng, một vòng đang đỏ lửa, và cái nồi trên đó. */
function makeStove(art: PropArt): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  s.shadow(8, 14.5, 6, 1.5);
  for (let y = 2; y < 14.5; y += Q) for (let x = 1.5; x < 14.5; x += Q) s.dot(x, y, art.body);
  for (let x = 1.5; x < 14.5; x += Q) { s.dot(x, 2, lighten(art.body)); s.dot(x, 14, art.dark); }
  for (const [cx, cy] of [[5, 5.5], [11, 5.5], [5, 10.5], [11, 10.5]] as const) {
    s.ell(cx, cy, 2.2, 2, art.dark);
    s.ell(cx, cy, 1.6, 1.4, shade(art.body, 0.8));
  }
  // vòng đang đỏ + cái nồi
  s.ell(5, 5.5, 1.6, 1.4, art.accent);
  s.ell(11, 10.5, 2.4, 2.2, "#6b7078");
  s.ell(11, 10.2, 2, 1.8, "#9aa0a8");
  s.dot(13.4, 10.5, "#4a4f56");
  return outline(s, shade(art.dark, 0.6), 1).c;
}

/** BỒN RỬA — chậu men trắng, vòi cong, một dòng nước. */
function makeSink(art: PropArt): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  s.shadow(8, 14.5, 6, 1.5);
  for (let y = 4; y < 14.5; y += Q) for (let x = 1.5; x < 14.5; x += Q) s.dot(x, y, art.body);
  for (let x = 1.5; x < 14.5; x += Q) { s.dot(x, 4, "#eef0f4"); s.dot(x, 14, art.dark); }
  // chậu trũng
  for (let y = 6; y < 12.5; y += Q) for (let x = 3.5; x < 12.5; x += Q) s.dot(x, y, art.dark);
  for (let y = 6.5; y < 12; y += Q) for (let x = 4; x < 12; x += Q) s.dot(x, y, shade(art.body, 0.9));
  s.ell(8, 11, 1.2, 0.8, art.accent);
  // vòi
  for (let y = 3; y < 6; y += Q) s.dot(8, y, "#b8bec6");
  for (let x = 8; x < 10; x += Q) s.dot(x, 3, "#b8bec6");
  for (let y = 3; y < 5; y += Q) s.dot(9.8, y, "#b8bec6");
  for (let y = 5; y < 8; y += Q) s.dot(9.8, y, art.accent);
  return outline(s, shade(art.dark, 0.6), 1).c;
}

/** ĐÈN SÀN — chân ba càng, cột, chao đèn toả sáng vàng. */
function makeLamp(art: PropArt): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  s.shadow(8, 14.5, 3.5, 1.3);
  for (const k of [-1, 0, 1]) for (let d = 0; d < 2.2; d += Q) s.dot(8 + k * d, 14 - Math.abs(k) * 0, art.dark);
  for (let y = 6; y < 14; y += Q) { s.dot(8, y, art.body); s.dot(8.5, y, art.dark); }
  // chao đèn: hình thang, mép dưới rộng
  for (let d = 0; d <= 4; d += Q) {
    const w = 1.6 + d * 0.75;
    for (let x = -w; x <= w; x += Q) s.dot(8.2 + x, 2 + d, x < 0 ? art.accent : shade(art.accent, 0.85));
  }
  for (let x = -4.6; x <= 4.6; x += Q) s.dot(8.2 + x, 6, shade(art.accent, 0.6));
  // quầng sáng hắt xuống
  for (let d = 0; d < 2.5; d += Q) {
    const w = 3 + d;
    for (let x = -w; x <= w; x += Q) if ((Math.floor(x * ART) + Math.floor(d * ART)) % 3 === 0) s.dot(8.2 + x, 6.5 + d, "#ffefc0");
  }
  return outline(s, shade(art.dark, 0.6), 1).c;
}

/** CHẬU CÂY — chậu gốm và một bụi lá xoè. */
function makePotPlant(art: PropArt): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  s.shadow(8, 14.5, 4, 1.4);
  for (let y = 9; y < 14.5; y += Q) {
    const w = 3.4 - (y - 9) * 0.28;
    for (let x = -w; x <= w; x += Q) s.dot(8 + x, y, art.body);
    s.dot(8 - w, y, art.dark);
    s.dot(8 + w, y, art.dark);
    s.dot(8 - w + Q, y, lighten(art.body));
  }
  for (let x = -3.6; x <= 3.6; x += Q) { s.dot(8 + x, 9, lighten(art.body)); s.dot(8 + x, 9.5, art.dark); }
  // lá: bảy chiếc toả từ gốc
  for (let i = 0; i < 7; i++) {
    const goc = Math.PI * (1.1 + (i / 6) * 0.8);
    la(s, 8, 9, 8 + Math.cos(goc) * 5.5, 9 + Math.sin(goc) * 5.5, 1.2,
       i % 2 ? art.accent : lighten(art.accent), shade(art.accent, 0.66), lighten(art.accent));
  }
  return outline(s, shade(art.dark, 0.6), 1).c;
}

/** ĐỒNG HỒ TREO — treo trên tường, nên nó vẽ CẢ mảng tường phía sau. */
function makeClock(art: PropArt): HTMLCanvasElement {
  const s = makeWallSurface();
  s.ell(8, 7.5, 4.2, 4.2, art.dark);
  s.ell(8, 7.5, 3.4, 3.4, art.accent);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    s.dot(8 + Math.cos(a) * 2.8, 7.5 + Math.sin(a) * 2.8, art.dark);
  }
  for (let d = 0; d < 2.2; d += Q) s.dot(8, 7.5 - d, art.dark);          // kim dài
  for (let d = 0; d < 1.5; d += Q) s.dot(8 + d * 0.9, 7.5 + d * 0.5, art.dark); // kim ngắn
  s.dot(8, 7.5, art.body);
  // quả lắc
  for (let y = 11.5; y < 13.5; y += Q) s.dot(8, y, art.dark);
  s.ell(8, 13.8, 1.1, 1.1, art.body);
  return outline(s, shade(art.dark, 0.6), 1).c;
}

/** TRANH TREO — khung gỗ, phong cảnh đồng quê bên trong. Cũng vẽ cả tường. */
function makePainting(art: PropArt): HTMLCanvasElement {
  const s = makeWallSurface();
  for (let y = 3; y < 12; y += Q) for (let x = 2; x < 14; x += Q) s.dot(x, y, art.body);
  for (let x = 2; x < 14; x += Q) { s.dot(x, 3, lighten(art.body)); s.dot(x, 11.5, art.dark); }
  // tranh: trời, đồi, mặt trời
  for (let y = 4.5; y < 10; y += Q) for (let x = 3.5; x < 12.5; x += Q) s.dot(x, y, art.accent);
  for (let x = 3.5; x < 12.5; x += Q) {
    const doi = 8.5 - Math.sin((x - 3.5) * 0.45) * 1.4;
    for (let y = doi; y < 10; y += Q) s.dot(x, y, "#5f9e4a");
    s.dot(x, doi, "#7fbf5f");
  }
  s.ell(10.5, 6, 1.1, 1.1, "#ffd84a");
  return outline(s, shade(art.dark, 0.6), 1).c;
}

/** GHẾ SOFA — nệm ba chỗ ngồi, hai tay vịn, lưng tựa dày. */
function makeSofa(art: PropArt): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  s.shadow(8, 14.5, 7, 1.6);
  // lưng tựa
  for (let y = 2.5; y < 6; y += Q) for (let x = 1; x < 15; x += Q) s.dot(x, y, art.dark);
  for (let x = 1; x < 15; x += Q) s.dot(x, 2.5, art.accent);
  // nệm ngồi: ba khoang
  for (let y = 6; y < 13; y += Q) for (let x = 1; x < 15; x += Q) s.dot(x, y, art.body);
  for (const kx of [5.5, 10.5]) for (let y = 6; y < 13; y += Q) s.dot(kx, y, art.dark);
  for (let x = 1; x < 15; x += Q) s.dot(x, 6, lighten(art.body));
  // tay vịn
  for (const ax of [1, 13.5]) for (let y = 5; y < 13.5; y += Q) for (let x = 0; x < 1.5; x += Q) s.dot(ax + x, y, art.dark);
  for (const ax of [1, 13.5]) for (let x = 0; x < 1.5; x += Q) s.dot(ax + x, 5, art.accent);
  return outline(s, shade(art.dark, 0.6), 1).c;
}

/** THÙNG GỖ — đai sắt ngang, nắp gỗ nhìn từ trên. */
function makeBarrel(art: PropArt): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  s.shadow(8, 14.5, 4.5, 1.4);
  for (let y = 3; y < 14.5; y += Q) {
    const w = 4.6 - Math.abs((y - 8.5) / 5.5) * 0.9;
    for (let x = -w; x <= w; x += Q) s.dot(8 + x, y, art.body);
    s.dot(8 - w, y, art.dark);
    s.dot(8 + w, y, art.dark);
    s.dot(8 - w + Q, y, lighten(art.body));
  }
  for (const dy of [5, 8.5, 12]) for (let x = -4.6; x <= 4.6; x += Q) s.dot(8 + x, dy, art.accent);
  // nắp
  s.ell(8, 3.5, 3.9, 1.5, art.dark);
  s.ell(8, 3.3, 3.4, 1.2, shade(art.body, 1.08));
  return outline(s, shade(art.dark, 0.6), 1).c;
}

/** THÙNG HÀNG — hộp gỗ đóng đinh, có nẹp chéo. */
function makeCrate(art: PropArt): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  s.shadow(8, 14.5, 5.5, 1.4);
  matGo(s, 2, 3, 12, 11.5, art);
  // nẹp viền và nẹp chéo
  for (let x = 2; x < 14; x += Q) { s.dot(x, 3.5, art.dark); s.dot(x, 13.5, art.dark); }
  for (let y = 3; y < 14.5; y += Q) { s.dot(2.5, y, art.dark); s.dot(13, y, art.dark); }
  for (let d = 0; d < 11; d += Q) s.dot(2.5 + d, 3.5 + d, art.dark);
  for (let d = 0; d < 11; d += Q) s.dot(13 - d, 3.5 + d, art.dark);
  for (const [dx, dy] of [[3, 4], [12.5, 4], [3, 13], [12.5, 13]] as const) s.dot(dx, dy, "#c9ccd2");
  return outline(s, shade(art.dark, 0.6), 1).c;
}

function makeProp(id: string, art: PropArt, kieu = 0): HTMLCanvasElement {
  switch (id) {
    case "door": return makeDoor(art, kieu);
    case "door_in": return makeDoorIn(art, kieu);
    case "store_door": return makeStoreDoor(art, kieu);
    case "warehouse": return makeWarehouse(art);
    case "kennel": return makeKennel(art);
    case "tree": return makeTree(art);
    case "sapling": return makeSapling(art);
    case "stump": return makeStump(art);
    case "rock": return makeRock(art);
    case "bush": return makeBush(art);
    case "well": return makeWell(art);
    case "bed": return makeBed(art);
    case "bench": return makeBench(art);
    // Máng rỗng là hình MẶC ĐỊNH; các mức đầy đi qua `atlas.trough()`.
    case "trough": return makeTrough(art, 0, "#000", "#000");
    case "sign": return makeSign(art);
    case "pier": return makePier(art);
    case "roadbridge": return makeRoadBridge(art);
    case "wall": return makeWall(art);
    case "shop": return makeShop();
    case "counter": return makeCounter();
    case "log": return makeLog(art);
    case "grass_short": return makeGrassProp(art, false);
    case "grass_tall": return makeGrassProp(art, true);
    case "bush_small": return makeBushSmall(art);
    case "bush_big": return makeBushBig(art);
    case "waterfall": return makeWaterfall(art);
    case "boulder": return makeBoulder(art);
    case "rock_ore": return makeRockOre(art);
    case "rock_pile": return makeRockPile(art);
    case "rock_flat": return makeRockFlat(art);
    case "rock_tall": return makeRockTall(art);
    case "rock_crystal": return makeRockCrystal(art);
    case "rock_split": return makeRockSplit(art);
    case "rock_sand": return makeRockSand(art);
    case "rock_dark": return makeRockDark(art);
    case "rock_sea": return makeRockSea(art);
    case "log_moss": return makeLogMoss(art);
    case "log_hollow": return makeLogHollow(art);
    case "log_split": return makeLogSplit(art);
    case "branch": return makeBranch(art);
    case "branch_pile": return makeBranchPile(art);
    case "stump_moss": return makeStumpMoss(art);
    case "stump_burnt": return makeStumpBurnt(art);
    case "deadfall": return makeDeadfall(art);
    case "driftwood": return makeDriftwood(art);
    case "roots": return makeRoots(art);
    case "twigs": return makeTwigs(art);
    case "logpile": return makeLogPile(art);
    case "table": return makeTable(art);
    case "chair": return makeChair(art);
    case "rug": return makeRug(art);
    case "shelf": return makeShelf(art);
    case "cabinet": return makeCabinet(art);
    case "stove": return makeStove(art);
    case "sink": return makeSink(art);
    case "lamp": return makeLamp(art);
    case "potplant": return makePotPlant(art);
    case "clock": return makeClock(art);
    case "painting": return makePainting(art);
    case "sofa": return makeSofa(art);
    case "barrel": return makeBarrel(art);
    case "crate": return makeCrate(art);
    case "pine": return makePine(art);
    case "birch": return makeBirch(art);
    case "palm": return makePalm(art);
    case "willow": return makeWillow(art);
    case "maple": return makeMaple(art);
    case "bamboo": return makeBamboo(art);
    case "deadtree": return makeDeadTree(art);
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
 *
 * Đợt 24: đi từng bước `Q` và chấm bằng `dot`, nên mép lá thành đường cong thật
 * chứ không còn là bậc thang hai pixel. Mép tối cũng chỉ còn dày một pixel HD —
 * trước kia nó chiếm nửa chiếc lá mảnh.
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
  const n = Math.max(2, Math.round(len * ART));
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const cx = x0 + dx * u;
    const cy = y0 + dy * u;
    const r = day * Math.sin(Math.PI * (0.16 + 0.84 * u));
    /* Mép tối ở CẢ HAI bên, không phải một bên: hai chiếc lá vẽ cạnh nhau, mỗi
       chiếc chỉ tối một mép, thì mép sáng của chiếc này dính liền vào ruột
       chiếc kia và cả túm lá gộp thành một mảng đặc. */
    const mep = Math.max(r - Q, r * 0.55);
    for (let k = -r; k <= r; k += Q)
      s.dot(cx + nx * k, cy + ny * k, Math.abs(k) >= mep ? toi : mau);
  }
  if (gan)
    for (let i = 1; i < n; i++) {
      const u = i / n;
      s.dot(x0 + dx * u, y0 + dy * u, gan);
    }
}

/**
 * Một SỢI lá mảnh: nét sáng, kèm một nét TỐI áp sát phía gốc.
 *
 * Vì sao cần cái này bên cạnh `la()`: `la()` vẽ hình giọt nước có bề ngang, hợp
 * với lá to. Lá MẢNH — hành, lúa, cà rốt — thì bề ngang chỉ còn một hai pixel,
 * mà chừng ấy không chứa nổi cả lõi sáng lẫn hai mép tối; kết quả là cả túm lá
 * gộp thành một mảng đặc. Sợi cho mỗi lá đúng một lõi và một đường ngăn.
 */
function soi(
  s: Surface,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  mau: string,
  toi: string,
  day = Q,
): void {
  const n = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0) * ART));
  const d = x1 >= x0 ? -Q : Q; // nét tối nằm phía trong búi
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const x = x0 + (x1 - x0) * u;
    const y = y0 + (y1 - y0) * u;
    s.dot(x + d, y, toi);
    for (let k = 0; k < day; k += Q) s.dot(x + k, y, mau);
  }
}

/** LÁ XẺ THUỲ — lá bí, lá dưa, lá cần: năm thuỳ tròn toả từ một cuống. */
function laThuy(
  s: Surface,
  cx: number,
  cy: number,
  r: number,
  mau: string,
  toi: string,
  gan: string,
): void {
  for (let i = 0; i < 5; i++) {
    const ang = Math.PI * (1.06 + (i / 4) * 0.88);
    const lx = cx + Math.cos(ang) * r * 0.6;
    const ly = cy + Math.sin(ang) * r * 0.6;
    const rr = r * (i === 2 ? 0.5 : 0.4);
    s.ell(lx, ly, rr, rr, toi);
    s.ell(lx, ly - Q, rr - Q, rr - Q, mau);
  }
  for (let i = 0; i < 5; i++) {
    const ang = Math.PI * (1.06 + (i / 4) * 0.88);
    for (let u = 0.1; u <= 0.7; u += Q / Math.max(1, r))
      s.dot(cx + Math.cos(ang) * r * u, cy + Math.sin(ang) * r * u, gan);
  }
}

/** LÁ TRÒN mọc đối hai bên một cọng — húng quế, bạc hà, tía tô. */
function canhLaTron(
  s: Surface,
  x: number,
  yGoc: number,
  h: number,
  r: number,
  mau: string,
  toi: string,
  than: string,
): void {
  for (let y = 0; y <= h; y += Q) s.dot(x, yGoc - y, than);
  const doi = Math.max(2, Math.round(h / 2.6));
  for (let i = 0; i < doi; i++) {
    const y = yGoc - h * (0.28 + (0.66 * i) / Math.max(1, doi - 1));
    const rr = r * (1 - 0.42 * (i / Math.max(1, doi - 1)));
    for (const k of [-1, 1]) {
      const lx = x + k * (rr * 0.9);
      s.ell(lx, y, rr, rr * 0.82, toi);
      s.ell(lx, y - Q, rr - Q, rr * 0.82 - Q, mau);
      s.dot(lx - k * rr * 0.3, y - rr * 0.3, lighten(mau));
    }
  }
  // đỉnh: một cặp lá non nhỏ chụm lại
  s.ell(x, yGoc - h - r * 0.3, r * 0.5, r * 0.5, toi);
  s.ell(x, yGoc - h - r * 0.3 - Q, r * 0.5 - Q, r * 0.5 - Q, lighten(mau));
}

/** Thân: cột dọc, mép trái ăn nắng. */
function than(s: Surface, a: CropArt, x: number, yTop: number, yBot: number, day = 1): void {
  for (let y = yTop; y <= yBot; y += Q) {
    for (let k = 0; k < day; k += Q) s.dot(x + k, y, a.stem);
    s.dot(x, y, lighten(a.stem));
  }
}

/* ---------------------------------------------------------------------------
   QUẢ — Đợt 24.

   Bản trước có đúng MỘT hàm vẽ quả: ba vòng tròn đồng tâm. Nghĩa là quả ớt, quả
   cà tím, bắp ngô, trái đậu và chùm việt quất là cùng một hình, khác mỗi màu.
   Ở cỡ mười sáu pixel thì màu là thứ đọc được SAU CÙNG — nhất là khi hơn bốn
   mươi cây trong sáu mươi mốt cây đều mang một sắc xanh lá.

   Nay quả có DÁNG, và dáng do content chọn (`art.fruitShape`), nên thêm cây mới
   vẫn không phải sửa code. Bảy dáng dưới đây phủ hết sáu mươi mốt cây hiện có.
--------------------------------------------------------------------------- */

/**
 * Một LÁT NGANG của quả: ruột sáng, và mép tối dày ĐÚNG một pixel HD.
 *
 * Tách ra vì đây là chỗ dễ hỏng nhất: viết thẳng `Math.abs(x) >= w - Q` thì với
 * quả mảnh (`w` chỉ hơn `Q` một chút) MỌI pixel đều rơi vào mép, và cả quả tối
 * đen. Trái đậu que vừa dính đúng lỗi ấy: nó hiện ra là một ngón tay đen thay
 * vì một trái đậu xanh.
 */
function veLat(s: Surface, cx: number, y: number, w: number, mau: string, toi: string): void {
  if (w <= Q) {
    s.dot(cx, y, mau);
    return;
  }
  for (let x = -w; x <= w; x += Q) s.dot(cx + x, y, mau);
  s.dot(cx - w, y, toi);
  s.dot(cx + w, y, toi);
}

/** Vẽ HOA VĂN lên mặt quả đã có sẵn: sọc dưa, múi bí, vân lưới, đốm. */
function hoaVan(
  s: Surface,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  pattern: FruitPattern,
  toi: string,
  sang: string,
  rnd: () => number,
): void {
  if (pattern === "stripe") {
    /* SỌC DƯA HẤU: bốn vệt tối chạy dọc theo mặt cầu, nên chúng phải cong theo
       bề ngang của quả tại mỗi độ cao — vệt thẳng đứng thì quả trông như dán
       giấy. Đây là thứ DUY NHẤT nói "quả dưa hấu" ở cỡ này. */
    for (const g of [-0.74, -0.26, 0.26, 0.74]) {
      for (let y = -ry; y <= ry; y += Q) {
        const w = rx * Math.sqrt(Math.max(0, 1 - (y / ry) ** 2));
        const x = g * w;
        if (Math.abs(x) > w - Q) continue;
        s.dot(cx + x, cy + y, toi);
        s.dot(cx + x + Q, cy + y, toi);
      }
    }
    return;
  }
  if (pattern === "ridge") {
    // MÚI BÍ ĐỎ: rãnh tối xen gờ sáng, cùng cách cong như sọc.
    for (const g of [-0.78, -0.4, 0, 0.4, 0.78]) {
      for (let y = -ry * 0.94; y <= ry * 0.94; y += Q) {
        const w = rx * Math.sqrt(Math.max(0, 1 - (y / ry) ** 2));
        const x = g * w;
        if (Math.abs(x) > w - Q) continue;
        s.dot(cx + x, cy + y, toi);
        if (g !== 0) s.dot(cx + x + Q * (g > 0 ? -1 : 1), cy + y, sang);
      }
    }
    return;
  }
  if (pattern === "net") {
    // VÂN LƯỚI DƯA: mạng chỉ sáng nổi trên vỏ, ngang nhiều hơn dọc.
    for (let y = -ry * 0.8; y <= ry * 0.8; y += ry * 0.42) {
      const w = rx * Math.sqrt(Math.max(0, 1 - (y / ry) ** 2)) - Q;
      for (let x = -w; x <= w; x += Q) s.dot(cx + x, cy + y, sang);
    }
    for (const g of [-0.6, 0, 0.6]) {
      for (let y = -ry * 0.85; y <= ry * 0.85; y += Q) {
        const w = rx * Math.sqrt(Math.max(0, 1 - (y / ry) ** 2));
        if (Math.abs(g * w) > w - Q) continue;
        s.dot(cx + g * w, cy + y, sang);
      }
    }
    return;
  }
  if (pattern === "speckle") {
    const n = Math.max(4, Math.round(rx * ry * 1.6));
    for (let i = 0; i < n; i++) {
      const ang = rnd() * Math.PI * 2;
      const u = Math.sqrt(rnd()) * 0.82;
      s.dot(cx + Math.cos(ang) * rx * u, cy + Math.sin(ang) * ry * u, toi);
    }
  }
}

/**
 * Một QUẢ có dáng. `r` là "bán kính danh nghĩa"; mỗi dáng tự giãn theo trục của
 * mình, nên đổi `fruitSize` trong content vẫn cho ra quả to nhỏ như mong đợi.
 */
function veQua(
  s: Surface,
  a: CropArt,
  cx: number,
  cy: number,
  r: number,
  rnd: () => number,
  cuong = true,
): void {
  const mau = a.fruit;
  const toi = a.fruitDark;
  const sang = lighten(a.fruit);
  const vien = shade(a.fruitDark, 0.72);
  const pattern = a.pattern ?? "plain";
  const shape = a.fruitShape ?? "round";

  const bong = (rx: number, ry: number) => {
    s.ell(cx, cy, rx, ry, toi);
    s.ell(cx, cy - Q, rx - Q, ry - Q, mau);
    s.ell(cx - rx * 0.34, cy - ry * 0.4, rx * 0.34, ry * 0.26, sang);
    hoaVan(s, cx, cy, rx, ry, pattern, vien, sang, rnd);
  };

  switch (shape) {
    case "long": {
      bong(r * 0.62, r * 1.5);
      break;
    }
    case "cone": {
      /* THON NHỌN: bề ngang co dần về mũi. Quả ớt vẽ bằng hình tròn thì ở cỡ
         này nó là một chấm đỏ — mà một chấm đỏ thì cây nào cũng có. */
      const ry = r * 1.55;
      for (let y = -ry; y <= ry; y += Q) {
        const u = (y + ry) / (2 * ry);
        const w = Math.max(Q, r * 0.78 * (1 - u) ** 0.55);
        veLat(s, cx, cy + y, w, mau, toi);
        if (u < 0.55) s.dot(cx - w * 0.45, cy + y, sang);
      }
      break;
    }
    case "lobed": {
      const ry = r * 1.12;
      for (const k of [-1, 1, 0]) {
        const lx = cx + k * r * 0.5;
        s.ell(lx, cy, r * 0.52, ry, toi);
        s.ell(lx, cy - Q, r * 0.52 - Q, ry - Q, k === 0 ? mau : shade(mau, 0.9));
      }
      s.ell(cx - r * 0.55, cy - ry * 0.42, r * 0.2, ry * 0.26, sang);
      break;
    }
    case "ear": {
      // BẮP: thân trụ đầy hạt, hạt xếp so le thành hàng.
      const rx = r * 0.6;
      const ry = r * 1.55;
      s.ell(cx, cy, rx, ry, toi);
      s.ell(cx, cy, rx - Q, ry - Q, mau);
      let hang = 0;
      for (let y = -ry + Q * 2; y < ry - Q; y += Q * 2, hang++)
        for (let x = -rx + Q; x < rx - Q; x += Q * 2) {
          const ox = hang % 2 ? Q : 0;
          if ((x + ox) ** 2 / (rx * rx) + (y * y) / (ry * ry) > 0.62) continue;
          s.dot(cx + x + ox, cy + y, sang);
        }
      break;
    }
    case "pod": {
      // TRÁI ĐẬU: dẹt, hơi cong, có ngấn hạt nổi dọc thân.
      const ry = r * 1.7;
      const rx = Math.max(0.6, r * 0.56);
      for (let y = -ry; y <= ry; y += Q) {
        const u = y / ry;
        const cong = u * u * r * 0.3;
        const w = rx * Math.sqrt(Math.max(0, 1 - u * u * 0.86));
        veLat(s, cx + cong, cy + y, w, mau, toi);
        s.dot(cx + cong - w + Q, cy + y, sang);
      }
      // NGẤN HẠT nổi dọc thân trái — thứ nói "trái đậu" chứ không "quả ớt xanh"
      for (let i = 0; i < 4; i++) {
        const y = -ry * 0.62 + (ry * 1.24 * i) / 3;
        const cong = ((y / ry) ** 2) * r * 0.3;
        s.dot(cx + cong, cy + y, toi);
        s.dot(cx + cong + Q, cy + y, sang);
      }
      break;
    }
    case "cluster": {
      const rr = Math.max(Q * 1.6, r * 0.5);
      const oh: [number, number][] = [
        [-0.6, -0.28],
        [0.58, -0.4],
        [0, 0.1],
        [-0.44, 0.6],
        [0.5, 0.56],
      ];
      for (const [ux, uy] of oh) {
        const bx = cx + ux * r;
        const by = cy + uy * r;
        s.ell(bx, by, rr, rr, toi);
        s.ell(bx, by - Q, rr - Q, rr - Q, mau);
        s.dot(bx - rr * 0.35, by - rr * 0.35, sang);
      }
      return; // chùm không có cuống chung
    }
    default:
      bong(r, r);
  }
  if (cuong) {
    s.dot(cx, cy - r * (shape === "round" ? 1 : 1.5), a.stem);
    s.dot(cx, cy - r * (shape === "round" ? 1 : 1.5) - Q, a.stem);
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
    for (const k of [-1, 1]) {
      la(s, 8, baseY - 2, 8 + k * 2.2, baseY - 3.6, 0.9, a.leaf, a.leafDark, lighten(a.leaf));
    }
    return outline(s, shade(a.leafDark, 0.58), 1).c;
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
     bao đen, viền đen tuyền làm cái cây thành hình dán trên nền đất. Đợt 24:
     bề dày 1 pixel HD — nửa bề dày cũ — nên viền không còn ăn mất chi tiết vừa
     vẽ thêm. */
  return outline(s, shade(a.leafDark, 0.58), 1).c;
}

/* --- head: BẮP cuộn ôm sát đất — bắp cải, xà lách, cải thìa ---------------
   `leafShape` tách bốn cây họ này ra: "round" là bắp cuộn trơn (xà lách, cải
   thìa), "lobed" là bắp xoăn xù mép (cải xoăn), "blade" là thân phình có cuống
   lá vươn cao (su hào). Trước Đợt 24 cả bốn là một quả cầu xanh. */
function drawHead({ s, a, t, ripe, baseY, rnd }: FormCtx) {
  const kieu = a.leafShape ?? "round";
  const r = Math.max(2.4, (a.fruitSize + a.spread) * 0.32 * (0.55 + 0.45 * t));
  const wing = r + Math.max(1.2, a.spread * 0.44 * t);
  chanDat(s, baseY, wing);

  const mau = ripe ? a.fruit : a.leaf;
  const toi = ripe ? a.fruitDark : a.leafDark;

  // lá ngoài: bốn chiếc bò sát đất, toả ra hai bên
  for (const k of [-1, 1]) {
    la(s, 8, baseY - 0.6, 8 + k * wing, baseY - 1.2, 1.2, a.leafDark, shade(a.leafDark, 0.8));
    la(s, 8, baseY - 0.6, 8 + k * wing * 0.7, baseY - r * 0.95, 1.3, a.leaf, a.leafDark);
  }

  if (kieu === "blade") {
    // SU HÀO: thân phình thành củ ngay trên mặt đất, cuống lá cắm quanh nó.
    const cy = baseY - r * 0.85;
    s.ell(8, cy, r, r * 0.9, toi);
    s.ell(8, cy - Q, r - Q, r * 0.9 - Q, mau);
    s.ell(8 - r * 0.34, cy - r * 0.36, r * 0.34, r * 0.24, lighten(mau));
    for (const k of [-1, -0.35, 0.35, 1]) {
      const gx = 8 + k * r * 0.72;
      const gy = cy - r * 0.55;
      soi(s, gx, gy, gx + k * 1.6, gy - 3.4 - Math.abs(k) * 0.8, a.stem, a.leafDark);
      la(
        s,
        gx + k * 1.5,
        gy - 3.2 - Math.abs(k) * 0.8,
        gx + k * 2.6,
        gy - 5 - Math.abs(k),
        1.1,
        a.leaf,
        a.leafDark,
        lighten(a.leaf),
      );
    }
    return;
  }

  // bắp: khối cầu cuộn, sáng chếch trên-trái
  const cy = baseY - r * 0.92;
  s.ell(8, cy, r, r * 0.96, toi);
  s.ell(8, cy - Q, r - Q, r * 0.96 - Q, mau);
  s.ell(8 - r * 0.32, cy - r * 0.36, r * 0.4, r * 0.28, lighten(mau));

  if (kieu === "lobed") {
    /* CẢI XOĂN: mép bắp XÙ chứ không trơn. Dựng bằng một vòng cụm tròn nhỏ chèn
       quanh đường bao — đường bao gợn mới đọc ra "lá xoăn". */
    for (let i = 0; i < 11; i++) {
      const ang = Math.PI * (1.02 + (i / 10) * 0.96);
      const bx = 8 + Math.cos(ang) * r * 0.98;
      const by = cy + Math.sin(ang) * r * 0.94;
      const rr = r * (0.2 + 0.08 * (i % 2));
      s.ell(bx, by, rr, rr, toi);
      s.ell(bx, by - Q, rr - Q, rr - Q, i % 2 ? lighten(mau) : mau);
    }
  }

  /* Gân cuộn: hai vòng cung ôm theo bắp. Đây là thứ phân biệt "bắp cải" với
     "một quả bóng màu xanh" — lá cuộn thì có nếp. */
  for (const g of [0.44, 0.78]) {
    for (let x = -r * g; x <= r * g; x += Q) {
      const y = cy - Math.sqrt(Math.max(0, (r * g) ** 2 - x * x)) * 0.92;
      s.dot(8 + x, y, toi);
      s.dot(8 + x, y + Q, lighten(mau));
    }
  }
  if (rnd() > 0.5) s.dot(8, cy - r, a.stem);
}

/* --- herb: RAU THƠM — chín loại, và trước Đợt 24 chúng là chín cái quạt giống
   hệt nhau. `leafShape` là thứ tách chúng: ống rỗng (hành, hẹ), bản dài cong
   (sả), lá tròn mọc đối (húng, bạc hà, tía tô), lá xẻ (ngò, cần). */
function drawHerb({ s, a, t, baseY, rnd }: FormCtx) {
  const kieu = a.leafShape ?? "blade";
  const h = Math.max(3, (a.height + 4) * (0.42 + 0.58 * t));
  chanDat(s, baseY, 2 + a.spread * 0.3);

  if (kieu === "round") {
    /* LÁ MỌC ĐỐI: hai ba cọng, mỗi cọng cõng bốn năm cặp lá tròn. Bóng dáng này
       khác hẳn cái quạt, nên húng quế không còn lẫn với hành lá. */
    const n = a.spread > 4 ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const k = (i / (n - 1) - 0.5) * 2;
      canhLaTron(
        s,
        8 + k * a.spread * 0.42,
        baseY,
        h * (1 - Math.abs(k) * 0.22),
        Math.max(1.1, a.spread * 0.3),
        i % 2 ? a.leaf : lighten(a.leaf),
        a.leafDark,
        a.stem,
      );
    }
    return;
  }

  if (kieu === "lobed") {
    // LÁ XẺ: cuống mảnh vươn lên, đầu cuống xoè ba lá chét răng cưa.
    const n = Math.max(3, Math.min(5, Math.round(a.leaves * 0.5 + 1)));
    for (let i = 0; i < n; i++) {
      const frac = n === 1 ? 0.5 : i / (n - 1);
      const nghieng = (frac - 0.5) * 2;
      const cao = h * (0.62 + 0.38 * (1 - Math.abs(nghieng)));
      const tx = 8 + nghieng * (a.spread * 0.66 + 0.8);
      const ty = baseY - cao;
      soi(s, 8 + nghieng * 0.8, baseY, tx, ty, a.stem, a.leafDark);
      for (const k of [-1, 0, 1]) {
        const r2 = 1.15 + (k === 0 ? 0.35 : 0);
        s.ell(tx + k * 1.15, ty - (k === 0 ? 0.9 : 0.2), r2 * 0.8, r2 * 0.62, a.leafDark);
        s.ell(tx + k * 1.15, ty - (k === 0 ? 0.9 : 0.2) - Q, r2 * 0.8 - Q, r2 * 0.62 - Q, i % 2 ? a.leaf : lighten(a.leaf));
        // răng cưa: ba chấm tối trên mép trên
        for (const d of [-0.55, 0, 0.55])
          s.dot(tx + k * 1.15 + d * r2, ty - (k === 0 ? 0.9 : 0.2) - r2 * 0.62, a.leafDark);
      }
    }
    return;
  }

  if (kieu === "tube") {
    /* LÁ ỐNG: hành lá và hẹ. Ống thì DÀY hơn sợi và có gốc TRẮNG — cái gốc
       trắng ấy là thứ ai cũng nhận ra ngay, và trước đây không cây nào có. */
    const n = Math.max(3, Math.min(6, Math.round((a.leaves * 0.5 + 1) * (0.5 + 0.5 * t))));
    for (let i = 0; i < n; i++) {
      const frac = n === 1 ? 0.5 : i / (n - 1);
      const nghieng = (frac - 0.5) * 2;
      const cao = h * (0.62 + 0.38 * (1 - Math.abs(nghieng)));
      const tx = 8 + nghieng * (a.spread * 0.6 + 1);
      soi(s, 8 + nghieng * 0.9, baseY, tx, baseY - cao, i % 2 ? a.leaf : lighten(a.leaf), a.leafDark, Q * 2);
      s.dot(tx, baseY - cao, a.leafDark);
    }
    // gốc trắng bó lại
    for (const k of [-1, 0, 1]) {
      for (let y = 0; y < 2.2; y += Q) s.dot(8 + k * 0.5, baseY - y, k === -1 ? shade(a.fruit, 0.85) : a.fruit);
    }
    s.dot(8 - 0.5, baseY - 1.6, lighten(a.fruit));
    return;
  }

  // blade: bản dài cong rủ — sả, kinh giới
  const n = Math.max(4, Math.min(7, Math.round((a.leaves * 0.6 + 2) * (0.5 + 0.5 * t))));
  for (let i = 0; i < n; i++) {
    const frac = n === 1 ? 0.5 : i / (n - 1);
    const nghieng = (frac - 0.5) * 2;
    const cao = h * (0.55 + 0.45 * (1 - Math.abs(nghieng)));
    const dx = nghieng * (a.spread * 0.9 + 1.2);
    // cong: vươn lên rồi rủ ngọn
    const mx = 8 + dx * 0.55;
    const my = baseY - cao;
    la(s, 8 + nghieng * 0.9, baseY, mx, my, 0.75, i % 2 ? a.leaf : lighten(a.leaf), a.leafDark);
    la(s, mx, my, 8 + dx, my + cao * 0.22, 0.6, i % 2 ? a.leaf : lighten(a.leaf), a.leafDark);
  }
  than(s, a, 8, baseY - 1.4, baseY);
  if (rnd() > 0.6) s.dot(7.5, baseY, a.stem);
}

/* --- bulb: CỦ nằm ngay mặt đất, lá ống dựng lên — hành tây, tỏi -----------
   `pattern` tách hai cây: hành tây vằn dọc trơn, tỏi có múi (ridge) và cổ nhọn. */
function drawBulb({ s, a, t, ripe, baseY }: FormCtx) {
  const r = Math.max(2.2, a.fruitSize * 0.5 * (0.55 + 0.45 * t));
  const h = Math.max(4, (a.height + 3) * (0.45 + 0.55 * t));
  const toi = a.pattern === "ridge";
  chanDat(s, baseY, r + 1);

  // lá ống: ba cọng rỗng vươn thẳng, hơi loe
  for (const k of [-1, 0, 1]) {
    soi(s, 8 + k * 1.1, baseY - r * 0.5, 8 + k * 2.6, baseY - h, a.leaf, a.leafDark, Q * 2);
    if (k !== 0)
      soi(s, 8 + k * 1.9, baseY - r * 0.5, 8 + k * 3.6, baseY - h * 0.72, lighten(a.leaf), a.leafDark);
  }

  if (ripe || t > 0.6) {
    const cy = baseY - r * 0.62;
    const ry = toi ? r * 0.92 : r * 1.05;
    s.ell(8, cy, r, ry, a.fruitDark);
    s.ell(8, cy - Q, r - Q, ry - Q, a.fruit);
    s.ell(8 - r * 0.32, cy - r * 0.34, r * 0.36, r * 0.28, lighten(a.fruit));
    if (toi) {
      // TỎI: múi nổi, cổ thắt lại rồi vươn thành mỏ nhọn.
      for (const g of [-0.62, -0.2, 0.2, 0.62]) {
        for (let y = -ry * 0.9; y <= ry * 0.85; y += Q) {
          const w = r * Math.sqrt(Math.max(0, 1 - (y / ry) ** 2));
          if (Math.abs(g * w) > w - Q) continue;
          s.dot(8 + g * w, cy + y, shade(a.fruitDark, 0.8));
        }
      }
      for (let y = 0; y < 1.6; y += Q) s.dot(8, cy - ry - y, shade(a.fruit, 0.9));
    } else {
      // HÀNH TÂY: vằn dọc mảnh, và một chỏm vỏ khô trên đỉnh.
      for (const g of [-0.52, 0.06, 0.58])
        for (let y = -r * 0.82; y <= r * 0.72; y += Q)
          s.dot(8 + g * r + y * g * 0.14, cy + y, a.fruitDark);
      s.dot(8, cy - ry, shade(a.fruit, 0.75));
    }
    // rễ chùm
    for (const k of [-1, 0, 1]) s.dot(8 + k * 0.6, baseY, shade(a.fruitDark, 0.8));
  }
}

/* --- melon: DÂY BÒ mặt đất, MỘT QUẢ TO — dưa hấu, bí đỏ, bí đao, bầu, dưa lưới
   Đây là dáng hỏng nặng nhất trước Đợt 24: quả chỉ to bằng `fruitSize * 0.5`,
   tức hai ba pixel, nên năm cây họ dưa đều ra "một cái quạt lá có chấm màu" —
   quả dưa hấu KHÔNG hiện ra chút nào. Nay quả là nhân vật chính: nó chiếm hơn
   nửa ô, nằm trước tán lá, và `pattern` cho nó sọc / múi / vân lưới. */
function drawMelon({ s, a, t, ripe, baseY, rnd }: FormCtx) {
  const spread = Math.max(3, a.spread * (0.62 + 0.38 * t));
  chanDat(s, baseY, spread + 1);

  // DÂY BÒ vắt ngang mặt đất + lá xẻ thuỳ dựng chếch phía sau quả
  for (const k of [-1, 1]) {
    const n = Math.max(2, Math.round(spread * ART));
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      s.dot(8 + k * u * spread, baseY - 0.6 - Math.sin(u * Math.PI) * 0.7, a.stem);
    }
    laThuy(
      s,
      8 + k * spread * 0.8,
      baseY - 2.6,
      2.1 + spread * 0.2,
      k < 0 ? a.leaf : lighten(a.leaf),
      a.leafDark,
      shade(a.leafDark, 0.85),
    );
  }
  laThuy(s, 8 - spread * 0.2, baseY - 4.6, 1.9 + spread * 0.16, a.leaf, a.leafDark, shade(a.leafDark, 0.85));

  const shape = a.fruitShape ?? "round";
  const full = Math.max(3.2, a.fruitSize * 0.58);
  const r = ripe ? full : Math.max(1, full * (0.22 + 0.5 * t));
  if (t > 0.28 || ripe) {
    const rx = shape === "long" ? r * 0.72 : r * 1.04;
    const ry = shape === "long" ? r * 1.32 : r * 0.9;
    const cy = baseY - ry * 0.88;
    s.ell(8, cy, rx, ry, a.fruitDark);
    s.ell(8, cy - Q, rx - Q, ry - Q, a.fruit);
    s.ell(8 - rx * 0.36, cy - ry * 0.42, rx * 0.32, ry * 0.26, lighten(a.fruit));
    hoaVan(
      s,
      8,
      cy,
      rx,
      ry,
      a.pattern ?? "plain",
      shade(a.fruitDark, 0.74),
      lighten(a.fruit),
      rnd,
    );
    // cuống gỗ trên đỉnh quả — dấu hiệu "hái được rồi"
    if (ripe) {
      s.dot(8, cy - ry, a.stem);
      s.dot(8, cy - ry - Q, a.stem);
      s.dot(8 + Q, cy - ry - Q * 2, a.stem);
    }
  }
}

/* --- leafy: THÂN ĐỨNG, lá so le hai bên — cải, rau muống, rau dền --------- */
function drawLeafy({ s, a, t, ripe, baseY, rnd }: FormCtx) {
  const h = Math.max(3, a.height * (0.4 + 0.6 * t));
  const spread = Math.max(1.5, a.spread * (0.45 + 0.55 * t));
  const n = Math.max(3, Math.round(a.leaves * (0.45 + 0.55 * t)));
  chanDat(s, baseY, spread * 0.8);

  than(s, a, 8, baseY - h, baseY);

  for (let i = 0; i < n; i++) {
    const frac = i / Math.max(1, n - 1);
    const y = baseY - 0.6 - frac * (h - 1);
    const k = i % 2 === 0 ? -1 : 1;
    /* Lá dưới DÀI hơn lá trên: cây mọc từ dưới lên nên lá gốc già và to nhất.
       Đảo lại là ra hình cái chổi ngược, đọc thấy sai ngay dù khó gọi tên. */
    const len = spread * (1 - 0.42 * frac);
    if (a.leafShape === "lobed") {
      // CẢI XANH mép lượn: dựng lá bằng ba cụm chồng, đường bao gợn sóng.
      const lx = 8 + k * len * 0.72;
      const ly = y - len * 0.42;
      for (let j = 0; j < 3; j++) {
        const rr = len * (0.34 - j * 0.06);
        const jx = lx + k * j * len * 0.2;
        const jy = ly - j * len * 0.2;
        s.ell(jx, jy, rr, rr * 0.82, a.leafDark);
        s.ell(jx, jy - Q, rr - Q, rr * 0.82 - Q, j % 2 ? lighten(a.leaf) : a.leaf);
      }
      soi(s, 8, y, lx, ly, lighten(a.leaf), a.leafDark);
    } else {
      la(
        s,
        8,
        y,
        8 + k * len,
        y - len * 0.55,
        1.15,
        i % 2 ? a.leaf : lighten(a.leaf),
        a.leafDark,
        lighten(a.leaf),
      );
    }
  }

  if (ripe && a.fruitCount > 0) {
    const r = Math.max(1.2, a.fruitSize * 0.46);
    for (let i = 0; i < a.fruitCount; i++) {
      const ang = (i / Math.max(1, a.fruitCount)) * Math.PI * 2 + 0.6;
      const cx = 8 + Math.cos(ang) * (a.fruitCount === 1 ? 0 : spread * 0.55);
      const cy = baseY - h * (a.fruitCount === 1 ? 0.5 : 0.35 + 0.4 * Math.abs(Math.sin(ang)));
      veQua(s, a, cx, cy, r, rnd);
    }
  }
}

/* --- root: TÚM LÁ, chín thì nhô VAI CỦ khỏi mặt đất — cà rốt, khoai --------
   Mười cây dùng dáng này. `fruitShape` cho mỗi cây một hình củ riêng: cà rốt
   thon nhọn, củ cải tròn, khoai lang dài, khoai tây nhiều củ nhỏ, gừng/nghệ
   sần (speckle). Trước Đợt 24 cả mười ra một túm lá và một mẩu tròn. */
function drawRoot({ s, a, t, ripe, baseY, rnd }: FormCtx) {
  const h = Math.max(3, a.height * (0.45 + 0.55 * t));
  const spread = Math.max(2, a.spread * (0.5 + 0.5 * t));
  chanDat(s, baseY, spread * 0.8);

  /* Vai củ ló lên khỏi mặt đất khi chín — đó là tín hiệu "nhổ được rồi", và nó
     phải nằm DƯỚI túm lá nên vẽ trước. Củ ló CAO hơn bản cũ: nửa quả nổi lên
     thì mắt đọc ra hình dáng, một mẩu ló thì cây nào cũng như cây nào. */
  if (ripe) {
    const r = Math.max(2.2, a.fruitSize * 0.55);
    veQua(s, a, 8, baseY - r * 0.42, r, rnd, false);
    // đất vun quanh vai củ: không có nó thì củ trông như quả đặt trên nền
    for (const k of [-1, 1]) {
      s.dot(8 + k * (r + 0.6), baseY + 0.4, P.soilEdge);
      s.dot(8 + k * (r + 1.1), baseY + 0.4, P.soilEdge);
    }
  }

  // túm lá: xoè hình quạt, lá giữa cao nhất
  const n = Math.max(3, Math.round(a.leaves * (0.5 + 0.5 * t)));
  for (let i = 0; i < n; i++) {
    const frac = n === 1 ? 0.5 : i / (n - 1);
    const nghieng = (frac - 0.5) * 2;
    const cao = h * (0.55 + 0.45 * (1 - Math.abs(nghieng)));
    const tx = 8 + nghieng * spread;
    const ty = baseY - 0.6 - cao;
    if (a.leafShape === "lobed") {
      // LÁ XẺ của cà rốt / ngò: cuống mảnh, đầu cuống một chùm lá chét li ti.
      soi(s, 8 + nghieng * 0.9, baseY - 0.6, tx, ty, a.stem, a.leafDark);
      for (let j = 0; j < 5; j++) {
        const ang = Math.PI * (1.1 + (j / 4) * 0.8);
        s.dot(tx + Math.cos(ang) * 1.2, ty + Math.sin(ang) * 1.2, i % 2 ? a.leaf : lighten(a.leaf));
        s.dot(tx + Math.cos(ang) * 0.6, ty + Math.sin(ang) * 0.6, a.leaf);
        s.dot(tx + Math.cos(ang) * 1.8, ty + Math.sin(ang) * 1.5, a.leafDark);
      }
    } else if (a.leafShape === "drop") {
      la(s, 8 + nghieng * 0.9, baseY - 0.6, tx, ty, 1.1, i % 2 ? a.leaf : lighten(a.leaf), a.leafDark, lighten(a.leaf));
    } else {
      soi(s, 8 + nghieng * 1, baseY - 0.6, tx, ty, i % 2 ? a.leaf : lighten(a.leaf), a.leafDark, Q * 2);
    }
  }
}

/* --- vine: GIÀN LEO, quả treo bên dưới — dưa leo, khổ qua, mướp, bí ngòi --- */
function drawVine({ s, a, t, ripe, baseY, rnd }: FormCtx) {
  const spread = Math.max(3, a.spread * (0.6 + 0.4 * t));
  const h = Math.max(3, a.height * (0.4 + 0.6 * t));
  chanDat(s, baseY, spread * 0.9);

  than(s, a, 8, baseY - h, baseY);
  const yNgang = baseY - h;
  for (let x = -spread; x <= spread; x += Q) s.dot(8 + x, yNgang, shade(a.stem, 0.8));
  for (let x = -spread; x <= spread; x += Q) s.dot(8 + x, yNgang - Q, a.stem);

  // tua cuốn: một móc xoắn ở mỗi đầu giàn
  for (const k of [-1, 1]) {
    const x = 8 + k * spread;
    s.dot(x, yNgang - Q * 2, a.leafDark);
    s.dot(x + k * Q, yNgang - Q * 3, a.leafDark);
    s.dot(x + k * Q * 2, yNgang - Q * 2, a.leafDark);
  }

  // lá xẻ thuỳ mọc trên giàn — cùng kiểu lá với họ dưa, vì chúng là họ hàng
  const n = Math.max(3, Math.round(a.leaves * 0.6 * (0.5 + 0.5 * t)));
  for (let i = 0; i < n; i++) {
    const k = i % 2 === 0 ? -1 : 1;
    const x = 8 + k * spread * (0.3 + 0.62 * (i / Math.max(1, n)));
    const y = yNgang - 1.9 - (i % 3) * 0.8;
    laThuy(s, x, y, 2.5, i % 2 ? a.leaf : lighten(a.leaf), a.leafDark, shade(a.leafDark, 0.85));
  }

  /* Quả TREO xuống từ giàn — cả cái ý của giàn leo nằm ở đây, nên nó phải THẤY
     ĐƯỢC: lúc chưa chín thì xanh đậm hơn lá chứ không cùng màu lá (cùng màu thì
     nó biến mất trong tán). */
  if (t > 0.5 || ripe) {
    /* Quả phải TREO HẲN xuống dưới giàn và phải DÀI: ở bản đầu Đợt 24 nó ngắn
       và nằm ngay sát thanh ngang, nên bốn cây giàn leo vẫn ra bốn cặp cục
       giống nhau. Cuống dài mới đọc ra "treo", và dài mới đọc ra "quả dưa
       leo" thay vì "một quả tròn màu xanh". */
    const n2 = Math.max(1, Math.min(3, a.fruitCount));
    const r = Math.max(1.7, a.fruitSize * 0.56);
    const chua: CropArt = {
      ...a,
      fruit: shade(a.leaf, 0.68),
      fruitDark: shade(a.leafDark, 0.6),
    };
    for (let i = 0; i < n2; i++) {
      const k = n2 === 1 ? 0 : (i / (n2 - 1) - 0.5) * 1.25;
      const x = 8 + k * spread;
      const cuong = 1.4;
      const cy = yNgang + cuong + r * 1.5;
      for (let y = 0; y <= cuong; y += Q) s.dot(x, yNgang + y, a.stem);
      veQua(s, ripe ? a : chua, x, cy, r, rnd, false);
    }
  }
}

/* --- stalk: THÂN CỨNG CAO — ngô, mía, và mấy cây quả to đứng thẳng -------- */
function drawStalk({ s, a, t, ripe, baseY, rnd }: FormCtx) {
  const h = Math.max(4, (a.height + 2) * (0.45 + 0.55 * t));
  const spread = Math.max(2, a.spread * (0.5 + 0.5 * t));
  chanDat(s, baseY, spread * 0.6);

  // thân dày có đốt
  than(s, a, 7.5, baseY - h, baseY, 1);
  for (let y = baseY - h + 1.5; y < baseY; y += 2.5) {
    s.dot(7.5, y, shade(a.stem, 0.7));
    s.dot(8, y, shade(a.stem, 0.7));
  }

  // lá DÀI CONG rủ xuống, so le hai bên — dáng đặc trưng của cây ngô
  const n = Math.max(3, Math.min(7, Math.round(a.leaves * 0.75 * (0.4 + 0.6 * t))));
  for (let i = 0; i < n; i++) {
    const frac = i / Math.max(1, n - 1);
    const y = baseY - 0.6 - frac * (h - 2);
    const k = i % 2 === 0 ? -1 : 1;
    const len = spread * (1.05 - 0.35 * frac);
    const mx = 8 + k * len * 0.6;
    const my = y - len * 0.5;
    la(s, 8, y, mx, my, 1.15, a.leaf, a.leafDark, lighten(a.leaf));
    la(s, mx, my, 8 + k * len, y - len * 0.1, 0.9, a.leaf, a.leafDark);
  }

  const shape = a.fruitShape ?? "ear";

  // BÔNG CỜ trên ngọn — chỉ cây ngô mới có
  if (shape === "ear" && (t > 0.7 || ripe)) {
    const yy = baseY - h;
    for (const k of [-1, 0, 1]) for (let d = 0; d < 1.4; d += Q) s.dot(8 + k * 0.5, yy - 0.6 - d, a.leafDark);
  }

  if (!ripe) return;
  if (a.fruitCount === 0) {
    /* MÍA không có quả: thứ nói "chặt được rồi" là cây ĐÃ GIÀ — đốt ngả màu và
       thân dày lên. Không có nhánh này thì `dem` bên dưới ép tối thiểu một quả,
       và cây mía mọc ra một trái không tồn tại. */
    for (let y = baseY - h; y <= baseY; y += Q) s.dot(8, y, a.fruit);
    for (let y = baseY - h + 1.5; y < baseY; y += 2.5) {
      s.dot(7.5, y, a.fruitDark);
      s.dot(8, y, a.fruitDark);
      s.dot(8.5, y, a.fruitDark);
    }
    return;
  }
  const r = Math.max(1.3, a.fruitSize * 0.42);
  const dem = Math.max(1, Math.min(shape === "cone" ? 4 : 2, a.fruitCount));
  for (let i = 0; i < dem; i++) {
    const k = dem === 1 ? 0 : i % 2 === 0 ? 1 : -1;
    const tang = Math.floor(i / 2);
    const cx = 8 + k * (r * (shape === "ear" ? 1.1 : 1.5) + 0.4);
    const cy = baseY - h * (0.46 + tang * 0.24);
    // cuống nối quả vào thân, nếu không quả trôi lơ lửng cạnh cây
    for (let x = 0; x <= Math.abs(cx - 8); x += Q) s.dot(8 + Math.sign(cx - 8) * x, cy - r, a.stem);
    veQua(s, a, cx, cy, r, rnd);
    // RÂU NGÔ
    if (shape === "ear") {
      s.dot(cx, cy - r * 1.55 - Q, "#d9b96a");
      s.dot(cx + k * Q, cy - r * 1.55 - Q * 2, "#d9b96a");
      if (rnd() > 0.5) s.dot(cx - k * Q, cy - r * 1.55 - Q, "#d9b96a");
    }
  }
}

/* --- bush: BỤI TÁN TRÒN, quả trong tán — dâu tây, việt quất, cà phê, đậu -- */
function drawBush({ s, a, t, ripe, baseY, rnd }: FormCtx) {
  const r = Math.max(2.4, (a.spread + a.height * 0.55) * 0.46 * (0.5 + 0.5 * t));
  const cy = baseY - r * 0.85;
  chanDat(s, baseY, r);

  than(s, a, 8, cy, baseY);

  /* Tán dựng bằng NĂM CỤM lá chồng nhau, không phải một đĩa tròn: đường bao
     lởm chởm mới đọc ra là tán lá, đường bao tròn trơn đọc ra là quả bóng.
     Vẽ TỪNG cụm một — tối rồi mới sáng — chứ không phải tối hết rồi sáng hết,
     để vành tối của cụm sau cắt vào cụm trước. */
  const cum: [number, number, number][] = [
    [0, -r * 0.55, r * 0.62],
    [-r * 0.62, -r * 0.1, r * 0.58],
    [r * 0.62, -r * 0.1, r * 0.58],
    [-r * 0.34, r * 0.45, r * 0.5],
    [r * 0.34, r * 0.45, r * 0.5],
  ];
  for (const [dx, dy, rr] of cum) {
    s.ell(8 + dx, cy + dy, rr, rr * 0.92, a.leafDark);
    s.ell(8 + dx, cy + dy - Q, rr - Q, rr * 0.92 - Q, a.leaf);
  }
  s.ell(8 - r * 0.35, cy - r * 0.5, r * 0.4, r * 0.28, lighten(a.leaf));

  if (a.fruitCount === 0) {
    // TRÀ: không có quả, dấu hiệu hái được là những búp non sáng trên đỉnh tán.
    if (ripe)
      /* Búp trà: MỘT tôm hai lá — đúng cái người ta hái. Ba cụm như thế trên
         đỉnh tán là đủ để "hái được rồi" đọc ra mà không thành bụi hoa. */
      for (const k of [-1, 0, 1]) {
        const bx = 8 + k * r * 0.62;
        const by = cy - r * (k === 0 ? 1.02 : 0.76);
        for (const d of [-1, 1])
          la(s, bx, by + 1, bx + d * 1.3, by - 0.5, 0.75, a.fruit, a.fruitDark);
        for (let d = 0; d < 1.8; d += Q) s.dot(bx, by + 0.8 - d, lighten(a.fruit));
        s.dot(bx, by - 1.1, a.fruitDark);
      }
    return;
  }

  if (ripe || t > 0.75) {
    /* Quả nằm ở NỬA DƯỚI và chìa ra khỏi mép tán. Bản đầu Đợt 24 rải quả đều
       quanh tâm tán, nên trái đậu — vốn cùng sắc xanh với lá — biến mất hẳn
       vào trong tán và cây đậu que ra một bụi xanh trơn. */
    const fr = Math.max(1.15, a.fruitSize * 0.48);
    const n = Math.max(1, a.fruitCount);
    for (let i = 0; i < n; i++) {
      const u = n === 1 ? 0.5 : i / (n - 1);
      const ang = Math.PI * (0.12 + 0.76 * u); // cung DƯỚI của tán
      const fx = 8 + Math.cos(ang) * r * 0.78;
      const fy = cy + Math.sin(ang) * r * 0.56;
      if (ripe) veQua(s, a, fx, fy, fr, rnd, false);
      else s.ell(fx, fy, fr * 0.7, fr * 0.7, a.leafDark);
    }
  }
}

/* --- grain: NGŨ CỐC — năm cây, và trước Đợt 24 chúng là năm cái quạt giống
   hệt nhau. `fruitShape` tách chúng theo đúng thứ mà mắt nhận ra ngoài đồng:
   lúa bông TRĨU CONG, lúa mì bông DỰNG có hạt, lúa mạch RÂU DÀI toả, vừng quả
   nang bám dọc thân, đậu nành trái mọc thành chùm thấp. */
function drawGrain({ s, a, t, ripe, baseY, rnd }: FormCtx) {
  const shape = a.fruitShape ?? "droop";
  const h = Math.max(4, (a.height + 2) * (0.45 + 0.55 * t));
  /* Bông chiếm nhiều chỗ hơn cọng, nên cây có bông RỦ phải ít cọng lại — sáu
     cọng mỗi cọng một bông trĩu thì cả bụi thành một mớ rối. */
  const n = Math.max(3, Math.round(a.leaves * (shape === "droop" ? 0.45 : 0.7)));
  const spread = Math.max(2.2, a.spread * 1.05 * (0.5 + 0.5 * t));
  chanDat(s, baseY, spread + 1);

  if (shape === "pod" || shape === "cluster") {
    /* ĐẬU NÀNH và VỪNG không phải cây bông: chúng có THÂN đứng và quả bám dọc
       thân. Vẽ chúng như lúa là lý do trước đây năm cây ngũ cốc không phân biệt
       nổi. */
    const canh = shape === "pod" ? 3 : 1;
    for (let c = 0; c < canh; c++) {
      const k = canh === 1 ? 0 : (c / (canh - 1) - 0.5) * 2;
      const x = 8 + k * spread * 0.55;
      const hh = h * (1 - Math.abs(k) * 0.24);
      than(s, a, x, baseY - hh, baseY);
      const doi = Math.max(2, Math.round(hh / 2.4));
      for (let i = 0; i < doi; i++) {
        const y = baseY - hh * (0.25 + (0.7 * i) / Math.max(1, doi - 1));
        const d = i % 2 === 0 ? -1 : 1;
        la(s, x, y, x + d * 1.9, y - 1.1, 0.85, i % 2 ? a.leaf : lighten(a.leaf), a.leafDark);
        if (ripe) {
          const fx = x + d * 0.9;
          const fr = Math.max(0.7, a.fruitSize * 0.26);
          veQua(s, a, fx, y + 0.5, fr, rnd, false);
        }
      }
    }
    return;
  }

  /* HAI LƯỢT, không phải một: vẽ xong CỌNG rồi mới vẽ BÔNG.
     Trong một lượt thì cọng thứ i+1 vẽ đè lên bông thứ i — và vì bông lúa rủ
     xuống ngay giữa bụi, nó bị chính bụi lá nuốt mất gần hết. Đó đúng là lý do
     ruộng lúa chín trông như một cái quạt xanh có mấy nét vàng ở ngọn. */
  /* NHIỀU LÁ hơn BÔNG: khóm lúa phải dày, nhưng mỗi bông rủ chiếm nhiều chỗ
     nên chỉ vài cọng mang bông. Dùng chung một con số cho cả hai thì hoặc khóm
     thưa hoác, hoặc bông chồng lên nhau thành một mớ. */
  const nLa = Math.max(n, Math.round(a.leaves * 0.9));
  const cong: { tx: number; ty: number; nghieng: number }[] = [];
  for (let i = 0; i < nLa; i++) {
    const frac = nLa === 1 ? 0.5 : i / (nLa - 1);
    const nghieng = (frac - 0.5) * 2;
    const cao = h * (0.72 + 0.28 * (1 - Math.abs(nghieng)));
    const tx = 8 + nghieng * spread;
    const ty = baseY - cao;
    // chỉ `n` cọng đầu tiên, rải đều trong khóm, mới mang bông
    if (i % Math.max(1, Math.round(nLa / n)) === 0 && cong.length < n)
      cong.push({ tx, ty, nghieng });
    /* Cọng LUÔN xanh, kể cả khi chín: chỉ cái BÔNG mới ngả vàng. Nhuộm vàng cả
       cây thì ruộng lúa chín ra một đám tia lửa, không ra ruộng lúa. */
    soi(s, 8 + nghieng * 1.1, baseY, tx, ty, i % 2 ? a.leaf : lighten(a.leaf), a.leafDark);
    // một chiếc lá bản hẹp rủ khỏi mỗi cọng
    la(s, 8 + nghieng * 1.6, baseY - cao * 0.42, tx + nghieng * 1.5, baseY - cao * 0.62, 0.55, a.leafDark, shade(a.leafDark, 0.8));
  }

  for (let i = 0; i < cong.length; i++) {
    const { tx, ty, nghieng } = cong[i]!;

    if (!ripe) {
      for (let d = 0; d < 1.2; d += Q) s.dot(tx, ty - d, a.leafDark);
      continue;
    }

    if (shape === "awn") {
      /* LÚA MẠCH: bông dựng, và RÂU dài toả lên như tia — đây là bóng dáng
         không lẫn được với cây nào khác trên nông trại. */
      for (let d = 0; d < 3; d += Q) {
        s.dot(tx, ty - d, a.fruit);
        if (d % (Q * 2) === 0) s.dot(tx + Q, ty - d, a.fruitDark);
      }
      for (const k of [-1, -0.4, 0.4, 1]) {
        for (let d = 0; d < 3.4; d += Q)
          s.dot(tx + k * d * 0.34, ty - 2.4 - d, shade(a.fruit, 0.94));
      }
      continue;
    }

    if (shape === "ear") {
      // LÚA MÌ: bông dựng, hạt xếp hai hàng so le, râu ngắn.
      for (let j = 0; j < 5; j++) {
        const y = ty - 0.4 - j * 0.62;
        for (const k of [-1, 1]) {
          s.dot(tx + k * 0.5, y, a.fruit);
          s.dot(tx + k * 0.5, y + Q, a.fruitDark);
        }
        s.dot(tx, y, lighten(a.fruit));
      }
      for (const k of [-1, 0, 1])
        for (let d = 0; d < 1.4; d += Q) s.dot(tx + k * d * 0.3, ty - 3.4 - d, shade(a.fruit, 0.95));
      continue;
    }

    /* LÚA: bông TRĨU CONG gập hẳn xuống vì nặng hạt. Đường cong là một cung
       Bézier bậc hai vươn lên rồi đổ xuống — chính cái CÚI ĐẦU ấy là thứ duy
       nhất nói "lúa đã chín", và nó nói được mà không phải nhuộm vàng cả cây.
       Hạt bám dày dần về phía ngọn, đúng chỗ bông nặng nhất. */
    const huong = nghieng >= 0 ? 1 : -1;
    const p0x = tx;
    const p0y = ty;
    /* Bông vươn RA rồi rủ xuống ở PHÍA NGOÀI bụi lá, không cong ngược vào giữa.
       Bản trước cong vào trong nên bốn cái bông chụm thành hai cái quai như
       sừng cừu — đúng kỹ thuật mà sai hẳn hình. */
    const p1x = tx + huong * 2.4;
    const p1y = ty - 1.5;
    const p2x = tx + huong * 2.9;
    const p2y = ty + 3.2;
    const buoc = 30;
    for (let j = 0; j <= buoc; j++) {
      const u = j / buoc;
      const v = 1 - u;
      const bx = v * v * p0x + 2 * v * u * p1x + u * u * p2x;
      const by = v * v * p0y + 2 * v * u * p1y + u * u * p2y;
      const vang = u > 0.22;
      s.dot(bx, by, vang ? a.fruit : a.leaf);
      s.dot(bx + Q, by, vang ? a.fruitDark : a.leafDark);
      /* HẠT chỉ bám MẶT NGOÀI của gậy móc, không chìa đều hai bên: chìa hai bên
         thì bốn cái bông thành bốn đôi cánh, và ruộng lúa ra một đàn chim. */
      s.dot(bx, by + Q, vang ? a.fruit : a.leaf);
      if (vang && j % 2 === 0) {
        const hx = bx + huong * 0.8;
        s.dot(hx, by, a.fruit);
        s.dot(hx, by + Q, a.fruitDark);
        s.dot(hx + huong * Q, by, lighten(a.fruit));
      }
    }
  }
}

/* --- flower: HOA — năm loài, năm bóng dáng khác hẳn nhau ------------------
   `fruitShape` chọn kiểu bông: đĩa lớn (hướng dương), cầu cánh dày (vạn thọ),
   nhiều cánh mảnh (cúc), chuỗi hoa nhỏ dọc ngọn (oải hương), cánh cuộn vòng
   (hồng). Trước Đợt 24 cả năm là một bông tám cánh, khác mỗi màu. */
function drawFlower({ s, a, t, ripe, baseY, rnd }: FormCtx) {
  const shape = a.fruitShape ?? "ray";
  const h = Math.max(4, (a.height + 1) * (0.45 + 0.55 * t));
  const cy = baseY - h;
  chanDat(s, baseY, 2.4);

  than(s, a, 8, cy, baseY);
  for (const k of [-1, 1]) {
    const y = baseY - h * (k < 0 ? 0.36 : 0.58);
    if (shape === "spike")
      soi(s, 8, y, 8 + k * a.spread * 0.8, y - a.spread * 0.5, a.leaf, a.leafDark, Q * 2);
    else la(s, 8, y, 8 + k * a.spread * 0.85, y - a.spread * 0.35, 1.3, a.leaf, a.leafDark, lighten(a.leaf));
  }
  // GAI: chỉ hoa hồng có, và nó là dấu nhận ra thân hồng ngay cả khi chưa nở
  if (shape === "rosette")
    for (let y = baseY - 1; y > cy + 1; y -= 2.5) {
      s.dot(8 - Q, y, a.leafDark);
      s.dot(8 + 1, y - 1, a.leafDark);
    }

  if (t < 0.5) {
    // nụ: bọc đài xanh, chưa nở
    s.ell(8, cy + 0.6, 1.3, 1.8, a.leafDark);
    s.ell(8, cy + 0.3, 1.3 - Q, 1.8 - Q, a.leaf);
    return;
  }

  const r = Math.max(2, a.fruitSize * 0.5 * (ripe ? 1 : 0.72));
  const sang = lighten(a.fruit);

  if (shape === "spike") {
    /* OẢI HƯƠNG: không phải một bông, mà một CHUỖI hoa nhỏ chạy dọc ngọn. Bóng
       dáng cột đứng ấy không lẫn với bất cứ bông tròn nào. */
    const cao = Math.max(4, r * 2.4);
    for (let j = 0; j <= Math.round(cao * ART); j++) {
      const y = cy + 0.6 - j * Q;
      const w = Math.max(Q, (1 - j / (cao * ART)) * 0.4 + 0.5);
      for (let x = -w; x <= w; x += Q)
        s.dot(8 + x, y, Math.abs(x) >= w - Q ? a.fruitDark : j % 3 === 0 ? sang : a.fruit);
    }
    return;
  }

  if (shape === "rosette") {
    // HOA HỒNG: cánh cuộn thành vòng xoáy, không toả ra như nan quạt.
    s.ell(8, cy, r, r * 0.96, a.fruitDark);
    s.ell(8, cy - Q, r - Q, r * 0.96 - Q, a.fruit);
    for (let v = 0; v < 3; v++) {
      const rr = r * (0.8 - v * 0.24);
      for (let j = 0; j <= 20; j++) {
        const ang = (j / 20) * Math.PI * 2 + v * 1.1;
        s.dot(8 + Math.cos(ang) * rr, cy + Math.sin(ang) * rr * 0.94, v % 2 ? sang : a.fruitDark);
      }
    }
    s.ell(8, cy, r * 0.2, r * 0.2, shade(a.fruitDark, 0.7));
    return;
  }

  if (shape === "pompom") {
    // CÚC VẠN THỌ: cầu cánh dày, mép lởm chởm, không thấy nhuỵ.
    for (let i = 0; i < 12; i++) {
      const ang = (i / 12) * Math.PI * 2;
      const bx = 8 + Math.cos(ang) * r * 0.62;
      const by = cy + Math.sin(ang) * r * 0.58;
      s.ell(bx, by, r * 0.42, r * 0.4, a.fruitDark);
      s.ell(bx, by - Q, r * 0.42 - Q, r * 0.4 - Q, i % 2 ? a.fruit : sang);
    }
    s.ell(8, cy, r * 0.4, r * 0.38, a.fruit);
    s.dot(8 - r * 0.2, cy - r * 0.2, sang);
    return;
  }

  const nCanh = shape === "disc" ? 12 : 10;
  const dai = shape === "disc" ? 1.2 : 1.45;
  for (let i = 0; i < nCanh; i++) {
    const ang = (i / nCanh) * Math.PI * 2 + (rnd() - 0.5) * 0.1;
    la(
      s,
      8 + Math.cos(ang) * r * 0.4,
      cy + Math.sin(ang) * r * 0.4,
      8 + Math.cos(ang) * r * dai,
      cy + Math.sin(ang) * r * dai,
      shape === "disc" ? 1 : 0.62,
      i % 2 ? a.fruit : sang,
      a.fruitDark,
    );
  }
  // nhuỵ: đĩa hạt ở giữa, tối và có vân
  const rn = shape === "disc" ? r * 0.62 : r * 0.4;
  s.ell(8, cy, rn, rn * 0.96, shade(a.fruitDark, 0.6));
  s.ell(8 - Q, cy - Q, rn - Q, rn * 0.96 - Q, a.fruitDark);
  if (shape === "disc")
    for (let j = 0; j < 16; j++) {
      const ang = rnd() * Math.PI * 2;
      const u = Math.sqrt(rnd()) * 0.8;
      s.dot(8 + Math.cos(ang) * rn * u, cy + Math.sin(ang) * rn * u, shade(a.fruitDark, 0.45));
    }
  s.dot(8 - rn * 0.35, cy - rn * 0.35, sang);
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

/* ------------------------------------------------------------- MÀU THEO MÙA

   Lớp phủ màu mùa toàn màn (`seasons[].tint`) rút bão hoà CẢ khung hình — nó
   nói "đang mùa nào" nhưng nói với mọi thứ như nhau, kể cả mặt đường. Cái
   thiếu là trạng thái của TỪNG VẬT: cái cây đổi lá, còn con đường thì không.

   Hàm dưới đây kéo một mã màu về phía màu của mùa, giữ nguyên độ sáng tương
   đối để khối vẫn đọc ra. Vật thể nào đổi màu là do content quyết
   (`prop.seasonal`), không phải bảng id gõ cứng trong mã.
--------------------------------------------------------------------------- */

/** Kéo `hex` về phía `dich` với tỉ lệ `k` (0..1). */
function pha(hex: string, dich: string, k: number): string {
  const a = parseInt(hex.slice(1), 16);
  const b = parseInt(dich.slice(1), 16);
  const m = (sh: number) => {
    const va = (a >> sh) & 255;
    const vb = (b >> sh) & 255;
    return Math.max(0, Math.min(255, Math.round(va + (vb - va) * k)));
  };
  return `#${((m(16) << 16) | (m(8) << 8) | m(0)).toString(16).padStart(6, "0")}`;
}

/** Bốn mùa, theo THỨ TỰ trong content: xuân · hạ · thu · đông. */
const MUA_LA: { dich: string; k: number; sang: number }[] = [
  { dich: "#b6f06a", k: 0.34, sang: 1.06 }, // xuân: lá non, xanh ngả vàng
  { dich: "#000000", k: 0, sang: 1 }, // hạ: nguyên bản, đây là màu gốc của content
  { dich: "#e8a33c", k: 0.52, sang: 1.0 }, // thu: vàng cam
  { dich: "#9fb3bd", k: 0.46, sang: 0.94 }, // đông: bạc đi, xám lạnh
];

/** Bảng màu của một vật thể ở mùa thứ `mua`. Mùa lạ → trả nguyên bản. */
export function artTheoMua(art: PropArt, mua: number): PropArt {
  const m = MUA_LA[mua];
  if (!m || m.k <= 0) return art;
  const doi = (hex: string) => shade(pha(hex, m.dich, m.k), m.sang);
  return { body: doi(art.body), dark: doi(art.dark), accent: doi(art.accent) };
}

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
 *
 * Đợt 24 vẽ lại ở nét HD. Bản cũ dựng người bằng bảy hình chữ nhật: đầu là một
 * khối vuông, mũ là một khối vuông đè lên, thân là một khối vuông nữa. Ở cỡ 16
 * pixel thì chừng ấy là đủ để đọc ra "một người"; ở cỡ 32 thì nó đọc ra "một
 * chồng hộp". Nay đầu có ĐƯỜNG BAO tròn, mũ có LƯỠI TRAI cong đúng theo hướng
 * nhìn, thân có nếp áo và dây yếm, chân có đầu gối và đế giày.
 *
 * Nhịp bước cũng mịn ra: cú nhún cũ cao một pixel CŨ (tức hai pixel HD) nên nó
 * giật; nay nửa pixel cũ, đúng một pixel HD.
 */
function makePlayer(dir: PlayerDir, frame: number, skin: CharSkin = DEFAULT_SKIN): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  const act = frame === PLAYER_ACT_FRAME;
  const raise = frame === PLAYER_RAISE_FRAME;
  // bước đi: 1 = chân trái trước, 2 = chụm (nhún), 3 = chân phải trước, 4 = chụm
  const walk = frame >= 1 && frame <= 4;
  const step = !walk ? 0 : frame === 1 ? 1 : frame === 3 ? -1 : 0;

  /* MƯỜI MỘT TƯ THẾ THÊM: mỗi tư thế là một bộ vài con số của cùng bộ xương —
     thân hạ bao nhiêu, chúi về đâu, hai tay đặt kiểu gì, đầu cúi hay ngẩng.
     Cùng lối với bảng `TU_THE` của vật nuôi: thêm tư thế là thêm một dòng, chứ
     không phải vẽ thêm một người. */
  const TAY = {
    thuong: 0, truoc: 1, giơ: 2, mot_giơ: 3, khoat: 4, chi: 5, thong: 6, duoi: 7, quet: 8,
  } as const;
  type KieuTay = (typeof TAY)[keyof typeof TAY];
  const TU: Record<number, { than: number; chui: number; tay: KieuTay; cui: number; ngoi: number }> = {
    [PF_CARRY]:  { than: 0,    chui: -0.5, tay: TAY.truoc,   cui: 0,    ngoi: 0 },
    [PF_TIRED]:  { than: 0.5,  chui: 0,    tay: TAY.thong,   cui: 1,    ngoi: 0 },
    [PF_SIT]:    { than: 2.5,  chui: 0,    tay: TAY.thuong,  cui: 0.5,  ngoi: 1 },
    [PF_WAVE]:   { than: 0,    chui: 0,    tay: TAY.mot_giơ, cui: -0.5, ngoi: 0 },
    [PF_CHAT]:   { than: 0,    chui: 0,    tay: TAY.khoat,   cui: 0,    ngoi: 0 },
    [PF_CROUCH]: { than: 2,    chui: 0.5,  tay: TAY.truoc,   cui: 1,    ngoi: 0.7 },
    [PF_POUR]:   { than: 0,    chui: 0.5,  tay: TAY.duoi,    cui: 0.5,  ngoi: 0 },
    [PF_WIPE]:   { than: 0,    chui: 0,    tay: TAY.quet,    cui: 0.5,  ngoi: 0 },
    [PF_CHEER]:  { than: -0.5, chui: 0,    tay: TAY.giơ,     cui: -1,   ngoi: 0 },
    [PF_PUSH]:   { than: 0,    chui: 1,    tay: TAY.duoi,    cui: 0.5,  ngoi: 0 },
    [PF_POINT]:  { than: 0,    chui: 0,    tay: TAY.chi,     cui: 0,    ngoi: 0 },
  };
  const tu = TU[frame] ?? null;
  const bob = (walk && (frame === 2 || frame === 4) ? Q : 0) + (tu ? tu.than : 0);
  // chạm: nghiêng người về hướng làm; giơ: ngả nhẹ về phía sau (lấy đà)
  const huong = dir === "left" ? -1 : dir === "right" ? 1 : 0;
  const lx =
    (act ? huong : raise ? -huong : 0) + (tu ? tu.chui * huong : 0);
  const ly = (act ? (dir === "up" ? -1 : dir === "down" ? 1 : 0) : raise ? -1 : 0) + (tu ? tu.cui * 0.5 : 0);

  const da = P.skin;
  const daToi = P.skinDark;
  const daSang = lighten(P.skin);
  const quan = skin.pants;
  const quanToi = darken(skin.pants);
  const ao = skin.shirt;
  const aoToi = skin.shirtDark;
  const giay = P.boot;
  const giayToi = shade(P.boot, 0.7);

  s.shadow(8, 15.2, 4.4, 1.5);

  const top = 1 + bob;

  /* CHÂN — ống quần thon về mắt cá, đầu gối sáng hơn một nấc, đế giày là một
     vạch tối riêng. Bản cũ là hai khối chữ nhật đặc và một vạch giày. */
  const chan = (x: number, y: number, truoc: boolean) => {
    const h = 3 - bob;
    for (let dy = 0; dy < h; dy += Q) {
      const co = dy / Math.max(Q, h); // 0 ở hông, 1 ở mắt cá
      const w = 2.5 - co * 0.5;
      for (let dx = 0; dx < w; dx += Q) s.dot(x + dx, y + dy, truoc ? quan : quanToi);
      s.dot(x, y + dy, truoc ? lighten(quan) : quan);
    }
    // giày: mũi chìa ra nửa pixel về phía trước
    const gy = 15 - bob;
    for (let dx = -Q; dx < 2.5; dx += Q) s.dot(x + dx, gy, giay);
    for (let dx = -Q; dx < 2.5; dx += Q) s.dot(x + dx, gy + Q, giayToi);
    s.dot(x, gy, lighten(giay));
  };

  const legY = 12 + bob;
  if (tu && tu.ngoi > 0) {
    /* NGỒI / NGỒI XỔM: chân gập lại, chỉ còn thấy đùi và bàn chân chìa ra
       trước. Vẽ chân duỗi rồi hạ cả người xuống thì ra hình người lún xuống
       đất, không ra hình người ngồi. */
    const h = Math.max(Q, (3 - bob) * (1 - tu.ngoi * 0.62));
    for (const kx of [5, 8.5]) {
      for (let dy = 0; dy < h; dy += Q)
        for (let dx = 0; dx < 2.5; dx += Q) s.dot(kx + dx, legY + dy, quan);
      // bàn chân chìa ra trước
      for (let dx = -Q; dx < 3; dx += Q) {
        s.dot(kx + dx + huong * 0.5, legY + h, giay);
        s.dot(kx + dx + huong * 0.5, legY + h + Q, giayToi);
      }
    }
  } else if (dir === "left" || dir === "right") {
    const front = dir === "right" ? 8 : 5.5;
    const back = dir === "right" ? 5.5 : 8;
    chan(back, legY, false);
    chan(front + step * 0.5, legY - (step !== 0 ? 0.5 : 0), true);
  } else {
    chan(5, legY - (step > 0 ? 0.5 : 0), step >= 0);
    chan(8.5, legY - (step < 0 ? 0.5 : 0), step < 0);
    /* KHE giữa hai ống quần. Không có nó thì đứng nhìn thẳng, hai ống cùng màu
       dính thành một cái váy bò — và bước đi mất hẳn nhịp vì mắt không thấy hai
       chân đâu. */
    for (let y = 0; y < 3 - bob; y += Q) s.dot(8, legY + y, shade(quan, 0.55));
  }

  s.g.save();
  s.g.translate(lx * ART, ly * ART);

  /* THÂN — áo trên, yếm quần dưới, hai dây yếm vắt qua vai và hai cúc đồng.
     Vai xuôi chứ không vuông: bốn góc trên được vát đi một pixel HD. */
  const tx = 4.5;
  const tw = 7;
  const ty = top + 5.5;
  // áo phủ CẢ thân trước, rồi yếm quần đắp lên: như thế cái áo trắng mới thấy
  // được ở vai và hai bên sườn, đúng cách một bộ yếm quần bò trông ngoài đời.
  for (let y = 0; y < 6.5; y += Q) {
    const vai = y < Q ? Q : 0; // vát vai
    for (let x = vai; x < tw - vai; x += Q) s.dot(tx + x, ty + y, ao);
  }
  for (let y = Q; y < 3; y += Q) {
    s.dot(tx + Q, ty + y, lighten(ao));
    s.dot(tx + tw - Q * 2, ty + y, aoToi);
  }
  // YẾM: mảng hẹp ở giữa ngực, loe ra thành quần từ ngang hông
  for (let y = 1.5; y < 6.5; y += Q) {
    const hong = y >= 3.5;
    const w = hong ? tw : 4;
    const x0 = hong ? 0 : 1.5;
    for (let x = x0; x < x0 + w; x += Q) s.dot(tx + x, ty + y, quan);
    s.dot(tx + x0, ty + y, lighten(quan));
    s.dot(tx + x0 + w - Q, ty + y, quanToi);
  }
  // hai dây yếm vắt lên vai + hai cúc đồng ở đầu dây
  for (const k of [0, 1]) {
    const dx = tx + 1.5 + k * 3.5;
    for (let y = 0; y < 1.5; y += Q) s.dot(dx, ty + y, quan);
    s.dot(dx, ty + 1.5, "#e0b968");
  }
  // đường may ngang hông
  for (let x = 0; x < tw; x += Q) s.dot(tx + x, ty + 3.5, quanToi);

  /* TAY — có bàn tay (một đốt da sáng ở đầu) chứ không phải một que màu da. */
  function tayDoc(x: number, y: number, h: number) {
    for (let dy = 0; dy < h; dy += Q) {
      s.dot(x, y + dy, da);
      s.dot(x + Q, y + dy, daToi);
    }
    s.dot(x, y + h - Q, daSang);
  }
  function tayNgang(x: number, y: number, w: number, h2: number) {
    for (let dx = 0; dx < w; dx += Q) {
      s.dot(x + dx, y, da);
      s.dot(x + dx, y + Q, daToi);
    }
    s.dot(x + (h2 > 0 ? w - Q : 0), y, daSang);
  }

  const armY = top + 6.5;
  if (tu) {
    const k = tu.tay;
    const truoc = huong || (dir === "down" ? 0 : 0);
    if (k === TAY.truoc) {
      // hai tay đưa ra TRƯỚC, sát nhau — dáng bê một thùng đồ
      if (huong) tayNgang(8 + huong * 2.5, armY + 1.5, 4, huong);
      else {
        tayDoc(4.5, armY + 1.5, 3);
        tayDoc(10.5, armY + 1.5, 3);
      }
    } else if (k === TAY.giơ) {
      tayDoc(3.5, top - 1, 7);
      tayDoc(11.5, top - 1, 7);
    } else if (k === TAY.mot_giơ) {
      tayDoc(11.5, top - 1.5, 6.5);
      tayDoc(3.5, armY, 4);
      // bàn tay xoè ở đầu tay giơ
      for (let dx = -Q; dx <= Q; dx += Q) s.dot(11.5 + dx, top - 2, daSang);
    } else if (k === TAY.khoat) {
      tayNgang(huong >= 0 ? 11 : 1.5, armY + 0.5, 4, huong || 1);
      tayDoc(huong >= 0 ? 3.5 : 11.5, armY, 4);
    } else if (k === TAY.chi) {
      tayNgang(huong >= 0 ? 10.5 : 1, armY + 1, 5, huong || 1);
      tayDoc(huong >= 0 ? 3.5 : 11.5, armY, 4);
    } else if (k === TAY.thong) {
      tayDoc(3.5, armY + 1, 4.5);
      tayDoc(11.5, armY + 1, 4.5);
    } else if (k === TAY.duoi) {
      if (huong) tayNgang(8 + huong * 2, armY + 2.5, 5, huong);
      else {
        tayDoc(4.5, armY + 2, 3.5);
        tayDoc(10.5, armY + 2, 3.5);
      }
    } else if (k === TAY.quet) {
      // một tay đưa lên trán, một tay chống hông
      tayDoc(10.5, top + 0.5, 5.5);
      for (let dx = 0; dx < 2.5; dx += Q) s.dot(8 + dx, top + 0.5, da);
      tayDoc(3.5, armY + 0.5, 4);
    } else {
      tayDoc(3.5, armY, 4);
      tayDoc(11.5, armY, 4);
    }
    void truoc;
  } else if (act) {
    if (dir === "left") {
      tayNgang(1, armY + 2, 5, -1);
      s.rect(0.5, armY + 1, 1.5, 1.5, P.metal);
    } else if (dir === "right") {
      tayNgang(10, armY + 2, 5, 1);
      s.rect(14, armY + 1, 1.5, 1.5, P.metal);
    } else if (dir === "up") {
      tayDoc(4, top + 1, 5);
      tayDoc(10.5, top + 1, 5);
      s.rect(7, top - 1, 2, 1.5, P.metal);
    } else {
      tayDoc(3.5, armY + 3, 3.5);
      tayDoc(11.5, armY + 3, 3.5);
      s.rect(6, armY + 6, 4, 1.5, P.metal);
    }
  } else if (raise) {
    // Hai tay giơ lên trên đầu (công cụ vẽ riêng ở renderer, chồng lên đây).
    if (dir === "left") tayDoc(4, top - 1, 7);
    else if (dir === "right") tayDoc(11, top - 1, 7);
    else {
      tayDoc(3, top, 6);
      tayDoc(11.5, top, 6);
    }
  } else {
    const vung = step > 0 ? -0.5 : step < 0 ? 0.5 : 0;
    if (dir === "left") tayDoc(4, armY + vung, 4);
    else if (dir === "right") tayDoc(11, armY + vung, 4);
    else {
      tayDoc(3, armY - (step > 0 ? 0.5 : 0), 4);
      tayDoc(11.5, armY + (step > 0 ? 0.5 : 0), 4);
    }
  }

  /* ĐẦU — to hơn thân (chibi), nhưng có đường bao TRÒN: bốn góc vát, cằm hẹp
     hơn thái dương. Đây là nét khác lớn nhất giữa "một cái đầu" và "một khối
     vuông màu da". */
  const hy = top + 1;
  const hh = 5.5;
  /** Nửa bề ngang của đầu tại độ cao `y` tính từ đỉnh đầu. */
  const hw = (y: number) => 4.5 - Math.abs(y / hh - 0.5) * 1.1;
  /* Đầu chỉ vát NHẸ ở hai đầu. Vát mạnh (bản đầu Đợt 24) cho ra một khuôn mặt
     DÀI: đúng là bo tròn, nhưng bo tròn kiểu quả trứng dựng đứng chứ không phải
     kiểu chibi, và cả nhân vật hoá ra gầy nhẳng. */
  for (let y = 0; y < hh; y += Q) {
    const w = hw(y);
    for (let x = -w; x <= w; x += Q) s.dot(8 + x, hy + y, da);
    s.dot(8 - w, hy + y, daToi);
    s.dot(8 + w, hy + y, daToi);
  }
  // má sáng chếch trên-trái, quai hàm tối
  for (let x = -2; x <= 0; x += Q) s.dot(8 + x, hy + 1, daSang);
  for (let x = -3; x <= 3; x += Q) s.dot(8 + x, hy + hh - Q, daToi);

  /* MŨ LƯỠI TRAI — nét nhận diện chính ở kích thước nhỏ. Chỏm mũ cong, lưỡi
     trai chìa ra ĐÚNG PHÍA đang nhìn và dày dần về mũi. */
  const cy = top - 0.5;
  const ch = 2; // chỏm THẤP: chỏm cao thành cái mũ len, không ra mũ lưỡi trai
  for (let y = 0; y < ch; y += Q) {
    const w = 4.8 - Math.max(0, 1 - y) * 1.4;
    for (let x = -w; x <= w; x += Q) s.dot(8 + x, cy + y, skin.cap);
  }
  for (let x = -3; x <= 0.5; x += Q) s.dot(8 + x, cy + Q, lighten(skin.cap));
  for (let x = -4.8; x <= 4.8; x += Q) s.dot(8 + x, cy + ch, skin.cap);
  const luoi = (x0: number, x1: number, y: number) => {
    for (let x = x0; x <= x1; x += Q) {
      s.dot(x, y, darken(skin.cap));
      s.dot(x, y + Q, shade(skin.cap, 0.62));
      s.dot(x, y + Q * 2, shade(skin.cap, 0.45));
    }
  };
  if (dir === "down") luoi(3, 13, cy + ch + Q);
  else if (dir === "left") luoi(1.5, 7.5, cy + ch + Q);
  else if (dir === "right") luoi(8.5, 14.5, cy + ch + Q);
  else {
    // nhìn từ sau: chỉ thấy gáy mũ, không thấy lưỡi trai
    for (let x = -4.8; x <= 4.8; x += Q) s.dot(8 + x, cy + ch + Q, darken(skin.cap));
  }

  /* MẶT — mắt có tròng đen và một chấm sáng, mũi một pixel, miệng một nét.
     Ở HD thì chừng này đủ để mặt có biểu cảm mà không thành hoạt hình. */
  if (dir === "down") {
    /* Mắt phải TO: một pixel HD làm tròng thì ở cỡ thật nó biến mất, và cái mặt
       chỉ còn hai gò má hồng với một cái miệng — đúng cảnh bản đầu Đợt 24. Hai
       pixel tròng cộng một chấm trắng là ngưỡng đọc được. */
    for (const k of [-2, 1]) {
      s.dot(8 + k, hy + 2.5, P.outline);
      s.dot(8 + k + Q, hy + 2.5, P.outline);
      s.dot(8 + k, hy + 3, P.outline);
      s.dot(8 + k + Q, hy + 3, P.outline);
      s.dot(8 + k, hy + 2.5, "#ffffff");
    }
    s.dot(8, hy + 3.5, daToi);       // mũi
    s.dot(8, hy + 4, daToi);
    for (const k of [-1, -0.5, 0, 0.5]) s.dot(8 + k, hy + 4.5, "#a4604a"); // miệng
    s.dot(8 - 0.5, hy + 5, "#c98a72");
    s.dot(8, hy + 5, "#c98a72");
    s.dot(6, hy + 4, "#e08a8a");     // má ửng
    s.dot(10, hy + 4, "#e08a8a");
  } else if (dir === "up") {
    /* GÁY: tóc phủ kín, nhưng phải ÔM THEO đường bao của cái đầu. Vẽ nó bằng
       một hình chữ nhật (bản đầu) thì cái đầu đang tròn bỗng vuông lại ở phía
       sau, và nhìn từ sau lưng nhân vật đội một cái hộp đen. */
    for (let y = 0.5; y < hh; y += Q) {
      const w = hw(y) - Q;
      for (let x = -w; x <= w; x += Q) s.dot(8 + x, hy + y, skin.hair);
      s.dot(8 - w, hy + y, shade(skin.hair, 0.72));
      s.dot(8 + w, hy + y, shade(skin.hair, 0.72));
      if (y < 1.5) s.dot(8 - w * 0.4, hy + y, lighten(skin.hair));
    }
    // mấy lọn tóc lởm chởm ở gáy — đường chân tóc thẳng băng trông như cái mũ
    for (const k of [-2, -0.5, 1, 2.5]) s.dot(8 + k, hy + hh, shade(skin.hair, 0.72));
  } else {
    /* `q` = phía NHÌN TỚI (−1 là trái). Tóc phủ phía SAU gáy, tức phía −q; mắt
       và mũi nằm phía trước, tức phía +q. Viết ngược hai dấu này thì nhân vật
       quay lưng về hướng đang đi, và nó trông như đi giật lùi. */
    const q = dir === "left" ? -1 : 1;
    /* Tóc phủ nửa sau đầu, ÔM theo đường bao và có mái xoà xuống trán. Bản đầu
       là một hình chữ nhật đặc — nhìn nghiêng thì nửa sau cái đầu thành một
       khối đen vuông, và mặt người biến mất một nửa. */
    for (let y = 0.5; y < hh - Q; y += Q) {
      const w = hw(y) - Q;
      // mép trước của tóc: cao thì che gần hết trán, thấp thì lùi về mang tai
      const truoc = y < 1.6 ? -w * 0.5 : y < 2.6 ? w * 0.1 : w * 0.55;
      for (let x = truoc; x <= w; x += Q) s.dot(8 - q * x, hy + y, skin.hair);
      s.dot(8 - q * w, hy + y, shade(skin.hair, 0.72));
      if (y < 2) s.dot(8 - q * (w - 0.5), hy + y, lighten(skin.hair));
    }
    for (const k of [1.5, 2.5, 3.5]) s.dot(8 - q * k, hy + hh - Q, shade(skin.hair, 0.72));
    // mắt nghiêng: một con, tròng đen có chấm sáng
    const ex = 8 + q * 1.5;
    s.dot(ex, hy + 2.5, P.outline);
    s.dot(ex, hy + 3, P.outline);
    s.dot(ex + q * Q, hy + 2.5, P.outline);
    s.dot(ex - q * Q, hy + 2.5, "#ffffff");
    // sống mũi chìa ra khỏi đường bao mặt
    s.dot(8 + q * 3.5, hy + 3.5, da);
    s.dot(8 + q * 4, hy + 3.5, daToi);
    s.dot(8 + q * 3, hy + 4, daToi);
    s.dot(8 + q * 2, hy + 4.5, "#a4604a"); // miệng
    s.dot(8 + q * 1.5, hy + 4.5, "#a4604a");
  }
  s.g.restore();
  return outline(s, P.outline, 1).c;
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

/** Vũng nước 16×16: một elip xanh nhạt mờ, viền tối, một chấm phản chiếu. */
function makePuddle(k: number): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  const cx = k === 0 ? 8 : 7;
  const cy = k === 0 ? 10 : 8;
  const rx = k === 0 ? 5 : 4;
  const ry = k === 0 ? 2.5 : 2;
  s.g.globalAlpha = 0.55;
  s.ell(cx, cy, rx + 0.6, ry + 0.6, "#3d5a78");
  s.ell(cx, cy, rx, ry, "#7fb6ec");
  s.g.globalAlpha = 0.8;
  s.px(cx - 2, cy - 1, "#dff1ff");
  s.g.globalAlpha = 1;
  return s.c;
}

/**
 * Cụm KHÓI từ ống khói. Bốn cỡ: mới thoát ra thì nhỏ và đặc, lên cao thì to và
 * loãng — đó là toàn bộ thứ mắt cần để đọc ra "khói đang bay lên".
 */
function makeSmoke(i: number): HTMLCanvasElement {
  const s = surface(10, 10);
  const r = 1.8 + i * 1.0;
  const a = 0.85 - i * 0.17;
  s.g.globalAlpha = Math.max(0.14, a);
  s.ell(5, 5, r, r * 0.86, "#cfcac2");
  s.g.globalAlpha = Math.max(0.1, a * 0.85);
  s.ell(5 - r * 0.28, 5 - r * 0.3, r * 0.6, r * 0.52, "#f4f1ea");
  s.g.globalAlpha = 1;
  return s.c;
}

/** BƯỚM 5×5: hai khung vỗ cánh, ba màu. Bay lượn ngoài đồng lúc trời sáng. */
function makeButterfly(mau: number, frame: number): HTMLCanvasElement {
  const s = surface(5, 5);
  const than = ["#f2c14e", "#e88fb0", "#8fd3f4"][mau] ?? "#f2c14e";
  const toi = shade(than, 0.7);
  const mo = frame === 0; // cánh mở
  s.px(2, 2, "#3a2f28");
  s.px(2, 3, "#3a2f28");
  if (mo) {
    s.rect(0, 1, 2, 2, than);
    s.rect(3, 1, 2, 2, than);
    s.px(0, 3, toi);
    s.px(4, 3, toi);
  } else {
    s.px(1, 1, than);
    s.px(3, 1, than);
    s.px(1, 2, toi);
    s.px(3, 2, toi);
  }
  return s.c;
}

/** ĐOM ĐÓM 3×3: một chấm sáng có quầng. Ba mức để nó nhấp nháy. */
function makeFirefly(i: number): HTMLCanvasElement {
  const s = surface(3, 3);
  const a = [0.35, 0.7, 1][i] ?? 1;
  s.g.globalAlpha = a * 0.5;
  s.ell(1.5, 1.5, 1.5, 1.5, "#d8ff8a");
  s.g.globalAlpha = a;
  s.px(1, 1, "#f6ffd0");
  s.g.globalAlpha = 1;
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
  /** CẦU (`prop.bridge`): 16 biến thể theo cạnh nào có LAN CAN (khoá `tileMaskKey`). */
  propMask: Record<string, Map<string, HTMLCanvasElement>>;
  /** Lan can cạnh DƯỚI của cầu — vẽ SAU người/xe đứng trên ô, nên là hình riêng. */
  propOver: Record<string, HTMLCanvasElement>;
  /**
   * Vật thể ĐỔI MÀU THEO MÙA (`prop.seasonal`) — cây và cỏ xanh non mùa xuân,
   * vàng cam mùa thu, bạc đi mùa đông. Dựng LƯỜI: một ván chỉ đi qua bốn mùa,
   * mà dựng sẵn cả bốn cho mọi loại cây là trả tiền cho ba mùa chưa tới.
   * Trả `null` nếu vật này không đổi màu — nơi gọi dùng `atlas.props[id]`.
   */
  propMua(id: string, mua: number): HTMLCanvasElement | null;
  /**
   * KIỂU HÌNH của một vật thể (cửa đóng → cửa mở). Dựng LƯỜI: kiểu nào không
   * bao giờ xảy ra thì không tốn một pixel nào, và cửa đóng (kiểu 0) trả về
   * hình gốc nên không thêm một lệnh vẽ nào cho cả nông trại.
   */
  propKieu(id: string, kieu: number): HTMLCanvasElement | null;
  /** công trình tự nối: id → (khoá bitmask → sprite) */
  autotiles: Record<string, Map<string, HTMLCanvasElement>>;
  /** vật thể NHIỀU Ô tự nối (`prop.block`): id → (khoá trái-phải → sprite) */
  blocks: Record<string, Map<string, HTMLCanvasElement>>;
  /** vật nuôi: dựng LƯỜI ở lần dùng đầu tiên để thời gian khởi động không đổi */
  animal(defId: string, dir: PlayerDir, frame: number, pose?: AnimalPose): HTMLCanvasElement | null;
  /** Bong bóng cảm xúc 9×9 nổi trên đầu con vật / người làm. */
  emote(kind: EmoteKind): HTMLCanvasElement;
  /** người làm thuê: cùng 28 khung với nhân vật chính, khác bảng màu */
  worker(skin: number, dir: PlayerDir, frame: number): HTMLCanvasElement;
  /** xe: 4 hướng, không cần khung đi (bánh quay không thấy ở cỡ này) */
  /** Xe 32×32, hai khung bánh (`frame` 0/1). Site gọi hai tham số → khung 0. */
  vehicle(defId: string, dir: PlayerDir, frame?: number): HTMLCanvasElement | null;
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
  /** Cái MÁNG theo MỨC ĐẦY (0..3) và theo MÓN đang nằm trong đó. */
  trough(feedId: string | null, muc: number): HTMLCanvasElement;
  /** Mẻ thức ăn nổi trên ô nước — lớp phủ, vẽ đè lên mặt nước. */
  pondFeed(feedId: string, muc: number): HTMLCanvasElement;
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
  /** Vũng nước trên lối đi khi trời mưa — hai hình, chọn theo băm toạ độ ô. */
  puddle: HTMLCanvasElement[];
  /** Cụm khói bốc lên từ ống khói — bốn cỡ, càng lên cao càng to và càng nhạt. */
  smoke: HTMLCanvasElement[];
  /** Bướm bay ban ngày — hai khung vỗ cánh × ba màu. */
  buom: HTMLCanvasElement[][];
  /** Đom đóm ban đêm — ba mức sáng. */
  firefly: HTMLCanvasElement[];
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

/**
 * MỘT Ô của một công trình nhiều ô tự nối (`prop.block`).
 *
 * Cao hai ô: nửa trên là MÁI, nửa dưới là MẶT TIỀN. Một dãy ba–bốn ô kề nhau
 * ra một dãy nhà, thay vì ba–bốn cái hộp 16×16 đứng rời.
 *
 * Chỉ nhìn TRÁI–PHẢI, không nhìn trên–dưới. Vì sao: một công trình cao hai ô
 * đã chiếm sẵn ô phía trên bằng phần vẽ tràn lên, nên xếp chồng hai hàng là
 * chồng mái lên mái. Nối theo chiều ngang thì một hàng ô là một dãy phố —
 * đúng hình dạng của chợ và của quầy thu mua.
 *
 * Màu lấy từ `art` của CHÍNH vật thể trong content, không gắn cứng như
 * `makeHouseTile`. Nhờ vậy thêm một công trình nhiều ô nữa chỉ là thêm một
 * object JSON có `block: true`.
 */
function makeBlockTile(art: PropArt, left: boolean, right: boolean): HTMLCanvasElement {
  const H = TILE * 2;
  const s = surface(TILE, H);
  const than = art.body;
  const toi = art.dark;
  const sang = lighten(art.body);
  const nhan = art.accent;

  const MAI = 7; // mái chiếm 7px trên cùng của nửa trên

  /* ---- MÁI ---- */
  s.rect(0, 2, TILE, MAI, toi);
  s.hline(0, 2, TILE, sang); // sống mái bắt sáng
  s.hline(0, MAI + 1, TILE, shade(toi, 0.75)); // bóng dưới diềm
  // Diềm mái nhô ra ở hai ĐẦU dãy — đó là thứ cho biết dãy nhà bắt đầu/kết thúc.
  if (!left) s.vline(0, 2, MAI, shade(toi, 0.72));
  if (!right) s.vline(TILE - 1, 2, MAI, shade(toi, 0.72));

  /* ---- THÂN ---- */
  const T = MAI + 2;
  s.rect(0, T, TILE, H - T - 1, than);
  if (!left) s.vline(0, T, H - T - 1, shade(than, 0.72));
  if (!right) s.vline(TILE - 1, T, H - T - 1, shade(than, 0.72));

  /* ---- BẠT CHE: sọc màu nhấn, chạy suốt dãy ---- */
  s.rect(0, T, TILE, 3, nhan);
  for (let x = left ? 0 : 1; x < TILE; x += 4) s.rect(x, T, 2, 3, shade(nhan, 0.72));
  s.hline(0, T + 3, TILE, shade(nhan, 0.6));

  /* ---- MẶT TIỀN: quầy gỗ + khoảng tối bên trong ---- */
  const Q = T + 5;
  s.rect(1, Q, TILE - 2, H - Q - 2, shade(than, 0.45)); // trong nhà, tối
  s.hline(1, Q, TILE - 2, shade(than, 0.62));
  // mặt quầy chìa ra
  s.rect(0, H - 4, TILE, 3, sang);
  s.hline(0, H - 4, TILE, lighten(sang));
  s.hline(0, H - 2, TILE, toi);
  s.shadow(TILE / 2, H - 1, 7, 1.4);
  return outline(s).c;
}

/** Khoá biến thể của một ô công trình nhiều ô: chỉ trái–phải. */
export function blockVariantKey(left: boolean, right: boolean): string {
  return `${left ? 1 : 0}${right ? 1 : 0}`;
}

/**
 * CẦU ĐƯỜNG qua sông: mặt nhựa nằm trên khung gỗ, có vạch kẻ như con đường.
 *
 * Khác cầu tàu ở chỗ nó phải ĐỌC RA LÀ ĐƯỜNG — xe tải chạy qua đây, và nếu
 * nhìn nó giống cầu gỗ đi bộ thì người chơi không hiểu vì sao chiếc xe lại
 * băng qua mặt nước.
 */
function makeRoadBridge(art: PropArt, rail: Neighbors = KHONG_LAN_CAN): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  const nhua = art.body;
  const toi = art.dark;
  const vach = art.accent;
  // mặt nhựa phủ kín; dầm gỗ chỉ nhô ở cạnh có lan can (cạnh giáp nước)
  s.rect(0, 0, TILE, TILE, nhua);
  /* Vạch kẻ đứt ở mép PHẢI — chỉ khi bên phải KHÔNG có lan can, tức là còn
     một cột cầu nữa (hai ô cầu kề nhau thì vạch nằm đúng giữa lòng đường).
     Trước đây vạch vẽ luôn và nằm sát mép cầu ở cột ngoài. */
  if (!rail.right) for (let y = 3; y < TILE - 3; y += 4) s.rect(TILE - 1, y, 1, 2, vach);
  // lan can THÉP: cột tối, thanh sọc vàng-đen (`accent` là màu vạch)
  const thep = shade(toi, 0.85);
  const soc = (x: number, y: number, w: number, h: number, doc: boolean) => {
    s.rect(x, y, w, h, thep);
    for (let k = 0; k < (doc ? h : w); k += 4)
      if (doc) s.rect(x, y + k, w, 2, vach);
      else s.rect(x + k, y, 2, h, vach);
  };
  if (rail.left) {
    s.rect(0, 0, 2, TILE, "#6b4a2c");
    soc(0, 0, 2, TILE, true);
  }
  if (rail.right) {
    s.rect(TILE - 2, 0, 2, TILE, "#6b4a2c");
    soc(TILE - 2, 0, 2, TILE, true);
  }
  if (rail.up) {
    s.rect(0, 0, TILE, 2, "#6b4a2c");
    soc(0, 0, TILE, 2, false);
  }
  return outline(s).c;
}

/** Lan can CẠNH DƯỚI của cầu đường — vẽ đè lên xe/người đang qua cầu. */
function makeRoadBridgeOver(art: PropArt): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  const thep = shade(art.dark, 0.85);
  s.rect(0, TILE - 3, TILE, 3, thep);
  for (let k = 0; k < TILE; k += 4) s.rect(k, TILE - 3, 2, 2, art.accent);
  s.hline(0, TILE - 1, TILE, "#4a3320");
  return s.c;
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
    /* `s.g` là canvas THẬT nên MỌI toạ độ ở đây tính bằng pixel ẢNH — cả nguồn
       lẫn đích. Viết đích theo đơn vị cũ thì hình cây co lại còn một góc nhãn. */
    s.g.drawImage(ripe, 2 * ART, ripe.height - 12 * ART, 12 * ART, 12 * ART, 4 * ART, 5 * ART, 8 * ART, 8 * ART);
  } else {
    s.disc(8, 9, 2, def.art.fruit);
    s.px(7, 8, def.art.fruitDark);
  }

  // vài hạt lộ ra ở miệng túi
  s.px(5, 2, "#8a6440");
  s.px(9, 2, "#8a6440");
  return outline(s).c;
}

/* ---------------------------------------------------------------------------
   BIỂU TƯỢNG NÔNG SẢN — trong túi đồ, trong kho, ngoài quầy bán.

   Bản trước vẽ đúng một hình cho cả 61 cây: hai đĩa tròn lệch nhau, khác mỗi
   màu. Trong túi đồ chúng là 61 ô tròn na ná, và người chơi phải rê chuột đọc
   chữ mới biết mình đang cầm gì — đúng cái lỗi mà bảng `MAT` đã sửa cho vật tư
   từ lâu, chỉ là chưa ai sửa cho nông sản.

   Nay biểu tượng dùng CHÍNH dáng quả của cây (`veQua`), nên quả ớt trong túi là
   quả ớt ngoài ruộng. Cây ăn LÁ thì không có quả để vẽ — chúng lấy cụm lá làm
   biểu tượng, và như thế "rau" với "quả" phân biệt được ngay từ bóng dáng.
--------------------------------------------------------------------------- */
function makeCropIcon(def: CropDef): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  const a = def.art;
  const rnd = mulberry32(hash2(def.id.length, 7, 0x5c1));
  const form = a.form ?? "leafy";
  /* Cây KHÔNG CÓ QUẢ thì món hàng chính là cái lá, nên biểu tượng phải là một
     bó rau. Luật đọc từ content (`fruitCount === 0`) chứ không phải một danh
     sách tên cây gõ tay — thêm cây rau mới là xong, không phải sửa code. Cây
     thân cao đứng ngoài luật: mía không có quả nhưng món hàng là khúc thân. */
  const laKhong = form === "herb" || (form !== "stalk" && a.fruitCount === 0);

  if (form === "head") {
    // BẮP: một khối cầu cuộn có nếp — khác hẳn bó rau thơm bên dưới.
    s.ell(8, 9.5, 5.4, 5, a.leafDark);
    s.ell(8, 9.5 - Q, 5.4 - Q, 5 - Q, a.leaf);
    s.ell(8 - 1.8, 9.5 - 2, 1.9, 1.4, lighten(a.leaf));
    for (const g of [2.4, 4.2])
      for (let x = -g; x <= g; x += Q) {
        const y = 9.5 - Math.sqrt(Math.max(0, g * g - x * x)) * 0.92;
        s.dot(8 + x, y, a.leafDark);
        s.dot(8 + x, y + Q, lighten(a.leaf));
      }
    for (const k of [-1, 1]) la(s, 8, 13.4, 8 + k * 5.6, 12.4, 1.3, a.leafDark, shade(a.leafDark, 0.8));
    return outline(s, shade(a.leafDark, 0.5), 1).c;
  }

  if (laKhong) {
    /* BÓ RAU — nhưng bó theo ĐÚNG kiểu lá của cây, không phải một hình chung.
       Chín loại rau thơm mà chung một bó thì trong túi đồ chúng lại là chín ô
       giống nhau, tức là vừa sửa xong ngoài ruộng đã hỏng lại trong túi. */
    const kieu = a.leafShape ?? "blade";
    if (kieu === "tube") {
      for (const k of [-1, 0, 1]) {
        const x = 8 + k * 2.4;
        soi(s, x, 12.6, x + k * 1.2, 2.4 + Math.abs(k), k === 0 ? lighten(a.leaf) : a.leaf, a.leafDark, Q * 3);
        for (let y = 0; y < 3.2; y += Q) s.dot(x, 12.6 - y, k < 0 ? shade(a.fruit, 0.86) : a.fruit);
      }
    } else if (kieu === "round") {
      canhLaTron(s, 8, 13.4, 9.4, 2.5, a.leaf, a.leafDark, a.stem);
    } else if (kieu === "lobed") {
      for (let i = 0; i < 3; i++) {
        const k = i - 1;
        const tx = 8 + k * 3.6;
        const ty = 5 + Math.abs(k) * 1.8;
        soi(s, 8 + k * 0.8, 13.4, tx, ty, a.stem, a.leafDark);
        for (const d of [-1, 0, 1]) {
          s.ell(tx + d * 1.5, ty - (d === 0 ? 1.1 : 0), 1.4, 1.1, a.leafDark);
          s.ell(tx + d * 1.5, ty - (d === 0 ? 1.1 : 0) - Q, 1.4 - Q, 1.1 - Q, i === 1 ? lighten(a.leaf) : a.leaf);
        }
      }
    } else {
      for (let i = 0; i < 3; i++) {
        const k = i - 1;
        la(s, 8 + k * 0.6, 13.5, 8 + k * 3.4, 3.6 + Math.abs(k) * 1.6, 1.9,
           i === 1 ? lighten(a.leaf) : a.leaf, a.leafDark, lighten(a.leaf));
      }
    }
    for (let x = 5.4; x <= 10.6; x += Q) {
      s.dot(x, 11.6, a.stem);
      s.dot(x, 11.6 + Q, shade(a.stem, 0.7));
    }
    return outline(s, shade(a.leafDark, 0.5), 1).c;
  }

  if (form === "grain") {
    // BÓ LÚA: ba bông chụm, buộc lạt — món hàng, không phải cái cây.
    for (let i = 0; i < 3; i++) {
      const k = i - 1;
      const tx = 8 + k * 3.2;
      const ty = 2.6 + Math.abs(k) * 1.4;
      soi(s, 8 + k * 0.7, 13.4, tx, ty + 4.4, a.leaf, a.leafDark, Q * 2);
      for (let j = 0; j <= 9; j++) {
        const y = ty + j * 0.5;
        s.dot(tx, y, a.fruit);
        s.dot(tx + Q, y, a.fruitDark);
        if (j % 2 === 0) {
          s.dot(tx - 0.7, y + 0.3, a.fruit);
          s.dot(tx + 0.7, y + 0.3, a.fruit);
        }
      }
    }
    for (let x = 5.4; x <= 10.6; x += Q) {
      s.dot(x, 11.8, a.stem);
      s.dot(x, 11.8 + Q, shade(a.stem, 0.7));
    }
    return outline(s, shade(a.fruitDark, 0.55), 1).c;
  }

  if (form === "flower") {
    // MỘT BÔNG cắt cành: cánh toả, nhuỵ tối, một chiếc lá dưới cuống.
    for (let y = 9; y < 14.4; y += Q) s.dot(8, y, a.stem);
    la(s, 8, 12.4, 12.4, 11, 1.2, a.leaf, a.leafDark, lighten(a.leaf));
    for (let i = 0; i < 9; i++) {
      const ang = (i / 9) * Math.PI * 2;
      la(s, 8 + Math.cos(ang) * 1.8, 7 + Math.sin(ang) * 1.8,
         8 + Math.cos(ang) * 5.4, 7 + Math.sin(ang) * 5.4,
         1.1, i % 2 ? a.fruit : lighten(a.fruit), a.fruitDark);
    }
    s.ell(8, 7, 2.1, 2.1, shade(a.fruitDark, 0.6));
    s.ell(8 - Q, 7 - Q, 2.1 - Q, 2.1 - Q, a.fruitDark);
    s.dot(7.2, 6.2, lighten(a.fruit));
    return outline(s, shade(a.fruitDark, 0.55), 1).c;
  }

  const r = Math.max(2.6, Math.min(5.6, a.fruitSize * 0.62));
  // hai chiếc lá nhỏ sau quả: chúng nói "đây là nông sản", không phải viên đá
  for (const k of [-1, 1])
    la(s, 8, 4.4, 8 + k * 3.6, 2.2, 1.1, a.leaf, a.leafDark, lighten(a.leaf));
  veQua(s, a, 8, 9.4, r, rnd);
  return outline(s, shade(a.fruitDark, 0.55), 1).c;
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

type MatKind = "chai" | "trung" | "long" | "thit" | "ca" | "soi" | "ong" | "kinh" | "khoi" | "tui";

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
  // core 1.34 — vật tư chỉ mua và món chế biến
  pipe: { kind: "ong", mau: "#9aa3ad", toi: "#5f6770" },
  glass: { kind: "kinh", mau: "#bfe4f0", toi: "#6fa9bd" },
  cheese: { kind: "khoi", mau: "#f2cf5a", toi: "#c29a2a" },
  goatcheese: { kind: "khoi", mau: "#f4efd6", toi: "#c7bd94" },
  yarn: { kind: "long", mau: "#d86a5c", toi: "#9c3f36" },
  roastcoffee: { kind: "tui", mau: "#6b4a2c", toi: "#3d2814", nhan: "#e8c37a" },
  driedtea: { kind: "tui", mau: "#7fa653", toi: "#4f6f31", nhan: "#e8f0d0" },
  jam: { kind: "chai", mau: "#c0334a", toi: "#7e1f30", nhan: "#f6e6c8" },
  fishcake: { kind: "khoi", mau: "#e8c9a0", toi: "#b8946a" },
  sausage: { kind: "thit", mau: "#b8543f", toi: "#7d3327" },
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
  if (kind === "ong") {
    // ỐNG NƯỚC: một khuỷu chữ L, hai đầu có gờ nối
    s.rect(3, 4, 9, 3, toi);
    s.rect(3, 4, 9, 1, sang);
    s.rect(10, 4, 3, 10, toi);
    s.vline(10, 4, 10, sang);
    s.rect(2, 3, 2, 5, mau);
    s.rect(9, 12, 5, 2, mau);
    s.px(2, 3, sang);
    return;
  }
  if (kind === "kinh") {
    // TẤM KÍNH: hình chữ nhật nghiêng, một vệt phản quang chéo
    s.rect(3, 2, 10, 12, toi);
    s.rect(4, 3, 8, 10, mau);
    for (let i = 0; i < 6; i++) s.px(5 + i, 11 - i, "#ffffff");
    for (let i = 0; i < 4; i++) s.px(8 + i, 12 - i, sang);
    return;
  }
  if (kind === "khoi") {
    // KHỐI (phô mai, chả): miếng góc vuông có mặt trên sáng, lỗ nhỏ
    s.rect(2, 6, 12, 7, toi);
    s.rect(2, 6, 12, 1, sang);
    s.rect(3, 7, 10, 5, mau);
    s.px(5, 9, toi);
    s.px(9, 8, toi);
    s.px(8, 11, toi);
    return;
  }
  if (kind === "tui") {
    // TÚI (cà phê rang, trà sấy): túi đứng miệng gấp, có nhãn màu
    s.rect(4, 3, 8, 11, toi);
    s.rect(5, 4, 6, 9, mau);
    s.rect(4, 2, 8, 2, toi);
    s.hline(4, 2, 8, sang);
    if (nhan) s.rect(5, 7, 6, 3, nhan);
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
  | "tired"
  /** con vật ướt mưa mà không có chỗ trú — giọt nước xanh */
  | "wet"
  /** người làm đang đứng nói chuyện — ba chấm */
  | "chat"
  /** người làm đang chờ vật tư — dấu chấm hỏi */
  | "want";

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
    kind === "hungry" || kind === "want"
      ? "#e05d5d"
      : kind === "ready"
        ? "#c9931a"
        : kind === "love"
          ? "#e05d8a"
          : "#5aa9e6";

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
  } else if (kind === "chat") {
    // ba chấm: "đang nói chuyện"
    s.px(2, 4, ink);
    s.px(4, 4, ink);
    s.px(6, 4, ink);
  } else if (kind === "want") {
    // dấu chấm hỏi: "tôi đang chờ cái gì đó"
    s.hline(3, 2, 3, ink);
    s.px(6, 3, ink);
    s.px(5, 4, ink);
    s.px(4, 5, ink);
    s.px(4, 7, ink);
  } else if (kind === "wet") {
    // giọt nước: nhọn trên, tròn dưới, một chấm sáng
    s.px(4, 1, ink);
    s.hline(3, 2, 3, ink);
    s.hline(2, 3, 5, ink);
    s.hline(2, 4, 5, ink);
    s.hline(3, 5, 3, ink);
    s.px(3, 3, "#dff1ff");
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


/* ---------------------------------------------------------------------------
   TƯ THẾ CỦA CON VẬT.

   Cường: "hành động động vật ít quá cho thêm đi, mỗi con thêm 10-14 động tác".
   Bản trước có đúng BỐN: đi, ăn, ngủ, co ro — nên một đàn bò đứng trong chuồng
   cả ngày chỉ làm một việc, và nông trại đứng hình.

   Vẽ tay 15 tư thế × 4 dáng × 4 hướng × 3 khung là 720 hình, không làm nổi và
   cũng không nên: 15 tư thế ấy khác nhau ở đúng vài con số của cùng một bộ
   xương — đầu ở đâu, chân gập bao nhiêu, thân nghiêng thế nào, mắt nhắm hay mở.
   Nên tư thế ở đây là một BẢNG THAM SỐ, và ba bộ dáng (bốn chân · chim · thú
   nhỏ) cùng đọc nó. Thêm tư thế mới = thêm một dòng.

   Bộ hình dựng LƯỜI theo khoá `defId|dir|frame|pose`, nên tư thế nào không bao
   giờ xảy ra thì không tốn một pixel bộ nhớ nào.
--------------------------------------------------------------------------- */

export type AnimalPose =
  /** đi | chạy | đứng thở | gặm cỏ | ăn máng | uống nước */
  | "walk" | "run" | "idle" | "graze" | "eat" | "drink"
  /** ngủ | nằm ngửa | co ro trong mưa | ngồi | vươn vai | rũ mình */
  | "sleep" | "roll" | "huddle" | "sit" | "stretch" | "shake"
  /** gãi | liếm lông | hửi đất | ngẩng nhìn | kêu | nhảy chồm */
  | "scratch" | "groom" | "sniff" | "look" | "call" | "play";

/** Bộ số mô tả MỘT tư thế. Mọi đơn vị theo bán kính đầu hoặc bán kính thân. */
interface PoseRig {
  /** đầu dịch ngang, tính theo bán kính đầu; dương = về phía trước */
  dauX: number;
  /** đầu dịch dọc; dương = cúi xuống */
  dauY: number;
  /** thân nâng lên (âm) hay hạ xuống (dương), đơn vị cũ */
  thanY: number;
  /** mông cao hơn vai bao nhiêu — cái làm nên dáng vươn vai và dáng chồm */
  nghieng: number;
  /** hệ số chiều dài chân: 1 bình thường, 0 gập hẳn */
  chan: number;
  /** mắt nhắm */
  nham: boolean;
  /** tai vểnh lên (nhân với bán kính đầu) */
  taiVenh: number;
  /** nét phụ vẽ quanh con vật */
  net: "khong" | "rung" | "am" | "bui" | "nuoc";
  /** NẰM NGỬA: bốn chân chổng lên trời. Chỉ `roll` dùng tới. */
  nga?: boolean;
}

const TU_THE: Record<AnimalPose, PoseRig> = {
  //                dauX   dauY  thanY nghieng chan  nham  taiVenh  net
  walk:    { dauX: 0,    dauY: 0,    thanY: 0,   nghieng: 0,    chan: 1,    nham: false, taiVenh: 0,   net: "khong" },
  idle:    { dauX: 0,    dauY: 0,    thanY: 0,   nghieng: 0,    chan: 1,    nham: false, taiVenh: 0.1, net: "khong" },
  graze:   { dauX: 0.35, dauY: 1.5,  thanY: 0,   nghieng: -0.4, chan: 1,    nham: false, taiVenh: -0.3, net: "khong" },
  eat:     { dauX: 0.3,  dauY: 1.3,  thanY: 0,   nghieng: -0.2, chan: 1,    nham: false, taiVenh: -0.2, net: "khong" },
  drink:   { dauX: 0.5,  dauY: 1.7,  thanY: 0,   nghieng: -0.5, chan: 1,    nham: false, taiVenh: -0.3, net: "nuoc" },
  sleep:   { dauX: 0,    dauY: 0.6,  thanY: 0,   nghieng: 0,    chan: 0,    nham: true,  taiVenh: -0.4, net: "khong" },
  huddle:  { dauX: -0.2, dauY: 0.5,  thanY: 1,   nghieng: 0,    chan: 0.7,  nham: true,  taiVenh: -0.5, net: "khong" },
  sit:     { dauX: 0,    dauY: -0.3, thanY: 0,   nghieng: 1.6,  chan: 0.45, nham: false, taiVenh: 0.3, net: "khong" },
  stretch: { dauX: 0.3,  dauY: 1.1,  thanY: 0,   nghieng: -1.6, chan: 1,    nham: true,  taiVenh: 0.2, net: "khong" },
  shake:   { dauX: -0.3, dauY: -0.2, thanY: 0,   nghieng: 0.3,  chan: 1,    nham: true,  taiVenh: 0.4, net: "rung" },
  scratch: { dauX: -0.4, dauY: 0.4,  thanY: 0,   nghieng: 0.5,  chan: 0.8,  nham: true,  taiVenh: 0.5, net: "rung" },
  groom:   { dauX: -1.5, dauY: 0.9,  thanY: 0,   nghieng: 0,    chan: 1,    nham: true,  taiVenh: -0.2, net: "khong" },
  look:    { dauX: 0.2,  dauY: -1.1, thanY: 0,   nghieng: 0,    chan: 1,    nham: false, taiVenh: 0.7, net: "khong" },
  call:    { dauX: 0.3,  dauY: -1,   thanY: 0,   nghieng: 0,    chan: 1,    nham: false, taiVenh: 0.6, net: "am" },
  play:    { dauX: 0.2,  dauY: -0.5, thanY: -2,  nghieng: -1.2, chan: 0.85, nham: false, taiVenh: 0.6, net: "bui" },
  // ba tư thế thêm ở lượt sau, khi Cường bảo "quá ít động tác, tăng mạnh đi"
  run:     { dauX: 0.5,  dauY: 0.15, thanY: 0.5, nghieng: -0.5, chan: 1.15, nham: false, taiVenh: -0.5, net: "bui" },
  roll:    { dauX: -0.3, dauY: 0.9,  thanY: 2,   nghieng: 0,    chan: 0.9,  nham: true,  taiVenh: -0.6, net: "khong", nga: true },
  sniff:   { dauX: 0.55, dauY: 1.9,  thanY: 0,   nghieng: 0.7,  chan: 0.95, nham: false, taiVenh: 0.5, net: "bui" },
};

/* ============================================================================
   VẬT NUÔI — vẽ theo TỪNG LOÀI.

   Cường: "vẽ lại hết bộ ảnh tất cả động vật đi cho chân thực vô, sai nhìn kì
   quá, tất cả các con nhé, rõ nét".

   Câu ấy đúng, và chỗ sai nằm ở kiến trúc chứ không ở màu: bản trước dựng MỌI
   con bốn chân bằng cùng một quả trứng, rồi phân biệt chúng bằng vài cờ rời rạc
   (`patch` cho bò, `fluff` cho cừu, `snout` cho heo). Nhưng con bò khác con heo
   ở BÓNG DÁNG chứ không ở đốm: bò lưng thẳng ngực sâu chân cao, heo thì thùng
   tròn bụng sệ chân ngắn, cừu là một đám mây có bốn que, chó thì ngực nở bụng
   thóp. Bốn bóng dáng ấy mà gộp làm một quả trứng thì tô màu gì cũng vẫn là bốn
   quả trứng khác màu.

   Nay mỗi loài có một HỒ SƠ HÌNH (`HINH_LOAI`) nói rõ: đường lưng và đường bụng
   đi thế nào, cổ dài bao nhiêu, mõm kiểu gì, tai kiểu gì, đuôi kiểu gì, chân
   cao và dày bao nhiêu. Bộ vẽ đọc hồ sơ ấy; thêm loài mới là thêm một dòng.

   Vẫn giữ nguyên hai thứ của lần trước: mười lăm TƯ THẾ (bảng `TU_THE`) và bộ
   hình dựng LƯỜI theo khoá `defId|dir|frame|pose`.
============================================================================ */

/** Tên loài cho bộ vẽ. Suy từ `art.species`, thiếu thì đoán từ các cờ cũ. */
type GiongVat = "bo" | "de" | "heo" | "cuu" | "cho" | "ga" | "vit" | "ca" | "chuot" | "soc";

interface HinhLoai {
  /** hệ số ĐƯỜNG LƯNG theo dọc thân: u=0 mông, u=1 vai. */
  lung: (u: number) => number;
  /** hệ số ĐƯỜNG BỤNG theo dọc thân. */
  bung: (u: number) => number;
  /** lông xù phủ ngoài thân (cừu) */
  xu: boolean;
  /** chiều dài cổ, tính theo bán kính đầu; 0 = đầu dính thẳng vào vai */
  co: number;
  /** bán kính đầu, theo nửa chiều cao thân */
  dau: number;
  /** đầu ngẩng cao hơn vai bao nhiêu, theo bán kính đầu */
  dauCao: number;
  mom: "bet" | "dai" | "dia" | "nhon" | "khong";
  tai: "cup" | "venh" | "dai" | "tron" | "khong";
  duoi: "chum" | "xoan" | "xu" | "ngan" | "quat" | "khong";
  /** bề ngang một cái chân, đơn vị cũ */
  chanDay: number;
  /** chiều dài chân, đơn vị cũ */
  chanCao: number;
  /** vệt bụng sáng */
  vetBung: boolean;
}

/* Đường lưng và đường bụng là chỗ khác nhau LỚN NHẤT giữa các loài, nên chúng
   là hàm chứ không phải hằng số: `u` chạy từ mông (0) tới vai (1). */
const HINH_LOAI: Record<GiongVat, HinhLoai> = {
  // BÒ: lưng thẳng, vai cao hơn mông một chút, ngực sâu, chân cao.
  bo: {
    lung: (u) => 0.92 + u * 0.1,
    bung: (u) => 0.86 + Math.sin(u * Math.PI) * 0.08,
    xu: false, co: 0.8, dau: 0.46, dauCao: 0.34,
    mom: "bet", tai: "cup", duoi: "chum", chanDay: 1.7, chanCao: 4, vetBung: true,
  },
  // DÊ: nhỏ hơn bò, lưng thẳng, bụng tròn, cổ dựng cao, chân mảnh.
  de: {
    lung: (u) => 0.88 + u * 0.06,
    bung: (u) => 0.9 + Math.sin(u * Math.PI) * 0.12,
    xu: false, co: 0.95, dau: 0.5, dauCao: 0.8,
    mom: "nhon", tai: "dai", duoi: "ngan", chanDay: 1.3, chanCao: 3.6, vetBung: true,
  },
  // HEO: thùng tròn, lưng cong lên, bụng SỆ xuống, gần như không cổ, chân ngắn.
  heo: {
    lung: (u) => 0.78 + Math.sin(u * Math.PI) * 0.3,
    bung: (u) => 1.02 + Math.sin(u * Math.PI) * 0.1,
    xu: false, co: 0.15, dau: 0.55, dauCao: 0.1,
    mom: "dia", tai: "venh", duoi: "xoan", chanDay: 1.6, chanCao: 2.2, vetBung: false,
  },
  // CỪU: cả thân là một đám lông; đầu nhỏ và tối, chân que.
  cuu: {
    lung: (u) => 0.95 + Math.sin(u * Math.PI) * 0.12,
    bung: (u) => 0.92 + Math.sin(u * Math.PI) * 0.06,
    xu: true, co: 0.45, dau: 0.42, dauCao: 0.5,
    mom: "bet", tai: "dai", duoi: "ngan", chanDay: 1.2, chanCao: 3.2, vetBung: false,
  },
  // CHÓ: ngực nở, bụng THÓP, mông tròn, cổ vươn, chân dài.
  cho: {
    lung: (u) => 0.82 + u * 0.16,
    bung: (u) => 0.95 - Math.sin(Math.max(0, u - 0.1) * Math.PI * 1.15) * 0.34,
    xu: false, co: 0.8, dau: 0.5, dauCao: 0.5,
    mom: "dai", tai: "venh", duoi: "xu", chanDay: 1.3, chanCao: 3.8, vetBung: true,
  },
  // GÀ: thân quả trứng dựng, ngực nhô, đuôi quạt dựng, cổ ngắn, chân que.
  ga: {
    lung: (u) => 0.9 + Math.sin(u * Math.PI) * 0.16,
    bung: (u) => 0.95 + Math.sin(u * Math.PI) * 0.14,
    xu: false, co: 0.85, dau: 0.46, dauCao: 1.15,
    mom: "nhon", tai: "khong", duoi: "quat", chanDay: 0.9, chanCao: 2.4, vetBung: true,
  },
  // VỊT: thân THUYỀN nằm ngang, ngực thấp, cổ cong, mỏ bẹt.
  vit: {
    lung: (u) => 0.82 + Math.sin(u * Math.PI) * 0.14,
    bung: (u) => 1.0 + Math.sin(u * Math.PI) * 0.06,
    xu: false, co: 1.15, dau: 0.42, dauCao: 1.05,
    mom: "bet", tai: "khong", duoi: "ngan", chanDay: 0.9, chanCao: 1.6, vetBung: true,
  },
  ca: {
    lung: (u) => 0.9 + Math.sin(u * Math.PI) * 0.1,
    bung: (u) => 0.9 + Math.sin(u * Math.PI) * 0.1,
    xu: false, co: 0, dau: 0, dauCao: 0,
    mom: "khong", tai: "khong", duoi: "khong", chanDay: 0, chanCao: 0, vetBung: true,
  },
  // CHUỘT: thân thấp dài, mõm nhọn, tai tròn to, đuôi trần.
  chuot: {
    lung: (u) => 0.85 + Math.sin(u * Math.PI) * 0.12,
    bung: () => 0.95,
    xu: false, co: 0.2, dau: 0.6, dauCao: 0.15,
    mom: "nhon", tai: "tron", duoi: "ngan", chanDay: 0.9, chanCao: 1.4, vetBung: true,
  },
  // SÓC: ngồi chồm hỗm, đuôi XÙ dựng cao — nét nhận ra từ xa.
  soc: {
    lung: (u) => 0.8 + Math.sin(u * Math.PI) * 0.2,
    bung: () => 0.92,
    xu: false, co: 0.35, dau: 0.6, dauCao: 0.45,
    mom: "nhon", tai: "tron", duoi: "xu", chanDay: 0.9, chanCao: 1.4, vetBung: true,
  },
};

/** Đoán loài từ các cờ cũ, để content pack chưa khai `species` vẫn ra đúng con. */
function giongCua(art: AnimalArt): GiongVat {
  const kh = art.species;
  if (kh && kh in HINH_LOAI) return kh as GiongVat;
  if (art.form === "fish") return "ca";
  if (art.form === "bird") return art.crest ? "ga" : "vit";
  if (art.form === "critter") return (art.w ?? 6) >= 7 ? "soc" : "chuot";
  if (art.fluff) return "cuu";
  if (art.tailUp) return "cho";
  if ((art.snout ?? 0) >= 0.9) return "heo";
  if ((art.horn ?? 0) >= 2) return "de";
  return "bo";
}

function makeAnimal(
  art: AnimalArt,
  dir: PlayerDir,
  frame: number,
  pose: AnimalPose = "walk",
): HTMLCanvasElement {
  const s = surface(TILE, TILE);
  const side = dir === "left" || dir === "right";
  const flip = dir === "left";
  const giong = giongCua(art);
  const L = HINH_LOAI[giong];

  const giua = art.body;
  const sang = lighten(art.body);
  /* HAI tông tối, hai vai khác nhau — trộn chúng làm một là lỗi của bản đầu:
     · `vien` là MẶT TỐI của chính màu thân, dùng để dựng khối. Con bò trắng có
       mặt tối màu XÁM; lấy `bodyDark` (màu đốm) làm vành khối thì cả con bò
       viền đen kịt và đọc ra một cái sọ.
     · `toi` = `bodyDark` là màu VẬT LIỆU KHÁC: đốm, tai, đuôi, móng. */
  const vien = shade(art.body, 0.72);
  const toi = art.bodyDark;
  /** Tông của phần Ở XA — mẹo rẻ nhất để có chiều sâu. */
  const xa = shade(vien, 0.62);

  const rig = TU_THE[giong === "ca" ? "walk" : pose] ?? TU_THE.walk;
  const nam = pose === "sleep" && giong !== "ca";
  const coRo = pose === "huddle" && giong !== "ca";
  const bob = frame === 2 || coRo ? Q : 0;
  const tho = !nam && (pose === "idle" || pose === "look") && frame === 1 ? Q : 0;

  const W = Math.max(5, Math.min(14, art.w));
  const H = Math.max(4, Math.min(11, art.h));
  const DAT = TILE - 1.5; // hàng chạm đất

  if (giong === "ca") ve_ca();
  else ve_thu(side);

  const done = outline(s, P.outline, 1);
  return flip ? latNgang(done.c, TILE, TILE) : done.c;

  /* --------------------------------------------------------------------------
     MỘT CON THÚ — dùng chung cho cả bốn chân, chim và thú nhỏ.

     Gộp làm một là chủ ý: chúng khác nhau ở HỒ SƠ HÌNH, không ở cách dựng. Ba
     hàm riêng như bản trước thì mỗi lần sửa một nết chung (tư thế, mắt, bóng
     đổ) phải sửa ba chỗ, và chúng đã trôi khỏi nhau đúng như thế.
  -------------------------------------------------------------------------- */
  function ve_thu(ngang: boolean) {
    const gap = nam ? 0.25 : 1;
    const chanCao = Math.max(0, L.chanCao * rig.chan * gap);
    let w = ngang ? W : Math.max(4, W * 0.62);
    const h = nam ? Math.max(3, H - 1.5) : H;
    const bot = DAT - chanCao + bob;
    const cy = bot - h / 2 + rig.thanY + tho;
    let ry = h / 2;

    /* CĂN CHO VỪA Ô. Cái đầu chìa ra TRƯỚC thân, nên bề ngang thật của con vật
       là thân cộng phần đầu thò ra. Bản đầu đặt tâm thân ở giữa ô rồi mới gắn
       đầu vào — kết quả là cái đầu con bò chạy ra ngoài mép canvas và bị cắt
       cụt, nên con bò trông như một cái thân không có đầu.

       Nay tính phần thò ra TRƯỚC, rồi vừa dịch tâm vừa (nếu vẫn không đủ) thu
       thân lại. Thu thân chứ không thu đầu: con vật mất một pixel bề dài thì
       không ai để ý, mất cái đầu thì ai cũng để ý. */
    const hsTho = Math.max(1.9, ry * 2 * L.dau);
    const thoRa = ngang ? hsTho * (0.35 + L.co * 0.45) + hsTho * 0.9 - w * 0.1 : 0;
    const rong = w + Math.max(0, thoRa);
    if (rong > TILE - 1.5) {
      const co2 = (TILE - 1.5 - Math.max(0, thoRa)) / w;
      w *= Math.max(0.45, co2);
      ry *= Math.max(0.72, Math.sqrt(Math.max(0.45, co2)));
    }
    const rx = w / 2;
    // mép trái của cả con vật, rồi suy ra tâm thân
    const cx = ngang ? Math.max(rx + 0.5, (TILE - (w + Math.max(0, thoRa))) / 2 + rx) : 8;
    /* NGHIÊNG: mông cao hơn vai bao nhiêu. Dương là chổng mông (ngồi, gãi), âm
       là chúi đầu (vươn vai, chồm, gặm cỏ). */
    const ngh = ngang ? rig.nghieng : rig.nghieng * 0.3;

    s.shadow(8, DAT + 0.5, rx + 0.6, 1.4);

    /* ĐUÔI vẽ TRƯỚC thân với những kiểu rủ xuống (nó mọc từ mông, phía sau con
       vật), và vẽ SAU thân với những kiểu dựng lên (nó cong đè lên lưng). */
    if (ngang && (L.duoi === "chum" || L.duoi === "ngan")) veDuoiRu(cx - rx, cy - ry * 0.5 - ngh * 0.5, ry);

    // ---- THÂN
    veThan(cx, cy, rx, ry, ngh, ngang);

    // chân SAU (ở xa) — vẽ SAU thân nhưng bằng tông xa, nên nó lùi ra phía sau
    if (chanCao > 0.4 && ngang)
      veChan(cx - rx * 0.72, cx - rx * 0.3, bot - ngh * 0.5, chanCao + ngh * 0.5, xa, 1);

    if (L.xu) veLongXu(cx, cy, rx, ry, ngh);
    if (art.patch) veDom(cx, cy, rx, ry);

    if (ngang && (L.duoi === "xoan" || L.duoi === "xu" || L.duoi === "quat"))
      veDuoiDung(cx - rx, cy - ry * 0.9 - ngh * 0.5, ry);

    // chân TRƯỚC (ở gần)
    if (chanCao > 0.4 && !rig.nga) {
      if (ngang) veChan(cx + rx * 0.28, cx + rx * 0.72, bot + ngh * 0.5, chanCao - ngh * 0.5, vien, 0);
      else veChan(cx - rx * 0.46, cx + rx * 0.46, bot, chanCao, vien, 0);
    }
    /* NẰM NGỬA: bốn chân chổng lên trời và cái bụng phơi ra. Vẽ chân HƯỚNG LÊN
       từ đường lưng, và gập ở khuỷu — chân duỗi thẳng đứng thì con vật trông
       như bị lật ngược chứ không như đang lăn ra sung sướng. */
    if (rig.nga) {
      for (const [kx, gap] of [[-0.6, 0.6], [-0.15, 1], [0.3, 0.55], [0.72, 0.95]] as const) {
        const x = cx + rx * kx;
        const yTop = cy - ry * 0.85;
        const cao = chanCao * 1.15 * gap;
        for (let d = 0; d < cao; d += Q) {
          const nghieng2 = d > cao * 0.55 ? (d - cao * 0.55) * 0.8 : 0;
          for (let w = -L.chanDay * 0.35; w <= L.chanDay * 0.35; w += Q)
            s.dot(x + w + nghieng2, yTop - d, kx < 0 ? xa : vien);
        }
        for (let w = -L.chanDay * 0.45; w <= L.chanDay * 0.45; w += Q)
          s.dot(x + w + (cao - cao * 0.55) * 0.8, yTop - cao, shade(vien, 0.45));
      }
    }

    // ---- CỔ và ĐẦU
    const hs = hsTho;
    const vaiY = cy + ngh * 0.5;
    let hx: number;
    let hy: number;
    if (ngang) {
      hx = cx + rx * 0.9 + hs * (0.35 + L.co * 0.45) + rig.dauX * hs;
      /* Đầu treo ngang tầm GIỮA thân, không phải trên đường lưng. Đặt nó cao
         bằng lưng thì cái đầu thành một cái bướu thứ hai mọc trên vai, và con
         bò đọc ra là một cái bao tải có sừng. */
      hy = vaiY - ry * 0.12 - hs * L.dauCao * 0.75 + rig.dauY * hs;
      if (nam) hy = cy - ry * 0.15;
      hy = Math.min(hy, DAT - hs * 0.55);
    } else {
      hx = cx + rig.dauX * hs * 0.5;
      hy =
        (dir === "up" ? cy - ry - hs * 0.5 : cy + ry * 0.3 + hs * 0.15) +
        rig.dauY * hs * 0.7 -
        (dir === "up" ? 0 : hs * L.dauCao * 0.12);
      hy = Math.min(hy, DAT - hs * 0.5);
    }

    // CỔ: một khối nối vai với đầu. Loài cổ ngắn (heo) thì bỏ hẳn — vẽ vào là
    // con heo mọc thêm một cái ống giữa đầu và vai.
    if (ngang && L.co > 0.3) {
      const b = Math.max(0.35, L.co * 0.5);
      for (let t = 0; t <= 1; t += Q / 4) {
        const nx = cx + rx * 0.72 + (hx - cx - rx * 0.72) * t;
        const ny = vaiY - ry * 0.35 + (hy - (vaiY - ry * 0.35)) * t;
        /* Cổ THON: dày ở vai, nhỏ dần về gáy. Bản đầu để cổ dày đều gần bằng
           cái đầu, nên con chó ra hình con lạc đà. */
        const r = hs * (0.6 - t * 0.28) * b * 1.05;
        s.ell(nx, ny, r * 0.85, r, vien);
        s.ell(nx, ny - Q, r * 0.85 - Q, r - Q, giua);
        s.dot(nx - r * 0.5, ny - r * 0.4, sang);
      }
    }

    veDau(hx, hy, hs, ngang);
    if (rig.nham) mat_nham(hx, hy, hs, ngang);
    else mat(hx, hy, hs, ngang);
    netPhu(cx, cy, rx, ry, hx, hy, hs);
  }

  /* ---- THÂN theo hồ sơ loài: quét từng cột, tính mép lưng và mép bụng. */
  function veThan(cx: number, cy: number, rx: number, ry: number, ngh: number, ngang: boolean) {
    /* Hai đầu thân phải THON lại, nếu không con vật là một khối hộp. `bao` cho
       1 ở giữa và tụt nhanh về 0 ở hai đầu — mũ số 3,4 giữ cho phần giữa gần
       như thẳng, tức là con bò vẫn có cái lưng thẳng. */
    const bao = (u: number) => Math.pow(Math.max(0, 1 - Math.pow(Math.abs(2 * u - 1), 3.4)), 0.42);
    for (let x = -rx; x <= rx; x += Q) {
      const u = (x + rx) / (2 * rx);
      const k = bao(u);
      if (k <= 0.02) continue;
      const nghX = ngh * (0.5 - u); // mông cao / vai thấp
      const yT = cy + nghX - ry * (ngang ? L.lung(u) : 0.95) * k;
      const yB = cy + nghX + ry * (ngang ? L.bung(u) : 0.95) * k;
      for (let y = yT; y <= yB; y += Q) s.dot(cx + x, y, giua);
      s.dot(cx + x, yT, vien);
      s.dot(cx + x, yB, vien);
      // dải sáng dọc lưng: ánh sáng từ trên xuống
      if (k > 0.4) s.dot(cx + x, yT + Q, sang);
    }
    // vành tối hai đầu thân
    for (let y = cy - ry * 0.6; y <= cy + ry * 0.6; y += Q) {
      s.dot(cx - rx + Q, y, vien);
      s.dot(cx + rx - Q, y, vien);
    }
    /* BỤNG SÁNG: ánh sáng dội từ mặt đất lên, và nó cắt hình khỏi bóng đổ. Con
       xù lông thì bỏ — vệt sáng trơn nằm giữa đám lông đọc ra là vết lỗi vẽ. */
    if (L.vetBung && !L.xu)
      s.ell(cx, cy + ry * 0.66, rx * 0.66, ry * 0.22, art.belly);
  }

  /* ---- ĐẦU: khối đầu + mõm + tai + sừng, mỗi loài một kiểu. */
  function veDau(hx: number, hy: number, hs: number, ngang: boolean) {
    // khối đầu: dê và chó có đầu THON về mõm, bò và heo thì đầu vuông vức
    const thon = L.mom === "nhon" || L.mom === "dai";
    const rw = hs * (thon ? 0.82 : 1);
    /* Vành đầu tối HAI nấc: cái đầu nối liền vào cổ cùng màu thì nó tan vào
       thân, và con bò ra một cái bao tải có sừng. */
    s.ell(hx, hy, rw + Q, hs * 0.9 + Q, shade(vien, 0.78));
    s.ell(hx, hy, rw, hs * 0.9, vien);
    s.ell(hx, hy - Q, rw - Q, hs * 0.9 - Q, giua);
    s.ell(hx - rw * 0.3, hy - hs * 0.42, rw * 0.4, hs * 0.26, sang);

    // ---- MÕM
    const mx = ngang ? hx + rw * 0.72 : hx;
    const my = ngang ? hy + hs * 0.3 : hy + hs * 0.42;
    if (L.mom === "dia") {
      // HEO: cái đĩa mũi tròn, hai lỗ mũi — nét nhận ra con heo từ xa nhất
      const r = hs * 0.62;
      s.ell(mx, my, r, r * 0.86, shade(art.accent, 0.8));
      s.ell(mx, my - Q, r - Q, r * 0.86 - Q, art.accent);
      s.dot(mx - r * 0.34, my, shade(art.accent, 0.5));
      s.dot(mx + r * 0.34, my, shade(art.accent, 0.5));
      s.dot(mx - r * 0.3, my - r * 0.4, lighten(art.accent));
    } else if (L.mom === "dai") {
      // CHÓ: mõm dài chìa hẳn ra, chóp mũi đen
      const dai = hs * 1.05;
      for (let d = 0; d <= dai; d += Q) {
        const r = hs * (0.5 - (d / dai) * 0.2);
        for (let y = -r; y <= r; y += Q) s.dot(mx + d - hs * 0.2, my + y, y > r - Q ? vien : giua);
        s.dot(mx + d - hs * 0.2, my - r, vien);
      }
      for (let y = -0.5; y <= 0.5; y += Q)
        for (let x = -0.5; x <= 0.5; x += Q) s.dot(mx + dai - hs * 0.25 + x, my + y - 0.25, art.accent);
    } else if (L.mom === "nhon") {
      // DÊ / GÀ / CHUỘT: mõm hoặc mỏ nhọn hình nêm
      const dai = hs * (giong === "ga" ? 0.75 : 0.85);
      const mau = giong === "ga" || giong === "vit" ? art.accent : giua;
      for (let d = 0; d <= dai; d += Q) {
        const r = Math.max(Q, hs * 0.42 * (1 - d / dai));
        for (let y = -r; y <= r; y += Q) s.dot(mx + d, my + y, mau);
        s.dot(mx + d, my + r, shade(mau, 0.7));
      }
      if (giong === "ga") {
        // YẾM đỏ dưới mỏ
        for (let d = 0; d < 1.2; d += Q) s.dot(mx + Q, my + hs * 0.4 + d, art.accent);
      }
      if (giong === "de") {
        // RÂU CẰM — không có nó thì con dê là con cừu trọc
        for (let d = 0; d < hs * 0.9; d += Q) s.dot(mx - hs * 0.1, my + hs * 0.45 + d, toi);
        s.dot(mx - hs * 0.35, my + hs * 0.75, toi);
      }
    } else if (L.mom === "bet") {
      if (giong === "vit") {
        // VỊT: MỎ BẸT dài, đầu mỏ bo tròn — thứ duy nhất tách vịt khỏi gà
        const dai = hs * 1.5;
        for (let d = 0; d <= dai; d += Q) {
          const r = hs * (0.3 + (d / dai) * 0.12);
          for (let y = -r; y <= r; y += Q) s.dot(mx + d - hs * 0.3, my + y, art.accent);
          s.dot(mx + d - hs * 0.3, my + r, shade(art.accent, 0.72));
        }
        s.dot(mx + dai - hs * 0.4, my - hs * 0.1, shade(art.accent, 0.55));
      } else {
        // BÒ / CỪU: mõm vuông, chóp mũi hồng
        const r = hs * 0.55;
        s.ell(mx, my, r * 0.95, r * 0.72, sang);
        s.ell(mx, my - Q, r * 0.95 - Q, r * 0.72 - Q, lighten(sang));
        s.dot(mx + r * 0.3, my - Q, art.accent);
        s.dot(mx - r * 0.3, my - Q, art.accent);
      }
    }

    // ---- MÀO GÀ
    if (giong === "ga") {
      for (let i = 0; i < 3; i++) {
        const bx = hx - hs * 0.3 + i * hs * 0.42;
        for (let d = 0; d < 0.75 + (i === 1 ? 0.5 : 0); d += Q) s.dot(bx, hy - hs * 0.9 - d, art.accent);
      }
    }

    // ---- TAI
    const tv = rig.taiVenh;
    if (L.tai === "venh") {
      // tai nhọn dựng (chó, heo)
      const veTai = (tx: number, huong: number) => {
        const cao = hs * (0.85 + tv * 0.3);
        for (let i = 0; i <= cao; i += Q) {
          const c = i / cao;
          const w = Math.max(Q, hs * 0.38 * (1 - c));
          for (let d = -w; d <= w; d += Q) s.dot(tx + huong * i * 0.28 + d, hy - hs * 0.65 - i, toi);
          if (c < 0.6) s.dot(tx + huong * i * 0.28, hy - hs * 0.65 - i, shade(toi, 1.4));
        }
      };
      if (ngang) veTai(hx - hs * 0.35, -1);
      else for (const k of [-1, 1]) veTai(hx + k * hs * 0.62, k);
    } else if (L.tai === "dai") {
      // tai DÀI rủ xuống hai bên (dê, cừu) — dấu nhận ra rõ nhất của con dê
      const veTai = (tx: number, huong: number) => {
        const dai = hs * (1.05 - tv * 0.4);
        for (let i = 0; i <= dai; i += Q) {
          const c = i / dai;
          const w = Math.max(Q, hs * 0.3 * Math.sin(Math.PI * (0.25 + 0.7 * (1 - c))));
          const x = tx + huong * (i * 0.5 + tv * i * 0.3);
          const y = hy - hs * 0.35 + i * (0.8 - tv * 0.9);
          for (let d = -w; d <= w; d += Q) s.dot(x + d, y, toi);
          s.dot(x - huong * w, y, shade(toi, 1.3));
        }
      };
      if (ngang) veTai(hx - hs * 0.4, -1);
      else for (const k of [-1, 1]) veTai(hx + k * hs * 0.7, k);
    } else if (L.tai === "cup") {
      // tai bò: cái lá nằm ngang chìa ra hai bên
      const veTai = (tx: number, huong: number) => {
        const dai = hs * 0.85;
        for (let i = 0; i <= dai; i += Q) {
          const w = Math.max(Q, hs * 0.26 * Math.sin(Math.PI * (0.2 + 0.75 * (i / dai))));
          const x = tx + huong * i;
          const y = hy - hs * 0.25 - tv * hs * 0.4 + i * 0.12;
          for (let d = -w; d <= w; d += Q) s.dot(x, y + d, toi);
          s.dot(x, y - w, shade(toi, 1.3));
        }
      };
      if (ngang) veTai(hx - hs * 0.5, -1);
      else for (const k of [-1, 1]) veTai(hx + k * hs * 0.6, k);
    } else if (L.tai === "tron") {
      // tai tròn to (chuột, sóc)
      const veTai = (tx: number) => {
        const r = hs * 0.62;
        s.ell(tx, hy - hs * 0.75, r, r, toi);
        s.ell(tx, hy - hs * 0.75, r - Q, r - Q, art.accent);
      };
      if (ngang) veTai(hx - hs * 0.42);
      else for (const k of [-1, 1]) veTai(hx + k * hs * 0.62);
    }

    // ---- SỪNG: vuốt RA SAU theo một cung, có mặt sáng mặt tối.
    const horn = Math.max(0, Math.min(3, art.horn ?? 0));
    /* Sừng lấy màu XƯƠNG, không lấy `accent`: `accent` của con bò là màu MŨI
       (hồng), nên dùng nó thì con bò mọc hai cái sừng hồng. */
    const mauSung = giong === "bo" || giong === "cuu" ? "#e6dcc4" : art.accent;
    const mauSungToi = shade(mauSung, 0.7);
    if (horn > 0) {
      const veSung = (sx0: number, sy0: number, huong: number) => {
        const n = Math.round(horn * ART) + 3;
        for (let i = 0; i <= n; i++) {
          const u = i / n;
          const x = sx0 + huong * u * (horn * 0.95 + 1);
          const y = sy0 - Math.sin(u * 2.1) * (horn * 0.7 + 0.9);
          const day = (1 - u * 0.5) * 0.7;
          for (let d = 0; d <= day; d += Q) s.dot(x, y + d, mauSungToi);
          s.dot(x, y, mauSung);
        }
      };
      if (ngang) veSung(hx + hs * 0.1, hy - hs * 0.8, -1);
      else for (const k of [-1, 1]) veSung(hx + k * hs * 0.4, hy - hs * 0.75, k);
    }
  }

  /* ---- CHÂN: một cặp, lệch pha nên khung nào cũng có chân trước chân sau. */
  function veChan(x1: number, x2: number, top: number, len: number, mau: string, pha: number) {
    const lift = (i: number) => (frame === 0 || frame === 2 ? 0 : (i + pha + frame) % 2) * 0.5;
    [x1, x2].forEach((x, i) => {
      const l = lift(i);
      const y0 = top - l;
      const h = len + l;
      if (h < Q) return;
      for (let dy = 0; dy < h; dy += Q) {
        const co = dy / h;
        const w = L.chanDay * (0.42 - co * 0.12);
        for (let dx = -w; dx <= w; dx += Q) s.dot(x + dx, y0 + dy, mau);
        s.dot(x - w, y0 + dy, lighten(mau));
      }
      // MÓNG / BÀN CHÂN: gà vịt có bàn chân chìa ra trước, thú có móng tối
      const mw = L.chanDay * 0.5;
      if (giong === "ga" || giong === "vit") {
        for (let dx = -mw; dx <= mw + 1; dx += Q) s.dot(x + dx, y0 + h - Q, art.accent);
        s.dot(x - mw - Q, y0 + h - Q, art.accent);
      } else {
        for (let dx = -mw * 1.1; dx <= mw * 1.1; dx += Q) {
          s.dot(x + dx, y0 + h - Q, shade(mau, 0.45));
          s.dot(x + dx, y0 + h - Q * 2, shade(mau, 0.65));
        }
      }
    });
  }

  /* ---- ĐUÔI rủ xuống: bò (có chùm lông ở chót) và dê/cừu (ngắn, cụp). */
  function veDuoiRu(tx: number, ty: number, ry: number) {
    if (L.duoi === "khong") return;
    const dai = L.duoi === "chum" ? ry * 1.9 : ry * 0.7;
    for (let i = 0; i <= dai; i += Q) {
      const u = i / dai;
      const x = tx - 0.3 - u * u * 1.1;
      s.dot(x, ty + i, xa);
      s.dot(x + Q, ty + i, shade(xa, 1.25));
    }
    if (L.duoi === "chum")
      for (let dx = -0.75; dx <= 0.5; dx += Q)
        for (let dy = 0; dy < 1.2; dy += Q) s.dot(tx - 1.4 + dx, ty + dai + dy, toi);
  }

  /* ---- ĐUÔI dựng: xoắn (heo), xù (chó/sóc), quạt (gà). */
  function veDuoiDung(tx: number, ty: number, ry: number) {
    if (L.duoi === "xoan") {
      /* ĐUÔI XOẮN của con heo: một vòng xoắn ốc. Nó bé tí mà là nét ai cũng
         nhận ra, nên nó đáng cả tám pixel. */
      const r = ry * 0.42;
      for (let a = -0.4; a < 5.6; a += 0.12) {
        const rr = r * (0.35 + a / 7);
        s.dot(tx - 0.3 + Math.cos(a) * rr, ty + ry * 0.35 + Math.sin(a) * rr, toi);
      }
      return;
    }
    if (L.duoi === "xu") {
      /* ĐUÔI XÙ: một dải cong lên trên lưng, dày dần rồi thon lại. */
      const n = 16;
      for (let i = 0; i <= n; i++) {
        const u = i / n;
        const x = tx - 0.4 - Math.sin(u * 1.5) * 1.6;
        const y = ty + ry * 0.5 - u * ry * 2;
        const r = 0.5 + Math.sin(u * Math.PI) * 0.85;
        for (let dy = -r; dy <= r; dy += Q)
          for (let dx = -r; dx <= r; dx += Q)
            if (dx * dx + dy * dy <= r * r) s.dot(x + dx, y + dy, dx < 0 ? toi : shade(toi, 1.3));
      }
      return;
    }
    if (L.duoi === "quat") {
      /* ĐUÔI QUẠT của con gà: ba lông vũ toả lên phía sau. */
      for (let i = 0; i < 3; i++) {
        const goc = -0.5 - i * 0.42;
        const dai = ry * (1.5 - i * 0.18);
        for (let d = 0; d <= dai; d += Q) {
          const x = tx - 0.2 + Math.cos(Math.PI + goc) * d;
          const y = ty + ry * 0.3 + Math.sin(Math.PI + goc) * d;
          s.dot(x, y, i === 1 ? giua : vien);
          s.dot(x, y + Q, vien);
        }
      }
    }
  }

  /* ---- LÔNG CỪU: bướu lông phủ kín thân, rìa gợn. */
  function veLongXu(cx: number, cy: number, rx: number, ry: number, ngh: number) {
    const rnd = mulberry32(0x51e + Math.round((art.fluff ?? 0) * 977));
    for (let i = 0; i < Math.round(rx * ry * 1.5); i++) {
      const a = rnd() * Math.PI * 2;
      const r = Math.sqrt(rnd());
      const x = cx + Math.cos(a) * rx * r * 0.86;
      const y = cy + ngh * 0.3 + Math.sin(a) * ry * r * 0.86;
      const rr = 0.5 + rnd() * 0.5;
      for (let dy = -rr; dy <= rr; dy += Q)
        for (let dx = -rr; dx <= rr; dx += Q)
          if (dx * dx + dy * dy <= rr * rr) s.dot(x + dx, y + dy, dy < 0 ? art.belly : giua);
    }
    // bướu lông nhô khỏi đường lưng: cái làm đường bao XÙ chứ không trơn
    for (let x = -rx + 0.5; x <= rx - 0.5; x += 1.5) {
      const u = (x + rx) / (2 * rx);
      const k = Math.pow(Math.max(0, 1 - Math.pow(Math.abs(2 * u - 1), 3.4)), 0.42);
      const y = cy + ngh * (0.5 - u) - ry * L.lung(u) * k;
      const rr = 0.85;
      for (let dy = -rr; dy <= rr; dy += Q)
        for (let dx = -rr; dx <= rr; dx += Q)
          if (dx * dx + dy * dy <= rr * rr) s.dot(x + cx + dx, y + dy, dy < 0 ? art.belly : giua);
    }
  }

  /* ---- ĐỐM BÒ: vài MẢNG lớn, không phải mưa pixel. */
  function veDom(cx: number, cy: number, rx: number, ry: number) {
    const rnd = mulberry32(0x9a2 + Math.round((art.patch ?? 0) * 613));
    /* Hai đốm là đủ, và cả hai dồn về NỬA SAU thân. Rải đều cả con thì đốm rơi
       lên vai sẽ dính vào vành tối của đầu, và con bò đọc ra thành một cái sọ
       đen trắng. Mặt để trắng thì con bò mới còn ra mặt. */
    for (let i = 0; i < 2; i++) {
      const px2 = cx - rx * (0.1 + i * 0.44) + rnd() * 0.6;
      const py2 = cy + (i === 0 ? -ry * 0.3 : ry * 0.22) + rnd() * 0.5;
      const pr = Math.max(1.2, rx * (0.18 + rnd() * 0.08));
      for (let y = py2 - pr; y <= py2 + pr; y += Q)
        for (let x = px2 - pr; x <= px2 + pr; x += Q) {
          const ddx = (x - px2) / pr;
          const ddy = (y - py2) / (pr * 0.8);
          if (ddx * ddx + ddy * ddy > 1) continue;
          const bx = (x - cx) / (rx - 0.7);
          const by = (y - cy) / (ry - 0.7);
          if (bx * bx + by * by > 1) continue;
          s.dot(x, y, toi);
        }
    }
  }

  /* -------------------------------------------------------------------- cá
     Cá không có tư thế nằm và không có bóng đổ trên cạn: nó luôn đang bơi. */
  function ve_ca() {
    const w = Math.max(6, W);
    const h = Math.max(4, H);
    const cx = 8;
    const cy = 8 + (frame % 2 === 0 ? 0 : Q) - 0.5;
    const rx = w / 2;
    const ry = h / 2;

    // ĐUÔI: hai nêm toả ra sau, xoè theo khung để nhìn ra là đang quẫy
    const xoe = 1 + (frame % 3) * 0.28;
    for (let i = 0; i <= 3; i += Q) {
      const t = i / 3;
      for (let k = -1; k <= 1; k += 2)
        for (let d = 0; d <= t * 2.4 * xoe; d += Q) s.dot(cx - rx - i, cy + k * d, d > t * 1.9 ? toi : vien);
      s.dot(cx - rx - i, cy, toi);
    }
    // VÂY LƯNG: răng cưa dọc sống lưng
    for (let i = 0; i < rx * 0.9; i += Q) {
      const cao = 1 + Math.sin(i * 2.2) * 0.6;
      for (let d = 0; d < cao; d += Q) s.dot(cx - rx * 0.35 + i, cy - ry - d, i % 1 < Q * 2 ? toi : vien);
    }

    /* THÂN: hình thoi bo tròn, thon hẳn về đuôi và bầu ở vai — cá thon đều hai
       đầu thì đọc ra là một hạt dưa. */
    for (let x = -rx; x <= rx; x += Q) {
      const u = (x + rx) / (2 * rx);
      const k = Math.pow(Math.max(0, 1 - Math.pow(Math.abs(2 * u - 1), 2.6)), 0.5);
      const r = ry * k * (0.7 + u * 0.42);
      for (let y = -r; y <= r; y += Q) s.dot(cx + x, cy + y, giua);
      s.dot(cx + x, cy - r, vien);
      s.dot(cx + x, cy + r, vien);
      if (k > 0.5) s.dot(cx + x, cy - r + Q, sang);
      if (k > 0.5) s.dot(cx + x, cy + r - Q, art.belly);
    }
    // NẮP MANG và VÂY BỤNG
    for (let y = -ry * 0.5; y <= ry * 0.5; y += Q) s.dot(cx + rx * 0.3, cy + y, vien);
    for (let d = 0; d < 1.6; d += Q) s.dot(cx + d, cy + ry * 0.75 + d * 0.4, art.accent);
    // MẮT: có tròng, nên đọc ra là mắt cá chứ không phải một chấm bẩn
    const ex = cx + rx * 0.62;
    const ey = cy - ry * 0.22;
    for (const dx of [0, Q]) for (const dy of [0, Q]) s.dot(ex + dx, ey + dy, "#1b1410");
    s.dot(ex, ey, "#ffffff");
  }

  /* ------------------------------------------------------------- chi tiết */

  function netPhu(cx: number, cy: number, rx: number, ry: number, hx: number, hy: number, hs: number) {
    if (rig.net === "khong") return;
    const nhip = frame % 3;
    if (rig.net === "rung") {
      // vạch rung hai bên sườn, đổi bên theo khung
      for (const k of [-1, 1]) {
        const x = cx + k * (rx + 1);
        for (let i = 0; i < 2; i++) {
          const y = cy - ry * 0.4 + i * 1.4;
          for (let d = 0; d < 1.2; d += Q) s.dot(x + k * d + (nhip - 1) * Q, y, P.outline);
        }
      }
      return;
    }
    if (rig.net === "am") {
      // nốt nhạc bay lên trước mõm — "con này đang kêu"
      const nx = hx + hs * 1.4;
      const ny = hy - hs * 1.2 - nhip * 0.5;
      for (let d = 0; d < 1.5; d += Q) s.dot(nx + 1, ny - d, P.outline);
      for (let d = -Q; d <= Q; d += Q) for (let e2 = -Q; e2 <= Q; e2 += Q) s.dot(nx + d, ny + e2, P.outline);
      s.dot(nx + 1.5, ny - 1.5, P.outline);
      return;
    }
    if (rig.net === "bui") {
      // bụi tung dưới chân khi nhảy chồm
      for (const k of [-1, 1]) {
        const x = cx + k * rx * 0.9;
        for (let d = 0; d <= 1 + nhip * 0.5; d += Q) s.dot(x + k * d, DAT - Q * (nhip % 2), P.soilEdge);
      }
      return;
    }
    // nước: hai gợn dưới mõm
    for (let i = 0; i < 2; i++)
      for (let d = -1 - i * 0.5; d <= 1 + i * 0.5; d += Q)
        s.dot(hx + hs * 0.6 + d, DAT - Q * i, "#8fc4e8");
  }

  function mat(hx: number, hy: number, hs: number, ngang: boolean) {
    if (dir === "up") return; // quay lưng thì không có mắt sau gáy
    const ey = hy - hs * 0.08;
    /* Cường: "rõ mặt sắc nét". Con mắt phải có đủ BA thứ mới đọc ra là mắt ở cỡ
       này: một mí trên tối (cái làm nó có hướng nhìn), một tròng đen đặc, và
       một chấm trắng. Thiếu mí thì nó là một lỗ thủng; thiếu chấm trắng thì nó
       là một hạt tiêu. */
    const veMat = (ex: number) => {
      for (let d = -Q; d <= Q * 2; d += Q) s.dot(ex + d, ey - Q, "#1b1410"); // mí trên
      for (const dx of [0, Q]) for (const dy of [0, Q]) s.dot(ex + dx, ey + dy, "#1b1410");
      s.dot(ex, ey, "#ffffff");
      s.dot(ex + Q, ey + Q * 2, shade(giua, 0.72)); // hốc dưới mắt
    };
    if (ngang) veMat(hx + hs * 0.3);
    else for (const k of [-1, 1]) veMat(hx + k * hs * 0.55 - (k < 0 ? Q : 0));
  }

  function mat_nham(hx: number, hy: number, hs: number, ngang: boolean) {
    if (dir === "up") return;
    const ey = hy - hs * 0.05;
    const nham = (ex: number) => {
      for (let dx = 0; dx < 1.5; dx += Q) s.dot(ex + dx, ey, "#1b1410");
      s.dot(ex + Q, ey + Q, shade(giua, 0.7)); // mí dưới
    };
    if (ngang) nham(hx + hs * 0.2);
    else for (const k of [-1, 1]) nham(hx + k * hs * 0.6 - 0.75);
  }
}

/** Ba dáng xe, suy từ content (xem `vehicleOf`). */
export type VehicleStyle = "box" | "flatbed" | "boat";

/** Cỡ canvas xe: hai ô — xe phải to hơn người, mà người là 16px. */
export const VEHICLE_SIZE = 32;

/**
 * Xe (Đợt 21: 32×32, thân dài 24px — một rưỡi ô — thay cho 10×14 ngang cỡ
 * người). Nhìn từ trên xuống nên chỉ có hai dáng thật: DỌC và NGANG; hai khung
 * BÁNH (`frame`) để xe đang chạy nhìn ra là đang chạy. Hộp va chạm KHÔNG đổi
 * (13×11 trong content) — sprite to lên, đường 1 ô vẫn đi được.
 *
 *   box     — thùng kín + ca-bin (xe giao hàng)
 *   flatbed — ca-bin + sàn phẳng chở kiện hàng (xe thu mua)
 *   boat    — thân thuyền bo hai đầu, ca-bin, cột buồm và lá buồm
 */
function makeVehicle(
  art: { body: string; dark: string; glass: string; accent: string },
  dir: PlayerDir,
  frame = 0,
  style: VehicleStyle = "box",
): HTMLCanvasElement {
  const S = VEHICLE_SIZE;
  const s = surface(S, S);
  const doc = dir === "up" || dir === "down";
  const flip = dir === "left" || dir === "up";
  const L = 24; // chiều dài thân
  const Wd = style === "boat" ? 10 : 13; // bề ngang thân
  const toi = art.dark;
  const sang = lighten(art.body);
  const rat = shade(art.dark, 0.6);

  /* Vẽ MỘT lần ở dáng NGANG hướng PHẢI, rồi xoay/lật cho ba hướng còn lại —
     một hình nguồn, bốn hướng, không chép tay bốn lần. */
  const x0 = (S - L) / 2;
  const y0 = (S - Wd) / 2 - 2;
  const y1 = y0 + Wd;
  const gy = (y0 + y1) / 2; // trục dọc thân

  s.shadow(S / 2, y1 + 2.5, L / 2 - 1, 2);

  if (style === "boat") {
    /* THUYỀN nhìn TỪ TRÊN XUỐNG — Cường: "mấy cái tàu nữa kìa".

       Bản trước vẽ nó như nhìn ngang: một hình chữ nhật bo một đầu, cắm cái que
       làm cột và sáu vạch màu gọi là buồm. Nhưng cả bản đồ nhìn từ trên, nên
       cái buồm nhìn từ trên phải là một CÁNH CUNG PHỒNG chạy dọc từ cột về lái,
       không phải một hình tam giác dựng đứng. Vẽ đúng góc nhìn là thứ làm con
       thuyền hết "kì".

       Buồm màu VẢI BẠT chứ không lấy `accent`: `accent` của thuyền là màu gỗ
       lái, nên dùng nó thì con thuyền căng một lá buồm nâu. */
    const nuaW = (t: number) => {
      // nửa bề ngang vỏ tại vị trí dọc `t` (0 = lái, 1 = mũi)
      if (t < 0.1) return (Wd / 2) * (0.62 + t * 3.2);
      if (t > 0.58) return (Wd / 2) * Math.pow(Math.max(0, 1 - (t - 0.58) / 0.44), 0.6);
      return Wd / 2;
    };
    // ---- VỎ
    for (let x = 0; x <= L; x += Q) {
      const r = nuaW(x / L);
      if (r <= Q) continue;
      for (let y = -r; y <= r; y += Q) s.dot(x0 + x, gy + y, art.body);
      s.dot(x0 + x, gy - r, sang);
      s.dot(x0 + x, gy + r, toi);
    }
    // MẠN nổi gờ hai bên + tấm ván chắn ở lái
    for (let x = 0; x <= L; x += Q) {
      const r = nuaW(x / L);
      if (r <= Q * 2) continue;
      s.dot(x0 + x, gy - r + Q, shade(art.body, 0.86));
      s.dot(x0 + x, gy + r - Q, shade(art.body, 0.78));
    }
    for (let y = -nuaW(0); y <= nuaW(0); y += Q) {
      s.dot(x0, gy + y, toi);
      s.dot(x0 + Q, gy + y, rat);
    }
    // KHOANG trong lòng thuyền: một vệt tối để thuyền có chiều sâu
    for (let x = 2; x < L * 0.62; x += Q) {
      const r = nuaW(x / L) - 1.8;
      if (r <= 0) continue;
      for (let y = -r; y <= r; y += Q) s.dot(x0 + x, gy + y, shade(art.body, 0.72));
      s.dot(x0 + x, gy - r, shade(art.body, 0.6));
    }
    // VÁN SÀN ngang khoang
    for (let x = 3; x < L * 0.6; x += 2.5) {
      const r = nuaW(x / L) - 1.8;
      if (r <= 0) continue;
      for (let y = -r; y <= r; y += Q) s.dot(x0 + x, gy + y, shade(art.body, 0.62));
    }
    // ---- CỘT và BUỒM
    const mx = x0 + L * 0.58;
    const vai = "#f2ecd8";
    const vaiToi = "#cdc3a6";
    /* Buồm: mặt phẳng giữa CẦN BUỒM (chạy từ cột về lái, trên trục thuyền) và
       một cung phồng ra mạn trái vì gió. Vẽ từng cột dọc, tô từ trục ra tới
       cung — thế là ra đúng cái hình quả lê mà mọi bức ảnh chụp từ trên cao
       của một con thuyền buồm đều cho thấy. */
    const dai = L * 0.44;
    for (let d = 0; d <= dai; d += Q) {
      const u = d / dai;
      const phong = Math.sin(Math.pow(u, 0.75) * Math.PI) * (Wd * 0.72);
      const x = mx - d;
      for (let y = 0; y <= phong; y += Q) s.dot(x, gy - y, y > phong - Q ? vaiToi : vai);
      // nếp vải chạy theo chiều gió
      if (Math.floor(d * ART) % 5 === 0)
        for (let y = phong * 0.25; y <= phong * 0.85; y += Q) s.dot(x, gy - y, vaiToi);
    }
    // cần buồm nằm trên trục, và cột dựng ở mũi cần
    for (let d = 0; d <= dai; d += Q) s.dot(mx - d, gy, "#5a4028");
    for (let y = -1.5; y <= 1.5; y += Q) {
      s.dot(mx, gy + y, "#6b4a2c");
      s.dot(mx + Q, gy + y, "#3a2718");
    }
    // dây lèo từ chót cần về lái
    for (let i = 0; i <= 10; i++) s.dot(mx - dai - i * 0.35, gy + i * 0.16, "#e8dcc0");
    // ---- BÁNH LÁI ở lái
    for (let y = -1.6; y <= 1.6; y += Q) s.dot(x0 - 0.8, gy + y, art.accent);
    for (let d = 0; d < 1.6; d += Q) s.dot(x0 - 0.8 - d, gy, shade(art.accent, 0.7));
    // ---- SÓNG MŨI và vệt nước sau lái, đổi theo khung
    const w = frame === 0 ? 0 : 1;
    for (let i = 0; i < 4; i++) {
      const x = x0 + L + i * 0.5 + w * 0.5;
      const r = 0.8 + i * 0.8;
      s.dot(x, gy - r, "#dff1ff");
      s.dot(x, gy + r, "#dff1ff");
    }
    for (let i = 0; i < 6; i++) s.dot(x0 - 2.5 - i * 0.75 - w, gy + (i % 2 ? 0.5 : -0.5), "#cfe8fa");
  } else {
    /* XE — ca-bin ở đầu PHẢI. Thêm ở Đợt 24: vòm bánh, lốp có gai, kính có
       khung và một vệt phản chiếu, lưới tản nhiệt, gương chiếu hậu, ống xả. */
    const cabW = 8.5;
    const cx0 = x0 + L - cabW;

    // ---- BÁNH vẽ TRƯỚC thân: thân đè lên nên chỉ thấy phần nhô ra ngoài vòm
    const banh = "#1c1a18";
    const vanh = "#4a4540";
    const gai = frame === 0 ? "#2e2a27" : "#565049";
    for (const bx of [x0 + 3, cx0 + 0.5]) {
      for (const by of [y0 - 1.5, y1 - 0.5]) {
        for (let x = 0; x < 5; x += Q)
          for (let y = 0; y < 2.5; y += Q) s.dot(bx + x, by + y, banh);
        for (let x = 0.5; x < 4.5; x += 1) s.dot(bx + x + (frame ? Q : 0), by + 0.5, gai);
        for (let x = 0.5; x < 4.5; x += 1) s.dot(bx + x + (frame ? Q : 0), by + 1.5, gai);
        s.dot(bx + 2, by + 1, vanh);
      }
    }

    if (style === "box") {
      // THÙNG KÍN: có gân dọc và cửa sau hai cánh
      for (let x = 0; x < L - cabW - 1; x += Q)
        for (let y = y0; y <= y1; y += Q) s.dot(x0 + x, y, art.body);
      for (let x = 0; x < L - cabW - 1; x += Q) {
        s.dot(x0 + x, y0, sang);
        s.dot(x0 + x, y0 + Q, sang);
        s.dot(x0 + x, y1, toi);
      }
      for (let x = 2; x < L - cabW - 2; x += 2.5)
        for (let y = y0 + 1; y <= y1 - 1; y += Q) s.dot(x0 + x, y, shade(art.body, 0.86));
      // sọc accent chạy dọc thùng — chỗ dán tên hãng
      for (let x = 0.5; x < L - cabW - 2; x += Q) {
        s.dot(x0 + x, gy - Q, art.accent);
        s.dot(x0 + x, gy, shade(art.accent, 0.8));
      }
      // cửa sau
      for (let y = y0; y <= y1; y += Q) {
        s.dot(x0, y, toi);
        s.dot(x0 + Q, y, rat);
      }
      s.dot(x0 + Q, gy - 1, art.accent);
      s.dot(x0 + Q, gy + 1, art.accent);
    } else {
      // SÀN PHẲNG: thành thấp, hai kiện hàng buộc dây
      for (let x = 0; x < L - cabW - 1; x += Q)
        for (let y = y0 + 1; y <= y1 - 1; y += Q) s.dot(x0 + x, y, shade(toi, 1.15));
      for (let x = 0; x < L - cabW - 1; x += Q) {
        s.dot(x0 + x, y0 + 1, art.body);
        s.dot(x0 + x, y1 - 1, art.body);
      }
      const kien = "#c9a06a";
      const kienToi = "#8a6238";
      for (const kx of [x0 + 1.5, x0 + 8]) {
        for (let x = 0; x < 5.5; x += Q)
          for (let y = y0 + 2.5; y <= y1 - 2.5; y += Q) s.dot(kx + x, y, kien);
        for (let x = 0; x < 5.5; x += Q) {
          s.dot(kx + x, y0 + 2.5, lighten(kien));
          s.dot(kx + x, y1 - 2.5, kienToi);
        }
        // dây buộc vắt ngang kiện
        for (let y = y0 + 2.5; y <= y1 - 2.5; y += Q) s.dot(kx + 2.5, y, "#6b5638");
      }
    }

    // ---- CA-BIN
    for (let x = 0; x < cabW; x += Q)
      for (let y = y0; y <= y1; y += Q) s.dot(cx0 + x, y, art.body);
    for (let x = 0; x < cabW; x += Q) {
      s.dot(cx0 + x, y0, sang);
      s.dot(cx0 + x, y1, toi);
    }
    // KÍNH: khung tối, mặt kính, một vệt phản chiếu chéo
    for (let x = 3; x < 5.5; x += Q)
      for (let y = y0 + 1; y <= y1 - 1; y += Q) s.dot(cx0 + x, y, toi);
    for (let y = y0 + 1.5; y <= y1 - 1.5; y += Q) s.dot(cx0 + 4, y, art.glass);
    s.dot(cx0 + 4, y0 + 2, lighten(art.glass));
    s.dot(cx0 + 4, y0 + 2.5, lighten(art.glass));
    // GƯƠNG chiếu hậu hai bên
    s.dot(cx0 + 3, y0 - 0.5, toi);
    s.dot(cx0 + 3, y1 + 0.5, toi);
    // LƯỚI TẢN NHIỆT và ĐÈN PHA ở mũi
    for (let y = y0 + 2; y <= y1 - 2; y += Q) s.dot(cx0 + cabW - Q, y, rat);
    for (let y = y0 + 2.5; y <= y1 - 2.5; y += 1) s.dot(cx0 + cabW - Q * 2, y, toi);
    for (let d = 0; d < 1; d += Q) {
      s.dot(cx0 + cabW - Q + d, y0 + 1, art.accent);
      s.dot(cx0 + cabW - Q + d, y1 - 1, art.accent);
    }
    // ĐÈN HẬU và ỐNG XẢ
    s.dot(x0, y0 + 1, "#e05d5d");
    s.dot(x0, y1 - 1, "#e05d5d");
    s.dot(x0 - 0.5, gy + 1.5, rat);
  }

  const done = outline(s, P.outline, 1).c;
  if (!doc && !flip) return done;
  // xoay/lật: right → left (lật ngang); right → down (xoay 90° thuận); right → up (xoay 90° ngược)
  if (!doc) return latNgang(done, S, S);
  return xoayQuanhTam(done, S, dir === "down" ? Math.PI / 2 : -Math.PI / 2);
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
  const vehicleOf = (defId: string, dir: PlayerDir, frame = 0): HTMLCanvasElement | null => {
    const def = content.vehicles[defId];
    if (!def) return null;
    const f = frame & 1;
    const key = `${defId}|${dir}|${f}`;
    let c = vehCache.get(key);
    if (!c) {
      /* Dáng xe suy từ content, không từ tên: thuyền = `sea`; xe có `buyBonus`
         (đi mua) là sàn phẳng chở kiện; còn lại là thùng kín chở hàng. */
      const dang: VehicleStyle = def.sea ? "boat" : def.buyBonus !== undefined ? "flatbed" : "box";
      c = makeVehicle(def.art, dir, f, dang);
      vehCache.set(key, c);
    }
    return c;
  };

  /* Vật thể theo MÙA: dựng lười, khoá `id|mùa`. Một ván đi qua bốn mùa nên
     dựng sẵn cả bốn cho mọi loại cây là trả tiền cho ba mùa chưa tới. */
  const muaCache = new Map<string, HTMLCanvasElement | null>();
  const propMuaOf = (id: string, mua: number): HTMLCanvasElement | null => {
    const def = content.props[id];
    if (!def?.seasonal) return null;
    const key = `${id}|${mua}`;
    if (muaCache.has(key)) return muaCache.get(key) ?? null;
    const art = def.art;
    const c = art ? makeProp(id, artTheoMua(art, mua)) : null;
    muaCache.set(key, c);
    return c;
  };

  const kieuCache = new Map<string, HTMLCanvasElement | null>();
  const propKieuOf = (id: string, kieu: number): HTMLCanvasElement | null => {
    const def = content.props[id];
    const n = def?.frames ?? 0;
    if (!def || n < 2) return null;
    const k = Math.max(0, Math.min(n - 1, Math.round(kieu)));
    const key = `${id}|${k}`;
    if (kieuCache.has(key)) return kieuCache.get(key) ?? null;
    const c = makeProp(id, def.art ?? FALLBACK_ART, k);
    kieuCache.set(key, c);
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
  const blocks: Record<string, Map<string, HTMLCanvasElement>> = {};
  const propMask: Record<string, Map<string, HTMLCanvasElement>> = {};
  const propOver: Record<string, HTMLCanvasElement> = {};
  for (const id of content.propOrder) {
    if (id === "house" || id === "door") continue;
    const art = content.props[id]?.art ?? FALLBACK_ART;
    props[id] = makeProp(id, art);
    /* CẦU: 16 biến thể lan can + một hình lan can dưới. Cạnh nào giáp nước là
       do renderer đọc bản đồ (`bridgeRail`), atlas chỉ dựng đủ mọi tổ hợp. */
    if (content.props[id]?.bridge) {
      const m = new Map<string, HTMLCanvasElement>();
      for (const up of [false, true])
        for (const down of [false, true])
          for (const left of [false, true])
            for (const right of [false, true]) {
              const n = { up, down, left, right };
              m.set(tileMaskKey(n), id === "roadbridge" ? makeRoadBridge(art, n) : makePier(art, n));
            }
      propMask[id] = m;
      propOver[id] = id === "roadbridge" ? makeRoadBridgeOver(art) : makePierOver(art);
    }
    /* Vật thể NHIỀU Ô: dựng sẵn cả bốn biến thể (đứng lẻ · đầu trái · thân ·
       đầu phải). Bốn hình cho mỗi loại — rẻ hơn hẳn việc dựng lại lúc vẽ. */
    if (content.props[id]?.block) {
      const m = new Map<string, HTMLCanvasElement>();
      for (const l of [false, true])
        for (const r of [false, true]) m.set(blockVariantKey(l, r), makeBlockTile(art, l, r));
      blocks[id] = m;
    }
  }

  /* Máng và mẻ cám dựng LƯỜI: bốn mức × mỗi món là vài chục hình, mà một ván
     thường chỉ dùng ba bốn cái. Dựng hết lúc khởi động là trả tiền cho thứ
     không ai xem. */
  const mangCache = new Map<string, HTMLCanvasElement>();
  const hoCache = new Map<string, HTMLCanvasElement>();
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
    propMask,
    propOver,
    propMua: propMuaOf,
    propKieu: propKieuOf,
    blocks,
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
    trough: (feedId, muc) => {
      const m = Math.max(0, Math.min(3, Math.floor(muc)));
      const key = `${feedId ?? ""}|${m}`;
      let c = mangCache.get(key);
      if (!c) {
        const [mau, toi] = mauMon(feedId, content);
        c = makeTrough(content.props["trough"]?.art ?? FALLBACK_ART, m, mau, toi);
        mangCache.set(key, c);
      }
      return c;
    },
    pondFeed: (feedId, muc) => {
      const m = Math.max(1, Math.min(3, Math.floor(muc)));
      const key = `${feedId}|${m}`;
      let c = hoCache.get(key);
      if (!c) {
        const [mau, toi] = mauMon(feedId, content);
        c = makePondFeed(m, mau, toi);
        hoCache.set(key, c);
      }
      return c;
    },
    icon: (id) => icons.get(id) ?? null,
    ui,
    held,
    ripeBadge: makeRipeBadge(),
    sickOverlay: makeSickOverlay(),
    wiltOverlay: makeWiltOverlay(),
    rainDrop: [0, 1, 2].map(makeRainDrop),
    puddle: [0, 1].map(makePuddle),
    smoke: [0, 1, 2, 3].map(makeSmoke),
    buom: [0, 1, 2].map((m) => [0, 1].map((f) => makeButterfly(m, f))),
    firefly: [0, 1, 2].map(makeFirefly),
    weatherIcon,
  };
}

/** Chọn biến thể theo toạ độ ô — cùng ô luôn ra cùng hoa văn. */
export function variantFor(x: number, y: number, count: number): number {
  return hash2(x, y) % count;
}
