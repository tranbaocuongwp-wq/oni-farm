/* ============================================================================
   MAIN — nơi duy nhất nối các mảnh lại: content → state → store → render/UI.

   Luồng dữ liệu đúng MỘT chiều:

       input ─▶ dispatch(action) ─▶ reduce ─▶ state mới ─▶ render + HUD
                                              │
                                              └─▶ save (snapshot)

   Không có đường tắt nào từ UI sửa thẳng state. Muốn thêm cơ chế mới thì thêm
   Action, không phải thêm một biến toàn cục.
============================================================================ */

import "./style.css";

import { buildAtlas, TILE } from "./art/atlas.ts";
import { createInput, bindTouchButton } from "./core/input.ts";
import { createLoop } from "./core/loop.ts";
import { createStore, type Store } from "./core/store.ts";
import { CORE_VERSION } from "./core/version.ts";
import {
  exportToFile,
  importFromFile,
  loadGame,
  migrateSave,
  saveGame,
} from "./core/save.ts";
import {
  checkForUpdate,
  pendingContentVersion,
  resolveContent,
  revertToBundled,
} from "./core/content/ota.ts";
import { initAudio, isMuted, play, setMuted } from "./core/sfx.ts";
import { createRenderer, type Cursor } from "./render/draw.ts";
import { createHud } from "./ui/hud.ts";
import { createMenus } from "./ui/menus.ts";
import { createToasts } from "./ui/toast.ts";
import type { Content, GameState, Stats } from "./game/types.ts";
import { createNewGame, migrateForContent } from "./game/state.ts";
import { interactAt } from "./game/actions.ts";

/** Gốc URL phục vụ content OTA. Để trống ("") = tắt hẳn, game chạy thuần offline.
 *
 *  Trỏ vào bản đã deploy: cây trồng, công trình, giá cả, bản đồ đổi được mà
 *  KHÔNG cần build lại và deploy lại bundle web. Đây chính là điểm của việc
 *  tách core/content.
 *
 *  Việc hỏi thăm chạy NGẦM và không bao giờ chặn: mất mạng thì game vẫn mở bằng
 *  content đóng kèm như thường. */
const CONTENT_URL = "https://oni-farm.pages.dev";

/** Tầm với: người chơi chỉ thao tác được ô cách tâm mình dưới ngần này pixel. */
const REACH = TILE * 1.8;

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;

async function boot() {
  const bootEl = $("#boot");
  const showError = (msg: string) => {
    bootEl.innerHTML = `<div class="inner"><h1>ONIFARM</h1>
      <p>Không khởi động được. Nội dung game có vấn đề:</p>
      <div class="err"></div></div>`;
    (bootEl.querySelector(".err") as HTMLElement).textContent = msg;
    bootEl.style.display = "grid";
  };

  /* Khai báo sớm: menu có thể được mở ngay khung hình đầu tiên, trước khi
     bước OTA ở cuối hàm chạy tới. */
  let pendingVersion: string | null = null;

  /* ---- 1. content: pack OTA đã cache, nếu không thì pack đóng kèm ---- */
  let content: Content;
  let contentSource: "bundled" | "ota" = "bundled";
  const contentWarnings: string[] = [];
  try {
    const r = await resolveContent();
    content = r.content;
    contentSource = r.source;
    contentWarnings.push(...r.warnings);
  } catch (e) {
    showError(e instanceof Error ? e.message : String(e));
    return;
  }

  // Ghi phiên bản nội dung ra thẻ <html> — nhìn phát biết người chơi đang chạy
  // content nào và nó đến từ đâu. Rất đỡ khi hỗ trợ người chơi hoặc soi lỗi OTA.
  const root = document.documentElement;
  root.dataset["content"] = content.contentVersion;
  root.dataset["contentSource"] = contentSource;
  root.dataset["core"] = CORE_VERSION;

  /* ---- 2. mỹ thuật ---- */
  const atlas = buildAtlas(content);

  /* ---- 3. state: tiếp tục save cũ hoặc bắt đầu mới ---- */
  let initial: GameState;
  const saved = await loadGame();
  const migrated = saved ? migrateSave(saved) : null;
  if (migrated) {
    // save có thể được tạo bởi content CŨ — chỉnh lại cho khớp content hiện tại
    const fixed = migrateForContent(migrated, content);
    initial = fixed.state;
    contentWarnings.push(...fixed.notes);
  } else {
    initial = createNewGame(content);
    if (saved) contentWarnings.push("Save cũ không đọc được — đã bắt đầu nông trại mới.");
  }

  const store: Store = createStore(initial, content, {
    validate: import.meta.env.DEV,
    strict: false,
    historyLimit: 0,
  });

  /* ---- 4. hệ thống hiển thị ---- */
  const canvas = $<HTMLCanvasElement>("#game");
  const renderer = createRenderer(canvas, atlas);
  const hud = createHud($("#hud"), atlas);
  const toasts = createToasts($("#toasts"));

  const menus = createMenus($("#modal-root"), atlas, () => store.getState(), () => content, {
    buy: (id, n) => store.dispatch({ t: "BUY", id, n }),
    sell: (id, n) => store.dispatch({ t: "SELL", id, n }),
    sellAll: () => store.dispatch({ t: "SELL_ALL" }),
    save: async () => {
      const r = await saveGame(store.snapshot());
      toasts.say(r.ok ? "Đã lưu game." : "Không lưu được — bộ nhớ trình duyệt bị chặn?", r.ok ? "good" : "bad");
    },
    load: async () => {
      const d = await loadGame();
      const st = d ? migrateSave(d) : null;
      if (!st) return toasts.say("Chưa có bản lưu nào.", "bad");
      store.replace(migrateForContent(st, content).state);
      menus.close();
      toasts.say("Đã tải bản lưu.", "good");
    },
    exportSave: () => {
      exportToFile(store.snapshot());
      toasts.say("Đang tải file save về máy.", "good");
    },
    importSave: async () => {
      const d = await importFromFile();
      const st = d ? migrateSave(d) : null;
      if (!st) return toasts.say("File save không hợp lệ.", "bad");
      store.replace(migrateForContent(st, content).state);
      menus.close();
      toasts.say("Đã nhập bản lưu.", "good");
    },
    newGame: () => store.replace(createNewGame(content)),
    toggleMute: () => {
      setMuted(!isMuted());
      return isMuted();
    },
    isMuted,
    revertContent: async () => {
      await revertToBundled();
      toasts.say(content.strings.msg["otaReverted"] ?? "Đã quay về nội dung đóng kèm.", "good");
    },
    contentInfo: () => ({
      version: content.contentVersion,
      source: contentSource,
      pending: pendingVersion,
    }),
  });

  hud.onSelect((slot) => store.dispatch({ t: "SELECT", slot }));

  /* ---- 5. input ---- */
  const input = createInput(canvas, {
    toCanvas: (x, y) => renderer.toCanvas(x, y),
    isModalOpen: () => menus.isOpen(),
  });

  if (matchMedia("(pointer: coarse)").matches) document.body.classList.add("touch");
  for (const [sel, code] of [
    ["#dpad .up", "KeyW"],
    ["#dpad .down", "KeyS"],
    ["#dpad .left", "KeyA"],
    ["#dpad .right", "KeyD"],
    ["#abtn .a", "Space"],
    ["#abtn .b", "KeyE"],
  ] as [string, string][]) {
    const el = document.querySelector<HTMLElement>(sel);
    if (el) bindTouchButton(el, code);
  }

  /* ---- 6. âm thanh: suy ra từ thay đổi thống kê, không cần action riêng ---- */
  let lastStats: Stats = store.getState().stats;
  let lastMoney = store.getState().money;
  let lastDay = store.getState().day;

  const countBuilt = (st: Stats) => Object.values(st.built).reduce((x, y) => x + y, 0);

  store.subscribe((s) => {
    const a = s.stats;
    const b = lastStats;
    if (a.tilled > b.tilled) play("till");
    else if (a.watered > b.watered) play("water");
    else if (a.planted > b.planted) play("plant");
    else if (a.harvested > b.harvested) play("harvest");
    else if (countBuilt(a) > countBuilt(b)) play("build");
    else if (s.money > lastMoney) play("coin");
    if (s.day > lastDay) play("sleep");
    lastStats = a;
    lastMoney = s.money;
    lastDay = s.day;
  });

  // âm thanh chỉ được phép khởi tạo sau cử chỉ đầu tiên (luật autoplay)
  const unlockAudio = () => {
    initAudio();
    window.removeEventListener("pointerdown", unlockAudio);
    window.removeEventListener("keydown", unlockAudio);
  };
  window.addEventListener("pointerdown", unlockAudio);
  window.addEventListener("keydown", unlockAudio);

  /* ---- 7. tự lưu ---- */
  let dirtySince = 0;
  const autosave = async () => {
    dirtySince = 0;
    await saveGame(store.snapshot());
  };
  // Theo dõi ngày bằng biến RIÊNG: subscriber âm thanh ở trên cũng cập nhật
  // lastDay, mà nó chạy trước, nên dùng chung biến sẽ không bao giờ khớp.
  // Ngày mới còn có thể đến từ TICK (ngất) chứ không chỉ từ SLEEP.
  let savedDay = store.getState().day;
  store.subscribe((s) => {
    if (s.day > savedDay) {
      savedDay = s.day;
      void autosave();
    } else dirtySince++;
  });
  // lưu thêm mỗi 30 giây nếu có thay đổi, và khi rời trang
  setInterval(() => {
    if (dirtySince > 0) void autosave();
  }, 30_000);
  addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && dirtySince > 0) void autosave();
  });

  /* ---- 8. ô đang nhắm: theo chuột nếu có, không thì theo hướng nhân vật ---- */
  function targetTile(s: GameState, forceFacing = false): Cursor | null {
    const p = forceFacing ? null : input.pointer();
    let tx: number;
    let ty: number;
    if (p) {
      const t = renderer.toTile(p.x, p.y, s);
      tx = t.x;
      ty = t.y;
    } else {
      const d = s.player.dir;
      const ox = d === "left" ? -1 : d === "right" ? 1 : 0;
      const oy = d === "up" ? -1 : d === "down" ? 1 : 0;
      tx = Math.floor(s.player.x / TILE) + ox;
      ty = Math.floor(s.player.y / TILE) + oy;
    }
    if (tx < 0 || ty < 0 || tx >= s.w || ty >= s.h) return null;
    const dist = Math.hypot(tx * TILE + TILE / 2 - s.player.x, ty * TILE + TILE / 2 - s.player.y);
    return { x: tx, y: ty, ok: dist <= REACH };
  }

  /* ---- 9. vòng lặp ---- */
  let elapsed = 0;
  const loop = createLoop((dt) => {
    elapsed += dt;
    const modal = menus.isOpen();

    if (!modal) {
      const ax = input.axis();
      if (ax.x !== 0 || ax.y !== 0) store.dispatch({ t: "MOVE", dx: ax.x, dy: ax.y, dt });
      else if (store.getState().player.moving) store.dispatch({ t: "MOVE", dx: 0, dy: 0, dt });
      store.dispatch({ t: "TICK", dt });
    }

    for (const it of input.drain()) {
      const s = store.getState();
      switch (it.t) {
        case "menu":
          if (menus.isOpen()) menus.close();
          else menus.openPause();
          break;
        case "shop":
          if (!modal) menus.openShop();
          break;
        case "inventory":
          if (!modal) menus.openHelp();
          break;
        case "select":
          store.dispatch({ t: "SELECT", slot: it.slot });
          break;
        case "selectDelta": {
          const n = content.balance.hotbarSlots;
          store.dispatch({ t: "SELECT", slot: (s.sel + it.d + n) % n });
          break;
        }
        case "use": {
          const c = targetTile(s);
          if (c?.ok) store.dispatch({ t: "USE", x: c.x, y: c.y });
          else if (c) play("deny");
          break;
        }
        case "interact":
        case "pointer": {
          const c =
            it.t === "pointer"
              ? ((): Cursor | null => {
                  const t = renderer.toTile(it.sx, it.sy, s);
                  const dist = Math.hypot(
                    t.x * TILE + TILE / 2 - s.player.x,
                    t.y * TILE + TILE / 2 - s.player.y,
                  );
                  return { x: t.x, y: t.y, ok: dist <= REACH };
                })()
              : // phím E luôn nhắm ô TRƯỚC MẶT, không bao giờ theo con trỏ chuột
                targetTile(s, true);
          if (!c) break;
          // ưu tiên tương tác (cửa/máy/quầy), không thì dùng vật phẩm
          const kind = nearbyInteract(s, c.x, c.y);
          if (kind === "SHOP") menus.openShop();
          else if (kind === "SELL") menus.openSell();
          else if (kind === "SLEEP") store.dispatch({ t: "SLEEP" });
          else if (it.t === "pointer" && c.ok) store.dispatch({ t: "USE", x: c.x, y: c.y });
          else if (it.t === "interact") play("deny");
          break;
        }
      }
    }

    const s = store.getState();
    // toast: hiện rồi báo cho state biết đã hiện xong
    if (s.log.length) {
      const upTo = toasts.show(s.log);
      if (upTo) store.dispatch({ t: "LOG_SEEN", upTo });
    }

    renderer.draw(s, content, modal ? null : targetTile(s), elapsed);
    hud.update(s, content);
  });

  /** Tương tác nhận cả ô kề bên ô đang nhắm — đứng chệch một chút vẫn bấm được,
   *  đỡ phải căn chỉnh từng pixel. */
  function nearbyInteract(s: GameState, x: number, y: number) {
    for (const [dx, dy] of [
      [0, 0], [0, -1], [0, 1], [-1, 0], [1, 0],
    ] as [number, number][]) {
      const k = interactAt(s, content, x + dx, y + dy);
      if (k) {
        const dist = Math.hypot(
          (x + dx) * TILE + TILE / 2 - s.player.x,
          (y + dy) * TILE + TILE / 2 - s.player.y,
        );
        if (dist <= REACH + TILE) return k;
      }
    }
    return null;
  }

  addEventListener("resize", () => renderer.resize());
  renderer.resize();
  bootEl.style.display = "none";
  loop.start();

  /* Cầu test (chỉ ở bản dev). requestAnimationFrame KHÔNG chạy khi document bị
     ẩn — trong trình duyệt tự động hoá thì trang luôn ở trạng thái hidden, nên
     không có cầu này thì không cách nào kiểm được game bằng script.
     Cũng tiện để mô phỏng nhanh: step(1/60) gọi tay chạy nhanh gấp trăm lần thật. */
  if (import.meta.env.DEV) {
    (window as unknown as Record<string, unknown>)["__PF"] = {
      store,
      content,
      atlas,
      menus,
      renderer,
      step: (dt = 1 / 60, times = 1) => {
        for (let i = 0; i < times; i++) loop.step(dt);
      },
    };
  }

  for (const w of contentWarnings) toasts.say(w, "bad");

  /* ---- 10. OTA: hỏi thăm bản mới, chạy NGẦM, không chặn gì ---- */
  pendingVersion = await pendingContentVersion();
  if (CONTENT_URL) {
    void checkForUpdate(content.contentVersion, { contentUrl: CONTENT_URL }).then((r) => {
      if (r.status === "ready") {
        pendingVersion = r.contentVersion;
        toasts.say(content.strings.msg["otaFound"] ?? "Có bản cập nhật nội dung mới.", "good");
      } else if (r.status === "invalid") {
        console.warn("[ota] pack bị từ chối:", r.problems);
      } else if (r.status === "incompatible") {
        console.warn(`[ota] cần core ${r.requiresCore}, đang chạy ${CORE_VERSION}`);
      }
    });
  }
}

/* Service worker: chỉ đăng ký ở bản build. Ở dev nó sẽ cache mất module và
   làm HMR cư xử kỳ quặc — lỗi rất mất thời gian để lần ra. */
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js").catch(() => {
      /* không đăng ký được cũng không sao — game vẫn chạy, chỉ là không offline sẵn */
    });
  });
}

void boot().catch((e) => {
  console.error(e);
  const el = document.querySelector("#boot");
  if (el instanceof HTMLElement) {
    el.style.display = "grid";
    el.innerHTML = `<div class="inner"><h1>ONIFARM</h1><p>Lỗi khởi động:</p>
      <div class="err">${String(e instanceof Error ? e.stack ?? e.message : e)}</div></div>`;
  }
});
