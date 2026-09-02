/* ============================================================================
   PLAYER — di chuyển + va chạm AABB, trượt dọc tường.

   Thử trục X rồi trục Y RIÊNG BIỆT: chạm tường chéo thì vẫn trượt được thay vì
   dính cứng ở góc. Tốc độ lấy từ world.PLAYER_SPEED (60 px/s).
============================================================================ */

import type { Content, Dir } from "./types.ts";
import type { Draft } from "./state.ts";
import { dPlayer } from "./state.ts";
import { PLAYER_SPEED, blockedAt } from "./world.ts";

export function dirFromVector(nx: number, ny: number, fallback: Dir): Dir {
  if (nx === 0 && ny === 0) return fallback;
  if (Math.abs(nx) >= Math.abs(ny)) return nx > 0 ? "right" : "left";
  return ny > 0 ? "down" : "up";
}

/** Áp một bước MOVE lên draft. Trả true nếu có gì đó thay đổi. */
export function movePlayer(
  d: Draft,
  content: Content,
  dx: number,
  dy: number,
  dt: number,
): boolean {
  const p = d.base.player;
  const step = Number.isFinite(dt) ? Math.max(0, dt) * PLAYER_SPEED : 0;
  const len = Math.sqrt(dx * dx + dy * dy);

  if (!Number.isFinite(len) || len <= 1e-9) {
    if (!p.moving) return false;
    const np = dPlayer(d);
    np.moving = false;
    return true;
  }

  const nx = dx / len;
  const ny = dy / len;

  let x = p.x;
  let y = p.y;
  if (step > 0) {
    const tryX = x + nx * step;
    if (!blockedAt(d.s, content, tryX, y)) x = tryX;
    const tryY = y + ny * step;
    if (!blockedAt(d.s, content, x, tryY)) y = tryY;
  }

  const dir = dirFromVector(nx, ny, p.dir);
  const moved = x !== p.x || y !== p.y;
  const anim = moved ? p.anim + Math.max(0, dt) : p.anim;

  if (!moved && p.moving && p.dir === dir) return false;

  const np = dPlayer(d);
  np.x = x;
  np.y = y;
  np.dir = dir;
  np.moving = true;
  np.anim = anim;
  return true;
}
