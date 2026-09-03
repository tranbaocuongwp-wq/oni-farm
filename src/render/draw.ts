/* ============================================================================
   RENDERER — chỉ ĐỌC state, không bao giờ sửa.

   Mọi thứ ở đây vẽ bằng WORLD PX. Việc đổi sang pixel màn hình do đúng một phép
   biến đổi ở đầu mỗi khung hình đảm nhiệm:

       setTransform(scale·dpr, 0, 0, scale·dpr, offX·dpr, offY·dpr)

   Nhờ vậy phần còn lại của file không cần biết màn hình to nhỏ ra sao — sprite
   nào cũng vẽ ở toạ độ world trừ đi camera, y như hồi độ phân giải còn cố định.

   Bốn điểm đáng chú ý:

   1. **Nét pixel.** imageSmoothingEnabled = false, hệ số phóng là số nguyên khi
      có thể (camera.ts lo), và cả offset letterbox lẫn camera đều được làm tròn
      về pixel nguyên — nửa pixel lệch là đủ làm cả màn hình mờ.

   2. **Sắp theo chiều sâu.** Mọi thứ đứng trên mặt đất gom lại rồi sắp theo mép
      dưới, nên nhân vật đi sau gốc cây thì bị che, đi trước thì che cây.

   3. **Ngày/đêm đục lỗ.** Phủ màu tối lên một lớp riêng rồi ĐỤC bằng
      destination-out ở chỗ có đèn, nên ánh sáng thật sự khoét vào bóng tối chứ
      không phải chấm sáng dán đè. Lớp này vẽ ở nửa độ phân giải màn hình:
      gradient vốn mềm nên không ai thấy khác biệt, mà đỡ được một nửa fill rate
      trên màn 4K.

   4. **Cắt theo khung nhìn.** Khi thế giới nhỏ hơn khung nhìn (hoặc màn quá dài
      nên bị letterbox), phần thừa là viền nền — clip đảm bảo không có sprite nào
      thò ra ngoài khung.
============================================================================ */

import type { Content, GameState, Tile } from "../game/types.ts";
import { TILE, CROP_H, houseVariantKey, variantFor, type Atlas, type PlayerDir } from "../art/atlas.ts";
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

export interface Renderer {
  /** đồng bộ backing store của canvas với viewport hiện tại của camera */
  applyViewport(): void;
  draw(s: GameState, content: Content, cursor: Cursor | null, timeSec: number): void;
}

/* -------------------------------------------------------------------------- */

/** Màu trời theo giờ. Trả về [màu, độ đậm]. */
function nightTint(minutes: number): [string, number] {
  // 6:00 sáng rõ → 17:00 bắt đầu ngả vàng → 20:00 xanh tối → 22:00+ tối hẳn
  if (minutes < 1020) return ["#000022", 0]; // trước 17:00: không phủ gì
  if (minutes < 1140) {
    const t = (minutes - 1020) / 120;
    return ["#3a1e10", 0.28 * t];
  }
  if (minutes < 1320) {
    const t = (minutes - 1140) / 180;
    return ["#0a1030", 0.28 + 0.34 * t];
  }
  return ["#0a1030", 0.62];
}

/** Đèn lưu bằng toạ độ WORLD; đổi sang pixel màn hình lúc dựng lớp đêm. */
interface Light {
  wx: number;
  wy: number;
  r: number;
  strength: number;
}

export function createRenderer(
  canvas: HTMLCanvasElement,
  atlas: Atlas,
  camera: Camera,
): Renderer {
  const g = canvas.getContext("2d", { alpha: false })!;
  const night = document.createElement("canvas");
  const ng = night.getContext("2d")!;

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

  /* ---- lớp nền: cỏ / lối đi / nước / đất cày / sàn nhà kính ---- */
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
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const t = s.tiles[y * s.w + x];
        if (!t) continue;
        const px = x * TILE - rx;
        const py = y * TILE - ry;

        if (t.g === "water") {
          g.drawImage(atlas.water[waterFrame % atlas.water.length]!, px, py);
          continue;
        }
        if (t.g === "void") {
          g.drawImage(atlas.voidTile, px, py);
          continue;
        }
        const base = t.g === "path" ? atlas.path : t.g === "wood" ? atlas.wood : atlas.grass;
        g.drawImage(base[variantFor(x, y, base.length)]!, px, py);

        // sàn nhà kính (công trình kind='floor') nằm ĐÈ lên nền
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
  ) {
    const { rx, ry } = camera;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const t = s.tiles[y * s.w + x];
        if (!t) continue;
        const px = x * TILE - rx;
        const py = y * TILE - ry;
        const base = y * TILE + TILE;
        const wcx = x * TILE + TILE / 2;
        const wcy = y * TILE;

        // Vật thể vẽ theo props.json: thêm một loại địa hình mới không phải
        // đụng vào renderer, miễn là atlas biết vẽ id đó (không thì nó vẽ hình
        // mặc định thay vì bỏ trống).
        if (t.prop && t.prop !== "house" && t.prop !== "door") {
          const def = content.props[t.prop];
          const img = atlas.props[t.prop];
          if (img) {
            const oy = def?.tall ? py - TILE : py;
            items.push({ base, run: () => g.drawImage(img, px, oy) });
            // Vật thể đang bị đánh dở: hiện số nhát còn lại ngay trên đầu nó.
            // Không có phản hồi này thì người chơi bổ mấy nhát mà tưởng vô ích.
            const full = def?.hits ?? 0;
            if (full > 1 && t.hp > 0 && t.hp < full) {
              const hp = t.hp;
              items.push({
                base: base + 0.5,
                run: () => drawHits(px, oy, hp, full),
              });
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
              // ô tường (có mái ở trên) → có cửa sổ → hắt sáng
              lights.push({ wx: wcx, wy: wcy + 7, r: 22, strength: 0.5 });
            break;
          }
        }

        // công trình người chơi đặt ('floor' đã vẽ ở lớp nền)
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
          const img = frames?.[Math.min(t.crop.stage, frames.length - 1)];
          if (img) items.push({ base, run: () => g.drawImage(img, px, py + TILE - CROP_H) });
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
      g.fillStyle = i < hp ? "#f5c542" : "#5a4632";
      g.fillRect(x0 + i * 2, y0, 1, 1);
    }
  }

  function drawPlayer(s: GameState, items: Item[]) {
    const p = s.player;
    const frames = atlas.player[p.dir as PlayerDir];
    // Đang bận thao tác thì dùng khung vung tay — phản hồi cho cơ chế khoá
    // tuần tự, để người chơi biết nhân vật đang làm chứ không phải game đơ.
    // Còn lại: 6 khung/giây khi đi, đứng yên thì về khung 0.
    const f = s.busy > 0 ? 3 : p.moving ? 1 + (Math.floor(p.anim * 6) % 2) : 0;
    const img = frames[f] ?? frames[0]!;
    // player.x/y là TÂM hitbox 10×10 (world.ts: PLAYER_W/H), không phải góc ô.
    // Sprite 16×16 có bàn chân ở hàng ~15 → canh đáy sprite trùng đáy hitbox:
    //   đáy hitbox = y + 5  →  đỉnh sprite = y + 5 - 16 = y - 11
    // Làm tròn vị trí nhân vật về world px nguyên, cùng lý do với camera.
    const px = Math.round(p.x - camera.rx) - TILE / 2;
    const py = Math.round(p.y - camera.ry) - 11;
    items.push({ base: Math.round(p.y) + 5, run: () => g.drawImage(img, px, py) });
  }

  function drawNight(s: GameState, lights: Light[]) {
    const [color, alpha] = nightTint(s.minutes);
    if (alpha <= 0.001) return;
    const vp = camera.viewport;
    const k = vp.scale * NIGHT_QUALITY; // world px → pixel của lớp đêm

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

    // Ghép ở không gian THIẾT BỊ, bật khử răng cưa cho riêng lớp này: đây là
    // gradient chứ không phải pixel art, để nó mượt mới đẹp.
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

  function draw(s: GameState, content: Content, cursor: Cursor | null, timeSec: number) {
    const vp = camera.viewport;
    if (!(vp.cssW > 0) || !(vp.cssH > 0)) return;

    const scale = vp.scale * vp.dpr;
    // Offset letterbox làm tròn về pixel THIẾT BỊ: lệch nửa pixel ở đây là cả
    // khung hình bị nhoè, kể cả khi hệ số phóng là số nguyên.
    const tx = Math.round(vp.offX * vp.dpr);
    const ty = Math.round(vp.offY * vp.dpr);

    // viền letterbox
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

    const { x0, y0, x1, y1 } = camera.visibleTiles(s.w, s.h);
    const waterFrame = Math.floor(timeSec * 4);
    drawGround(s, content, x0, y0, x1, y1, waterFrame);

    // Ô đang nhắm — vẽ DƯỚI lớp vật thể để không che mất cây.
    // Nhấp nháy nhẹ: trên màn điện thoại, một khung tĩnh mảnh rất dễ lẫn vào
    // hoa văn nền cỏ; chuyển động là thứ mắt bắt được ngay cả khi liếc qua.
    if (cursor) {
      const pulse = 0.72 + 0.28 * Math.sin(timeSec * 5);
      g.globalAlpha = pulse;
      g.drawImage(
        cursor.ok ? atlas.cursorOk : atlas.cursorNo,
        cursor.x * TILE - camera.rx,
        cursor.y * TILE - camera.ry,
      );
      g.globalAlpha = 1;
    }

    const items: Item[] = [];
    const lights: Light[] = [];
    collectEntities(s, content, x0, y0, x1, y1, items, lights);
    drawPlayer(s, items);
    lights.push({ wx: s.player.x, wy: s.player.y, r: 46, strength: 0.85 });

    items.sort((a, b) => a.base - b.base);
    for (const it of items) it.run();

    g.restore();

    drawNight(s, lights);

    if (s.sleeping) {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.fillStyle = "rgba(0,0,0,0.55)";
      g.fillRect(0, 0, canvas.width, canvas.height);
    }
  }

  applyViewport();
  return { applyViewport, draw };
}
