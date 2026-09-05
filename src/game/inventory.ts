/* ============================================================================
   INVENTORY — túi đồ dạng mảng slot phẳng.

   Luật:
     · Độ dài mảng LUÔN bằng balance.inventorySlots.
     · Slot 0 và 1 là hai công cụ (tool:hoe, tool:can) và không bao giờ bị xoá.
     · Cùng id thì cộng dồn stack, không giới hạn số lượng mỗi stack.
     · `state.sel` là chỉ số slot đang chọn, nằm trong [0, hotbarSlots).

   Mọi hàm ở đây THUẦN: nhận mảng cũ, trả mảng mới, không sửa tại chỗ.
============================================================================ */

import type { Content, InvSlot } from "./types.ts";
import { isKnownItem, isTool } from "./items.ts";

/** Hai slot đầu dành riêng cho công cụ. */
export const TOOL_SLOTS = 2;

/** Id công cụ theo thứ tự content (mặc định: tool:hoe, tool:can). */
export function toolIds(content: Content): string[] {
  return content.toolOrder.slice(0, TOOL_SLOTS).map((t) => `tool:${t}`);
}

export function createInventory(content: Content): InvSlot[] {
  const n = Math.max(TOOL_SLOTS, content.balance.inventorySlots | 0);
  const inv: InvSlot[] = new Array<InvSlot>(n).fill(null);
  const tools = toolIds(content);
  for (let i = 0; i < TOOL_SLOTS; i++) {
    const id = tools[i];
    inv[i] = id ? { id, n: 1 } : null;
  }
  let out = inv;
  for (const [id, count] of Object.entries(content.balance.startSeeds ?? {})) {
    if (!Number.isFinite(count) || count <= 0) continue;
    out = addItem(out, id, Math.floor(count)).inv;
  }
  return out;
}

export function countItem(inv: readonly InvSlot[], id: string): number {
  let n = 0;
  for (const s of inv) if (s && s.id === id) n += s.n;
  return n;
}

/** Có chỗ để nhét đủ `n` món id này không (stack vô hạn nên chỉ cần 1 chỗ). */
export function canAdd(inv: readonly InvSlot[], id: string, n: number): boolean {
  if (n <= 0) return true;
  for (const s of inv) if (s && s.id === id) return true;
  for (let i = 0; i < inv.length; i++) if (inv[i] === null || inv[i] === undefined) return true;
  return false;
}

/** Thêm vào túi. `added` < n nghĩa là túi đầy, phần thừa bị bỏ. */
export function addItem(
  inv: readonly InvSlot[],
  id: string,
  n: number,
): { inv: InvSlot[]; added: number } {
  const out = inv.slice();
  if (n <= 0) return { inv: out, added: 0 };
  for (let i = 0; i < out.length; i++) {
    const s = out[i];
    if (s && s.id === id) {
      out[i] = { id, n: s.n + n };
      return { inv: out, added: n };
    }
  }
  const free = out.findIndex((s) => s === null || s === undefined);
  if (free < 0) return { inv: out, added: 0 };
  out[free] = { id, n };
  return { inv: out, added: n };
}

/** Bớt khỏi túi. Trả null nếu không đủ (hoặc cố xoá công cụ). */
export function removeItem(inv: readonly InvSlot[], id: string, n: number): InvSlot[] | null {
  if (n <= 0) return inv.slice();
  if (isTool(id)) return null; // công cụ không bao giờ bị xoá
  if (countItem(inv, id) < n) return null;
  const out = inv.slice();
  let left = n;
  for (let i = 0; i < out.length && left > 0; i++) {
    const s = out[i];
    if (!s || s.id !== id) continue;
    const take = Math.min(s.n, left);
    left -= take;
    out[i] = s.n - take > 0 ? { id, n: s.n - take } : null;
  }
  return out;
}

/** Bớt khỏi túi CHO CHẾ TẠO — khác `removeItem` ở chỗ tiêu được cả CÔNG CỤ
 *  (nâng cấp rìu ăn cái rìu cũ). Trả null nếu không đủ.
 *
 *  Hai ô công cụ đầu (cuốc/bình tưới) là VĨNH VIỄN: chúng vẫn được tính là có,
 *  nhưng không bao giờ bị lấy đi — nếu không thì bất biến "ô 0/1 luôn là cuốc
 *  và bình tưới" vỡ ngay khi chế bình tưới lớn. */
export function removeForCraft(inv: readonly InvSlot[], id: string, n: number): InvSlot[] | null {
  if (n <= 0) return inv.slice();
  if (countItem(inv, id) < n) return null;
  const out = inv.slice();
  let left = n;
  for (let i = TOOL_SLOTS; i < out.length && left > 0; i++) {
    const s = out[i];
    if (!s || s.id !== id) continue;
    const take = Math.min(s.n, left);
    left -= take;
    out[i] = s.n - take > 0 ? { id, n: s.n - take } : null;
  }
  // `left > 0` nghĩa là phần còn lại nằm ở ô công cụ cố định — bỏ qua, coi như
  // công cụ khởi đầu không mất.
  return out;
}

/**
 * Đổi chỗ hai ô (kéo từ balo ra hotbar và ngược lại). Cùng id thì GỘP vào ô
 * đích. Hai ô công cụ đầu (cuốc/bình tưới) là cố định: không đổi chỗ được —
 * bất biến "ô 0/1 luôn là cuốc và bình" phải giữ. Trả null nếu không đổi gì.
 */
export function swapSlots(inv: readonly InvSlot[], a: number, b: number): InvSlot[] | null {
  if (!Number.isInteger(a) || !Number.isInteger(b)) return null;
  if (a < 0 || b < 0 || a >= inv.length || b >= inv.length || a === b) return null;
  if (a < TOOL_SLOTS || b < TOOL_SLOTS) return null;
  const sa = inv[a] ?? null;
  const sb = inv[b] ?? null;
  if (!sa && !sb) return null;
  const out = inv.slice();
  if (sa && sb && sa.id === sb.id) {
    out[b] = { id: sb.id, n: sa.n + sb.n };
    out[a] = null;
    return out;
  }
  out[a] = sb;
  out[b] = sa;
  return out;
}

/** Id vật phẩm đang chọn ở hotbar, null nếu slot trống. */
export function selectedItemId(inv: readonly InvSlot[], sel: number): string | null {
  const s = inv[sel];
  return s ? s.id : null;
}

/** Danh sách hotbar cho UI (đã cắt đúng hotbarSlots). */
export function hotbar(inv: readonly InvSlot[], content: Content): InvSlot[] {
  return inv.slice(0, Math.max(0, content.balance.hotbarSlots | 0));
}

/** Mọi slot chứa nông sản — dùng cho SELL_ALL và bảng giá ở quầy. */
export function cropSlots(inv: readonly InvSlot[]): { slot: number; id: string; n: number }[] {
  const out: { slot: number; id: string; n: number }[] = [];
  for (let i = 0; i < inv.length; i++) {
    const s = inv[i];
    if (s && s.id.startsWith("crop:")) out.push({ slot: i, id: s.id, n: s.n });
  }
  return out;
}

/** Đổi kích thước túi (OTA đổi inventorySlots) + vá lại hai slot công cụ.
 *  Không bao giờ ném lỗi; đồ bị tràn khi thu nhỏ túi sẽ được ghi vào `dropped`. */
export function normalizeInventory(
  inv: readonly InvSlot[],
  content: Content,
): { inv: InvSlot[]; dropped: string[] } {
  const size = Math.max(TOOL_SLOTS, content.balance.inventorySlots | 0);
  const tools = toolIds(content);
  const coDinh = new Set(tools);
  const dropped: string[] = [];

  /* Gom mọi món sẽ được XẾP LẠI vào túi, giữ nguyên thứ tự.
     Bỏ qua đúng hai công cụ của slot cố định, vì bên dưới chúng được dựng lại
     từ `toolIds`. MỌI công cụ khác đi tiếp như đồ thường — rìu thép, cuốc chim,
     bình tưới lớn đều là thứ người chơi CHẾ RA, và hàm này chạy ở mỗi lần nạp
     save. Bỏ hết `tool:` ở đây từng xoá sạch chúng, im lặng, không một dòng ghi
     chú, mỗi lần mở game. */
  const carried: { id: string; n: number }[] = [];
  for (const s of inv) {
    if (!s || typeof s.id !== "string") continue;
    if (coDinh.has(s.id)) continue;
    const n = Math.floor(s.n);
    if (!Number.isFinite(n) || n < 1) continue;
    if (!isKnownItem(s.id, content)) {
      dropped.push(s.id);
      continue;
    }
    carried.push({ id: s.id, n });
  }

  let out: InvSlot[] = new Array<InvSlot>(size).fill(null);
  for (let i = 0; i < TOOL_SLOTS && i < size; i++) {
    const id = tools[i];
    out[i] = id ? { id, n: 1 } : null;
  }
  for (const c of carried) {
    const r = addItem(out, c.id, c.n);
    out = r.inv;
    if (r.added < c.n) dropped.push(c.id);
  }
  return { inv: out, dropped };
}
