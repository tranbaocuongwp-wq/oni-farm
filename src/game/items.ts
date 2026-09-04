/* ============================================================================
   ITEMS — phân tích và tra cứu id vật phẩm.

   Id vật phẩm luôn có tiền tố:  tool:hoe · seed:lettuce · crop:tomato ·
   build:sprinkler.  Tất cả đều là hàm THUẦN, `content` truyền vào qua tham số.

   Lưu ý về "id cửa hàng": progression.unlocks dùng dạng `seed:<crop>` cho hạt
   nhưng dùng id TRẦN cho công trình (`sprinkler`), trong khi túi đồ lại lưu
   `build:sprinkler`. Hai hàm shopKey()/shopItemId() bắc cầu giữa hai dạng đó,
   nên UI gọi BUY bằng dạng nào cũng chạy.
============================================================================ */

import type { Content, ItemKind, ItemRef } from "./types.ts";

const KINDS: readonly string[] = ["tool", "seed", "crop", "build", "item"];

/** 'seed:lettuce' -> { kind:'seed', ref:'lettuce' }; sai định dạng -> null */
export function parseItem(id: string): ItemRef | null {
  if (typeof id !== "string") return null;
  const i = id.indexOf(":");
  if (i <= 0) return null;
  const kind = id.slice(0, i);
  const ref = id.slice(i + 1);
  if (ref.length === 0) return null;
  if (!KINDS.includes(kind)) return null;
  return { kind: kind as ItemKind, ref };
}

export function itemId(kind: ItemKind, ref: string): string {
  return `${kind}:${ref}`;
}

export function isTool(id: string): boolean {
  return id.startsWith("tool:");
}

/** Vật phẩm này còn tồn tại trong content hiện tại không? (dùng cho migrate) */
export function isKnownItem(id: string, content: Content): boolean {
  const it = parseItem(id);
  if (!it) return false;
  switch (it.kind) {
    case "tool": return Object.hasOwn(content.tools, it.ref);
    case "seed":
    case "crop": return Object.hasOwn(content.crops, it.ref);
    case "build": return Object.hasOwn(content.buildings, it.ref);
    case "item": return Object.hasOwn(content.materials, it.ref);
  }
}

/** Tên hiển thị. Không bao giờ ném lỗi — thiếu dữ liệu thì trả về chính id. */
export function itemName(id: string, content: Content): string {
  const it = parseItem(id);
  if (!it) return id;
  switch (it.kind) {
    case "tool": return content.tools[it.ref]?.name ?? id;
    case "seed": return content.crops[it.ref]?.seedName ?? id;
    case "crop": return content.crops[it.ref]?.name ?? id;
    case "build": return content.buildings[it.ref]?.name ?? id;
    case "item": return content.materials[it.ref]?.name ?? id;
  }
}

/** Giá BÁN cho người chơi. Nông sản và VẬT LIỆU (gỗ/đá/sợi) đều bán được ở
 *  quầy thu mua; 0 = không bán được. */
export function sellPriceOf(id: string, content: Content): number {
  const it = parseItem(id);
  if (!it) return 0;
  if (it.kind === "crop") return content.crops[it.ref]?.sellPrice ?? 0;
  if (it.kind === "item") return content.materials[it.ref]?.sellPrice ?? 0;
  return 0;
}

/** Giá MUA ở cửa hàng. 0 = không mua được. Nhận cả 'sprinkler' lẫn 'build:sprinkler'. */
export function buyPriceOf(id: string, content: Content): number {
  const it = parseItem(id);
  if (!it) return content.buildings[id]?.price ?? 0;
  if (it.kind === "seed") return content.crops[it.ref]?.seedPrice ?? 0;
  if (it.kind === "build") return content.buildings[it.ref]?.price ?? 0;
  // Vật liệu chỉ bày bán khi content khai `buyPrice`. Vắng = nhặt/chế được
  // thôi, không mua được — nên không cần một danh sách "thứ bán được" riêng.
  if (it.kind === "item") return content.materials[it.ref]?.buyPrice ?? 0;
  return 0;
}

/** Chuẩn hoá về dạng khoá dùng trong `state.unlocked` / progression.unlocks. */
export function shopKey(id: string): string {
  const it = parseItem(id);
  if (it && it.kind === "build") return it.ref;
  return id;
}

/** Chuẩn hoá về dạng id TÚI ĐỒ. Trả null nếu không phải hàng bán được. */
export function shopItemId(id: string, content: Content): string | null {
  const it = parseItem(id);
  if (it) {
    if (it.kind === "seed") return Object.hasOwn(content.crops, it.ref) ? id : null;
    if (it.kind === "build") return Object.hasOwn(content.buildings, it.ref) ? id : null;
    if (it.kind === "item")
      return (content.materials[it.ref]?.buyPrice ?? 0) > 0 ? id : null;
    return null;
  }
  return Object.hasOwn(content.buildings, id) ? `build:${id}` : null;
}
