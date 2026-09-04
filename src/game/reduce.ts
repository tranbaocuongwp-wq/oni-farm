/* ============================================================================
   REDUCE — cửa duy nhất để đổi state.

   Hợp đồng với store (src/core/store.ts):
     · THUẦN — không sửa `state` hay bất cứ thứ gì với tới được từ nó.
     · Không đổi gì thì trả về ĐÚNG object `state` cũ (store dựa vào đó để bỏ
       qua render).
     · Không Date.now(), không Math.random() — mọi thứ ngẫu nhiên lấy từ
       `state.seed` qua mulberry32 và ghi seed mới vào state trả về.
============================================================================ */

import type { Action, Content, GameState, StoredMap } from "./types.ts";
import { applyProgression, commit, dPlayer, draft, storedView, toastKey, touch } from "./state.ts";
import { dirFromVector, movePlayer } from "./player.ts";
import { buildLine, canUseAt, craft, refill, useAt } from "./actions.ts";
import { swapSlots } from "./inventory.ts";
import { growCrops, growCropsIn, newDay } from "./newday.ts";
import { weatherTick } from "./weather.ts";
import { applyDebug } from "./debug.ts";
import { putAllToStore, putToStore, sellStore, takeFromStore } from "./storage.ts";
import { catchUpEntities, moveActors, runActorSteps, spawnEntity } from "./entities.ts";
import { feedAnimal, gatherFrom, slaughter } from "./animals.ts";
import { assignJob, fireWorker, hireWorker } from "./workers.ts";
import { buy, sell, sellAll } from "./economy.ts";
import {
  blockedAt,
  inInteractRange,
  inReach,
  interactAt,
  nudgeOutOfSolid,
  portalAt,
  tileCenterX,
  tileCenterY,
} from "./world.ts";

export function reduce(state: GameState, action: Action, content: Content): GameState {
  const d = draft(state);

  switch (action.t) {
    case "MOVE": {
      // Đang vung cuốc thì chân đứng yên — đó là cái làm cho thao tác có sức
      // nặng thay vì vừa chạy vừa cày cả ruộng trong một giây.
      if (state.busy > 0) {
        movePlayer(d, content, 0, 0, action.dt);
        return commit(d);
      }
      movePlayer(d, content, action.dx, action.dy, action.dt, action.run === true);
      return commit(d);
    }

    case "TICK": {
      const dt = Number.isFinite(action.dt) ? Math.max(0, action.dt) : 0;
      if (dt <= 0) return state;
      const bal = content.balance;
      const perSec = 10 / Math.max(0.0001, bal.realSecondsPerGameTenMinutes);

      const s = touch(d);
      if (s.busy > 0) s.busy = Math.max(0, s.busy - dt);

      // ---- thao tác chờ: tới mốc "chạm đất" thì mới có hiệu lực ------------
      // Bấm USE chỉ khởi động diễn hoạt (giơ công cụ). Khi `busy` trôi qua mốc
      // actionImpact, cuốc mới chạm đất — đất lật, hạt xuống, nước tưới. Nhờ
      // vậy mắt thấy đúng thứ tự: vung → chạm → kết quả, và người chơi cảm được
      // "sức nặng" của mỗi nhát thay vì bấm là xong.
      if (s.pending) {
        const total = Math.max(0.0001, bal.actionSeconds ?? 0);
        const impactAt = total * (1 - Math.max(0, Math.min(1, bal.actionImpact ?? 0.5)));
        if (s.busy <= impactAt) {
          const p = s.pending;
          s.pending = null;
          useAt(d, content, p.x, p.y);
          if (d.changed) applyProgression(d, content);
        }
      }
      if (!s.player.moving) {
        // anim là đồng hồ tự do: MOVE chạy nó khi đang đi, TICK chạy nốt khi đứng yên
        s.player = { ...s.player, anim: s.player.anim + dt };
      }
      const was = s.minutes;
      s.minutes = was + dt * perSec;

      // Thực thể: NHÍCH mỗi khung hình (không rút hạt ngẫu nhiên nào), còn
      // QUYẾT ĐỊNH thì theo nhịp giờ game. Xem đầu file entities.ts — đây là
      // chỗ tính tất định sống hay chết.
      moveActors(d, content, dt);
      runActorSteps(d, content);

      // Cây lớn theo THỜI GIAN, và chỉ phần thời gian còn ban ngày mới tính.
      // Cắt theo `daylightEndMinutes` ở đây (thay vì so sánh mốc một lần) để
      // khung hình nào vắt qua lúc trời tối cũng không cộng dư một mẩu.
      const dawn = bal.daylightEndMinutes;
      growCrops(d, content, Math.max(0, Math.min(s.minutes, dawn) - Math.min(was, dawn)));
      // Nắng gắt: qua trưa là ruộng khô (một lần mỗi ngày).
      weatherTick(d, content, was, s.minutes);

      if (s.minutes >= bal.dayEndMinutes) {
        newDay(d, content, { passedOut: true });
        toastKey(d, content, "passOut", "bad");
      }
      return commit(d);
    }

    case "USE": {
      // TUẦN TỰ: chưa xong việc đang làm thì không nhận việc mới. Bấm loạn cũng
      // không làm được nhanh hơn.
      if (state.busy > 0) return state;

      const ux = action.x | 0;
      const uy = action.y | 0;

      // Xoay mặt về phía đang làm. Không có dòng này thì nhân vật cày ô dưới
      // chân mà vẫn quay ngang — tư thế vung tay chỉ sai hướng là lộ ngay.
      //
      // CHỈ xoay khi ô nằm trong tầm với: USE ra ngoài tầm phải là KHÔNG-LÀM-GÌ
      // tuyệt đối (trả về đúng state cũ), nếu không thì bấm bừa ra xa vẫn xoay
      // được người và cái bất biến đó vỡ.
      if (inReach(state, ux, uy)) {
        const face = dirFromVector(
          tileCenterX(ux) - state.player.x,
          tileCenterY(uy) - state.player.y,
          state.player.dir,
        );
        if (face !== state.player.dir) dPlayer(d).dir = face;
      }

      // Thao tác có HIỆU LỰC TRỄ: ở đây chỉ quyết định "có việc để làm không".
      // Có → khoá `busy` và ghi `pending`; TICK sẽ áp dụng đúng lúc chạm đất.
      // Không → chạy `useAt` ngay để nó đẩy toast lý do ("Cần rìu", "Bình hết
      // nước"…) mà không khoá — thao tác HỤT không bị phạt đứng hình.
      //
      // `canUseAt` là đúng bộ luật `useAt` dùng (cùng file), nên hai bên không
      // lệch nhau: nếu nó nói làm được thì lúc chạm đất chắc chắn làm được, trừ
      // khi thế giới đổi giữa chừng (không thể: đang bận thì không có action
      // nào khác đụng vào ô).
      const total = Math.max(0, content.balance.actionSeconds ?? 0);
      if (canUseAt(state, content, ux, uy) !== null && total > 0) {
        const s = touch(d);
        s.busy = total;
        s.pending = { x: ux, y: uy };
        return commit(d);
      }
      useAt(d, content, ux, uy);
      if (d.changed) applyProgression(d, content);
      return commit(d);
    }

    case "INTERACT": {
      const ix = action.x | 0;
      const iy = action.y | 0;
      const kind = interactAt(state, content, ix, iy);
      if (!kind) return state;
      if (!inInteractRange(state, ix, iy)) return state;
      // SHOP/SELL/CRAFT do UI mở modal — state không đổi.
      if (kind === "SLEEP") {
        newDay(d, content, { passedOut: false });
        toastKey(d, content, "sleep", "good");
        return commit(d);
      }
      if (kind === "PORTAL") return reduce(state, { t: "PORTAL", x: ix, y: iy }, content);
      if (kind === "REFILL") {
        refill(d, content);
        return commit(d);
      }
      return state;
    }

    case "PORTAL": {
      const px = action.x | 0;
      const py = action.y | 0;
      if (!inInteractRange(state, px, py)) return state;
      const dest = portalAt(state, content, px, py);
      if (!dest) return state; // ô này không phải cửa: không làm gì

      // ---- ĐỔI BẢN ĐỒ ------------------------------------------------------
      // Cất bản đồ đang chơi vào `maps`, lấy bản đồ đích RA khỏi `maps`. Bất
      // biến: `mapId` không bao giờ có mặt trong `maps` — nên phải làm đúng thứ
      // tự này chứ không phải "thêm rồi xoá".
      //
      // Cửa nối trong CÙNG một bản đồ (dest.map === mapId) đi nhánh riêng: cất
      // rồi lấy lại chính nó thì mất luôn mọi thay đổi vừa có.
      if (dest.map !== state.mapId) {
        const stored = state.maps?.[dest.map];
        // Bản đồ đích không có trong state (save cũ / content vá dở): thà đứng
        // yên còn hơn nhảy vào hư vô.
        if (!stored) return state;

        // Cộng bù cho bản đồ sắp bước vào: nó không được TICK nuôi trong lúc
        // vắng mặt, nên trả đúng số phút BAN NGÀY đã trôi qua. Cắt theo
        // `daylightEnd` ở cả hai đầu để quãng vắng mặt ban đêm không tính.
        //
        // Phải làm TRƯỚC khi tráo lưới. `dTile` đo chỉ số và so tham chiếu với
        // `d.base.tiles` — tức lưới lúc vào reduce. Tráo trước rồi mới cộng thì
        // nó vừa chặn nhầm mọi ô ngoài kích thước lưới cũ, vừa ghi thẳng lên
        // mảng đang nằm trong `maps` (mất tính thuần). `storedView` thì ngắm
        // đúng `d.base.maps[id]`, nên còn đúng.
        const dawn = content.balance.daylightEndMinutes;
        const away = Math.max(0, Math.min(state.minutes, dawn) - Math.min(stored.awayAt, dawn));
        if (away > 0) {
          const tv = storedView(d, dest.map);
          if (tv) growCropsIn(tv, content, away);
          // Con vật trên bản đồ vắng mặt cũng phải đói thêm và ra sữa thêm —
          // chỉ ĐỒNG HỒ, không bao giờ vị trí. Xem catchUpEntities.
          catchUpEntities(d, content, dest.map, away);
        }
        // đọc lại: growCropsIn có thể đã nhân bản lưới đích
        const target = d.s.maps?.[dest.map] ?? stored;

        const maps: Record<string, StoredMap> = { ...d.s.maps };
        delete maps[dest.map];
        maps[state.mapId] = {
          w: state.w,
          h: state.h,
          tiles: state.tiles,
          awayAt: state.minutes, // đồng hồ bắt đầu chạy cho bản đồ vừa rời
        };
        const s = touch(d);
        s.mapId = dest.map;
        s.w = target.w;
        s.h = target.h;
        s.tiles = target.tiles;
        s.maps = maps;
      }

      // Từ đây trở đi mọi truy vấn không gian phải hỏi `d.s` (bản đồ MỚI),
      // không phải `state` (bản đồ cũ).
      const now = d.changed ? d.s : state;
      let x = tileCenterX(dest.x);
      let y = tileCenterY(dest.y);
      if (blockedAt(now, content, x, y)) {
        const fixed = nudgeOutOfSolid(now, content, x, y);
        x = fixed.x;
        y = fixed.y;
      }
      if (blockedAt(now, content, x, y)) return state; // bí quá thì đứng yên còn hơn kẹt

      const p = dPlayer(d);
      p.x = x;
      p.y = y;
      p.moving = false;
      // Bước qua cửa là dừng mọi thao tác dở: không ai vung cuốc xuyên tường.
      if (d.s.busy !== 0 || d.s.pending) {
        const s = touch(d);
        s.busy = 0;
        s.pending = null;
      }
      return commit(d);
    }

    case "REFILL": {
      refill(d, content);
      return commit(d);
    }

    case "CRAFT": {
      if (state.busy > 0) return state;
      craft(d, content, action.id);
      if (d.changed) applyProgression(d, content);
      return commit(d);
    }

    case "STORE_PUT": {
      if (state.busy > 0) return state;
      putToStore(d, content, action.slot | 0, action.n);
      return commit(d);
    }

    case "STORE_TAKE": {
      if (state.busy > 0) return state;
      takeFromStore(d, content, action.slot | 0, action.n);
      return commit(d);
    }

    case "STORE_PUT_ALL": {
      if (state.busy > 0) return state;
      putAllToStore(d, content);
      return commit(d);
    }

    case "STORE_SELL_ALL": {
      if (state.busy > 0) return state;
      sellStore(d, content);
      if (d.changed) applyProgression(d, content);
      return commit(d);
    }

    case "BUY_ANIMAL": {
      if (state.busy > 0) return state;
      const def = content.animals[action.def];
      if (!def) return state;
      if (!state.unlocked.includes(`animal:${action.def}`)) return state; // chưa mở khoá
      if (state.money < def.price) {
        toastKey(d, content, "noMoney", "bad");
        return commit(d);
      }
      /* Thả ở ĐIỂM GIAO cố định cạnh quầy bán, không phải dưới chân người chơi.
         Con vật mua xong bụp một cái hiện ra giữa ruộng thì mất hết tính tự
         nhiên; giao tới một chỗ CỐ ĐỊNH thì người chơi biết ra đâu mà đón, và
         mốc xe sau này chỉ việc cho xe tải chạy tới đúng điểm này. */
      const drop = content.tiles.dropoff ?? content.tiles.spawn;
      if (drop.map !== state.mapId) {
        toastKey(d, content, "deliverElsewhere", "info");
        return commit(d);
      }
      const cx = tileCenterX(drop.x);
      const cy = tileCenterY(drop.y);
      const id = spawnEntity(d, content, { def: action.def, map: drop.map, x: cx, y: cy });
      if (id === null) {
        toastKey(d, content, "tooMany", "bad");
        return commit(d);
      }
      touch(d).money = d.s.money - def.price;
      toastKey(d, content, "bought", "good", def.name);
      applyProgression(d, content);
      return commit(d);
    }

    case "FEED": {
      if (state.busy > 0) return state;
      feedAnimal(d, content, action.x | 0, action.y | 0);
      return commit(d);
    }

    case "GATHER": {
      if (state.busy > 0) return state;
      if (gatherFrom(d, content, action.x | 0, action.y | 0)) applyProgression(d, content);
      return commit(d);
    }

    case "SLAUGHTER": {
      if (state.busy > 0) return state;
      slaughter(d, content, action.x | 0, action.y | 0);
      return commit(d);
    }

    case "HIRE": {
      if (state.busy > 0) return state;
      hireWorker(d, content, action.job);
      return commit(d);
    }

    case "FIRE": {
      if (state.busy > 0) return state;
      fireWorker(d, action.id | 0);
      return commit(d);
    }

    case "ASSIGN": {
      assignJob(d, action.id | 0, action.job);
      return commit(d);
    }

    case "BUILD_LINE": {
      // Đang vung tay dở thì không xây — cùng luật với mọi thao tác khác.
      if (state.busy > 0) return state;
      buildLine(d, content, action.id, action.x0, action.y0, action.x1, action.y1);
      if (d.changed) applyProgression(d, content);
      return commit(d);
    }

    case "DEBUG": {
      applyDebug(d, content, action.op, action.n);
      if (d.changed) applyProgression(d, content);
      return commit(d);
    }

    case "SWAP": {
      const next = swapSlots(state.inv, action.a | 0, action.b | 0);
      if (!next) return state;
      touch(d).inv = next;
      return commit(d);
    }

    case "SELECT": {
      const slots = Math.max(1, content.balance.hotbarSlots | 0);
      const slot = action.slot | 0;
      if (slot < 0 || slot >= slots) return state;
      if (slot === state.sel) return state;
      touch(d).sel = slot;
      return commit(d);
    }

    case "BUY": {
      buy(d, content, action.id, action.n);
      if (d.changed) applyProgression(d, content);
      return commit(d);
    }

    case "SELL": {
      sell(d, content, action.id, action.n);
      if (d.changed) applyProgression(d, content);
      return commit(d);
    }

    case "SELL_ALL": {
      sellAll(d, content);
      if (d.changed) applyProgression(d, content);
      return commit(d);
    }

    case "SLEEP": {
      newDay(d, content, { passedOut: false });
      toastKey(d, content, "sleep", "good");
      return commit(d);
    }

    case "LOG_SEEN": {
      const upTo = action.upTo | 0;
      if (state.log.length === 0) return state;
      const left = state.log.filter((e) => e.id > upTo);
      if (left.length === state.log.length) return state;
      touch(d).log = left;
      return commit(d);
    }
  }

  return state;
}
