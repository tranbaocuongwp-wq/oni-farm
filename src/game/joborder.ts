/* ============================================================================
   THỨ TỰ VIỆC ĐỒNG ÁNG — một hằng, mọi bộ não cùng đọc.

   Có đúng hai bộ não làm ruộng thay người chơi:

     · nút TỰ ĐỘNG LÀM  — `autoJob` / `AUTO_ORDER` trong game/hint.ts
     · người làm thuê   — `cropTask` / `pickTask` trong game/workers.ts

   Hai tài liệu (`docs/LOI-CHOI.md` mục 4, `docs/GIAI-THUAT.md` mục 4) đã ghi từ
   lâu rằng chúng "dùng chung một hàm", và câu luật chốt là: *thứ tự ưu tiên là
   CỐ ĐỊNH, người chơi phải đoán được*. Nhưng chúng chưa bao giờ dùng chung gì
   cả — một bên là danh sách chuỗi, một bên là bảng số `uu` gõ tay — nên chúng
   đã trôi khỏi nhau đúng như tài liệu cảnh báo: tới Đợt 22 thì nút TỰ ĐỘNG gieo
   trước tưới, còn người làm tưới trước gieo. Cùng một nông trại, hai nết làm.

   File này KHÔNG import gì cả, và đó là chủ ý: `hint.ts` đã import `workers.ts`
   (`workerNear`), nên đặt hằng ở một trong hai bên là tạo vòng import.

   Đổi thứ tự ở đây là đổi nết của CẢ HAI bộ não cùng lúc — đó chính là điều
   khiến chúng không thể trôi khỏi nhau lần nữa.
============================================================================ */

/**
 * Việc trên RUỘNG, xếp từ gấp nhất xuống ít gấp nhất. Mỗi bậc một lý do:
 *
 *   1. THU   — cây đã chín là giá trị đã xong; để qua đêm là mời chuột và bão.
 *   2. CHỮA  — cây bệnh đứng yên không lớn, mỗi đêm chậm là mất trọn một ngày.
 *   3. GIEO  — ô đất trống là ô đất đang phí.
 *   4. TƯỚI  — tưới SAU khi gieo, để lứa vừa gieo được tính ngay đêm nay.
 *   5. DỌN   — nhổ cỏ dại mọc lan vào lô, trả lại ô đất cày được.
 *   6. CÀY   — mở thêm đất, việc ít gấp nhất.
 *
 * ĐỔ MÁNG và RẮC HỒ không nằm ở đây: chúng không phải việc ruộng, và chúng đứng
 * TRƯỚC cả sáu bậc này (con vật chết đói được, cây thì chỉ đứng chờ) — xem
 * `AUTO_ORDER` và `pickTask`.
 *
 * CHẶT và ĐẬP cũng không nằm ở đây, và đó là một luật chứ không phải thiếu sót:
 * bật tự động rồi quay đi một lúc mà về thấy sạch bóng cây với đá trên cả nông
 * trại là thứ không hoàn tác được. `clear` ở bậc 5 khác hẳn — nó chỉ đụng cỏ dại
 * TỰ MỌC và chỉ TRONG LÔ RUỘNG; xem `donDuoc` trong game/workers.ts.
 */
export const CROP_ORDER = ["harvest", "cure", "plant", "water", "clear", "till"] as const;
/* `clear` là một việc THẬT của người chơi (`UseKind`), thêm ở Đợt 22 — xem
   `canUseAt` trong game/actions.ts. Nó nằm ở đây nên cả nút TỰ ĐỘNG lẫn người
   làm đều dọn lô, không bên nào phải nhớ thêm một luật riêng. */

export type CropJob = (typeof CROP_ORDER)[number];

/** Bậc ưu tiên của một việc ruộng; càng nhỏ càng gấp. Việc lạ → cuối bảng. */
export function jobRank(kind: string): number {
  const i = (CROP_ORDER as readonly string[]).indexOf(kind);
  return i < 0 ? CROP_ORDER.length : i;
}
