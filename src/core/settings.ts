/* ============================================================================
   SETTINGS — tuỳ chọn của NGƯỜI DÙNG, không phải của ván chơi.

   Khác biệt quan trọng với `GameState`: đây là sở thích gắn với cái MÁY đang
   ngồi, không phải với nông trại. Nó không được nằm trong save — mang file save
   sang máy khác thì cách điều khiển phải theo máy mới, chứ không kéo theo lựa
   chọn của máy cũ. Vì vậy nó ở localStorage riêng và không đi qua reducer.

   Đọc/ghi đều nuốt lỗi: chế độ ẩn danh chặn localStorage thì game vẫn chạy với
   giá trị mặc định, chỉ là không nhớ được giữa các phiên.
============================================================================ */

const KEY = "oni-farm:settings";

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

export interface Settings {
  control: ControlMode;
}

const DEFAULTS: Settings = { control: "tap" };

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const v = JSON.parse(raw) as Partial<Settings>;
    return {
      control: v.control === "stick" ? "stick" : "tap",
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* không lưu được cũng không sao — phiên này vẫn dùng đúng lựa chọn */
  }
}

/** Đặt thuộc tính lên <body> để CSS bật/tắt lớp điều khiển tương ứng. */
export function applyControlMode(mode: ControlMode): void {
  document.body.dataset["control"] = mode;
}
