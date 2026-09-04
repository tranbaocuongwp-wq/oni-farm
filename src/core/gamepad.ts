/* ============================================================================
   GAMEPAD — tay cầm chơi game, coi như một ĐƯỜNG VÀO nữa của `input.ts`.

   Vì sao tách file: bàn phím và cảm ứng là hệ SỰ KIỆN — trình duyệt gọi mình
   khi có gì xảy ra. Tay cầm thì ngược lại, nó là hệ HỎI VÒNG: không có sự kiện
   nào cả, mỗi khung hình phải tự đi đọc trạng thái và tự so với khung trước để
   biết nút nào vừa được bấm. Trộn hai mô hình đó vào một file thì mọi hàm ở đó
   phải mang theo câu hỏi "cái này chạy vì sự kiện hay vì vòng lặp".

   Ba thứ quyết định cách viết ở đây:

   · CHỈ BẮT SƯỜN LÊN. `getGamepads()` trả về "nút đang giữ", nhưng game cần
     "nút VỪA bấm". Không so với khung trước thì giữ nút A một giây là game
     nhận sáu mươi lệnh dùng công cụ.
   · KHÔNG GIỮ THAM CHIẾU đối tượng Gamepad. Chrome trả về ẢNH CHỤP mới mỗi lần
     gọi; giữ lại cái cũ thì `buttons` đóng băng vĩnh viễn ở khoảng khắc đó —
     một cái bẫy kinh điển và im lặng.
   · VÙNG CHẾT hình tròn, không phải theo từng trục. Cắt theo trục thì đẩy chéo
     nhẹ sẽ ra đúng một hướng thẳng, và nhân vật đi giật theo tám hướng.

   Sơ đồ nút theo chuẩn "standard mapping" (Xbox, PlayStation, và gần như mọi
   tay cầm USB/Bluetooth đời mới đều báo cáo theo chuẩn này):

       A(0) dùng · B(1) tương tác · X(2) tự động làm · Y(3) balo
       LB(4)/RB(5) đổi ô hotbar · LT(6) chạy · RT(7) dùng
       Back(8) bản đồ · Start(9) menu · L3(10) xây dựng · R3(11) sơ đồ nút
       D-pad(12–15) đi
============================================================================ */

/** Ngưỡng dưới mức này coi như không đẩy. Cần đủ lớn: tay cầm cũ luôn trôi
 *  một chút quanh tâm, và trôi 0,1 là nhân vật tự đi mãi về một phía. */
const DEAD = 0.28;

/** Đẩy quá mức này là CHẠY — cùng luật analog với joystick cảm ứng, nên người
 *  chơi không phải học thêm nút nào. */
const RUN = 0.85;

/** Nút được coi là "đang bấm" từ mức này. Cò analog (LT/RT) cũng dùng ngưỡng
 *  này nên chúng hành xử y hệt nút thường. */
const PRESS = 0.5;

/** Tên nút, đánh theo chỉ số của standard mapping. */
export const PAD = {
  A: 0,
  B: 1,
  X: 2,
  Y: 3,
  LB: 4,
  RB: 5,
  LT: 6,
  RT: 7,
  BACK: 8,
  START: 9,
  L3: 10,
  R3: 11,
  UP: 12,
  DOWN: 13,
  LEFT: 14,
  RIGHT: 15,
} as const;

export interface PadState {
  /** Có tay cầm nào đang cắm không. */
  connected: boolean;
  /** Hướng đi mong muốn, độ dài <= 1 (đã gộp cần gạt trái và D-pad). */
  axis: { x: number; y: number };
  /** Đẩy gần hết cỡ, hoặc đang giữ cò trái. */
  running: boolean;
  /** Các nút VỪA được bấm ở khung này (sườn lên). */
  pressed: Set<number>;
  /** Các nút đang giữ. */
  held: Set<number>;
  /** Hướng vừa GẠT trên cần trái / D-pad, dùng để chuyển tiêu điểm trong menu.
   *  Gạt và giữ thì lặp lại chậm, y như giữ phím mũi tên. */
  navDir: { x: number; y: number } | null;
}

/** Hãng tay cầm — quyết định TÊN nút hiện cho người chơi, không đổi chỉ số. */
export type PadBrand = "xbox" | "playstation" | "nintendo" | "generic";

export interface PadInfo {
  connected: boolean;
  /** Chuỗi tự khai của tay cầm, ví dụ "Xbox Wireless Controller (STANDARD GAMEPAD)". */
  id: string;
  brand: PadBrand;
  /**
   * Trình duyệt có nhận ra đây là "standard gamepad" không.
   *
   * Đây là câu hỏi QUAN TRỌNG NHẤT của cả file. `mapping === "standard"` nghĩa
   * là trình duyệt đã tự sắp lại: nút 0 chắc chắn là nút mặt dưới, 9 chắc chắn
   * là Start. Chuỗi rỗng nghĩa là KHÔNG BIẾT — chỉ số nút là thứ tự thô của
   * phần cứng, và mỗi hãng một kiểu. Gán bừa Y = balo lên một tay cầm như thế
   * thì người chơi bấm "nút phía trên" lại ra mở balo, hoặc chẳng ra gì.
   */
  standard: boolean;
  /** Số nút và số trục THẬT sự có. Không quảng cáo nút mà tay cầm không có. */
  buttons: number;
  axes: number;
}

export interface Gamepad2 {
  /** Tay cầm nào đang cắm, và nó có gì. */
  info(): PadInfo;
  /** Đọc trạng thái của khung hình này. Gọi ĐÚNG MỘT LẦN mỗi khung. */
  poll(nowMs: number): PadState;
  /** Rung, nếu tay cầm hỗ trợ. Im lặng bỏ qua nếu không. */
  rumble(ms: number, strong?: number): void;
}

const EMPTY: PadState = {
  connected: false,
  axis: { x: 0, y: 0 },
  running: false,
  pressed: new Set(),
  held: new Set(),
  navDir: null,
};

/** Đoán hãng từ chuỗi `id`. Chỉ để hiện ĐÚNG TÊN nút — Switch gọi nút mặt dưới
 *  là B còn Xbox gọi là A, mà cả hai đều là chỉ số 0. Đoán sai thì chữ sai, chứ
 *  hành vi không đổi, nên đây là chỗ được phép đoán. */
function brandOf(id: string): PadBrand {
  const s = id.toLowerCase();
  if (/xbox|xinput|microsoft/.test(s)) return "xbox";
  if (/dualsense|dualshock|playstation|sony|054c|wireless controller/.test(s)) return "playstation";
  if (/switch|joy-?con|nintendo|pro controller|057e/.test(s)) return "nintendo";
  return "generic";
}

/** Tên nút theo hãng, đánh theo CHỈ SỐ standard mapping. */
const NAMES: Record<PadBrand, Record<number, string>> = {
  xbox: { 0: "A", 1: "B", 2: "X", 3: "Y", 4: "LB", 5: "RB", 6: "LT", 7: "RT", 8: "View", 9: "Menu", 10: "LS", 11: "RS" },
  // Nút mặt dưới của PlayStation là ✕, bên phải là ○ — vẫn là chỉ số 0 và 1.
  playstation: { 0: "✕", 1: "○", 2: "□", 3: "△", 4: "L1", 5: "R1", 6: "L2", 7: "R2", 8: "Create", 9: "Options", 10: "L3", 11: "R3" },
  // Nintendo ĐẢO tên so với Xbox ở cùng vị trí: nút dưới là B, nút phải là A.
  nintendo: { 0: "B", 1: "A", 2: "Y", 3: "X", 4: "L", 5: "R", 6: "ZL", 7: "ZR", 8: "-", 9: "+", 10: "LS", 11: "RS" },
  generic: { 0: "Nút 1", 1: "Nút 2", 2: "Nút 3", 3: "Nút 4", 4: "L1", 5: "R1", 6: "L2", 7: "R2", 8: "Select", 9: "Start", 10: "L3", 11: "R3" },
};

/** Tên hiển thị của một nút trên tay cầm đang dùng. */
export function padButtonName(info: PadInfo, index: number): string {
  return NAMES[info.brand][index] ?? `Nút ${index + 1}`;
}

const NO_PAD: PadInfo = { connected: false, id: "", brand: "generic", standard: false, buttons: 0, axes: 0 };

export function createGamepad(): Gamepad2 {
  let prev = new Set<number>();
  /** Lần gạt hướng gần nhất trong menu, và hướng đó. */
  let navAt = 0;
  let navLast = { x: 0, y: 0 };
  let padIndex: number | null = null;

  /** Tay cầm ĐANG dùng. Ưu tiên cái vừa có tín hiệu, để cắm hai cái không loạn. */
  const readPad = (): Gamepad | null => {
    const pads = navigator.getGamepads?.() ?? [];
    // Giữ nguyên cái đang dùng nếu nó còn đó — đổi qua đổi lại giữa hai tay cầm
    // mỗi khung hình thì `prev` vô nghĩa và nút nào cũng thành bấm liên tục.
    if (padIndex !== null) {
      const cur = pads[padIndex];
      if (cur?.connected) return cur;
      padIndex = null;
    }
    for (const p of pads) {
      if (!p?.connected) continue;
      const dung =
        p.buttons.some((b) => b.pressed || b.value > PRESS) ||
        p.axes.some((v) => Math.abs(v) > DEAD);
      if (dung) {
        padIndex = p.index;
        return p;
      }
    }
    // Không cái nào có tín hiệu: vẫn nhận cái đầu tiên để `connected` đúng.
    for (const p of pads) if (p?.connected) return p;
    return null;
  };

  return {
    info() {
      const pad = readPad();
      if (!pad) return NO_PAD;
      const id = pad.id ?? "";
      return {
        connected: true,
        id,
        brand: brandOf(id),
        standard: pad.mapping === "standard",
        buttons: pad.buttons.length,
        axes: pad.axes.length,
      };
    },

    poll(nowMs) {
      const pad = readPad();
      if (!pad) {
        prev = new Set();
        return EMPTY;
      }

      /* CHỈ đọc những nút tay cầm THẬT SỰ có. Một tay cầm mười nút thì chỉ số
         10 và 11 không tồn tại, và `buttons[10]` là `undefined` — vòng lặp này
         tự nhiên không thêm chúng vào, nên không có chuyện "L3 mở chế độ xây"
         trên một tay cầm không có L3. */
      const held = new Set<number>();
      for (let i = 0; i < pad.buttons.length; i++) {
        const b = pad.buttons[i];
        if (b && (b.pressed || b.value > PRESS)) held.add(i);
      }

      const pressed = new Set<number>();
      for (const i of held) if (!prev.has(i)) pressed.add(i);
      prev = held;

      // Cần gạt trái, cộng D-pad (D-pad coi như đẩy hết cỡ theo trục đó).
      let ax = pad.axes[0] ?? 0;
      let ay = pad.axes[1] ?? 0;
      if (held.has(PAD.LEFT)) ax = -1;
      if (held.has(PAD.RIGHT)) ax = 1;
      if (held.has(PAD.UP)) ay = -1;
      if (held.has(PAD.DOWN)) ay = 1;

      /* Vùng chết HÌNH TRÒN: cắt theo từng trục thì đẩy chéo nhẹ (0,2 / 0,9) ra
         thành đúng một hướng thẳng, và nhân vật đi giật theo tám hướng. */
      let len = Math.hypot(ax, ay);
      if (len < DEAD) {
        ax = 0;
        ay = 0;
        len = 0;
      } else if (len > 1) {
        ax /= len;
        ay /= len;
        len = 1;
      }

      /* Gạt hướng trong MENU: bấm một cái ăn một bước, giữ thì lặp lại chậm.
         Không có nhịp lặp này thì một cú gạt nhảy qua cả menu trong ba khung
         hình, mà cũng không giữ để đi nhanh xuống cuối danh sách được. */
      let navDir: PadState["navDir"] = null;
      const dx = Math.abs(ax) > 0.6 ? Math.sign(ax) : 0;
      const dy = Math.abs(ay) > 0.6 ? Math.sign(ay) : 0;
      if (dx === 0 && dy === 0) {
        navLast = { x: 0, y: 0 };
        navAt = 0;
      } else {
        const doi = dx !== navLast.x || dy !== navLast.y;
        const lap = nowMs - navAt > (navAt === 0 ? 0 : 220);
        if (doi || lap) {
          navDir = { x: dx, y: dy };
          navLast = { x: dx, y: dy };
          navAt = nowMs;
        }
      }

      return {
        connected: true,
        axis: { x: ax, y: ay },
        // Cò LT chỉ đáng tin khi standard mapping; ngoài ra chỉ dựa vào cần gạt.
        running: len > RUN || (pad.mapping === "standard" && held.has(PAD.LT)),
        pressed,
        held,
        navDir,
      };
    },

    rumble(ms, strong = 0.6) {
      const pad = readPad();
      // `vibrationActuator` chưa vào chuẩn nên phải hỏi kiểu động; Firefox và
      // Safari không có nó, và đó không phải lỗi gì cả.
      const act = (pad as unknown as { vibrationActuator?: { playEffect(t: string, o: object): Promise<unknown> } } | null)
        ?.vibrationActuator;
      if (!act) return;
      void act
        .playEffect("dual-rumble", {
          duration: ms,
          strongMagnitude: strong,
          weakMagnitude: strong * 0.6,
        })
        .catch(() => {
          /* tay cầm từ chối rung — không phải chuyện đáng báo */
        });
    },
  };
}
