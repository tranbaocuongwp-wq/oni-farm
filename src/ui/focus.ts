/* ============================================================================
   CHỖ NGỒI — nhận lại phần tử đang chọn sau khi một tấm menu được dựng lại.

   Vì sao cần: mọi nút trong menu đều gọi lại `open*()` để vẽ lại, mà `shell()`
   mở đầu bằng `root.innerHTML = ""`. Không phần tử nào sống sót, nên "người
   chơi đang đứng ở đâu" không thể nhớ bằng chính đối tượng DOM cũ.

   Thứ SỐNG SÓT là BỐ CỤC: cùng một `open*()` chạy lại trên cùng content thì
   bày ra đúng chừng ấy thứ ở đúng chừng ấy chỗ. Nên khoá ở đây là CHỖ NGỒI —
   toạ độ trong hệ của tấm menu, cộng "loại" điều khiển.

   Ba cách khác đã cân nhắc và loại:
     · đường dẫn chỉ số DOM — định danh CHỖ theo cấu trúc, mà cấu trúc thì đổi:
       balo chèn thêm nút "Bỏ món" khi có món được chọn, kho chèn dòng "Kho
       đang trống", cửa hàng chèn/bỏ cả một lưới. Chèn một chỗ là lệch hết.
     · khoá do hàm dựng tự sinh từ nhãn — nhãn mang STATE ("Bán tất cả ·
       1.234đ", "Cà chua ×5"), tức là khoá đổi đúng lúc cần nó đứng yên. Và
       nhãn không duy nhất: quầy bán có một cặp −/+ cho MỖI hàng.
     · chỉ số trong danh sách ứng viên — số ứng viên đổi liên tục, vì thẻ hết
       tiền mua thì `disabled` và bị loại khỏi danh sách. Mua một con bò làm
       hàng chục thẻ biến mất cùng lúc.

   Phần quyết định tách hẳn ra file này, không import gì và không chạm DOM, để
   `scripts/sim.mjs` chạy được nó trong Node thuần.
============================================================================ */

export interface Seat {
  /** tâm phần tử trong hệ toạ độ BỐ CỤC của tấm menu (không phải màn hình) */
  x: number;
  y: number;
  /**
   * Loại điều khiển: thẻ HTML + class của phần tử CHA.
   *
   * Class của CHA chứ không phải của chính nút, vì class của nút mang trạng
   * thái (`tab on`, `switch on`, `bslot sel picked`) — nó đổi đúng lúc mình
   * cần nó đứng yên. Class của khung chứa thì không đổi bao giờ.
   */
  kind: string;
}

/**
 * Phạt khi khác LOẠI, tính bằng pixel.
 *
 * Con số này chặn một tai nạn cụ thể ở quầy thu mua. `.row .right` xếp DỌC
 * (`style.css`), nên nút BÁN nằm ngay DƯỚI nút "+" chừng 38px, còn nút "−"
 * thì cách 84px sang trái. Bấm "+" tới số tối đa làm chính nút "+" bị vô hiệu
 * và biến khỏi danh sách; nếu chỉ so khoảng cách thì vòng vàng rơi đúng vào
 * BÁN, và cú bấm A tiếp theo — vẫn là cái nút người chơi vừa dùng để tăng số
 * — BÁN MẤT HÀNG.
 *
 * Phải đủ lớn để 84 thắng 38, và đủ nhỏ để không cố bám một thứ cùng loại ở
 * tận nửa màn hình bên kia.
 */
export const PHAT_KHAC_LOAI = 400;

/**
 * Chỉ số của chỗ ngồi hợp nhất với `muon`, hoặc −1 khi danh sách rỗng.
 *
 * Luôn trả về một cái gì đó khi còn ứng viên: câu trả lời tệ nhất vẫn là "cái
 * gần chỗ cũ nhất", còn hơn hẳn "nhảy về đầu danh sách".
 */
export function timChoNgoi(dsach: readonly Seat[], muon: Seat): number {
  let best = -1;
  let bestScore = Infinity;
  for (let i = 0; i < dsach.length; i++) {
    const s = dsach[i]!;
    const d = Math.hypot(s.x - muon.x, s.y - muon.y);
    const score = d + (s.kind === muon.kind ? 0 : PHAT_KHAC_LOAI);
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}
