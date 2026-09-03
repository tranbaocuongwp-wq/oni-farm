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
import { observeScreen } from "./core/screen.ts";
import { alignedTo, createNavigator } from "./core/navigate.ts";
import { applyControlMode, loadSettings, saveSettings, type ControlMode } from "./core/settings.ts";
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
import { createRenderer, type Cursor } from "./render/draw.ts";
import { createHud } from "./ui/hud.ts";
import { createMenus } from "./ui/menus.ts";
import { createToasts } from "./ui/toast.ts";
import { createMinimap } from "./ui/minimap.ts";
import type { Content, GameState, Stats } from "./game/types.ts";
import { createNewGame, migrateForContent } from "./game/state.ts";
import { canCraft, canUseAt, interactAt, missingFor } from "./game/actions.ts";

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

  // Chế độ điều khiển là sở thích của MÁY, không thuộc ván chơi — nên nó nằm ở
  // localStorage riêng, không đi vào save. Nạp SỚM vì menu tham chiếu tới nó
  // trong closure ngay lúc dựng.
  const settings = loadSettings();
  applyControlMode(settings.control);

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
  const stage = $("#stage");

  // Camera là chỗ DUY NHẤT biết màn hình to nhỏ ra sao. Mọi thứ khác tính bằng
  // world px, nên đổi khổ màn hình không đụng tới một dòng logic nào.
  const camera = createCamera({ tile: TILE });
  camera.setWorld(initial.w * TILE, initial.h * TILE);
  const renderer = createRenderer(canvas, atlas, camera);

  observeScreen(stage, (info) => {
    if (camera.setSize(info.cssW, info.cssH, info.dpr)) renderer.applyViewport();
    // Bố cục nút bấm/HUD đổi theo hướng màn — CSS đọc thuộc tính này.
    document.body.dataset["orientation"] = info.orientation;
  });
  camera.jumpTo(initial.player.x, initial.player.y);
  const hud = createHud($("#hud"), atlas);
  const toasts = createToasts($("#toasts"));

  const menus = createMenus($("#modal-root"), atlas, () => store.getState(), () => content, {
    buy: (id, n) => store.dispatch({ t: "BUY", id, n }),
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
    controlMode: () => settings.control,
    setControlMode: (mode: ControlMode) => {
      settings.control = mode;
      saveSettings(settings);
      applyControlMode(mode);
    },
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

  /** Thay state (tải save, chơi mới): camera phải NHẢY tới chỗ mới. Nếu để nó
   *  làm mượt thì người chơi sẽ thấy khung hình trượt qua nửa bản đồ. */
  function adoptState(next: GameState) {
    store.replace(next);
    camera.setWorld(next.w * TILE, next.h * TILE);
    camera.jumpTo(next.player.x, next.player.y);
  }

  hud.onSelect((slot) => store.dispatch({ t: "SELECT", slot }));

  // Bản đồ nhỏ: vừa để nhìn tổng thể nông trại, vừa để ĐI XA — bấm-để-đi trên
  // khung chính chỉ tới được chỗ đang nhìn thấy, còn ở đây bấm đâu cũng đi được.
  const minimap = createMinimap($("#minimap"));
  minimap.onPick((tx, ty) => {
    if (menus.isOpen()) return;
    // act: false — đi thuần tuý. Không thì đang cầm cuốc mà bấm bản đồ là tự cày.
    nav.goTo(store.getState(), content, tx, ty, { act: false });
  });

  /* ---- 5. input ---- */
  const stickZone = document.querySelector<HTMLElement>("#stick");
  const input = createInput(canvas, {
    // Màn hình → world px. Đây là ranh giới duy nhất mà pixel màn hình được
    // phép xuất hiện; từ đây trở đi mọi thứ là world px.
    toWorld: (cx, cy) => {
      const r = stage.getBoundingClientRect();
      return camera.screenToWorld(cx - r.left, cy - r.top);
    },
    isModalOpen: () => menus.isOpen(),
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

  // Cảm ứng: bật lớp điều khiển ảo. Chuột/bàn phím vẫn chạy song song — máy lai
  // (laptop cảm ứng, tablet có bàn phím) dùng được cả hai mà không phải chọn.
  if (matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0)
    document.body.classList.add("touch");


  for (const [sel, code] of [
    ["#abtn .a", "Space"],
    ["#abtn .b", "KeyE"],
    ["#sysbtn .menu", "Escape"],
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
    const p = forceFacing || input.stickActive() ? null : input.pointer();

    // Thứ tự ưu tiên khi ngắm:
    //   1. chuột VỪA rê  → theo chuột (desktop ngắm bằng chuột là chính)
    //   2. ô đã ngắm còn trong tầm → giữ nguyên (cứu màn nhỏ: cày rồi gieo rồi
    //      tưới cùng một ô mà chỉ phải chạm đúng một lần)
    //   3. ô trước mặt
    if (!p && !forceFacing && aimed && inReachOf(s, aimed.x, aimed.y))
      return { x: aimed.x, y: aimed.y, ok: tileActionable(s, aimed.x, aimed.y) };

    let tx: number;
    let ty: number;
    if (p) {
      tx = Math.max(0, Math.min(s.w - 1, Math.floor(p.x / TILE)));
      ty = Math.max(0, Math.min(s.h - 1, Math.floor(p.y / TILE)));
    } else {
      const d = s.player.dir;
      const ox = d === "left" ? -1 : d === "right" ? 1 : 0;
      const oy = d === "up" ? -1 : d === "down" ? 1 : 0;
      tx = Math.floor(s.player.x / TILE) + ox;
      ty = Math.floor(s.player.y / TILE) + oy;
    }
    if (tx < 0 || ty < 0 || tx >= s.w || ty >= s.h) return null;
    // Từ khi có bấm-để-đi, "ở xa" không còn là lỗi nữa — nhân vật sẽ tự đi tới.
    // Nên con trỏ đổi nghĩa: TRẮNG = có việc làm được ở đây, ĐỎ = ô vô nghĩa
    // (nước, gốc cây, tảng đá, tường nhà).
    return { x: tx, y: ty, ok: tileActionable(s, tx, ty) };
  }

  function inReachOf(s: GameState, tx: number, ty: number): boolean {
    return Math.hypot(tx * TILE + TILE / 2 - s.player.x, ty * TILE + TILE / 2 - s.player.y) <= REACH;
  }

  /* ---- 9. bấm-để-đi ------------------------------------------------------
     Bấm vào ô ở xa: nhân vật TỰ ĐI tới rồi mới xử lý. Đây chỉ là một cách nhập
     liệu — nó sinh ra action MOVE từng khung hình y như bàn phím, nên game
     state và định dạng save không đổi gì. */
  const nav = createNavigator();

  // Dịch chuyển qua cửa làm nhân vật nhảy cả chục ô. Camera phải nhảy theo, nếu
  // không nó sẽ trượt mượt qua nửa bản đồ và người chơi hoa mắt.
  // Đăng ký SAU khi có `nav` — trước đó biến còn trong vùng chưa khởi tạo.
  let lastPos = { x: store.getState().player.x, y: store.getState().player.y };
  store.subscribe((st) => {
    if (Math.hypot(st.player.x - lastPos.x, st.player.y - lastPos.y) > TILE * 4) {
      camera.jumpTo(st.player.x, st.player.y);
      nav.cancel();
    }
    lastPos = { x: st.player.x, y: st.player.y };
  });

  /** Ô cuối cùng người chơi NGẮM tới. Trên màn nhỏ, ô chỉ rộng ~32px nên bắt
   *  người chơi chạm lại chính xác cho mỗi thao tác là cực hình. Giữ lại ô vừa
   *  ngắm, chừng nào còn trong tầm với thì nút DÙNG cứ thế làm tiếp ở đó —
   *  cày rồi gieo rồi tưới cùng một ô mà chỉ phải ngắm đúng một lần.
   *
   *  Bị xoá ngay khi người chơi tự di chuyển: lúc đó ý định đã đổi. */
  let aimed: { x: number; y: number } | null = null;

  /**
   * Nắn cú chạm về ô "có nghĩa" gần nhất.
   *
   * Ngón tay rộng cỡ 44px mà ô chỉ 32px, nên chạm vào mép giữa hai ô là chuyện
   * thường. Ta xét ô vừa chạm cùng 8 ô quanh nó, ưu tiên ô thật sự làm được
   * việc với thứ đang cầm, rồi mới tới ô gần điểm chạm nhất.
   *
   * Bán kính nắn tính bằng PIXEL MÀN HÌNH rồi đổi ngược ra world px: màn hình
   * càng nhỏ (hệ số phóng càng thấp) thì ngón tay càng che nhiều ô, nên cần nắn
   * rộng hơn. Trên desktop gần như không nắn gì.
   */
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
        // Ô làm được việc luôn thắng ô trống, sau đó mới xét gần điểm chạm.
        const score = (useful ? 0 : 1000) + d;
        if (score < bestScore) {
          bestScore = score;
          best = { x: tx, y: ty };
        }
      }
    }
    return best ?? raw;
  }

  /** Ô này có gì để làm không (dùng cho màu con trỏ). Nước, cây, đá, tường nhà
   *  thì đứng sát tận nơi cũng chẳng làm được gì — báo đỏ luôn cho khỏi mất công đi. */
  function tileActionable(s: GameState, tx: number, ty: number): boolean {
    const t = s.tiles[ty * s.w + tx];
    if (!t) return false;
    if (t.g === "void") return false;
    if (t.prop) {
      const def = content.props[t.prop];
      // Cây, đá, bụi giờ CHẶT/ĐẬP được nên là ô đáng nhắm; tường với vách nhà
      // thì vẫn vô nghĩa.
      return !!def && (!!def.hits || !!def.interact);
    }
    // Bờ nước múc được nước; giữa hồ thì không.
    return t.g !== "water" || !!content.tiles.grounds["water"]?.interact;
  }

  /** Đang cầm công trình ĐẶC? Vậy phải đứng CẠNH ô đích chứ không đứng lên nó,
   *  nếu không sẽ tự nhốt mình và việc đặt bị từ chối. */
  function holdingSolidBuilding(s: GameState): boolean {
    const held = s.inv[s.sel];
    if (!held?.id.startsWith("build:")) return false;
    const def = content.buildings[held.id.slice(6)];
    return !!def && def.kind === "object" && def.solid;
  }

  /** Tương tác với công trình (cửa nhà, máy bán hạt, quầy thu mua).
   *  KHÔNG đòi thẳng hàng: mở cửa hàng không có động tác vung tay nào để mà lệch. */
  function tryInteract(s: GameState, tx: number, ty: number): boolean {
    const hit = nearbyInteract(s, tx, ty);
    if (!hit) return false;
    switch (hit.kind) {
      case "SHOP":
        menus.openShop();
        return true;
      case "SELL":
        menus.openSell();
        return true;
      case "CRAFT":
        menus.openCraft();
        return true;
      case "SLEEP":
        // Chỉ GIƯỜNG mới ngủ được — cửa nhà giờ chỉ để đi vào phòng.
        store.dispatch({ t: "SLEEP" });
        return true;
      case "REFILL":
        store.dispatch({ t: "REFILL" });
        return true;
      case "PORTAL":
        store.dispatch({ t: "PORTAL", x: hit.x, y: hit.y });
        return true;
      default:
        return false;
    }
  }

  /** Dùng vật phẩm lên ô. Trả false nếu còn ở xa quá. */
  function tryUse(s: GameState, tx: number, ty: number): boolean {
    if (!inReachOf(s, tx, ty)) return false;
    store.dispatch({ t: "USE", x: tx, y: ty });
    return true;
  }

  /** Làm việc trên ô. Trả false nếu còn ở xa quá, chưa làm được gì. */
  function actOnTile(s: GameState, tx: number, ty: number): boolean {
    return tryInteract(s, tx, ty) || tryUse(s, tx, ty);
  }

  const vpTiles = () => ({
    w: camera.viewport.viewW / TILE,
    h: camera.viewport.viewH / TILE,
  });

  /* ---- 10. vòng lặp ---- */
  let elapsed = 0;
  const loop = createLoop((dt) => {
    elapsed += dt;
    const modal = menus.isOpen();

    if (modal) nav.cancel();

    if (!modal) {
      const ax = input.axis();
      if (ax.x !== 0 || ax.y !== 0) {
        // Người chơi tự điều khiển thì huỷ đường đi tự động ngay — không giành
        // tay lái với nhau.
        nav.cancel();
        store.dispatch({ t: "MOVE", dx: ax.x, dy: ax.y, dt, run: input.running() });
        // Người chơi tự cầm lái thì BỎ ô đang ngắm, kể cả nó còn trong tầm.
        // Giữ lại sẽ gây bất ngờ: xoay người sang hướng khác rồi bấm DÙNG mà
        // nhân vật vẫn thò tay về ô cũ phía sau lưng.
        aimed = null;
      } else {
        const step = nav.update(store.getState(), content, dt);
        if (step) store.dispatch({ t: "MOVE", dx: step.dx, dy: step.dy, dt, run: step.run });
        else if (store.getState().player.moving)
          store.dispatch({ t: "MOVE", dx: 0, dy: 0, dt });
      }
      store.dispatch({ t: "TICK", dt });

      // Vừa tới nơi thì làm luôn việc mà cú bấm lúc nãy đã hẹn.
      const arrived = nav.takeArrival();
      if (arrived) {
        // Tới nơi thì ô đó thành ô đang ngắm, kể cả khi chỉ đi chứ không làm gì:
        // người chơi chạm một lần để đi tới, xong bấm DÙNG là thao tác được ngay,
        // khỏi phải ngắm lại.
        aimed = { x: arrived.tx, y: arrived.ty };
        // act=false: đích do chạm MỘT lần hoặc bấm bản đồ nhỏ — chỉ đi, không làm gì.
        if (arrived.act && !actOnTile(store.getState(), arrived.tx, arrived.ty)) play("deny");
      }
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
        case "map":
          minimap.toggle();
          break;
        case "debug":
          menus.openDebug();
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
          // Ngắm bằng chuột chỉ có giá trị khi ô đó trong tầm với; xa quá thì
          // Space quay về ô TRƯỚC MẶT thay vì bấm hụt vào chỗ con trỏ.
          let c = targetTile(s);
          if (c && !inReachOf(s, c.x, c.y)) c = targetTile(s, true);
          if (c && inReachOf(s, c.x, c.y)) store.dispatch({ t: "USE", x: c.x, y: c.y });
          else play("deny");
          break;
        }
        case "pointer": {
          const snapped = snapTap(s, it.wx, it.wy);
          const tx = snapped.x;
          const ty = snapped.y;
          aimed = { x: tx, y: ty };
          nav.cancel();

          // LUẬT ĐIỀU KHIỂN: chạm MỘT lần là ĐI, chạm HAI lần mới THỰC THI.
          // Tách hai ý định ra vì trên màn nhỏ chúng rất dễ lẫn: định đi ngang
          // qua ruộng mà lỡ tay cày mất một ô là chuyện bực mình nhất.
          if (!it.double) {
            // Chỉ đi tới và ngắm sẵn ô đó. Đã đứng trong tầm rồi thì khỏi đi
            // đâu cả — cú chạm coi như chỉ để ngắm.
            if (!inReachOf(s, tx, ty))
              nav.goTo(s, content, tx, ty, {
                act: false,
                avoidStandingOn: holdingSolidBuilding(s),
              });
            break;
          }

          // Chạm kép.
          // Công trình thì mở ngay, không cần bước vào cho ngay ngắn.
          if (tryInteract(s, tx, ty)) break;
          // Với lô đất: chỉ làm ngay khi đã ĐỨNG THẲNG HÀNG. Đứng chéo góc thì
          // vẫn với tới được, nhưng nhân vật sẽ thò tay theo một hướng chẳng
          // ăn nhập gì với lô đất — thà bước một bước cho ngang bằng rồi làm.
          if (alignedTo(s, tx, ty) && tryUse(s, tx, ty)) break;
          if (
            !tileActionable(s, tx, ty) ||
            !nav.goTo(s, content, tx, ty, { avoidStandingOn: holdingSolidBuilding(s) })
          )
            play("deny");
          break;
        }
        case "interact": {
          // Phím E luôn nhắm ô TRƯỚC MẶT, không theo con trỏ và không tự đi.
          const c = targetTile(s, true);
          if (!c) break;
          if (!actOnTile(s, c.x, c.y)) play("deny");
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

    // Camera bám nhân vật SAU khi state đã cập nhật và TRƯỚC khi vẽ, để khung
    // hình nào cũng thấy camera khớp với vị trí thật của nhân vật khung đó.
    camera.follow(s.player.x, s.player.y, dt);
    // Đang trên đường đi thì con trỏ chỉ vào ĐÍCH, để người chơi thấy rõ mình
    // vừa hẹn làm gì ở đâu.
    const navT = nav.target();
    const cursor: Cursor | null = modal
      ? null
      : navT
        ? { x: navT.tx, y: navT.ty, ok: true }
        : targetTile(s);
    renderer.draw(s, content, cursor, elapsed);
    hud.update(s, content);
    minimap.setView(camera.rx / TILE, camera.ry / TILE, vpTiles().w, vpTiles().h);
    minimap.update(s, content);
  });

  /** Tương tác nhận cả ô kề bên ô đang nhắm — đứng chệch một chút vẫn bấm được,
   *  đỡ phải căn chỉnh từng pixel. Trả về cả TOẠ ĐỘ vì cửa dịch chuyển cần biết
   *  chính xác mình đang dùng cái cửa nào. */
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
      camera,
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
