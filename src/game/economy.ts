/* ============================================================================
   ECONOMY — mua ở cửa hàng, bán ở quầy thu mua.

   Nhận `Draft` (xem state.ts) và sửa trên đó. Không hàm nào ở đây tự đánh giá
   progression — reduce() gọi applyProgression() một lần sau cùng.
============================================================================ */

import type { Content, GameState } from "./types.ts";
import type { Draft } from "./state.ts";
import { dStats, setInv, toastKey, touch } from "./state.ts";
import { addItem, canAdd, countItem, cropSlots, removeItem } from "./inventory.ts";
import { buyPriceOf, itemName, sellPriceOf, shopItemId, shopKey } from "./items.ts";
import { cropInSeason } from "./season.ts";

/** Món này có đang bày bán (đã mở khoá) không. Nhận cả 'sprinkler' lẫn 'build:sprinkler'. */
export function canBuy(state: GameState, id: string): boolean {
  return state.unlocked.includes(shopKey(id));
}

export function buy(d: Draft, content: Content, id: string, n: number): void {
  const count = Math.floor(n);
  if (!Number.isFinite(count) || count <= 0) return;

  const key = shopKey(id);
  if (!d.s.unlocked.includes(key)) return; // chưa mở khoá: im lặng từ chối

  const itemIdent = shopItemId(id, content);
  if (!itemIdent) return;

  // Hạt trái mùa không bày bán: mua về cũng không gieo được, để người chơi mua
  // rồi mới phát hiện là bẫy tiền.
  if (itemIdent.startsWith("seed:") && !cropInSeason(itemIdent.slice(5), d.s.day, content)) {
    toastKey(d, content, "outOfSeason", "bad");
    return;
  }

  const unit = buyPriceOf(itemIdent, content);
  if (unit <= 0) return;
  const cost = unit * count;

  if (d.s.money < cost) {
    toastKey(d, content, "noMoney", "bad");
    return;
  }
  if (!canAdd(d.s.inv, itemIdent, count)) {
    toastKey(d, content, "invFull", "bad");
    return; // túi đầy thì KHÔNG trừ tiền
  }

  const r = addItem(d.s.inv, itemIdent, count);
  setInv(d, r.inv);
  touch(d).money = d.s.money - cost;
  toastKey(d, content, "bought", "good", `${itemName(itemIdent, content)} ×${count}`);
}

export function sell(d: Draft, content: Content, id: string, n: number): void {
  const want = Math.floor(n);
  if (!Number.isFinite(want) || want <= 0) return;
  const unit = sellPriceOf(id, content);
  if (unit <= 0) return;

  const have = countItem(d.s.inv, id);
  const count = Math.min(want, have);
  if (count <= 0) return;

  const left = removeItem(d.s.inv, id, count);
  if (!left) return;
  setInv(d, left);

  const gain = unit * count;
  const s = touch(d);
  s.money = s.money + gain;
  const st = dStats(d);
  st.sold += count;
  st.earned += gain;
  toastKey(d, content, "sold", "good", `${itemName(id, content)} ×${count} +${gain}đ`);
}

export function sellAll(d: Draft, content: Content): void {
  const slots = cropSlots(d.s.inv);
  if (slots.length === 0) return;
  // gom theo id để mỗi loại chỉ một toast, thứ tự ổn định theo slot
  const order: string[] = [];
  const totals = new Map<string, number>();
  for (const s of slots) {
    if (!totals.has(s.id)) order.push(s.id);
    totals.set(s.id, (totals.get(s.id) ?? 0) + s.n);
  }
  for (const id of order) sell(d, content, id, totals.get(id) ?? 0);
}
