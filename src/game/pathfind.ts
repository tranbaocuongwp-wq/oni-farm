/* ============================================================================
   PATHFIND — A* thuần, dùng chung cho NGƯỜI CHƠI và cho mọi thực thể.

   Vì sao nó nằm ở `game/` chứ không ở `core/`:

   Bấm-để-đi của người chơi là một CÁCH NHẬP LIỆU, nên `core/navigate.ts` giữ
   trạng thái trong closure và không cần lưu vào save — đúng chỗ của nó. Nhưng
   con bò và người làm thuê thì tìm đường BÊN TRONG reducer, mà reducer ở
   `game/` không được phép import xuống `core/` (chiều phụ thuộc là core → game,
   một chiều, có chủ đích). Nên phần THUẦN phải nằm ở đây, và `core/navigate.ts`
   import lên dùng lại.

   Hai khác biệt so với bản cũ trong navigate.ts:

   · Hộp va chạm là THAM SỐ. Xe tải rộng hơn người, con gà hẹp hơn; dùng chung
     một hộp cố định thì xe sẽ tìm ra đường mà nó không lọt.
   · Hàng đợi ưu tiên là HEAP nhị phân thay vì quét tuyến tính. Với một actor và
     ~1200 ô thì quét tuyến tính còn nhanh hơn dựng heap — nhưng 20 actor thì
     không: quét tuyến tính là O(N²) trên số nút mở, và đó là thứ giết fps trên
     điện thoại trước tiên.
============================================================================ */

import type { Content, GameState } from "./types.ts";
import {
  PLAYER_H,
  PLAYER_W,
  TILE,
  blockedAtBox,
  blockedForActor,
  idx,
  isSolid,
  speedMulAt,
  tileAt,
  tileOkFor,
} from "./world.ts";

/** Hộp va chạm của một thực thể, tính bằng world px. */
export interface Box {
  w: number;
  h: number;
}

export const PLAYER_BOX: Box = { w: PLAYER_W, h: PLAYER_H };

/** Trần số nút mở. Người chơi được rộng tay; actor thì bị siết (xem entities.ts). */
export const MAX_NODES_DEFAULT = 4000;

export interface PathOptions {
  maxNodes?: number;
  box?: Box;
  /** Thực thể BƠI: nước là chỗ đi được, cạn là chỗ chặn. */
  swims?: boolean;
  /**
   * Tránh RUỘNG: không lập đường qua ô đã cày.
   *
   * Chỉ áp cho VẬT NUÔI. Con bò đứng giữa luống xà lách là thứ ai cũng thấy
   * ngay và thấy là khó chịu. Cố ý chỉ chặn lúc LẬP ĐƯỜNG chứ không chặn lúc va
   * chạm: nếu người chơi cày ngay dưới chân con bò thì nó vẫn phải đi ra được,
   * chứ không bị nhốt trong chính cái luống vừa cày.
   *
   * KHÔNG áp cho sâu bọ — chúng phải tới được cây thì mới phá được, đó là việc
   * của chúng. Cũng không áp cho người làm: họ phải băng qua ruộng mà làm.
   */
  avoidFarm?: boolean;
  /** Dây xích: chỉ tìm trong bán kính này (ô) quanh tâm, để một actor kẹt không
   *  quét cả bản đồ. */
  leash?: { x: number; y: number; r: number };
}

/** Ô này đi qua được không (ở mức Ô, chưa xét hộp va chạm). */
export function walkableTile(
  state: GameState,
  content: Content,
  x: number,
  y: number,
  swims = false,
): boolean {
  if (x < 0 || y < 0 || x >= state.w || y >= state.h) return false;
  if (swims) return tileOkFor(tileAt(state, x, y), content, true);
  return !isSolid(state, content, x, y);
}

/** Hệ số tốc độ của Ô — chi phí bước của A* được CHIA cho nó. */
export function stepSpeed(state: GameState, content: Content, x: number, y: number): number {
  return speedMulAt(state, content, x * TILE + TILE / 2, y * TILE + TILE / 2);
}

/**
 * Đường ngắm thẳng từ (ax,ay) tới (bx,by) có va vào gì không.
 * Kiểm bằng cả HỘP va chạm chứ không phải một điểm — nếu không, đường sẽ "lách"
 * qua khe hẹp mà thân thực thể không lọt.
 */
export function lineOfSightBox(
  state: GameState,
  content: Content,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  box: Box = PLAYER_BOX,
): boolean {
  const dist = Math.hypot(bx - ax, by - ay);
  const steps = Math.ceil(dist / 4);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    if (blockedAtBox(state, content, ax + (bx - ax) * t, ay + (by - ay) * t, box.w, box.h))
      return false;
  }
  return true;
}

/* ------------------------------------------------------------------ heap ---
   Heap nhị phân tối thiểu. Cố ý viết tay thay vì dùng thư viện: `src/game/`
   không có phụ thuộc ngoài nào, và đây là 30 dòng.
   Tie-break theo CHỈ SỐ Ô để kết quả tất định — hai nút cùng `f` phải luôn ra
   cùng một thứ tự, nếu không hai lần replay cùng chuỗi action sẽ cho hai đường
   khác nhau.
--------------------------------------------------------------------------- */

interface Node {
  i: number;
  f: number;
}

function less(a: Node, b: Node): boolean {
  return a.f !== b.f ? a.f < b.f : a.i < b.i;
}

function heapPush(h: Node[], n: Node): void {
  h.push(n);
  let c = h.length - 1;
  while (c > 0) {
    const p = (c - 1) >> 1;
    if (!less(h[c]!, h[p]!)) break;
    const t = h[c]!;
    h[c] = h[p]!;
    h[p] = t;
    c = p;
  }
}

function heapPop(h: Node[]): Node | undefined {
  const top = h[0];
  const last = h.pop();
  if (h.length && last !== undefined) {
    h[0] = last;
    let p = 0;
    for (;;) {
      const l = p * 2 + 1;
      const r = l + 1;
      let m = p;
      if (l < h.length && less(h[l]!, h[m]!)) m = l;
      if (r < h.length && less(h[r]!, h[m]!)) m = r;
      if (m === p) break;
      const t = h[p]!;
      h[p] = h[m]!;
      h[m] = t;
      p = m;
    }
  }
  return top;
}

/* --------------------------------------------------------------------------- */

/**
 * A* 8 hướng, cấm cắt góc. Trả về MẢNG CHỈ SỐ Ô (không kể ô xuất phát), hoặc
 * null nếu không có đường.
 *
 * Trả chỉ số ô chứ không trả object: đường đi của thực thể phải nằm trong save,
 * mà `GameState` là JSON thuần — một mảng số gọn hơn hẳn một mảng object, và
 * không có gì để lệch.
 */
export function findPath(
  state: GameState,
  content: Content,
  sx: number,
  sy: number,
  goals: ReadonlySet<number>,
  opts: PathOptions = {},
): number[] | null {
  const w = state.w;
  const box = opts.box ?? PLAYER_BOX;
  const swims = opts.swims === true;
  const avoidFarm = opts.avoidFarm === true;
  const maxNodes = opts.maxNodes ?? MAX_NODES_DEFAULT;
  const leash = opts.leash;
  const start = idx(w, sx, sy);
  if (goals.has(start)) return [];

  /* Heuristic phải chia cho hệ số tốc độ LỚN NHẤT của content. Có ô rẻ hơn 1
     (đường nhựa) mà vẫn ước lượng theo giá 1 là ước lượng THỪA, và A* mất tính
     tối ưu — nó vẫn trả về một đường hợp lệ, chỉ không phải đường ngắn nhất.
     Hỏng âm thầm, không crash, rất khó thấy. */
  let maxMul = 1;
  for (const g of Object.values(content.tiles.grounds ?? {})) {
    const v = g?.speedMul;
    if (typeof v === "number" && v > maxMul) maxMul = v;
  }
  for (const b of Object.values(content.buildings)) {
    const v = b?.effects.speedMul;
    if (typeof v === "number" && v > maxMul) maxMul = v;
  }
  const invMax = 1 / maxMul;

  const gScore = new Map<number, number>();
  const cameFrom = new Map<number, number>();
  const open: Node[] = [];

  const heur = (i: number): number => {
    const x = i % w;
    const y = (i / w) | 0;
    let best = Infinity;
    for (const g of goals) {
      const gx = g % w;
      const gy = (g / w) | 0;
      const dx = Math.abs(x - gx);
      const dy = Math.abs(y - gy);
      const d = Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
      if (d < best) best = d;
    }
    return best * invMax;
  };

  gScore.set(start, 0);
  heapPush(open, { i: start, f: heur(start) });

  let expanded = 0;
  while (open.length && expanded < maxNodes) {
    const cur = heapPop(open)!.i;
    expanded++;

    if (goals.has(cur)) {
      const path: number[] = [];
      let node: number | undefined = cur;
      while (node !== undefined && node !== start) {
        path.push(node);
        node = cameFrom.get(node);
      }
      path.reverse();
      return path;
    }

    const cx = cur % w;
    const cy = (cur / w) | 0;
    const g0 = gScore.get(cur) ?? 0;

    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = cx + dx;
        const ny = cy + dy;
        if (leash && (Math.abs(nx - leash.x) > leash.r || Math.abs(ny - leash.y) > leash.r))
          continue;
        if (!walkableTile(state, content, nx, ny, swims)) continue;
        if (avoidFarm && tileAt(state, nx, ny)?.tilled) continue;
        // Hộp va chạm rộng hơn một điểm: ô đi được ở mức Ô vẫn có thể không lọt.
        if (
          blockedForActor(state, content, nx * TILE + TILE / 2, ny * TILE + TILE / 2, box.w, box.h, swims)
        )
          continue;
        // Cấm cắt góc: đi chéo thì hai ô kề cũng phải trống, nếu không thân
        // thực thể sẽ kẹt cứng ở góc tường.
        if (dx !== 0 && dy !== 0) {
          if (!walkableTile(state, content, cx + dx, cy, swims)) continue;
          if (!walkableTile(state, content, cx, cy + dy, swims)) continue;
        }
        const ni = idx(w, nx, ny);
        const step = dx !== 0 && dy !== 0 ? Math.SQRT2 : 1;
        const g1 = g0 + step / stepSpeed(state, content, nx, ny);
        if (g1 >= (gScore.get(ni) ?? Infinity)) continue;
        gScore.set(ni, g1);
        cameFrom.set(ni, cur);
        heapPush(open, { i: ni, f: g1 + heur(ni) });
      }
    }
  }
  return null;
}
