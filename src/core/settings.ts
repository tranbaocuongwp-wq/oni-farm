/* ============================================================================
   SETTINGS — tuỳ chọn của NGƯỜI DÙNG, không phải của ván chơi.

   Khác biệt quan trọng với `GameState`: đây là sở thích gắn với cái MÁY đang
   ngồi, không phải với nông trại. Nó không được nằm trong save — mang file save
   sang máy khác thì cách điều khiển phải theo máy mới, chứ không kéo theo lựa
   chọn của máy cũ. Vì vậy nó ở localStorage riêng và không đi qua reducer.

   QUẢN LÝ CHẶT: mọi giá trị đi qua `parseSettings()` — một hàm THUẦN nhận
   bất kỳ thứ gì (JSON cũ, JSON hỏng, null) và luôn trả về một `Settings` hợp
   lệ. Khoá lạ bị bỏ, giá trị sai kiểu rơi về mặc định, số bị kẹp vào dải cho
   phép. Nhờ vậy thêm một tuỳ chọn mới không bao giờ làm hỏng máy đang có bản
   settings cũ, và hàm này test được trong Node vì không đụng DOM.

   Đọc/ghi đều nuốt lỗi: chế độ ẩn danh chặn localStorage thì game vẫn chạy với
   giá trị mặc định, chỉ là không nhớ được giữa các phiên.
============================================================================ */

import { setPadDead } from "./gamepad.ts";

const KEY = "oni-farm:settings";

/** Tăng khi đổi NGHĨA của một khoá (không phải khi thêm khoá mới — thêm khoá
 *  thì parseSettings đã tự điền mặc định). */
export const SETTINGS_VERSION = 2;

/**
 * Cách điều khiển trên thiết bị cảm ứng.
 *
 * · `tap`   — CHỈ chạm để đi (mặc định). Không có joystick, nên cú chạm nào
 *             cũng tới được thế giới. Đây là điểm mấu chốt: vùng nhận joystick
 *             phải phủ một mảng lớn góc dưới-trái mới bấm thoải mái, mà mảng đó
 *             lại nuốt luôn mọi cú chạm-để-đi rơi vào nó.
 * · `stick` — hiện joystick ảo cho ai quen điều khiển trực tiếp.
 */
export type ControlMode = "tap" | "stick";

/** Cỡ chữ và nút của HUD. `auto` = theo bề ngang màn hình (CSS clamp). */
export type UiScale = "auto" | "small" | "large";

/** Mức phóng khung nhìn: `near` thấy ít ô hơn nhưng to hơn (màn nhỏ / mắt kém),
 *  `far` thấy nhiều ô hơn (tablet, desktop). Tính bằng SỐ Ô ở camera.ts. */
export type ZoomLevel = "near" | "normal" | "far";

export interface Settings {
  v: number;
  control: ControlMode;
  /** Tay thuận: `left` lật cụm nút sang trái để ngón cái trái với tới. */
  hand: "right" | "left";
  uiScale: UiScale;
  zoom: ZoomLevel;
  /** Rung nhẹ khi thao tác thành công (navigator.vibrate, chỉ Android/Chrome). */
  haptics: boolean;
  /** Tắt nhấp nháy/chuyển cảnh cho ai say chuyển động (cũng theo prefers-reduced-motion). */
  reduceMotion: boolean;
  /** Đã xem hướng dẫn lần đầu chưa. */
  tutorialSeen: boolean;
  /** Hiện nút hành động theo ngữ cảnh (CÀY / GIEO / TƯỚI…) thay vì nút DÙNG cố định. */
  contextButton: boolean;
  /**
   * VÙNG CHẾT của cần gạt tay cầm.
   *
   * Đây là thứ duy nhất trong cả bộ điều khiển hỏng theo PHẦN CỨNG chứ không
   * theo sở thích: cần gạt mòn thì nghỉ ở một chỗ lệch tâm, và nếu độ lệch đó
   * vượt ngưỡng thì nhân vật tự đi mãi về một phía mà người chơi không đụng
   * vào gì. Không chỉnh được nghĩa là cái tay cầm đó không chơi được, chấm hết.
   *
   * `normal` = 0,28 (mặc định cũ). `rong` cho tay cầm đã trôi nhiều.
   */
  padDead: "hep" | "normal" | "rong";
}

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
  v: SETTINGS_VERSION,
  control: "tap",
  hand: "right",
  uiScale: "auto",
  zoom: "normal",
  haptics: true,
  reduceMotion: false,
  tutorialSeen: false,
  contextButton: true,
  padDead: "normal",
});

const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;

const bool = (v: unknown, fallback: boolean): boolean => (typeof v === "boolean" ? v : fallback);

/**
 * Chuẩn hoá mọi input về một `Settings` hợp lệ. THUẦN — không đụng DOM, không
 * ném lỗi. Đây là cửa duy nhất mà dữ liệu ngoài (localStorage, file, URL)
 * được đi vào phần còn lại của app.
 */
export function parseSettings(raw: unknown): Settings {
  const d = DEFAULT_SETTINGS;
  if (!raw || typeof raw !== "object") return { ...d };
  const v = raw as Record<string, unknown>;
  return {
    v: SETTINGS_VERSION,
    control: oneOf(v["control"], ["tap", "stick"] as const, d.control),
    hand: oneOf(v["hand"], ["right", "left"] as const, d.hand),
    uiScale: oneOf(v["uiScale"], ["auto", "small", "large"] as const, d.uiScale),
    zoom: oneOf(v["zoom"], ["near", "normal", "far"] as const, d.zoom),
    haptics: bool(v["haptics"], d.haptics),
    padDead: oneOf(v["padDead"], ["hep", "normal", "rong"] as const, d.padDead),
    reduceMotion: bool(v["reduceMotion"], d.reduceMotion),
    tutorialSeen: bool(v["tutorialSeen"], d.tutorialSeen),
    contextButton: bool(v["contextButton"], d.contextButton),
  };
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return parseSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(parseSettings(s)));
  } catch {
    /* không lưu được cũng không sao — phiên này vẫn dùng đúng lựa chọn */
  }
}

/**
 * Đẩy settings lên <body> dưới dạng data-attribute để CSS bật/tắt bố cục.
 * CSS là nơi DUY NHẤT diễn giải các thuộc tính này: JS không phải đo đạc hay
 * gắn/gỡ trình xử lý gì khi người chơi đổi tuỳ chọn.
 *
 *   body[data-control="stick"]   → hiện joystick
 *   body[data-hand="left"]       → lật cụm nút sang trái
 *   body[data-ui="large"]        → chữ và nút to hơn
 *   body[data-motion="reduce"]   → tắt nhấp nháy, chuyển cảnh
 */
export function applySettings(s: Settings): void {
  const b = document.body.dataset;
  b["control"] = s.control;
  b["hand"] = s.hand;
  b["ui"] = s.uiScale;
  const prefersReduce =
    typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  b["motion"] = s.reduceMotion || prefersReduce ? "reduce" : "full";
  b["ctx"] = s.contextButton ? "on" : "off";
  /* Vùng chết KHÔNG đi qua data-attribute: nó là con số cho vòng lặp đọc tay
     cầm, không phải một luật CSS. Đẩy thẳng vào `gamepad.ts`. */
  setPadDead(s.padDead);
}

/** @deprecated giữ cho tương thích — dùng applySettings. */
export function applyControlMode(mode: ControlMode): void {
  document.body.dataset["control"] = mode;
}
