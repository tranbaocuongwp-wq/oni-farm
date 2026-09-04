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
    // hết đường mà chưa tới: bỏ việc này, chọn việc khác
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

  e.ai.tx = task.tx;
  e.ai.ty = task.ty;
  e.ai.phase = "walk";

  if (atTile(e, task.tx, task.ty)) {
    e.ai.phase = "work";
    e.ai.until = WORK_MINUTES;
    return true;
  }

  if (!takeBudget()) return true;
  if (d.s.minutes - e.ai.planAt < REPLAN_COOLDOWN) return true;
  e.ai.planAt = d.s.minutes;

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

  const path = findPath(d.s, content, cx, cy, goals, {
    maxNodes: MAX_NODES_ACTOR,
    box: cfg.box,
    leash: { x: cx, y: cy, r: LEASH_TILES },
  });
  if (path && path.length) e.ai.path = path.slice(0, MAX_PATH);
  else {
    // không tới được: bỏ việc này để lượt sau chọn việc khác
    e.ai.phase = "idle";
    e.ai.tx = -1;
    e.ai.ty = -1;
    e.ai.until = 2;
  }
  return true;
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
    dumpToStore(d, d.s.entities[index]!);
    return;
  }

  // ---- chăn nuôi ---------------------------------------------------------
  const an = animalNear(d.s, tx, ty);
  if (an) {
    const def = content.animals[an.def];
    const pi = def ? readyProduct(an, content) : -1;
    if (def && pi >= 0) {
      const p = def.products[pi]!;
      const r = randInt(d.s.seed, p.min, p.max);
      touch(d).seed = r.seed;
      const ai = d.s.entities.indexOf(an);
      const m = dEntity(d, ai);
      if (m) m.animal.prod[pi] = 0;
      giveToWorker(d, content, index, p.id, Math.max(1, r.v));
      tieuSuc();
      return;
    }
    if (def?.feed && an.animal.fed <= 0) {
      // Cho ăn bằng cỏ trong KHO — người làm không có túi riêng để mua thức ăn.
      const có = d.s.store.findIndex((v) => v && v.id === def.feed);
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
      giveToWorker(d, content, index, `crop:${t.crop.id}`, n);

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
