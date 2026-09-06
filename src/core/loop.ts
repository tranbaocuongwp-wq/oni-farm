/** Vòng lặp game. Tách khỏi mọi thứ khác để test không cần requestAnimationFrame.
 *  dt bị KẸP TRẦN: chuyển tab đi rồi quay lại không được sinh một dt khổng lồ
 *  làm nhân vật xuyên tường hay nhảy mất mấy tiếng đồng hồ trong game. */
export interface Loop {
  start(): void;
  stop(): void;
  /** Chạy TAY một bước. Dùng cho test tự động (trang bị ẩn thì rAF không chạy)
   *  và cho mô phỏng nhanh. Không dùng trong lúc chơi bình thường. */
  step(dt: number): void;
  readonly running: boolean;
}

/**
 * Bao nhiêu khung hình LIÊN TIẾP ném lỗi thì thôi cố chạy tiếp.
 *
 * Một lỗi lẻ (một con vật lạc vào ô không hợp lệ đúng một khung, một phép chia
 * cho 0 ở cảnh hiếm) thì khung sau thường tự lành — dừng game vì nó là phạt
 * người chơi vì lỗi của tôi. Nhưng lỗi ở MỌI khung (state đã hỏng hẳn) thì chạy
 * tiếp chỉ là quay tròn trong lỗi và ghi đè save bằng một state hỏng; lúc đó
 * dừng lại và nói thật mới là tử tế.
 */
export const MAX_CONSECUTIVE_ERRORS = 10;

export interface LoopOptions {
  maxDt?: number;
  /**
   * Gọi khi `step` ném. `consecutive` = số khung hình LIÊN TIẾP đã lỗi, tính cả
   * khung này. Trả về `true` để vòng lặp CHẠY TIẾP, `false` để dừng hẳn.
   *
   * Không có tuỳ chọn này thì mặc định: chạy tiếp cho tới
   * `MAX_CONSECUTIVE_ERRORS`, rồi dừng.
   */
  onError?: (e: unknown, consecutive: number) => boolean;
}

export function createLoop(step: (dt: number) => void, opts: LoopOptions | number = {}): Loop {
  const o: LoopOptions = typeof opts === "number" ? { maxDt: opts } : opts;
  const maxDt = o.maxDt ?? 1 / 20;
  let raf = 0;
  let last = 0;
  let running = false;
  /** Số khung hình liên tiếp vừa ném lỗi. Về 0 ngay khi một khung chạy trót lọt. */
  let loiLienTiep = 0;

  /* Chạy MỘT khung, nuốt lỗi.

     Trước đây `step(dt)` đứng trần trong `frame`: nó ném là dòng
     `requestAnimationFrame(frame)` ngay sau không bao giờ chạy, `running` vẫn
     `true` nên `start()` cũng thoát sớm — không gì khởi động lại được. Và vì
     `store.subscribe` chỉ nổ trong `step`, autosave cũng chết theo: người chơi
     nhìn canvas đứng hình, bấm F5, và mất tới 30 giây chơi.

     Trả về `true` nếu vòng lặp nên chạy tiếp. */
  const chayMotKhung = (dt: number): boolean => {
    try {
      step(dt);
      loiLienTiep = 0;
      return true;
    } catch (e) {
      loiLienTiep++;
      if (o.onError) return o.onError(e, loiLienTiep);
      return loiLienTiep < MAX_CONSECUTIVE_ERRORS;
    }
  };

  const frame = (now: number) => {
    if (!running) return;
    // Kẹp cả SÀN: mốc thời gian của khung hình rAF đầu tiên có thể SỚM hơn
    // `performance.now()` lúc start(), cho ra dt âm → elapsed âm → chỉ số khung
    // hình nước âm → drawImage(undefined). Lỗi hiếm, chỉ ở khung hình đầu.
    const dt = Math.max(0, Math.min((now - last) / 1000, maxDt));
    last = now;
    if (!chayMotKhung(dt)) {
      running = false;
      return;
    }
    raf = requestAnimationFrame(frame);
  };

  return {
    start() {
      if (running) return;
      running = true;
      loiLienTiep = 0;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    },
    stop() {
      running = false;
      cancelAnimationFrame(raf);
    },
    /* `step` thủ công (test, mô phỏng) KHÔNG nuốt lỗi: test muốn thấy lỗi ném ra
       tận nơi, không phải một vòng lặp lặng lẽ bỏ qua nó. */
    step,
    get running() {
      return running;
    },
  };
}
