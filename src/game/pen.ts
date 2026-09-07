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
import { dEntity, dTile, setInv, toastText, touch } from "./state.ts";
import { countItem, removeItem, selectedItemId } from "./inventory.ts";
import { itemName, parseItem } from "./items.ts";
import { TILE, blockedForActor, penOfAnimal, tileAt, tileIndexAt } from "./world.ts";
import { actorShape } from "./entities.ts";

/* ============================================================================
   THỨC ĂN TÍNH BẰNG ĐIỂM.

   Luật Cường đặt: "thức ăn gì cũng được, thức ăn càng mắc thì no càng lâu,
   quản lý thức ăn bằng điểm; nhiều loại, cho vào chung máng cũng được, miễn sao
   tăng dung lượng máng lên."

   Bản cũ đếm PHẦN, và một phần làm no HẲN bất kể đó là bó rơm hay cân cám đắt
   gấp đôi — nên chọn thức ăn không phải là một quyết định, chỉ là chọn món nào
   sẵn có. Máng lại chỉ chứa được MỘT món, nên đổ nhầm là phải chờ ăn hết mới đổ
   tiếp được.

   Giờ máng là một cái BỂ ĐIỂM. Đổ gì vào cũng được, trộn thoải mái, và mỗi món
   góp số điểm theo GIÁ TRỊ của nó. Một bữa lấy `DIEM_MOT_BUA` điểm và làm no
   theo đúng số điểm lấy được — nên món mắc cho nhiều điểm hơn trên mỗi đơn vị,
   tức là mua một bao cám xịn thì cả chuồng no lâu hơn.
============================================================================ */

/** Trần sức chứa của máng, tính bằng ĐIỂM. */
export function troughMax(content: Content): number {
  return Math.max(1, Math.floor(content.balance.troughMax ?? 60));
}

/** Một bữa ăn lấy bấy nhiêu điểm (lấy ít hơn nếu máng gần cạn). */
export const DIEM_MOT_BUA = 4;

/** Mỗi điểm ăn được làm no bấy nhiêu phút game. */
export const PHUT_MOI_DIEM = 120;

/**
 * Một ĐƠN VỊ món này đáng bao nhiêu điểm thức ăn. 0 = không phải thức ăn.
 *
 * Suy từ GIÁ THỊ TRƯỜNG (giá mua nếu có, không thì giá bán) chứ không thêm một
 * bảng số mới: bảng số thứ hai là thứ sẽ trôi khỏi bảng thứ nhất ngay lần đầu
 * ai đó chỉnh giá qua OTA. Đo thử: cỏ khô 2 điểm, cám tổng hợp 3, thức ăn cá 4,
 * xà lách 6, cà phê 20 — mỗi đồng bỏ ra mua được xấp xỉ cùng số điểm, nên món
 * chuyên dụng vẫn là lựa chọn kinh tế còn nông sản là cách xoay xở lúc kẹt.
 *
 * ĂN ĐƯỢC GÌ: mọi NÔNG SẢN, cộng những vật tư mà một khu nào đó nhận. Gỗ, đá,
 * ống nước, thuốc thì không — chúng không nằm trong `feeds` của khu nào cả.
 */
export function diemThucAn(id: string, content: Content): number {
  const it = parseItem(id);
  if (!it) return 0;
  let gia = 0;
  if (it.kind === "crop") gia = content.crops[it.ref]?.sellPrice ?? 0;
  else if (it.kind === "item") {
    const laThucAn = (content.tiles.pens ?? []).some((p) => (p.feeds ?? []).includes(id));
    if (!laThucAn) return 0;
    const m = content.materials[it.ref];
    gia = m?.buyPrice ?? m?.sellPrice ?? 0;
  } else return 0;
  if (gia <= 0) return 0;
  return Math.max(1, Math.min(20, Math.round(gia / 5)));
}

/**
 * Số ĐIỂM thức ăn còn ở ô (x,y) — trong cái máng, hoặc đang NỔI trên mặt nước.
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
  if (tileAt(state, x, y)?.prop !== "trough") return false;
  if (!penAt(state, content, x, y)) return false;
  if (troughStock(state, x, y) >= troughMax(content)) return false;
  const cam = selectedItemId(state.inv, state.sel);
  /* MÓN NÀO CŨNG ĐƯỢC, và trộn chung được. Hai luật cũ đã bỏ: "phải nằm trong
     `feeds` của khu" và "máng chỉ chứa một món". Cái thứ hai từng buộc người
     chơi chờ đàn ăn hết mới đổ tiếp được món khác — một sự chờ đợi không dạy
     người ta điều gì. */
  return !!cam && diemThucAn(cam, content) > 0;
}

/**
 * Đổ thức ăn đang cầm vào máng ở ô (x,y). Trả số phần đã đổ.
 *
 * Đổ HẾT mức đổ được trong một lần bấm, chứ không một phần mỗi lần: máng chứa
 * mười hai phần thì bấm mười hai lần là mười hai lần chờ hết khoá thao tác, một
 * việc vặt không có quyết định nào bên trong.
 */
export function pourIntoTrough(d: Draft, content: Content, x: number, y: number, mon?: string): number {
  const feed = mon ?? selectedItemId(d.s.inv, d.s.sel);
  if (!feed) return 0;
  const moi = diemThucAn(feed, content);
  if (moi <= 0) {
    toastText(d, `${itemName(feed, content)} không phải thức ăn.`, "info");
    return 0;
  }
  const i = tileIndexAt(d.s, x, y);
  if (i < 0) return 0;

  const cho = troughMax(content) - troughStock(d.s, x, y);
  if (cho <= 0) {
    toastText(d, "Máng đã đầy.", "info");
    return 0;
  }
  const co = countItem(d.s.inv, feed);
  if (co <= 0) return 0;
  /* Đổ tối đa mức máng còn chứa nổi, tính theo ĐIỂM. Không đổ dư một đơn vị
     rồi vứt phần thừa: một bó rơm đổ vào cái máng gần đầy vẫn phải là một bó
     rơm mất đi và số điểm tương ứng thêm vào. */
  const n = Math.max(1, Math.min(co, Math.ceil(cho / moi)));
  const left = removeItem(d.s.inv, feed, n);
  if (!left) return 0;
  setInv(d, left);

  const t = dTile(d, i);
  if (!t) return 0;
  const them = Math.min(cho, n * moi);
  t.trough = troughStock(d.s, x, y) + them;
  // `troughId` giờ CHỈ để vẽ: món đổ gần nhất quyết định hình cái máng.
  t.troughId = feed;
  toastText(d, `Đổ ${n} ${itemName(feed, content)} — thêm ${them} điểm.`, "good");
  return them;
}

/** Món thức ăn RẺ NHẤT (theo điểm) đang có trong túi, hoặc null. */
export function reNhatTrongTui(state: GameState, content: Content): string | null {
  let ten: string | null = null;
  let re = Infinity;
  for (const o of state.inv) {
    if (!o) continue;
    const dm = diemThucAn(o.id, content);
    if (dm <= 0 || dm >= re) continue;
    re = dm;
    ten = o.id;
  }
  return ten;
}

/**
 * ĐỔ MÁNG cho NÚT BẢNG KHU: tự đi tìm thức ăn, không bắt cầm sẵn.
 *
 * Ba nguồn, theo thứ tự: món ĐANG CẦM (người chơi chọn nó là có ý), rồi món rẻ
 * nhất trong TÚI, rồi món rẻ nhất trong KHO. Trước đây nút này chỉ đổ được món
 * đang cầm, nên mở bảng khu ra là gặp một cái nút xám và một câu "cầm cỏ khô để
 * đổ" — tức là bảng bắt người chơi đóng nó lại, đi tìm đúng món, rồi mở lại.
 *
 * Rẻ trước là cố ý, cùng lý do như `pourFromStore`: cà phê trong kho là hàng để
 * bán, không phải cám.
 */
export function pourBest(d: Draft, content: Content, x: number, y: number): number {
  const cam = selectedItemId(d.s.inv, d.s.sel);
  if (cam && diemThucAn(cam, content) > 0) return pourIntoTrough(d, content, x, y, cam);
  const tui = reNhatTrongTui(d.s, content);
  if (tui) return pourIntoTrough(d, content, x, y, tui);
  const kho = pourFromStore(d, content, x, y);
  if (kho > 0) {
    toastText(d, `Lấy thức ăn từ kho — thêm ${kho} điểm.`, "good");
    return kho;
  }
  toastText(d, "Không còn thức ăn nào trong túi lẫn trong kho.", "info");
  return 0;
}

/**
 * ĐỔ VÀO MÁNG TỪ KHO — đường của NGƯỜI LÀM.
 *
 * Người làm không có túi riêng để đi chợ, họ lấy từ kho tập trung. Trước đây
 * họ đi thẳng tới con vật và bơm `fed = fedMinutes` vào nó, bỏ qua cái máng
 * hoàn toàn: người chơi đổ máng thì máng vơi, người làm cho ăn thì máng không
 * nhúc nhích, và hai cách cho ăn kể hai câu chuyện khác nhau về cùng một đàn.
 *
 * Giờ họ làm ĐÚNG việc người chơi làm: xúc cám từ kho, đổ vào máng, rồi con vật
 * tự tới ăn. Trả về số phần đã đổ.
 */
/**
 * Ô CHỨA THỨC ĂN của một khu — cái máng trên cạn, hoặc MẶT NƯỚC ở hồ cá.
 *
 * Hồ cá cố ý không có máng: thức ăn rắc thẳng xuống nước (xem `feedPond`). Nên
 * mọi phép hỏi "đổ được vào đây không" phải nhận cả hai kiểu, nếu không thì
 * người làm thuê đổ đầy được mọi cái máng trên nông trại mà đàn cá thì chết
 * đói ngay cạnh một kho đầy cám — đúng cảnh Cường gặp.
 */
function khuCuaOChua(state: GameState, content: Content, x: number, y: number): PenDef | null {
  const pen = penAt(state, content, x, y);
  if (!pen) return null;
  if (pen.swim) return tileAt(state, x, y)?.g === "water" ? pen : null;
  return tileAt(state, x, y)?.prop === "trough" ? pen : null;
}

/**
 * Món trong KHO mà khu này ăn được, RẺ NHẤT theo điểm.
 *
 * Rẻ nhất trước vì cỏ khô và cám sinh ra để làm việc này, còn cà phê trong kho
 * là hàng để bán. Không xếp thứ tự thì người làm sẽ đổ thứ đắt nhất vào máng
 * ngay lần đầu — một quyết định người chơi không hề ra, và không hoàn tác được.
 *
 * Lọc theo `pen.feeds` chứ không nhận mọi thứ có điểm: đàn cá không ăn cỏ khô,
 * và đổ cỏ khô xuống hồ là vừa phí kho vừa lấp mất chỗ của cám cá.
 */
function monReNhatTrongKho(
  state: GameState,
  content: Content,
  pen: PenDef,
  x: number,
  y: number,
): number {
  /* Đang có món gì trong đó thì ĐỔ THÊM ĐÚNG MÓN ẤY — bể điểm chỉ ghi được một
     tên món, trộn vào là cái tên kia biến mất khỏi thẻ khu. */
  const dang = troughItem(state, x, y);
  const nhan = dang !== null ? [dang] : (pen.feeds ?? []);
  let at = -1;
  let re = Infinity;
  for (let i = 0; i < state.store.length; i++) {
    const v = state.store[i];
    if (!v || !nhan.includes(v.id)) continue;
    const dm = diemThucAn(v.id, content);
    if (dm <= 0 || dm >= re) continue;
    re = dm;
    at = i;
  }
  return at;
}

export function canPourFromStore(state: GameState, content: Content, x: number, y: number): boolean {
  const pen = khuCuaOChua(state, content, x, y);
  if (!pen) return false;
  if (troughStock(state, x, y) >= troughMax(content)) return false;
  return monReNhatTrongKho(state, content, pen, x, y) >= 0;
}

export function pourFromStore(d: Draft, content: Content, x: number, y: number): number {
  const pen = khuCuaOChua(d.s, content, x, y);
  if (!pen) return 0;
  const cho = troughMax(content) - troughStock(d.s, x, y);
  if (cho <= 0) return 0;
  const at = monReNhatTrongKho(d.s, content, pen, x, y);
  if (at < 0) return 0;
  const o = d.s.store[at]!;
  const moi = diemThucAn(o.id, content);
  const n = Math.max(1, Math.min(o.n, Math.ceil(cho / moi)));
  const i = tileIndexAt(d.s, x, y);
  if (i < 0) return 0;
  const t = dTile(d, i);
  if (!t) return 0;
  const kho = d.s.store.slice();
  kho[at] = o.n > n ? { id: o.id, n: o.n - n } : null;
  touch(d).store = kho;
  const them = Math.min(cho, n * moi);
  t.trough = troughStock(d.s, x, y) + them;
  t.troughId = o.id;
  return them;
}

/**
 * ĂN MỘT BỮA ở ô (x,y): lấy tới `DIEM_MOT_BUA` điểm, trả về số điểm LẤY ĐƯỢC.
 *
 * Máng gần cạn thì bữa nhỏ hơn — và no ít hơn theo đúng tỉ lệ. Đó là chỗ hệ
 * điểm trả lời được câu mà hệ "phần" không trả lời nổi: một cái máng còn đúng
 * một chút đáy thì không thể làm no cả con bò.
 */
function anMotBua(d: Draft, x: number, y: number): number {
  const i = tileIndexAt(d.s, x, y);
  if (i < 0) return 0;
  const con = troughStock(d.s, x, y);
  if (con <= 0) return 0;
  const t = dTile(d, i);
  if (!t) return 0;
  const lay = Math.min(DIEM_MOT_BUA, con);
  t.trough = con - lay;
  if (t.trough <= 0) {
    delete t.trough;
    delete t.troughId;
  }
  return lay;
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
  const cho = feedSpotNear(d.s, pen, cx, cy, pen.swim ? 0 : 1);
  if (!cho) return false;
  const diem = anMotBua(d, cho.x, cho.y);
  if (diem <= 0) return false;

  const e = dEntity(d, i);
  if (!e) return false;
  /* NO THEO SỐ ĐIỂM ĂN ĐƯỢC, không phải no hẳn bất kể ăn gì. Kẹp ở `fedMinutes`
     để một bữa lớn không tích trữ vô hạn. */
  e.animal.fed = Math.min(def.fedMinutes, e.animal.fed + diem * PHUT_MOI_DIEM);
  e.animal.hungryDays = 0;
  return true;
}

/**
 * Ô CÓ ĐỒ ĂN gần nhất trong khu, trong tầm `tam` ô.
 *
 * `tam = 1` cho khu cạn (đứng kề cái máng), `tam = 0` cho hồ (bơi đúng lên mẻ
 * cám). `tam = Infinity` khi cần tìm ĐÍCH để đi tới, không phải để ăn ngay.
 */
export function feedSpotNear(
  state: GameState,
  pen: PenDef,
  cx: number,
  cy: number,
  tam: number,
): { x: number; y: number } | null {
  if (pen.map !== state.mapId) return null;
  let best: { x: number; y: number } | null = null;
  let bestD = Infinity;
  for (let y = pen.y; y < pen.y + pen.h; y++)
    for (let x = pen.x; x < pen.x + pen.w; x++) {
      /* Chỉ hỏi CÓ ĐIỂM KHÔNG. Từ khi máng là bể điểm trộn chung, "món đang
         nằm đó" không còn là một câu hỏi có nghĩa — mọi con trong khu ăn được
         mọi thứ trong cái máng của khu mình. */
      if (troughStock(state, x, y) <= 0) continue;
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
      const m = v.edit(ti);
      if (!m) continue;
      const lay = Math.min(DIEM_MOT_BUA, con);
      m.trough = con - lay;
      if (m.trough <= 0) {
        delete m.trough;
        delete m.troughId;
      }
      const e = dEntity(d, i);
      if (!e) return false;
      e.animal.fed = Math.min(def.fedMinutes, e.animal.fed + lay * PHUT_MOI_DIEM);
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

  // Chỗ CÒN ĐIỂM thức ăn, ở bất cứ đâu trong khu — cái máng, hay mẻ cám vừa
  // được rắc xuống mặt nước.
  const cho = hungry ? feedSpotNear(state, pen, cx, cy, Infinity) : null;

  /* ĐÓI mà không còn gì trong khu thì đừng gọi nó về: về tới nơi cũng không có
     gì ăn, mà đường về thì bỏ lại đúng vạt cỏ nó đang đứng. Trả null để nhánh
     tìm cỏ ở `actorStep` quyết định — đó mới là "tự về chuồng, vẫn ra ngoài gặm
     được", chứ không phải "về chuồng rồi chết đói cạnh cái máng rỗng". */
  if (hungry && !cho) return null;

  if (cho) {
    /* Hồ cá: bơi ĐÚNG LÊN mẻ cám. Khu cạn: cái máng là ô đặc nên phải đứng KỀ
       bên, và phải là ô trong ruột khu — đứng ngoài rào thì với không tới.

       Hai chuyện phải đúng ở đây, và trước đây sai cả hai:

       · Ô ấy phải ĐỨNG ĐƯỢC. Phép thử cũ chỉ hỏi `prop === null`, mà một CÔNG
         TRÌNH nằm ở `t.b` chứ không phải `t.prop` — vòi tưới thì `solid`. Người
         chơi xây một cái vòi ngay dưới máng là đích trở thành ô đặc, `findPath`
         trả null, và cả chuồng đứng chết đói cạnh máng đầy. Hỏi
         `blockedForActor` với đúng hộp của loài này thì mọi thứ đặc đều bị loại,
         hôm nay và cả về sau.
       · Phải lấy ô GẦN CON VẬT NHẤT. Vòng cũ trả về ô ĐẦU TIÊN của một danh
         sách cố định — luôn là ô ngay dưới máng. Ô đó hỏng thì bảy ô còn lại
         không bao giờ được xét, dù chúng trống trơn. */
    if (pen.swim) return cho;
    const shape = actorShape(content, e);
    const box = shape?.box ?? { w: 12, h: 9 };
    let best: { x: number; y: number; d: number } | null = null;
    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const x = cho.x + (dx as number);
      const y = cho.y + (dy as number);
      if (x < pen.x || y < pen.y || x >= pen.x + pen.w || y >= pen.y + pen.h) continue;
      const t = tileAt(state, x, y);
      if (!t || t.tilled) continue;
      if (blockedForActor(state, content, (x + 0.5) * TILE, (y + 0.5) * TILE, box.w, box.h, !!shape?.swims))
        continue;
      const d2 = Math.hypot(x - cx, y - cy);
      if (!best || d2 < best.d) best = { x, y, d: d2 };
    }
    if (best) return { x: best.x, y: best.y };
  }
  if (inside) return null;

  /* THẢ RÔNG thì khu chỉ là CHỖ ĂN, không phải chỗ phải về.
     Gà vịt và con chó khai `housing: "free"` — mà bản cũ vẫn lôi chúng về khu
     mỗi khi không đói, tức là "thả rông" chỉ có trên giấy. Với con chó thì tệ
     hơn hẳn: nhánh này chạy TRƯỚC nhánh đi tuần, nên nó bỏ con chuột giữa ruộng
     mà đi về chuồng bò. */
  if (content.animals[e.def]?.housing === "free") return null;

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
    /* `actStep`, KHÔNG PHẢI `minutes`.

       `runActorSteps` chạy bù các bước quyết định SAU khi `minutes` đã cộng
       trọn `dt`, nên tại thời điểm bước thứ k chạy thì `minutes` là một số thực
       khác nhau ở 30fps và 120fps — `Math.floor` ra số khác, và con vật đi lang
       thang sang ô khác. Đó là nguồn ngẫu nhiên DUY NHẤT trong đường TICK không
       đi qua hạt riêng của con vật, và nó trái đúng LUẬT 2 ghi ở đầu
       `entities.ts`. Kịch bản 55/56 không bắt được vì chúng replay cùng một
       chuỗi `dt`.

       `actStep` là số nguyên suy từ `floor(minutes / ACTOR_STEP_MINUTES)` và
       chính là thứ đếm các bước quyết định — tất định theo định nghĩa. */
    const n = (Math.abs(e.seed | 0) + k * 7919 + (state.actStep | 0)) >>> 0;
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
  if (!cam || diemThucAn(cam, content) <= 0) return false;
  return troughStock(state, x, y) < troughMax(content);
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
  if (!cam) return 0;
  const moi = diemThucAn(cam, content);
  if (moi <= 0) {
    toastText(d, `${itemName(cam, content)} không phải thức ăn.`, "info");
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
  const n = Math.max(1, Math.min(co, Math.ceil(cho / moi)));
  const left = removeItem(d.s.inv, cam, n);
  if (!left) return 0;
  setInv(d, left);

  const i = tileIndexAt(d.s, x, y);
  if (i < 0) return 0;
  const t = dTile(d, i);
  if (!t) return 0;
  const them = Math.min(cho, n * moi);
  t.trough = troughStock(d.s, x, y) + them;
  t.troughId = cam;
  toastText(d, `Rắc ${n} ${itemName(cam, content)} — thêm ${them} điểm.`, "good");
  return them;
}
