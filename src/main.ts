/* ============================================================================
   MAIN — nơi duy nhất nối các mảnh lại: content → state → store → render/UI.

   Luồng dữ liệu đúng MỘT chiều:

       input ─▶ dispatch(action) ─▶ reduce ─▶ state mới ─▶ render + HUD
                                              │
                                              └─▶ save (snapshot)

   Không có đường tắt nào từ UI sửa thẳng state. Muốn thêm cơ chế mới thì thêm
   Action, không phải thêm một biến toàn cục.

   Những thứ KHÔNG phải state (và cố tình không phải): settings của máy, hạt
   hiệu ứng, rung, thẻ "Ngày N", tutorial, ô đang ngắm, đích đang đi tới. Chúng
   là ý định nhất thời hoặc sở thích của thiết bị — không đáng nằm trong save.
============================================================================ */

import "./style.css";

import { buildAtlas, TILE } from "./art/atlas.ts";
import { createInput, bindTouchButton } from "./core/input.ts";
import { observeScreen } from "./core/screen.ts";
import { alignedTo, createNavigator } from "./core/navigate.ts";
import { applySettings, loadSettings, saveSettings, type Settings } from "./core/settings.ts";
import { buzz, setHaptics } from "./core/haptics.ts";
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
import { createCamera } from "./render/camera.ts";
import { createRenderer, type BurstKind, type Cursor } from "./render/draw.ts";
import { createHud } from "./ui/hud.ts";
import { createMenus } from "./ui/menus.ts";
import { createToasts } from "./ui/toast.ts";
import { createMinimap } from "./ui/minimap.ts";
import { createDevPanel } from "./ui/devpanel.ts";
import { createTutorial, DESKTOP_STEPS, TOUCH_STEPS } from "./ui/tutorial.ts";
import type { Content, GameState, Stats } from "./game/types.ts";
import { createNewGame, migrateForContent } from "./game/state.ts";
import { canCraft, canUseAt, interactAt, linePath, missingFor } from "./game/actions.ts";
import { facingTile, hintAt, nearestTarget, type Hint } from "./game/hint.ts";
import { forecastDef, weatherDef, isOutdoor } from "./game/weather.ts";
import { currentSeason } from "./game/season.ts";
import { animalNear, readyProduct } from "./game/animals.ts";
import { canPlaceBuilding } from "./game/world.ts";
import type { UseKind } from "./game/actions.ts";

/** Gốc URL phục vụ content OTA. Để trống ("") = tắt hẳn, game chạy thuần offline. */
const CONTENT_URL = "https://oni-farm.pages.dev";

/** Tầm với: người chơi chỉ thao tác được ô cách tâm mình dưới ngần này pixel. */
const REACH = TILE * 1.8;

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;

/** Sự kiện cài PWA của Chrome/Edge — bắt sớm, dùng sau ở menu Tạm dừng. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}
let installPrompt: BeforeInstallPromptEvent | null = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  installPrompt = e as BeforeInstallPromptEvent;
});

/* ---- Chặn zoom của trình duyệt trên trang game -------------------------
   `user-scalable=no` bị iOS bỏ qua từ lâu; thứ iOS tôn trọng là
   `touch-action: manipulation` (CSS) cho chạm kép, còn véo hai ngón thì phải
   chặn bằng JS. Ba lớp bảo hiểm: gesturestart (Safari), touchmove nhiều ngón
   (Chrome/Android), và chạm kép trên phần tử KHÔNG phải nút/ô — nút thì để
   nguyên, nếu không bấm nhanh hai lần vào +/− sẽ mất một lần. */
function preventBrowserZoom() {
  const opts = { passive: false } as AddEventListenerOptions;
  document.addEventListener("gesturestart", (e) => e.preventDefault(), opts);
  document.addEventListener("gesturechange", (e) => e.preventDefault(), opts);
  document.addEventListener(
    "touchmove",
    (e) => {
      if (e.touches.length > 1) e.preventDefault();
    },
    opts,
  );
  let lastEnd = 0;
  document.addEventListener(
    "touchend",
    (e) => {
      const now = performance.now();
      const interactive = (e.target as HTMLElement | null)?.closest?.(
        "button, .slot, .bslot, .tab, .switch, .segment, a, input, [role=button]",
      );
      if (now - lastEnd < 320 && !interactive) e.preventDefault();
      lastEnd = now;
    },
    opts,
  );
  document.addEventListener("dblclick", (e) => e.preventDefault(), opts);
  // Ctrl + lăn chuột / Ctrl +- trên desktop: giữ nguyên tỉ lệ pixel art.
  document.addEventListener(
    "wheel",
    (e) => {
      if (e.ctrlKey) e.preventDefault();
    },
    opts,
  );
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === "+" || e.key === "-" || e.key === "=" || e.key === "0"))
      e.preventDefault();
  });
}
preventBrowserZoom();

async function boot() {
  const bootEl = $("#boot");
  const showError = (msg: string) => {
    bootEl.innerHTML = `<div class="inner"><div class="logo">ONI<span>FARM</span></div>
      <p>Không khởi động được. Nội dung game có vấn đề:</p>
      <div class="err"></div></div>`;
    (bootEl.querySelector(".err") as HTMLElement).textContent = msg;
    bootEl.style.display = "grid";
  };

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

  const root = document.documentElement;
  root.dataset["content"] = content.contentVersion;
  root.dataset["contentSource"] = contentSource;
  root.dataset["core"] = CORE_VERSION;

  // Cảm ứng: bật lớp điều khiển ảo. Chuột/bàn phím vẫn chạy song song — máy lai
  // (laptop cảm ứng, tablet có bàn phím) dùng được cả hai mà không phải chọn.
  const isTouch = matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;
  if (isTouch) document.body.classList.add("touch");

  // Settings là sở thích của MÁY, không thuộc ván chơi — localStorage riêng,
  // không đi vào save. Nạp SỚM vì menu và camera tham chiếu tới nó lúc dựng.
  let settings: Settings = loadSettings();
  applySettings(settings);
  setHaptics(settings.haptics);

  /* ---- 2. mỹ thuật ---- */
  const atlas = buildAtlas(content);

  /* ---- 3. state: tiếp tục save cũ hoặc bắt đầu mới ---- */
  let initial: GameState;
  const saved = await loadGame();
  const migrated = saved ? migrateSave(saved) : null;
  if (migrated) {
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
  const stage = $("#stage");

  const camera = createCamera({ tile: TILE });
  camera.setZoom(settings.zoom);
  camera.setWorld(initial.w * TILE, initial.h * TILE);
  const renderer = createRenderer(canvas, atlas, camera);

  observeScreen(stage, (info) => {
    if (camera.setSize(info.cssW, info.cssH, info.dpr)) renderer.applyViewport();
    document.body.dataset["orientation"] = info.orientation;
  });
  camera.jumpTo(initial.player.x, initial.player.y);
  const hud = createHud($("#hud"), atlas);
  const toasts = createToasts($("#toasts"));

  const tutorial = createTutorial($("#tutorial"), () => {
    if (!settings.tutorialSeen) setSetting("tutorialSeen", true);
  });

  /** Đổi MỘT khoá settings: lưu, áp dụng lên <body>, camera, rung. */
  function setSetting<K extends keyof Settings>(key: K, value: Settings[K]): Settings {
    settings = { ...settings, [key]: value };
    saveSettings(settings);
    applySettings(settings);
    setHaptics(settings.haptics);
    if (key === "zoom" && camera.setZoom(settings.zoom)) {
      renderer.applyViewport();
      const p = store.getState().player;
      camera.jumpTo(p.x, p.y);
    }
    return settings;
  }

  const menus = createMenus($("#modal-root"), atlas, () => store.getState(), () => content, {
    buy: (id, n) => store.dispatch({ t: "BUY", id, n }),
    swap: (a, b) => {
      store.dispatch({ t: "SWAP", a, b });
      buzz("tap");
    },
    craft: (id) => store.dispatch({ t: "CRAFT", id }),
    canCraft: (id) => canCraft(store.getState(), content, id),
    missingFor: (id) => missingFor(store.getState(), content, id),
    debug: (op, n) => store.dispatch({ t: "DEBUG", op, ...(n === undefined ? {} : { n }) }),
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
      adoptState(migrateForContent(st, content).state);
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
      adoptState(migrateForContent(st, content).state);
      menus.close();
      toasts.say("Đã nhập bản lưu.", "good");
    },
    newGame: () => adoptState(createNewGame(content)),
    toggleMute: () => {
      setMuted(!isMuted());
      return isMuted();
    },
    isMuted,
    settings: () => settings,
    setSetting,
    revertContent: async () => {
      await revertToBundled();
      toasts.say(content.strings.msg["otaReverted"] ?? "Đã quay về nội dung đóng kèm.", "good");
    },
    contentInfo: () => ({
      version: content.contentVersion,
      source: contentSource,
      pending: pendingVersion,
    }),
    storePut: (slot, n) => store.dispatch({ t: "STORE_PUT", slot, n }),
    storeTake: (slot, n) => store.dispatch({ t: "STORE_TAKE", slot, n }),
    storePutAll: () => store.dispatch({ t: "STORE_PUT_ALL" }),
    storeSellAll: () => store.dispatch({ t: "STORE_SELL_ALL" }),
    buyAnimal: (def) => store.dispatch({ t: "BUY_ANIMAL", def }),
    hire: (job) => store.dispatch({ t: "HIRE", job }),
    fire: (id) => store.dispatch({ t: "FIRE", id }),
    assign: (id, job) => store.dispatch({ t: "ASSIGN", id, job }),
    toggleDevPanel: () => devPanel.toggle(),
    canInstall: () => installPrompt !== null,
    install: async () => {
      const p = installPrompt;
      if (!p) return;
      installPrompt = null;
      menus.close();
      await p.prompt();
      const r = await p.userChoice;
      if (r.outcome === "accepted") toasts.say("Đã cài OniFarm về máy.", "good");
    },
    replayTutorial: () => tutorial.start(isTouch ? TOUCH_STEPS : DESKTOP_STEPS),
    isTouch: () => isTouch,
  });

  /** Thay state (tải save, chơi mới): camera phải NHẢY tới chỗ mới. */
  function adoptState(next: GameState) {
    store.replace(next);
    camera.setWorld(next.w * TILE, next.h * TILE);
    camera.jumpTo(next.player.x, next.player.y);
    lastMap = next.mapId;
    aimed = null;
  }

  hud.onSelect((slot) => {
    store.dispatch({ t: "SELECT", slot });
    buzz("tap");
  });
  hud.onBag(() => {
    if (tutorial.isOpen()) return;
    if (menus.isOpen()) menus.close();
    else menus.openBag();
  });

  /* Bảng gỡ lỗi NỔI. CỐ Ý không tính vào biến `modal`: game vẫn chạy, thời gian
     vẫn trôi, nhân vật vẫn đi được trong lúc bảng mở — đó mới là chỗ nó hữu ích,
     bấm một lệnh rồi nhìn thẳng vào thế giới thấy ngay kết quả. */
  const devPanel = createDevPanel($("#devpanel"), {
    debug: (op, n) => store.dispatch({ t: "DEBUG", op, ...(n === undefined ? {} : { n }) }),
  });

  const minimap = createMinimap($("#minimap"));
  minimap.onPick((tx, ty) => {
    if (menus.isOpen()) return;
    nav.goTo(store.getState(), content, tx, ty, { act: false });
  });

  /* ---- 5. input ---- */
  const stickZone = document.querySelector<HTMLElement>("#stick");
  const input = createInput(canvas, {
    toWorld: (cx, cy) => {
      const r = stage.getBoundingClientRect();
      return camera.screenToWorld(cx - r.left, cy - r.top);
    },
    isModalOpen: () => menus.isOpen() || tutorial.isOpen(),
    ...(stickZone
      ? {
          joystick: {
            zone: stickZone,
            base: stickZone.querySelector<HTMLElement>(".base")!,
            knob: stickZone.querySelector<HTMLElement>(".knob")!,
          },
        }
      : {}),
  });

  {
    const lb = document.querySelector<HTMLElement>("#linebtn");
    lb?.addEventListener("click", () => setLineMode(!lineMode));
  }

  for (const [sel, code] of [
    ["#abtn .a", "Space"],
    ["#abtn .b", "KeyE"],
    ["#abtn .auto", "KeyF"],
    ["#sysbtn .menu", "Escape"],
  ] as [string, string][]) {
    const el = document.querySelector<HTMLElement>(sel);
    if (el) bindTouchButton(el, code);
  }

  /* ---- 6. phản hồi: âm thanh + hạt + rung, suy ra từ thay đổi thống kê ---- */
  let lastStats: Stats = store.getState().stats;
  let lastMoney = store.getState().money;
  let lastDay = store.getState().day;
  /** Ô vừa được USE — để bắn hạt đúng chỗ. */
  let lastUse: { x: number; y: number } | null = null;

  const countBuilt = (st: Stats) => Object.values(st.built).reduce((x, y) => x + y, 0);

  const feedback = (sfx: Parameters<typeof play>[0], fx: BurstKind | null, hap: "success" | "heavy" = "success") => {
    play(sfx);
    buzz(hap);
    if (fx && lastUse) renderer.burst(fx, lastUse.x, lastUse.y);
  };

  store.subscribe((s) => {
    const a = s.stats;
    const b = lastStats;
    if (a.tilled > b.tilled) feedback("till", "dust");
    else if (a.watered > b.watered) feedback("water", "water");
    else if (a.planted > b.planted) feedback("plant", "leaf");
    else if (a.harvested > b.harvested) feedback("harvest", "leaf");
    else if (countBuilt(a) > countBuilt(b)) feedback("build", "spark", "heavy");
    else if (s.money > lastMoney) {
      play("coin");
      if (lastUse) renderer.burst("coin", lastUse.x, lastUse.y);
    }
    if (s.day > lastDay) play("sleep");
    lastStats = a;
    lastMoney = s.money;
    lastDay = s.day;
  });

  // chặt/đập không có ô thống kê riêng: bắt qua tham chiếu lưới đổi + hp giảm
  let lastTiles = store.getState().tiles;
  store.subscribe((s) => {
    if (s.tiles === lastTiles || !lastUse) {
      lastTiles = s.tiles;
      return;
    }
    const i = lastUse.y * s.w + lastUse.x;
    const before = lastTiles[i];
    const after = s.tiles[i];
    lastTiles = s.tiles;
    if (!before || !after || s.mapId !== lastMap) return;
    if (before.prop && (after.hp < before.hp || after.prop !== before.prop)) {
      const def = content.props[before.prop];
      const mine = def?.tool === "MINE";
      play(mine ? "till" : "harvest");
      buzz("heavy");
      renderer.burst(mine ? "stone" : "leaf", lastUse.x, lastUse.y);
    }
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
  let savedDay = store.getState().day;
  /** Mốc bắt đầu hiệu ứng chuyển ngày (giây của vòng lặp), 0 = không có. */
  let dayFadeAt = 0;
  store.subscribe((s) => {
    if (s.day > savedDay) {
      const passedOut = s.energy < content.balance.energyMax * 0.75;
      savedDay = s.day;
      void autosave();
      dayFadeAt = elapsed;
      const wxNow = weatherDef(s, content).name;
      const wxNext = forecastDef(s, content).name;
      hud.dayBanner(
        s.day,
        (passedOut ? "Ngất giữa đồng — dậy muộn và mệt · " : "") + `${wxNow} · mai: ${wxNext}`,
      );
    } else dirtySince++;
  });
  setInterval(() => {
    if (dirtySince > 0) void autosave();
  }, 30_000);
  addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && dirtySince > 0) void autosave();
  });
  addEventListener("pagehide", () => {
    if (dirtySince > 0) void autosave();
  });

  /* ---- 8. ô đang nhắm ---- */
  function targetTile(s: GameState, forceFacing = false): Cursor | null {
    const p = forceFacing || input.stickActive() ? null : input.pointer();

    if (!p && !forceFacing && aimed && inReachOf(s, aimed.x, aimed.y))
      return { x: aimed.x, y: aimed.y, ok: tileActionable(s, aimed.x, aimed.y) };

    let tx: number;
    let ty: number;
    if (p) {
      tx = Math.max(0, Math.min(s.w - 1, Math.floor(p.x / TILE)));
      ty = Math.max(0, Math.min(s.h - 1, Math.floor(p.y / TILE)));
    } else {
      const f = facingTile(s, TILE);
      tx = f.x;
      ty = f.y;
    }
    if (tx < 0 || ty < 0 || tx >= s.w || ty >= s.h) return null;
    return { x: tx, y: ty, ok: tileActionable(s, tx, ty) };
  }

  function inReachOf(s: GameState, tx: number, ty: number): boolean {
    return Math.hypot(tx * TILE + TILE / 2 - s.player.x, ty * TILE + TILE / 2 - s.player.y) <= REACH;
  }

  /* ---- 9. bấm-để-đi ---- */
  const nav = createNavigator();

  let lastPos = { x: store.getState().player.x, y: store.getState().player.y };
  let lastMap = store.getState().mapId;
  store.subscribe((st) => {
    const mapChanged = st.mapId !== lastMap;
    if (mapChanged) {
      lastMap = st.mapId;
      camera.setWorld(st.w * TILE, st.h * TILE);
      aimed = null;
    }
    if (mapChanged || Math.hypot(st.player.x - lastPos.x, st.player.y - lastPos.y) > TILE * 4) {
      camera.jumpTo(st.player.x, st.player.y);
      nav.cancel();
    }
    lastPos = { x: st.player.x, y: st.player.y };
  });

  let aimed: { x: number; y: number } | null = null;

  function snapTap(s: GameState, wx: number, wy: number): { x: number; y: number } {
    const raw = {
      x: Math.max(0, Math.min(s.w - 1, Math.floor(wx / TILE))),
      y: Math.max(0, Math.min(s.h - 1, Math.floor(wy / TILE))),
    };
    const radius = Math.max(4, Math.min(16, 26 / camera.viewport.scale));
    let best: { x: number; y: number } | null = null;
    let bestScore = Infinity;

    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const tx = raw.x + dx;
        const ty = raw.y + dy;
        if (tx < 0 || ty < 0 || tx >= s.w || ty >= s.h) continue;
        const d = Math.hypot(tx * TILE + TILE / 2 - wx, ty * TILE + TILE / 2 - wy);
        if (d > radius && !(dx === 0 && dy === 0)) continue;
        const useful =
          canUseAt(s, content, tx, ty, true) !== null || interactAt(s, content, tx, ty) !== null;
        const score = (useful ? 0 : 1000) + d;
        if (score < bestScore) {
          bestScore = score;
          best = { x: tx, y: ty };
        }
      }
    }
    return best ?? raw;
  }

  function tileActionable(s: GameState, tx: number, ty: number): boolean {
    const t = s.tiles[ty * s.w + tx];
    if (!t) return false;
    if (t.prop) {
      const def = content.props[t.prop];
      return !!def && (!!def.hits || !!def.interact);
    }
    return t.g !== "water" || !!content.tiles.grounds["water"]?.interact;
  }

  /* ---- XÂY THEO TUYẾN ---------------------------------------------------
     Chọn ô đầu, chọn ô cuối, cả tuyến dựng một lượt. Trạng thái này CỐ Ý không
     nằm trong `GameState`: nó là ý định nhất thời đang vẽ dở, cùng loại với
     đích của `nav`. Bỏ dở giữa chừng thì không có gì phải dọn trong save. */
  let lineMode = false;
  let lineFrom: { x: number; y: number } | null = null;

  /** Đang cầm công trình gì (id trần), null nếu không cầm công trình nào. */
  function heldBuilding(s: GameState): string | null {
    const held = s.inv[s.sel];
    if (!held?.id.startsWith("build:")) return null;
    const id = held.id.slice(6);
    return content.buildings[id] ? id : null;
  }

  const setLineMode = (on: boolean) => {
    lineMode = on;
    lineFrom = null;
    const b = document.querySelector<HTMLElement>("#linebtn");
    if (b) {
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    }
  };

  function holdingSolidBuilding(s: GameState): boolean {
    const held = s.inv[s.sel];
    if (!held?.id.startsWith("build:")) return false;
    const def = content.buildings[held.id.slice(6)];
    return !!def && def.kind === "object" && def.solid;
  }

  function tryInteract(s: GameState, tx: number, ty: number): boolean {
    const hit = nearbyInteract(s, tx, ty);
    if (!hit) return false;
    buzz("tap");
    switch (hit.kind) {
      case "SHOP":
        menus.openShop();
        return true;
      case "SELL":
        menus.openSell();
        return true;
      case "STORE":
        menus.openStore();
        return true;
      case "CRAFT":
        menus.openCraft();
        return true;
      case "SLEEP":
        store.dispatch({ t: "SLEEP" });
        return true;
      case "REFILL":
        lastUse = { x: hit.x, y: hit.y };
        store.dispatch({ t: "REFILL" });
        renderer.burst("water", hit.x, hit.y);
        return true;
      case "PORTAL":
        store.dispatch({ t: "PORTAL", x: hit.x, y: hit.y });
        return true;
      default:
        return false;
    }
  }

  /** Loại việc của nhát GẦN NHẤT — để giữ nút thì tiếp tục đúng việc đó. */
  let lastKind: UseKind = null;

  /* ---- TỰ ĐỘNG LÀM ----------------------------------------------------
     Cố ý KHÔNG nằm trong `GameState`: đây là ý định nhất thời của người chơi,
     đúng cùng lý do đích của `nav` không được lưu vào save (xem đầu
     core/navigate.ts). Nhờ vậy mốc này không phải tăng SAVE_VERSION.

     Cùng một hàm `continueWork` mà nút DÙNG giữ-để-làm-tiếp đang dùng — và
     cũng chính là hàm mà AI người làm thuê sẽ dùng lại. Viết một lần. */
  let autoWork = false;
  /** Số lần liên tiếp không tìm ra việc. Hai lần thì tự tắt. */
  let autoMiss = 0;
  /** Ô đang đi tới ĐỂ LÀM VIỆC (không phải do người chơi chạm). Tới nơi thì chỉ
   *  dùng công cụ, không mở hộp thoại nào. */
  let workGoal: { x: number; y: number } | null = null;
  /** Bao lâu rồi không có việc nào THÀNH CÔNG, tính bằng giây. */
  let autoIdle = 0;
  let autoMark = "";
  /** Bấy nhiêu giây không nhúc nhích thì tắt. Đủ dài để bao một nhát cuốc
   *  (actionSeconds) cộng quãng đi vài ô, đủ ngắn để không nhả một tràng toast. */
  const AUTO_IDLE_LIMIT = 4;

  /**
   * Vì sao đo bằng "không tiến triển" chứ không bắt từng lý do hỏng:
   * thao tác ở đây có HIỆU LỰC TRỄ — `USE` đặt `busy` ngay rồi mới kiểm năng
   * lượng lúc chạm đất — nên ngay sau khi dispatch thì không có cách nào biết
   * nhát này sẽ ăn hay trượt. Còn đếm bộ đếm thống kê thì đúng với MỌI lý do
   * hỏng cùng một lúc: hết năng lượng, túi đầy, hết hạt, kẹt đường.
   */
  const progressMark = (s: GameState): string =>
    `${s.stats.tilled}|${s.stats.planted}|${s.stats.watered}|${s.stats.harvested}|${s.stats.cured}`;

  const stopAuto = (s: GameState) => {
    setAuto(false);
    toasts.say(
      s.energy < content.balance.energyCost.till
        ? "Hết năng lượng — đã tắt tự động làm."
        : "Quanh đây hết việc — đã tắt tự động làm.",
      "info",
    );
  };
  const setAuto = (on: boolean) => {
    autoWork = on;
    autoMiss = 0;
    // Đặt lại cả đồng hồ "không tiến triển", nếu không thì bật lại ngay sau khi
    // nó vừa tự tắt là tắt lần nữa tức thì (đồng hồ vẫn đang quá ngưỡng).
    autoIdle = 0;
    autoMark = "";
    const b = document.querySelector<HTMLElement>("#abtn .auto");
    if (b) {
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    }
  };

  function tryUse(s: GameState, tx: number, ty: number): boolean {
    if (!inReachOf(s, tx, ty)) return false;
    lastUse = { x: tx, y: ty };
    const kind = canUseAt(s, content, tx, ty);
    if (kind !== null) lastKind = kind;
    store.dispatch({ t: "USE", x: tx, y: ty });
    return true;
  }

  /**
   * Giữ nút DÙNG (hoặc bấm liên tục): xong nhát này thì tự tìm ô KẾ TIẾP trong
   * tầm công cụ và làm tiếp — ưu tiên cùng loại việc, ưu tiên ô thẳng hàng.
   * Không tự đi xa: hết ô quanh chân thì dừng, người chơi chạm chỗ khác.
   * Trả về true nếu đã bắt đầu một nhát mới.
   */
  /** Bán kính tự đi tới việc, tính bằng Ô. Đủ để dọn một luống mà không lang
   *  thang sang tận đầu kia nông trại. */
  const AUTO_RADIUS = 12;

  /**
   * Làm tiếp việc kế tiếp. Ba nấc, ưu tiên từ gần ra xa:
   *   1. ô đang ngắm còn việc → làm ngay (cày xong đổi hạt là gieo ngay)
   *   2. ô trong TẦM VỚI → làm ngay
   *   3. ô ở XA → tự ĐI TỚI rồi làm khi đến nơi
   *
   * Nấc 3 là chỗ mới. Nó đi qua đúng đường ống `nav.goTo(act:true)` →
   * `takeArrival()` → `actOnTile()` vốn đã chạy cho cú chạm kép, nên không sinh
   * thêm máy trạng thái nào.
   */
  function continueWork(s: GameState): boolean {
    if (s.busy > 0) return false;
    if (aimed && inReachOf(s, aimed.x, aimed.y) && canUseAt(s, content, aimed.x, aimed.y) !== null)
      return tryUse(s, aimed.x, aimed.y);

    const near = nearestTarget(s, content, lastKind, null);
    if (near) {
      aimed = { x: near.x, y: near.y };
      return tryUse(s, near.x, near.y);
    }

    const far = nearestTarget(s, content, lastKind, null, {
      radius: AUTO_RADIUS,
      requireReach: false,
    });
    if (!far) return false;
    aimed = { x: far.x, y: far.y };
    // Đánh dấu đây là chuyến đi ĐỂ LÀM VIỆC, không phải cú chạm của người chơi.
    // Tới nơi thì chỉ được DÙNG công cụ, tuyệt đối không `tryInteract` — nếu
    // không, đi cày một ô cạnh quầy thu mua là bật ngay hộp thoại bán hàng giữa
    // lúc đang tự động làm, và thế giới đứng hình cho tới khi người chơi tắt nó.
    workGoal = { x: far.x, y: far.y };
    return nav.goTo(s, content, far.x, far.y, { avoidStandingOn: holdingSolidBuilding(s) });
  }

  /**
   * Con vật ở ô này: tới lứa thì THU, đói thì CHO ĂN.
   *
   * Đứng trước cả `tryInteract` và `tryUse` — người chơi nhìn thấy con bò chứ
   * không nhìn thấy nền đất dưới chân nó, nên cú bấm phải nói về con bò.
   */
  function tryAnimal(s: GameState, tx: number, ty: number): boolean {
    if (!inReachOf(s, tx, ty)) return false;
    const e = animalNear(s, tx, ty);
    if (!e) return false;
    const def = content.animals[e.def];
    if (!def) return false;
    if (readyProduct(e, content) >= 0) {
      store.dispatch({ t: "GATHER", x: tx, y: ty });
      return true;
    }
    if (def.feed && e.animal.fed <= 0) {
      store.dispatch({ t: "FEED", x: tx, y: ty });
      return true;
    }
    return false;
  }

  function actOnTile(s: GameState, tx: number, ty: number): boolean {
    return tryAnimal(s, tx, ty) || tryInteract(s, tx, ty) || tryUse(s, tx, ty);
  }

  const deny = () => {
    play("deny");
    buzz("deny");
  };

  const vpTiles = () => ({
    w: camera.viewport.viewW / TILE,
    h: camera.viewport.viewH / TILE,
  });

  /* ---- 10. vòng lặp ---- */
  let elapsed = 0;
  /** Giữ nút mà quanh chân hết việc thì im cho tới khi nhả nút — không kêu "deny" mỗi khung hình. */
  let holdCooldown = false;
  /** Nút DÙNG đã được giữ bao lâu (giây). */
  let heldFor = 0;
  const loop = createLoop((dt) => {
    elapsed += dt;
    const modal = menus.isOpen() || tutorial.isOpen();

    if (modal) nav.cancel();

    if (!modal) {
      const ax = input.axis();
      if (ax.x !== 0 || ax.y !== 0) {
        // Người chơi tự cầm lái thì nhường ngay — cùng luật với `nav.cancel()`:
        // nhập tay luôn thắng thứ đang chạy tự động.
        if (autoWork) setAuto(false);
        nav.cancel();
        store.dispatch({ t: "MOVE", dx: ax.x, dy: ax.y, dt, run: input.running() });
        aimed = null;
      } else {
        const step = nav.update(store.getState(), content, dt);
        if (step) store.dispatch({ t: "MOVE", dx: step.dx, dy: step.dy, dt, run: step.run });
        else if (store.getState().player.moving)
          store.dispatch({ t: "MOVE", dx: 0, dy: 0, dt });
      }
      store.dispatch({ t: "TICK", dt });

      const arrived = nav.takeArrival();
      if (arrived) {
        aimed = { x: arrived.tx, y: arrived.ty };
        const forWork =
          workGoal !== null && workGoal.x === arrived.tx && workGoal.y === arrived.ty;
        workGoal = null;
        if (arrived.act) {
          const st = store.getState();
          const done = forWork
            ? tryUse(st, arrived.tx, arrived.ty)
            : actOnTile(st, arrived.tx, arrived.ty);
          if (!done) deny();
        }
      }

      // TỰ ĐỘNG LÀM: cùng một hàm với giữ-nút, chỉ khác là không cần giữ. Chờ
      // hết `busy` và hết đường đang đi rồi mới chọn việc mới, nên vẫn TUẦN TỰ
      // từng việc một như Cường muốn.
      if (autoWork) {
        const s = store.getState();
        const mark = progressMark(s);
        if (mark !== autoMark) {
          autoMark = mark;
          autoIdle = 0;
        } else if ((autoIdle += dt) > AUTO_IDLE_LIMIT) {
          stopAuto(s);
        }
        if (autoWork && s.busy <= 0 && !nav.target()) {
          if (!continueWork(s)) autoMiss++;
          else autoMiss = 0;
          if (autoMiss >= 2) stopAuto(store.getState());
        }
      }

      // GIỮ nút DÙNG: hết khoá là tự sang ô kế tiếp trong tầm. Cú bấm ĐẦU do
      // intent "use" xử lý (nó còn lo cả cửa hàng/giường); khối này chỉ tiếp
      // quản sau khi đã giữ quá 0,2s và nhát trước là một việc trên ô — nên bấm
      // MUA cạnh cửa hàng không bao giờ bị hiểu nhầm thành cày. Đang tự đi tới
      // đích (nav) thì tới nơi mới làm.
      if (input.useHeld()) {
        heldFor += dt;
        if (heldFor > 0.2 && lastKind !== null && !nav.target()) {
          const s = store.getState();
          if (s.busy <= 0 && !holdCooldown) {
            if (!continueWork(s)) holdCooldown = true; // hết việc quanh đây: đợi nhả nút
          }
        }
      } else {
        heldFor = 0;
        holdCooldown = false;
      }
    }

    for (const it of input.drain()) {
      const s = store.getState();
      switch (it.t) {
        case "menu":
          if (tutorial.isOpen()) tutorial.close();
          else if (menus.isOpen()) menus.close();
          else menus.openPause();
          break;
        case "shop":
          if (!modal) menus.openShop();
          break;
        case "inventory":
          if (!modal) menus.openBag();
          else if (menus.isOpen()) menus.close();
          break;
        case "map":
          minimap.toggle();
          break;
        case "debug":
          devPanel.toggle();
          break;
        case "auto":
          setAuto(!autoWork);
          toasts.say(autoWork ? "Tự động làm: BẬT" : "Tự động làm: TẮT", "info");
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
          if (modal) break;
          let c = targetTile(s);
          // Nút hành động theo ngữ cảnh: ô đang ngắm ở XA thì đi tới rồi làm,
          // thay vì bấm hụt. Trên điện thoại đây là đường tắt tự nhiên nhất:
          // chạm ô, thấy nút ghi CÀY, bấm CÀY — nhân vật tự đi rồi cày.
          if (c && !inReachOf(s, c.x, c.y) && aimed && settings.contextButton) {
            if (tileActionable(s, c.x, c.y) && nav.goTo(s, content, c.x, c.y, { avoidStandingOn: holdingSolidBuilding(s) })) break;
          }
          if (c && !inReachOf(s, c.x, c.y)) c = targetTile(s, true);
          if (c && inReachOf(s, c.x, c.y)) {
            // Con vật trước tiên — nếu không thì nhãn nút ghi THU mà bấm vào lại
            // đi cày, tức là nút nói một đằng làm một nẻo.
            if (tryAnimal(s, c.x, c.y)) break;
            // Với công trình gần đó (cửa hàng, giường…) nút chính cũng tương tác
            // được — người chơi không phải phân biệt DÙNG với E.
            if (nearbyInteract(s, c.x, c.y)) {
              if (!tryInteract(s, c.x, c.y)) deny();
            } else if (canUseAt(s, content, c.x, c.y) !== null) {
              tryUse(s, c.x, c.y);
            } else if (s.busy <= 0) {
              // Ô đang ngắm hết việc (vừa cày xong…): bấm tiếp là tự sang ô kế
              // tiếp trong tầm công cụ, cùng loại việc.
              if (!continueWork(s)) deny();
            }
          } else deny();
          break;
        }
        case "pointer": {
          if (modal) break;
          const snapped = snapTap(s, it.wx, it.wy);
          const tx = snapped.x;
          const ty = snapped.y;
          aimed = { x: tx, y: ty };
          // Người chơi tự chạm thì đây KHÔNG còn là chuyến đi làm việc nữa —
          // tới nơi được phép mở cửa hàng/giường như bình thường.
          workGoal = null;

          // Chế độ tuyến nuốt cú chạm: chạm đầu đặt mốc, chạm sau thì dựng.
          const lineId = lineMode ? heldBuilding(s) : null;
          if (lineId) {
            if (!lineFrom) lineFrom = { x: tx, y: ty };
            else {
              store.dispatch({
                t: "BUILD_LINE",
                id: lineId,
                x0: lineFrom.x,
                y0: lineFrom.y,
                x1: tx,
                y1: ty,
              });
              lineFrom = null;
            }
            break;
          }

          if (!it.double) {
            // Chạm lại đúng ô ĐANG đi tới thì để yên cho nhân vật đi tiếp.
            // Trước đây mọi cú chạm đều huỷ rồi tìm đường lại, nên người chơi
            // sốt ruột bấm dồn là nhân vật dừng-chạy-dừng-chạy — đúng cảm giác
            // "giật giật". Bấm lại chỗ cũ là XÁC NHẬN, không phải lệnh mới.
            const cur = nav.target();
            if (cur && cur.tx === tx && cur.ty === ty) break;
            nav.cancel();
            if (!inReachOf(s, tx, ty))
              nav.goTo(s, content, tx, ty, {
                act: false,
                avoidStandingOn: holdingSolidBuilding(s),
              });
            break;
          }

          nav.cancel();
          if (tryInteract(s, tx, ty)) break;
          if (alignedTo(s, tx, ty) && tryUse(s, tx, ty)) break;
          if (
            !tileActionable(s, tx, ty) ||
            !nav.goTo(s, content, tx, ty, { avoidStandingOn: holdingSolidBuilding(s) })
          )
            deny();
          break;
        }
        case "interact": {
          if (modal) break;
          const c = targetTile(s, true);
          if (!c) break;
          if (!actOnTile(s, c.x, c.y)) deny();
          break;
        }
      }
    }

    const s = store.getState();
    if (s.log.length) {
      const upTo = toasts.show(s.log);
      if (upTo) store.dispatch({ t: "LOG_SEEN", upTo });
    }

    camera.follow(s.player.x, s.player.y, dt);
    const navT = nav.target();
    const cursor: Cursor | null = modal
      ? null
      : navT
        ? { x: navT.tx, y: navT.ty, ok: true }
        : targetTile(s);

    // Chuyển ngày: giữ đen 0,35s rồi mở sáng trong 0,9s.
    let fade = 0;
    if (dayFadeAt > 0) {
      const t = elapsed - dayFadeAt;
      fade = t < 0.35 ? 1 : Math.max(0, 1 - (t - 0.35) / 0.9);
      if (fade <= 0) dayFadeAt = 0;
    }

    // Nút TUYẾN chỉ hiện khi đang cầm công trình — không cầm gì thì nó vô nghĩa.
    const buildId = heldBuilding(s);
    const lineBtn = document.querySelector<HTMLElement>("#linebtn");
    if (lineBtn) lineBtn.hidden = buildId === null;
    if (!buildId && lineMode) setLineMode(false);

    // Xem trước tuyến: từ mốc đã đặt tới ô đang ngắm.
    let lineCells: { x: number; y: number; ok: boolean }[] | null = null;
    if (lineMode && buildId && lineFrom && cursor) {
      lineCells = linePath(lineFrom.x, lineFrom.y, cursor.x, cursor.y).map((c) => ({
        x: c.x,
        y: c.y,
        ok: canPlaceBuilding(s, content, buildId, c.x, c.y),
      }));
    }

    const wxDef = weatherDef(s, content);
    const fogUntil = wxDef.fogUntil ?? 0;
    renderer.draw(s, content, cursor, elapsed, {
      lineCells,
      navTarget: navT ? { x: navT.tx, y: navT.ty } : null,
      fade,
      reduceMotion: document.body.dataset["motion"] === "reduce",
      weather: {
        wind: wxDef.wind,
        rain: wxDef.wet,
        storm: !!wxDef.storm,
        overcast: !wxDef.wet && wxDef.growMul >= 1 && wxDef.wind >= 0.4 && !wxDef.hot,
        hot: !!wxDef.hot,
        // sương tan dần trong 60 phút cuối trước mốc fogUntil
        fog: fogUntil > 0 && s.minutes < fogUntil ? Math.min(1, (fogUntil - s.minutes) / 60) : 0,
        outdoor: isOutdoor(content, s.mapId),
        seasonTint: currentSeason(s, content)?.tint ?? null,
      },
    });

    const hint: Hint | null = settings.contextButton && cursor && !modal ? hintAt(s, content, cursor.x, cursor.y) : null;
    hud.update(s, content, hint);
    minimap.setView(camera.rx / TILE, camera.ry / TILE, vpTiles().w, vpTiles().h);
    minimap.update(s, content);
    devPanel.update(s, content);
  });

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
        if (dist <= REACH + TILE) return { kind: k, x: x + dx, y: y + dy };
      }
    }
    return null;
  }

  bootEl.classList.add("done");
  window.setTimeout(() => {
    bootEl.style.display = "none";
  }, 420);
  loop.start();

  // Hướng dẫn lần đầu: chỉ khi chưa xem và đang là ván mới (save cũ = đã biết chơi).
  if (!settings.tutorialSeen && !migrated) {
    window.setTimeout(() => tutorial.start(isTouch ? TOUCH_STEPS : DESKTOP_STEPS), 500);
  } else if (!settings.tutorialSeen) setSetting("tutorialSeen", true);

  if (import.meta.env.DEV) {
    (window as unknown as Record<string, unknown>)["__PF"] = {
      store,
      content,
      atlas,
      menus,
      renderer,
      camera,
      settings: () => settings,
      setSetting,
      tutorial,
      step: (dt = 1 / 60, times = 1) => {
        for (let i = 0; i < times; i++) loop.step(dt);
      },
    };
  }

  for (const w of contentWarnings) toasts.say(w, "bad");

  /* ---- 11. OTA: hỏi thăm bản mới, chạy NGẦM, không chặn gì ---- */
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
    el.innerHTML = `<div class="inner"><div class="logo">ONI<span>FARM</span></div><p>Lỗi khởi động:</p>
      <div class="err">${String(e instanceof Error ? e.stack ?? e.message : e)}</div></div>`;
  }
});
