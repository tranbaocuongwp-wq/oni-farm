/* ============================================================================
   PLAYER — di chuyển + va chạm AABB, trượt dọc tường.

   Thử trục X rồi trục Y RIÊNG BIỆT: chạm tường chéo thì vẫn trượt được thay vì
   dính cứng ở góc.

   Tốc độ lấy từ content (balance.moveSpeed / runSpeed) nên chỉnh được qua OTA.
   ĐỘ DÀI của vector đầu vào có ý nghĩa: joystick đẩy nhẹ thì đi chậm, đẩy hết
   cỡ thì đi nhanh — bàn phím luôn cho vector độ dài 1 nên không ảnh hưởng.
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
  run = false,
): boolean {
  const p = d.base.player;
  const len = Math.sqrt(dx * dx + dy * dy);
  const base = run
    ? (content.balance.runSpeed ?? PLAYER_SPEED)
    : (content.balance.moveSpeed ?? PLAYER_SPEED);
  // Độ dài vector > 1 (đi chéo bằng bàn phím) không được cộng dồn thành nhanh hơn.
  const throttle = Math.min(1, Number.isFinite(len) ? len : 0);
  const step = Number.isFinite(dt) ? Math.max(0, dt) * base * throttle : 0;

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
