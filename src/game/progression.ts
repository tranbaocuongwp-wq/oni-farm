/* ============================================================================
   PROGRESSION — MỐC tiến độ và mục tiêu.

   KHÔNG còn mở khoá hàng hoá: cửa hàng bán mọi thứ ngay từ đầu, có tiền thì
   mua. Mốc ở đây chỉ ĐÁNH DẤU chặng đường và nói một câu chúc mừng. Bày ra
   bốn ô "??? chưa mở" là bày bốn lời hứa mà người chơi không làm gì được với
   chúng — thà cho họ nhìn thấy giá rồi tự quyết có đủ tiền hay không.

   Hàm THUẦN, không phụ thuộc draft: nhận state + content, trả về phần DELTA
   cần áp. Nhờ vậy không có vòng import với state.ts, và UI cũng gọi được để
   vẽ bảng mục tiêu / danh sách hàng bị khoá.

   Khoá `require` hiểu được: money, day, tilled, planted, watered, harvested,
   sold, earned, và built.<id>. Khoá lạ coi như KHÔNG bao giờ thoả (an toàn khi
   content mới dùng khoá core cũ chưa biết).
============================================================================ */

import type { Content, GameState, LogEntry, Requirement } from "./types.ts";

export interface ProgressionResult {
  stagesDone: string[];
  goalsDone: string[];
  toasts: { text: string; kind: LogEntry["kind"] }[];
}

/** Đọc một khoá thống kê. undefined = core không hiểu khoá này. */
export function statValue(state: GameState, key: string): number | undefined {
  switch (key) {
    case "money": return state.money;
    case "day": return state.day;
    case "tilled": return state.stats.tilled;
    case "planted": return state.stats.planted;
    case "watered": return state.stats.watered;
    case "harvested": return state.stats.harvested;
    case "sold": return state.stats.sold;
    case "earned": return state.stats.earned;
    case "cured": return state.stats.cured ?? 0;
    case "gathered": return state.stats.gathered ?? 0;
    default: break;
  }
  if (key.startsWith("built.")) return state.stats.built[key.slice(6)] ?? 0;
  return undefined;
}

export function meetsRequirement(state: GameState, req: Requirement): boolean {
  for (const [k, need] of Object.entries(req ?? {})) {
    const have = statValue(state, k);
    if (have === undefined) return false;
    if (have < need) return false;
  }
  return true;
}

/** Tiến độ 0..1 của một điều kiện — UI dùng để vẽ thanh mục tiêu. */
export function requirementProgress(state: GameState, req: Requirement): number {
  const entries = Object.entries(req ?? {});
  if (entries.length === 0) return 1;
  let sum = 0;
  for (const [k, need] of entries) {
    const have = statValue(state, k) ?? 0;
    sum += need <= 0 ? 1 : Math.min(1, have / need);
  }
  return sum / entries.length;
}

/** Tính phần mới đạt được. Trả null nếu không có gì mới (khỏi tạo rác). */
export function evaluateProgression(state: GameState, content: Content): ProgressionResult | null {
  const res: ProgressionResult = { stagesDone: [], goalsDone: [], toasts: [] };
  const doneStages = new Set(state.stagesDone);

  for (const st of content.stages) {
    if (doneStages.has(st.id)) continue;
    if (!meetsRequirement(state, st.require)) continue;
    res.stagesDone.push(st.id);
    if (st.toast) res.toasts.push({ text: st.toast, kind: "good" });
  }

  const doneGoals = new Set(state.goalsDone);
  for (const g of content.goals) {
    if (doneGoals.has(g.id)) continue;
    if (!meetsRequirement(state, g.require)) continue;
    res.goalsDone.push(g.id);
    res.toasts.push({ text: `✓ ${g.text}`, kind: "good" });
  }

  if (
    res.stagesDone.length === 0 &&
    res.goalsDone.length === 0 &&
    res.toasts.length === 0
  )
    return null;
  return res;
}

/** Mục tiêu tiếp theo chưa xong — UI hiện ở góc màn hình. */
export function nextGoal(state: GameState, content: Content): { id: string; text: string } | null {
  for (const g of content.goals) {
    if (state.goalsDone.includes(g.id)) continue;
    return { id: g.id, text: g.text };
  }
  return null;
}
