/* ============================================================================
   RENDERER — chỉ ĐỌC state, không bao giờ sửa.

   Ba điểm đáng chú ý:

   1. Độ phân giải nội bộ CỐ ĐỊNH 320×180 rồi phóng to bằng SỐ NGUYÊN với
      imageSmoothingEnabled=false. Đây là điều kiện bắt buộc để pixel sắc nét:
      phóng theo hệ số lẻ sẽ làm pixel to nhỏ không đều, nhìn là thấy bẩn.

   2. Sắp xếp theo chiều sâu: mọi thứ đứng trên mặt đất được gom lại rồi sắp
      theo mép dưới, nên nhân vật đi ra sau gốc cây thì bị cây che, đi ra trước
      thì che cây. Không có thứ tự này thì thế giới trông dẹt.

   3. Ngày/đêm vẽ trên một lớp riêng: phủ màu tối rồi ĐỤC LỖ bằng
      destination-out ở chỗ có đèn. Nhờ vậy ánh đèn thật sự "khoét" bóng tối
      thay vì chỉ là một chấm sáng dán đè lên.
============================================================================ */

import type { Content, GameState, Tile } from "../game/types.ts";
import { TILE, CROP_H, houseVariantKey, variantFor, type Atlas, type PlayerDir } from "../art/atlas.ts";

export const VIEW_W = 320;
export const VIEW_H = 180;

export interface Camera {
  x: number;
  y: number;
}

export interface Cursor {
  x: number;
  y: number;
  ok: boolean;
}

export interface Renderer {
  /** gọi lại khi cửa sổ đổi kích thước */
  resize(): void;
  draw(s: GameState, content: Content, cursor: Cursor | null, timeSec: number): void;
  /** đổi pixel màn hình → pixel canvas nội bộ (cho chuột/chạm) */
  toCanvas(clientX: number, clientY: number): { x: number; y: number } | null;
  /** đổi pixel canvas nội bộ → toạ độ Ô trong thế giới */
  toTile(cx: number, cy: number, s: GameState): { x: number; y: number };
  readonly camera: Camera;
}

/* -------------------------------------------------------------------------- */

/** Màu trời theo giờ. Trả về [màu, độ đậm]. */
function nightTint(minutes: number): [string, number] {
  // 6:00 sáng rõ → 17:00 bắt đầu ngả vàng → 20:00 xanh tối → 22:00+ tối hẳn
  if (minutes < 1020) return ["#000022", 0]; // trước 17:00: không phủ gì
  if (minutes < 1140) {
    // 17:00–19:00 hoàng hôn: ám cam nhẹ
    const t = (minutes - 1020) / 120;
    return ["#3a1e10", 0.28 * t];
  }
  if (minutes < 1320) {
    // 19:00–22:00 chuyển sang xanh đêm
    const t = (minutes - 1140) / 180;
    return ["#0a1030", 0.28 + 0.34 * t];
  }
  return ["#0a1030", 0.62];
}

interface Light {
  x: number;
  y: number;
  r: number;
  strength: number;
}

export function createRenderer(canvas: HTMLCanvasElement, atlas: Atlas): Renderer {
  const g = canvas.getContext("2d", { alpha: false })!;
  const night = document.createElement("canvas");
  night.width = VIEW_W;
  night.height = VIEW_H;
  const ng = night.getContext("2d")!;

  const camera: Camera = { x: 0, y: 0 };
  let scale = 1;

  function resize() {
    const parent = canvas.parentElement ?? document.body;
    // Khung chứa có thể đang 0×0 (tab ẩn, iframe chưa layout, phần tử display:none).
    // Lúc đó rơi về kích thước cửa sổ, và nếu vẫn 0 thì giữ nguyên hệ số cũ —
    // tuyệt đối không khoá cứng scale=1, vì sau đó chuột sẽ bấm lệch ô.
    const availW = parent.clientWidth || window.innerWidth;
    const availH = parent.clientHeight || window.innerHeight;
    if (availW <= 0 || availH <= 0) return;
    // hệ số phóng NGUYÊN, tối thiểu 1
    scale = Math.max(1, Math.floor(Math.min(availW / VIEW_W, availH / VIEW_H)));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = VIEW_W * scale * dpr;
    canvas.height = VIEW_H * scale * dpr;
    canvas.style.width = `${VIEW_W * scale}px`;
    canvas.style.height = `${VIEW_H * scale}px`;
    // canvas được căn giữa bằng flexbox trong CSS, không tự tính offset ở đây
    g.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
    g.imageSmoothingEnabled = false;
  }

  function toCanvas(clientX: number, clientY: number) {
    const r = canvas.getBoundingClientRect();
    const x = (clientX - r.left) / scale;
    const y = (clientY - r.top) / scale;
    if (x < 0 || y < 0 || x >= VIEW_W || y >= VIEW_H) return null;
    return { x, y };
  }

  function toTile(cx: number, cy: number, s: GameState) {
    return {
      x: Math.max(0, Math.min(s.w - 1, Math.floor((cx + camera.x) / TILE))),
      y: Math.max(0, Math.min(s.h - 1, Math.floor((cy + camera.y) / TILE))),
    };
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
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const t = s.tiles[y * s.w + x];
        if (!t) continue;
        const px = x * TILE - camera.x;
        const py = y * TILE - camera.y;

        // nền gốc
        if (t.g === "water") {
          g.drawImage(atlas.water[waterFrame % atlas.water.length]!, px, py);
          continue;
        }
        const base = t.g === "path" ? atlas.path : atlas.grass;
        g.drawImage(base[variantFor(x, y, base.length)]!, px, py);

        // sàn nhà kính (công trình kind='floor') nằm ĐÈ lên nền
        if (t.b) {
          const def = content.buildings[t.b];
          if (def?.kind === "floor") {
            const img = atlas.buildings[t.b];
            if (img) g.drawImage(img, px, py);
          }
        }

        // đất đã cày
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
    /** mép dưới — khoá sắp xếp */
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
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const t = s.tiles[y * s.w + x];
        if (!t) continue;
        const px = x * TILE - camera.x;
        const py = y * TILE - camera.y;
        const base = py + TILE;

        switch (t.prop) {
          case "tree":
            // cây cao 2 ô: vẽ tràn lên ô phía trên
            items.push({ base, run: () => g.drawImage(atlas.tree, px, py - TILE) });
            break;
          case "rock":
            items.push({ base, run: () => g.drawImage(atlas.rock, px, py) });
            break;
          case "bush":
            items.push({ base, run: () => g.drawImage(atlas.bush, px, py) });
            break;
          case "shop":
            items.push({ base, run: () => g.drawImage(atlas.shop, px, py) });
            lights.push({ x: px + 8, y: py + 6, r: 26, strength: 0.7 });
            break;
          case "counter":
            items.push({ base, run: () => g.drawImage(atlas.counter, px, py) });
            lights.push({ x: px + 8, y: py + 4, r: 24, strength: 0.6 });
            break;
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
            // cửa sổ và cửa chính hắt sáng ra ngoài khi trời tối
            if (t.prop === "door") lights.push({ x: px + 8, y: py + 8, r: 40, strength: 0.9 });
            else if (isHouse(s.tiles[(y - 1) * s.w + x]))
              // ô tường (có mái ở trên) → có cửa sổ → hắt sáng
              lights.push({ x: px + 8, y: py + 7, r: 22, strength: 0.5 });
            break;
          }
        }

        // công trình người chơi đặt (loại 'object' — 'floor' đã vẽ ở lớp nền)
        if (t.b) {
          const def = content.buildings[t.b];
          const img = atlas.buildings[t.b];
          if (def && img && def.kind === "object") {
            items.push({ base, run: () => g.drawImage(img, px, py) });
            if (def.power.produce > 0 || def.effects.harvestRadius)
              lights.push({ x: px + 8, y: py + 8, r: 20, strength: 0.5 });
          }
        }

        // cây trồng — vẽ trên khung cao hơn ô, canh mép dưới trùng mép dưới ô
        if (t.crop) {
          const frames = atlas.crops[t.crop.id];
          const img = frames?.[Math.min(t.crop.stage, frames.length - 1)];
          if (img) items.push({ base, run: () => g.drawImage(img, px, py + TILE - CROP_H) });
        }
      }
    }
  }

  function drawPlayer(s: GameState, items: Item[], timeSec: number) {
    const p = s.player;
    const frames = atlas.player[p.dir as PlayerDir];
    // 6 khung/giây khi đi; đứng yên thì về khung 0
    const f = p.moving ? 1 + (Math.floor(p.anim * 6) % 2) : 0;
    const img = frames[f] ?? frames[0]!;
    // player.x/y là TÂM hitbox 10×10 (xem world.ts: PLAYER_W/H), không phải góc ô.
    // Sprite 16×16 có bàn chân ở hàng ~15, nên canh đáy sprite trùng đáy hitbox:
    //   đáy hitbox = y + 5  →  đỉnh sprite = y + 5 - 16 = y - 11
    const px = Math.round(p.x - camera.x) - TILE / 2;
    const py = Math.round(p.y - camera.y) - 11;
    items.push({ base: py + TILE, run: () => g.drawImage(img, px, py) });
    // đèn đội đầu, đủ để đi lại ban đêm mà không mù
    void timeSec;
  }

  function drawNight(s: GameState, lights: Light[]) {
    const [color, alpha] = nightTint(s.minutes);
    if (alpha <= 0.001) return;
    ng.setTransform(1, 0, 0, 1, 0, 0);
    ng.globalCompositeOperation = "source-over";
    ng.clearRect(0, 0, VIEW_W, VIEW_H);
    ng.fillStyle = color;
    ng.globalAlpha = alpha;
    ng.fillRect(0, 0, VIEW_W, VIEW_H);
    ng.globalAlpha = 1;

    // đục lỗ ở chỗ có đèn
    ng.globalCompositeOperation = "destination-out";
    for (const l of lights) {
      if (l.x < -l.r || l.x > VIEW_W + l.r || l.y < -l.r || l.y > VIEW_H + l.r) continue;
      const grad = ng.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.r);
      grad.addColorStop(0, `rgba(0,0,0,${l.strength})`);
      grad.addColorStop(0.55, `rgba(0,0,0,${l.strength * 0.45})`);
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ng.fillStyle = grad;
      ng.fillRect(l.x - l.r, l.y - l.r, l.r * 2, l.r * 2);
    }
    ng.globalCompositeOperation = "source-over";
    g.drawImage(night, 0, 0);
  }

  function draw(s: GameState, content: Content, cursor: Cursor | null, timeSec: number) {
    // camera bám nhân vật, kẹp trong biên thế giới, làm tròn về pixel nguyên
    const worldW = s.w * TILE;
    const worldH = s.h * TILE;
    camera.x = Math.round(
      Math.max(0, Math.min(worldW - VIEW_W, s.player.x - VIEW_W / 2)),
    );
    camera.y = Math.round(
      Math.max(0, Math.min(worldH - VIEW_H, s.player.y - VIEW_H / 2)),
    );

    g.fillStyle = "#1a1410";
    g.fillRect(0, 0, VIEW_W, VIEW_H);

    // chỉ duyệt phần nhìn thấy, cộng một vành đai cho vật thể cao tràn vào
    const x0 = Math.max(0, Math.floor(camera.x / TILE) - 1);
    const y0 = Math.max(0, Math.floor(camera.y / TILE) - 2);
    const x1 = Math.min(s.w - 1, Math.ceil((camera.x + VIEW_W) / TILE));
    const y1 = Math.min(s.h - 1, Math.ceil((camera.y + VIEW_H) / TILE) + 1);

    const waterFrame = Math.floor(timeSec * 4);
    drawGround(s, content, x0, y0, x1, y1, waterFrame);

    // ô đang nhắm — vẽ dưới vật thể để không che cây
    if (cursor) {
      const cx = cursor.x * TILE - camera.x;
      const cy = cursor.y * TILE - camera.y;
      g.drawImage(cursor.ok ? atlas.cursorOk : atlas.cursorNo, cx, cy);
    }

    const items: Item[] = [];
    const lights: Light[] = [];
    collectEntities(s, content, x0, y0, x1, y1, items, lights);
    drawPlayer(s, items, timeSec);
    lights.push({
      x: Math.round(s.player.x - camera.x),
      y: Math.round(s.player.y - camera.y),
      r: 46,
      strength: 0.85,
    });

    items.sort((a, b) => a.base - b.base);
    for (const it of items) it.run();

    drawNight(s, lights);

    // hiệu ứng ngủ: cả màn hình chìm dần
    if (s.sleeping) {
      g.fillStyle = "rgba(0,0,0,0.55)";
      g.fillRect(0, 0, VIEW_W, VIEW_H);
    }
  }

  resize();
  // Bám theo kích thước khung chứa: sự kiện 'resize' của window KHÔNG bắn khi
  // khung đổi kích thước vì lý do khác (mở/đóng panel, tab ẩn rồi hiện lại).
  // Thiếu cái này thì canvas kẹt ở tỉ lệ cũ và toạ độ chuột lệch hẳn.
  if (typeof ResizeObserver !== "undefined") {
    new ResizeObserver(() => resize()).observe(canvas.parentElement ?? document.body);
  }
  return { resize, draw, toCanvas, toTile, camera };
}
