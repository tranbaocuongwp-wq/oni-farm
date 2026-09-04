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

export function setHaptics(on: boolean): void {
  enabled = on;
}

export function hapticsSupported(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
}

export function buzz(kind: HapticKind): void {
  if (!enabled || !hapticsSupported()) return;
  try {
    navigator.vibrate(PATTERNS[kind]);
  } catch {
    /* vài trình duyệt ném lỗi khi chưa có cử chỉ người dùng — bỏ qua */
  }
}
