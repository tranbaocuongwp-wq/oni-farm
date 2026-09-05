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
import { activeView, dEntities, dEntity, nextRandom, setEntities, touch } from "./state.ts";
import { blockedForActor, idx, TILE, tileAt } from "./world.ts";
import { findPath } from "./pathfind.ts";
import { workerStep } from "./workerai.ts";
import { vehicleStep } from "./vehicles.ts";
import { patrolCatch, isHungry } from "./animals.ts";
import { grazeHere, nearestGraze } from "./graze.ts";
import { eatFromTrough, penGoal, penOf, penWander } from "./pen.ts";

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

/**
 * Trần nút mở của A* cho thực thể.
 *
 * Phải PHỦ NỔI chính vùng nó được phép quét: vùng dây buộc 41×41 là 1681 ô, mà
 * trần cũ là 900 — nên một đường vòng dài (quanh ao, quanh dãy chuồng) cạn ngân
 * sách giữa chừng, trả `null`, và con vật đứng ngơ ở đầu kia hàng rào. Chi phí
 * vẫn là hằng số theo số con: `MAX_REPLANS_PER_STEP` mới là thứ chặn tổng.
 */
export const MAX_NODES_ACTOR = 2000;

/** Đường đi dài nhất giữ trong save. Cắt thì tới cuối tự tính lại. */
export const MAX_PATH = 64;

/**
 * Riêng XE thì dài hơn: chúng chạy men theo đường nhựa từ cổng bản đồ tới tận
 * bãi đậu trước kho — tuyến (30,36) → (42,5) dễ vượt 64 điểm. Cắt cụt thì xe
 * dừng giữa đường rồi tự lập lại, ăn thêm ngân sách A* của cả đàn vật nuôi.
 */
export const MAX_PATH_VEHICLE = 160;

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
): { speed: number; box: { w: number; h: number }; swims: boolean } | null {
  if (e.kind === "worker")
    return { speed: content.workers.speed, box: content.workers.box, swims: false };
  if (e.kind === "vehicle") {
    const v = content.vehicles[e.def];
    return v ? { speed: v.speed, box: v.box, swims: false } : null;
  }
  const def = animalDef(content, e.def);
  return def ? { speed: def.speed, box: def.box, swims: def.housing === "water" } : null;
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
  // Tra ĐÚNG bảng theo loại: vật nuôi ở `content.animals`, xe ở
  // `content.vehicles`. Chỉ hỏi bảng vật nuôi thì xe không bao giờ sinh được —
  // và lỗi đó lặng lẽ rơi về "thả thẳng con vật xuống", tức là mất luôn tính
  // năng giao hàng mà không có thông báo nào.
  const def =
    o.kind === "vehicle"
      ? (content.vehicles[o.def] ?? null)
      : animalDef(content, o.def);
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
    kind: o.kind ?? ("job" in def && def.job === "pest" ? "pest" : "animal"),
    def: o.def,
    map: o.map,
    x: o.x,
    y: o.y,
    dir: "down",
    anim: 0,
    seed: (r.seed ^ (id * 2654435761)) >>> 0,
    ai: { phase: "idle", until: 0, tx: -1, ty: -1, path: [], planAt: -999 },
    animal:
      "fedMinutes" in def
        ? { age: 0, fed: def.fedMinutes, hungryDays: 0, prod: def.products.map(() => 0) }
        : { age: 0, fed: 0, hungryDays: 0, prod: [] },
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

/** Bán kính con vật ĐỨNG LẠI khi người chơi tới gần, tính bằng ô.
 *  Rộng hơn tầm tương tác (`animalNear` dùng 1,4 ô) một chút, để lúc bấm được
 *  thì con vật đã đứng yên rồi chứ không phải đang nhích ra khỏi tầm. */
export const CALM_TILES = 2;

/**
 * Bán kính con vật bắt đầu DÈ CHỪNG — đi chậm dần lại vì thấy có người tới.
 *
 * Vì sao cần một vành thứ hai: chỉ có `CALM_TILES` thì luật là một cái công
 * tắc — ngoài hai ô con vật phóng đúng tốc độ, trong hai ô nó đứng phắt lại.
 * Người chơi đi tới thấy nó vẫn nhơn nhơn đi lại cho tới lúc bụp một cái đứng
 * im, và cảm giác đọc ra là "nó chẳng để ý gì tới mình". Con vật thật thì
 * NGẦN NGỪ trước đã: nghe tiếng chân là chậm lại, tới gần nữa mới dừng hẳn.
 *
 * Bốn ô rưỡi là quãng vừa đủ để cái chậm lại đó nhìn thấy được ở tốc độ đi bộ
 * mà không biến cả nông trại thành một vùng bất động quanh người chơi.
 */
export const WARY_TILES = 4.5;

/**
 * Hệ số tốc độ của con vật theo khoảng cách tới người chơi: 1 khi ở xa, giảm
 * dần trong vành dè chừng, 0 khi đã đứng hẳn lại.
 *
 * Không bao giờ trả về đúng 0 trong vành dè chừng — 0 là việc của
 * `calmedByPlayer`, và hai chỗ cùng quyết định "dừng" là hai chỗ để lệch nhau.
 */
export function warySpeedMul(s: GameState, content: Content, e: Entity): number {
  if (e.kind !== "animal") return 1;
  if (animalDef(content, e.def)?.job === "pest") return 1;
  if (e.map !== s.mapId) return 1;
  if (onFarmTile(s, e)) return 1; // đang đứng trên luống thì phải đi cho khuất, đừng chậm lại
  if (isHungry(e)) return 1; // ĐÓI thì cái bụng thắng sự dè chừng — xem `calmedByPlayer`
  const d = Math.hypot(e.x - s.player.x, e.y - s.player.y) / TILE;
  if (d >= WARY_TILES) return 1;
  if (d <= CALM_TILES) return 0.25;
  return 0.25 + 0.75 * ((d - CALM_TILES) / (WARY_TILES - CALM_TILES));
}

/**
 * Con vật này có đang đứng yên vì người chơi tới gần không?
 *
 * Lý do có hàm này: con bò đi lang thang liên tục, mà tầm với chỉ hơn một ô.
 * Người chơi nhắm vào nó, bấm, thì trong nửa giây giữa lúc nhắm và lúc tay chạm
 * tới, con bò đã nhích ra ngoài tầm — thao tác trượt, và trượt vì một lý do
 * không nhìn thấy được. Đứng lại khi có người tới là hành vi vừa tự nhiên vừa
 * sửa đúng chỗ đó.
 *
 * KHÔNG áp cho sâu bọ (chúng phải chạy), cho người làm thuê (đứng cạnh nhau mà
 * cả hai đứng đực ra thì việc không xong) và cho xe.
 */
export function calmedByPlayer(s: GameState, content: Content, e: Entity): boolean {
  if (e.kind !== "animal") return false;
  if (animalDef(content, e.def)?.job === "pest") return false;
  if (e.map !== s.mapId) return false;
  /* Đang đứng trên LUỐNG thì KHÔNG đứng lại — phải đi cho khuất.
     Nếu không thì cày ngay dưới chân con bò là nó đứng chết trên luống vừa
     cày: luật "tới gần thì đứng lại" giữ nó ở đúng chỗ nó không được ở, và
     người chơi phải đi vòng ra xa mới đuổi được nó đi. */
  if (onFarmTile(s, e)) return false;
  /* ĐÓI thì KHÔNG đứng lại. Người chơi vừa rắc cám ngay dưới chân mình rồi đứng
     đó xem — mà chỗ rắc thì lúc nào cũng nằm trong tầm dè chừng, nên con vật
     dừng lại cách mẻ cám một ô và không bao giờ tới. Đứng bên cái máng vừa đổ
     cũng y hệt. Cái bụng phải thắng sự dè chừng, đúng như ngoài đời. */
  if (isHungry(e)) return false;
  return Math.hypot(e.x - s.player.x, e.y - s.player.y) <= CALM_TILES * TILE;
}

/** Con vật này có đang đứng trên ô ĐÃ CÀY không. */
export function onFarmTile(s: GameState, e: Entity): boolean {
  const t = tileAt(s, Math.floor(e.x / TILE), Math.floor(e.y / TILE));
  return !!t?.tilled;
}

/**
 * Ô KHÔNG PHẢI RUỘNG gần nhất để con vật tránh ra, hoặc null.
 *
 * Quét vòng từ trong ra: con vật bị cày dưới chân chỉ cần bước ra khỏi luống,
 * không cần đi đâu xa — mà bước ngắn thì cũng đỡ giẫm thêm mấy ô khác.
 */
function offFarmGoal(
  s: GameState,
  content: Content,
  e: Entity,
  box: { w: number; h: number },
): { x: number; y: number } | null {
  const cx = Math.floor(e.x / TILE);
  const cy = Math.floor(e.y / TILE);
  for (let r = 1; r <= 6; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = cx + dx;
        const y = cy + dy;
        if (x < 1 || y < 1 || x >= s.w - 1 || y >= s.h - 1) continue;
        const t = tileAt(s, x, y);
        if (!t || t.tilled || t.crop) continue;
        if (blockedForActor(s, content, x * TILE + TILE / 2, y * TILE + TILE / 2, box.w, box.h, false))
          continue;
        return { x, y };
      }
  return null;
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

    /* Người chơi tới gần: ĐỨNG LẠI và NGƯỚC NHÌN.
       Phải xét TRƯỚC cái `continue` của "không có đường đi" bên dưới — con vật
       đang đứng yên chính là con hay bị bấm nhất, mà nó lại là con duy nhất
       không bao giờ chạy tới được nhánh này nếu xét sau.
       Giữ nguyên `path` thay vì xoá: xoá thì bước quyết định kế tiếp lại tính
       đường mới, và mỗi lần đi ngang qua chuồng là cả đàn tiêu sạch ngân sách
       A*. Giữ lại thì bước ra xa một cái là nó đi tiếp đúng chỗ đang đi. */
    if (calmedByPlayer(s, content, cur)) {
      /* Quay đầu nhìn là chi tiết rẻ nhất trong cả file mà đổi cảm giác nhiều
         nhất: tới gần con bò mà nó ngoái lại thì nó là một con vật; đứng trơ
         một hướng thì nó là hình dán. Suy thẳng từ vị trí người chơi nên vẫn
         tất định, không rút hạt ngẫu nhiên nào. */
      const look = dirOf(s.player.x - cur.x, s.player.y - cur.y, cur.dir);
      if (look !== cur.dir) {
        const m = dEntity(d, i);
        if (m) m.dir = look;
      }
      continue;
    }

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

    /* Chậm dần lại khi người chơi tới gần. Nhân vào BƯỚC chứ không vào `speed`
       của content: content nói con vật đi nhanh bao nhiêu, còn đây là chuyện
       nó đang dè chừng — hai thứ khác nhau, và trộn vào nhau thì mỗi lần chỉnh
       cân bằng lại phải nhớ trừ hao cho cái vành này. */
    const step = Math.min(len, def.speed * warySpeedMul(s, content, cur) * dt);
    const nx = cur.x + (dx / len) * step;
    const ny = cur.y + (dy / len) * step;
    let mx = cur.x;
    let my = cur.y;
    if (!blockedForActor(s, content, nx, cur.y, def.box.w, def.box.h, def.swims)) mx = nx;
    if (!blockedForActor(s, content, mx, ny, def.box.w, def.box.h, def.swims)) my = ny;

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

/**
 * Ô đích ngẫu nhiên quanh vị trí hiện tại, trong bán kính `r` ô.
 *
 * Thử vài lần để né RUỘNG. Không thử lại thì con bò cứ nhắm thẳng vào luống rau
 * mà đi, và tuy đường đi đã tránh ruộng thì cái ĐÍCH vẫn nằm giữa luống.
 */
function wanderGoal(e: Entity, s: GameState, r: number, avoidFarm: boolean): { x: number; y: number } {
  const cx = Math.floor(e.x / TILE);
  const cy = Math.floor(e.y / TILE);
  let best = { x: cx, y: cy };
  for (let k = 0; k < 4; k++) {
    const dx = Math.floor(roll(e) * (r * 2 + 1)) - r;
    const dy = Math.floor(roll(e) * (r * 2 + 1)) - r;
    const g = {
      x: Math.max(1, Math.min(s.w - 2, cx + dx)),
      y: Math.max(1, Math.min(s.h - 2, cy + dy)),
    };
    best = g;
    if (!avoidFarm) break;
    if (!s.tiles[g.y * s.w + g.x]?.tilled) break;
  }
  return best;
}

/**
 * Một bước quyết định cho MỌI thực thể của bản đồ đang chơi.
 *
 * Ngân sách tìm đường: mỗi bước chỉ `MAX_REPLANS_PER_STEP` con được gọi A*, và
 * lượt xoay vòng theo `planCursor`. Nhờ vậy chi phí A* là HẰNG SỐ theo số con —
 * 20 con hay 60 con thì vẫn ngần ấy lần tìm đường mỗi giây.
 */
export function actorStep(d: Draft, content: Content): void {
  if (!d.s.entities.length) return;

  // Chó bắt sâu bọ TRƯỚC khi ai kịp nghĩ: làm ở đây thì nó bắt được cả ban ngày
  // lúc đang đuổi, chứ không phải chỉ một lần lúc người chơi đi ngủ.
  // Đọc `d.s` SAU lời gọi này: bắt được con nào là draft đã thay mảng thực thể,
  // giữ tham chiếu cũ thì cả bước quyết định chạy trên danh sách đã lỗi thời.
  patrolCatch(d, content);
  const s = d.s;
  if (!s.entities.length) return;

  let budget = MAX_REPLANS_PER_STEP;
  const n = s.entities.length;
  const start = ((s.planCursor % n) + n) % n;

  for (let k = 0; k < n; k++) {
    /* Đọc LẠI mảng mỗi vòng: một lượt của actor có thể THÊM (xe thả con vật
       xuống) hoặc BỚT (xe ra khỏi bản đồ) phần tử, nên độ dài chốt từ đầu vòng
       lặp sẽ sai ngay sau đó. Không đọc lại thì `s.entities[i]` ra undefined và
       cả TICK ném lỗi — âm thầm cho tới đúng lúc chiếc xe đầu tiên rời đi. */
    const list = s.entities;
    if (!list.length) break;
    const i = (start + k) % list.length;
    const cur = list[i];
    if (!cur) continue;
    if (cur.map !== s.mapId) continue;
    const def = actorShape(content, cur);
    if (!def) continue;

    // Còn đường để đi thì cứ đi, không phải nghĩ gì.
    if (cur.ai.path.length) continue;
    // Người chơi đang đứng sát: đừng lập đường mới, để nó yên mà bấm.
    if (calmedByPlayer(s, content, cur)) continue;

    // Người làm thuê có bộ não riêng (workers.ts). Trả về true nghĩa là họ đã
    // tự lo xong lượt này — vật nuôi mới đi tiếp nhánh lang thang bên dưới.
    const budgetFn = () => budget > 0 && (budget--, true);
    if (cur.kind === "worker") {
      if (workerStep(d, content, i, budgetFn)) continue;
    }
    if (cur.kind === "vehicle") {
      if (vehicleStep(d, content, i, budgetFn)) continue;
    }

    const e = dEntity(d, i);
    if (!e) continue;

    // Đồng hồ giai đoạn: đứng nhai cỏ / ngủ thì đếm ngược ở đây.
    if (e.ai.until > 0) {
      e.ai.until = Math.max(0, e.ai.until - ACTOR_STEP_MINUTES);
      if (e.ai.until > 0) continue;
    }

    /* ĐỨNG TRÊN LUỐNG thì việc đầu tiên là đi ra — trước cả chuyện nghỉ ngơi
       hay gặm cỏ. Người chơi vừa cày ngay dưới chân nó, và một con bò đứng ì
       giữa luống mới cày là thứ nhìn thấy ngay và thấy là khó chịu. */
    if (cur.kind === "animal" && onFarmTile(s, cur)) {
      if (budget > 0 && s.minutes - e.ai.planAt >= REPLAN_COOLDOWN) {
        const shape = actorShape(content, cur);
        const ra = shape ? offFarmGoal(s, content, cur, shape.box) : null;
        if (ra) {
          e.ai.planAt = s.minutes;
          budget--;
          const px = Math.floor(e.x / TILE);
          const py = Math.floor(e.y / TILE);
          const p = findPath(s, content, px, py, new Set([idx(s.w, ra.x, ra.y)]), {
            maxNodes: MAX_NODES_ACTOR,
            box: shape!.box,
            swims: shape!.swims,
            // Cố ý KHÔNG `avoidFarm`: nó đang Ở TRONG ruộng, cấm đi qua ruộng
            // thì không có đường nào ra cả.
            leash: { x: px, y: py, r: 8 },
          });
          if (p && p.length) {
            e.ai.path = p.slice(0, MAX_PATH);
            e.ai.phase = "wander";
            e.ai.until = 0;
            continue;
          }
        }
      }
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

    // Vật nuôi tránh ruộng; sâu bọ thì KHÔNG — phá cây là việc của chúng.
    const neRuong = cur.kind === "animal";

    /* ĐÓI thì đi kiếm ăn, và đó là ưu tiên cao hơn mọi thứ khác.
       Đang đứng trên bãi cỏ rồi thì ăn luôn, khỏi lập đường. */
    const dinhDuong = cur.kind === "animal" ? animalDef(content, cur.def) : null;
    const doi = !!dinhDuong && dinhDuong.job !== "pest" && isHungry(cur);
    if (doi) {
      // Đứng sát MÁNG mà máng còn thức ăn thì ăn ngay — bữa chắc chắn, và no
      // HẲN. Xét trước cỏ: con vật đứng cạnh máng đầy mà vẫn cúi gặm cỏ là thứ
      // nhìn vào thấy sai ngay, và làm cái máng thành vô nghĩa.
      if (eatFromTrough(d, content, i)) continue;
      if (grazeHere(d, content, activeView(d), i)) continue;
    }

    /* Con chó ĐI TUẦN chứ không lang thang: nó nhắm thẳng vào con sâu bọ gần
       nhất. Không có cái này thì nó đi ngẫu nhiên trên bản đồ 40×30 và gần như
       không bao giờ đứng đủ gần con chuột nào để đuổi — nuôi chó thành ra vô
       nghĩa, đúng thứ người chơi sẽ nhận ra ngay sau vài đêm. */
    let g: { x: number; y: number } | null = null;

    /* VỀ KHU của mình. Hai vai:
         · đói + máng còn ăn → nhắm thẳng ô kề máng (bữa chắc chắn hơn đi tìm cỏ)
         · đang ở NGOÀI khu   → nhắm về ruột khu
       Rào có cổng nên đây là "tự về chuồng", không phải "bị nhốt": máng cạn thì
       nhánh tìm cỏ bên dưới vẫn dắt nó ra ngoài gặm như trước. */
    let khu = cur.kind === "animal" ? penOf(content, cur) : null;
    if (khu && khu.map !== s.mapId) khu = null;
    if (cur.kind === "animal") g = penGoal(s, content, cur, doi);

    /* Đói thì nhắm thẳng vào bãi cỏ gần nhất thay vì lang thang. Bán kính hẹp
       (8 ô) cho ban ngày: con vật đi trong vài phút game thì không thể băng cả
       nông trại, và quét rộng mỗi bước cho từng con là thứ giết fps trước tiên.
       Đêm thì `grazeNight` quét rộng hơn hẳn — cả một đêm thì nó đi được xa. */
    if (!g && doi && dinhDuong) {
      g = nearestGraze(s, content, dinhDuong, cur, 8);
    }

    if (!g && animalDef(content, cur.def)?.job === "patrol") {
      let bestD = Infinity;
      for (const p of s.entities) {
        if (p.map !== s.mapId || animalDef(content, p.def)?.job !== "pest") continue;
        const dd = Math.hypot(p.x - e.x, p.y - e.y);
        if (dd < bestD) {
          bestD = dd;
          g = { x: Math.floor(p.x / TILE), y: Math.floor(p.y / TILE) };
        }
      }
    }
    /* Loanh quanh TRONG KHU của mình. Tới đây nghĩa là con vật đã ở trong khu
       (`penGoal` trả null khi đã về tới) và không phải đi kiếm ăn — nên chỗ nó
       đi loanh quanh là ruột chuồng, không phải một hình vuông bán kính 4
       quanh chỗ đứng. Ruột chuồng cao đúng 3 ô, nên hình vuông ấy gần như lần
       nào cũng chỉ ra ngoài, và con vật lách qua cổng đi mất dù còn no. */
    if (!g && khu) g = penWander(s, cur, khu);
    if (!g) g = wanderGoal(e, s, 4, neRuong);
    e.ai.planAt = s.minutes;
    budget--;

    const cx = Math.floor(e.x / TILE);
    const cy = Math.floor(e.y / TILE);
    const path = findPath(s, content, cx, cy, new Set([idx(s.w, g.x, g.y)]), {
      maxNodes: MAX_NODES_ACTOR,
      box: def.box,
      swims: def.swims,
      // Chó đang đuổi thì được phép băng qua ruộng — đứng ngoài bờ nhìn con
      // chuột gặm cây thì tuần tra để làm gì.
      avoidFarm: neRuong && animalDef(content, cur.def)?.job !== "patrol",
      // Loài bơi bị nhốt trong cái ao của nó: bán kính nhỏ, không đi lang thang
      // sang ao khác qua đường bộ (mà nó cũng không đi bộ được).
      /* Dây buộc là HỘP quanh tâm, và ô XUẤT PHÁT không được kiểm — nên hộp
         phải chứa CẢ con vật lẫn đích, nếu không con bò đi lạc quá 20 ô sẽ
         không bao giờ tìm được đường về chuồng (mọi ô kề đều rơi ra ngoài hộp).

         Luật này áp cho MỌI đích, không riêng đường về khu. Trước đây chỉ nhánh
         "về khu" được nới, nên con chó đi tuần dính đúng cái bẫy ấy: hộp bán
         kính 20 quanh CHÍNH NÓ, mà bản đồ rộng 48 ô — con chuột ở nửa kia thì
         không có đường nào, và con chó đứng im. Nuôi chó thành ra vô nghĩa, còn
         `patrolCatch` thì chưa từng có một dòng test nào để lộ ra.

         Chỉ nhánh LANG THANG không đích mới giữ hộp nhỏ: đó mới là chỗ dây buộc
         thật sự có việc — giữ con vật khỏi đi lạc cả bản đồ. */
      leash: {
        x: Math.round((cx + g.x) / 2),
        y: Math.round((cy + g.y) / 2),
        r: Math.max(
          def.swims ? 6 : LEASH_TILES,
          Math.max(Math.abs(cx - g.x), Math.abs(cy - g.y)) / 2 + 6,
        ),
      },
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
    if (def.job === "pest") continue; // sâu bọ có vòng đời riêng, không đói không ra sản phẩm
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
    if (e.kind === "vehicle") {
      // Thiếu khối `veh` là xe hỏng — bỏ đi lúc migrate, nếu không save cũ sẽ
      // ném lỗi bất biến sau mỗi tick cho tới hết đời.
      if (!content.vehicles[e.def] || !e.veh) {
        dropped.push(e.def);
        return false;
      }
      return !!content.maps[e.map];
    }
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
