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

import type { Content, GameState, LogEntry, Requirement, StageReward } from "./types.ts";

export interface ProgressionResult {
  stagesDone: string[];
  goalsDone: string[];
  toasts: { text: string; kind: LogEntry["kind"] }[];
  /** Phần thưởng của các nấc vừa đạt, theo đúng thứ tự `stagesDone`. */
  rewards: StageReward[];
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
    case "crafted": return state.stats.crafted ?? 0;
    case "hired": return state.stats.hired ?? 0;
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
  const res: ProgressionResult = { stagesDone: [], goalsDone: [], toasts: [], rewards: [] };
  const doneStages = new Set(state.stagesDone);

  for (const st of content.stages) {
    if (doneStages.has(st.id)) continue;
    if (!meetsRequirement(state, st.require)) continue;
    res.stagesDone.push(st.id);
    if (st.toast) res.toasts.push({ text: st.toast, kind: "good" });
    if (st.reward) res.rewards.push(st.reward);
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

export interface GoalView {
  id: string;
  text: string;
  /** Điều kiện ĐẦU TIÊN của mục tiêu — để in "3/10" cạnh chữ. */
  key: string | null;
  have: number;
  need: number;
  /** 0..1 — trung bình các điều kiện. */
  progress: number;
}

/**
 * Mục tiêu đáng hiện ở góc màn hình: cái GẦN XONG NHẤT trong số chưa xong.
 *
 * Trước đây là cái ĐẦU TIÊN chưa xong theo thứ tự file — và mục tiêu thứ 6
 * "Chữa một cây bệnh" cần thuốc chỉ chế được ở bàn trong nhà, bệnh thì 2%/đêm.
 * Người chơi khá xong 1–5 trong hai ngày rồi nhìn dòng đó mãi; bốn mục tiêu
 * sau không bao giờ hiện. Chọn theo tiến độ thì cái chip luôn chỉ vào thứ đang
 * nhích, và mục tiêu nào rồi cũng tới lượt.
 *
 * Hoà thì lấy cái đứng trước trong file — thứ tự tác giả vẫn có nghĩa khi tiến
 * độ ngang nhau (mọi mục tiêu 0/N lúc ván mới chẳng hạn).
 */
export function bestGoal(state: GameState, content: Content): GoalView | null {
  let best: GoalView | null = null;
  for (const g of content.goals) {
    if (state.goalsDone.includes(g.id)) continue;
    const [key, need] = Object.entries(g.require ?? {})[0] ?? [null, 0];
    const v: GoalView = {
      id: g.id,
      text: g.text,
      key,
      have: key ? (statValue(state, key) ?? 0) : 0,
      need: need ?? 0,
      progress: requirementProgress(state, g.require),
    };
    if (!best || v.progress > best.progress) best = v;
  }
  return best;
}
