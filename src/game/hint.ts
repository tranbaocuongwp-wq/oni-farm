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

import type { Content, GameState, InteractKind, Entity} from "./types.ts";
import { canUseAt, putdownWouldTrap, type UseKind } from "./actions.ts";
import { selectedItemId } from "./inventory.ts";
import { itemName, parseItem } from "./items.ts";
import { pondAt, troughFeedsAt, troughMax, troughStock } from "./pen.ts";
import { penNear, penSummary } from "./animals.ts";
import { TILE, inReach, inInteractRange, interactAt, inZone, isRipe, tileAt, propDef } from "./world.ts";
import { runFor, type Run } from "./run.ts";
import { workerNear } from "./workers.ts";
import { animalNear, readyProduct } from "./animals.ts";

export type HintKind =
  | UseKind
  /** sạp của THUYỀN BUÔN đang cập bến — chỉ có mặt khi con thuyền có mặt */
  | "boat"
  | "shop"
  | "sell"
  | "craft"
  | "store"
  | "gather"
  | "sleep"
  | "refill"
  | "enter"
  | "pen";

export interface Hint {
  /** Việc sẽ xảy ra khi bấm DÙNG/E ở ô này; null = không có gì để làm. */
  kind: HintKind;
  /** Nhãn ngắn in lên nút (tiếng Việt, viết hoa cho dễ đọc ở cỡ nhỏ). */
  label: string;
  /** Có làm được NGAY (đứng đủ gần) không. false = nhân vật sẽ phải đi tới trước. */
  ready: boolean;
  /** Lý do không làm được — hiện dưới nút để người chơi biết đổi vật phẩm. */
  why: string | null;
  /** Ô mà cú bấm sẽ tác động (khi khác ô đang ngắm, HUD vẽ dấu ở đó). */
  at?: { x: number; y: number };
}

export const LABEL: Record<Exclude<HintKind, null>, string> = {
  harvest: "THU",
  till: "CÀY",
  water: "TƯỚI",
  plant: "GIEO",
  build: "XÂY",
  chop: "CHẶT",
  mine: "ĐẬP",
  cure: "CHỮA",
  pull: "NHỔ",
  shop: "MUA",
  boat: "THUYỀN BUÔN",
  sell: "BÁN",
  craft: "CHẾ",
  sleep: "NGỦ",
  refill: "MÚC",
  enter: "VÀO",
  store: "KHO",
  gather: "THU",
  lift: "NHẤC",
  putdown: "ĐẶT XUỐNG",
  pour: "ĐỔ MÁNG",
  feedpond: "CHO CÁ ĂN",
  pen: "KHU",
};

const INTERACT_KIND: Record<InteractKind, Exclude<HintKind, null>> = {
  SHOP: "shop",
  SELL: "sell",
  CRAFT: "craft",
  SLEEP: "sleep",
  REFILL: "refill",
  PORTAL: "enter",
  STORE: "store",
};

/**
 * Ô tương tác GẦN NHẤT quanh (x,y) — cùng luật với `nearbyInteract` bên UI.
 *
 * Quét cả hình vuông bán kính 2 chứ không chỉ bốn ô kề thẳng. Bốn ô kề bỏ sót
 * đúng những ca hay gặp nhất: đứng CHÉO góc quầy thu mua, đứng cách cái giếng
 * một ô vì có hòn đá chen giữa — nút phụ tắt ngóm mà không nói vì sao, và
 * người chơi phải xê dịch mò cho tới lúc nó sáng lại.
 *
 * Lấy ô GẦN NHẤT chứ không phải ô đầu tiên trong một danh sách cố định: đứng
 * giữa cái giường và cái cửa thì thứ được chọn phải là thứ mình đang đứng sát,
 * không phải thứ tình cờ nằm trước trong mảng.
 */
export const INTERACT_SCAN = 2;

function interactNear(
  state: GameState,
  content: Content,
  x: number,
  y: number,
  scan = INTERACT_SCAN,
): { kind: InteractKind; x: number; y: number } | null {
  let best: { kind: InteractKind; x: number; y: number } | null = null;
  let bestD = Infinity;
  for (let dy = -scan; dy <= scan; dy++)
    for (let dx = -scan; dx <= scan; dx++) {
      const k = interactAt(state, content, x + dx, y + dy);
      if (!k) continue;
      const d = Math.hypot(dx, dy);
      if (d < bestD) {
        bestD = d;
        best = { kind: k, x: x + dx, y: y + dy };
      }
    }
  return best;
}

/** Năng lượng một việc tốn — 0 cho việc không tốn (nhấc, đặt, đổ máng…). */
export function energyFor(content: Content, kind: Exclude<HintKind, null>): number {
  const c = content.balance.energyCost as unknown as Record<string, number | undefined>;
  return c[kind] ?? 0;
}

/** Vì sao không làm được gì ở ô này với thứ đang cầm. Chỉ trả về câu ngắn.
 *  Ưu tiên nói về VẬT PHẨM ĐANG CẦM trước (đó là thứ người chơi đổi được ngay),
 *  rồi mới tới trạng thái ô. */
function explain(state: GameState, content: Content, x: number, y: number): string | null {
  const t = tileAt(state, x, y);
  if (!t) return null;

  /* ĐANG VÁC: mọi câu bên dưới đều nói về thứ đang CẦM trên hotbar, mà lúc vác
     thì hai tay bận — hỏi hotbar sẽ ra "Chọn vật phẩm ở hotbar", một câu vô
     nghĩa với người đang ôm hòn đá. Trả lời đúng câu họ đang hỏi: vì sao đặt
     xuống đây không được. */
  if (state.carry) {
    if (putdownWouldTrap(state, content, x, y)) return "Lùi ra rồi đặt";
    if (t.tilled) return "Đừng đặt lên luống cày";
    if (t.prop || t.crop || t.b) return "Chỗ này đã có thứ khác";
    return "Không đặt xuống được ở đây";
  }

  const ao = pondAt(state, content, x, y);
  if (ao) {
    const cam = selectedItemId(state.inv, state.sel);
    if (!cam || !(ao.feeds ?? []).includes(cam))
      return `Cầm ${(ao.feeds ?? []).map((f) => itemName(f, content)).join(" / ")} để cho cá ăn`;
    return "Chưa con nào đói";
  }

  if (t.prop === "trough") {
    const feeds = troughFeedsAt(state, content, x, y);
    if (!feeds.length) return "Máng ngoài khu chuồng";
    if (troughStock(state, x, y) >= troughMax(content)) return "Máng đã đầy";
    return `Cầm ${feeds.map((f) => itemName(f, content)).join(" / ")} để đổ`;
  }
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
      if (!inZone(state, content, "farm", x, y)) return "Ngoài khu ruộng";
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

/* ============================================================================
   CÚ BẤM — một nguồn cho cả NHÃN lẫn VIỆC.

   Trước Đợt 21, nhãn trên nút do `hintAt` tính, còn cú bấm trong `main.ts` đi
   một bộ luật khác (`tryAnimal` → `canUseAt` → `tryInteract` → chuyến). Hai bộ
   luật ấy trôi khỏi nhau theo từng đợt: nhãn ghi "ĐỔ MÁNG" mà bấm thì lắc đầu,
   nhãn ghi "THU" con bò cách hai ô mà bấm lại đi cày, nhãn ghi "NGỦ" ở hai ô mà
   reducer im lặng vì ngoài tầm. Không có gì buộc hai bộ luật phải khớp — cho
   tới khi chỉ còn MỘT.

   `pressPlan` trả lời đúng một câu: "bấm nút chính BÂY GIỜ thì chuyện gì xảy
   ra" — dưới dạng một `Press` mà `main.ts` chỉ việc THỰC THI, còn `hintOf` chỉ
   việc IN. Nhãn là hình chiếu của cú bấm, nên nó không thể nói khác.

   Thuần: không tìm đường (chạy mỗi khung cho HUD), không đụng DOM.
============================================================================ */

/** Việc sẽ xảy ra khi bấm nút chính. */
export type Press =
  /** không làm gì; `kind` giữ lại cho ca "có việc nhưng hết sức" để nút vẫn ghi tên việc */
  | { t: "deny"; why: string | null; kind?: Exclude<HintKind, null> }
  /** cầm công trình → mở chế độ xây */
  | { t: "build" }
  /** dùng món đang cầm lên ô (x,y); `run` = chuyến sẽ bắt đầu sau nhát này (nếu có) */
  | { t: "use"; kind: Exclude<UseKind, null>; x: number; y: number; run: Run | null }
  /** thu sản phẩm của đúng con vật `id` */
  | { t: "gather"; id: number; x: number; y: number }
  /** tương tác với vật thể ở (x,y): cửa hàng, quầy, giường, giếng, kho, cửa nhà */
  | { t: "interact"; kind: InteractKind; x: number; y: number }
  /** mở sạp thuyền buôn đang cập bến */
  | { t: "boat"; id: number }
  /** đi tới (x,y) rồi làm `then` ở đó; `kind` để in nhãn; `dist` = số ô (Chebyshev) */
  | { t: "go"; x: number; y: number; then: "use" | "gather" | "interact" | "boat"; kind: Exclude<HintKind, null>; dist: number }
  /** bắt đầu CHUYẾN của món đang cầm (`runFor`); `why` = câu giải thích cho ô ngắm */
  | { t: "run"; run: Run; why: string | null };

export interface PressOptions {
  /** nút ngữ cảnh bật (settings.contextButton): được nhìn quanh chân và chạy chuyến */
  context: boolean;
  /** được ĐI TỚI ô ở xa rồi làm (chỉ khi người chơi thật sự ngắm một ô) */
  canGo: boolean;
  /** lúc TỚI ĐÍCH của một cú `go`: chỉ nhận đúng loại việc đã hứa, không mở thứ khác */
  only?: "use" | "gather" | "interact" | "boat" | "any";
}

const LABEL_TO_INTERACT: Partial<Record<Exclude<HintKind, null>, InteractKind>> = {
  shop: "SHOP",
  sell: "SELL",
  craft: "CRAFT",
  sleep: "SLEEP",
  refill: "REFILL",
  enter: "PORTAL",
  store: "STORE",
};

/**
 * Tầm với để TƯƠNG TÁC được — hỏi đúng luật reducer sẽ hỏi.
 *
 * MÚC (`REFILL`) đi qua `hasNearbyInteract` = `inReach` (1,6 ô từ tâm ô); các
 * thứ còn lại đi qua `inInteractRange` (thêm cả tám ô kề). Trước đây UI dùng
 * một luật thứ ba (2,8 ô) không khớp cái nào, nên "NGỦ" sáng ở hai ô mà bấm
 * thì giường im lặng.
 */
function interactReady(state: GameState, kind: InteractKind, x: number, y: number): boolean {
  return kind === "REFILL" ? inReach(state, x, y) : inInteractRange(state, x, y);
}

function chebyshev(state: GameState, x: number, y: number): number {
  const px = Math.floor(state.player.x / TILE);
  const py = Math.floor(state.player.y / TILE);
  return Math.max(Math.abs(px - x), Math.abs(py - y));
}

/**
 * Bấm nút chính ở ô `cursor` thì chuyện gì xảy ra. Thứ tự là cả cái luật:
 *
 *   1. cầm CÔNG TRÌNH → mở chế độ xây. Cầm công trình lên là đã nói ý định;
 *      cú bấm cũng làm thế từ Đợt 9, chỉ có nhãn từng nói khác (THU trước XÂY).
 *   2. ô ngắm ở XA mà không được đi → rơi về ô TRƯỚC MẶT (đúng như cú bấm cũ).
 *   3. con vật TỚI LỨA ngay ô ngắm → THU đúng con đó (một bán kính duy nhất
 *      `animalNear` 1,4 ô — nhãn và cú bấm từng dùng hai bán kính khác nhau).
 *   4. việc với MÓN ĐANG CẦM ở ô ngắm (`canUseAt`) — hết sức thì nói trước.
 *   5. VẬT THỂ ở ô ngắm (cửa hàng, giường…) — người chơi chủ ý chỉ vào nó.
 *   6. quanh CHÂN (`contextAction`): thuyền buôn, việc của khu, ô gần nhất làm
 *      được với món đang cầm, vật thể trong hai ô.
 *   7. CHUYẾN của món đang cầm.
 *   8. không có gì → lý do.
 */
export function pressPlan(
  state: GameState,
  content: Content,
  cursor: { x: number; y: number } | null,
  opts: PressOptions,
): Press {
  const only = opts.only ?? "any";
  const cho = (p: Press): Press => {
    if (only === "any") return p;
    if (p.t === only) return p;
    if (p.t === "deny") return p;
    return { t: "deny", why: null };
  };
  if (!cursor) return { t: "deny", why: null };
  let x = cursor.x;
  let y = cursor.y;

  // 1. công trình
  const held = selectedItemId(state.inv, state.sel);
  const hi = held ? parseItem(held) : null;
  if (hi?.kind === "build" && content.buildings[hi.ref]) return cho({ t: "build" });

  // 2. xa mà không được đi → ô trước mặt
  let whyXa: string | null = null;
  const xa = !inReach(state, x, y);
  if (xa && !opts.canGo) {
    const f = facingTile(state, TILE);
    x = f.x;
    y = f.y;
    whyXa = "Xa quá — chạm để đi tới";
  }
  const goTo = (
    tx: number,
    ty: number,
    then: "use" | "gather" | "interact" | "boat",
    kind: Exclude<HintKind, null>,
  ): Press => ({ t: "go", x: tx, y: ty, then, kind, dist: chebyshev(state, tx, ty) });

  // 3. con vật tới lứa ngay ô ngắm
  const an = animalNear(state, x, y);
  if (an && content.animals[an.def] && readyProduct(an, content) >= 0) {
    const ax = Math.floor(an.x / TILE);
    const ay = Math.floor(an.y / TILE);
    if (inReach(state, ax, ay)) return cho({ t: "gather", id: an.id, x: ax, y: ay });
    if (opts.canGo) return cho(goTo(ax, ay, "gather", "gather"));
  }

  /* Một ứng viên của `contextAction` → cú bấm. Dùng ở hai chỗ (bước 4 và 6). */
  const fromCtx = (ca: CtxAction): Press | null => {
    if (ca.kind === "boat") {
      const th = boatAt(state, Math.floor(state.player.x / TILE), Math.floor(state.player.y / TILE));
      return th ? { t: "boat", id: th.id } : null;
    }
    if (ca.kind === "gather") {
      if (ca.id !== undefined && inReach(state, ca.at.x, ca.at.y))
        return { t: "gather", id: ca.id, x: ca.at.x, y: ca.at.y };
      return goTo(ca.at.x, ca.at.y, "gather", "gather");
    }
    const ik = LABEL_TO_INTERACT[ca.kind];
    if (ik) {
      if (interactReady(state, ik, ca.at.x, ca.at.y)) return { t: "interact", kind: ik, x: ca.at.x, y: ca.at.y };
      return goTo(ca.at.x, ca.at.y, "interact", ca.kind);
    }
    if (ca.kind === "pen") return null;
    const uk = ca.kind as Exclude<UseKind, null>;
    if (inReach(state, ca.at.x, ca.at.y))
      return { t: "use", kind: uk, x: ca.at.x, y: ca.at.y, run: runAfter(state, content, uk, opts) };
    return goTo(ca.at.x, ca.at.y, "use", uk);
  };

  // 4. món đang cầm lên ô ngắm
  const use = canUseAt(state, content, x, y, true);
  if (use !== null) {
    /* Việc DỌN DẸP ở ô ngắm (nhổ, nhấc, chặt, đập — làm được cả bằng tay
       không) KHÔNG được cướp lời một việc mà MÓN ĐANG CẦM sinh ra ở gần đó:
       cầm bao cám mà ngắm vào bụi cỏ thì ý định vẫn là cho gà ăn. Đó là đúng
       cảnh Cường tả ("bấm vô cái nó chạy đi nhổ cỏ"), và `contextAction` đã
       có luật bậc cho nó — ở đây chỉ hỏi nó trước. */
    if (DON_DEP.has(use) && opts.context) {
      const ca = contextAction(state, content, x, y);
      if (ca && nhoMonDangCam(ca.kind)) {
        const p = fromCtx(ca);
        if (p) return cho(p);
      }
    }
    /* HẾT NĂNG LƯỢNG phải nói TRƯỚC khi bấm. `canUseAt` cố ý không kiểm năng
       lượng (nó trả lời "ô này có việc gì", không phải "anh còn sức không"),
       nên trước đây ở 0 năng lượng nút vẫn ghi CÀY sáng xanh, `USE` vẫn khoá
       0,42 giây, rồi tới lúc cuốc chạm đất mới trượt — và cái nút chưa bao giờ
       nói vì sao. */
    const can = energyFor(content, use);
    if (can > 0 && state.energy < can) return { t: "deny", why: "Hết năng lượng — về ngủ", kind: use };
    if (inReach(state, x, y)) return cho({ t: "use", kind: use, x, y, run: runAfter(state, content, use, opts) });
    if (opts.canGo) return cho(goTo(x, y, "use", use));
  }

  /* THUYỀN BUÔN đang cập bến ngay cạnh: thắng mọi vật thể trên lưới. Con
     thuyền nằm TRÊN mặt nước, nên ô người chơi ngắm vào nó chính là một ô
     nước "MÚC được" — không xét thuyền trước thì đứng sát sạp mà nút ghi MÚC. */
  if (opts.context) {
    const th = boatAt(state, Math.floor(state.player.x / TILE), Math.floor(state.player.y / TILE));
    if (th) return cho({ t: "boat", id: th.id });
  }

  /* 5. vật thể ngay ô ngắm — trừ khi ô ngắm là ô DƯỚI CHÂN: đứng trên cầu tàu
     thì "ô ngắm" là mặt nước dưới ván, và MÚC ở đó không phải thứ người chơi
     chỉ vào; để bước 6 xử lý (mặt nước kề, vật thể trong hai ô). */
  const oChan = x === Math.floor(state.player.x / TILE) && y === Math.floor(state.player.y / TILE);
  const vt = oChan ? null : interactAt(state, content, x, y);
  if (vt) {
    if (interactReady(state, vt, x, y)) return cho({ t: "interact", kind: vt, x, y });
    if (opts.canGo) return cho(goTo(x, y, "interact", INTERACT_KIND[vt]));
  }

  // 6. quanh chân
  if (opts.context) {
    const ca = contextAction(state, content, x, y);
    const p = ca ? fromCtx(ca) : null;
    if (p) return cho(p);
  }

  const why = explain(state, content, x, y) ?? whyXa;

  // 7. chuyến của món đang cầm
  if (opts.context && only === "any" && !state.carry) {
    const r = runFor(state, content);
    if (r) return { t: "run", run: r, why };
  }

  return { t: "deny", why };
}

/** Chuyến sẽ tiếp tục sau một nhát `kind` — chỉ khi nhát ấy cùng loại với chuyến. */
function runAfter(state: GameState, content: Content, kind: Exclude<UseKind, null>, opts: PressOptions): Run | null {
  if (!opts.context) return null;
  const r = runFor(state, content);
  return r && (r.jobs as string[]).includes(kind) ? r : null;
}

/** Nhãn của một cú bấm — thứ HUD in lên nút. */
export function hintOf(p: Press): Hint {
  switch (p.t) {
    case "deny":
      return p.kind
        ? { kind: p.kind, label: LABEL[p.kind], ready: false, why: p.why }
        : { kind: null, label: "DÙNG", ready: false, why: p.why };
    case "build":
      return { kind: "build", label: LABEL.build, ready: true, why: null };
    case "use":
      return { kind: p.kind, label: LABEL[p.kind], ready: true, why: null, at: { x: p.x, y: p.y } };
    case "gather":
      return { kind: "gather", label: LABEL.gather, ready: true, why: null, at: { x: p.x, y: p.y } };
    case "interact":
      return { kind: INTERACT_KIND[p.kind], label: LABEL[INTERACT_KIND[p.kind]], ready: true, why: null, at: { x: p.x, y: p.y } };
    case "boat":
      return { kind: "boat", label: LABEL.boat, ready: true, why: null };
    case "go":
      return {
        kind: p.kind,
        label: LABEL[p.kind],
        ready: false,
        why: `Cách ${p.dist} ô — bấm để đi tới`,
        at: { x: p.x, y: p.y },
      };
    case "run":
      /* Nhãn giữ "DÙNG": chuyến chỉ lúc chạy mới biết còn việc hay không, và
         câu về Ô ĐANG NGẮM ("Cày trước đã") vẫn là câu người chơi đang hỏi. */
      return { kind: null, label: "DÙNG", ready: false, why: p.why };
  }
}

/**
 * Gợi ý cho NÚT NGỮ CẢNH (A) ở ô (x,y) — hình chiếu của `pressPlan` với mọi
 * quyền bật (nút ngữ cảnh bật, được đi tới). Giữ chữ ký cũ cho HUD và test.
 */
export function hintAt(state: GameState, content: Content, x: number, y: number): Hint {
  return hintOf(pressPlan(state, content, { x, y }, { context: true, canGo: true }));
}

/**
 * Gợi ý cho NÚT NGỮ CẢNH PHỤ: **chỉ TRA CỨU, không bao giờ đổi state**.
 *
 * Cường chốt vai của hai nút bằng đúng một câu: "một nút ngữ cảnh chính là
 * hành động, một nút ngữ cảnh phụ là tra cứu thông tin gần đó."
 *
 * Trước đây nút này gánh cả hai vai — mở cửa hàng, lên giường, múc nước (HÀNH
 * ĐỘNG) lẫn mở bảng con vật (TRA CỨU) — và vai hành động luôn nuốt vai tra
 * cứu: đứng cạnh quầy thu mua thì không còn cách nào xem thẻ ô đang ngắm.
 * Toàn bộ nhánh hành động đã chuyển sang nút CHÍNH (nấc 5 của `contextAction`),
 * nên ở đây chỉ còn ba thứ, và cả ba đều chỉ MỞ MỘT CÁI BẢNG.
 *
 * Thứ tự đi từ CỤ THỂ ra RỘNG: một con vật cụ thể → cả cái khu → cái ô đang
 * ngắm. Con vật trước vì người chơi nhìn thấy nó chứ không nhìn thấy nền đất.
 */
export type InfoHint =
  | { what: "animal"; label: string; id: number }
  | { what: "worker"; label: string; id: number }
  | { what: "pen"; label: string; id: string }
  | { what: "tile"; label: string; x: number; y: number };

/**
 * Nút PHỤ nói gì — MỘT hàm cho cả HUD lẫn cú bấm.
 *
 * Thứ tự là thứ tự cú bấm vẫn dùng từ Đợt 13, giờ HUD cũng đi đúng đường đó
 * (trước đây HUD không hỏi người làm, nên nút ghi "BẢNG KHU" mà bấm ra thẻ
 * người làm):
 *   1. NGƯỜI LÀM quanh ô ngắm (nếu trong tầm), rồi quanh chân — thẻ "đang làm
 *      gì, lương bao nhiêu" là thứ người chơi mở nhiều nhất khi mới thuê.
 *   2. `interactHint` quanh CHÂN — nút phụ nói về thứ mình đang đứng cạnh.
 *   3. `interactHint` ở ô ngắm.
 */
export function infoHint(
  state: GameState,
  content: Content,
  cursor: { x: number; y: number } | null,
): InfoHint | null {
  const px = Math.floor(state.player.x / TILE);
  const py = Math.floor(state.player.y / TILE);
  const nl =
    (cursor && inReach(state, cursor.x, cursor.y) ? workerNear(state, cursor.x, cursor.y) : null) ??
    workerNear(state, px, py);
  if (nl) {
    const ten = nl.worker?.name;
    return { what: "worker", label: ten ? `XEM ${ten.toUpperCase()}` : "XEM NGƯỜI LÀM", id: nl.id };
  }
  return interactHint(state, content, px, py) ?? (cursor ? interactHint(state, content, cursor.x, cursor.y) : null);
}

export function interactHint(
  state: GameState,
  content: Content,
  x: number,
  y: number,
): InfoHint | null {
  /* Ở TRONG (hoặc sát vách) một khu thì BẢNG KHU thắng con vật đứng cạnh.

     Cường: "gần chuồng là ưu tiên nút Xem bảng khu". Trước đây thứ tự ngược
     lại, và hệ quả là đứng GIỮA chuồng bò — chỗ lúc nào cũng có một con bò
     trong tầm — thì nút phụ luôn ghi "XEM BÒ" của đúng một con ngẫu nhiên,
     trong khi câu người chơi hỏi khi bước vào chuồng là "cái chuồng này thế
     nào". Muốn xem từng con thì vẫn còn nút vai / `cycleAnimal`.

     Lề ở đây HẸP (`PEN_INSIDE` = 1) chứ không phải `PEN_MARGIN` = 4: đứng
     trong chuồng, hoặc ngay ngoài rào, mới là "đang ở chỗ cái chuồng". Bốn ô
     thì một con bò xổng chuồng đứng ngay dưới chân vẫn thua cái chuồng ở đằng
     kia — mà lúc ấy người chơi rõ ràng đang hỏi về con bò. */
  const trongKhu = penNear(state, content, x, y, PEN_INSIDE);
  if (trongKhu) return { what: "pen", label: "BẢNG KHU", id: trongKhu.id };

  const an = animalNear(state, x, y);
  if (an) {
    const ten = content.animals[an.def]?.name;
    return { what: "animal", label: ten ? `XEM ${ten.toUpperCase()}` : "XEM", id: an.id };
  }

  /* Xa hơn một chút mà không có con nào để chỉ vào: vẫn là BẢNG KHU. Đây là
     lề rộng `PEN_MARGIN`, cùng con số nút CHÍNH dùng — đi ngang qua chuồng là
     đọc được tình hình chuồng, không phải đi tới tận nơi. */
  const khu = penNear(state, content, x, y, PEN_MARGIN);
  if (khu) return { what: "pen", label: "BẢNG KHU", id: khu.id };

  /* Cuối cùng: THẺ Ô. Luôn có gì đó để nói về một ô — cây gì còn mấy ngày,
     máng còn mấy phần, luống đã tưới chưa — nên nút phụ gần như không bao giờ
     tắt ngóm, và đó là điểm khác lớn nhất so với bản cũ. */
  if (tileInfo(state, content, x, y)) return { what: "tile", label: "XEM Ô", x, y };
  return null;
}

/**
 * Một câu về Ô này — thứ nút ngữ cảnh PHỤ đọc ra.
 *
 * Nói con số mà người chơi thật sự phải nhẩm: cây còn mấy ngày nữa chín, máng
 * còn mấy phần trên mấy. Không phải tên loại đất.
 */
export function tileInfo(
  state: GameState,
  content: Content,
  x: number,
  y: number,
): string | null {
  const t = tileAt(state, x, y);
  if (!t) return null;

  if (t.prop === "trough") {
    const con = troughStock(state, x, y);
    const mon = t.troughId ? ` · ${itemName(t.troughId, content)}` : "";
    return `Máng: ${con}/${troughMax(content)} điểm${mon}`;
  }

  const ao = pondAt(state, content, x, y);
  if (ao) {
    const noi = t.trough ?? 0;
    return noi > 0 ? `${ao.name}: ${noi} điểm thức ăn đang nổi` : `${ao.name}`;
  }

  if (t.crop) {
    const def = content.crops[t.crop.id];
    if (!def) return null;
    if (t.crop.sick) return `${def.name} — ĐANG BỆNH, cần thuốc`;
    if (isRipe(t, content)) return `${def.name} — chín, thu được rồi`;
    /* Còn mấy ngày: cộng nốt phần chưa tích của giai đoạn hiện tại với trọn
       các giai đoạn sau. Làm tròn LÊN — nói "còn 0 ngày" cho cây chưa chín là
       nói dối. */
    const per = Math.max(1, content.balance.growthMinutesPerDay);
    let phut = Math.max(0, (def.growthDays[t.crop.stage] ?? 0) * per - t.crop.grow);
    for (let i = t.crop.stage + 1; i < def.growthDays.length; i++) phut += (def.growthDays[i] ?? 0) * per;
    const ngay = Math.max(1, Math.ceil(phut / per));
    return `${def.name} — còn ${ngay} ngày${t.wet ? "" : " · chưa tưới"}`;
  }

  if (t.b) {
    const def = content.buildings[t.b];
    if (def) return def.name;
  }
  if (t.prop) {
    const def = propDef(content, t.prop);
    if (def) return def.hits ? `${def.name} — còn ${t.hp} nhát` : def.name;
  }
  if (t.tilled) return t.wet ? "Luống đã cày · đã tưới" : "Luống đã cày · chưa tưới";
  return null;
}

/**
 * Việc nút CHÍNH sẽ làm khi Ô ĐANG NGẮM không có gì — và ô phải tới để làm.
 *
 * Đây là chỗ duy nhất trả lời câu "quanh đây có việc gì". `pressPlan` gọi nó
 * ở nấc 6, và cả nhãn lẫn cú bấm đều đi qua `pressPlan` — một nguồn, nên nút
 * không bao giờ nói một đằng làm một nẻo (từ Đợt 21; trước đó `main.ts` có bộ
 * luật riêng và hai bên đã trôi khỏi nhau).
 *
 * Thứ tự có lý do:
 *   1. CON VẬT trong tầm đang tới lứa. Người chơi nhìn thấy con bò trước khi
 *      nhìn thấy nền đất, nên nút phải nói về con bò.
 *   2. Việc làm được với THỨ ĐANG CẦM ở ô gần nhất quanh chân. Đây là phần
 *      "bám theo địa hình": cầm cuốc đứng cạnh luống, ngắm hụt sang ô đường
 *      thì nút vẫn ghi CÀY và dắt sang đúng ô đất.
 *   3. Việc của cả KHU (đổ máng, thu cả đàn) — rộng nhất nên xét cuối.
 */
export type CtxAction = {
  kind: Exclude<HintKind, null>;
  label: string;
  at: { x: number; y: number };
  /** con vật cụ thể (chỉ với `gather`) — để cú bấm thu ĐÚNG con nút đang nói */
  id?: number;
};

export function contextAction(
  state: GameState,
  content: Content,
  x: number,
  y: number,
): CtxAction | null {
  const px = Math.floor(state.player.x / TILE);
  const py = Math.floor(state.player.y / TILE);

  /* Ứng viên được xếp theo hai bậc, và bậc trên thắng TUYỆT ĐỐI:

       bậc 1 — việc CÓ ĐƯỢC LÀ NHỜ MÓN ĐANG CẦM (đổ máng, rắc hồ, cho ăn,
               gieo, tưới, cày, chữa, xây, đặt xuống)
       bậc 2 — việc vốn vẫn làm được (thu, vắt sữa, chặt, đập, nhấc, mở cửa
               hàng/giường/giếng/kho)

     Trong cùng bậc thì gần hơn thắng. Nhờ vậy "cầm bao cám đứng gần chuồng gà"
     luôn ra ĐỔ MÁNG, không bao giờ ra nhổ cỏ — dù bụi cỏ ở ngay dưới chân còn
     cái máng ở cách bốn ô. */
  let best: CtxAction | null = null;
  let bestBac = 9;
  let bestD = Infinity;
  const xet = (kind: Exclude<HintKind, null>, at: { x: number; y: number }, id?: number) => {
    const bac = nhoMonDangCam(kind) ? 0 : 1;
    /* Ứng viên nằm ĐÚNG Ô ĐANG NGẮM thắng mọi cuộc hoà trong cùng bậc: người
       chơi đang chỉ vào nó. Trước đây hoà thì thứ được xét TRƯỚC thắng — một
       luật không ai đoán được từ ngoài. */
    const d = at.x === x && at.y === y ? -1 : Math.hypot(at.x - px, at.y - py);
    if (bac > bestBac || (bac === bestBac && d >= bestD)) return;
    bestBac = bac;
    bestD = d;
    best = { kind, label: LABEL[kind], at, ...(id !== undefined ? { id } : {}) };
  };

  // 1. CON VẬT quanh mình — vắt sữa. (Cho ăn đi đường MÁNG ở bước 2.)
  //    Quanh ô ngắm: cùng bán kính 1,4 với cú bấm; quanh chân: rộng hơn một
  //    chút (2,2) để "con bò ngay bên cạnh" vẫn được kể. Trả kèm `id`, nên cú
  //    bấm thu ĐÚNG con này chứ không quét lại rồi vớ phải con khác.
  for (const [ax, ay, r] of [
    [x, y, 1.4],
    [px, py, 2.2],
  ] as [number, number, number][]) {
    const an = readyAnimalNear(state, content, ax, ay, r);
    if (!an) continue;
    xet("gather", { x: Math.floor(an.x / TILE), y: Math.floor(an.y / TILE) }, an.id);
  }

  // 2. Việc của cả KHU (đổ máng, rắc hồ, thu cả đàn) — lề rộng, xem `penAction`.
  const pa = penAction(state, content, x, y);
  if (pa) xet(pa.kind, pa.at);

  /* 3. THUYỀN BUÔN đang cập bến.

     Cái sạp là CHÍNH CON THUYỀN, không phải một ô nào cả, nên nó không đi qua
     `interactNear` (thứ chỉ biết đọc vật thể trên lưới) mà hỏi thẳng danh sách
     thực thể. Vì sao không đặt một vật thể "sạp" lên ô bến cho gọn: cái sạp
     chỉ tồn tại trong lúc con thuyền còn đó, mà lưới ô nằm trong save và không
     ai dọn nó đi khi thuyền nhổ neo — một cái sạp ma đứng lại giữa biển là thứ
     không cách nào sửa từ phía người chơi. */
  const th = boatAt(state, px, py);
  if (th) xet("boat", { x: Math.floor(th.x / TILE), y: Math.floor(th.y / TILE) });
  /* Thuyền thắng mọi thứ cùng bậc quanh chân — nó chỉ ghé vài giờ mỗi ba
     ngày, còn mặt nước để MÚC quanh bến thì lúc nào cũng có. */
  if (th && bestBac > 0) return best;

  /* 4. Ô ĐANG NGẮM có vật thì câu trả lời phải nói về NÓ.

     Một cái cây, một luống rau, một công trình — hoặc mình đang vác đồ. Người
     chơi CHỦ Ý chỉ vào đó, và câu "Cần rìu" / "Lùi ra rồi đặt" đúng là thứ họ
     đang hỏi. Đổi nhãn sang một việc ở ô khác lúc đó là nuốt mất câu trả lời.

     Ba ngoại lệ, và cả ba đều là ca người chơi từng thấy nút "DÙNG" trống:
       · việc thuộc bậc 0 vẫn thắng — cầm bao cám mà ngắm vào bụi cỏ thì ý
         định vẫn là cho gà ăn;
       · ô dưới CHÂN không tính — đứng trên cầu tàu, ô ngắm rơi vào chính ô
         mình đứng, mà cầu tàu là một "vật";
       · vật ĐI XUYÊN được và không có gì để nói (cầu, cầu tàu: không đập,
         không tương tác) không tính — chúng là nền, không phải vật.
     Và cửa thoát này chỉ chặn phép QUÉT ô làm việc (bước 5), không chặn vật
     thể trong hai ô (bước 6): đứng cạnh cái giếng thì "MÚC" là câu trả lời
     dù có đang ngắm vào một gốc cây. */
  const t0 = tileAt(state, x, y);
  const oChan = x === px && y === py;
  const pd = t0?.prop ? propDef(content, t0.prop) : null;
  const vatNen = !!pd && pd.solid === false && !pd.hits && !pd.interact;
  const oNgamCoVat = !oChan && !!t0 && ((!!t0.prop && !vatNen) || !!t0.crop || !!t0.b);
  /* Đang VÁC thì không quét gì thêm: hai tay bận, chỉ còn ĐẶT XUỐNG ở ô ngắm
     (`canUseAt` lo) và câu "vì sao không đặt được ở đây" (`explain` lo). */
  if (state.carry) return best;

  /* 5. Quét quanh CHÂN trong `CTX_RADIUS` ô.
     `nearestTarget` hỏi `canUseAt` với đúng ô hotbar đang chọn — không giả định
     một món khác, không đổi ô. */
  if (!oNgamCoVat || bestBac === 0) {
    const gan = nearestTarget(state, content, null, null, {
      radius: CTX_RADIUS,
      requireReach: false,
    });
    if (gan && !DON_DEP.has(gan.kind)) xet(gan.kind, { x: gan.x, y: gan.y });
  }

  /* 6. VẬT THỂ BIẾT NÓI CHUYỆN quanh chân: cửa hàng, quầy bán, bàn chế tạo,
     giường, giếng, kho, cửa nhà.

     Trước đây đây là việc của nút PHỤ. Cường tách lại cho đúng vai: "một nút
     ngữ cảnh chính là hành động, một nút ngữ cảnh phụ là tra cứu thông tin gần
     đó" — mà mở cửa hàng, lên giường, múc nước đều là HÀNH ĐỘNG.

     Bậc 1, nên bất cứ việc nào nhờ món đang cầm vẫn thắng: đứng cạnh cái giếng
     cầm bình tưới mà ô dưới chân cày rồi thì nút vẫn ghi TƯỚI, không phải MÚC
     NƯỚC. Trong cùng bậc thì gần hơn thắng.

     Lề ở đây CỐ Ý hẹp hơn `CTX_RADIUS` — `INTERACT_SCAN` = 2 ô, tức "tôi đang
     đứng NGAY chỗ nó". Nới ra sáu ô thì đứng ở sân nhà là cái giếng và cái cửa
     lúc nào cũng nằm trong tầm, và nút ngữ cảnh thôi nói về ô người chơi đang
     ngắm: cầm hạt đứng trên ruộng chưa cày mà nút ghi "MÚC" thì nó vừa nuốt
     mất câu "Cày trước đã" vừa rủ đi làm một việc không ai hỏi. Còn một cái
     quầy thì đằng nào cũng phải đi tới tận nơi mới mua bán được. */
  const vt = interactNear(state, content, px, py);
  if (vt) xet(INTERACT_KIND[vt.kind], { x: vt.x, y: vt.y });

  return best;
}


/**
 * Con vật TỚI LỨA gần (x,y) nhất trong `r` ô — không phải con gần nhất bất kỳ.
 *
 * `animalNear` trả về con gần nhất rồi mới hỏi tới lứa chưa: hai con bò, con
 * kề chân chưa tới lứa, con cách hai ô tới lứa — nút im. Hỏi đúng câu "con
 * nào THU được" thì con thứ hai được kể.
 */
function readyAnimalNear(state: GameState, content: Content, x: number, y: number, r: number): Entity | null {
  const cx = x * TILE + TILE / 2;
  const cy = y * TILE + TILE / 2;
  let best: Entity | null = null;
  let bestD = Infinity;
  for (const e of state.entities) {
    if (e.map !== state.mapId || e.kind !== "animal" || !content.animals[e.def]) continue;
    const d = Math.hypot(e.x - cx, e.y - cy) / TILE;
    if (d > r || d >= bestD) continue;
    if (readyProduct(e, content) < 0) continue;
    bestD = d;
    best = e;
  }
  return best;
}

/**
 * THUYỀN BUÔN đang cập bến trong tầm với của (x,y), hoặc null.
 *
 * "Đang cập bến" = đã tới nơi và đang đứng chờ (`ai.phase === "wait"`). Thuyền
 * còn đang bơi vào hay đã nhổ neo thì không mua bán gì được — người chơi nhìn
 * thấy nó ngoài xa mà nút vẫn sáng là một lời hứa suông.
 */
export function boatAt(state: GameState, x: number, y: number): Entity | null {
  for (const e of state.entities) {
    if (e.kind !== "vehicle" || e.map !== state.mapId) continue;
    if (e.veh?.errand?.kind !== "shop" || e.ai.phase !== "wait") continue;
    const d = Math.max(Math.abs(Math.floor(e.x / TILE) - x), Math.abs(Math.floor(e.y / TILE) - y));
    if (d <= INTERACT_SCAN) return e;
  }
  return null;
}

/**
 * Việc đáng làm nhất ở KHU quanh (x,y), kèm ô phải đứng để làm.
 *
 * Dùng cho nút CHÍNH: đứng trong chuồng, cầm bó rơm, ngắm vào một ô bê tông
 * trống — trước đây nút ghi "DÙNG" và bấm thì không có gì xảy ra, dù cái máng
 * chỉ cách ba ô. Nút phải nói được việc của CHỖ ĐANG ĐỨNG, không chỉ việc của
 * đúng một ô.
 */
/**
 * Bán kính nút ngữ cảnh CHÍNH nhìn quanh NHÂN VẬT, tính bằng ô.
 *
 * Sáu ô: đủ rộng để "đứng gần chuồng gà" tính là gần thật (rào cách vài ô vẫn
 * nhận ra), đủ hẹp để một cú bấm không bao giờ đưa nhân vật ra khỏi chỗ người
 * chơi đang nhìn.
 *
 * Trước đây chỗ này hỏi `autoJob` với bán kính `max(w, h)` — tức CẢ BẢN ĐỒ —
 * và còn tự đổi ô hotbar. Đó chính là cảnh Cường gặp: đứng cạnh chuồng gà cầm
 * bao bắp, bấm một cái, nhân vật đổi sang cái cuốc rồi chạy đi nhổ cỏ ở góc
 * khác.
 */
export const CTX_RADIUS = 6;

/**
 * Lề quanh hình chữ nhật KHU vẫn còn tính là "đang ở gần chuồng", tính bằng ô.
 *
 * Trước đây là 1 — đứng cách rào hai ô là đã ngoài tầm, nên `penAction` không
 * nổ và nút rơi xuống nhánh quét chung rồi rủ đi nhổ cỏ. Cường mô tả đúng cảnh
 * đó: "rõ ràng là tôi đang ở gần chuồng gà".
 */
export const PEN_MARGIN = 4;

/**
 * Lề HẸP: bấy nhiêu ô quanh khu vẫn tính là "tôi đang ĐỨNG TRONG cái khu này".
 *
 * Một ô — tức là trong ruột khu, hoặc đúng cái vòng ô ngay ngoài rào. Đây là
 * ranh giới `interactHint` dùng để cho BẢNG KHU thắng một con vật đứng cạnh.
 */
export const PEN_INSIDE = 1;

/**
 * Việc này CÓ ĐƯỢC LÀ NHỜ MÓN ĐANG CẦM, hay nó vốn vẫn làm được?
 *
 * Đây là ranh giới quyết định của cả nút ngữ cảnh. `canUseAt` trả về `chop`
 * cho một bụi cỏ kể cả khi tay đang cầm bao cám — vì cỏ nhổ được bằng tay
 * không. Nên nếu chỉ lấy "việc gần nhất" thì nhổ cỏ luôn thắng đổ máng, và
 * người chơi thấy nhân vật bỏ cái chuồng gà mà đi nhổ cỏ.
 *
 * Việc thuộc nhóm này thắng TUYỆT ĐỐI mọi việc ngoài nhóm: người chơi chọn cái
 * món đó trên hotbar là đã nói rõ mình định làm gì.
 */
/**
 * Việc DỌN DẸP — chặt, đập, nhấc, nhổ.
 *
 * Chúng KHÔNG bao giờ được tự nhận từ phép quét quanh chân, chỉ khi người chơi
 * NGẮM THẲNG vào chúng (`hintAt` hỏi ô đang ngắm trước, rồi mới tới đây).
 *
 * Vì sao: `canUseAt` cho phép nhổ cỏ và nhấc đá bằng tay không, nên chúng có
 * mặt ở gần như mọi chỗ trên bản đồ. Để chúng vào phép quét thì cầm bao hạt
 * đứng giữa đồng, bấm một cái, nhân vật đi nhổ một bụi cỏ nào đó — đúng câu
 * Cường tả: "bấm vô cái nó chạy đi tùm lum nhổ cỏ lượm đá". Ba trong bốn cái
 * này còn không hoàn tác được.
 */
const DON_DEP = new Set<Exclude<HintKind, null>>(["chop", "mine", "lift", "pull"]);

export function nhoMonDangCam(kind: Exclude<HintKind, null>): boolean {
  switch (kind) {
    case "pour":
    case "feedpond":
    case "plant":
    case "water":
    case "till":
    case "cure":
    case "build":
    case "putdown":
      return true;
    default:
      return false;
  }
}

export function penAction(
  state: GameState,
  content: Content,
  x: number,
  y: number,
): { kind: Exclude<HintKind, null>; label: string; at: { x: number; y: number } } | null {
  const khu = penNear(state, content, x, y, PEN_MARGIN);
  if (!khu) return null;
  const tt = penSummary(state, content, khu);

  /* Cầm đúng thức ăn mà chỗ chứa còn chỗ → đổ, đích là chính chỗ chứa.

     HỒ CÁ nói khác: ở đó KHÔNG CÓ cái máng nào, thức ăn rắc thẳng xuống mặt
     nước. Nhãn "ĐỔ MÁNG" đứng trước một mặt hồ là một câu nói dối nhỏ mà hậu
     quả không nhỏ — người chơi đọc "máng", nhìn quanh không thấy máng, rồi kết
     luận là chưa cho cá ăn được. Thao tác thì vẫn chạy đúng từ đầu; chỉ mỗi
     cái nhãn sai. */
  const cam = selectedItemId(state.inv, state.sel);
  if (tt.mang && cam && tt.feeds.includes(cam) && tt.mang.n < tt.mang.max) {
    const kind = khu.swim ? "feedpond" : "pour";
    return { kind, label: LABEL[kind], at: { x: tt.mang.x, y: tt.mang.y } };
  }

  // Có con tới lứa → thu, đích là con gần nhất trong khu.
  if (tt.toiLua > 0) {
    let best: { x: number; y: number } | null = null;
    let bestD = Infinity;
    for (const e of state.entities) {
      if (e.kind !== "animal" || e.map !== state.mapId) continue;
      if (content.animals[e.def]?.pen !== khu.id) continue;
      if (readyProduct(e, content) < 0) continue;
      const ex = Math.floor(e.x / TILE);
      const ey = Math.floor(e.y / TILE);
      const dd = Math.hypot(ex - x, ey - y);
      if (dd < bestD) {
        bestD = dd;
        best = { x: ex, y: ey };
      }
    }
    if (best) return { kind: "gather", label: LABEL.gather, at: best };
  }
  return null;
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

/* ============================================================================
   TỰ ĐỘNG LÀM — chọn CẢ việc lẫn thứ phải cầm trên tay.

   `nearestTarget` chỉ trả lời được "với thứ đang cầm thì làm được gì ở đâu".
   Nên bật tự động lúc đang cầm cuốc thì nó cày cả nông trại rồi dừng — không
   gieo, không tưới, không thu. Đúng là một cái máy cày, không phải một nông dân.

   Ở đây làm ngược lại: đi theo THỨ TỰ VIỆC trước, rồi mới tìm ô hotbar nào cho
   phép làm việc đó. Trả về cả `slot` để nơi gọi đổi tay trước khi ra tay.
============================================================================ */

/**
 * Thứ tự ưu tiên của một nông dân, và mỗi bậc đều có lý do:
 *
 *   1. THU     — cây đã chín là giá trị đã xong; để qua đêm là mời chuột và bão.
 *   2. CHỮA    — cây bệnh đứng yên không lớn, mỗi đêm chậm là mất trọn một ngày.
 *   3. GIEO    — ô đất trống là ô đất đang phí.
 *   4. TƯỚI    — tưới SAU khi gieo, để lứa vừa gieo được tính ngay đêm nay.
 *   5. CÀY     — mở thêm đất, việc ít gấp nhất.
 *
 * Cố ý KHÔNG có CHẶT và ĐẬP: bật tự động rồi quay đi một lúc mà về thấy sạch
 * bóng cây với đá trên cả nông trại là một thứ không hoàn tác được, và không ai
 * yêu cầu nó. Muốn dọn thì bấm tay.
 */
export const AUTO_ORDER: Exclude<UseKind, null>[] = [
  // ĐỔ MÁNG và RẮC HỒ đứng ĐẦU: con vật chết đói được, cây thì chỉ đứng chờ.
  // Và đây là thứ làm nút ngữ cảnh đúng nghĩa — cầm bó rơm bấm một cái thì
  // nhân vật tự đi hết các khu mà đổ, không phải lội tới từng cái máng.
  "pour",
  "feedpond",
  "harvest",
  "cure",
  "plant",
  "water",
  "till",
];

export interface AutoJob {
  x: number;
  y: number;
  kind: Exclude<UseKind, null>;
  /** Ô hotbar phải cầm để làm được việc này. */
  slot: number;
}

/**
 * Những ô hotbar có thể làm ra `kind`.
 *
 * Lọc trước theo LOẠI VẬT PHẨM thay vì thử từng ô trên từng ô đất: 10 ô hotbar
 * × 5 loại việc × 625 ô quét là hai vạn lần hỏi mỗi lần chọn việc. Lọc trước
 * thì mỗi loại việc chỉ còn một hai ô ứng viên.
 *
 * "harvest" trả về ô đang chọn: `canUseAt` xét cây chín TRƯỚC khi nhìn tay, nên
 * thu hoạch được với bất cứ thứ gì đang cầm.
 */
function slotsFor(state: GameState, content: Content, kind: Exclude<UseKind, null>): number[] {
  if (kind === "harvest") return [state.sel];
  const n = Math.max(0, content.balance.hotbarSlots | 0);
  const out: number[] = [];
  /* THỨC ĂN: mọi món mà một khu nào đó nhận. Đọc từ `pens[].feeds` chứ không
     liệt kê id — thêm một khu mới trong content là nút ngữ cảnh tự biết. */
  const an =
    kind === "pour" || kind === "feedpond"
      ? new Set((content.tiles.pens ?? []).flatMap((q) => q.feeds ?? []))
      : null;
  for (let i = 0; i < n; i++) {
    const id = state.inv[i]?.id;
    if (!id) continue;
    if (an) {
      if (an.has(id)) out.push(i);
      continue;
    }
    const it = parseItem(id);
    if (!it) continue;
    if (kind === "cure" && it.kind === "item" && it.ref === "medicine") out.push(i);
    else if (kind === "plant" && it.kind === "seed") out.push(i);
    else if (kind === "water" && it.kind === "tool" && content.tools[it.ref]?.action === "WATER")
      out.push(i);
    else if (kind === "till" && it.kind === "tool" && content.tools[it.ref]?.action === "TILL")
      out.push(i);
  }
  return out;
}

/**
 * Việc kế tiếp cho chế độ tự động, kèm ô hotbar phải cầm.
 *
 * Quét theo vòng từ chân ra, y hệt `nearestTarget`, nhưng cho từng cặp
 * (việc, ô hotbar) và chỉ nhận đúng loại việc đang xét. Bậc ưu tiên là TUYỆT
 * ĐỐI: còn một cây chín ở cuối ruộng thì vẫn đi thu trước khi cày ô ngay dưới
 * chân. Nếu không thì cây chín nằm đó cả ngày trong khi nhân vật cày vòng
 * quanh, và đó đúng là thứ trông như hỏng.
 */
export function autoJob(
  state: GameState,
  content: Content,
  radius: number,
  /**
   * NEO — tìm việc quanh ô này thay vì quanh chỗ nhân vật đang đứng.
   *
   * Vì sao cần: chế độ tự động hay phải rời chỗ làm để đi múc nước. Xong việc
   * đó mà lại tìm việc quanh CÁI GIẾNG thì nó nhảy sang làm dở dang một góc
   * ruộng khác, rồi lần sau lại nhảy chỗ khác nữa — người chơi bật tự động lên
   * và thấy nông trại bị cày lỗ chỗ khắp nơi thay vì xong gọn từng lô. Neo giữ
   * cho nó QUAY LẠI đúng chỗ đang làm dở rồi mới làm tiếp.
   */
  from?: { x: number; y: number },
): AutoJob | null {
  const px = from ? from.x * 16 + 8 : state.player.x;
  const py = from ? from.y * 16 + 8 : state.player.y;
  const cx = Math.floor(px / 16);
  const cy = Math.floor(py / 16);
  const R = Math.max(0, Math.floor(radius));

  for (const kind of AUTO_ORDER) {
    const slots = slotsFor(state, content, kind);
    if (!slots.length) continue;

    let best: AutoJob | null = null;
    let bestScore = Infinity;

    const consider = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= state.w || y >= state.h) return;
      for (const slot of slots) {
        if (canUseAt(state, content, x, y, true, slot) !== kind) continue;
        const d = Math.hypot(x * 16 + 8 - px, y * 16 + 8 - py);
        if (d < bestScore) {
          bestScore = d;
          best = { x, y, kind, slot };
        }
        break; // ô nào cũng làm được thì lấy ô đầu — chúng cho ra cùng việc
      }
    };

    /* Vành quét KẸP VÀO BIÊN bản đồ. Với R = 48 trên lưới 48×37, phần lớn các
       vành ngoài nằm hoàn toàn ngoài bản đồ: trước đây vẫn gọi `consider` cho
       từng ô rồi trả về ngay ở phép kiểm biên — ~9.400 lần gọi rỗng cho MỖI
       loại việc. Kẹp dx/dy vào [0, w) × [0, h) thì không còn lần gọi rỗng nào,
       và vành nào nằm trọn ngoài biên thì bỏ luôn. */
    const Rmax = Math.max(cx, state.w - 1 - cx, cy, state.h - 1 - cy);
    for (let r = 0; r <= Math.min(R, Rmax); r++) {
      if (r === 0) consider(cx, cy);
      else {
        const dxLo = Math.max(-r, -cx);
        const dxHi = Math.min(r, state.w - 1 - cx);
        if (cy - r >= 0) for (let dx = dxLo; dx <= dxHi; dx++) consider(cx + dx, cy - r);
        if (cy + r < state.h) for (let dx = dxLo; dx <= dxHi; dx++) consider(cx + dx, cy + r);
        const dyLo = Math.max(-r + 1, -cy);
        const dyHi = Math.min(r - 1, state.h - 1 - cy);
        if (cx - r >= 0) for (let dy = dyLo; dy <= dyHi; dy++) consider(cx - r, cy + dy);
        if (cx + r < state.w) for (let dy = dyLo; dy <= dyHi; dy++) consider(cx + r, cy + dy);
      }
      /* Cùng cận đã chứng minh ở `nearestTarget`, và ở đây nó CHẶT vì điểm số
         chỉ là khoảng cách: ô ở vòng r+1 trở ra cách ít nhất (r+1)*16-8 px.
         Dừng ngay khi vừa tìm thấy thì SAI: một ô CHÉO ở vòng 5 xa ~113px, còn
         một ô THẲNG ở vòng 6 chỉ 96px — vòng ngoài vẫn có thể gần hơn. */
      if (best !== null && bestScore <= (r + 1) * 16 - 8) break;
    }
    if (best) return best;
  }
  return null;
}
