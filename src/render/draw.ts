/* ============================================================================
   RENDERER — chỉ ĐỌC state, không bao giờ sửa.

   Mọi thứ ở đây vẽ bằng WORLD PX. Việc đổi sang pixel màn hình do đúng một phép
   biến đổi ở đầu mỗi khung hình đảm nhiệm:

       setTransform(scale·dpr, 0, 0, scale·dpr, offX·dpr, offY·dpr)

   Nhờ vậy phần còn lại của file không cần biết màn hình to nhỏ ra sao — sprite
   nào cũng vẽ ở toạ độ world trừ đi camera, y như hồi độ phân giải còn cố định.

   Những điểm đáng chú ý:

   1. **Nét pixel.** imageSmoothingEnabled = false, hệ số phóng là số nguyên khi
      có thể (camera.ts lo), và cả offset letterbox lẫn camera đều được làm tròn
      về pixel nguyên — nửa pixel lệch là đủ làm cả màn hình mờ.

   2. **Sắp theo chiều sâu.** Mọi thứ đứng trên mặt đất gom lại rồi sắp theo mép
      dưới, nên nhân vật đi sau gốc cây thì bị che, đi trước thì che cây.

   3. **Ngày/đêm đục lỗ.** Phủ màu tối lên một lớp riêng rồi ĐỤC bằng
      destination-out ở chỗ có đèn, nên ánh sáng thật sự khoét vào bóng tối chứ
      không phải chấm sáng dán đè. Lớp này vẽ ở nửa độ phân giải màn hình.

   4. **Cắt theo khung nhìn.** Khi thế giới nhỏ hơn khung nhìn (hoặc màn quá dài
      nên bị letterbox), phần thừa là viền nền — clip đảm bảo không có sprite nào
      thò ra ngoài khung.

   5. **Hiệu ứng KHÔNG nằm trong state.** Hạt bụi khi cày, giọt nước khi tưới,
      lấp lánh trên cây chín, dấu đích đang đi tới — tất cả là trang trí nhất
      thời của lớp vẽ, không đi vào save, không ảnh hưởng luật chơi. Renderer
      nhận lệnh `burst()` từ main rồi tự nuôi danh sách hạt của mình.

   6. **Bờ nước và mép luống là AUTOTILE ở lớp vẽ.** Ô nước giáp đất được phủ
      bọt, ô đã cày giáp ô chưa cày được viền — chỉ cần nhìn hàng xóm lúc vẽ,
      state không phải lưu thêm gì.
============================================================================ */

import type { Content, GameState, Tile } from "../game/types.ts";
import {
  TILE,
  CROP_H,
  PLAYER_ACT_FRAME,
  PLAYER_RAISE_FRAME,
  houseVariantKey,
  tileMaskKey,
  variantFor,
  type Atlas,
  type HeldKind,
  type PlayerDir,
  type Side,
} from "../art/atlas.ts";
import { selectedItemId } from "../game/inventory.ts";
import { parseItem } from "../game/items.ts";
import type { Camera } from "./camera.ts";

/** Màu viền letterbox — tối hơn nền thế giới để thấy rõ đó là ngoài khung. */
const LETTERBOX = "#0b0907";
const WORLD_BG = "#1a1410";

/** Lớp ngày/đêm vẽ ở nửa độ phân giải: gradient mềm nên không lộ, mà rẻ một nửa. */
const NIGHT_QUALITY = 0.5;

export interface Cursor {
  x: number;
  y: number;
  ok: boolean;
}

/** Loại hiệu ứng hạt. Mỗi loại một màu và một kiểu chuyển động. */
export type BurstKind = "dust" | "water" | "leaf" | "spark" | "stone" | "coin";

/** Thời tiết đã rút gọn cho renderer — main tính từ content + state. */
export interface WeatherFx {
  /** 0..1 — cây lay mạnh tới đâu */
  wind: number;
  /** đang mưa (vệt mưa rơi) */
  rain: boolean;
  /** bão: tối trời + chớp */
  storm: boolean;
  /** âm u: tint xám nhẹ */
  overcast: boolean;
  /** nắng gắt: cây chưa tưới trông héo */
  hot: boolean;
  /** 0..1 độ dày sương (main tính theo giờ) */
  fog: number;
  /** bản đồ đang chơi ở ngoài trời không — trong nhà không vẽ mưa/sương */
  outdoor: boolean;
  /** lớp màu của MÙA, phủ cả trong nhà (mùa thì ở đâu cũng là mùa đó) */
  seasonTint: { color: string; alpha: number; desat?: number } | null;
}

export interface DrawOptions {
  /** Ô ĐÍCH đang đi tới (bấm-để-đi) — vẽ dấu vòng vàng. */
  navTarget: { x: number; y: number } | null;
  /** 0..1: độ mờ đen khi chuyển ngày (main điều khiển), 0 = không phủ. */
  fade: number;
  /** Tắt nhấp nháy/lấp lánh/hạt cho ai say chuyển động. */
  reduceMotion: boolean;
  /** Thời tiết hôm nay (core 1.3). */
  weather: WeatherFx;
  /** Các ô của tuyến đang ngắm khi xây theo tuyến — vẽ xem trước. */
  lineCells: { x: number; y: number; ok: boolean }[] | null;
}

export interface Renderer {
  /** đồng bộ backing store của canvas với viewport hiện tại của camera */
  applyViewport(): void;
  draw(s: GameState, content: Content, cursor: Cursor | null, timeSec: number, opts: DrawOptions): void;
  /** Bắn một cụm hạt tại tâm ô (tx,ty). Trang trí thuần tuý, không vào state. */
  burst(kind: BurstKind, tx: number, ty: number): void;
}

/* -------------------------------------------------------------------------- */

/** Màu trời theo giờ. Trả về [màu, độ đậm]. */
function nightTint(minutes: number): [string, number] {
  // 6:00 sáng rõ → 17:00 bắt đầu ngả vàng → 20:00 xanh tối → 22:00+ tối hẳn
  if (minutes < 1020) return ["#000022", 0];
  if (minutes < 1140) {
    const t = (minutes - 1020) / 120;
    return ["#4a2410", 0.3 * t];
  }
  if (minutes < 1320) {
    const t = (minutes - 1140) / 180;
    return ["#0a1030", 0.3 + 0.34 * t];
  }
  return ["#0a1030", 0.64];
}

/** Đèn lưu bằng toạ độ WORLD; đổi sang pixel màn hình lúc dựng lớp đêm. */
interface Light {
  wx: number;
  wy: number;
  r: number;
  strength: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  ttl: number;
  size: number;
  color: string;
  gravity: number;
}

const BURST: Record<BurstKind, { colors: string[]; n: number; speed: number; up: number; gravity: number; ttl: number; size: number }> = {
  dust: { colors: ["#a67a4a", "#c9a06a", "#7a4f2f"], n: 7, speed: 26, up: 30, gravity: 90, ttl: 0.45, size: 1 },
  water: { colors: ["#7fb6ec", "#a8d4ff", "#3b82e0"], n: 8, speed: 22, up: 34, gravity: 110, ttl: 0.5, size: 1 },
  leaf: { colors: ["#7cc25a", "#4da04a", "#ffd84a"], n: 8, speed: 30, up: 40, gravity: 60, ttl: 0.6, size: 1 },
  spark: { colors: ["#ffd84a", "#ffffff", "#f59e0b"], n: 10, speed: 34, up: 30, gravity: 20, ttl: 0.5, size: 1 },
  stone: { colors: ["#a2a8b1", "#6b7078", "#ffffff"], n: 7, speed: 30, up: 36, gravity: 120, ttl: 0.45, size: 1 },
  coin: { colors: ["#ffd84a", "#c9931a", "#fff4b0"], n: 6, speed: 18, up: 44, gravity: 70, ttl: 0.7, size: 2 },
};

export function createRenderer(
  canvas: HTMLCanvasElement,
  atlas: Atlas,
  camera: Camera,
): Renderer {
  const g = canvas.getContext("2d", { alpha: false })!;
  const night = document.createElement("canvas");
  const ng = night.getContext("2d")!;

  const particles: Particle[] = [];
  let lastTime = 0;

  /** Ghim một toạ độ world về đúng lưới pixel THIẾT BỊ (mịn hơn world px đúng
   *  bằng scale×dpr lần). Dùng cho những thứ DI CHUYỂN mượt: nhân vật, hạt. */
  function snapDev(v: number): number {
    const k = camera.viewport.scale * camera.viewport.dpr;
    return k > 0 ? Math.round(v * k) / k : v;
  }

  /** Canvas phủ kín khung chứa; khung nhìn được căn giữa bên trong bằng offset. */
  function applyViewport() {
    const vp = camera.viewport;
    if (!(vp.cssW > 0) || !(vp.cssH > 0)) return;
    const bw = Math.max(1, Math.round(vp.cssW * vp.dpr));
    const bh = Math.max(1, Math.round(vp.cssH * vp.dpr));
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
    canvas.style.width = `${vp.cssW}px`;
    canvas.style.height = `${vp.cssH}px`;

    const nw = Math.max(1, Math.round(vp.viewW * vp.scale * NIGHT_QUALITY));
    const nh = Math.max(1, Math.round(vp.viewH * vp.scale * NIGHT_QUALITY));
    if (night.width !== nw || night.height !== nh) {
      night.width = nw;
      night.height = nh;
    }
    g.imageSmoothingEnabled = false;
  }

  /* ---- hạt hiệu ứng ---- */
  function burst(kind: BurstKind, tx: number, ty: number) {
    const def = BURST[kind];
    const cx = tx * TILE + TILE / 2;
    const cy = ty * TILE + TILE / 2;
    for (let i = 0; i < def.n; i++) {
      // tất định theo chỉ số hạt là đủ — đây là trang trí, không cần seed của state
      const ang = (i / def.n) * Math.PI * 2 + ((i * 7) % 5) * 0.13;
      const sp = def.speed * (0.6 + ((i * 3) % 4) * 0.13);
      particles.push({
        x: cx + Math.cos(ang) * 2,
        y: cy + Math.sin(ang) * 1.5,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp * 0.5 - def.up,
        life: 0,
        ttl: def.ttl * (0.8 + ((i * 5) % 3) * 0.15),
        size: def.size,
        color: def.colors[i % def.colors.length]!,
        gravity: def.gravity,
      });
    }
    // trần: không để bấm liên tục làm phình danh sách
    if (particles.length > 240) particles.splice(0, particles.length - 240);
  }

  function stepParticles(dt: number) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]!;
      p.life += dt;
      if (p.life >= p.ttl) {
        particles.splice(i, 1);
        continue;
      }
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  function drawParticles() {
    const { rx, ry } = camera;
    for (const p of particles) {
      const k = 1 - p.life / p.ttl;
      g.globalAlpha = k < 0.3 ? k / 0.3 : 1;
      g.fillStyle = p.color;
      g.fillRect(snapDev(p.x - rx), snapDev(p.y - ry), p.size, p.size);
    }
    g.globalAlpha = 1;
  }

  /* ---- lớp nền: cỏ / lối đi / nước / đất cày / sàn nhà kính ---- */
  const at = (s: GameState, x: number, y: number): Tile | undefined =>
    x < 0 || y < 0 || x >= s.w || y >= s.h ? undefined : s.tiles[y * s.w + x];

  /** Bản đồ này là TRONG NHÀ? (đa số ô biên là sàn gỗ) — quyết định viền ngoài
   *  biên là rừng hay tường tối. Cache theo tham chiếu mảng ô. */
  let indoorFor: Tile[] | null = null;
  let indoorFlag = false;
  function isIndoor(s: GameState): boolean {
    if (s.tiles === indoorFor) return indoorFlag;
    indoorFor = s.tiles;
    let wood = 0;
    let n = 0;
    for (let x = 0; x < s.w; x++) {
      for (const y of [0, s.h - 1]) {
        const t = s.tiles[y * s.w + x];
        if (!t) continue;
        n++;
        if (t.g === "wood") wood++;
      }
    }
    indoorFlag = n > 0 && wood * 2 > n;
    return indoorFlag;
  }

  /** Phủ ô "ngoài biên" cho phần khung nhìn nằm ngoài bản đồ. Camera giữ nhân
   *  vật ở tâm nên sát mép sẽ lộ vùng này — vẽ rừng/tường thay vì để đen. */
  function drawVoid(s: GameState) {
    const { rx, ry } = camera;
    const vp = camera.viewport;
    const x0 = Math.floor(rx / TILE);
    const y0 = Math.floor(ry / TILE);
    const x1 = Math.ceil((rx + vp.viewW) / TILE);
    const y1 = Math.ceil((ry + vp.viewH) / TILE);
    if (x0 >= 0 && y0 >= 0 && x1 < s.w && y1 < s.h) return; // cả khung nằm trong bản đồ
    const set = isIndoor(s) ? atlas.voidIn : atlas.voidOut;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (x >= 0 && y >= 0 && x < s.w && y < s.h) continue;
        g.drawImage(set[variantFor(x + 97, y + 53, set.length)]!, x * TILE - rx, y * TILE - ry);
      }
    }
  }

  function drawGround(
    s: GameState,
    content: Content,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    waterFrame: number,
  ) {
    const { rx, ry } = camera;
    const shoreFrame = Math.floor(waterFrame / 2) % 2;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const t = s.tiles[y * s.w + x];
        if (!t) continue;
        const px = x * TILE - rx;
        const py = y * TILE - ry;

        if (t.g === "water") {
          g.drawImage(atlas.water[waterFrame % atlas.water.length]!, px, py);
          // bọt ở cạnh giáp đất — ao đọc ra là ao
          const sides: [Side, Tile | undefined][] = [
            ["n", at(s, x, y - 1)],
            ["s", at(s, x, y + 1)],
            ["w", at(s, x - 1, y)],
            ["e", at(s, x + 1, y)],
          ];
          for (const [sd, nb] of sides)
            if (nb && nb.g !== "water") g.drawImage(atlas.shore[sd][shoreFrame]!, px, py);
          continue;
        }
        const base =
          t.g === "path"
            ? atlas.path
            : t.g === "wood"
              ? atlas.wood
              : t.g === "asphalt"
                ? atlas.asphalt
                : atlas.grass;
        g.drawImage(base[variantFor(x, y, base.length)]!, px, py);

        if (t.b) {
          const def = content.buildings[t.b];
          if (def?.kind === "floor") {
            const img = atlas.buildings[t.b];
            if (img) g.drawImage(img, px, py);
          }
        }

        if (t.tilled) {
          const set = t.wet ? atlas.soilWet : atlas.soil;
          g.drawImage(set[variantFor(x, y, set.length)]!, px, py);
          // viền lô đất ở cạnh giáp ô CHƯA cày
          if (!at(s, x, y - 1)?.tilled) g.drawImage(atlas.soilEdge.n, px, py);
          if (!at(s, x, y + 1)?.tilled) g.drawImage(atlas.soilEdge.s, px, py);
          if (!at(s, x - 1, y)?.tilled) g.drawImage(atlas.soilEdge.w, px, py);
          if (!at(s, x + 1, y)?.tilled) g.drawImage(atlas.soilEdge.e, px, py);
        }

        if (t.decor === "tuft") g.drawImage(atlas.tuft, px, py);
      }
    }
  }

  /* ---- lớp vật thể, sắp theo chiều sâu ---- */
  interface Item {
    /** mép dưới (world px) — khoá sắp xếp */
    base: number;
    run: () => void;
  }

  function isHouse(t: Tile | undefined): boolean {
    return !!t && (t.prop === "house" || t.prop === "door");
  }

  /** Ô kề có CÙNG công trình không — dùng cho hàng rào tự nối. */
  function sameBuild(s: GameState, x: number, y: number, id: string): boolean {
    if (x < 0 || y < 0 || x >= s.w || y >= s.h) return false;
    return s.tiles[y * s.w + x]?.b === id;
  }

  function collectEntities(
    s: GameState,
    content: Content,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    items: Item[],
    lights: Light[],
    timeSec: number,
    reduceMotion: boolean,
    wx: WeatherFx,
  ) {
    const { rx, ry } = camera;
    const sparkFrame = Math.floor(timeSec * 6) % 3;
    // Gió: ngọn cây lệch theo sin, mỗi ô lệch pha theo toạ độ nên cả ruộng
    // gợn sóng thay vì lắc đồng loạt. Tắt khi reduceMotion.
    const wind = reduceMotion ? 0 : wx.wind;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const t = s.tiles[y * s.w + x];
        if (!t) continue;
        const px = x * TILE - rx;
        const py = y * TILE - ry;
        const base = y * TILE + TILE;
        const wcx = x * TILE + TILE / 2;
        const wcy = y * TILE;

        if (t.prop && t.prop !== "house" && t.prop !== "door") {
          const def = content.props[t.prop];
          const img = atlas.props[t.prop];
          if (img) {
            const oy = def?.tall ? py - TILE : py;
            items.push({ base, run: () => g.drawImage(img, px, oy) });
            const full = def?.hits ?? 0;
            if (full > 1 && t.hp > 0 && t.hp < full) {
              const hp = t.hp;
              items.push({ base: base + 0.5, run: () => drawHits(px, oy, hp, full) });
            }
          }
          if (def?.interact === "SHOP") lights.push({ wx: wcx, wy: wcy + 6, r: 26, strength: 0.7 });
          else if (def?.interact === "SELL") lights.push({ wx: wcx, wy: wcy + 4, r: 24, strength: 0.6 });
          else if (def?.interact === "CRAFT") lights.push({ wx: wcx, wy: wcy + 6, r: 20, strength: 0.5 });
          else if (def?.interact === "PORTAL") lights.push({ wx: wcx, wy: wcy + 8, r: 30, strength: 0.8 });
          else if (def?.interact === "REFILL") lights.push({ wx: wcx, wy: wcy + 8, r: 18, strength: 0.4 });
        }

        switch (t.prop) {
          case "house":
          case "door": {
            const key = houseVariantKey(
              {
                up: isHouse(s.tiles[(y - 1) * s.w + x]),
                down: isHouse(s.tiles[(y + 1) * s.w + x]),
                left: x > 0 && isHouse(s.tiles[y * s.w + x - 1]),
                right: x < s.w - 1 && isHouse(s.tiles[y * s.w + x + 1]),
              },
              t.prop === "door",
            );
            const img = atlas.house.get(key);
            if (img) items.push({ base, run: () => g.drawImage(img, px, py) });
            if (t.prop === "door") lights.push({ wx: wcx, wy: wcy + 8, r: 40, strength: 0.9 });
            else if (isHouse(s.tiles[(y - 1) * s.w + x]))
              lights.push({ wx: wcx, wy: wcy + 7, r: 22, strength: 0.5 });
            break;
          }
        }

        if (t.b) {
          const def = content.buildings[t.b];
          // Công trình TỰ NỐI (hàng rào): chọn sprite theo hàng xóm CÙNG id.
          // Phải nằm ở lớp thực thể có `base` chứ không phải lớp nền — hàng rào
          // đứng cao hơn mặt đất và phải che được nhân vật đi phía sau nó.
          const auto = def?.autotile ? atlas.autotiles[t.b] : undefined;
          const img = auto
            ? auto.get(
                tileMaskKey({
                  up: sameBuild(s, x, y - 1, t.b),
                  down: sameBuild(s, x, y + 1, t.b),
                  left: sameBuild(s, x - 1, y, t.b),
                  right: sameBuild(s, x + 1, y, t.b),
                }),
              )
            : atlas.buildings[t.b];
          if (def && img && def.kind === "object") {
            items.push({ base, run: () => g.drawImage(img, px, py) });
            if (def.power.produce > 0 || def.effects.harvestRadius)
              lights.push({ wx: wcx, wy: wcy + 8, r: 20, strength: 0.5 });
          }
        }

        if (t.crop) {
          const frames = atlas.crops[t.crop.id];
          const def = content.crops[t.crop.id];
          const img = frames?.[Math.min(t.crop.stage, frames.length - 1)];
          const ripe = !!def && t.crop.stage >= def.growthDays.length;
          const sick = t.crop.sick === true;
          // héo: nắng gắt, chưa tưới, chưa chín — cây rũ xuống 1px và ngả vàng
          const wilt = wx.hot && wx.outdoor && !t.wet && !ripe && t.crop.stage > 0;
          if (img) {
            const cy = py + TILE - CROP_H + (wilt ? 1 : 0);
            // lệch ngọn theo gió: cắt ảnh thành hai lát, lát trên dịch ngang
            const sway = wind > 0 && t.crop.stage > 0
              ? Math.round(Math.sin(timeSec * 2.2 + x * 0.9 + y * 0.4) * 1.5 * wind)
              : 0;
            items.push({
              base,
              run: () => {
                if (sway === 0) g.drawImage(img, px, cy);
                else {
                  const split = CROP_H - 8;
                  g.drawImage(img, 0, 0, TILE, split, px + sway, cy, TILE, split);
                  g.drawImage(img, 0, split, TILE, CROP_H - split, px, cy + split, TILE, CROP_H - split);
                }
                if (wilt) g.drawImage(atlas.wiltOverlay, px, cy);
                if (sick) g.drawImage(atlas.sickOverlay, px, cy);
              },
            });
          }
          // Cây CHÍN: dấu tới lứa cố định ở góc trên phải — thấy ngay từ xa,
          // không phụ thuộc chuyển động. Lấp lánh chỉ là gia vị thêm.
          if (ripe) {
            const bx = px + 10;
            const by = py - 6;
            items.push({ base: base + 1, run: () => g.drawImage(atlas.ripeBadge, bx, by) });
            if (!reduceMotion) {
              const phase = (x * 7 + y * 13) % 3;
              const f = (sparkFrame + phase) % 3;
              const beat = Math.floor(timeSec * 2 + phase) % 3 === 0;
              if (beat) {
                const sx = px + ((x * 5) % 6) + 1;
                const sy = py - 2 + ((y * 3) % 5);
                items.push({ base: base + 1, run: () => g.drawImage(atlas.sparkle[f]!, sx, sy) });
              }
            }
          }
        }
      }
    }
  }

  /** Vạch nhát còn lại trên đầu vật thể đang bị chặt/đập dở. */
  function drawHits(px: number, py: number, hp: number, full: number) {
    const w = full * 2 - 1;
    const x0 = px + Math.round((TILE - w) / 2);
    const y0 = py - 3;
    g.fillStyle = "rgba(0,0,0,0.6)";
    g.fillRect(x0 - 1, y0 - 1, w + 2, 3);
    for (let i = 0; i < full; i++) {
      g.fillStyle = i < hp ? "#ffd84a" : "#5a4632";
      g.fillRect(x0 + i * 2, y0, 1, 1);
    }
  }

  /** Vật phẩm đang cầm → loại sprite trong tay. */
  function heldKind(s: GameState, content: Content): { kind: HeldKind; steel: boolean } {
    const id = selectedItemId(s.inv, s.sel);
    const it = id ? parseItem(id) : null;
    if (!it) return { kind: "hand", steel: false };
    if (it.kind === "tool") {
      const t = content.tools[it.ref];
      const a = t?.action;
      const kind: HeldKind = a === "TILL" || a === "WATER" || a === "CHOP" || a === "MINE" ? a : "hand";
      return { kind, steel: it.ref.endsWith("2") };
    }
    if (it.kind === "seed") return { kind: "seed", steel: false };
    if (it.kind === "build") return { kind: "build", steel: false };
    return { kind: "hand", steel: false };
  }

  /**
   * Vật nuôi và sâu bọ. Đẩy vào cùng danh sách `items` với người chơi và dùng
   * ĐÚNG công thức `base` (`round(y) + 5`), nên con bò đi trước mặt thì che
   * nhân vật, đi sau lưng thì bị che — không cần luật riêng nào.
   */
  function drawActors(s: GameState, content: Content, items: Item[]) {
    for (const e of s.entities) {
      if (e.map !== s.mapId) continue;
      if (!e.worker && e.kind !== "vehicle" && !content.animals[e.def]) continue;
      const moving = e.ai.path.length > 0;
      const frame = moving ? 1 + (Math.floor(e.anim * 5) % 2) : 0;
      const img = e.worker
        ? atlas.worker(e.worker.skin, e.dir, moving ? 1 + (Math.floor(e.anim * 8) % 4) : 0)
        : e.kind === "vehicle"
          ? atlas.vehicle(e.def, e.dir)
          : atlas.animal(e.def, e.dir, frame);
      if (!img) continue;
      const px = snapDev(e.x - camera.rx) - TILE / 2;
      const py = snapDev(e.y - camera.ry) - TILE + 3;
      // Người làm mệt cũng báo bằng lớp phủ giống con vật đói — một ký hiệu
      // cho một ý "cái này đang cần bạn để mắt tới".
      const doi = e.worker
        ? e.worker.energy <= content.workers.restBelow
        : e.kind === "vehicle"
          ? false
          : e.animal.fed <= 0;
      items.push({
        base: Math.round(e.y) + 5,
        run: () => {
          g.drawImage(img, px, py);
          // Đói thì báo NGAY trên con vật, dùng lại đúng lớp phủ của cây bệnh —
          // người chơi đã học nghĩa của nó rồi, không phải học thêm ký hiệu mới.
          if (doi) g.drawImage(atlas.sickOverlay, px, py);
        },
      });
    }
  }

  function drawPlayer(s: GameState, content: Content, items: Item[]) {
    const p = s.player;
    const dir = p.dir as PlayerDir;
    const frames = atlas.player[dir];
    const total = Math.max(0.0001, content.balance.actionSeconds ?? 0);
    const impact = Math.max(0, Math.min(1, content.balance.actionImpact ?? 0.5));
    // Pha vung: 0..1 theo thời gian đã trôi của nhát. Trước mốc chạm đất là
    // GIƠ (công cụ trên đầu), sau mốc là CHẠM (vung xuống) — đúng thứ tự mắt
    // cần thấy: giơ → bổ → đất lật (reducer áp dụng đúng lúc chuyển pha).
    const phase = s.busy > 0 ? 1 - s.busy / total : -1;
    const raising = phase >= 0 && phase < impact;
    const f =
      s.busy > 0 ? (raising ? PLAYER_RAISE_FRAME : PLAYER_ACT_FRAME) : p.moving ? 1 + (Math.floor(p.anim * 8) % 4) : 0;
    const img = frames[f] ?? frames[0]!;
    // Ghim theo lưới pixel THIẾT BỊ. Làm tròn về world px như trước thì nhân
    // vật giật ±1 world px trên nền đã trôi mượt — đổi một kiểu giật lấy kiểu
    // khác. Ở đây sai số còn dưới một pixel thiết bị, mắt không thấy.
    const px = snapDev(p.x - camera.rx) - TILE / 2;
    const py = snapDev(p.y - camera.ry) - 11;

    // Công cụ trong tay — chỉ khi đang vung. Giơ: trên đầu, hơi lệch về phía
    // sau; chạm: trước mặt theo hướng, thấp xuống. Nhấc dần theo pha cho có đà.
    let tool: { img: HTMLCanvasElement; x: number; y: number } | null = null;
    if (s.busy > 0) {
      const { kind, steel } = heldKind(s, content);
      if (kind !== "hand") {
        const t = atlas.held(kind, steel);
        const lift = raising ? Math.round((phase / Math.max(0.0001, impact)) * 3) : 0;
        let tx = px + 4;
        let ty = py - 6 - lift;
        if (!raising) {
          // chạm đất: đặt về phía ô đang làm
          if (dir === "left") { tx = px - 5; ty = py + 6; }
          else if (dir === "right") { tx = px + 13; ty = py + 6; }
          else if (dir === "up") { tx = px + 4; ty = py - 4; }
          else { tx = px + 4; ty = py + 12; }
        } else if (dir === "left") tx = px + 8;
        else if (dir === "right") tx = px;
        tool = { img: t, x: tx, y: ty };
      }
    }
    const toolRef = tool;
    items.push({
      base: Math.round(p.y) + 5,
      run: () => {
        // công cụ vẽ SAU (đè lên) người khi ở trước mặt/dưới, TRƯỚC khi giơ lên phía sau
        if (toolRef && raising && dir !== "down") g.drawImage(toolRef.img, toolRef.x, toolRef.y);
        g.drawImage(img, px, py);
        if (toolRef && !(raising && dir !== "down")) g.drawImage(toolRef.img, toolRef.x, toolRef.y);
      },
    });
  }

  /**
   * Vệt mưa trong toạ độ THẾ GIỚI (trước g.restore) để cuốn theo camera. Vị trí
   * từng vệt hash theo (chỉ số, nhịp) — không state, không Math.random, và cùng
   * khung hình thì cùng hình.
   */
  function drawRain(timeSec: number, storm: boolean) {
    const vp = camera.viewport;
    const n = storm ? 110 : 60;
    const beat = Math.floor(timeSec * 10);
    const w = vp.viewW;
    const h = vp.viewH;
    for (let i = 0; i < n; i++) {
      const hx = ((i * 73856093) ^ (beat * 19349663)) >>> 0;
      const hy = ((i * 83492791) ^ (beat * 2654435761)) >>> 0;
      const x = (hx % (w + 16)) - 8;
      const y = ((hy % (h + 16)) - 8 + ((timeSec * 140) % 16)) % (h + 16);
      const f = (i + beat) % 3;
      g.drawImage(atlas.rainDrop[f]!, Math.round(x), Math.round(y));
    }
  }

  /** Lớp phủ toàn màn: sương, tint âm u, tối bão + chớp. Sau lớp đêm. */
  function drawWeatherScreen(timeSec: number, wx: WeatherFx, reduceMotion: boolean) {
    // Màu của MÙA vẽ trước và KHÔNG phụ thuộc trong nhà hay ngoài trời: mưa thì
    // chỉ rơi ngoài sân, còn mùa đông thì trong nhà cũng là mùa đông.
    if (wx.seasonTint) {
      const st = wx.seasonTint;
      // Rút bão hoà TRƯỚC rồi mới phủ màu: làm ngược lại thì chính lớp màu vừa
      // phủ cũng bị rút mất, và mùa thu hết cả sắc vàng.
      const de = st.desat ?? 0;
      if (de > 0.001) {
        g.globalCompositeOperation = "saturation";
        g.globalAlpha = de;
        g.fillStyle = "#808080";
        g.fillRect(0, 0, canvas.width, canvas.height);
        g.globalAlpha = 1;
        g.globalCompositeOperation = "source-over";
      }
      if (st.alpha > 0.001) {
        g.fillStyle = st.color;
        g.globalAlpha = st.alpha;
        g.fillRect(0, 0, canvas.width, canvas.height);
        g.globalAlpha = 1;
      }
    }
    if (!wx.outdoor) return;
    let color = "";
    let alpha = 0;
    if (wx.storm) {
      color = "#101828";
      alpha = 0.22;
    } else if (wx.overcast || wx.rain) {
      color = "#3a4658";
      alpha = 0.12;
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    if (alpha > 0) {
      g.fillStyle = color;
      g.globalAlpha = alpha;
      g.fillRect(0, 0, canvas.width, canvas.height);
      g.globalAlpha = 1;
    }
    if (wx.fog > 0.001) {
      g.fillStyle = "#e6ecf4";
      g.globalAlpha = Math.min(0.5, 0.5 * wx.fog);
      g.fillRect(0, 0, canvas.width, canvas.height);
      g.globalAlpha = 1;
    }
    if (wx.storm && !reduceMotion) {
      // chớp: cứ ~7 giây loé một cái 2 khung, hash theo giây để tất định
      const sec = Math.floor(timeSec);
      const flash = (sec * 2654435761) % 7 === 0 && timeSec - sec < 0.12;
      if (flash) {
        g.fillStyle = "#ffffff";
        g.globalAlpha = 0.35;
        g.fillRect(0, 0, canvas.width, canvas.height);
        g.globalAlpha = 1;
      }
    }
  }

  function drawNight(s: GameState, lights: Light[]) {
    const [color, alpha] = nightTint(s.minutes);
    if (alpha <= 0.001) return;
    const vp = camera.viewport;
    const k = vp.scale * NIGHT_QUALITY;

    ng.setTransform(1, 0, 0, 1, 0, 0);
    ng.globalCompositeOperation = "source-over";
    ng.clearRect(0, 0, night.width, night.height);
    ng.fillStyle = color;
    ng.globalAlpha = alpha;
    ng.fillRect(0, 0, night.width, night.height);
    ng.globalAlpha = 1;

    ng.globalCompositeOperation = "destination-out";
    for (const l of lights) {
      // camera THỰC, không phải camera đã snap: lớp đêm được blit có làm mượt
      // nên phải khớp với vị trí thế giới thật, không phải vị trí đã làm tròn.
      const lx = (l.wx - camera.x) * k;
      const ly = (l.wy - camera.y) * k;
      const lr = l.r * k;
      if (lx < -lr || lx > night.width + lr || ly < -lr || ly > night.height + lr) continue;
      const grad = ng.createRadialGradient(lx, ly, 0, lx, ly, lr);
      grad.addColorStop(0, `rgba(0,0,0,${l.strength})`);
      grad.addColorStop(0.55, `rgba(0,0,0,${l.strength * 0.45})`);
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ng.fillStyle = grad;
      ng.fillRect(lx - lr, ly - lr, lr * 2, lr * 2);
    }
    ng.globalCompositeOperation = "source-over";

    const s2 = vp.scale * vp.dpr;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.imageSmoothingEnabled = true;
    g.drawImage(
      night,
      Math.round(vp.offX * vp.dpr),
      Math.round(vp.offY * vp.dpr),
      vp.viewW * s2,
      vp.viewH * s2,
    );
    g.imageSmoothingEnabled = false;
  }

  function draw(s: GameState, content: Content, cursor: Cursor | null, timeSec: number, opts: DrawOptions) {
    const vp = camera.viewport;
    if (!(vp.cssW > 0) || !(vp.cssH > 0)) return;

    const dt = lastTime > 0 ? Math.min(0.1, Math.max(0, timeSec - lastTime)) : 0;
    lastTime = timeSec;
    if (opts.reduceMotion) particles.length = 0;
    else stepParticles(dt);

    const scale = vp.scale * vp.dpr;

    /* ---- CHỐNG GIẬT: đắp phần LẺ của camera vào phép tịnh tiến ----------
       Camera trôi ở toạ độ thực nhưng `rx/ry` snap về world px NGUYÊN — đó là
       thứ giữ cho các hàng pixel không lăn tăn. Cái giá của nó: mỗi khung hình
       thế giới chỉ dịch được một số NGUYÊN world px. Đi bộ 78 px/s ở 60 khung
       hình là 1,3 px mỗi khung, làm tròn thành nhịp 1,2,1,1,2 — ở scale 5 tức
       là 5 rồi 10 CSS px xen kẽ, tốc độ biểu kiến nhảy gấp đôi rồi lại về, 60
       lần mỗi giây. Đó chính là cảm giác "giật giật".

       Phần lẻ (`camera.x - camera.rx`, luôn trong [-0,5; 0,5]) được cộng vào
       phép tịnh tiến CUỐI và làm tròn theo pixel THIẾT BỊ. Độ mịn của chuyển
       động tăng từ 1 world px lên 1 device px — ở scale 5, dpr 2 là mịn gấp 10
       lần. Mọi ô vẫn được vẽ ở offset world NGUYÊN so với nhau, và cả lớp chỉ
       dời đi một số nguyên pixel thiết bị, nên không có pixel nào bị to nhỏ
       không đều: độ nét giữ nguyên. */
    const fx = camera.x - camera.rx;
    const fy = camera.y - camera.ry;
    const tx = Math.round(vp.offX * vp.dpr - fx * scale);
    const ty = Math.round(vp.offY * vp.dpr - fy * scale);

    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = LETTERBOX;
    g.fillRect(0, 0, canvas.width, canvas.height);

    g.save();
    // Cắt trong không gian THIẾT BỊ, không phải không gian đã tịnh tiến: khung
    // nhìn phải đứng yên đúng chỗ letterbox trong khi thế giới trượt bên trong.
    g.beginPath();
    g.rect(
      Math.round(vp.offX * vp.dpr),
      Math.round(vp.offY * vp.dpr),
      Math.round(vp.viewW * scale),
      Math.round(vp.viewH * scale),
    );
    g.clip();
    g.setTransform(scale, 0, 0, scale, tx, ty);

    g.fillStyle = WORLD_BG;
    g.fillRect(0, 0, vp.viewW, vp.viewH);

    drawVoid(s);
    const { x0, y0, x1, y1 } = camera.visibleTiles(s.w, s.h);
    const waterFrame = Math.max(0, Math.floor(timeSec * 4));
    drawGround(s, content, x0, y0, x1, y1, waterFrame);

    // Ô đang nhắm — vẽ DƯỚI lớp vật thể để không che mất cây.
    if (cursor) {
      const pulse = opts.reduceMotion ? 0.9 : 0.72 + 0.28 * Math.sin(timeSec * 5);
      g.globalAlpha = pulse;
      g.drawImage(
        cursor.ok ? atlas.cursorOk : atlas.cursorNo,
        cursor.x * TILE - camera.rx,
        cursor.y * TILE - camera.ry,
      );
      g.globalAlpha = 1;
    }
    // Dấu đích đang đi tới: vòng vàng co lại. Khác con trỏ để người chơi phân
    // biệt "sẽ tới đó" và "sẽ làm ở đó".
    if (opts.navTarget) {
      const f = opts.reduceMotion ? 0 : Math.floor(timeSec * 6) % 3;
      g.drawImage(
        atlas.navMark[f]!,
        opts.navTarget.x * TILE - camera.rx,
        opts.navTarget.y * TILE - camera.ry,
      );
    }

    // Xem trước tuyến sắp xây: ô nào đặt được thì khung xanh, không thì khung đỏ.
    // Người chơi thấy TRƯỚC nó sẽ chạy đâu và tốn bao nhiêu, không phải xây rồi
    // mới biết mình vẽ nhầm.
    if (opts.lineCells) {
      g.globalAlpha = 0.85;
      for (const c of opts.lineCells)
        g.drawImage(
          c.ok ? atlas.cursorOk : atlas.cursorNo,
          c.x * TILE - camera.rx,
          c.y * TILE - camera.ry,
        );
      g.globalAlpha = 1;
    }

    const items: Item[] = [];
    const lights: Light[] = [];
    collectEntities(s, content, x0, y0, x1, y1, items, lights, timeSec, opts.reduceMotion, opts.weather);
    drawActors(s, content, items);
    drawPlayer(s, content, items);
    lights.push({ wx: s.player.x, wy: s.player.y, r: 46, strength: 0.85 });

    items.sort((a, b) => a.base - b.base);
    for (const it of items) it.run();

    drawParticles();
    if (opts.weather.outdoor && opts.weather.rain && !opts.reduceMotion) drawRain(timeSec, opts.weather.storm);

    g.restore();

    drawNight(s, lights);
    drawWeatherScreen(timeSec, opts.weather, opts.reduceMotion);

    const fade = s.sleeping ? Math.max(opts.fade, 0.55) : opts.fade;
    if (fade > 0.001) {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.fillStyle = `rgba(0,0,0,${Math.min(1, fade)})`;
      g.fillRect(0, 0, canvas.width, canvas.height);
    }
  }

  applyViewport();
  return { applyViewport, draw, burst };
}
