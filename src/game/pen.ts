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
import type { Draft, MapView } from "./state.ts";
import { dEntity, dTile, setInv, toastText } from "./state.ts";
import { countItem, removeItem, selectedItemId } from "./inventory.ts";
import { itemName } from "./items.ts";
import { TILE, penOfAnimal, tileAt, tileIndexAt } from "./world.ts";

/** Trần sức chứa của máng, lấy từ content. */
export function troughMax(content: Content): number {
  return Math.max(1, Math.floor(content.balance.troughMax ?? 12));
}

/**
 * Số phần thức ăn còn ở ô (x,y) — trong cái máng, hoặc đang NỔI trên mặt nước.
 *
 * Hai chỗ chứa, một hàm: từ khi rắc cám xuống hồ để lại thức ăn thật trên mặt
 * nước (thay vì no ngay tức khắc từ hư không), con cá và con bò dùng chung đúng
 * một luật — "tới chỗ có đồ ăn rồi ăn".
 */
export function troughStock(state: GameState, x: number, y: number): number {
  const t = tileAt(state, x, y);
  if (!t) return 0;
  if (t.prop !== "trough" && t.g !== "water") return 0;
  const n = t.trough;
  return Number.isFinite(n) && (n as number) > 0 ? Math.floor(n as number) : 0;
}

/** MÓN đang nằm ở ô (x,y), hoặc null nếu ô đó trống. */
export function troughItem(state: GameState, x: number, y: number): string | null {
  if (troughStock(state, x, y) <= 0) return null;
  const id = tileAt(state, x, y)?.troughId;
  return typeof id === "string" && id ? id : null;
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
export function troughFeedsAt(state: GameState, content: Content, x: number, y: number): string[] {
  if (tileAt(state, x, y)?.prop !== "trough") return [];
  return penAt(state, content, x, y)?.feeds ?? [];
}

/** Đang cầm một thứ đổ được vào cái máng ở ô này không. */
export function canPourInto(state: GameState, content: Content, x: number, y: number): boolean {
  const feeds = troughFeedsAt(state, content, x, y);
  if (!feeds.length) return false;
  if (troughStock(state, x, y) >= troughMax(content)) return false;
  const cam = selectedItemId(state.inv, state.sel);
  if (!cam || !feeds.includes(cam)) return false;
  // Máng chứa một món tại một lúc — nếu không thì hình vẽ phải nói dối về thứ
  // đang nằm trong đó.
  const dang = troughItem(state, x, y);
  return dang === null || dang === cam;
}

/**
 * Đổ thức ăn đang cầm vào máng ở ô (x,y). Trả số phần đã đổ.
 *
 * Đổ HẾT mức đổ được trong một lần bấm, chứ không một phần mỗi lần: máng chứa
 * mười hai phần thì bấm mười hai lần là mười hai lần chờ hết khoá thao tác, một
 * việc vặt không có quyết định nào bên trong.
 */
export function pourIntoTrough(d: Draft, content: Content, x: number, y: number): number {
  const feeds = troughFeedsAt(d.s, content, x, y);
  const cam = selectedItemId(d.s.inv, d.s.sel);
  /* Đổ ĐÚNG món đang cầm. Máng nhận nhiều món, nhưng "đổ máng" là một cú bấm
     có chủ ngữ rõ ràng: người chơi đang cầm bó rơm thì cái vào máng phải là bó
     rơm đó, không phải món nào rẻ nhất mà code tự chọn hộ. */
  const feed = cam && feeds.includes(cam) ? cam : (feeds[0] ?? null);
  if (!feed) return 0;
  const i = tileIndexAt(d.s, x, y);
  if (i < 0) return 0;

  const dang = troughItem(d.s, x, y);
  if (dang !== null && dang !== feed) {
    toastText(d, `Máng đang có ${itemName(dang, content)} — để chúng ăn hết đã.`, "info");
    return 0;
  }
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
  t.troughId = feed;
  toastText(d, `Đổ ${n} ${itemName(feed, content)} vào máng.`, "good");
  return n;
}

/** Bớt một phần ở ô (x,y); cạn thì xoá luôn tên món để hình vẽ về đúng "trống". */
function botMotPhan(d: Draft, x: number, y: number): boolean {
  const i = tileIndexAt(d.s, x, y);
  if (i < 0) return false;
  const con = troughStock(d.s, x, y);
  if (con <= 0) return false;
  const t = dTile(d, i);
  if (!t) return false;
  t.trough = con - 1;
  if (t.trough <= 0) {
    delete t.trough;
    delete t.troughId;
  }
  return true;
}

/**
 * Ô để ĐỔ/RẮC thức ăn cho một khu — cái máng, hay mặt nước của hồ.
 *
 * Khu cạn có đúng một cái máng nên không có gì phải chọn. Hồ thì cả chục ô
 * nước, nên chọn theo thứ tự: chỗ ĐANG có sẵn thức ăn (đổ thêm vào một mẻ chứ
 * đừng rải khắp hồ), rồi tới ô nước gần người chơi nhất — rắc ngay trước mặt
 * mình là thứ nhìn vào thấy đúng.
 */
export function pourSpotIn(
  state: GameState,
  content: Content,
  pen: PenDef,
): { x: number; y: number } | null {
  if (pen.map !== state.mapId) return null;
  if (!pen.swim) {
    for (let y = pen.y; y < pen.y + pen.h; y++)
      for (let x = pen.x; x < pen.x + pen.w; x++)
        if (tileAt(state, x, y)?.prop === "trough") return { x, y };
    return null;
  }
  const px = state.player.x / TILE;
  const py = state.player.y / TILE;
  let best: { x: number; y: number } | null = null;
  let bestD = Infinity;
  for (let y = pen.y; y < pen.y + pen.h; y++)
    for (let x = pen.x; x < pen.x + pen.w; x++) {
      if (tileAt(state, x, y)?.g !== "water") continue;
      if (troughStock(state, x, y) > 0 && troughStock(state, x, y) < troughMax(content))
        return { x, y };
      const d = Math.hypot(x + 0.5 - px, y + 0.5 - py);
      if (d < bestD) {
        bestD = d;
        best = { x, y };
      }
    }
  return best;
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
  if (!def?.feed.length) return false;

  const pen = penOf(content, cur);
  if (!pen || pen.map !== d.s.mapId) return false;
  const cx = Math.floor(cur.x / TILE);
  const cy = Math.floor(cur.y / TILE);
  /* Chỗ ăn GẦN NHẤT còn đồ, và đúng món loài này ăn được. Ô máng thì con vật
     đứng KỀ bên (máng là ô đặc); mẻ cám nổi trên mặt nước thì con cá bơi ĐÚNG
     LÊN ô đó. Cùng một hàm cho cả hai, khác nhau đúng ở tầm với. */
  const cho = feedSpotNear(d.s, pen, def.feed, cx, cy, pen.swim ? 0 : 1);
  if (!cho) return false;
  if (!botMotPhan(d, cho.x, cho.y)) return false;

  const e = dEntity(d, i);
  if (!e) return false;
  e.animal.fed = def.fedMinutes;
  e.animal.hungryDays = 0;
  return true;
}

/**
 * Ô CÓ ĐỒ ĂN gần nhất trong khu mà loài này ăn được, trong tầm `tam` ô.
 *
 * `tam = 1` cho khu cạn (đứng kề cái máng), `tam = 0` cho hồ (bơi đúng lên mẻ
 * cám). `tam = Infinity` khi cần tìm ĐÍCH để đi tới, không phải để ăn ngay.
 */
export function feedSpotNear(
  state: GameState,
  pen: PenDef,
  an: readonly string[],
  cx: number,
  cy: number,
  tam: number,
): { x: number; y: number } | null {
  if (pen.map !== state.mapId) return null;
  let best: { x: number; y: number } | null = null;
  let bestD = Infinity;
  for (let y = pen.y; y < pen.y + pen.h; y++)
    for (let x = pen.x; x < pen.x + pen.w; x++) {
      const mon = troughItem(state, x, y);
      // Loài này có ăn được đúng món ĐANG NẰM ĐÓ không. Trước đây chỉ hỏi khu
      // nhận những món gì, nên con heo vẫn nhắm vào cái máng đang đầy rơm.
      if (!mon || !an.includes(mon)) continue;
      const d = Math.max(Math.abs(x - cx), Math.abs(y - cy));
      if (d > tam) continue;
      if (d < bestD) {
        bestD = d;
        best = { x, y };
      }
    }
  return best;
}

/**
 * BỮA ĐÊM từ máng, chạy lúc sang ngày.
 *
 * Khác `eatFromTrough` ở đúng hai chỗ, và cả hai đều vì ban đêm không có khung
 * hình nào để mô phỏng:
 *
 *   · không đòi con vật ĐỨNG KỀ máng — cả một đêm trong khu thì nó tự tới được;
 *   · đọc lưới qua `MapView` chứ không qua `state.tiles`, nên khu nằm ở bản đồ
 *     nào cũng ăn được. Người chơi ngủ trong nhà thì bản đồ nông trại KHÔNG còn
 *     là bản đồ đang chơi, và bản cũ hỏi `troughIn(state, pen)` là hỏi nhầm lưới
 *     của cái nhà.
 *
 * Đây là đường sống của con vật có chuồng: nó KHÔNG bao giờ bị dời ra ngoài rào
 * đi kiếm ăn nữa (xem `grazeNight`), nên máng đầy hay không là quyết định thật
 * của người chơi.
 */
export function eatFromTroughNight(
  d: Draft,
  content: Content,
  v: MapView,
  i: number,
): boolean {
  const cur = d.s.entities[i];
  if (!cur || cur.kind !== "animal") return false;
  const def = content.animals[cur.def];
  if (!def?.feed.length) return false;

  const pen = penOf(content, cur);
  if (!pen || pen.map !== v.id || cur.map !== v.id) return false;

  for (let y = pen.y; y < pen.y + pen.h; y++) {
    for (let x = pen.x; x < pen.x + pen.w; x++) {
      const ti = y * v.w + x;
      const t = v.tiles[ti];
      if (!t) continue;
      if (t.prop !== "trough" && t.g !== "water") continue;
      const con = Number.isFinite(t.trough) && (t.trough as number) > 0 ? Math.floor(t.trough as number) : 0;
      if (con <= 0) continue;
      // Đúng MÓN loài này ăn được, không phải "khu này nhận những món gì".
      if (!t.troughId || !def.feed.includes(t.troughId)) continue;
      const m = v.edit(ti);
      if (!m) continue;
      m.trough = con - 1;
      if (m.trough <= 0) {
        delete m.trough;
        delete m.troughId;
      }
      const e = dEntity(d, i);
      if (!e) return false;
      e.animal.fed = def.fedMinutes;
      e.animal.hungryDays = 0;
      return true;
    }
  }
  return false;
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

  const an = content.animals[e.def]?.feed ?? [];
  // Chỗ có ĐÚNG MÓN nó ăn được, ở bất cứ đâu trong khu — cái máng, hay mẻ cám
  // vừa được rắc xuống mặt nước.
  const cho = hungry ? feedSpotNear(state, pen, an, cx, cy, Infinity) : null;

  /* ĐÓI mà không còn gì trong khu thì đừng gọi nó về: về tới nơi cũng không có
     gì ăn, mà đường về thì bỏ lại đúng vạt cỏ nó đang đứng. Trả null để nhánh
     tìm cỏ ở `actorStep` quyết định — đó mới là "tự về chuồng, vẫn ra ngoài gặm
     được", chứ không phải "về chuồng rồi chết đói cạnh cái máng rỗng". */
  if (hungry && !cho) return null;

  if (cho) {
    /* Hồ cá: bơi ĐÚNG LÊN mẻ cám. Khu cạn: cái máng là ô đặc nên phải đứng KỀ
       bên, và phải là ô trong ruột khu — đứng ngoài rào thì với không tới. */
    if (pen.swim) return cho;
    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const x = cho.x + (dx as number);
      const y = cho.y + (dy as number);
      if (x < pen.x || y < pen.y || x >= pen.x + pen.w || y >= pen.y + pen.h) continue;
      const t = tileAt(state, x, y);
      if (t && t.prop === null && !t.tilled) return { x, y };
    }
  }
  if (inside) return null;

  const k = Math.abs(e.seed | 0);
  return { x: pen.x + (k % pen.w), y: pen.y + (((k / 7) | 0) % pen.h) };
}

/**
 * Một ô để con vật đi loanh quanh TRONG KHU của nó.
 *
 * Vì sao phải có riêng hàm này thay vì dùng `wanderGoal` chung: `wanderGoal`
 * bốc một ô bất kỳ trong bán kính 4 quanh chỗ đang đứng, mà RUỘT CHUỒNG chỉ
 * cao 3 ô. Nghĩa là gần như lần nào nó cũng nhắm ra ngoài chuồng, rồi lách qua
 * cổng đi mất — và con vật no thì `penGoal` mới gọi về, nên cả đàn cứ ra vào
 * mãi và người chơi thấy chúng chạy tùm lum khắp nông trại dù chưa đói.
 *
 * Cổng là để NGƯỜI CHƠI đi vào và để con vật ĐÓI đi ra kiếm cỏ khi máng cạn,
 * không phải để cả đàn tự tản ra lúc còn no.
 *
 * Chọn theo hạt của chính con vật nên cả đàn không dồn hết vào một ô, và vẫn
 * tất định như mọi quyết định khác của thực thể.
 */
export function penWander(state: GameState, e: Entity, pen: PenDef): { x: number; y: number } {
  const cx = Math.floor(e.x / TILE);
  const cy = Math.floor(e.y / TILE);
  /* Bốn lần bốc rồi thôi: ruột chuồng lát bê tông sạch nên gần như ô nào cũng
     đứng được; bốc mãi cho tới khi trúng ô trống là mở cửa cho một vòng lặp
     không có trần trong trường hợp ai đó lấp kín cái chuồng. */
  let best = { x: cx, y: cy };
  for (let k = 0; k < 4; k++) {
    const n = (Math.abs(e.seed | 0) + k * 7919 + Math.floor(state.minutes)) >>> 0;
    const g = { x: pen.x + (n % pen.w), y: pen.y + (((n / 31) | 0) % pen.h) };
    best = g;
    const t = tileAt(state, g.x, g.y);
    if (t && t.prop === null) break;
  }
  return best;
}

/* ------------------------------------------------------------- cho cá ăn */

/**
 * Ô (x,y) có phải mặt nước của một KHU DƯỚI NƯỚC không — trả về khu đó.
 *
 * Cá không lên bờ được và cũng không đặt được cái máng giữa hồ, nên khu nước
 * là khu duy nhất cho ăn bằng cách ĐỨNG BỜ mà rắc xuống. Không có đường này
 * thì con cá là con vật duy nhất trong game mua về rồi không cho ăn được.
 */
export function pondAt(state: GameState, content: Content, x: number, y: number): PenDef | null {
  const pen = penAt(state, content, x, y);
  if (!pen?.swim || !(pen.feeds ?? []).length) return null;
  return tileAt(state, x, y)?.g === "water" ? pen : null;
}

/** Rắc được thức ăn đang cầm xuống mặt nước ở ô này không. */
export function canFeedPond(state: GameState, content: Content, x: number, y: number): boolean {
  const pen = pondAt(state, content, x, y);
  if (!pen) return false;
  const cam = selectedItemId(state.inv, state.sel);
  if (!cam || !(pen.feeds ?? []).includes(cam)) return false;
  if (troughStock(state, x, y) >= troughMax(content)) return false;
  const dang = troughItem(state, x, y);
  return dang === null || dang === cam;
}

/**
 * RẮC thức ăn xuống ô nước: mẻ cám NẰM LẠI trên mặt nước, và đàn cá tự bơi tới
 * ăn dần. Trả số phần đã rắc.
 *
 * Bản cũ làm con cá no ngay tức khắc, ở bất cứ đâu nó đang bơi, không cần lại
 * gần — tiện, nhưng nhìn vào thì chẳng có gì xảy ra cả: không thấy thức ăn,
 * không thấy con cá bơi tới, không thấy nó ăn. Cường bắt đúng chỗ đó.
 *
 * Giờ hồ cá dùng CHUNG luật với cái máng: có một chỗ chứa đồ ăn nhìn thấy được,
 * con vật đói tự tìm tới, ăn xong thì đồ ăn vơi đi. Một luật, hai kiểu khu.
 */
export function feedPond(d: Draft, content: Content, x: number, y: number): number {
  const pen = pondAt(d.s, content, x, y);
  if (!pen) return 0;
  const cam = selectedItemId(d.s.inv, d.s.sel);
  if (!cam || !(pen.feeds ?? []).includes(cam)) return 0;

  const dang = troughItem(d.s, x, y);
  if (dang !== null && dang !== cam) {
    toastText(d, `Chỗ này còn ${itemName(dang, content)} chưa ăn hết.`, "info");
    return 0;
  }
  const cho = troughMax(content) - troughStock(d.s, x, y);
  if (cho <= 0) {
    toastText(d, "Chỗ này đã đủ thức ăn.", "info");
    return 0;
  }
  const co = countItem(d.s.inv, cam);
  if (co <= 0) {
    toastText(d, `Không có ${itemName(cam, content)} trong túi.`, "bad");
    return 0;
  }
  const n = Math.min(cho, co);
  const left = removeItem(d.s.inv, cam, n);
  if (!left) return 0;
  setInv(d, left);

  const i = tileIndexAt(d.s, x, y);
  if (i < 0) return 0;
  const t = dTile(d, i);
  if (!t) return 0;
  t.trough = troughStock(d.s, x, y) + n;
  t.troughId = cam;
  toastText(d, `Rắc ${n} ${itemName(cam, content)} xuống hồ.`, "good");
  return n;
}
