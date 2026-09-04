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
  houseVariantKey,
  variantFor,
  type Atlas,
  type PlayerDir,
  type Side,
} from "../art/atlas.ts";
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

export interface DrawOptions {
  /** Ô ĐÍCH đang đi tới (bấm-để-đi) — vẽ dấu vòng vàng. */
  navTarget: { x: number; y: number } | null;
  /** 0..1: độ mờ đen khi chuyển ngày (main điều khiển), 0 = không phủ. */
  fade: number;
  /** Tắt nhấp nháy/lấp lánh/hạt cho ai say chuyển động. */
  reduceMotion: boolean;
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
      g.fillRect(Math.round(p.x - rx), Math.round(p.y - ry), p.size, p.size);
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
        const base = t.g === "path" ? atlas.path : t.g === "wood" ? atlas.wood : atlas.grass;
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
  ) {
    const { rx, ry } = camera;
    const sparkFrame = Math.floor(timeSec * 6) % 3;
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
          const img = atlas.buildings[t.b];
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
          if (img) items.push({ base, run: () => g.drawImage(img, px, py + TILE - CROP_H) });
          // Cây CHÍN lấp lánh: trên màn nhỏ quả 3px không đủ để nhận ra từ xa,
          // chuyển động là thứ mắt bắt được. Mỗi ô lệch pha theo toạ độ để cả
          // ruộng không nháy cùng lúc.
          if (def && t.crop.stage >= def.growthDays.length && !reduceMotion) {
            const phase = (x * 7 + y * 13) % 3;
            const f = (sparkFrame + phase) % 3;
            const beat = Math.floor(timeSec * 2 + phase) % 3 === 0;
            if (beat) {
              const sx = px + ((x * 5) % 8) + 2;
              const sy = py - 4 + ((y * 3) % 5);
              items.push({ base: base + 1, run: () => g.drawImage(atlas.sparkle[f]!, sx, sy) });
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

  function drawPlayer(s: GameState, items: Item[]) {
    const p = s.player;
    const frames = atlas.player[p.dir as PlayerDir];
    // Đang bận thao tác thì dùng khung vung tay — phản hồi cho cơ chế khoá
    // tuần tự. Đi thì chạy 4 khung ở 8 khung/giây; đứng yên thì về khung 0.
    const f = s.busy > 0 ? PLAYER_ACT_FRAME : p.moving ? 1 + (Math.floor(p.anim * 8) % 4) : 0;
    const img = frames[f] ?? frames[0]!;
    const px = Math.round(p.x - camera.rx) - TILE / 2;
    const py = Math.round(p.y - camera.ry) - 11;
    items.push({ base: Math.round(p.y) + 5, run: () => g.drawImage(img, px, py) });
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
      const lx = (l.wx - camera.rx) * k;
      const ly = (l.wy - camera.ry) * k;
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
    const tx = Math.round(vp.offX * vp.dpr);
    const ty = Math.round(vp.offY * vp.dpr);

    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = LETTERBOX;
    g.fillRect(0, 0, canvas.width, canvas.height);

    g.save();
    g.setTransform(scale, 0, 0, scale, tx, ty);
    g.beginPath();
    g.rect(0, 0, vp.viewW, vp.viewH);
    g.clip();

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

    const items: Item[] = [];
    const lights: Light[] = [];
    collectEntities(s, content, x0, y0, x1, y1, items, lights, timeSec, opts.reduceMotion);
    drawPlayer(s, items);
    lights.push({ wx: s.player.x, wy: s.player.y, r: 46, strength: 0.85 });

    items.sort((a, b) => a.base - b.base);
    for (const it of items) it.run();

    drawParticles();

    g.restore();

    drawNight(s, lights);

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
