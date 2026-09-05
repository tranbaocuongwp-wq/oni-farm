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

import type { Content } from "./types.ts";
import type { Draft } from "./state.ts";
import { dEntity, dTile, randInt, touch } from "./state.ts";
import { idx, TILE, tileIndexAt } from "./world.ts";
import { findPath } from "./pathfind.ts";
import { LEASH_TILES, MAX_NODES_ACTOR, MAX_PATH, REPLAN_COOLDOWN } from "./entities.ts";
import {
  atTile,
  carried,
  dumpToStore,
  findStoreTile,
  giveToWorker,
  pickTask,
  tileTakenBy,
} from "./workers.ts";
import { animalNear, readyProduct } from "./animals.ts";

/** Mỗi việc làm xong tốn ngần này PHÚT GAME — người làm không phải cái máy. */
const WORK_MINUTES = 1.5;

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
    e.ai.until = Math.max(0, e.ai.until - 0.5);
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
    if (e.ai.path.length) return true; // còn đường thì cứ đi
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
    // Không có việc: nghỉ tay một lát rồi hỏi lại. Đứng im hẳn thì trông như
    // treo máy; hỏi lại mỗi bước thì tốn quét vô ích.
    const r = randInt(e.seed, 2, 6);
    e.seed = r.seed;
    e.ai.phase = "idle";
    e.ai.until = r.v;
    return true;
  }
  if (tileTakenBy(d.s, task.tx, task.ty, e.id)) {
    e.ai.until = 1;
    return true;
  }

  /* ĐỨNG SẴN Ở ĐÓ thì làm luôn — không cần đường, không cần ngân sách. */
  if (atTile(e, task.tx, task.ty)) {
    e.ai.tx = task.tx;
    e.ai.ty = task.ty;
    e.ai.ent = task.ent;
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
  if (!takeBudget() || d.s.minutes - e.ai.planAt < REPLAN_COOLDOWN) {
    // Không đụng `tx/ty`, không đổi `phase`: lượt sau hỏi lại từ đầu.
    e.ai.phase = "idle";
    e.ai.until = 0.5;
    return true;
  }
  e.ai.planAt = d.s.minutes;

  e.ai.tx = task.tx;
  e.ai.ty = task.ty;
  e.ai.ent = task.ent;
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
function doWork(d: Draft, content: Content, index: number): void {
  const e = dEntity(d, index);
  if (!e?.worker) return;
  const w = e.worker;
  const cfg = content.workers;
  const { tx, ty } = e.ai;

  const tieuSuc = () => {
    w.energy = Math.max(0, w.energy - cfg.energyPerTask);
  };

  // ---- đổ hàng vào kho ---------------------------------------------------
  const kho = findStoreTile(d.s, content);
  if (kho && kho.x === tx && kho.y === ty && carried(w) > 0) {
    dumpToStore(d, content, d.s.entities[index]!);
    return;
  }

  /* ---- chăn nuôi ---------------------------------------------------------
     Tra theo ID TRƯỚC. Con vật đã đi khỏi ô lúc `pickTask` ghi lại — hỏi
     "ô này có con nào không" với tầm 1,4 ô thì thường là không, và cả chuyến đi
     thành công cốc. Bán kính 2 ô cho lần tra theo id: đủ để bắt kịp một con vừa
     nhích đi, đủ hẹp để không vơ nhầm con khác. */
  const theoId =
    e.ai.ent !== undefined
      ? (d.s.entities.find((v) => v.id === e.ai.ent && v.map === d.s.mapId) ?? null)
      : null;
  const gan =
    theoId && Math.hypot(theoId.x - e.x, theoId.y - e.y) <= 2 * TILE ? theoId : null;
  const an = gan ?? animalNear(d.s, tx, ty);
  if (an) {
    const def = content.animals[an.def];
    const pi = def ? readyProduct(an, content) : -1;
    if (def && pi >= 0) {
      const p = def.products[pi]!;
      const r = randInt(d.s.seed, p.min, p.max);
      touch(d).seed = r.seed;
      /* Chỉ reset đồng hồ sản phẩm theo số THẬT SỰ nhận được.
         `giveToWorker` kẹp theo `carryMax`; bỏ giá trị trả về rồi vẫn reset là
         cách làm bốc hơi phần thừa. `pickTask` đã chặn từ trước bằng cách không
         nhận việc khi chỗ trống < `p.max`, nên tới đây gần như luôn nhận đủ —
         dòng này là lớp chắn thứ hai, cho trường hợp tay đầy giữa chừng. */
      const nhan = giveToWorker(d, content, index, p.id, Math.max(1, r.v));
      if (nhan <= 0) return; // không cầm được gì thì đừng cướp mất lứa sữa
      const ai = d.s.entities.indexOf(an);
      const m = dEntity(d, ai);
      if (m) m.animal.prod[pi] = 0;
      tieuSuc();
      return;
    }
    if (def?.feed.length && an.animal.fed <= 0) {
      /* Cho ăn bằng đồ trong KHO — người làm không có túi riêng để đi mua.
         Lấy MÓN NÀO CÓ: từ khi mỗi loài ăn được vài món, khoá cứng vào một
         món nghĩa là kho đầy cám mà người làm vẫn đứng nhìn con bò nhịn. */
      const có = d.s.store.findIndex((v) => v && def.feed.includes(v.id));
      if (có >= 0) {
        const store = d.s.store.slice();
        const cur = store[có]!;
        store[có] = cur.n > 1 ? { id: cur.id, n: cur.n - 1 } : null;
        touch(d).store = store;
        const ai = d.s.entities.indexOf(an);
        const m = dEntity(d, ai);
        if (m) {
          m.animal.fed = def.fedMinutes;
          m.animal.hungryDays = 0;
        }
        tieuSuc();
      }
      return;
    }
    return;
  }

  // ---- việc trên ruộng ---------------------------------------------------
  const ti = tileIndexAt(d.s, tx, ty);
  if (ti < 0) return;
  const t = d.s.tiles[ti];
  if (!t) return;

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
  }
}
