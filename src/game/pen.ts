/* ============================================================================
   PEN — KHU CHUỒNG dựng sẵn và cái MÁNG trong đó.

   Vì sao có file này: trước đây "chuồng" chỉ là một chữ trong `AnimalDef.housing`
   mà không có gì trong game ứng với nó. Con bò mua về đứng ngay chỗ xe thả rồi
   lang thang cả nông trại; muốn nhốt nó lại thì người chơi phải tự đóng rào, mà
   đóng rào bằng tay thì mỗi ván một kiểu và chẳng ván nào ra hình cái chuồng.

   Giờ nông trại chia lô SẴN: `tiles.json:pens` khai ruột từng khu, `farm.ascii`
   vẽ hàng rào quanh nó, và mỗi loài khai mình thuộc khu nào. Ba thứ đó nằm hết
   trong content nên chỉnh lại khu không phải sửa một dòng mã nào.

   Cái MÁNG là chỗ thức ăn NẰM LẠI:

   · Đổ rơm vào máng một lần, máng giữ tới `balance.troughMax` phần.
   · Con vật đói trong khu tự tới máng ăn một phần — nên đi vắng vài ngày vẫn
     có cái để chúng ăn, thay vì phải chạy tới từng con mà bấm.
   · Khu ăn gì là do KHU nói (`pen.feed`), không phải do con vật. Vì thế bò, dê
     và cừu — ba loài cùng ăn rơm — dùng CHUNG một máng, đúng như một cái chuồng
     gia súc thật. Heo ăn cỏ khô nên có máng riêng ở khu riêng.
   · Gà vịt (`feed: null`) mổ sâu trên cỏ nên khu của chúng cố ý KHÔNG có máng —
     dựng một cái máng không đổ được gì vào chỉ tổ làm người chơi thử rồi bực.
============================================================================ */

import type { Content, Entity, GameState, PenDef } from "./types.ts";
import type { Draft } from "./state.ts";
import { dEntity, dTile, setInv, toastText } from "./state.ts";
import { countItem, removeItem, selectedItemId } from "./inventory.ts";
import { itemName } from "./items.ts";
import { TILE, penOfAnimal, tileAt, tileIndexAt, troughIn } from "./world.ts";

/** Trần sức chứa của máng, lấy từ content. */
export function troughMax(content: Content): number {
  return Math.max(1, Math.floor(content.balance.troughMax ?? 12));
}

/** Số phần thức ăn còn trong máng ở ô (x,y). Ô không phải máng → 0. */
export function troughStock(state: GameState, x: number, y: number): number {
  const t = tileAt(state, x, y);
  if (!t || t.prop !== "trough") return 0;
  const n = t.trough;
  return Number.isFinite(n) && (n as number) > 0 ? Math.floor(n as number) : 0;
}

/** Khu chứa ô (x,y) trên bản đồ đang chơi, hoặc null. */
export function penAt(state: GameState, content: Content, x: number, y: number): PenDef | null {
  for (const p of content.tiles.pens ?? []) {
    if (p.map !== state.mapId) continue;
    if (x >= p.x && x < p.x + p.w && y >= p.y && y < p.y + p.h) return p;
  }
  return null;
}

/**
 * Máng ở ô (x,y) nhận thức ăn gì, hoặc null nếu đây không phải máng dùng được.
 *
 * Thức ăn đến từ KHU chứa cái máng. Máng nằm ngoài mọi khu (ai đó xê dịch bản
 * đồ mà quên chỉnh `pens`) thì trả null: thà cái máng đó trơ ra còn hơn nó âm
 * thầm nhận mọi thứ người chơi cầm.
 */
export function troughFeedAt(state: GameState, content: Content, x: number, y: number): string | null {
  if (tileAt(state, x, y)?.prop !== "trough") return null;
  return penAt(state, content, x, y)?.feed ?? null;
}

/** Đang cầm đúng thứ đổ được vào cái máng ở ô này không. */
export function canPourInto(state: GameState, content: Content, x: number, y: number): boolean {
  const feed = troughFeedAt(state, content, x, y);
  if (!feed) return false;
  if (troughStock(state, x, y) >= troughMax(content)) return false;
  return selectedItemId(state.inv, state.sel) === feed;
}

/**
 * Đổ thức ăn đang cầm vào máng ở ô (x,y). Trả số phần đã đổ.
 *
 * Đổ HẾT mức đổ được trong một lần bấm, chứ không một phần mỗi lần: máng chứa
 * mười hai phần thì bấm mười hai lần là mười hai lần chờ hết khoá thao tác, một
 * việc vặt không có quyết định nào bên trong.
 */
export function pourIntoTrough(d: Draft, content: Content, x: number, y: number): number {
  const feed = troughFeedAt(d.s, content, x, y);
  if (!feed) return 0;
  const i = tileIndexAt(d.s, x, y);
  if (i < 0) return 0;

  const cho = troughMax(content) - troughStock(d.s, x, y);
  if (cho <= 0) {
    toastText(d, "Máng đã đầy.", "info");
    return 0;
  }
  const co = countItem(d.s.inv, feed);
  if (co <= 0) {
    toastText(d, `Không có ${itemName(feed, content)} trong túi.`, "bad");
    return 0;
  }
  const n = Math.min(cho, co);
  const left = removeItem(d.s.inv, feed, n);
  if (!left) return 0;
  setInv(d, left);

  const t = dTile(d, i);
  if (!t) return 0;
  t.trough = troughStock(d.s, x, y) + n;
  toastText(d, `Đổ ${n} ${itemName(feed, content)} vào máng.`, "good");
  return n;
}

/** Khu của con vật này (theo loài). Loài thả rông → null. */
export function penOf(content: Content, e: Entity): PenDef | null {
  if (e.kind !== "animal") return null;
  return penOfAnimal(content, e.def);
}

/**
 * Con vật ở chỉ số `i` ĂN MỘT PHẦN từ máng khu nó, nếu đứng sát máng và máng
 * còn thức ăn. Trả true nếu ăn được.
 *
 * Máng làm no HẲN (`fedMinutes`), hơn gặm cỏ (`GRAZE_FILL` = 0,7): công người
 * chơi bỏ ra cắt rơm rồi đổ máng phải hơn việc con vật tự đi kiếm, nếu không
 * thì cái máng chỉ là đồ trang trí.
 */
export function eatFromTrough(d: Draft, content: Content, i: number): boolean {
  const cur = d.s.entities[i];
  if (!cur || cur.kind !== "animal") return false;
  const def = content.animals[cur.def];
  if (!def?.feed) return false;

  const pen = penOf(content, cur);
  if (!pen || pen.map !== d.s.mapId) return false;
  const m = troughIn(d.s, pen);
  if (!m) return false;
  // Máng là ô ĐẶC nên con vật không đứng lên được: nó ăn khi đứng KỀ bên.
  const cx = Math.floor(cur.x / TILE);
  const cy = Math.floor(cur.y / TILE);
  if (Math.max(Math.abs(cx - m.x), Math.abs(cy - m.y)) > 1) return false;
  if (pen.feed !== def.feed) return false;
  if (troughStock(d.s, m.x, m.y) <= 0) return false;

  const ti = tileIndexAt(d.s, m.x, m.y);
  if (ti < 0) return false;
  const t = dTile(d, ti);
  if (!t) return false;
  t.trough = troughStock(d.s, m.x, m.y) - 1;

  const e = dEntity(d, i);
  if (!e) return false;
  e.animal.fed = def.fedMinutes;
  e.animal.hungryDays = 0;
  return true;
}

/**
 * Ô con vật nên nhắm tới để VỀ KHU của nó, hoặc null nếu không cần về.
 *
 * Đói và máng còn thức ăn thì nhắm vào ô kề MÁNG — đó là chỗ nó ăn được. Không
 * thì nhắm vào một ô bất kỳ trong ruột khu, chọn theo hạt của chính con vật nên
 * cả đàn không dồn hết vào một ô.
 *
 * Trả null khi nó ĐÃ ở trong khu: về rồi thì để nó lang thang trong khu, đừng
 * bắt nó đi tới đi lui giữa hai điểm.
 */
export function penGoal(
  state: GameState,
  content: Content,
  e: Entity,
  hungry: boolean,
): { x: number; y: number } | null {
  const pen = penOf(content, e);
  if (!pen || pen.map !== state.mapId) return null;
  const cx = Math.floor(e.x / TILE);
  const cy = Math.floor(e.y / TILE);
  const inside = cx >= pen.x && cx < pen.x + pen.w && cy >= pen.y && cy < pen.y + pen.h;

  const m = troughIn(state, pen);
  const conAn = !!m && troughStock(state, m.x, m.y) > 0;

  /* ĐÓI mà máng CẠN thì đừng gọi nó về: về tới nơi cũng không có gì ăn, mà
     đường về thì bỏ lại đúng vạt cỏ nó đang đứng. Trả null để nhánh tìm cỏ ở
     `actorStep` quyết định — đó mới là "tự về chuồng, vẫn ra ngoài gặm được",
     chứ không phải "về chuồng rồi chết đói cạnh cái máng rỗng". */
  if (hungry && !conAn) return null;

  if (hungry && m && conAn) {
    // Ô kề máng, ưu tiên ô nằm trong ruột khu (đứng ngoài rào thì với không tới).
    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const x = m.x + (dx as number);
      const y = m.y + (dy as number);
      if (x < pen.x || y < pen.y || x >= pen.x + pen.w || y >= pen.y + pen.h) continue;
      const t = tileAt(state, x, y);
      if (t && t.prop === null && !t.tilled) return { x, y };
    }
  }
  if (inside) return null;

  const k = Math.abs(e.seed | 0);
  return { x: pen.x + (k % pen.w), y: pen.y + (((k / 7) | 0) % pen.h) };
}
