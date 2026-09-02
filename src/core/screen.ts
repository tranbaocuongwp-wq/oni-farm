/* ============================================================================
   SCREEN — theo dõi kích thước khung chứa, hướng màn hình và mật độ điểm ảnh.

   Ba nguồn tin, vì không nguồn nào một mình đủ:

   · ResizeObserver — bắt được mọi thay đổi kích thước của KHUNG CHỨA, kể cả khi
     cửa sổ không đổi (bàn phím ảo đẩy layout, thanh địa chỉ trên mobile thu vào,
     panel mở/đóng). Đây là nguồn chính.
   · orientationchange + window resize — vài trình duyệt di động báo kích thước
     mới CHẬM một nhịp sau khi xoay máy, nên phải đo lại lần nữa ở khung hình sau.
   · matchMedia('resolution') — devicePixelRatio đổi khi kéo cửa sổ sang màn hình
     khác (retina ↔ thường) hoặc khi người dùng đổi mức zoom. Không nghe cái này
     thì canvas sẽ mờ đi mà không rõ vì sao.
============================================================================ */

export interface ScreenInfo {
  cssW: number;
  cssH: number;
  dpr: number;
  orientation: "portrait" | "landscape";
}

export function readScreen(el: HTMLElement): ScreenInfo {
  // Khung chứa có thể đang 0×0 (tab ẩn, chưa layout) → rơi về kích thước cửa sổ.
  const cssW = el.clientWidth || window.innerWidth || 0;
  const cssH = el.clientHeight || window.innerHeight || 0;
  return {
    cssW,
    cssH,
    dpr: window.devicePixelRatio || 1,
    orientation: cssH >= cssW ? "portrait" : "landscape",
  };
}

export function observeScreen(
  el: HTMLElement,
  onChange: (info: ScreenInfo) => void,
): () => void {
  let pending = false;
  let raf = 0;
  let timer = 0;
  let dprQuery: MediaQueryList | null = null;

  const fire = () => {
    pending = false;
    raf = 0;
    timer = 0;
    onChange(readScreen(el));
    watchDpr();
  };

  // Gom nhiều sự kiện trong cùng một khung hình thành một lần tính lại.
  //
  // Khi trang bị ẩn thì requestAnimationFrame KHÔNG chạy, nên phải rơi về
  // setTimeout — nếu không, thay đổi kích thước lúc ẩn sẽ nằm treo và khung hình
  // đầu tiên lúc người chơi quay lại sẽ vẽ bằng thông số cũ.
  const schedule = () => {
    if (pending) return;
    pending = true;
    if (typeof requestAnimationFrame === "function" && !document.hidden) {
      raf = requestAnimationFrame(fire);
    } else {
      timer = window.setTimeout(fire, 0);
    }
  };

  // Xoay máy: đo ngay, rồi đo lại sau một nhịp vì iOS/Android hay báo kích thước
  // cũ ở lần đầu tiên.
  const onOrientation = () => {
    schedule();
    setTimeout(schedule, 150);
    setTimeout(schedule, 400);
  };

  function watchDpr() {
    const dpr = window.devicePixelRatio || 1;
    dprQuery?.removeEventListener?.("change", schedule);
    if (typeof window.matchMedia !== "function") return;
    // Query chỉ đúng với ĐÚNG mức dpr hiện tại; hễ nó thôi khớp là dpr đã đổi.
    dprQuery = window.matchMedia(`(resolution: ${dpr}dppx)`);
    dprQuery.addEventListener?.("change", schedule);
  }

  let ro: ResizeObserver | null = null;
  if (typeof ResizeObserver !== "undefined") {
    ro = new ResizeObserver(schedule);
    ro.observe(el);
  }
  window.addEventListener("resize", schedule);
  window.addEventListener("orientationchange", onOrientation);
  screen.orientation?.addEventListener?.("change", onOrientation);
  watchDpr();

  onChange(readScreen(el));

  return () => {
    if (raf) cancelAnimationFrame(raf);
    if (timer) clearTimeout(timer);
    ro?.disconnect();
    window.removeEventListener("resize", schedule);
    window.removeEventListener("orientationchange", onOrientation);
    screen.orientation?.removeEventListener?.("change", onOrientation);
    dprQuery?.removeEventListener?.("change", schedule);
  };
}
