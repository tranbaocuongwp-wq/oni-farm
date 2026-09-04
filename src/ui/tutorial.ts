/* ============================================================================
   TUTORIAL — hướng dẫn lần đầu, ba bước, chỉ vào đúng thứ trên màn hình.

   Không phải một trang chữ dài (không ai đọc trên điện thoại). Mỗi bước là một
   thẻ ngắn + một vòng sáng khoanh đúng phần tử đang nói tới (hotbar, nút hành
   động, bản đồ nhỏ). Bước 1 nói về CHẠM ĐỂ ĐI vì đó là thứ khác với mọi game
   nông trại khác; bỏ qua được bất cứ lúc nào.

   Hoàn toàn là DOM, không đụng state, không đụng save. Đã xem hay chưa lưu ở
   settings (thuộc máy, không thuộc ván chơi): đổi máy thì xem lại — đúng ý,
   vì máy khác có thể là màn hình khác.
============================================================================ */

export interface TutorialStep {
  title: string;
  text: string;
  /** selector phần tử cần khoanh; null = không khoanh (nói chung về màn hình) */
  target: string | null;
}

export interface Tutorial {
  start(steps?: TutorialStep[]): void;
  isOpen(): boolean;
  close(): void;
}

export const TOUCH_STEPS: TutorialStep[] = [
  {
    title: "Chạm để đi",
    text: "Chạm vào ô nào, nhân vật tự đi tới ô đó. Chạm HAI lần để làm việc ngay tại ô đó.",
    target: null,
  },
  {
    title: "Nút hành động",
    text: "Nút to bên dưới cho biết bấm sẽ làm gì: CÀY, GIEO, TƯỚI, THU, MUA… Nó đổi theo ô bạn đang ngắm và thứ bạn đang cầm.",
    target: "#abtn .a",
  },
  {
    title: "Hotbar",
    text: "Chạm để chọn vật phẩm. Nhấn giữ để xem nó làm gì. Cày → gieo → tưới cùng một ô chỉ cần ngắm một lần.",
    target: "#hotbar",
  },
  {
    title: "Bản đồ nhỏ",
    text: "Bấm vào bản đồ để đi xa. Ô vàng là cây đã chín. Về nhà lên GIƯỜNG để ngủ — cây chỉ lớn ở ô đã tưới.",
    target: "#minimap",
  },
];

export const DESKTOP_STEPS: TutorialStep[] = [
  {
    title: "Bấm để đi, bấm đôi để làm",
    text: "Bấm chuột vào ô: nhân vật tự đi tới. Bấm đôi để làm việc. Hoặc WASD + Space như game cổ điển.",
    target: null,
  },
  {
    title: "Hotbar",
    text: "Phím 1–9 hoặc lăn chuột để chọn vật phẩm. Ô đang ngắm được giữ lại, nên cày → gieo → tưới không cần ngắm lại.",
    target: "#hotbar",
  },
  {
    title: "Bản đồ nhỏ",
    text: "Bấm vào bản đồ để đi xa. Ô vàng là cây chín. Về nhà lên GIƯỜNG để ngủ — cây chỉ lớn ở ô đã tưới.",
    target: "#minimap",
  },
];

export function createTutorial(root: HTMLElement, onDone: () => void): Tutorial {
  let steps: TutorialStep[] = [];
  let i = 0;
  let open = false;

  const close = () => {
    if (!open) return;
    open = false;
    root.innerHTML = "";
    root.hidden = true;
    onDone();
  };

  function render() {
    const st = steps[i];
    if (!st) return close();
    root.innerHTML = "";
    root.hidden = false;

    const ring = document.createElement("div");
    ring.className = "tut-ring";
    const target = st.target ? document.querySelector<HTMLElement>(st.target) : null;
    const rr = root.getBoundingClientRect();
    if (target) {
      const r = target.getBoundingClientRect();
      const pad = 8;
      ring.style.left = `${r.left - rr.left - pad}px`;
      ring.style.top = `${r.top - rr.top - pad}px`;
      ring.style.width = `${r.width + pad * 2}px`;
      ring.style.height = `${r.height + pad * 2}px`;
      root.appendChild(ring);
    }

    const card = document.createElement("div");
    card.className = "tut-card";
    // Thẻ đặt ở nửa màn hình đối diện với phần tử đang khoanh để không che nó.
    if (target) {
      const r = target.getBoundingClientRect();
      const mid = rr.top + rr.height / 2;
      card.classList.add(r.top + r.height / 2 > mid ? "top" : "bottom");
    } else card.classList.add("center");

    card.innerHTML = `
      <div class="tut-step">${i + 1}/${steps.length}</div>
      <h3></h3><p></p>
      <div class="tut-actions">
        <button type="button" class="ghost" data-skip>Bỏ qua</button>
        <button type="button" class="primary" data-next></button>
      </div>`;
    (card.querySelector("h3") as HTMLElement).textContent = st.title;
    (card.querySelector("p") as HTMLElement).textContent = st.text;
    const next = card.querySelector<HTMLButtonElement>("[data-next]")!;
    next.textContent = i === steps.length - 1 ? "Bắt đầu chơi" : "Tiếp";
    next.addEventListener("click", () => {
      i++;
      render();
    });
    card.querySelector("[data-skip]")!.addEventListener("click", close);
    root.appendChild(card);
    next.focus();
  }

  const onKey = (e: KeyboardEvent) => {
    if (!open) return;
    if (e.code === "Escape") close();
    if (e.code === "Enter" || e.code === "Space") {
      i++;
      render();
      e.preventDefault();
    }
  };
  window.addEventListener("keydown", onKey);

  return {
    start(list = TOUCH_STEPS) {
      steps = list;
      i = 0;
      open = true;
      render();
    },
    isOpen: () => open,
    close,
  };
}
