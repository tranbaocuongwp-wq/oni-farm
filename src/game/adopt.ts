/* ============================================================================
   ADOPT — MỘT cửa cho mọi state đi từ ngoài vào game.

   Ba đường đưa một GameState "lạ" vào store: Boot (đọc IndexedDB lúc mở
   trang), Nạp (nút "Tải game"), và Nhập (file JSON người chơi chọn). Trước đây
   chỉ Boot kiểm bất biến sau khi migrate; Nạp và Nhập đi thẳng
   `adoptState(migrateForContent(st).state)` — mà `migrateForContent` nuốt lỗi
   của chính nó và trả về state CHƯA migrate, còn `store.replace` thì không kiểm
   gì ở bản phát hành. Nhập một file cụt là cài thẳng một state hỏng, rồi nó nổ
   ở TICK kế tiếp.

   Ba lối vào, một luật. Thuần, không DOM — test được trong Node.
============================================================================ */

import type { Content, GameState } from "./types.ts";
import { checkInvariants, migrateForContent } from "./invariants.ts";

export type AdoptSource = "boot" | "load" | "import";

export type AdoptResult =
  | { ok: true; state: GameState; notes: string[] }
  | { ok: false; why: string };

/**
 * Migrate theo content hiện tại rồi KIỂM. Vỡ bất biến thì từ chối — chỗ gọi
 * quyết định làm gì tiếp (Boot: bắt đầu ván mới vì chưa có gì để giữ; Nạp/Nhập:
 * giữ nguyên ván đang chơi và nói lý do).
 *
 * `source` chỉ để ghi vào lý do — cùng một state hỏng thì câu trả lời phải
 * giống nhau dù nó tới từ đâu.
 */
export function adoptState(state: GameState, content: Content, source: AdoptSource): AdoptResult {
  /* Cả hai bước đều có thể NÉM chứ không chỉ trả về lỗi: `migrateForContent`
     bọc thân hàm trong try/catch rồi trả về state CHƯA migrate, và
     `checkInvariants` trên một state thiếu hẳn `inv`/`tiles` thì đổ ngay dòng
     đầu (`state.inv.length`). Ném ở đây phải được tính là "không hợp lệ", không
     phải là một lỗi lọt lên vòng lặp game — vì với Nhập file thì cái ném đó
     đến từ một file người chơi vừa chọn, không phải từ mã. */
  try {
    const fixed = migrateForContent(state, content);
    const vo = checkInvariants(fixed.state, content);
    if (vo.length) return { ok: false, why: `${nguon(source)}: ${vo[0]}` };
    return { ok: true, state: fixed.state, notes: fixed.notes };
  } catch (e) {
    return { ok: false, why: `${nguon(source)}: ${e instanceof Error ? e.message : String(e)}` };
  }
}

function nguon(s: AdoptSource): string {
  switch (s) {
    case "boot":
      return "Save cũ không còn hợp lệ";
    case "load":
      return "Bản lưu không còn hợp lệ";
    case "import":
      return "File save không hợp lệ";
  }
}
