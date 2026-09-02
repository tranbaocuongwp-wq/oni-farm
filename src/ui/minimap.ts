/* ============================================================================
   MINIMAP — nhìn toàn bản đồ, và bấm vào đâu thì đi tới đó.

   Đây là câu trả lời cho việc "đi lại trên bản đồ quá cực": camera bám sát nhân
   vật nên lúc nào cũng chỉ thấy ~10 ô quanh mình, không biết ruộng của mình ra
   sao và cũng không bấm-để-đi tới chỗ ngoài khung nhìn được. Bản đồ nhỏ giải
   quyết cả hai: vừa để nhìn tổng thể, vừa là bàn đạp để đi xa.

   Bản đồ có kích thước CỐ ĐỊNH nên vẽ nó rẻ: 1 pixel = 1 ô (40×30 = 1200 pixel),
   rồi phóng to bằng CSS với image-rendering: pixelated.

   Nền địa hình được CACHE và chỉ vẽ lại khi mảng ô thật sự đổi. Nhờ reducer dùng
   copy-on-write, chỉ cần so sánh THAM CHIẾU mảng là biết — không phải quét 1200 ô
   mỗi khung hình chỉ để phát hiện không có gì đổi.
============================================================================ */

import type { Content, GameState } from "../game/types.ts";

/** Một pixel cho mỗi ô. Phóng to là việc của CSS. */
const C = {
  grass: "#4a7c3f",
  path: "#a5875e",
  water: "#2f6fc4",
  tree: "#24521f",
  rock: "#8a8f98",
  bush: "#3f7a3a",
  house: "#e5e9f0",
  door: "#f5c542",
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
}

export function createMinimap(host: HTMLElement): Minimap {
  const canvas = host.querySelector("canvas") as HTMLCanvasElement;
  const g = canvas.getContext("2d")!;

  // lớp nền được cache, chỉ vẽ lại khi mảng ô đổi
  const terrain = document.createElement("canvas");
  const tg = terrain.getContext("2d")!;
  let lastTiles: unknown = null;

  let pick: (tx: number, ty: number) => void = () => {};
  let view = { x: 0, y: 0, w: 0, h: 0 };
  let visible = true;

  function ensureSize(s: GameState) {
    if (canvas.width === s.w && canvas.height === s.h) return;
    canvas.width = s.w;
    canvas.height = s.h;
    terrain.width = s.w;
    terrain.height = s.h;
    lastTiles = null;
    // Tỉ lệ khung do bản đồ quyết định; CSS chỉ giới hạn bề rộng.
    canvas.style.aspectRatio = `${s.w} / ${s.h}`;
    g.imageSmoothingEnabled = false;
  }

  function drawTerrain(s: GameState, content: Content) {
    tg.clearRect(0, 0, s.w, s.h);
    for (let y = 0; y < s.h; y++) {
      for (let x = 0; x < s.w; x++) {
        const t = s.tiles[y * s.w + x];
        if (!t) continue;
        let c: string = C.grass;
        if (t.g === "water") c = C.water;
        else if (t.g === "path") c = C.path;

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
        switch (t.prop) {
          case "tree": c = C.tree; break;
          case "rock": c = C.rock; break;
          case "bush": c = C.bush; break;
          case "house": c = C.house; break;
          case "door": c = C.door; break;
          case "shop": c = C.shop; break;
          case "counter": c = C.counter; break;
        }
        tg.fillStyle = c;
        tg.fillRect(x, y, 1, 1);
      }
    }
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
      if (s.tiles !== lastTiles) {
        lastTiles = s.tiles;
        drawTerrain(s, content);
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
    },
    onPick(fn) {
      pick = fn;
    },
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
