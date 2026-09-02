/* ============================================================================
   STORE — nguồn sự thật duy nhất.

   Mọi thay đổi state đi qua đúng một cửa: dispatch(action) → reduce() thuần →
   kiểm bất biến → thông báo cho người nghe. UI và renderer CHỈ ĐỌC.

   Đây là thứ làm cho ba việc khó cùng chạy được bằng một cơ chế:
     · save   = store.snapshot()
     · test   = replay một mảng Action rồi so state
     · OTA    = tráo tham số `content`, state không đổi cấu trúc
============================================================================ */

import type { Action, Content, GameState, SaveData } from "../game/types.ts";
import { reduce } from "../game/reduce.ts";
import { checkInvariants } from "../game/invariants.ts";
import { CORE_VERSION } from "./version.ts";

export interface StoreOptions {
  /** Bật kiểm bất biến sau mỗi dispatch. Mặc định bật ở dev + test, tắt ở bản phát hành. */
  validate?: boolean;
  /** Ném lỗi khi vỡ bất biến (test) thay vì chỉ console.error (bản chơi thật). */
  strict?: boolean;
  /** Ghi lại action để replay/debug. 0 = tắt. */
  historyLimit?: number;
}

export type Listener = (s: GameState, a: Action | null) => void;

export interface Store {
  getState(): GameState;
  getContent(): Content;
  dispatch(a: Action): GameState;
  subscribe(fn: Listener): () => void;
  snapshot(): SaveData;
  /** Nạp state từ save/OTA. Bỏ qua reducer nên PHẢI đã được migrate + validate trước. */
  replace(s: GameState): void;
  /** Đổi content lúc chạy (dùng khi áp dụng OTA hoặc hoàn tác). */
  setContent(c: Content): void;
  history(): readonly Action[];
}

export function createStore(
  initial: GameState,
  content: Content,
  opts: StoreOptions = {},
): Store {
  const validate = opts.validate ?? true;
  const strict = opts.strict ?? false;
  const historyLimit = opts.historyLimit ?? 0;

  let state = initial;
  let current = content;
  const listeners = new Set<Listener>();
  const log: Action[] = [];

  const notify = (a: Action | null) => {
    for (const fn of listeners) fn(state, a);
  };

  const verify = (a: Action | null) => {
    if (!validate) return;
    const problems = checkInvariants(state, current);
    if (problems.length === 0) return;
    const where = a ? a.t : "replace";
    const msg = `[store] vỡ bất biến sau ${where}:\n  - ${problems.join("\n  - ")}`;
    if (strict) throw new Error(msg);
    console.error(msg);
  };

  return {
    getState: () => state,
    getContent: () => current,

    dispatch(a) {
      const next = reduce(state, a, current);
      // Reducer thuần: trả về chính state cũ nghĩa là "không có gì đổi".
      // Bỏ qua notify trong trường hợp đó để render khỏi chạy vô ích.
      if (next === state) return state;
      state = next;
      if (historyLimit > 0) {
        log.push(a);
        if (log.length > historyLimit) log.shift();
      }
      verify(a);
      notify(a);
      return state;
    },

    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    snapshot(): SaveData {
      return { magic: "oni-farm", savedAt: Date.now(), state };
    },

    replace(s) {
      state = { ...s, coreVersion: CORE_VERSION };
      verify(null);
      notify(null);
    },

    setContent(c) {
      current = c;
      verify(null);
      notify(null);
    },

    history: () => log,
  };
}
