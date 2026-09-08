/* ============================================================================
   RUN — CHUYẾN CỦA MÓN ĐANG CẦM.

   Luật Cường đặt, nguyên văn: "đang chọn cái gì [ở hotbar] có thể làm được ở
   khu vực nào thì phải di chuyển về khu vực đó để tiến hành làm, lặp lại chuyện
   đó, không có tự ý thay đổi công cụ."

   Ba mệnh đề, và module này là chỗ giữ cả ba:

     · MÓN quyết định VIỆC và KHU. Cuốc → cày ở lô ruộng. Cám gà → đổ máng ở
       khu nào nhận cám gà. Rìu → chặt, và CHỈ trong rừng — cây trang trí ngoài
       sân không phải việc của một chuyến, chỉ chặt được khi ngắm thẳng vào.
     · LÀM GỌN TỪNG KHU. Khu đang dở còn việc thì làm cho hết rồi mới sang khu
       kế. Trước đây "ô gần nhất" luân phiên giữa hai lô kề nhau — trông đúng
       là lung tung, dù mỗi bước đều "gần nhất".
     · KHÔNG BAO GIỜ ĐỔI Ô HOTBAR. `slot` ghi lúc bắt đầu và mọi câu hỏi đều
       hỏi `canUseAt(…, slot)` — món ở ô đó hết (gieo hết hạt) là chuyến DỪNG,
       không tự cầm món khác.

   Thuần: không DOM, không nav. `main.ts` chỉ hỏi "làm gì tiếp" rồi đi/dùng.
   Nên test được trọn một chuyến trong Node.
============================================================================ */

import type { Content, GameState, PenDef, ZoneDef } from "./types.ts";
import { canUseAt, type UseKind } from "./actions.ts";
import { selectedItemId } from "./inventory.ts";
import { parseItem } from "./items.ts";
import { TILE, interactAt } from "./world.ts";
import { readyProduct } from "./animals.ts";

/** Việc một chuyến làm được. `gather` không phải `UseKind` — nó là thu sản
 *  phẩm con vật, `main.ts` gọi `tryAnimal` cho nó. */
export type RunJob = Exclude<UseKind, null | "build" | "lift" | "putdown"> | "gather";

/** Một KHU: một lô ruộng, một khu chuồng/ao, hay cả khu rừng. */
export interface RunArea {
  kind: "lot" | "pen" | "forest";
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Run {
  /** Việc chuyến này làm — theo thứ tự ưu tiên khi cùng một ô làm được nhiều việc. */
  jobs: RunJob[];
  /** Ô hotbar lúc bắt đầu. KHÔNG BAO GIỜ đổi. */
  slot: number;
  /** Món nằm ở ô đó lúc bắt đầu — đổi (hết hạt, hết cám) là chuyến dừng. */
  itemId: string | null;
  /** Nhãn cho nút và dải gợi ý: "CÀY", "ĐỔ MÁNG"… */
  label: string;
  /** Khu đang làm dở. `null` = chưa chọn. */
  area: RunArea | null;
}

export type RunTarget =
  | { x: number; y: number; job: RunJob; area: RunArea }
  | { refill: { x: number; y: number } }
  | { stop: "done" | "noItem" | "noEnergy" };

const LABEL: Record<RunJob, string> = {
  till: "CÀY",
  pull: "NHỔ",
  clear: "DỌN CỎ",
  plant: "GIEO",
  water: "TƯỚI",
  cure: "CHỮA",
  pour: "ĐỔ MÁNG",
  feedpond: "CHO CÁ ĂN",
  harvest: "THU",
  gather: "THU",
  chop: "CHẶT",
  mine: "ĐẬP",
};

/* ------------------------------------------------------------- khu vực */

function lotsOf(state: GameState, content: Content): RunArea[] {
  return (content.tiles.zones ?? [])
    .filter((z: ZoneDef) => z.kind === "farm" && z.map === state.mapId)
    .map((z) => ({ kind: "lot" as const, id: z.id, name: z.name, x: z.x, y: z.y, w: z.w, h: z.h }));
}

function forestOf(state: GameState, content: Content): RunArea[] {
  return (content.tiles.zones ?? [])
    .filter((z: ZoneDef) => z.kind === "forest" && z.map === state.mapId)
    .map((z) => ({ kind: "forest" as const, id: z.id, name: z.name, x: z.x, y: z.y, w: z.w, h: z.h }));
}

function pensOf(state: GameState, content: Content, feedId: string | null): RunArea[] {
  return (content.tiles.pens ?? [])
    .filter((p: PenDef) => p.map === state.mapId && (feedId === null || (p.feeds ?? []).includes(feedId)))
    .map((p) => ({ kind: "pen" as const, id: p.id, name: p.name, x: p.x, y: p.y, w: p.w, h: p.h }));
}

/** Khu này có phải chỗ (x,y) không — lề MỘT ô cho khu chuồng, vì máng nằm sát
 *  rào và người đứng ngoài rào vẫn đổ được. */
function chua(a: RunArea, x: number, y: number): boolean {
  const le = a.kind === "pen" ? 1 : 0;
  return x >= a.x - le && x < a.x + a.w + le && y >= a.y - le && y < a.y + a.h + le;
}

/* ------------------------------------------------------------- món → chuyến */

/**
 * Chuyến cho món đang cầm, hoặc `null` nếu món này không có chuyến nào (cầm
 * đá, cầm công trình — công trình đi chế độ xây).
 *
 * Danh sách KHU không nằm trong `Run` mà tính lại mỗi bước: content đổi qua
 * OTA giữa chừng thì bước sau đã đúng, không phải chờ chuyến mới.
 */
export function runFor(state: GameState, content: Content): Run | null {
  if (state.carry) return null;
  const slot = state.sel;
  const held = selectedItemId(state.inv, slot);
  const it = held ? parseItem(held) : null;
  const mk = (jobs: RunJob[]): Run => ({ jobs, slot, itemId: held, label: LABEL[jobs[0]!], area: null });

  // TAY KHÔNG: thu hoạch cây chín và thu sữa/trứng — hai việc không cần món.
  if (!it) return mk(["harvest", "gather"]);

  if (it.kind === "tool") {
    const t = content.tools[it.ref];
    if (!t) return null;
    if (t.action === "TILL") return mk(["till", "pull"]);
    if (t.action === "WATER") return mk(["water"]);
    if (t.action === "CHOP") return mk(["chop"]);
    if (t.action === "MINE") return mk(["mine"]);
    return null;
  }
  if (it.kind === "seed") return content.crops[it.ref] ? mk(["plant"]) : null;
  if (it.kind === "item" && it.ref === "medicine") return mk(["cure"]);
  // THỨC ĂN: bất cứ món nào một khu nào đó nhận — đọc từ `pens[].feeds`.
  if ((content.tiles.pens ?? []).some((p) => (p.feeds ?? []).includes(held!)))
    return mk(["pour", "feedpond"]);
  return null;
}

/** Khu nào chuyến này được tìm việc. */
export function areasFor(state: GameState, content: Content, run: Run): RunArea[] {
  const j = run.jobs[0];
  if (j === "chop" || j === "mine") return forestOf(state, content);
  if (j === "pour" || j === "feedpond") return pensOf(state, content, run.itemId);
  if (j === "harvest" || j === "gather") return [...lotsOf(state, content), ...pensOf(state, content, null)];
  return lotsOf(state, content);
}

/* ------------------------------------------------------------- ô kế tiếp */

interface UngVien {
  x: number;
  y: number;
  job: RunJob;
  d: number;
}

/** Mọi ô còn việc trong MỘT khu, cho đúng ô hotbar của chuyến. */
function ungVienTrong(state: GameState, content: Content, run: Run, a: RunArea): UngVien[] {
  const px = state.player.x / TILE - 0.5;
  const py = state.player.y / TILE - 0.5;
  const out: UngVien[] = [];
  const le = a.kind === "pen" ? 1 : 0;
  const x0 = Math.max(0, a.x - le);
  const y0 = Math.max(0, a.y - le);
  const x1 = Math.min(state.w - 1, a.x + a.w - 1 + le);
  const y1 = Math.min(state.h - 1, a.y + a.h - 1 + le);
  const muonGather = run.jobs.includes("gather");
  const jobsO = run.jobs.filter((j) => j !== "gather");
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      if (jobsO.length) {
        /* Bỏ qua tầm với, hỏi ĐÚNG ô hotbar của chuyến — không giả định món
           khác. Một ô làm được nhiều việc thì lấy việc đứng trước trong `jobs`. */
        const k = canUseAt(state, content, x, y, true, run.slot);
        if (k !== null && (jobsO as string[]).includes(k)) {
          out.push({ x, y, job: k as RunJob, d: Math.hypot(x - px, y - py) });
          continue;
        }
      }
    }
  if (muonGather) {
    for (const e of state.entities) {
      if (e.kind !== "animal" || e.map !== state.mapId) continue;
      const ex = Math.floor(e.x / TILE);
      const ey = Math.floor(e.y / TILE);
      if (!chua(a, ex, ey)) continue;
      if (readyProduct(e, content) < 0) continue;
      out.push({ x: ex, y: ey, job: "gather", d: Math.hypot(ex - px, ey - py) });
    }
  }
  return out;
}

function ganNhat(list: UngVien[]): UngVien | null {
  let best: UngVien | null = null;
  for (const u of list) if (!best || u.d < best.d) best = u;
  return best;
}

/** Chỗ MÚC NƯỚC gần nhất trên bản đồ (giếng, bờ ao). */
function choMuc(state: GameState, content: Content): { x: number; y: number } | null {
  let best: { x: number; y: number; d: number } | null = null;
  for (let y = 0; y < state.h; y++)
    for (let x = 0; x < state.w; x++) {
      if (interactAt(state, content, x, y) !== "REFILL") continue;
      const d = Math.hypot(x * TILE + TILE / 2 - state.player.x, y * TILE + TILE / 2 - state.player.y);
      if (!best || d < best.d) best = { x, y, d };
    }
  return best ? { x: best.x, y: best.y } : null;
}

/** Còn luống nào đã cày mà khô, trong các lô của bản đồ này không. */
function conLuongKho(state: GameState, areas: RunArea[]): boolean {
  for (const a of areas)
    for (let y = a.y; y < a.y + a.h; y++)
      for (let x = a.x; x < a.x + a.w; x++) {
        const t = state.tiles[y * state.w + x];
        if (t?.tilled && !t.wet) return true;
      }
  return false;
}

/**
 * Bước kế tiếp của chuyến — MỘT ô, và khu nó thuộc về.
 *
 * Thứ tự chọn khu:
 *   1. khu đang dở (`run.area`) còn việc → ô gần nhất TRONG khu đó;
 *   2. khu nhân vật đang đứng trong, nếu nó có việc;
 *   3. khu có ô việc gần nhất.
 * Trong khu thì thuần khoảng cách theo ô — không thưởng ô thẳng hàng.
 *
 * Người gọi ghi `area` trả về vào `run.area` để bước sau bám đúng khu.
 */
export function nextRunTarget(state: GameState, content: Content, run: Run): RunTarget {
  // Món ở ô hotbar đổi (hết hạt, hết cám, hay người chơi đảo balo) → dừng.
  const nay = state.inv[run.slot]?.id ?? null;
  if (nay !== run.itemId) return { stop: "noItem" };

  const cost = (content.balance.energyCost as unknown as Record<string, number | undefined>)[run.jobs[0]!] ?? 0;
  if (cost > 0 && state.energy < cost) return { stop: "noEnergy" };

  const areas = areasFor(state, content, run);

  /* BÌNH CẠN mà còn luống khô → đi múc rồi làm tiếp. Cùng một công cụ, không
     phải đổi tay — nên nó thuộc về chuyến. Hết luống khô thì chuyến XONG, không
     đi múc vô ích. */
  if (run.jobs[0] === "water" && state.water <= 0) {
    if (!conLuongKho(state, areas)) return { stop: "done" };
    const m = choMuc(state, content);
    return m ? { refill: m } : { stop: "done" };
  }

  // 1. khu đang dở
  if (run.area) {
    const a = areas.find((z) => z.id === run.area!.id) ?? null;
    if (a) {
      const u = ganNhat(ungVienTrong(state, content, run, a));
      if (u) return { x: u.x, y: u.y, job: u.job, area: a };
    }
  }
  // 2. khu đang đứng trong
  const px = Math.floor(state.player.x / TILE);
  const py = Math.floor(state.player.y / TILE);
  for (const a of areas) {
    if (!chua(a, px, py)) continue;
    const u = ganNhat(ungVienTrong(state, content, run, a));
    if (u) return { x: u.x, y: u.y, job: u.job, area: a };
  }
  // 3. khu có việc gần nhất
  let best: { u: UngVien; a: RunArea } | null = null;
  for (const a of areas) {
    const u = ganNhat(ungVienTrong(state, content, run, a));
    if (u && (!best || u.d < best.u.d)) best = { u, a };
  }
  if (best) return { x: best.u.x, y: best.u.y, job: best.u.job, area: best.a };
  return { stop: "done" };
}
