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
import { padButtonName } from "./core/gamepad.ts";
import { createBuildMode } from "./ui/buildmode.ts";
import { createTutorial, DESKTOP_STEPS, TOUCH_STEPS } from "./ui/tutorial.ts";
import type { Content, GameState, Stats } from "./game/types.ts";
import { createNewGame, migrateForContent } from "./game/state.ts";
import { canCraft, canUseAt, interactAt, linePath, missingFor } from "./game/actions.ts";
import { autoJob, facingTile, hintAt, nearestTarget, type Hint } from "./game/hint.ts";
import { forecastDef, weatherDef, isOutdoor } from "./game/weather.ts";
import { currentSeason } from "./game/season.ts";
import { animalNear, animalStats, readyProduct } from "./game/animals.ts";
import { workerCard, workerNear } from "./game/workers.ts";
import { canPlaceBuilding, inReach } from "./game/world.ts";
import type { UseKind } from "./game/actions.ts";

/** Gốc URL phục vụ content OTA. Để trống ("") = tắt hẳn, game chạy thuần offline. */
const CONTENT_URL = "https://oni-farm.pages.dev";

/**
 * Tầm với dùng cho việc NGẮM và cho lối vào cửa hàng/quầy — rộng hơn tầm THAO
 * TÁC một chút, để con trỏ bắt được ô mà ngón tay chỉ vào hụt vài pixel.
 *
 * ⚠️ TUYỆT ĐỐI không dùng con số này để hỏi "làm được chưa": luật thật là
 * `inReach()` trong game/world.ts (1,6 ô). Trước đây chỗ này hỏi bằng 1,8 ô, và
 * hai con số lệch nhau đúng 0,2 ô đã đẻ ra một lỗi rất khó thấy: ô nằm trong
 * khoảng đó được nút báo "làm được", nhưng reducer từ chối trong im lặng —
 * không toast, không khoá `busy`, không có gì. Bấm tay thì tưởng máy đơ; bật
 * "tự động làm" thì nó dispatch USE mỗi khung hình vào đúng ô đó cho tới khi
 * đồng hồ "không tiến triển" tự tắt chế độ.
 */
const AIM_REACH = TILE * 1.8;

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
  /** Đã nhận tay cầm ở khung trước chưa — để chỉ báo MỘT lần lúc vừa cắm. */
  let padOn = false;
  /** Tấm sheet đang giữ tiêu điểm. So bằng THAM CHIẾU phần tử, không bằng cờ
   *  đóng/mở: mỗi màn con (Cài đặt, Kho, Cập nhật…) dựng một `.modal` MỚI mà
   *  `menus.isOpen()` vẫn true suốt, nên một cái cờ sẽ chỉ đặt tiêu điểm cho
   *  màn đầu tiên rồi thôi — và mọi màn con đều mở ra với tiêu điểm nằm trên
   *  `<body>`, tức là D-pad phải bấm một cái vô ích mới bắt đầu chạy. */
  let focusedRootEl: HTMLElement | null = null;
  /** Đã xem sơ đồ nút tay cầm trên máy này chưa. */
  const PAD_SEEN = "oni-farm:pad-help-seen";

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
  hud.onAnimalClose(() => {
    cardAnimal = null;
  });
  hud.onAnimalCycle((d) => cycleAnimal(store.getState(), d));
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
    drop: (slot) => store.dispatch({ t: "DROP", slot }),
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
    padInfo: () => input.padInfo(),
    buildMode: () => buildUI.open(),

    /* Hỏi HAI thứ trong một lần bấm, vì người chơi chỉ biết một khái niệm
       "bản mới": nội dung OTA (giá, cây, mùa) và mã game (service worker).
       Trả về đúng một câu để hiện thẳng dưới nút. */
    async checkUpdate() {
      let cauNoiDung = "Nội dung đã là bản mới nhất.";
      if (CONTENT_URL) {
        const r = await checkForUpdate(content.contentVersion, { contentUrl: CONTENT_URL });
        if (r.status === "ready") {
          pendingVersion = r.contentVersion;
          cauNoiDung = `Có nội dung ${r.contentVersion} — bấm "Cập nhật ngay".`;
        } else if (r.status === "incompatible")
          cauNoiDung = `Bản nội dung mới cần core ${r.requiresCore}, máy đang chạy ${CORE_VERSION}.`;
        else if (r.status === "invalid") cauNoiDung = "Bản nội dung trên máy chủ bị lỗi — bỏ qua.";
        else if (r.status === "error") cauNoiDung = "Không hỏi được máy chủ (mất mạng?).";
      }
      // Giục service worker đi hỏi ngay thay vì chờ nhịp kiểm tra của trình duyệt.
      try {
        const reg = await navigator.serviceWorker?.getRegistration();
        if (reg) await reg.update();
      } catch {
        /* không có service worker (bản dev, hoặc trình duyệt chặn) — bỏ qua */
      }
      return cauNoiDung;
    },

    /**
     * BUỘC cập nhật.
     *
     * Cố ý mạnh tay: gỡ hẳn service worker và xoá SẠCH mọi cache rồi tải lại.
     * Đường "lịch sự" (`update(true)` của thanh báo) chỉ chạy khi Workbox đã
     * thấy một bản mới đang chờ — mà đúng cái kẹt cần thoát ra là lúc nó KHÔNG
     * thấy: người chơi mở PWA suốt, service worker cũ phục vụ mãi một bản cũ,
     * và không có nút nào thoát ra được.
     *
     * Save nằm ở IndexedDB nên không đụng tới — chỉ cache bị xoá.
     */
    async forceUpdate() {
      try {
        const regs = (await navigator.serviceWorker?.getRegistrations()) ?? [];
        await Promise.all(regs.map((r) => r.unregister()));
      } catch {
        /* bỏ qua */
      }
      try {
        const ks = await caches.keys();
        await Promise.all(ks.map((k) => caches.delete(k)));
      } catch {
        /* bỏ qua */
      }
      // `?v=` để chắc chắn không ăn lại bản trong bộ nhớ đệm của chính trình duyệt.
      location.replace(`${location.pathname}?v=${Date.now()}`);
    },
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
  const buildUI = createBuildMode($("#buildmode"), atlas, {
    // Chọn công trình sống trong chính bảng đó, không đụng tới hotbar: từ khi
    // tiền trả theo số ô vẽ thì không phải "cầm" nó lên nữa.
    select: () => {},
  });

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
    /* Bảng gỡ lỗi tính là "đang mở giao diện" ĐỐI VỚI TAY CẦM: nav đi vào đó
       thay vì đi vào thế giới. Nhưng nó KHÔNG chặn thời gian — main.ts tính
       `modal` riêng, và bảng gỡ lỗi cố ý không nằm trong đó (xem devpanel.ts).
       Không có dòng này thì bảng gỡ lỗi là thứ duy nhất trong game không bấm
       được bằng tay cầm. */
    isModalOpen: () => menus.isOpen() || tutorial.isOpen() || devPanel.isOpen(),
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
    // Lối vào CHẾ ĐỘ XÂY DỰNG ngay cạnh nút hành động. Chôn nó trong menu Tạm
    // dừng thì phần lớn người chơi sẽ không bao giờ tìm ra, mà từ giờ đó là
    // cách DUY NHẤT để xây.
    const lb = document.querySelector<HTMLElement>("#linebtn");
    lb?.addEventListener("click", () => buildUI.toggle());
  }

  for (const [sel, code] of [
    ["#abtn .a", "Space"],
    ["#abtn .b", "KeyE"],
    ["#abtn .auto", "KeyF"],
    ["#abtn .y", "KeyI"],
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

  /** MỘT nguồn sự thật: hỏi thẳng luật của game, không tự tính lại. */
  function inReachOf(s: GameState, tx: number, ty: number): boolean {
    return inReach(s, tx, ty);
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

  /**
   * Con vật đang MỞ bảng thống kê, theo id. `null` = không mở bảng nào.
   *
   * Cố ý theo Ý ĐỊNH của người chơi chứ không theo khoảng cách. Bản đầu tự hiện
   * bảng cho con vật gần nhất, và trên điện thoại nó bật lên mỗi lần đi ngang
   * qua chuồng, che một phần tư màn hình đúng lúc đang cần nhìn ruộng. Giờ:
   * chạm vào con vật thì mở, bấm × hoặc chạm chỗ khác thì đóng.
   */
  let cardAnimal: number | null = null;

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

  /* ---- XÂY THEO TUYẾN: KÉO --------------------------------------------
     Hàng rào và đường nhựa là thứ dựng thành ĐOẠN, không phải đặt từng ô: mười
     ô rào là mười cú bấm, lệch một ô là phải đập đi làm lại. Nên chúng không
     dùng đường "chọn rồi ĐẶT" như vòi tưới hay pin mặt trời — cầm chúng lên là
     vào ngay chế độ kéo: ấn ở đầu đoạn, rê tới cuối, nhả tay.

     Loại nào kéo được là do CONTENT nói (`BuildingDef.drag`), không phải
     `switch (id)` trong này — thêm "mương nước" sau chỉ là thêm một dòng JSON.

     Trạng thái CỐ Ý không nằm trong `GameState`: nó là ý định đang vẽ dở, cùng
     loại với đích của `nav`. Bỏ dở giữa chừng thì không có gì phải dọn trong
     save. */
  let lineFrom: { x: number; y: number } | null = null;
  /** Ô cuối đang rê tới — trên điện thoại con trỏ chuột không tồn tại, nên
   *  đường xem trước phải bám vào ĐÂY chứ không bám `cursor`. */
  let lineTo: { x: number; y: number } | null = null;
  /**
   * Con trỏ Ô của TAY CẦM trong chế độ xây dựng.
   *
   * Tay cầm không có chuột, mà cả chế độ xây dựng dựng trên việc "trỏ vào ô rồi
   * rê". Nên phải có một con trỏ ảo: cần gạt rê nó đi, A đặt đầu đoạn, A lần
   * nữa là xây, B thoát. Không có nó thì chế độ xây dựng — thứ DUY NHẤT đặt
   * được công trình — hoàn toàn không với tới được bằng tay cầm.
   */
  let padCursor: { x: number; y: number } | null = null;



  /** Đang cầm công trình gì (id trần), null nếu không cầm công trình nào. */
  function heldBuilding(s: GameState): string | null {
    const held = s.inv[s.sel];
    if (!held?.id.startsWith("build:")) return null;
    const id = held.id.slice(6);
    return content.buildings[id] ? id : null;
  }

  /** Bật/tắt luồng ý định KÉO. Gọi mỗi khung hình — rẻ, và không phải nhớ tắt
   *  ở mười chỗ khác nhau. */
  const setLineMode = (on: boolean) => {
    input.setDrag(on);
    if (!on) {
      lineFrom = null;
      lineTo = null;
    }
    const b = document.querySelector<HTMLElement>("#linebtn");
    if (b) b.classList.toggle("on", on);
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
  let workGoal: { x: number; y: number; refill?: boolean } | null = null;
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
    // `water` nằm trong dấu vân tay vì MÚC NƯỚC cũng là tiến triển: không có nó
    // thì một chuyến đi múc dài là bốn giây "không tiến triển" và tự tắt.
    `${s.stats.tilled}|${s.stats.planted}|${s.stats.watered}|${s.stats.harvested}|${s.stats.cured}|${s.water}`;

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
  /** Bán kính "giữ nút DÙNG thì làm tiếp ô kế bên" — cố ý HẸP: giữ nút là ý
   *  định làm nốt chỗ đang đứng, không phải lệnh đi khắp nông trại. */
  const AUTO_RADIUS = 12;

  /**
   * Bán kính của chế độ TỰ ĐỘNG: cả bản đồ.
   *
   * Từng để 12 ô, và đo được đúng cái hỏng: dọn sạch khu quanh chân xong là nó
   * tự tắt trong khi 14 cây chín còn đứng ở đầu kia ruộng. "Tự động làm" mà bỏ
   * lại việc thì người chơi vẫn phải đi kiểm tra — tức là không tự động.
   *
   * Quét cả lưới đắt hơn, nhưng chỉ chạy lúc vừa xong một việc và đang rảnh, và
   * thứ tự ưu tiên vẫn chọn ô GẦN NHẤT trong mỗi bậc — nên nó vẫn dọn quanh
   * chân trước, chỉ là hết việc gần thì đi tiếp thay vì bỏ cuộc.
   */
  const autoRadius = (s: GameState) => Math.max(s.w, s.h);

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
   * Ô MÚC NƯỚC gần nhất (ao, giếng) trên CẢ bản đồ.
   *
   * Cố ý không giới hạn trong `AUTO_RADIUS` như các việc khác. Việc trên ruộng
   * thì có ở khắp nơi nên bán kính 12 ô là đúng — đi xa hơn chỉ là lang thang.
   * Nhưng nguồn nước thì CÓ MỘT CHỖ: đo được lúc thử, người chơi đứng ở (33,25)
   * còn cái ao ở góc (5,4), tức 28 ô — ngoài bán kính, nên nó không đi múc và
   * cày tiếp cho tới lúc kiệt sức trong khi 83 ô đang khô.
   *
   * Quét cả lưới 40×30 chỉ tốn 1200 phép so, và chỉ chạy đúng lúc bình cạn.
   */
  function nearestRefill(s: GameState): { x: number; y: number } | null {
    let best: { x: number; y: number } | null = null;
    let bestD = Infinity;
    for (let y = 0; y < s.h; y++)
      for (let x = 0; x < s.w; x++) {
        if (interactAt(s, content, x, y) !== "REFILL") continue;
        const d = Math.hypot(x * TILE + TILE / 2 - s.player.x, y * TILE + TILE / 2 - s.player.y);
        if (d < bestD) {
          bestD = d;
          best = { x, y };
        }
      }
    return best;
  }

  /**
   * MỘT bước của chế độ tự động.
   *
   * Khác `continueWork` ở đúng một điểm, nhưng là điểm quyết định: nó tự ĐỔI
   * TAY. `continueWork` chỉ biết thứ đang cầm, nên bật tự động lúc đang cầm
   * cuốc là cày cả nông trại rồi dừng — không gieo, không tưới, không thu.
   * Ở đây `autoJob` chọn việc trước rồi mới nói phải cầm ô hotbar nào.
   *
   * Đổi tay tốn đúng một khung hình (dispatch SELECT rồi trả về true): khung
   * sau `s.busy` vẫn bằng 0 nên nó vào lại đây và ra tay ngay. Cố ý không gộp
   * hai việc vào một khung — hotbar phải kịp vẽ lại, nếu không người chơi thấy
   * nhân vật cày bằng cái bình tưới.
   */
  function autoStep(s: GameState): boolean {
    const job = autoJob(s, content, autoRadius(s));

    /* MÚC NƯỚC nằm giữa TƯỚI và CÀY trong thứ tự ưu tiên, không phải ở cuối.
       Bình cạn thì `canUseAt` bảo không tưới được, nên `autoJob` tụt xuống bậc
       CÀY và cày mãi cho tới hết sức — đúng thứ đã đo được: 51 ô cày thêm,
       0 ô tưới, ruộng vẫn khô. Đi múc mới là việc đáng làm lúc đó. */
    if (
      (!job || job.kind === "till") &&
      s.water <= 0 &&
      needsWater(s)
    ) {
      const w = nearestRefill(s);
      if (w) {
        workGoal = { x: w.x, y: w.y, refill: true };
        aimed = { x: w.x, y: w.y };
        return nav.goTo(s, content, w.x, w.y, {});
      }
    }
    if (!job) return false;

    if (job.slot !== s.sel) {
      store.dispatch({ t: "SELECT", slot: job.slot });
      return true;
    }
    aimed = { x: job.x, y: job.y };
    lastKind = job.kind;
    if (inReachOf(s, job.x, job.y)) return tryUse(s, job.x, job.y);
    workGoal = { x: job.x, y: job.y };
    return nav.goTo(s, content, job.x, job.y, { avoidStandingOn: holdingSolidBuilding(s) });
  }

  /** Còn ô đã cày mà khô không? Nếu không thì đừng bắt nhân vật lội bộ đi múc. */
  function needsWater(s: GameState): boolean {
    for (const t of s.tiles) if (t?.tilled && !t.wet) return true;
    return false;
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

  /* Vòng tiêu điểm vàng chỉ có nghĩa khi tiêu điểm do BÀN PHÍM hoặc TAY CẦM
     đặt. Bấm chuột xong mà nút vẫn đeo vòng vàng thì trông như bị kẹt. */
  document.addEventListener("pointerdown", () => document.body.classList.add("pointer-focus"), true);
  document.addEventListener("keydown", () => document.body.classList.remove("pointer-focus"), true);

  /* ---- THANH CHỈ DẪN NÚT ------------------------------------------------
     Overlay nhỏ nói ĐÚNG những nút dùng được NGAY LÚC NÀY.

     Vì sao không chỉ có sơ đồ nút một lần lúc cắm: người chơi đọc bảng đó xong
     là quên, và nó cũng không nói được điều quan trọng nhất — cùng một nút vai
     đổi ô hotbar ngoài ruộng nhưng đổi TAB khi đang mở cửa hàng, cùng một nút
     mặt dưới là "cày" ngoài ruộng nhưng là "chọn" trong menu. Thanh này đổi
     theo ngữ cảnh nên nó luôn đúng, và người chơi không phải nhớ gì cả. */
  const padBar = $("#padbar");
  /** Dấu vân tay lần vẽ trước — thanh này được hỏi mỗi khung hình. */
  let padBarKey = "";

  function drawPadBar(inMenu: boolean, inBuild: boolean, inTut: boolean): void {
    if (!padOn) {
      if (padBarKey !== "") {
        padBarKey = "";
        padBar.hidden = true;
        padBar.innerHTML = "";
      }
      return;
    }
    const pi = input.padInfo();
    const b = (i: number) => padButtonName(pi, i);
    const std = pi.standard;

    const hints: [string, string][] = [];
    if (inTut) {
      hints.push([b(0), "Tiếp"], [b(1), "Bỏ qua"]);
    } else if (inMenu) {
      hints.push(["✛", "Chuyển"], [b(0), "Chọn"], [b(1), "Đóng"]);
      if (std && document.querySelector(".modal .tabs button")) hints.push([`${b(4)}/${b(5)}`, "Đổi tab"]);
    } else if (inBuild) {
      hints.push(["✛", "Rê ô"], [b(0), lineFrom ? "Xây" : "Đặt mốc"], [b(1), lineFrom ? "Huỷ" : "Thoát"]);
      if (std) hints.push([`${b(4)}/${b(5)}`, "Đổi công trình"]);
    } else if (cardAnimal !== null) {
      hints.push([b(1), "Đóng bảng"], [b(0), "Thu / cho ăn"]);
      if (std) hints.push([`${b(4)}/${b(5)}`, "Đổi con"]);
    } else {
      /* Ngoài ruộng thì CỤM NÚT HÌNH THOI đã nói hết bốn nút mặt rồi — nhắc
         lại ở đây là chiếm chỗ để nói một thứ đang hiện ngay trên màn hình.
         Thanh này chỉ còn giữ những nút KHÔNG có mặt trong cụm. */
      if (std) hints.push(["Cần phải", "Hotbar"], [b(10), "Xây dựng"], [b(9), "Tạm dừng"]);
      else hints.push([b(0), "Dùng"], [b(1), "Tương tác"]);
    }

    const key = hints.map(([k, v]) => k + v).join("|");
    if (key === padBarKey) return;
    padBarKey = key;
    padBar.innerHTML = "";
    for (const [k, v] of hints) {
      const wrap = document.createElement("span");
      const kb = document.createElement("b");
      kb.textContent = k;
      const t = document.createElement("i");
      t.textContent = v;
      wrap.append(kb, t);
      padBar.appendChild(wrap);
    }
    padBar.hidden = false;
  }

  const deny = () => {
    play("deny");
    buzz("deny");
  };

  /**
   * Chuyển tiêu điểm sang phần tử bấm được GẦN NHẤT theo hướng (dx,dy).
   *
   * Chọn theo hình học thay vì theo thứ tự DOM vì menu xếp LƯỚI: đi theo thứ
   * tự DOM thì gạt sang phải ở nút cuối hàng lại nhảy xuống đầu hàng dưới —
   * đúng nhưng không phải thứ mắt đang nhìn thấy.
   *
   * Chấm điểm = khoảng cách dọc theo hướng + phần lệch NGANG nhân bốn. Nhân
   * bốn để một nút thẳng hàng ở xa vẫn thắng một nút lệch hàng ở gần; không có
   * hệ số đó thì gạt xuống trong lưới hai cột hay nhảy chéo sang cột kia.
   */
  /** Khung đang nhận tiêu điểm: tấm sheet của menu, hoặc thẻ hướng dẫn. */
  function focusRoot(): HTMLElement | null {
    return document.querySelector<HTMLElement>(".modal, .tut-card, #devpanel:not([hidden])");
  }

  function moveFocus(dx: number, dy: number): void {
    const root = focusRoot();
    if (!root) return;
    /* KHÔNG chỉ `<button>`. Ô balo, ô kho, dòng quầy thu mua đều là
       `<div role="button">` — trình duyệt không cho chúng nhận tiêu điểm, nên
       D-pad đi qua chúng như thể chúng không tồn tại. Đó là lý do balo, cửa
       hàng, kho và cài đặt "không bấm được bằng tay cầm" dù menu tạm dừng thì
       được: menu tạm dừng toàn nút thật.

       Sửa ở ĐÂY chứ không sửa từng màn hình: mỗi màn mới viết sau này sẽ tự
       chạy được, không phải nhớ thêm một luật. */
    const all = [
      ...root.querySelectorAll<HTMLElement>(
        "button:not([disabled]), [role='button'], [role='option'], input:not([disabled]), select:not([disabled]), [tabindex]",
      ),
    ].filter((el) => el.offsetParent !== null && !el.hasAttribute("disabled"));
    if (!all.length) return;

    const cur = document.activeElement as HTMLElement | null;
    if (!cur || !root.contains(cur)) {
      focusIn(all[0]!);
      return;
    }
    const a = cur.getBoundingClientRect();
    const ax = a.left + a.width / 2;
    const ay = a.top + a.height / 2;

    let best: HTMLElement | null = null;
    let bestScore = Infinity;
    for (const el of all) {
      if (el === cur) continue;
      const b = el.getBoundingClientRect();
      const bx = b.left + b.width / 2;
      const by = b.top + b.height / 2;
      const doc = (bx - ax) * dx + (by - ay) * dy; // đi tới bao xa theo hướng
      if (doc <= 2) continue; // ở phía sau hoặc ngang hàng: bỏ qua
      const lech = Math.abs((bx - ax) * dy) + Math.abs((by - ay) * dx);
      const score = doc + lech * 4;
      if (score < bestScore) {
        bestScore = score;
        best = el;
      }
    }
    focusIn(best ?? all[0]!);
  }

  /**
   * Chuyển bảng sang con vật KẾ TIẾP trên bản đồ, theo thứ tự khoảng cách tới
   * nhân vật. Trả false nếu không có con nào.
   *
   * Xếp theo khoảng cách chứ không theo id: id là thứ tự MUA, mà người chơi
   * nghĩ theo "con bên cạnh", không nghĩ theo "con tôi mua thứ ba".
   */
  function cycleAnimal(s: GameState, d: number): boolean {
    const list = s.entities
      .filter((e) => (e.kind === "animal" || e.kind === "worker") && e.map === s.mapId)
      .sort(
        (a, b) =>
          Math.hypot(a.x - s.player.x, a.y - s.player.y) -
          Math.hypot(b.x - s.player.x, b.y - s.player.y),
      );
    if (!list.length) return false;
    const i = list.findIndex((e) => e.id === cardAnimal);
    const n = list.length;
    cardAnimal = list[((((i < 0 ? 0 : i) + d) % n) + n) % n]!.id;
    buzz("tap");
    return true;
  }

  /** Đặt tiêu điểm VÀ kéo nó vào tầm nhìn. Cửa hàng có bốn mươi thẻ hạt cuộn
   *  dọc; chuyển tiêu điểm xuống thẻ thứ ba mươi mà không cuộn theo thì màn
   *  hình đứng yên và người chơi tưởng cần gạt hỏng. */
  function focusIn(el: HTMLElement): void {
    /* `tabIndex = -1` cho phép GỌI `.focus()` mà không nhét phần tử vào thứ tự
       phím Tab — đúng thứ cần cho `div role="button"`: tay cầm tới được, còn
       người dùng bàn phím vẫn Tab qua đúng các nút thật. */
    if (!el.hasAttribute("tabindex") && el.tagName !== "BUTTON" && el.tagName !== "INPUT")
      el.tabIndex = -1;
    el.focus();
    el.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  /**
   * Đổi TAB trong menu bằng LB/RB.
   *
   * Cửa hàng chia bốn tab, mà tab là những nút nằm trên cùng — với tay cầm thì
   * phải gạt lên mấy lần mới tới, rồi lại gạt xuống mấy lần để về chỗ cũ. Vai
   * là chỗ đúng cho việc đó, y như mọi game có tab.
   */
  function cycleTab(d: number): boolean {
    const root = focusRoot();
    const tabs = root ? [...root.querySelectorAll<HTMLButtonElement>(".tabs button")] : [];
    if (tabs.length < 2) return false;
    const i = tabs.findIndex((b) => b.classList.contains("on"));
    const n = tabs.length;
    tabs[(((i < 0 ? 0 : i) + d) % n + n) % n]!.click();
    return true;
  }

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
    // Tay cầm là hệ HỎI VÒNG, không phát sự kiện — phải đọc đúng một lần mỗi
    // khung hình, TRƯỚC khi ai đó hỏi `axis()` hay `drain()`.
    input.poll(performance.now());

    /* ---- TỰ NHẬN TAY CẦM -------------------------------------------------
       `body[data-input="pad"]` để CSS giấu joystick ảo và các nút chạm: cầm tay
       cầm rồi thì mấy thứ đó chỉ che mất nông trại.

       Vì sao phải POLL chứ không chỉ nghe sự kiện `gamepadconnected`: vì lý do
       chống nhận diện, Chrome và Safari chỉ báo sự kiện đó SAU khi người chơi
       bấm một nút. Cắm tay cầm rồi ngồi im thì không có sự kiện nào cả — nhưng
       `poll()` mỗi khung hình thì thấy ngay lúc nút đầu tiên được bấm. */
    const coPad = input.padConnected();
    if (coPad !== padOn) {
      padOn = coPad;
      document.body.dataset["input"] = coPad ? "pad" : "";
      if (coPad) {
        const pi = input.padInfo();
        hud.setPadKey(padButtonName(pi, 0));
        /* Dán TÊN NÚT THẬT lên từng nút tròn. Cụm hình thoi trên màn hình xếp
           đúng như mặt tay cầm, nên gắn tên vào là nó thành bản đồ nút: nhìn
           một cái là biết ngón cái phải bấm chỗ nào, khỏi phải nhớ. */
        for (const [sel, i] of [
          ["#abtn .a", 0],
          ["#abtn .b", 1],
          ["#abtn .auto", 2],
          ["#abtn .y", 3],
        ] as [string, number][]) {
          const el = document.querySelector<HTMLElement>(sel);
          // Chỉ dán khi tay cầm có nút đó VÀ trình duyệt nhận ra sơ đồ chuẩn:
          // dán "X" lên một nút mà bấm X không ra gì là chỉ dẫn sai.
          if (el) {
            if (pi.standard && i < pi.buttons) el.dataset["pad"] = padButtonName(pi, i);
            else delete el.dataset["pad"];
          }
        }
        const mo = pi.standard ? padButtonName(pi, 11) : padButtonName(pi, 0);
        toasts.say(`Đã nhận tay cầm — bấm ${mo} để xem sơ đồ nút.`, "good");
        buzz("success");
        input.rumble(180);
        // Bảng nút chỉ tự mở LẦN ĐẦU trên máy này. Mở lại mỗi lần cắm là phiền,
        // mà không mở lần nào thì người chơi không bao giờ biết Y mở cửa hàng.
        try {
          if (!localStorage.getItem(PAD_SEEN)) {
            localStorage.setItem(PAD_SEEN, "1");
            if (!menus.isOpen() && !tutorial.isOpen()) menus.openPadHelp();
          }
        } catch {
          /* localStorage bị chặn — thôi không mở tự động, không phải lỗi */
        }
      }
    }

    const modal = menus.isOpen() || tutorial.isOpen();
    /* Chế độ xây dựng KHÔNG phải modal: người chơi vẫn đi lại được để ngắm chỗ
       xây, chỉ có ĐỒNG HỒ là đứng. Gộp nó vào `modal` thì nhân vật cứng đơ và
       không xem được góc bên kia nông trại. */
    const building = buildUI.isOpen();

    if (modal) nav.cancel();
    if (building) {
      nav.cancel();
      if (autoWork) setAuto(false);
    }

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
      /* Đây là chỗ THỜI GIAN TRÔI. Không dispatch TICK nghĩa là: cây không lớn,
         con vật không đói, xe không chạy, đồng hồ đứng. Đúng ý của chế độ xây
         dựng — quy hoạch là lúc ngồi nhìn và nghĩ, mà đồng hồ chạy trong lúc
         nghĩ thì biến việc nghĩ thành việc mất mát. */
      if (!building) store.dispatch({ t: "TICK", dt });

      const arrived = nav.takeArrival();
      if (arrived) {
        aimed = { x: arrived.tx, y: arrived.ty };
        const goal =
          workGoal !== null && workGoal.x === arrived.tx && workGoal.y === arrived.ty
            ? workGoal
            : null;
        workGoal = null;
        if (arrived.act) {
          const st = store.getState();
          /* Chuyến đi MÚC NƯỚC là ngoại lệ duy nhất được phép tương tác: nó
             phải mở được cái giếng. Mọi chuyến đi làm việc khác vẫn chỉ được
             `tryUse` — đi cày một ô cạnh quầy thu mua mà bật hộp thoại bán hàng
             giữa lúc tự động làm là thế giới đứng hình cho tới khi tắt nó đi. */
          const done = goal?.refill
            ? tryInteract(st, arrived.tx, arrived.ty)
            : goal
              ? tryUse(st, arrived.tx, arrived.ty)
              : actOnTile(st, arrived.tx, arrived.ty);
          if (!done) deny();
        }
      }

      // TỰ ĐỘNG LÀM: cùng một hàm với giữ-nút, chỉ khác là không cần giữ. Chờ
      // hết `busy` và hết đường đang đi rồi mới chọn việc mới, nên vẫn TUẦN TỰ
      // từng việc một như Cường muốn.
      if (autoWork && !building) {
        const s = store.getState();
        const mark = progressMark(s);
        if (mark !== autoMark) {
          autoMark = mark;
          autoIdle = 0;
        } else if (nav.target()) {
          /* Đang ĐI TỚI chỗ làm thì không tính là đứng không. Bán kính tự động
             là 12 ô, mà đi hết 12 ô còn lâu hơn ngưỡng bốn giây — không loại
             trừ thì cứ mỗi lần việc ở xa là tự tắt giữa đường. */
          autoIdle = 0;
        } else if ((autoIdle += dt) > AUTO_IDLE_LIMIT) {
          stopAuto(s);
        }
        if (autoWork && s.busy <= 0 && !nav.target()) {
          if (!autoStep(s)) autoMiss++;
          else autoMiss = 0;
          if (autoMiss >= 2) stopAuto(store.getState());
        }
      }

      // GIỮ nút DÙNG: hết khoá là tự sang ô kế tiếp trong tầm. Cú bấm ĐẦU do
      // intent "use" xử lý (nó còn lo cả cửa hàng/giường); khối này chỉ tiếp
      // quản sau khi đã giữ quá 0,2s và nhát trước là một việc trên ô — nên bấm
      // MUA cạnh cửa hàng không bao giờ bị hiểu nhầm thành cày. Đang tự đi tới
      // đích (nav) thì tới nơi mới làm.
      if (input.useHeld() && !building) {
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
          /* Đang mở BẢNG VẬT NUÔI thì vai là nút ĐỔI CON, không phải đổi ô
             hotbar. Xem một con rồi muốn xem con kế bên là việc làm liên tục —
             bắt đi tới tận nơi rồi bấm lại từng con là việc của người, không
             phải của một cái bảng tra cứu. */
          if (!modal && cardAnimal !== null && cycleAnimal(s, it.d)) break;
          // Đang mở menu thì vai là nút ĐỔI TAB, không phải đổi ô hotbar.
          if (modal) {
            if (!cycleTab(it.d)) focusRoot()?.querySelector(".body")?.scrollBy({ top: it.d * 120 });
            break;
          }
          const n = content.balance.hotbarSlots;
          store.dispatch({ t: "SELECT", slot: (s.sel + it.d + n) % n });
          break;
        }
        case "use": {
          /* Trong CHẾ ĐỘ XÂY DỰNG bằng tay cầm, A là "đặt mốc / chốt đoạn" —
             hai lần bấm thay cho một cú ấn-rê-nhả của ngón tay. */
          if (building && input.padConnected()) {
            const cur = padCursor ?? {
              x: Math.floor(s.player.x / TILE),
              y: Math.floor(s.player.y / TILE),
            };
            padCursor = cur;
            if (!lineFrom) {
              lineFrom = { ...cur };
              lineTo = { ...cur };
            } else {
              const bid = buildUI.picked();
              if (bid)
                store.dispatch({
                  t: "BUILD_LINE",
                  id: bid,
                  x0: lineFrom.x,
                  y0: lineFrom.y,
                  x1: cur.x,
                  y1: cur.y,
                  far: true,
                });
              lineFrom = null;
              lineTo = null;
            }
            break;
          }
          if (modal) break;
          /* Cầm công trình mà bấm DÙNG thì MỞ CHẾ ĐỘ XÂY DỰNG, không đặt xuống
             ô đang ngắm. Một cú bấm, và người chơi rơi vào đúng chỗ để quy
             hoạch — thay vì rắc từng ô rồi tự hỏi vì sao địa hình lởm chởm. */
          if (!building && heldBuilding(s)) {
            buildUI.open();
            break;
          }
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
          if (building) {
            const q = snapTap(s, it.wx, it.wy);
            lineFrom = { x: q.x, y: q.y };
            lineTo = { x: q.x, y: q.y };
            aimed = { x: q.x, y: q.y };
            break;
          }
          if (modal) break;
          const snapped = snapTap(s, it.wx, it.wy);
          const tx = snapped.x;
          const ty = snapped.y;
          aimed = { x: tx, y: ty };
          // Người chơi tự chạm thì đây KHÔNG còn là chuyến đi làm việc nữa —
          // tới nơi được phép mở cửa hàng/giường như bình thường.
          workGoal = null;
          // Chạm trúng con vật thì mở bảng của NÓ; chạm ra chỗ khác thì đóng.
          const chuot = animalNear(s, tx, ty);
          cardAnimal = chuot ? chuot.id : null;


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
        /* Rê ngón/chuột khi đang vẽ tuyến: chỉ cập nhật ô CUỐI. Không dispatch
           gì cả — dựng dở từng ô theo đường rê thì rê lệch một cái là mất vật
           liệu, mà không có cách nào lấy lại. */
        case "drag": {
          if ((modal && !building) || !lineFrom) break;
          const q = snapTap(s, it.wx, it.wy);
          lineTo = { x: q.x, y: q.y };
          aimed = { x: q.x, y: q.y };
          break;
        }

        case "dragEnd": {
          const id = building ? buildUI.picked() : null;
          if (id && lineFrom && lineTo)
            store.dispatch({
              t: "BUILD_LINE",
              id,
              x0: lineFrom.x,
              y0: lineFrom.y,
              x1: lineTo.x,
              y1: lineTo.y,
              far: building,
            });
          lineFrom = null;
          lineTo = null;
          break;
        }

        /* ---- ĐIỀU HƯỚNG MENU BẰNG TAY CẦM ----------------------------
           Menu là DOM, tay cầm không có con trỏ. Chọn phần tử kế tiếp theo
           HÌNH HỌC chứ không theo thứ tự trong DOM: menu xếp lưới hai cột, mà
           đi theo thứ tự DOM thì gạt sang phải lại nhảy xuống hàng dưới. */
        case "navDir":
          moveFocus(it.dx, it.dy);
          break;

        case "navScroll":
          focusRoot()?.querySelector(".body")?.scrollBy({ top: it.dy * 90 });
          break;

        case "build":
          if (!modal) buildUI.toggle();
          break;

        case "padHelp":
          if (!modal) menus.openPadHelp();
          break;

        /* Rê con trỏ ô bằng cần gạt. Chỉ có nghĩa trong chế độ xây dựng —
           ngoài đó thì cần gạt là để ĐI, và ngắm bám theo hướng mặt. */
        case "padAim": {
          if (!building) break;
          const p0 = padCursor ?? {
            x: Math.floor(s.player.x / TILE),
            y: Math.floor(s.player.y / TILE),
          };
          padCursor = {
            x: Math.max(0, Math.min(s.w - 1, p0.x + it.dx)),
            y: Math.max(0, Math.min(s.h - 1, p0.y + it.dy)),
          };
          aimed = { ...padCursor };
          // Đang vẽ dở thì đầu kia của đoạn bám theo con trỏ.
          if (lineFrom) lineTo = { ...padCursor };
          break;
        }

        case "navOk": {
          const el = document.activeElement as HTMLElement | null;
          if (el && el.closest(".modal, .tut-card, #devpanel")) el.click();
          else moveFocus(0, 1); // chưa có gì được chọn: chọn nút đầu tiên
          break;
        }

        case "navBack":
          if (tutorial.isOpen()) tutorial.close();
          else if (menus.isOpen()) menus.close();
          else if (devPanel.isOpen()) devPanel.close();
          break;

        /* ---- NÚT TƯƠNG TÁC, TÁCH HẲN KHỎI NÚT NGỮ CẢNH ------------------
           Hai nút này trả lời hai câu khác nhau, nên gộp chúng là hỏng cả hai:

             · Nút NGỮ CẢNH (A / DÙNG) — "làm gì với Ô này bằng thứ đang cầm":
               cày, gieo, tưới, thu, và THU sản phẩm của con vật.
             · Nút TƯƠNG TÁC (B / E) — "nói chuyện với thứ ĐỨNG ở đây": mở cửa
               hàng, lên giường, múc nước, mở kho, và XEM con vật.

           Trước đây B làm cả hai: bấm vào con bò là nó vắt sữa luôn. Nên không
           có cách nào chỉ XEM con vật — mà xem là việc người chơi làm nhiều
           hơn hẳn, nhất là khi đang tính xem con nào sắp tới lứa. Giờ B mở
           bảng, A vắt sữa. */
        case "interact": {
          if (building) {
            // Đang vẽ dở thì B huỷ đoạn; không vẽ gì thì B thoát chế độ.
            if (lineFrom) {
              lineFrom = null;
              lineTo = null;
            } else buildUI.close();
            break;
          }
          if (modal) break;
          const c = targetTile(s, true);
          if (!c) break;

          /* Con vật và NGƯỜI LÀM đều CHỈ XEM — không vắt sữa, không cho ăn.
             Đó là việc của nút ngữ cảnh. Bấm lại lần nữa thì đóng bảng, nên
             một nút vừa mở vừa đóng và không phải nhớ thêm gì. */
          /* Tìm quanh Ô ĐANG NGẮM trước, hụt thì tìm quanh CHÍNH NHÂN VẬT.
             Chỉ đo từ ô ngắm là hụt liên tục: người chơi đứng sát bên phải một
             người làm nhưng mặt quay xuống, ô ngắm nằm dưới chân, và khoảng
             cách từ ô đó tới người làm vọt lên 1,41 ô — vừa đủ vượt ngưỡng.
             Đo được đúng ca đó: cách nhau 0,88 ô mà bấm không ra gì. */
          const px2 = Math.floor(s.player.x / TILE);
          const py2 = Math.floor(s.player.y / TILE);
          const timAi = (x: number, y: number) => animalNear(s, x, y) ?? workerNear(s, x, y);
          const ai = (inReachOf(s, c.x, c.y) ? timAi(c.x, c.y) : null) ?? timAi(px2, py2);
          if (ai) {
            cardAnimal = cardAnimal === ai.id ? null : ai.id;
            buzz("tap");
            break;
          }

          // Không có con vật nào: đây là tương tác với VẬT THỂ (cửa hàng,
          // giường, giếng, kho, cửa nhà).
          if (!tryInteract(s, c.x, c.y)) deny();
          break;
        }
      }
    }

    const s = store.getState();
    if (s.log.length) {
      const upTo = toasts.show(s.log);
      if (upTo) store.dispatch({ t: "LOG_SEEN", upTo });
    }

    /* Đang MỞ BẢNG một con vật thì camera bám con VẬT, không bám nhân vật.
       Nếu không thì bảng nói về một con nằm ngoài màn hình — đọc "sữa bò tới
       lứa" mà không thấy con bò đâu thì phải tự đoán nó ở góc nào của nông
       trại. Thế giới vẫn chạy bình thường trong lúc đó: đây là ống nhòm, không
       phải nút tạm dừng. */
    const nhin = cardAnimal !== null ? s.entities.find((e) => e.id === cardAnimal) : null;
    if (nhin && nhin.map === s.mapId) camera.follow(nhin.x, nhin.y, dt);
    else camera.follow(s.player.x, s.player.y, dt);
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

    /* Kéo tuyến CHỈ có trong chế độ xây dựng — mọi công trình đều đi qua đó. */
    const dragId = buildUI.isOpen() ? buildUI.picked() : null;
    if (!buildUI.isOpen() && padCursor) padCursor = null;
    setLineMode(dragId !== null);
    buildUI.update(s, content);

    // Xem trước tuyến: từ ô ấn xuống tới ô đang rê tới.
    let lineCells: { x: number; y: number; ok: boolean }[] | null = null;
    const dich = lineTo ?? padCursor ?? cursor;
    if (dragId && lineFrom && dich) {
      lineCells = linePath(lineFrom.x, lineFrom.y, dich.x, dich.y).map((c) => ({
        x: c.x,
        y: c.y,
        ok: canPlaceBuilding(s, content, dragId, c.x, c.y),
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

    /* Bảng vật nuôi: CHỈ con người chơi đã chạm vào. Tự đóng khi con đó không
       còn (bán thịt, chết đói, sang bản đồ khác) — giữ lại một cái bảng nói về
       con vật không tồn tại là kiểu nói dối khó chịu nhất. */
    const shown =
      modal || cardAnimal === null
        ? null
        : (s.entities.find(
            (e) =>
              e.id === cardAnimal &&
              e.map === s.mapId &&
              (e.kind === "animal" || e.kind === "worker"),
          ) ?? null);
    if (cardAnimal !== null && !shown) cardAnimal = null;
    hud.showAnimal(
      shown ? (shown.kind === "worker" ? workerCard(shown, content) : animalStats(shown, content)) : null,
    );
    drawPadBar(menus.isOpen() || devPanel.isOpen(), buildUI.isOpen(), tutorial.isOpen());
    /* Menu vừa mở bằng tay cầm mà không có gì đeo vòng vàng thì người chơi gạt
       cần một cái mới thấy nó "bật lên" — nửa giây tưởng máy treo. Đặt tiêu
       điểm ngay vào nút đầu tiên. */
    const r0 = focusRoot();
    if (padOn && r0 && r0 !== focusedRootEl) {
      focusedRootEl = r0;
      const r = r0;
      /* Đặt tiêu điểm vào nút đầu tiên TRONG THÂN, không phải nút ✕ ở tiêu đề.
         Nút đầu tiên theo DOM chính là ✕ — mở menu ra mà vòng vàng nằm trên nút
         đóng thì bấm "chọn" theo phản xạ là đóng luôn cái vừa mở. */
      const first =
        r?.querySelector<HTMLElement>(
          ".body button:not([disabled]), .body [role='button'], .dev-grid button:not([disabled])",
        ) ?? r?.querySelector<HTMLElement>("button:not([disabled])");
      if (first) focusIn(first);
      // Nút ✕ đeo tên nút HUỶ của tay cầm: người chơi thấy ngay là bấm nút đó
      // cũng đóng được, khỏi phải gạt cần lên tận tiêu đề.
      const x = r.querySelector<HTMLElement>("[data-x]");
      if (x) x.dataset["pad"] = padButtonName(input.padInfo(), 1);
    } else if (!r0) focusedRootEl = null;

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
        if (dist <= AIM_REACH + TILE) return { kind: k, x: x + dx, y: y + dy };
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
  pendingVersion = await pendingContentVersion(content.contentVersion);
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

/* ---------------------------------------------------------------------------
   CẬP NHẬT PWA

   `registerType: "prompt"` nghĩa là service worker mới KHÔNG tự chiếm quyền.
   Lý do: người chơi đang giữa một ngày trong game mà trang tự tải lại thì mất
   phần chưa lưu. Thay vào đó hiện một thanh nhỏ, bấm mới tải.

   Trước đây bản viết tay gọi `skipWaiting()` ngay lúc cài, nên bản mới lặng lẽ
   thay bản cũ mà không ai biết — và người chơi mở PWA suốt thì ở lại bản cũ vô
   thời hạn vì trang không bao giờ được tải lại.
--------------------------------------------------------------------------- */
if (import.meta.env.PROD) {
  void (async () => {
    const bar = document.querySelector<HTMLElement>("#update-bar");
    const { registerSW } = await import("virtual:pwa-register");
    const update = registerSW({
      immediate: true,
      onNeedRefresh() {
        if (!bar) return;
        bar.hidden = false;
        bar.querySelector<HTMLElement>(".go")?.addEventListener(
          "click",
          () => {
            bar.hidden = true;
            void update(true);
          },
          { once: true },
        );
        bar.querySelector<HTMLElement>(".x")?.addEventListener(
          "click",
          () => {
            bar.hidden = true;
          },
          { once: true },
        );
      },
      onRegisteredSW(_url, reg) {
        /* Dọn cache của service worker VIẾT TAY đời trước. Workbox chỉ tự dọn
           precache của chính nó, nên cái cũ sẽ nằm lại trên máy người chơi mãi
           — không được đọc nữa, chỉ chiếm chỗ. */
        void caches
          .keys()
          .then((ks) =>
            Promise.all(ks.filter((k) => k.startsWith("oni-farm-")).map((k) => caches.delete(k))),
          )
          .catch(() => {});
        // Hỏi lại mỗi 30 phút. PWA mở suốt ngày thì không có lần "mở lại trang"
        // nào để phát hiện bản mới, nên phải chủ động hỏi.
        if (reg) setInterval(() => void reg.update().catch(() => {}), 30 * 60 * 1000);
      },
    });
  })();
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
