/* ============================================================================
   CHẾ ĐỘ ĐIỀU KHIỂN — MỘT LÚC CHỈ MỘT.

   Cường chơi trên điện thoại, cắm tay cầm vào, và thấy CÙNG LÚC: cụm nút chạm,
   dải gợi ý tay cầm dưới đáy, và dải gợi ý thứ hai dưới hotbar. Ba lớp chỉ dẫn
   cho cùng một nút A. Anh nói gọn: "đồng thời chỉ 1 chế độ."

   Vì sao chuyện đó xảy ra: hai cái cờ ĐỘC LẬP.

     · `body.touch` chốt MỘT LẦN lúc khởi động, từ `pointer: coarse` hoặc
       `maxTouchPoints > 0`, và không bao giờ được gỡ. Laptop có màn cảm ứng bị
       coi là "điện thoại" vĩnh viễn — giấu số phím hotbar, in bảng hướng dẫn
       kiểu chạm, dù người ta đang gõ bàn phím.
     · `data-input` chỉ nói "CÓ tay cầm cắm", không nói "tay cầm đang được
       dùng". Cắm vào để đó là cả HUD đổi.

   Module này thay hai cờ ấy bằng MỘT câu hỏi: **thiết bị nào vừa được dùng?**

   Ba nguyên tắc, mỗi cái vá một lỗi đã đo được:

     1. Đổi theo HOẠT ĐỘNG THẬT, không theo "đang cắm". Tay cầm ma — cái bóng
        `connected: true, buttons: []` mà Chrome để lại sau khi rút — không bao
        giờ gửi tín hiệu nào, nên không bao giờ thắng. Trước đây nó đủ sức bật
        `pad-std`, và `pad-std` thì ẩn joystick lẫn tắt `pointer-events` của cụm
        nút chạm: người chơi mất SẠCH đường vào.
     2. Trục phải GIỮ 150 ms mới đổi; nút thì đổi ngay. Cần gạt mòn nghỉ lệch
        tâm, chuột lướt ngang màn hình — những thứ ấy không được phép lật cả HUD
        giữa lúc đang cày.
     3. Người chơi khoá cứng được, nhưng khoá vào chỗ trống thì KHÔNG nghe. Chọn
        "Tay cầm" rồi rút tay cầm ra là quay về chế độ nền, không phải ngồi nhìn
        một màn hình không bấm được gì.

   Thuần: không DOM, không `navigator`, không `performance`. Thời gian là tham
   số. Nên `main.ts` nối vào được, mà Node cũng test trọn được.
============================================================================ */

/** Ba lối chơi. `kbm` = bàn phím + chuột. */
export type InputMode = "touch" | "pad" | "kbm";

/** Tín hiệu: `press` là một cú bấm dứt khoát; `axis` là cần gạt/con trỏ đang
 *  trôi — thứ cần giữ một lúc mới đáng tin. */
export type InputSignal = "press" | "axis";

/** Bấy nhiêu ms giữ trục liên tục thì mới đổi chế độ. */
export const AXIS_HOLD_MS = 150;

export interface InputModeApi {
  /** Chế độ ĐANG hiển thị. Có khoá cứng thì luôn là chế độ khoá (trừ khi khoá
   *  vào thiết bị không có thật — xem `setSan`). */
  mode(): InputMode;
  /** Báo một tín hiệu vừa tới. Trả `true` nếu chế độ vừa ĐỔI. */
  note(src: InputMode, kind: InputSignal, nowMs: number): boolean;
  /** Khoá cứng, hoặc `null` để tự nhận. */
  setOverride(m: InputMode | null): void;
  /** Chế độ khoá cứng hiện tại (`null` = tự nhận). */
  override(): InputMode | null;
  /** Cập nhật xem chế độ nào CÒN dùng được — tay cầm rút ra thì `pad` không
   *  còn, máy không cảm ứng thì `touch` không còn. Khoá cứng vào chế độ không
   *  dùng được thì rơi về nền. */
  setSan(m: InputMode, co: boolean): void;
  onChange(fn: (m: InputMode) => void): void;
}

export interface InputModeOptions {
  /** Chế độ lúc chưa có tín hiệu nào — suy từ khả năng của máy. */
  initial: InputMode;
  /** Khoá cứng ban đầu, từ cài đặt. */
  override?: InputMode | null;
  /** Chế độ nào có thật lúc khởi động. Mặc định: chỉ `initial`, cộng `kbm`
   *  (bàn phím thì máy nào cũng có thể cắm vào). */
  san?: Partial<Record<InputMode, boolean>>;
}

export function createInputMode(opts: InputModeOptions): InputModeApi {
  let hienTai: InputMode = opts.initial;
  let khoa: InputMode | null = opts.override ?? null;
  const san: Record<InputMode, boolean> = {
    touch: opts.san?.touch ?? opts.initial === "touch",
    pad: opts.san?.pad ?? false,
    kbm: opts.san?.kbm ?? true,
  };
  /** Trục của chế độ nào đang được giữ, và từ lúc nào. */
  let giu: { src: InputMode; tu: number } | null = null;
  const nghe: ((m: InputMode) => void)[] = [];

  /** Chế độ THẬT SỰ hiển thị: khoá cứng nếu khoá ấy còn dùng được, không thì
   *  chế độ tự nhận. */
  const hien = (): InputMode => (khoa && san[khoa] ? khoa : hienTai);

  let baoCuoi = hien();
  const bao = () => {
    const m = hien();
    if (m === baoCuoi) return false;
    baoCuoi = m;
    for (const f of nghe) f(m);
    return true;
  };

  return {
    mode: hien,
    note(src, kind, nowMs) {
      // Chế độ này không có thật (tay cầm ma) thì tín hiệu của nó vô nghĩa.
      if (!san[src]) return false;
      if (kind === "press") {
        giu = null;
        if (hienTai === src) return false;
        hienTai = src;
        return bao();
      }
      // TRỤC: phải giữ liên tục đủ lâu.
      if (hienTai === src) {
        giu = null;
        return false;
      }
      if (!giu || giu.src !== src) {
        giu = { src, tu: nowMs };
        return false;
      }
      if (nowMs - giu.tu < AXIS_HOLD_MS) return false;
      giu = null;
      hienTai = src;
      return bao();
    },
    setOverride(m) {
      khoa = m;
      giu = null;
      bao();
    },
    override: () => khoa,
    setSan(m, co) {
      if (san[m] === co) return;
      san[m] = co;
      /* Thiết bị đang dùng vừa biến mất (rút tay cầm giữa chừng): rơi về chế độ
         còn dùng được, ưu tiên cảm ứng rồi bàn phím. Không có dòng này thì HUD
         đứng ở `pad` với một cái tay cầm không còn tồn tại. */
      if (!co && hienTai === m) hienTai = san.touch ? "touch" : "kbm";
      bao();
    },
    onChange(fn) {
      nghe.push(fn);
    },
  };
}

/** Ba lớp giao diện, và chế độ nào bật lớp nào. Một bảng thuần để `main.ts` và
 *  kịch bản sim đọc CÙNG một nguồn — nếu không thì CSS và test trôi khỏi nhau.
 *
 *  `capChamHet`: cụm nút chạm bấm được hay chỉ hiện cho đẹp (tay cầm sơ đồ
 *  chuẩn thì giữ nút A cho dễ nhìn nhưng không nhận chạm). */
export interface HienGi {
  /** Lớp nút chạm: joystick, cụm A/B, nút ☰. */
  chamHien: boolean;
  /** Dải gợi ý nút tay cầm. */
  padHien: boolean;
  /** Số phím trên ô hotbar, và bảng hướng dẫn kiểu bàn phím. */
  phimHien: boolean;
}

export function hienGi(mode: InputMode): HienGi {
  return {
    chamHien: mode === "touch",
    padHien: mode === "pad",
    phimHien: mode === "kbm",
  };
}
