/* ============================================================================
   MINIMAP — nhìn toàn bản đồ, và bấm vào đâu thì đi tới đó.

   Đây là câu trả lời cho việc "đi lại trên bản đồ quá cực": camera bám sát nhân
   vật nên lúc nào cũng chỉ thấy ~10 ô quanh mình, không biết ruộng của mình ra
   sao và cũng không bấm-để-đi tới chỗ ngoài khung nhìn được. Bản đồ nhỏ giải
   quyết cả hai: vừa để nhìn tổng thể, vừa là bàn đạp để đi xa.

   Bản đồ có kích thước CỐ ĐỊNH nên vẽ nó rẻ: 1 pixel = 1 ô (40×30 = 1200 pixel),
   rồi phóng to bằng CSS với image-rendering: pixelated.

   Nền địa hình được CACHE, và cache đó so TỪNG Ô chứ không so tham chiếu MẢNG.

   Vì sao không so mảng: bản cũ làm đúng thế (`s.tiles !== lastTiles`), và trên
   giấy thì hợp lý — reducer dùng copy-on-write nên mảng chỉ đổi khi có gì đổi.
   Chỗ hỏng là "có gì đổi" xảy ra ở MỌI khung hình: cây trồng cộng dồn `grow`
   từng khung, nên chỉ cần một ô ẩm có cây là `dTiles` nhân bản cả mảng. Một
   nông trại đã gieo thì cache KHÔNG BAO GIỜ trúng, và bản đồ nhỏ vẽ lại cả
   1.776 ô bằng 1.776 lệnh `fillRect` mỗi khung — đo được là 59% tổng số lệnh
   vẽ của cả trò chơi, cho một bức ảnh gần như không đổi.

   So từng ô thì đúng thứ cần đúng: copy-on-write chỉ THAY object của những ô
   thật sự đổi, nên một phép so tham chiếu cho mỗi ô (rẻ, không đụng canvas)
   tìm ra đúng vài ô cần vẽ lại. 1.776 `fillRect` → thường là 0.

   Và `grow` của cây KHÔNG đổi màu ô: màu chỉ phụ thuộc nền, đất cày, ẩm, công
   trình, vật thể, và cây đã chín hay chưa. Nên phần lớn ô "đã đổi" vẫn vẽ lại
   ra đúng màu cũ — vẫn rẻ hơn hẳn quét toàn bản đồ.
============================================================================ */

import type { Content, GameState } from "../game/types.ts";

/** Một pixel cho mỗi ô. Phóng to là việc của CSS. */
const C = {
  grass: "#4a7c3f",
  path: "#a5875e",
  water: "#2f6fc4",
  wood: "#a97d4e",
  tree: "#24521f",
  sapling: "#3d8a3f",
  stump: "#6b4a2c",
  rock: "#8a8f98",
  bush: "#3f7a3a",
  well: "#5aa9e6",
  house: "#e5e9f0",
  wall: "#6b5540",
  bed: "#c25b48",
  bench: "#8a6440",
  door: "#f5c542",
  door_in: "#f5c542",
  shop: "#88c0d0",
  counter: "#c98a3a",
  soil: "#6f4c30",
  soilWet: "#4a3220",
  crop: "#7fdc55",
  ripe: "#f5c542",
  building: "#5ad2f0",
  player: "#ffffff",
  playerRing: "#14100c",
  view: "rgba(255,255,255,0.85)",
  /** Con trỏ ô của tay cầm. Vàng, không trùng với trắng của nhân vật. */
  cursor: "#f5c542",
} as const;

export interface Minimap {
  /** gọi mỗi khung hình; tự bỏ qua khi không có gì đổi */
  update(s: GameState, content: Content): void;
  /** bấm/chạm vào bản đồ nhỏ → toạ độ Ô */
  onPick(fn: (tx: number, ty: number) => void): void;
  toggle(): void;
  isVisible(): boolean;
  /** khung nhìn hiện tại, để vẽ ô chữ nhật cho biết đang xem chỗ nào */
  setView(x: number, y: number, w: number, h: number): void;
  /**
   * CON TRỎ Ô cho tay cầm — `null` để tắt.
   *
   * Vì sao phải có: bấm-để-đi là cách đi xa duy nhất trong game, mà bản đồ nhỏ
   * trước đây chỉ nghe `pointerdown`. Tay cầm không có con trỏ chuột nên nút
   * Back chỉ bật/tắt được cái bản đồ chứ không đi tới đâu — nó thành tranh
   * trang trí, và người chơi phải giữ cần gạt suốt chiều dài nông trại 48×37.
   */
  setCursor(c: { x: number; y: number } | null): void;
  /** Ô con trỏ đang chỉ, `null` khi không bật. */
  cursor(): { x: number; y: number } | null;
}

export function createMinimap(host: HTMLElement): Minimap {
  const canvas = host.querySelector("canvas") as HTMLCanvasElement;
  const g = canvas.getContext("2d")!;

  // lớp nền được cache, chỉ vẽ lại khi mảng ô đổi
  const terrain = document.createElement("canvas");
  const tg = terrain.getContext("2d")!;
  let lastTiles: readonly unknown[] | null = null;
  let lastContent: Content | null = null;
  /** Màu đã vẽ của từng ô, để biết ô "vừa đổi" có thật sự đổi màu không. */
  let mauTruoc: string[] = [];

  let pick: (tx: number, ty: number) => void = () => {};
  let view = { x: 0, y: 0, w: 0, h: 0 };
  let visible = true;
  let cur: { x: number; y: number } | null = null;

  function ensureSize(s: GameState) {
    if (canvas.width === s.w && canvas.height === s.h) return;
    canvas.width = s.w;
    canvas.height = s.h;
    terrain.width = s.w;
    terrain.height = s.h;
    lastTiles = null;
    mauTruoc = [];
    // Tỉ lệ khung do bản đồ quyết định; CSS chỉ giới hạn bề rộng.
    canvas.style.aspectRatio = `${s.w} / ${s.h}`;
    g.imageSmoothingEnabled = false;
  }

  /** Màu của MỘT ô trên bản đồ nhỏ. Cố ý không phụ thuộc `crop.grow`. */
  function mauO(t: NonNullable<GameState["tiles"][number]>, content: Content): string {
    let c: string = C.grass;
    if (t.g === "water") c = C.water;
    else if (t.g === "path") c = C.path;
    else if (t.g === "wood") c = C.wood;

    if (t.tilled) c = t.wet ? C.soilWet : C.soil;
    if (t.b) {
      const def = content.buildings[t.b];
      c = def?.kind === "floor" ? C.building : C.building;
    }
    // Cây trồng vẽ ĐÈ lên đất: người chơi cần thấy ngay chỗ nào chín để ra thu.
    if (t.crop) {
      const def = content.crops[t.crop.id];
      const ripe = def ? t.crop.stage >= def.growthDays.length : false;
      c = ripe ? C.ripe : C.crop;
    }
    // Màu tra theo id prop; id lạ (content mới) vẫn hiện thành chấm xám để
    // người chơi biết chỗ đó có VẬT GÌ ĐÓ, thay vì biến mất khỏi bản đồ.
    if (t.prop) c = (C as Record<string, string>)[t.prop] ?? "#9aa0a6";
    return c;
  }

  /** Vẽ lại TOÀN BỘ nền. Dùng khi chưa có gì để so: lần đầu, đổi bản đồ, đổi
   *  kích thước, hoặc content mới về qua OTA (bảng màu công trình/cây đổi). */
  function drawTerrain(s: GameState, content: Content) {
    tg.clearRect(0, 0, s.w, s.h);
    const n = s.w * s.h;
    if (mauTruoc.length !== n) mauTruoc = new Array<string>(n);
    for (let i = 0; i < n; i++) {
      const t = s.tiles[i];
      if (!t) {
        mauTruoc[i] = "";
        continue;
      }
      const c = mauO(t, content);
      mauTruoc[i] = c;
      tg.fillStyle = c;
      tg.fillRect(i % s.w, (i / s.w) | 0, 1, 1);
    }
  }

  /**
   * Vẽ lại đúng những ô có OBJECT khác lần trước.
   *
   * Trả về false nếu không so được (độ dài mảng lệch — đổi bản đồ), lúc đó nơi
   * gọi phải vẽ lại toàn bộ.
   */
  function veODaDoi(s: GameState, content: Content, truoc: readonly unknown[]): boolean {
    const n = s.w * s.h;
    if (truoc.length !== n || s.tiles.length !== n) return false;
    if (mauTruoc.length !== n) return false;
    for (let i = 0; i < n; i++) {
      const t = s.tiles[i];
      if (t === truoc[i]) continue;
      if (!t) continue;
      /* Ô đã đổi OBJECT chưa chắc đã đổi MÀU — và phần lớn là không. Cây trồng
         cộng `grow` mỗi khung nên cả 360 ô ruộng đều "mới", trong khi màu của
         chúng chỉ nhảy đúng một lần lúc chín. So màu trước khi vẽ thì 405 lệnh
         `fillRect` mỗi khung xuống còn gần như không có lệnh nào; `mauO` chỉ là
         vài phép so thuộc tính, rẻ hơn hẳn một lệnh canvas. */
      const c = mauO(t, content);
      if (c === mauTruoc[i]) continue;
      mauTruoc[i] = c;
      tg.fillStyle = c;
      tg.fillRect(i % s.w, (i / s.w) | 0, 1, 1);
    }
    return true;
  }

  canvas.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const r = canvas.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return;
    const tx = Math.floor(((e.clientX - r.left) / r.width) * canvas.width);
    const ty = Math.floor(((e.clientY - r.top) / r.height) * canvas.height);
    if (tx < 0 || ty < 0 || tx >= canvas.width || ty >= canvas.height) return;
    pick(tx, ty);
  });

  return {
    update(s, content) {
      if (!visible) return;
      ensureSize(s);
      /* Content đổi (OTA) thì bảng màu đổi theo — phải vẽ lại hết, không chỉ
         những ô vừa đổi. */
      if (s.tiles !== lastTiles || content !== lastContent) {
        const veHet =
          content !== lastContent ||
          lastTiles === null ||
          !veODaDoi(s, content, lastTiles as readonly unknown[]);
        if (veHet) drawTerrain(s, content);
        lastTiles = s.tiles;
        lastContent = content;
      }

      g.clearRect(0, 0, canvas.width, canvas.height);
      g.drawImage(terrain, 0, 0);

      // khung nhìn hiện tại
      if (view.w > 0) {
        g.strokeStyle = C.view;
        g.lineWidth = 1;
        g.strokeRect(
          Math.round(view.x) + 0.5,
          Math.round(view.y) + 0.5,
          Math.max(1, Math.round(view.w) - 1),
          Math.max(1, Math.round(view.h) - 1),
        );
      }

      // Nhân vật: chấm sáng có viền tối, để nổi trên mọi màu nền.
      const px = Math.floor(s.player.x / 16);
      const py = Math.floor(s.player.y / 16);
      g.fillStyle = C.playerRing;
      g.fillRect(px - 1, py - 1, 3, 3);
      g.fillStyle = C.player;
      g.fillRect(px, py, 1, 1);

      /* Con trỏ tay cầm: chữ thập, KHÔNG phải chấm đặc. Trên lưới 1 pixel = 1
         ô thì một chấm đặc lẫn ngay vào chấm nhân vật và vào ô cây chín; chữ
         thập thì vẫn thấy được cái ô nó đang chỉ nằm dưới. */
      if (cur) {
        const cx = Math.max(0, Math.min(s.w - 1, cur.x));
        const cy = Math.max(0, Math.min(s.h - 1, cur.y));
        g.fillStyle = C.playerRing;
        g.fillRect(cx - 2, cy, 5, 1);
        g.fillRect(cx, cy - 2, 1, 5);
        g.fillStyle = C.cursor;
        g.fillRect(cx - 1, cy, 3, 1);
        g.fillRect(cx, cy - 1, 1, 3);
      }
    },
    onPick(fn) {
      pick = fn;
    },
    setCursor(c) {
      cur = c;
    },
    cursor: () => cur,
    toggle() {
      visible = !visible;
      host.classList.toggle("hidden", !visible);
    },
    isVisible: () => visible,
    setView(x, y, w, h) {
      view = { x, y, w, h };
    },
  };
}
