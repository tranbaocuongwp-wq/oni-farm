/* ============================================================================
   HINT — "bấm nút này thì chuyện gì xảy ra?"

   Trên điện thoại, nút DÙNG cố định là một ẩn số: đang cầm gì, ngắm ô nào,
   ô đó có gì — người chơi phải tự ghép ba thứ trong đầu trước khi bấm. Hàm ở
   đây ghép giúp: từ state + content + ô đang ngắm, trả về ĐÚNG MỘT hành động
   sẽ xảy ra (cày / gieo / tưới / thu / chặt / đập / đặt / mua / bán / ngủ /
   vào / múc), hoặc lý do không làm được. HUD chỉ việc in chữ lên nút.

   THUẦN, không DOM, không import content — cùng luật với mọi thứ trong
   src/game/, nên test được thẳng trong Node và không bao giờ lệch với luật
   chơi thật (nó gọi đúng các hàm mà reducer gọi).
============================================================================ */

import type { Content, GameState, InteractKind } from "./types.ts";
import { canUseAt, type UseKind } from "./actions.ts";
import { selectedItemId } from "./inventory.ts";
import { parseItem } from "./items.ts";
import { inReach, interactAt, isRipe, tileAt, propDef } from "./world.ts";

export type HintKind =
  | UseKind
  | "shop"
  | "sell"
  | "craft"
  | "sleep"
  | "refill"
  | "enter";

export interface Hint {
  /** Việc sẽ xảy ra khi bấm DÙNG/E ở ô này; null = không có gì để làm. */
  kind: HintKind;
  /** Nhãn ngắn in lên nút (tiếng Việt, viết hoa cho dễ đọc ở cỡ nhỏ). */
  label: string;
  /** Có làm được NGAY (đứng đủ gần) không. false = nhân vật sẽ phải đi tới trước. */
  ready: boolean;
  /** Lý do không làm được — hiện dưới nút để người chơi biết đổi vật phẩm. */
  why: string | null;
}

const LABEL: Record<Exclude<HintKind, null>, string> = {
  harvest: "THU",
  till: "CÀY",
  water: "TƯỚI",
  plant: "GIEO",
  build: "ĐẶT",
  chop: "CHẶT",
  mine: "ĐẬP",
  cure: "CHỮA",
  pull: "NHỔ",
  shop: "MUA",
  sell: "BÁN",
  craft: "CHẾ",
  sleep: "NGỦ",
  refill: "MÚC",
  enter: "VÀO",
};

const INTERACT_KIND: Record<InteractKind, Exclude<HintKind, null>> = {
  SHOP: "shop",
  SELL: "sell",
  CRAFT: "craft",
  SLEEP: "sleep",
  REFILL: "refill",
  PORTAL: "enter",
};

/** Tìm ô tương tác ở (x,y) hoặc 4 ô kề — cùng luật với `nearbyInteract` bên
 *  UI: đứng chệch một chút vẫn bấm được. */
function interactNear(state: GameState, content: Content, x: number, y: number): InteractKind | null {
  const around: [number, number][] = [[0, 0], [0, -1], [0, 1], [-1, 0], [1, 0]];
  for (const [dx, dy] of around) {
    const k = interactAt(state, content, x + dx, y + dy);
    if (k) return k;
  }
  return null;
}

/** Vì sao không làm được gì ở ô này với thứ đang cầm. Chỉ trả về câu ngắn.
 *  Ưu tiên nói về VẬT PHẨM ĐANG CẦM trước (đó là thứ người chơi đổi được ngay),
 *  rồi mới tới trạng thái ô. */
function explain(state: GameState, content: Content, x: number, y: number): string | null {
  const t = tileAt(state, x, y);
  if (!t) return null;
  if (t.prop) {
    const def = propDef(content, t.prop);
    if (!def) return null;
    if (def.hits && def.tool) {
      const tool = content.toolOrder.map((id) => content.tools[id]).find((d) => d?.action === def.tool);
      return `Cần ${tool?.name ?? (def.tool === "MINE" ? "cuốc chim" : "rìu")}`;
    }
    return null;
  }
  const held = selectedItemId(state.inv, state.sel);
  const it = held ? parseItem(held) : null;
  if (!it) return "Chọn vật phẩm ở hotbar";
  const growing = !!t.crop && !isRipe(t, content);
  if (t.crop?.sick) return "Cây bệnh — cần thuốc hoặc cuốc";
  if (it.kind === "tool") {
    const tool = content.tools[it.ref];
    if (!tool) return null;
    if (tool.action === "TILL") {
      if (t.crop) return growing ? "Cây chưa chín" : "Đã có cây";
      if (t.tilled) return "Đã cày rồi";
      return t.g === "water" ? "Không cày nước được" : "Không cày được ở đây";
    }
    if (tool.action === "WATER") {
      if (!t.tilled) return "Chưa cày";
      if (t.wet) return "Đã tưới rồi";
      if (!(state.water > 0)) return "Hết nước — ra giếng";
      return null;
    }
    if (tool.action === "CHOP" || tool.action === "MINE")
      return growing ? "Cây chưa chín" : "Không có gì để " + (tool.action === "CHOP" ? "chặt" : "đập");
    return null;
  }
  if (it.kind === "seed") return t.crop ? (growing ? "Cây chưa chín" : "Đã có cây") : !t.tilled ? "Cày trước đã" : null;
  if (it.kind === "build") return growing ? "Cây chưa chín" : "Không đặt được ở đây";
  if (it.kind === "crop" || it.kind === "item") return growing ? "Cây chưa chín" : "Mang ra quầy để bán";
  return null;
}

/**
 * Gợi ý cho ô (x,y). Thứ tự ưu tiên trùng với luật của reducer:
 *   1. có vật thể tương tác gần đó (cửa hàng, quầy, giường, giếng, cửa)
 *   2. việc làm được với vật phẩm đang cầm (thu hoạch luôn thắng, như useAt)
 *   3. không có gì → lý do
 */
export function hintAt(state: GameState, content: Content, x: number, y: number): Hint {
  const ik = interactNear(state, content, x, y);
  if (ik) {
    const kind = INTERACT_KIND[ik];
    return { kind, label: LABEL[kind], ready: inReach(state, x, y), why: null };
  }
  const use = canUseAt(state, content, x, y, true);
  if (use !== null) {
    return { kind: use, label: LABEL[use], ready: inReach(state, x, y), why: null };
  }
  return { kind: null, label: "DÙNG", ready: false, why: explain(state, content, x, y) };
}

/** Tuỳ chọn cho `nearestTarget`. Mặc định = đúng hành vi cũ, không đổi một ly. */
export interface NearestOptions {
  /** bán kính quét, tính bằng Ô. Mặc định 2 (hộp 5×5 quanh chân). */
  radius?: number;
  /** bắt buộc ô phải nằm trong tầm công cụ. Mặc định true. */
  requireReach?: boolean;
}

/**
 * Ô GẦN NHẤT mà vật phẩm đang cầm làm được việc.
 *
 * Hai chế độ, cùng một công thức chấm điểm:
 *
 * · Mặc định (`radius: 2, requireReach: true`) — quét quanh chân, chỉ nhận ô
 *   với tới được. Đây là chế độ cho việc GIỮ NÚT: cày xong một ô thì nhảy sang
 *   ô kế bên, không phải ngắm lại.
 *
 * · Bán kính rộng, bỏ `requireReach` — dùng cho "tự động làm" và (sau này) cho
 *   AI người làm thuê. Ô trả về có thể ở XA, nơi gọi có nhiệm vụ tự đi tới.
 *   Đây cố ý là cùng một hàm: người chơi bấm "tự động làm" và người làm thuê
 *   chọn việc phải cho ra cùng một thứ tự ưu tiên, nếu không thì hai hệ thống
 *   sẽ trôi khỏi nhau theo thời gian.
 *
 * `prefer`: loại việc vừa làm (till/water/…) được ưu tiên, để đang cày thì
 * không nhảy sang thu hoạch một cây chín tình cờ đứng cạnh (thu hoạch vẫn là
 * việc "làm được" theo `canUseAt`). Không có ô cùng loại thì mới lấy loại khác.
 * Trả null nếu quanh đây không còn gì.
 *
 * Quét theo VÒNG từ trong ra ngoài và thoát sớm: ca thường gặp (có việc ngay
 * cạnh chân) chỉ tốn 8 ô thay vì quét trọn 25×25 = 625 ô mỗi lần.
 */
export function nearestTarget(
  state: GameState,
  content: Content,
  prefer: UseKind | null,
  exclude: { x: number; y: number } | null = null,
  opts: NearestOptions = {},
): { x: number; y: number; kind: Exclude<UseKind, null> } | null {
  const radius = Math.max(0, Math.floor(opts.radius ?? 2));
  const requireReach = opts.requireReach !== false;
  const px = state.player.x;
  const py = state.player.y;
  const cx = Math.floor(px / 16);
  const cy = Math.floor(py / 16);
  let best: { x: number; y: number; kind: Exclude<UseKind, null> } | null = null;
  let bestScore = Infinity;

  const consider = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= state.w || y >= state.h) return;
    if (exclude && exclude.x === x && exclude.y === y) return;
    if (requireReach && !inReach(state, x, y)) return;
    // `canUseAt` TỰ kiểm tầm với ở bên trong; phải bảo nó bỏ qua, nếu không thì
    // `requireReach: false` ở đây vô nghĩa và bán kính rộng không tìm ra gì.
    const kind = canUseAt(state, content, x, y, !requireReach);
    if (kind === null) return;
    const dx = x - cx;
    const dy = y - cy;
    const d = Math.hypot(x * 16 + 8 - px, y * 16 + 8 - py);
    // cùng loại việc thắng tuyệt đối; sau đó ô thẳng hàng (không chéo) thắng
    // ô chéo — nhân vật vung tay theo 4 hướng nên ô chéo trông lệch;
    // cuối cùng mới tới khoảng cách.
    const straight = dx === 0 || dy === 0 ? 0 : 1;
    const score = (prefer && kind !== prefer ? 100 : 0) + straight * 10 + d;
    if (score < bestScore) {
      bestScore = score;
      best = { x, y, kind };
    }
  };

  for (let r = 0; r <= radius; r++) {
    if (r === 0) consider(cx, cy);
    else {
      for (let dx = -r; dx <= r; dx++) {
        consider(cx + dx, cy - r);
        consider(cx + dx, cy + r);
      }
      for (let dy = -r + 1; dy <= r - 1; dy++) {
        consider(cx - r, cy + dy);
        consider(cx + r, cy + dy);
      }
    }
    // Thoát sớm, có CHỨNG MINH chứ không phải áng chừng. Ô ở vòng r+1 trở ra
    // có tâm cách người chơi ít nhất `(r+1)*16 - 8` px, mà điểm số luôn >= khoảng
    // cách (hai thành phần kia không âm). Nên khi điểm tốt nhất đã <= cận đó thì
    // không ô nào ngoài kia thắng được nữa.
    //
    // Cắt ẩu ở đây là sai thật: một ô CHÉO vòng trong bị phạt +10 hoàn toàn có
    // thể thua một ô THẲNG HÀNG vòng ngoài, nên "tìm thấy là dừng" sẽ trả về ô
    // khác với bản quét đầy đủ cũ.
    if (best !== null && bestScore <= (r + 1) * 16 - 8) break;
  }
  return best;
}

/** Ô ngay TRƯỚC MẶT nhân vật — dùng khi không có ô nào đang được ngắm. */
export function facingTile(state: GameState, tile = 16): { x: number; y: number } {
  const d = state.player.dir;
  const ox = d === "left" ? -1 : d === "right" ? 1 : 0;
  const oy = d === "up" ? -1 : d === "down" ? 1 : 0;
  return { x: Math.floor(state.player.x / tile) + ox, y: Math.floor(state.player.y / tile) + oy };
}
