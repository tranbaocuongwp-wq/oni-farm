/* ============================================================================
   HAPTICS — rung nhẹ khi thao tác thành công.

   Trên điện thoại, một cú rung 10ms là phản hồi xác nhận rẻ nhất: ngón tay che
   mất ô đang làm nên mắt không thấy đất vừa đổi màu, nhưng tay thì cảm được.

   `navigator.vibrate` chỉ có trên Android/Chrome; iOS Safari không hỗ trợ và
   trả về undefined — mọi hàm ở đây đều an toàn khi không có API, và im lặng
   khi người chơi tắt trong Cài đặt.
============================================================================ */

export type HapticKind = "tap" | "success" | "deny" | "heavy";

const PATTERNS: Record<HapticKind, number | number[]> = {
  tap: 8,
  success: 14,
  deny: [10, 40, 18],
  heavy: [16, 30, 22],
};

let enabled = true;

/**
 * Đường rung của TAY CẦM, cắm từ ngoài vào.
 *
 * Vì sao không gọi thẳng `gamepad.ts`: file này không biết gì về tay cầm và
 * không nên biết — nó chỉ trả lời câu "rung kiểu gì". Nhưng cái CỜ TẮT thì
 * phải chung: trước đây `setHaptics(false)` chỉ tắt rung điện thoại, còn tay
 * cầm vẫn rung, vì hai đường không biết nhau. Người chơi tắt "Rung" trong Cài
 * đặt mà máy vẫn rung là một lời hứa bị nuốt.
 */
let padRumble: ((ms: number, strong?: number) => void) | null = null;

export function setPadRumble(fn: ((ms: number, strong?: number) => void) | null): void {
  padRumble = fn;
}

export function setHaptics(on: boolean): void {
  enabled = on;
}

export function hapticsSupported(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
}

/** Tổng thời lượng của một mẫu — dùng làm độ dài cú rung trên tay cầm. */
function tongMs(p: number | number[]): number {
  return typeof p === "number" ? p : p.reduce((a, b) => a + b, 0);
}

/** Rung MẠNH tới đâu, theo kiểu. "deny" phải rõ hơn "tap" mới phân biệt được. */
const MANH: Record<HapticKind, number> = { tap: 0.25, success: 0.4, deny: 0.7, heavy: 0.85 };

export function buzz(kind: HapticKind): void {
  if (!enabled) return;
  const p = PATTERNS[kind];
  /* Tay cầm rung SONG SONG với điện thoại, không thay thế: một người chơi có
     thể cầm tay cầm mà máy vẫn nằm trên bàn, và cũng có thể ngược lại. Cùng
     một cờ tắt cho cả hai. */
  padRumble?.(tongMs(p), MANH[kind]);
  if (!hapticsSupported()) return;
  try {
    navigator.vibrate(p);
  } catch {
    /* vài trình duyệt ném lỗi khi chưa có cử chỉ người dùng — bỏ qua */
  }
}
