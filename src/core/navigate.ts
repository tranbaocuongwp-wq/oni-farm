/* ============================================================================
   NAVIGATE — bấm vào một ô thì nhân vật TỰ ĐI tới đó rồi mới làm việc.

   Đây là một CÁCH NHẬP LIỆU, không phải luật chơi: nó chỉ sinh ra vector di
   chuyển từng khung hình, y hệt như bàn phím hay joystick. Toàn bộ thay đổi
   state vẫn đi qua action MOVE/USE như cũ, nên `src/game/` không phải biết gì
   về nó và định dạng save cũng không đổi. Đích đến là ý định nhất thời của
   người chơi — không thuộc về game state, không đáng lưu vào file save.

   Ba việc:

   1. **Tìm đường A*** trên lưới ô, 8 hướng. Đi thẳng tới đích sẽ kẹt cứng ở
      góc nhà hay gốc cây; bản đồ chỉ 1200 ô nên A* rẻ như không.
   2. **Kéo dây (string pulling).** Đường A* đi theo tâm từng ô nên trông rất
      máy móc. Mỗi khung hình ta thử bỏ qua các điểm mốc còn nhìn thấy được
      đích xa hơn, nên nhân vật đi theo đường chéo tự nhiên.
   3. **Dừng khi ĐỦ GẦN, không phải khi giẫm lên đích.** Người chơi bấm vào ô
      đất là muốn cày nó, chứ không phải muốn đứng lên nó — nên chỉ cần vào
      trong khoảng một ô là dừng và xử lý.
============================================================================ */

import type { Content, GameState } from "../game/types.ts";
import {
  REACH_TILES,
  TILE,
  blockedAt,
  distToTile,
  idx,
  isSolid,
  tileCenterX,
  tileCenterY,
  speedMulAt,
  maxSpeedMul,
} from "../game/world.ts";

/** Tầm coi là "đã tới nơi" khi đi để LÀM VIỆC.
 *
 *  1,05 ô: vừa đủ chứa ô kề thẳng khi đứng đúng TÂM ô đó (1,0), nhưng không
 *  chứa ô kề chéo (1,41). Đặt rộng hơn (1,2) thì nhân vật dừng lùi lại vài pixel
 *  so với tâm ô, nhìn cứ như chưa tiến hẳn vào lô đất.
 *
 *  Nếu vì vật cản mà không bao giờ vào sát được thì `finishOrGiveUp` vẫn cứu:
 *  đi hết đường mà đã lọt tầm với thì cứ làm. */
const ARRIVE_TILES = 1.05;

/** Đứng cách tâm ô đích quá ngần này (world px) trên trục thẳng hàng thì coi
 *  như chưa thẳng hàng. Đứng đúng tâm ô kề thì lệch bằng 0. */
const ALIGN_SLACK = 4;

/** Đi THUẦN TUÝ (bấm bản đồ nhỏ) thì mới tính là tới khi đã giẫm lên ô đó. */
const TRAVEL_ARRIVE_TILES = 0.6;

/**
 * Nhân vật đã đứng THẲNG HÀNG với ô đích chưa — cùng cột hoặc cùng hàng, và
 * sát bên.
 *
 * Đây là điểm khác biệt so với chỉ đo khoảng cách: đứng chéo góc cách ô đất
 * 1,41 ô thì vẫn "với tới" được, nhưng nhìn rất lệch và tư thế vung tay chỉ
 * sang hướng chẳng liên quan. Người chơi mong nhân vật tiến vào cho ngang bằng
 * với lô đất rồi mới làm.
 */
export function alignedTo(state: GameState, tx: number, ty: number): boolean {
  const dx = Math.abs(state.player.x - tileCenterX(tx));
  const dy = Math.abs(state.player.y - tileCenterY(ty));
  if (Math.hypot(dx, dy) > ARRIVE_TILES * TILE) return false;

  // Phải ĐỨNG HẲN trên ô đích hoặc một ô kề THẲNG của nó. Chỉ đo khoảng cách là
  // chưa đủ: đứng vắt ở góc hai ô vẫn có thể lọt ngưỡng mà nhìn thì vẫn xiên.
  const ptx = Math.floor(state.player.x / TILE);
  const pty = Math.floor(state.player.y / TILE);
  const onTileLine =
    (ptx === tx && Math.abs(pty - ty) <= 1) || (pty === ty && Math.abs(ptx - tx) <= 1);
  if (!onTileLine) return false;

  return dx <= ALIGN_SLACK || dy <= ALIGN_SLACK;
}

/** Bỏ cuộc nếu đi mãi không tiến thêm được (bị kẹt sau lưng vật cản). */
const STUCK_SECONDS = 0.6;
const STUCK_DISTANCE = 3;

/** Trần số ô A* được phép mở, chặn trường hợp đích bị vây kín. */
const MAX_NODES = 4000;

export interface NavTarget {
  tx: number;
  ty: number;
  /** Tới nơi thì có làm việc gì không. Bấm lên bản đồ nhỏ = ĐI THUẦN TUÝ, không
   *  cày cuốc gì cả — nếu không thì đang cầm cuốc mà bấm minimap là tự cày. */
  act: boolean;
}

export interface NavOptions {
  /** Cầm công trình đặc thì phải đứng CẠNH ô, không đứng lên nó. */
  avoidStandingOn?: boolean;
  /** false = chỉ đi tới, không thao tác. */
  act?: boolean;
}

export interface Navigator {
  /** Đặt đích mới. Trả về false nếu không có đường đi (đích bị vây kín). */
  goTo(state: GameState, content: Content, tx: number, ty: number, opts?: NavOptions): boolean;
  cancel(): void;
  isActive(): boolean;
  target(): NavTarget | null;
  /** Gọi mỗi khung hình. Trả vector đi, hoặc null khi không có đích. */
  update(state: GameState, content: Content, dt: number): { dx: number; dy: number; run: boolean } | null;
  /** true đúng MỘT lần, ngay khung hình nhân vật vào đủ gần đích. */
  takeArrival(): NavTarget | null;
}

/* -------------------------------------------------------------------------- */

/** Hệ số tốc độ của Ô (x,y) — dùng cho chi phí bước của A*. */
function stepSpeed(state: GameState, content: Content, x: number, y: number): number {
  return speedMulAt(state, content, x * TILE + TILE / 2, y * TILE + TILE / 2);
}

/** Nhân vật có đi qua được ô này không (dùng cho A*, ở mức Ô). */
function walkable(state: GameState, content: Content, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= state.w || y >= state.h) return false;
  return !isSolid(state, content, x, y);
}

/**
 * Đường ngắm thẳng: nhân vật đi thẳng từ (ax,ay) tới (bx,by) có va vào gì không.
 * Kiểm bằng chính hộp va chạm của nhân vật (`blockedAt`) chứ không phải một
 * điểm — nếu không, đường sẽ "lách" qua khe hẹp mà thân nhân vật không lọt.
 */
function lineOfSight(
  state: GameState,
  content: Content,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): boolean {
  const dist = Math.hypot(bx - ax, by - ay);
  const steps = Math.ceil(dist / 4);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    if (blockedAt(state, content, ax + (bx - ax) * t, ay + (by - ay) * t)) return false;
  }
  return true;
}

/** A* 8 hướng. `goals` là tập chỉ số ô được coi là tới nơi. */
function findPath(
  state: GameState,
  content: Content,
  sx: number,
  sy: number,
  goals: Set<number>,
): NavTarget[] | null {
  const w = state.w;
  const start = idx(w, sx, sy);
  if (goals.has(start)) return [];

  const gScore = new Map<number, number>();
  const cameFrom = new Map<number, number>();
  // Hàng đợi ưu tiên đơn giản: mảng + lấy phần tử nhỏ nhất. Với ~1200 ô thì
  // đây còn nhanh hơn dựng heap, và ít code sai hơn nhiều.
  const open: { i: number; f: number }[] = [];

  /* Chi phí một bước được CHIA cho hệ số tốc độ của ô đích: đi trên đường nhựa
     rẻ hơn đi trên cỏ, nên A* tự vòng qua đường mà không cần luật riêng nào.

     Hệ quả BẮT BUỘC: heuristic cũng phải chia cho hệ số LỚN NHẤT của content.
     Heuristic chỉ đúng khi nó không bao giờ ước lượng THỪA chi phí thật; có ô
     rẻ hơn 1 mà vẫn ước lượng theo giá 1 là ước lượng thừa, và A* mất tính tối
     ưu — nó sẽ trả về một đường hợp lệ nhưng không phải đường ngắn nhất, âm
     thầm, không crash, rất khó thấy. */
  const invMax = 1 / Math.max(1, maxSpeedMul(content));

  // Heuristic: khoảng cách chéo (8 hướng), không bao giờ ước lượng thừa.
  const heur = (i: number) => {
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
  open.push({ i: start, f: heur(start) });

  let expanded = 0;
  while (open.length && expanded < MAX_NODES) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i]!.f < open[bi]!.f) bi = i;
    const cur = open.splice(bi, 1)[0]!.i;
    expanded++;

    if (goals.has(cur)) {
      const path: NavTarget[] = [];
      let node: number | undefined = cur;
      while (node !== undefined && node !== start) {
        path.push({ tx: node % w, ty: (node / w) | 0, act: false });
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
        if (!walkable(state, content, nx, ny)) continue;
        // Cấm cắt góc: đi chéo thì hai ô kề cũng phải trống, nếu không nhân vật
        // sẽ kẹt cứng ở góc tường vì thân nó rộng hơn một điểm.
        if (dx !== 0 && dy !== 0) {
          if (!walkable(state, content, cx + dx, cy)) continue;
          if (!walkable(state, content, cx, cy + dy)) continue;
        }
        const ni = idx(w, nx, ny);
        const step = dx !== 0 && dy !== 0 ? Math.SQRT2 : 1;
        const g1 = g0 + step / stepSpeed(state, content, nx, ny);
        if (g1 >= (gScore.get(ni) ?? Infinity)) continue;
        gScore.set(ni, g1);
        cameFrom.set(ni, cur);
        open.push({ i: ni, f: g1 + heur(ni) });
      }
    }
  }
  return null;
}

/* -------------------------------------------------------------------------- */

export function createNavigator(): Navigator {
  let path: NavTarget[] = [];
  let goal: NavTarget | null = null;
  let arrived: NavTarget | null = null;
  let stuckTime = 0;
  let lastX = 0;
  let lastY = 0;

  const clear = () => {
    path = [];
    goal = null;
    stuckTime = 0;
  };

  /** Hết điểm mốc rồi. Nếu đã lọt vào TẦM VỚI THẬT của game thì coi như tới nơi
   *  và xử lý luôn — không thì mới bỏ cuộc.
   *
   *  Cần cả hai ngưỡng: ARRIVE_TILES để DỪNG SỚM ngay khi đủ gần (khỏi đi thừa),
   *  còn REACH_TILES là mốc chốt lúc đi hết đường. Đi tới ô kề chéo cho khoảng
   *  cách 1,41 ô, cộng vài pixel sai số là vượt 1,5 — chỉ có một ngưỡng thì
   *  nhân vật đi tới nơi rồi đứng ngẩn ra không làm gì. */
  const finishOrGiveUp = (state: GameState) => {
    if (goal && distToTile(state, goal.tx, goal.ty) <= REACH_TILES) arrived = goal;
    clear();
  };

  return {
    goTo(state, content, tx, ty, opts = {}) {
      const avoidStandingOn = opts.avoidStandingOn === true;
      const act = opts.act !== false;
      clear();
      if (tx < 0 || ty < 0 || tx >= state.w || ty >= state.h) return false;

      // Đã đứng đúng chỗ rồi thì khỏi đi đâu cả — người gọi tự xử lý ngay.
      if (act ? alignedTo(state, tx, ty) : distToTile(state, tx, ty) <= TRAVEL_ARRIVE_TILES)
        return false;

      const at = (x: number, y: number) => idx(state.w, x, y);
      const ORTHO: [number, number][] = [[0, -1], [0, 1], [-1, 0], [1, 0]];
      const DIAG: [number, number][] = [[-1, -1], [1, -1], [-1, 1], [1, 1]];

      // Thứ tự ưu tiên chỗ đứng:
      //   1. bốn ô kề THẲNG  → thẳng hàng với lô đất, tư thế vung tay đúng hướng
      //   2. chính ô đó       → chỉ khi đi thuần tuý, hoặc không cấm giẫm lên
      //   3. bốn ô kề CHÉO    → phương án chót khi ô đất bị kẹp giữa vật cản
      // Chạy A* theo từng nhóm thay vì gộp một tập: A* với tập gộp sẽ vớ lấy ô
      // nào GẦN NHẤT, mà ô chéo thường gần hơn ô thẳng — đúng cái ta muốn tránh.
      const groups: number[][] = [];
      const ortho = ORTHO.filter(([dx, dy]) => walkable(state, content, tx + dx, ty + dy)).map(
        ([dx, dy]) => at(tx + dx, ty + dy),
      );
      if (ortho.length) groups.push(ortho);

      const selfOk = !avoidStandingOn && walkable(state, content, tx, ty);
      // Khi đi thuần tuý thì đích là chính ô đó, nên nó phải được xét TRƯỚC.
      if (selfOk) groups[act ? "push" : "unshift"]([at(tx, ty)]);

      const diag = DIAG.filter(([dx, dy]) => walkable(state, content, tx + dx, ty + dy)).map(
        ([dx, dy]) => at(tx + dx, ty + dy),
      );
      if (diag.length) groups.push(diag);
      if (!groups.length) return false;

      const px = Math.floor(state.player.x / TILE);
      const py = Math.floor(state.player.y / TILE);
      let found: NavTarget[] | null = null;
      for (const gset of groups) {
        found = findPath(state, content, px, py, new Set(gset));
        if (found) break;
      }
      if (!found) return false;

      path = found;
      goal = { tx, ty, act };
      lastX = state.player.x;
      lastY = state.player.y;
      stuckTime = 0;
      return true;
    },

    cancel: clear,
    isActive: () => goal !== null,
    target: () => goal,

    takeArrival() {
      const a = arrived;
      arrived = null;
      return a;
    },

    update(state, content, dt) {
      if (!goal) return null;

      // Tới nơi? Kiểm TRƯỚC khi đi tiếp.
      //
      // Đi để LÀM VIỆC thì phải THẲNG HÀNG với ô đất mới dừng — chỉ "gần" thôi
      // là chưa đủ, vì đứng chéo góc vẫn với tới được nhưng nhìn lệch hẳn.
      // Đi thuần tuý (bản đồ nhỏ) thì giẫm lên ô đó mới là tới.
      const done = goal.act
        ? alignedTo(state, goal.tx, goal.ty)
        : distToTile(state, goal.tx, goal.ty) <= TRAVEL_ARRIVE_TILES;
      if (done) {
        arrived = goal;
        clear();
        return null;
      }

      const px = state.player.x;
      const py = state.player.y;

      // Kéo dây: bỏ qua mọi điểm mốc mà từ đây vẫn nhìn thẳng tới được. Nhờ vậy
      // nhân vật cắt chéo qua bãi trống thay vì đi zigzag theo tâm từng ô.
      let skipped = 0;
      while (path.length > 1 && skipped < 8) {
        const next = path[1]!;
        if (!lineOfSight(state, content, px, py, tileCenterX(next.tx), tileCenterY(next.ty))) break;
        path.shift();
        skipped++;
      }

      const wp = path[0];
      if (!wp) {
        finishOrGiveUp(state);
        return null;
      }

      const tx = tileCenterX(wp.tx);
      const ty = tileCenterY(wp.ty);
      const dx = tx - px;
      const dy = ty - py;
      const len = Math.hypot(dx, dy);
      if (len < 2.5) {
        path.shift();
        if (!path.length) {
          finishOrGiveUp(state);
          return null;
        }
        return { dx: 0, dy: 0, run: false };
      }

      // Kẹt: đi mãi mà không nhích được thì bỏ cuộc, còn hơn dí vào tường mãi.
      if (Math.hypot(px - lastX, py - lastY) < STUCK_DISTANCE) {
        stuckTime += dt;
        if (stuckTime > STUCK_SECONDS) {
          // Kẹt sau lưng vật cản — nhưng nếu đã lọt vào tầm với thì cứ làm.
          finishOrGiveUp(state);
          return null;
        }
      } else {
        stuckTime = 0;
        lastX = px;
        lastY = py;
      }

      // Còn xa thì CHẠY. Đi bộ hết chiều dài bản đồ là cực hình; chạy khi còn
      // trên hai ô làm quãng đường dài ngắn lại hẳn mà bước cuối vẫn đi bộ nên
      // không bị trượt quá đích.
      const remain = distToTile(state, goal.tx, goal.ty);
      return { dx: dx / len, dy: dy / len, run: remain > 2.5 };
    },
  };
}
