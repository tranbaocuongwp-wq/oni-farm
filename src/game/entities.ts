/* ============================================================================
   ENTITIES — mọi thứ TỰ DI CHUYỂN: vật nuôi, sâu bọ, (sau này) người làm, xe.

   Hai luật quyết định toàn bộ file này, và cả hai đều là để giữ TÍNH TẤT ĐỊNH —
   thứ mà save, replay và toàn bộ bộ test sim đang dựa vào.

   LUẬT 1 — `state.seed` là BẤT KHẢ XÂM PHẠM trong đường TICK.
   Trước khi có thực thể, TICK không rút một hạt ngẫu nhiên nào; seed chỉ bị rút
   theo SỰ KIỆN (sang ngày, thu hoạch, mua bán). Phải giữ nguyên như thế. Nếu 20
   con vật cùng rút seed toàn cục mỗi khung hình thì SỐ LẦN rút phụ thuộc số
   khung hình — mà số khung hình phụ thuộc fps, phụ thuộc cả việc có mở modal
   hay không. Bất biến "cùng seed + cùng chuỗi action = state y hệt" vỡ ngay, mà
   vỡ âm thầm.
   → Mỗi con mang `seed` riêng, advance cục bộ. Hạt ban đầu rút từ `state.seed`
     đúng một lần lúc SINH RA, và việc sinh ra luôn là một action — tức ngẫu
     nhiên theo sự kiện, đúng khuôn cũ.
   Kịch bản sim 55 canh cửa đúng chỗ này: chạy vài nghìn TICK rồi so `state.seed`.

   LUẬT 2 — DI CHUYỂN mỗi khung hình, QUYẾT ĐỊNH theo nhịp giờ game.
   Nhích theo đường đi thì làm mỗi khung hình (mượt, thuần, không rút số nào).
   Còn *chọn làm gì* thì chỉ chạy mỗi `ACTOR_STEP_MINUTES` phút game. Số bước là
   hàm của `state.minutes`, mà `minutes` là hàm của tổng `dt` đã dispatch — nên
   replay cùng chuỗi action cho cùng số bước, bất kể máy chạy 30 hay 120 fps.
   Đếm bằng CHỈ SỐ NGUYÊN (`actStep`) chứ không phải bộ tích luỹ float, để không
   trôi qua save/load.
============================================================================ */

import type { AnimalDef, Content, Dir, Entity, GameState } from "./types.ts";
import type { Draft } from "./state.ts";
import { dEntities, dEntity, nextRandom, setEntities, touch } from "./state.ts";
import { blockedAtBox, idx, TILE } from "./world.ts";
import { findPath } from "./pathfind.ts";
import { workerStep } from "./workerai.ts";

/** Trần số thực thể. Đủ cho một nông trại đông đúc, đủ thấp để 64 phép so mỗi
 *  khung hình vẫn rẻ hơn một lần `blockedAt`. */
export const MAX_ENTITIES = 64;

/** Một "bước quyết định" = nửa phút game (≈0,25 giây thật ở nhịp mặc định). */
export const ACTOR_STEP_MINUTES = 0.5;

/** Trần số bước bù trong MỘT lần TICK — chặn treo sau `replace`/migrate khi
 *  `minutes` nhảy vọt. */
export const MAX_STEPS_PER_TICK = 8;

/** Mỗi bước chỉ ngần này con được tính đường mới, xoay vòng theo `planCursor`.
 *  Nhờ vậy chi phí A* là HẰNG SỐ, không phụ thuộc số con vật. */
export const MAX_REPLANS_PER_STEP = 2;

/** Trần nút mở của A* cho thực thể — thấp hơn hẳn của người chơi. */
export const MAX_NODES_ACTOR = 900;

/** Đường đi dài nhất giữ trong save. Cắt thì tới cuối tự tính lại. */
export const MAX_PATH = 64;

/** Chỉ tìm đường trong bán kính này quanh mốc — một con kẹt góc không được
 *  phép quét cả bản đồ. */
export const LEASH_TILES = 20;

/** Nguội giữa hai lần tính đường của CÙNG một con, tính bằng phút game. */
export const REPLAN_COOLDOWN = 2;

export function animalDef(content: Content, id: string): AnimalDef | null {
  return content.animals[id] ?? null;
}

/** Tốc độ và hộp va chạm của MỘT actor bất kỳ — vật nuôi tra `content.animals`,
 *  người làm thuê tra `content.workers`. Một chỗ hỏi, hai bảng trả lời. */
export function actorShape(
  content: Content,
  e: Entity,
): { speed: number; box: { w: number; h: number } } | null {
  if (e.kind === "worker") return { speed: content.workers.speed, box: content.workers.box };
  const def = animalDef(content, e.def);
  return def ? { speed: def.speed, box: def.box } : null;
}

/** Thực thể trên bản đồ ĐANG chơi. Mọi vòng lặp trong TICK phải đi qua đây. */
export function activeEntities(s: GameState): Entity[] {
  return s.entities.filter((e) => e.map === s.mapId);
}

export function entityById(s: GameState, id: number): Entity | null {
  return s.entities.find((e) => e.id === id) ?? null;
}

/** Thực thể đứng trên ô (x,y) của bản đồ đang chơi. */
export function entityAt(s: GameState, x: number, y: number): Entity | null {
  for (const e of s.entities) {
    if (e.map !== s.mapId) continue;
    if (Math.floor(e.x / TILE) === x && Math.floor(e.y / TILE) === y) return e;
  }
  return null;
}

/** Có con nào đang đứng đè lên ô này không — dùng để CẤM xây đè lên con vật. */
export function anyEntityOverlapsTile(s: GameState, x: number, y: number): boolean {
  return entityAt(s, x, y) !== null;
}

/* ------------------------------------------------------------------- sinh */

export interface SpawnOptions {
  def: string;
  map: string;
  x: number;
  y: number;
  kind?: Entity["kind"];
}

/**
 * Thêm một thực thể. Trả id, hoặc null nếu content không có loài đó / đã chạm
 * trần. Hạt ngẫu nhiên lấy từ `state.seed` một lần duy nhất ở đây — sinh ra
 * luôn là một ACTION, nên đây là ngẫu nhiên theo sự kiện, không phải theo khung
 * hình.
 */
export function spawnEntity(d: Draft, content: Content, o: SpawnOptions): number | null {
  const def = animalDef(content, o.def);
  if (!def) return null;
  if (d.s.entities.length >= MAX_ENTITIES) return null;

  const s = touch(d);
  const id = s.entSeq + 1;
  s.entSeq = id;
  // Hạt ban đầu rút từ `state.seed` — đây là một ACTION nên rút ở đây là ngẫu
  // nhiên theo SỰ KIỆN, đúng khuôn cũ. Từ giây này trở đi con vật chỉ dùng hạt
  // riêng của nó và không đụng `state.seed` nữa.
  //
  // (Cố ý KHÔNG import `core/rng.ts`: chiều phụ thuộc là core → game, một
  //  chiều. `game/` chỉ được phép biết đúng `core/version.ts`.)
  const r = nextRandom(s.seed);
  s.seed = r.seed;

  const e: Entity = {
    id,
    kind: o.kind ?? (def.job === "pest" ? "pest" : "animal"),
    def: o.def,
    map: o.map,
    x: o.x,
    y: o.y,
    dir: "down",
    anim: 0,
    seed: (r.seed ^ (id * 2654435761)) >>> 0,
    ai: { phase: "idle", until: 0, tx: -1, ty: -1, path: [], planAt: -999 },
    animal: {
      age: 0,
      fed: def.fedMinutes,
      hungryDays: 0,
      prod: def.products.map(() => 0),
    },
  };
  setEntities(d, [...s.entities, e]);
  return id;
}

export function removeEntity(d: Draft, id: number): boolean {
  const i = d.s.entities.findIndex((e) => e.id === id);
  if (i < 0) return false;
  const list = d.s.entities.slice();
  list.splice(i, 1);
  setEntities(d, list);
  return true;
}

/* ------------------------------------------------------------- di chuyển */

function dirOf(dx: number, dy: number, cur: Dir): Dir {
  if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) return cur;
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? "right" : "left";
  return dy > 0 ? "down" : "up";
}

/**
 * Nhích mọi thực thể của bản đồ ĐANG chơi theo đường đi của chúng.
 *
 * Chạy mỗi khung hình và KHÔNG rút một hạt ngẫu nhiên nào — đó là điều kiện để
 * luật 1 đứng vững. Va chạm tách theo trục X rồi Y y hệt `movePlayer`, nên con
 * vật trượt dọc tường thay vì dính góc, và tuyệt đối không lọt vào ô đặc (bất
 * biến `checkInvariants` sẽ ném lỗi nếu lọt).
 */
export function moveActors(d: Draft, content: Content, dt: number): void {
  if (!(dt > 0)) return;
  const s = d.s;
  for (let i = 0; i < s.entities.length; i++) {
    const cur = s.entities[i]!;
    if (cur.map !== s.mapId) continue;
    if (!cur.ai.path.length) continue;

    const def = actorShape(content, cur);
    if (!def) continue;

    const target = cur.ai.path[0]!;
    const tx = (target % s.w) * TILE + TILE / 2;
    const ty = ((target / s.w) | 0) * TILE + TILE / 2;
    const dx = tx - cur.x;
    const dy = ty - cur.y;
    const len = Math.hypot(dx, dy);

    const e = dEntity(d, i);
    if (!e) continue;

    if (len < 1.5) {
      // tới điểm mốc: bỏ nó đi, khung hình sau đi tiếp điểm kế
      e.ai.path = e.ai.path.slice(1);
      e.x = tx;
      e.y = ty;
      continue;
    }

    const step = Math.min(len, def.speed * dt);
    const nx = cur.x + (dx / len) * step;
    const ny = cur.y + (dy / len) * step;
    let mx = cur.x;
    let my = cur.y;
    if (!blockedAtBox(s, content, nx, cur.y, def.box.w, def.box.h)) mx = nx;
    if (!blockedAtBox(s, content, mx, ny, def.box.w, def.box.h)) my = ny;

    if (mx === cur.x && my === cur.y) {
      // Kẹt: bỏ đường, bước quyết định kế tiếp sẽ tính lại. Không cố dí vào
      // tường mãi như bản đầu của bấm-để-đi từng làm.
      e.ai.path = [];
      continue;
    }
    e.x = mx;
    e.y = my;
    e.dir = dirOf(mx - cur.x, my - cur.y, cur.dir);
    e.anim = cur.anim + dt;
  }
}

/* --------------------------------------------------------- ngẫu nhiên cục bộ */

/** Rút một số [0,1) từ hạt RIÊNG của con vật và ghi hạt mới vào chính nó.
 *  Không bao giờ đụng `state.seed`. */
function roll(e: Entity): number {
  const r = nextRandom(e.seed);
  e.seed = r.seed;
  return r.v;
}

/* ------------------------------------------------------------ bước quyết định */

/** Ô đích ngẫu nhiên quanh vị trí hiện tại, trong bán kính `r` ô. */
function wanderGoal(e: Entity, s: GameState, r: number): { x: number; y: number } {
  const cx = Math.floor(e.x / TILE);
  const cy = Math.floor(e.y / TILE);
  const dx = Math.floor(roll(e) * (r * 2 + 1)) - r;
  const dy = Math.floor(roll(e) * (r * 2 + 1)) - r;
  return {
    x: Math.max(1, Math.min(s.w - 2, cx + dx)),
    y: Math.max(1, Math.min(s.h - 2, cy + dy)),
  };
}

/**
 * Một bước quyết định cho MỌI thực thể của bản đồ đang chơi.
 *
 * Ngân sách tìm đường: mỗi bước chỉ `MAX_REPLANS_PER_STEP` con được gọi A*, và
 * lượt xoay vòng theo `planCursor`. Nhờ vậy chi phí A* là HẰNG SỐ theo số con —
 * 20 con hay 60 con thì vẫn ngần ấy lần tìm đường mỗi giây.
 */
export function actorStep(d: Draft, content: Content): void {
  const s = d.s;
  if (!s.entities.length) return;

  let budget = MAX_REPLANS_PER_STEP;
  const n = s.entities.length;
  const start = ((s.planCursor % n) + n) % n;

  for (let k = 0; k < n; k++) {
    const i = (start + k) % n;
    const cur = s.entities[i]!;
    if (cur.map !== s.mapId) continue;
    const def = actorShape(content, cur);
    if (!def) continue;

    // Còn đường để đi thì cứ đi, không phải nghĩ gì.
    if (cur.ai.path.length) continue;

    // Người làm thuê có bộ não riêng (workers.ts). Trả về true nghĩa là họ đã
    // tự lo xong lượt này — vật nuôi mới đi tiếp nhánh lang thang bên dưới.
    if (cur.kind === "worker") {
      if (workerStep(d, content, i, () => budget > 0 && (budget--, true))) continue;
    }

    const e = dEntity(d, i);
    if (!e) continue;

    // Đồng hồ giai đoạn: đứng nhai cỏ / ngủ thì đếm ngược ở đây.
    if (e.ai.until > 0) {
      e.ai.until = Math.max(0, e.ai.until - ACTOR_STEP_MINUTES);
      if (e.ai.until > 0) continue;
    }

    // Hết việc: đứng nghỉ một lát rồi mới lang thang tiếp — con vật đứng yên
    // gặm cỏ nhìn tự nhiên hơn hẳn con vật chạy không ngừng.
    if (roll(e) < 0.45) {
      e.ai.phase = "idle";
      e.ai.until = 1 + roll(e) * 3;
      continue;
    }

    if (budget <= 0) continue;
    if (s.minutes - e.ai.planAt < REPLAN_COOLDOWN) continue;

    const g = wanderGoal(e, s, 4);
    e.ai.planAt = s.minutes;
    budget--;

    const cx = Math.floor(e.x / TILE);
    const cy = Math.floor(e.y / TILE);
    const path = findPath(s, content, cx, cy, new Set([idx(s.w, g.x, g.y)]), {
      maxNodes: MAX_NODES_ACTOR,
      box: def.box,
      leash: { x: cx, y: cy, r: LEASH_TILES },
    });
    if (path && path.length) {
      e.ai.path = path.slice(0, MAX_PATH);
      e.ai.phase = "wander";
    } else {
      e.ai.phase = "idle";
      e.ai.until = 1 + roll(e) * 2;
    }
  }

  touch(d).planCursor = (start + MAX_REPLANS_PER_STEP) % Math.max(1, n);
}

/**
 * Chạy đủ số bước quyết định còn thiếu. Gọi từ TICK sau khi `minutes` đã cộng.
 *
 * Số bước suy ra từ `minutes` chứ không tích luỹ `dt`, nên nó chỉ phụ thuộc
 * TỔNG thời gian game đã trôi — không phụ thuộc fps, không trôi qua save.
 */
export function runActorSteps(d: Draft, content: Content): void {
  const want = Math.floor(d.s.minutes / ACTOR_STEP_MINUTES);
  let n = 0;
  while (d.s.actStep < want && n < MAX_STEPS_PER_TICK) {
    actorStep(d, content);
    touch(d).actStep = d.s.actStep + 1;
    n++;
  }
  // Nhảy vọt (nạp save, migrate, DEBUG sang ngày): đồng bộ thẳng, đừng chạy bù
  // hàng nghìn bước.
  if (d.s.actStep < want) touch(d).actStep = want;
  if (d.s.actStep > want) touch(d).actStep = want;
}

/* ------------------------------------------------------------- cộng bù */

/**
 * Cộng bù ĐỒNG HỒ cho thực thể trên một bản đồ vắng mặt.
 *
 * Chỉ đồng hồ, KHÔNG BAO GIỜ vị trí. Con bò trong chuồng vẫn phải đói và vẫn ra
 * sữa khi người chơi đang ở trong nhà, nhưng mô phỏng đường đi của nó lúc không
 * ai nhìn thì vừa đắt vừa vô nghĩa. Đúng cùng cách `growCropsIn` đang làm cho
 * cây trồng: chỉ cộng cái cộng được bằng số học.
 */
export function catchUpEntities(
  d: Draft,
  content: Content,
  mapId: string,
  minutes: number,
): void {
  if (!(minutes > 0)) return;
  for (let i = 0; i < d.s.entities.length; i++) {
    const cur = d.s.entities[i]!;
    if (cur.map !== mapId) continue;
    const def = animalDef(content, cur.def);
    if (!def) continue;
    const e = dEntity(d, i);
    if (!e) continue;
    e.animal.fed = Math.max(0, e.animal.fed - minutes);
    for (let j = 0; j < e.animal.prod.length; j++) e.animal.prod[j] = (e.animal.prod[j] ?? 0) + minutes;
  }
}

/** Bỏ mọi thực thể có `def` hoặc `map` không còn trong content. Dùng khi migrate. */
export function pruneEntities(list: Entity[], content: Content): { list: Entity[]; dropped: string[] } {
  const dropped: string[] = [];
  const out = list.filter((e) => {
    // Người làm thuê không nằm trong bảng loài — họ có bảng cấu hình riêng, nên
    // đừng đem `content.animals` ra hỏi rồi xoá sạch họ lúc cập nhật content.
    if (e.kind !== "worker" && !content.animals[e.def]) {
      dropped.push(e.def);
      return false;
    }
    if (!content.maps[e.map]) {
      dropped.push(e.def);
      return false;
    }
    return true;
  });
  return { list: out, dropped };
}

/** Dọn danh sách sau khi số lượng vượt trần (content đổi, save lạ). */
export function capEntities(list: Entity[]): Entity[] {
  return list.length <= MAX_ENTITIES ? list : list.slice(0, MAX_ENTITIES);
}

export { dEntities };
