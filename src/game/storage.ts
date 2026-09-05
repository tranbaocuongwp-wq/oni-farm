/* ============================================================================
   STORAGE — kho tập trung.

   MỘT kho duy nhất cho cả nông trại, dù nhà kho chiếm bao nhiêu ô. Cùng tinh
   thần với "lưới điện chỉ có một" ở bước 2 của `newday`: người chơi nghĩ về
   *cái kho*, không nghĩ về từng ô tường của nó. Và khi có người làm thuê, họ
   chỉ cần biết "đem về kho", không phải chọn cửa nào.

   Kho dùng lại nguyên bộ hàm túi đồ (`addItem`/`removeItem`) — chúng đã thuần
   và không giả định gì về việc mảng slot ấy thuộc về ai. Khác biệt duy nhất:
   kho không có hai ô công cụ cố định, nên mọi ô đều dùng được.
============================================================================ */

import type { Content, GameState, InvSlot } from "./types.ts";
import type { Draft } from "./state.ts";
import { setInv, storeSize, toastKey, toastText, touch } from "./state.ts";
import { addItem, canAdd, removeItem } from "./inventory.ts";
import { itemName, sellPriceOf, sellable } from "./items.ts";

/** Bản sao sửa được của kho. */
export function dStore(d: Draft): InvSlot[] {
  if (d.s.store === d.base.store) d.s.store = d.base.store.slice();
  d.changed = true;
  return d.s.store;
}

export function setStore(d: Draft, store: InvSlot[]): void {
  d.s.store = store;
  d.changed = true;
}

/** Kho đang chứa bao nhiêu món (tổng số lượng). */
export function storeCount(store: readonly InvSlot[]): number {
  let n = 0;
  for (const v of store) if (v) n += v.n;
  return n;
}

/** Kho còn ô trống nào không — dùng cho toast và cho AI người làm sau này. */
export function storeHasRoom(store: readonly InvSlot[], id: string): boolean {
  return canAdd(store, id, 1);
}

/**
 * Cất `n` món từ ô `slot` của TÚI vào kho.
 *
 * Hai ô đầu của túi là công cụ cố định — `removeItem` đã từ chối chúng, nên ở
 * đây không phải kiểm lại.
 */
export function putToStore(d: Draft, content: Content, slot: number, n: number): void {
  const from = d.s.inv[slot];
  if (!from) return;
  const want = Math.max(0, Math.min(Math.floor(n), from.n));
  if (want <= 0) return;
  if (!canAdd(d.s.store, from.id, want)) {
    toastKey(d, content, "storeFull", "bad");
    return;
  }
  const left = removeItem(d.s.inv, from.id, want);
  if (!left) return;
  const r = addItem(d.s.store, from.id, want);
  setInv(d, left);
  setStore(d, r.inv);
  toastText(d, `Cất vào kho: ${itemName(from.id, content)} ×${r.added}`, "good");
}

/** Lấy `n` món từ ô `slot` của KHO ra túi. */
export function takeFromStore(d: Draft, content: Content, slot: number, n: number): void {
  const from = d.s.store[slot];
  if (!from) return;
  const want = Math.max(0, Math.min(Math.floor(n), from.n));
  if (want <= 0) return;
  if (!canAdd(d.s.inv, from.id, want)) {
    toastKey(d, content, "invFull", "bad");
    return;
  }
  const left = removeItem(d.s.store, from.id, want);
  if (!left) return;
  const r = addItem(d.s.inv, from.id, want);
  setStore(d, left);
  setInv(d, r.inv);
  toastText(d, `Lấy từ kho: ${itemName(from.id, content)} ×${r.added}`, "good");
}

/**
 * Cất sạch nông sản và nguyên liệu trong túi vào kho.
 *
 * Công cụ và hạt giống KHÔNG bị cất: người chơi bấm nút này để dọn túi sau một
 * buổi thu hoạch, mà cất mất cái cuốc thì lần sau ra ruộng lại phải chạy về lấy.
 */
export function putAllToStore(d: Draft, content: Content): number {
  let moved = 0;
  for (let i = 0; i < d.s.inv.length; i++) {
    const v = d.s.inv[i];
    if (!v) continue;
    if (!v.id.startsWith("crop:") && !v.id.startsWith("item:")) continue;
    if (!canAdd(d.s.store, v.id, v.n)) continue;
    const left = removeItem(d.s.inv, v.id, v.n);
    if (!left) continue;
    const r = addItem(d.s.store, v.id, v.n);
    setInv(d, left);
    setStore(d, r.inv);
    moved += r.added;
  }
  if (moved > 0) toastText(d, `Đã cất ${moved} món vào kho.`, "good");
  else toastKey(d, content, "nothingToStore", "info");
  return moved;
}

/**
 * Bán sạch HÀNG BÁN ĐƯỢC trong kho — nông sản lẫn sản phẩm chăn nuôi.
 *
 * Duyệt theo THỨ TỰ Ô chứ không theo id, để kết quả tất định — cùng lý do
 * `sellAll` bên economy.ts giữ một mảng `order` riêng.
 */
export function sellStore(d: Draft, content: Content): { count: number; gain: number } {
  const out = { count: 0, gain: 0 };
  for (let i = 0; i < d.s.store.length; i++) {
    const v = d.s.store[i];
    if (!v || !sellable(v.id, content)) continue;
    const unit = sellPriceOf(v.id, content);
    if (unit <= 0) continue;
    const left = removeItem(d.s.store, v.id, v.n);
    if (!left) continue;
    setStore(d, left);
    out.count += v.n;
    out.gain += unit * v.n;
  }
  if (out.gain > 0) {
    const s = touch(d);
    s.money = s.money + out.gain;
    s.stats = { ...s.stats, sold: s.stats.sold + out.count, earned: s.stats.earned + out.gain };
    toastText(d, `Bán từ kho ${out.count} món · +${out.gain}đ`, "good");
  } else {
    toastKey(d, content, "nothingToSell", "info");
  }
  return out;
}

/** Kho có ô nào không hợp lệ không — dùng cho migrate khi content đổi số ô. */
export function normalizeStore(store: unknown, content: Content): InvSlot[] {
  const size = storeSize(content);
  const out = new Array<InvSlot>(size).fill(null);
  if (!Array.isArray(store)) return out;
  let w = 0;
  for (const v of store) {
    if (w >= size) break;
    if (!v || typeof v !== "object") continue;
    const id = (v as InvSlot & { id?: unknown }).id;
    const n = (v as InvSlot & { n?: unknown }).n;
    if (typeof id !== "string" || typeof n !== "number" || !Number.isFinite(n) || n < 1) continue;
    out[w++] = { id, n: Math.floor(n) };
  }
  return out;
}

/** Dùng cho invariants: kho là một GameState hợp lệ chưa. */
export function storeErrors(state: GameState, content: Content): string[] {
  const e: string[] = [];
  if (!Array.isArray(state.store)) {
    e.push("store phải là mảng ô");
    return e;
  }
  if (state.store.length !== storeSize(content))
    e.push(`store.length = ${state.store.length}, phải là ${storeSize(content)}`);
  state.store.forEach((v, i) => {
    if (v === null) return;
    if (!v.id || typeof v.id !== "string") e.push(`store[${i}].id không hợp lệ`);
    if (!Number.isInteger(v.n) || v.n < 1) e.push(`store[${i}].n phải là số nguyên >= 1`);
  });
  return e;
}
