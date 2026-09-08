/* ============================================================================
   WORKERAI — bộ não của người làm thuê, chạy một lượt mỗi "bước quyết định".

   Tách khỏi `workers.ts` (luật thuê/lương/đổ hàng) và khỏi `entities.ts` (bộ
   máy di chuyển) vì ba thứ đó thay đổi vì ba lý do khác nhau: đổi lương là
   chỉnh cân bằng, đổi cách chọn việc là chỉnh AI, đổi cách nhích là chỉnh
   engine. Trộn chung thì mỗi lần chỉnh lương lại phải đọc lại cả A*.

   Máy trạng thái, cố ý bé:

       idle ──chọn việc──▶ walk ──tới nơi──▶ work ──xong──▶ idle
         │                                              │
         └──────────── mệt ──▶ rest ───────────────────┘

   `ai.phase` giữ trạng thái, `ai.tx/ty` giữ ô đang nhận làm, `ai.until` là đồng
   hồ đếm ngược. Tất cả nằm TRONG save — tải lại mà người làm quên mình đang đi
   đâu thì đó là một lỗi thấy được ngay.
============================================================================ */

import type { Content, Entity, GameState } from "./types.ts";
import type { Draft } from "./state.ts";
import { dEntity, dTile, randInt, toastKey, touch } from "./state.ts";
import { idx, TILE, tileIndexAt } from "./world.ts";
import { findPath } from "./pathfind.ts";
import { ACTOR_STEP_MINUTES, LEASH_TILES, MAX_NODES_ACTOR, MAX_PATH, dangNghi } from "./entities.ts";
import {
  atTile,
  wantOf,
  carried,
  dumpToStore,
  findStoreTile,
  giveToWorker,
  pickTask,
} from "./workers.ts";
import { animalNear, readyProduct } from "./animals.ts";
import { vongTuan } from "./entities.ts";
import { canPourFromStore, pourFromStore } from "./pen.ts";
import { weatherMood } from "./weather.ts";
import { cropInSeason, tileAllSeason } from "./season.ts";
import { isTillable } from "./world.ts";

/** Mỗi việc làm xong tốn ngần này PHÚT GAME — người làm không phải cái máy. */
export const WORK_MINUTES = 1.5;

/**
 * Một lượt của một người làm.
 *
 * `takeBudget()` xin một suất tìm đường; trả false nghĩa là lượt này đã hết
 * ngân sách A*, hãy đứng yên chờ lượt sau. Ngân sách nằm ở `entities.ts` và
 * dùng chung với vật nuôi — nhờ vậy tổng số lần A* mỗi giây là hằng số dù có
 * bao nhiêu actor.
 *
 * Trả true nghĩa là "đã xử lý xong lượt này".
 */
export function workerStep(
  d: Draft,
  content: Content,
  index: number,
  takeBudget: () => boolean,
): boolean {
  const cfg = content.workers;
  const e = dEntity(d, index);
  if (!e?.worker) return false;
  const w = e.worker;

  // ---- đang nghỉ / đang làm: đếm ngược rồi thôi -------------------------
  if (e.ai.until > 0) {
    e.ai.until = Math.max(0, e.ai.until - ACTOR_STEP_MINUTES);
    if (e.ai.until > 0) return true;

    if (e.ai.phase === "work") {
      doWork(d, content, index);
      e.ai.phase = "idle";
      e.ai.tx = -1;
      e.ai.ty = -1;
      return true;
    }
    if (e.ai.phase === "rest") {
      w.energy = cfg.energyMax;
      e.ai.phase = "idle";
      return true;
    }
  }

  /* ---- BÃO thì TRÚ ---------------------------------------------------------
     Cổng đứng TRƯỚC thang ưu tiên việc (`pickTask`), như nhánh nghỉ mệt — nên
     thang vẫn cố định và người chơi vẫn đoán được: trời bão (content `halt`)
     thì người làm về đứng ở ô giao nhận trước cửa kho (`tiles.dropoff`) và
     đứng đó cho tới sáng. Không hồi năng lượng (đó là việc của `rest`), không
     ghi sổ đen, không tốn ngân sách A* nếu đã tới nơi. Sang ngày `newDay` xoá
     `until`/`path` nên hết bão là tự về `idle`. */
  if (weatherMood(d.s, content).halt) {
    const o = content.tiles.dropoff;
    if (o && o.map === d.s.mapId) {
      if (atTile(e, o.x, o.y)) {
        e.ai.phase = "shelter";
        e.ai.until = 0.5;
        e.ai.path = [];
        e.ai.tx = -1;
        e.ai.ty = -1;
        return true;
      }
      if (e.ai.phase === "shelter" && e.ai.path.length) return true; // đang đi tới
      if (!takeBudget() || dangNghi(d.s.minutes, e.ai.planAt)) {
        e.ai.phase = "shelter";
        e.ai.until = 0.5;
        return true;
      }
      e.ai.planAt = d.s.minutes;
      const cx = Math.floor(e.x / TILE);
      const cy = Math.floor(e.y / TILE);
      const path = findPath(d.s, content, cx, cy, new Set([idx(d.s.w, o.x, o.y)]), {
        maxNodes: MAX_NODES_ACTOR,
        box: cfg.box,
        leash: {
          x: Math.round((cx + o.x) / 2),
          y: Math.round((cy + o.y) / 2),
          r: Math.max(LEASH_TILES, Math.max(Math.abs(cx - o.x), Math.abs(cy - o.y)) / 2 + 6),
        },
      });
      e.ai.phase = "shelter";
      e.ai.tx = -1;
      e.ai.ty = -1;
      e.ai.path = path && path.length ? path.slice(0, MAX_PATH) : [];
      if (!e.ai.path.length) e.ai.until = 2; // không có đường: đứng tại chỗ chờ
      return true;
    }
  }

  // ---- mệt thì nghỉ ------------------------------------------------------
  if (w.energy <= cfg.restBelow) {
    e.ai.phase = "rest";
    e.ai.until = cfg.restMinutes;
    e.ai.path = [];
    return true;
  }

  // ---- đang đi tới chỗ làm: tới nơi thì bắt tay vào ----------------------
  if (e.ai.phase === "walk" && e.ai.tx >= 0) {
    if (atTile(e, e.ai.tx, e.ai.ty)) {
      e.ai.phase = "work";
      e.ai.until = WORK_MINUTES;
      e.ai.path = [];
      return true;
    }
    /* Hết đường mà CHƯA TỚI: ghi ô này vào sổ đen rồi chọn việc khác.
       Đây là chỗ người làm hay đứng đơ nhất — `pickTask` luôn trả về ô gần
       nhất, mà nếu ô đó bị chắn thì lượt sau nó lại trả về đúng ô đó, mãi mãi.
       Bỏ hướng đó đi tìm hướng khác mới là thứ một người thật làm. */
    markBad(e, idx(d.s.w, e.ai.tx, e.ai.ty));
    e.ai.phase = "idle";
    e.ai.tx = -1;
    e.ai.ty = -1;
    return true;
  }

  // ---- chọn việc mới ----------------------------------------------------
  const task = pickTask(d.s, content, e);
  if (!task) {
    /* Hết việc RUỘNG. Đừng đứng đực: hỏi tiếp VIỆC VẶT (xem `idleTask`) — đi
       tuần, nói chuyện với đồng nghiệp, vuốt ve con vật, bốc xếp cho xe. Cường
       nói thẳng: "tránh tình trạng đứng im quá lâu quá nhiều".

       Chỉ khi cả việc vặt cũng không có mới nghỉ tay, và nghỉ NGẮN (1–2 phút
       game ≈ nửa giây thật) chứ không phải 2–6 phút như trước — hỏi lại sớm thì
       việc vừa xuất hiện được nhận ngay.

       Nhưng TRƯỚC HẾT hỏi một câu quan trọng hơn: có phải tôi rảnh VÌ THIẾU
       HÀNG không? Nếu đúng thì treo lời kêu — đó là thứ người chơi sửa được
       trong một phút, mà trước Đợt 22 không ai nói. */
    ganWant(d, content, index);
    return idleStep(d, content, index, takeBudget);
  }
  /* Có việc làm thì lời kêu cũ hết nghĩa — xoá ngay, đừng để cái chip ở HUD
     đứng lại sau khi người chơi đã bổ hàng. */
  xoaWant(d, index);

  /* ĐỨNG SẴN Ở ĐÓ thì làm luôn — không cần đường, không cần ngân sách. */
  if (atTile(e, task.tx, task.ty)) {
    e.ai.tx = task.tx;
    e.ai.ty = task.ty;
    e.ai.ent = task.ent;
    e.ai.job = task.kind;
    e.ai.phase = "work";
    e.ai.until = WORK_MINUTES;
    return true;
  }

  /* NGÂN SÁCH VÀ NGUỘI TRƯỚC, CHỐT VIỆC SAU. Thứ tự này là cả cái sửa.

     Bản cũ chốt `phase:"walk"` cùng `tx/ty` RỒI mới hỏi hai điều kiện này. Cả
     hai lối thoát sớm đều để lại `phase:"walk"` với `path` rỗng, nên bước quyết
     định kế tiếp rơi thẳng vào `markBad` ở đầu hàm — bôi đen một ô HOÀN TOÀN đi
     tới được, trong khi A* chưa từng được gọi lấy một lần.

     `MAX_REPLANS_PER_STEP = 2` dùng chung với cả đàn vật nuôi, nên nuôi càng
     nhiều thì người làm càng hay trượt lượt, và mỗi lần trượt lại mất thêm một
     ô tốt vào sổ đen (`MAX_BAD = 12`). Nhìn từ ngoài: người làm bỏ qua đúng
     những ô gần nhất rồi đứng thẫn thờ.

     Nhánh vật nuôi (`entities.ts`) vẫn luôn kiểm cả hai TRƯỚC khi chốt gì cả —
     đây chỉ là chép lại đúng thứ tự ấy. */
  if (!takeBudget() || dangNghi(d.s.minutes, e.ai.planAt)) {
    // Không đụng `tx/ty`, không đổi `phase`: lượt sau hỏi lại từ đầu.
    e.ai.phase = "idle";
    e.ai.until = ACTOR_STEP_MINUTES;
    return true;
  }
  e.ai.planAt = d.s.minutes;

  e.ai.tx = task.tx;
  e.ai.ty = task.ty;
  e.ai.ent = task.ent;
  e.ai.job = task.kind;
  e.ai.phase = "walk";

  const cx = Math.floor(e.x / TILE);
  const cy = Math.floor(e.y / TILE);
  // Đích là các ô KỀ ô việc, không phải chính ô đó: đứng cạnh mà làm, y như
  // người chơi phải đứng cạnh lô đất mới cày được.
  const goals = new Set<number>();
  for (const [dx, dy] of [
    [0, -1],
    [0, 1],
    [-1, 0],
    [1, 0],
    [0, 0],
  ] as [number, number][]) {
    const gx = task.tx + dx;
    const gy = task.ty + dy;
    if (gx < 0 || gy < 0 || gx >= d.s.w || gy >= d.s.h) continue;
    goals.add(idx(d.s.w, gx, gy));
  }

  /* Dây buộc phải ÔM CẢ HAI ĐẦU — y hệt nhánh vật nuôi, và vì đúng một lý do.

     Hộp bán kính 20 quanh CHÍNH NGƯỜI LÀM thì mọi ô của một lô ruộng ở nửa kia
     nông trại đều rơi ra ngoài, `findPath` trả null, và nhánh `else` ngay dưới
     ghi ô đó vào sổ đen. Đo trên trình duyệt thật: thuê người xong, 24 ô lúa
     chín, sổ đen leo lên đủ 12 ô trong mười giây rồi họ đứng im hẳn — mà đường
     đi thì có thật.

     Ô XUẤT PHÁT không được kiểm với dây buộc, nên hộp chỉ cần ôm được đích;
     nhưng ôm cả hai đầu mới cho A* chỗ mà vòng qua chướng ngại giữa đường. */
  const path = findPath(d.s, content, cx, cy, goals, {
    maxNodes: MAX_NODES_ACTOR,
    box: cfg.box,
    leash: {
      x: Math.round((cx + task.tx) / 2),
      y: Math.round((cy + task.ty) / 2),
      r: Math.max(
        LEASH_TILES,
        Math.max(Math.abs(cx - task.tx), Math.abs(cy - task.ty)) / 2 + 6,
      ),
    },
  });
  if (path && path.length) e.ai.path = path.slice(0, MAX_PATH);
  else {
    // A* không tìm ra đường: ghi sổ đen để lượt sau không chọn lại đúng ô này.
    markBad(e, idx(d.s.w, task.tx, task.ty));
    e.ai.phase = "idle";
    e.ai.tx = -1;
    e.ai.ty = -1;
    e.ai.until = 2;
  }
  return true;
}

/** Số ô tối đa giữ trong sổ đen. Nhỏ thôi: nó nằm trong save, và nhớ nhiều thì
 *  người làm bỏ qua cả những ô chỉ tình cờ bị chắn một lúc. */
const MAX_BAD = 12;

/** Ghi một ô là "không tới được" cho riêng người làm này. */
function markBad(e: { ai: { bad?: number[] } }, i: number): void {
  if (i < 0) return;
  const list = e.ai.bad ?? [];
  if (list.includes(i)) return;
  list.push(i);
  // Bỏ ô cũ nhất khi đầy — sổ đen là trí nhớ ngắn hạn, không phải bản đồ cấm.
  if (list.length > MAX_BAD) list.shift();
  e.ai.bad = list;
}

/**
 * Thực hiện việc đã tới nơi.
 *
 * Cố ý KHÔNG đi qua `useAt`: hàm đó đọc thứ NGƯỜI CHƠI đang cầm trong tay và
 * tiêu năng lượng của người chơi. Người làm có công cụ riêng và năng lượng
 * riêng, nên họ tác động thẳng lên ô — nhưng vẫn qua `dTile`, vẫn chịu kiểm
 * bất biến như mọi thay đổi khác.
 */
/* -------------------------------------------------------- lời kêu thiếu hàng */

/**
 * Treo lời kêu thiếu vật tư, và BÁO đúng một lần cho mỗi món.
 *
 * Tiết chế bằng chính NỘI DUNG lời kêu, không bằng đồng hồ: đã kêu đúng món ấy
 * rồi thì im tuyệt đối. Không nhắc lại mỗi sáng — dòng trên thẻ người làm và
 * cái chip ở HUD đã đứng sẵn đó, nhắc lại chỉ là rác. Nhờ vậy nó cũng tất định:
 * không một mốc thời gian thật nào tham gia, replay cùng chuỗi action cho ra
 * cùng dãy toast.
 */
function ganWant(d: Draft, content: Content, index: number): void {
  const mon = wantOf(d.s, content);
  if (!mon) {
    xoaWant(d, index);
    return;
  }
  if (d.s.entities[index]?.worker?.want?.id === mon) return; // đã kêu rồi, im
  const e = dEntity(d, index);
  if (!e?.worker) return;
  e.worker.want = { id: mon, day: d.s.day };
  toastKey(
    d,
    content,
    mon === "seed"
      ? "workerWantSeed"
      : mon === "item:medicine"
        ? "workerWantMedicine"
        : "workerWantFeed",
    "bad",
    e.worker.name,
  );
}

/** Hàng đã về (hoặc có việc để làm) → gỡ lời kêu. */
function xoaWant(d: Draft, index: number): void {
  if (!d.s.entities[index]?.worker?.want) return;
  const e = dEntity(d, index);
  if (e?.worker) delete e.worker.want;
}

/* ---------------------------------------------------------------- việc vặt */

/**
 * Nguội riêng cho ĐI TUẦN, tính bằng phút game. Bốn lần `REPLAN_COOLDOWN`.
 *
 * Vì sao phải có: ngân sách A* (`MAX_REPLANS_PER_STEP` = 2 mỗi bước) dùng CHUNG
 * cho cả đàn vật nuôi, xe và người làm. Trước Đợt 22, một người làm hết việc
 * đứng im 2–6 phút game và trong suốt thời gian đó **không tiêu một suất tìm
 * đường nào** — tức là cái "đứng ngơ" mà Cường ghét đang âm thầm trợ cấp ngân
 * sách cho đàn bò đi ăn. Cho họ đi tuần mà không đặt nguội riêng là lấy đúng
 * khoản trợ cấp ấy đi, và triệu chứng sẽ hiện ra ở chỗ không ai ngờ: con vật
 * chậm được ăn. Xem kịch bản "việc vặt KHÔNG làm vật nuôi đói".
 */
const PATROL_COOLDOWN = 8;

/** Một người làm khác đang rảnh, trong `r` ô. Gần nhất thắng; hoà thì id nhỏ thắng. */
function nguoiLamGan(s: GameState, e: Entity, r: number): Entity | null {
  let best: Entity | null = null;
  let bestD = Infinity;
  for (const o of s.entities) {
    if (o.id === e.id || o.map !== s.mapId || !o.worker) continue;
    const d = Math.hypot(o.x - e.x, o.y - e.y) / TILE;
    if (d > r || d > bestD) continue;
    if (d === bestD && best && o.id > best.id) continue;
    bestD = d;
    best = o;
  }
  return best;
}

/** Hướng nhìn từ (e) sang (o) — để hai người quay mặt vào nhau. */
function huongToi(e: Entity, o: { x: number; y: number }): Entity["dir"] {
  const dx = o.x - e.x;
  const dy = o.y - e.y;
  return Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? "right" : "left") : dy >= 0 ? "down" : "up";
}

/**
 * VIỆC VẶT — thứ người làm làm khi hết việc ruộng, thay cho đứng đực.
 *
 * Chia theo CHI PHÍ TÌM ĐƯỜNG, và đó là cả thiết kế:
 *
 *   · hạng RẺ (không một nút A* nào): nói chuyện · vuốt ve con vật · bốc xếp
 *     cho xe. Cả ba chỉ xảy ra khi đối tượng ĐÃ ở ngay cạnh — người làm quay
 *     mặt về phía đó rồi đứng làm, KHÔNG đi tới. Nhờ vậy chúng miễn phí y như
 *     bữa ăn của con vật, và không cướp nhịp của ai.
 *   · hạng ĐẮT (một nút A*): đi tuần. Phải qua `takeBudget()` **và** một cái
 *     nguội riêng rộng gấp bốn (`PATROL_COOLDOWN`).
 *
 * XÃ GIAO LÀ ĐƠN PHƯƠNG: mỗi người tự quyết, không ghi một byte nào lên người
 * kia. Nếu người kia cũng rảnh thì chính luật này khiến họ cũng quay lại nhìn —
 * hai người đứng nói chuyện với nhau mà không cần một dòng thương lượng nào.
 * Mọi cơ chế "A chọn B rồi đi tới B" đều đẻ ra hai bệnh: B đi mất giữa chừng
 * nên A tới nơi trơ trọi, hoặc A và B đổi chỗ cho nhau mãi.
 *
 * KHÔNG đặt `ai.tx/ty` cho ba việc hạng rẻ: `pickTask` lọc ô "đã có người nhận"
 * theo đúng hai trường ấy, nên một người đang đứng nói chuyện mà chiếm ô sẽ
 * khoá ô đó với đồng nghiệp. Và việc vặt KHÔNG BAO GIỜ ghi sổ đen — sổ đen chỉ
 * nhớ được 12 ô và nó nằm trong save, dành cho việc ruộng.
 *
 * Ngẫu nhiên chỉ rút từ `e.seed` (hạt riêng của từng người), không bao giờ đụng
 * `state.seed` — TICK phải sạch, xem kịch bản 55/56/60.
 */
function idleStep(
  d: Draft,
  content: Content,
  index: number,
  takeBudget: () => boolean,
): boolean {
  const s = d.s;
  const cur = s.entities[index]!;
  const e = dEntity(d, index);
  if (!e?.worker) return false;

  const nghi = (job: string, phut: number, dir?: Entity["dir"]) => {
    e.ai.phase = "chore";
    e.ai.job = job;
    e.ai.until = phut;
    e.ai.path = [];
    e.ai.tx = -1;
    e.ai.ty = -1;
    e.ai.ent = undefined;
    if (dir) e.dir = dir;
  };

  /* Trời mưa (content `shelter`) thì thôi đi tuần và thôi xã giao ngoài đồng —
     đứng tán gẫu dưới mưa nhìn ngu ngơ. Vẫn làm việc chính như thường. */
  const troi = weatherMood(s, content);

  // 1. XE đang đậu chờ ngay cạnh → bốc xếp.
  for (const v of s.entities) {
    if (v.map !== s.mapId || v.kind !== "vehicle" || v.ai.phase !== "wait") continue;
    if (Math.hypot(v.x - cur.x, v.y - cur.y) / TILE > 2) continue;
    nghi("unload", WORK_MINUTES * 2, huongToi(cur, v));
    return true;
  }

  /* 2–3. XÃ GIAO chỉ CHEN VÀO, không phải nết mặc định.

     Bản đầu cho xã giao đứng trước đi tuần, và hai người làm đứng cạnh nhau đã
     nói chuyện với nhau MÃI MÃI — đo được: 0 ô đi trong hơn ba phút game. Đó
     cũng là đứng im, chỉ khác bộ mặt. Nên: đi tuần là nền, xã giao rút thăm một
     phần tư số lượt. Xúc xắc lấy từ hạt RIÊNG của từng người nên vẫn tái lập
     được, và hai người cạnh nhau không bao giờ đồng pha. */
  const xt = randInt(e.seed, 0, 3);
  e.seed = xt.seed;
  if (xt.v === 0 && !troi.shelter) {
    // CON VẬT ngay cạnh → vuốt ve. (Chỉ diễn hoạt: không đổi một con số nào.)
    const an = animalNear(s, Math.floor(cur.x / TILE), Math.floor(cur.y / TILE), 1.5);
    if (an) {
      nghi("pet", WORK_MINUTES, huongToi(cur, an));
      return true;
    }
    // ĐỒNG NGHIỆP ngay cạnh → nói chuyện.
    const ban = nguoiLamGan(s, cur, 2);
    if (ban) {
      const r = randInt(e.seed, 3, 6);
      e.seed = r.seed;
      nghi("chat", r.v, huongToi(cur, ban));
      return true;
    }
  }

  /* 4. ĐI TUẦN một vòng nông trại — việc vặt DUY NHẤT tốn tìm đường, nên nó
     phải qua cả hai cổng. Trượt cổng thì nghỉ ngắn rồi hỏi lại, không sao. */
  const nguoi = randInt(e.seed, 1, 2);
  e.seed = nguoi.seed;
  if (troi.shelter || s.minutes - e.ai.planAt < PATROL_COOLDOWN || !takeBudget()) {
    e.ai.phase = "idle";
    e.ai.job = undefined;
    e.ai.until = nguoi.v;
    return true;
  }
  const chang = vongTuan(s, content);
  if (!chang.length) {
    e.ai.phase = "idle";
    e.ai.job = undefined;
    e.ai.until = nguoi.v;
    return true;
  }
  const k = Math.abs((s.actStep / 40) | 0) % chang.length;
  const g = chang[k]!;
  e.ai.planAt = s.minutes;
  const cx = Math.floor(cur.x / TILE);
  const cy = Math.floor(cur.y / TILE);
  const path = findPath(s, content, cx, cy, new Set([idx(s.w, g.x, g.y)]), {
    maxNodes: MAX_NODES_ACTOR,
    box: content.workers.box,
    leash: {
      x: Math.round((cx + g.x) / 2),
      y: Math.round((cy + g.y) / 2),
      r: Math.max(LEASH_TILES, Math.max(Math.abs(cx - g.x), Math.abs(cy - g.y)) / 2 + 6),
    },
  });
  e.ai.phase = "chore";
  e.ai.job = "patrol";
  e.ai.tx = -1;
  e.ai.ty = -1;
  e.ai.ent = undefined;
  // Không tới được thì thôi, KHÔNG ghi sổ đen: đi tuần không đáng một ô trí nhớ.
  e.ai.path = path && path.length ? path.slice(0, MAX_PATH) : [];
  if (!e.ai.path.length) e.ai.until = nguoi.v;
  return true;
}

function doWork(d: Draft, content: Content, index: number): void {
  const e = dEntity(d, index);
  if (!e?.worker) return;
  const w = e.worker;
  const cfg = content.workers;
  const { tx, ty } = e.ai;
  /* LOẠI VIỆC do `pickTask` giao, không phải do đây suy lại.

     Suy lại từ ô đích là cách cũ, và nó sai ở đúng chỗ đắt nhất: cái máng nằm
     giữa chuồng, quanh máng lúc nào cũng có con vật, nên nhánh "có con vật ở
     gần" nuốt mất mọi chuyến đi đổ máng. Save cũ không có trường này — rơi về
     lối suy cũ để họ vẫn làm được việc ngay khung hình đầu. */
  const viec = e.ai.job ?? null;

  const tieuSuc = () => {
    w.energy = Math.max(0, w.energy - cfg.energyPerTask);
  };
  const xong = () => {
    e.ai.job = undefined;
  };

  // ---- đổ hàng vào kho ---------------------------------------------------
  const kho = findStoreTile(d.s, content);
  if ((viec === "dump" || viec === null) && kho && kho.x === tx && kho.y === ty && carried(w) > 0) {
    dumpToStore(d, content, d.s.entities[index]!);
    xong();
    return;
  }

  // ---- ĐỔ MÁNG (xúc cám từ kho) ------------------------------------------
  if (viec === "pour" || (viec === null && canPourFromStore(d.s, content, tx, ty))) {
    if (canPourFromStore(d.s, content, tx, ty) && pourFromStore(d, content, tx, ty) > 0) tieuSuc();
    xong();
    return;
  }

  // ---- THU SẢN PHẨM của con vật ------------------------------------------
  if (viec === "gather" || viec === null) {
    /* Tra theo ID TRƯỚC. Con vật đã đi khỏi ô lúc `pickTask` ghi lại — hỏi
       "ô này có con nào không" với tầm 1,4 ô thì thường là không, và cả chuyến
       đi thành công cốc. Bán kính 2 ô cho lần tra theo id: đủ để bắt kịp một
       con vừa nhích đi, đủ hẹp để không vơ nhầm con khác. */
    const theoId =
      e.ai.ent !== undefined
        ? (d.s.entities.find((v) => v.id === e.ai.ent && v.map === d.s.mapId) ?? null)
        : null;
    const gan = theoId && Math.hypot(theoId.x - e.x, theoId.y - e.y) <= 2 * TILE ? theoId : null;
    const an = gan ?? animalNear(d.s, tx, ty);
    if (an) {
      const def = content.animals[an.def];
      const pi = def ? readyProduct(an, content) : -1;
      if (def && pi >= 0) {
        const p = def.products[pi]!;
        const r = randInt(d.s.seed, p.min, p.max);
        touch(d).seed = r.seed;
        /* Chỉ reset đồng hồ sản phẩm theo số THẬT SỰ nhận được. `giveToWorker`
           kẹp theo `carryMax`; bỏ giá trị trả về rồi vẫn reset là cách làm bốc
           hơi phần thừa. */
        const nhan = giveToWorker(d, content, index, p.id, Math.max(1, r.v));
        if (nhan <= 0) return; // không cầm được gì thì đừng cướp mất lứa sữa
        const ai = d.s.entities.indexOf(an);
        const m = dEntity(d, ai);
        if (m) m.animal.prod[pi] = 0;
        tieuSuc();
      }
      xong();
      return;
    }
    if (viec === "gather") {
      xong();
      return;
    }
  }

  // ---- việc trên MỘT Ô ---------------------------------------------------
  const ti = tileIndexAt(d.s, tx, ty);
  if (ti < 0) {
    xong();
    return;
  }
  const t = d.s.tiles[ti];
  if (!t) {
    xong();
    return;
  }
  xong();

  /* PHÁ MỘT VẬT THỂ. Hai việc, một khối:
       · `break` — kiếm gỗ đá, CHỈ trong rừng;
       · `clear` — dọn cỏ dại mọc lan vào LÔ RUỘNG, trả lại đất cày được.
     Thao tác y hệt nhau nên dùng chung khối này; khác nhau ở chỗ ĐƯỢC PHÉP
     đụng cái gì, và câu trả lời đó nằm ở `pickTask` (`donDuoc`). */
  if (viec === "break" || viec === "clear") {
    const def = t.prop ? content.props[t.prop] : null;
    if (!def?.hits) return;
    const m = dTile(d, ti);
    if (!m) return;
    const hp = (m.hp ?? def.hits) - 1;
    if (hp > 0) {
      m.hp = hp;
      tieuSuc();
      return;
    }
    for (const dr of def.drops ?? []) {
      const r = randInt(d.s.seed, dr.min, dr.max);
      touch(d).seed = r.seed;
      if (r.v > 0) giveToWorker(d, content, index, dr.id, r.v);
    }
    const m2 = dTile(d, ti);
    if (m2) {
      const sau = def.becomes ? (content.props[def.becomes] ?? null) : null;
      m2.prop = sau ? sau.id : null;
      m2.hp = sau ? Math.max(0, Math.floor(sau.hits ?? 0)) : 0;
    }
    tieuSuc();
    return;
  }

  // thu cây chín
  if (t.crop) {
    const cd = content.crops[t.crop.id];
    if (cd && t.crop.stage >= cd.growthDays.length) {
      const r = randInt(d.s.seed, cd.yieldMin, cd.yieldMax);
      touch(d).seed = r.seed;
      let n = Math.max(1, r.v);
      if (t.crop.sick) n = Math.max(1, Math.round(n * (content.balance.sickYieldMul ?? 0.5)));
      // Cùng lý do với nhánh vật nuôi: không cầm được thì đừng xoá cây.
      const nhan = giveToWorker(d, content, index, `crop:${t.crop.id}`, n);
      if (nhan <= 0) return;

      const m = dTile(d, ti);
      if (m?.crop) {
        if (cd.regrowDays) {
          m.crop.stage = Math.max(0, cd.growthDays.length - 1);
          m.crop.grow = 0;
          m.crop.regrown = true;
          delete m.crop.sick;
        } else {
          m.crop = null;
        }
      }
      tieuSuc();
      return;
    }
    // chữa cây bệnh bằng thuốc trong kho
    if (t.crop.sick) {
      const i = d.s.store.findIndex((v) => v && v.id === "item:medicine");
      if (i >= 0) {
        const store = d.s.store.slice();
        const cur = store[i]!;
        store[i] = cur.n > 1 ? { id: cur.id, n: cur.n - 1 } : null;
        touch(d).store = store;
        const m = dTile(d, ti);
        if (m?.crop) delete m.crop.sick;
        tieuSuc();
      }
      return;
    }
  }

  // tưới ô khô
  if (t.tilled && !t.wet) {
    const m = dTile(d, ti);
    if (m) m.wet = true;
    tieuSuc();
    return;
  }

  /* CÀY trong lô ruộng. Luật cũ cấm hẳn, vì "cày chỗ nào là quyết định bố cục
     của người chơi". Luật ấy đúng khi cả bản đồ đều cày được — nhưng từ khi có
     VÙNG, cuốc chỉ ăn trong `zones kind:"farm"`, và mấy cái lô ấy sinh ra chính
     là để trồng trọt. Cày trong lô không cướp quyền quy hoạch của ai cả; để đất
     lô nằm không mới là bỏ phí. Ngoài lô thì `isTillable` vẫn chặn. */
  if (viec === "till") {
    if (!isTillable(d.s, content, tx, ty)) return;
    const m = dTile(d, ti);
    if (!m) return;
    m.tilled = true;
    tieuSuc();
    return;
  }

  // GIEO hạt lấy từ KHO — người làm không có túi riêng để đi mua hạt.
  if (viec === "plant") {
    if (!t.tilled || t.crop || t.prop || t.b) return;
    /* Hạt phải ĐÚNG MÙA, và ô phải chịu được nó — cùng luật với người chơi
       (`useAt`), nếu không người làm gieo ra một luống héo ngay hôm sau. */
    const i = d.s.store.findIndex(
      (v) =>
        v &&
        v.id.startsWith("seed:") &&
        content.crops[v.id.slice(5)] &&
        (cropInSeason(v.id.slice(5), d.s.day, content) || tileAllSeason(t, content)),
    );
    if (i < 0) return;
    const store = d.s.store.slice();
    const cur = store[i]!;
    store[i] = cur.n > 1 ? { id: cur.id, n: cur.n - 1 } : null;
    touch(d).store = store;
    const m = dTile(d, ti);
    if (m) m.crop = { id: cur.id.slice(5), stage: 0, grow: 0, regrown: false };
    tieuSuc();
    return;
  }
}
