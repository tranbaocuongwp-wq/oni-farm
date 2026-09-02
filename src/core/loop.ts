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

export function createLoop(step: (dt: number) => void, maxDt = 1 / 20): Loop {
  let raf = 0;
  let last = 0;
  let running = false;

  const frame = (now: number) => {
    if (!running) return;
    const dt = Math.min((now - last) / 1000, maxDt);
    last = now;
    step(dt);
    raf = requestAnimationFrame(frame);
  };

  return {
    start() {
      if (running) return;
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    },
    stop() {
      running = false;
      cancelAnimationFrame(raf);
    },
    step,
    get running() {
      return running;
    },
  };
}
