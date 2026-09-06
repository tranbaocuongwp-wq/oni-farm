/* ============================================================================
   INERT — khoá phần còn lại của trang khi một lớp phủ đang mở.

   `shell()` của menu đặt `role="dialog" aria-modal="true"`, nhưng ARIA chỉ là
   lời HỨA với trình đọc màn hình — bàn phím thật thì không: bấm Tab từ trong
   Cài đặt là tiêu điểm nhảy ra `#goal-box`, `#bag-btn`, cụm `#abtn` của HUD
   đang sống phía sau. Hướng dẫn cũng vậy: nó chặn chuột (`pointer-events`
   trên `inset: 0`) mà không chặn Tab.

   Thuộc tính `inert` là cách trình duyệt tự làm việc đó: phần tử inert không
   nhận tiêu điểm, không nhận chạm, và trình đọc màn hình bỏ qua. Đặt lên mọi
   ANH EM của lớp phủ (không đặt lên chính nó) thì Tab tự quay vòng bên trong
   lớp phủ mà không cần viết bộ bắt phím nào.
============================================================================ */

/**
 * Khoá / mở mọi anh em của `overlay`. Nhiều lớp phủ có thể mở chồng (menu đè
 * lên hướng dẫn), nên mỗi lớp ghi tên mình vào `data-inertBy`; chỉ khi không
 * còn lớp nào giữ thì mới gỡ `inert`.
 */
export function khoaNgoai(overlay: HTMLElement, on: boolean, ten: string): void {
  const cha = overlay.parentElement;
  if (!cha) return;
  for (const el of Array.from(cha.children)) {
    if (el === overlay || !(el instanceof HTMLElement)) continue;
    const giu = new Set((el.dataset["inertBy"] ?? "").split(" ").filter(Boolean));
    if (on) giu.add(ten);
    else giu.delete(ten);
    if (giu.size) {
      el.dataset["inertBy"] = [...giu].join(" ");
      el.inert = true;
    } else {
      delete el.dataset["inertBy"];
      el.inert = false;
    }
  }
}
