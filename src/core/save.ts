/* ============================================================================
   SAVE — lưu cục bộ, hoàn toàn offline. Không có server, không gửi đi đâu cả.

   Ba tầng, tự tụt xuống tầng dưới khi tầng trên không dùng được:
     1. IndexedDB   — chính. Dung lượng lớn, không chặn luồng chính.
     2. localStorage— dự phòng (chế độ ẩn danh, Safari khoá IDB, WebView lạ).
     3. File JSON   — người chơi tự xuất/nhập, mang save đi máy khác hoặc sao lưu.

   Save còn mang `coreVersion` + `contentVersion`, nên khi content đổi qua OTA
   thì game biết đường migrate thay vì crash.
============================================================================ */

import type { GameState, SaveData } from "../game/types.ts";
import { SAVE_VERSION } from "./version.ts";

const DB_NAME = "oni-farm";
const DB_VERSION = 1;
const STORE = "saves";
/** Kho riêng cho content pack tải qua OTA — cùng một database để chỉ phải
 *  mở/nâng cấp một chỗ, nhưng tách store để xoá cache content không đụng save. */
const STORE_CONTENT = "content";
const LS_KEY = "oni-farm:save";
const LS_KEY_CONTENT = "oni-farm:content";
export const SLOT_MAIN = "main";

/* ---------------------------------------------------------------------------
   IndexedDB — bọc trong Promise, mọi lỗi đều nuốt và trả null để tầng trên
   tự chuyển sang localStorage. Save game không được phép làm sập game.
--------------------------------------------------------------------------- */

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === "undefined") return resolve(null);
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      return resolve(null);
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      if (!db.objectStoreNames.contains(STORE_CONTENT)) db.createObjectStore(STORE_CONTENT);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
}

function idbPut(db: IDBDatabase, key: string, value: unknown, store = STORE): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(store, "readwrite");
      tx.objectStore(store).put(value, key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

function idbGet<T>(db: IDBDatabase, key: string, store = STORE): Promise<T | null> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(store, "readonly");
      const req = tx.objectStore(store).get(key);
      req.onsuccess = () => resolve((req.result as T) ?? null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function idbDelete(db: IDBDatabase, key: string, store = STORE): Promise<void> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(store, "readwrite");
      tx.objectStore(store).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

/* ---------------------------------------------------------------------------
   Kiểm tra hình dạng file save trước khi tin nó — người chơi có thể nhập
   nhầm file, hoặc file cũ từ phiên bản trước.
--------------------------------------------------------------------------- */

export function isSaveData(v: unknown): v is SaveData {
  if (typeof v !== "object" || v === null) return false;
  const d = v as Record<string, unknown>;
  if (d["magic"] !== "oni-farm") return false;
  const s = d["state"];
  if (typeof s !== "object" || s === null) return false;
  const st = s as Record<string, unknown>;
  return (
    typeof st["save"] === "number" &&
    typeof st["day"] === "number" &&
    typeof st["money"] === "number" &&
    Array.isArray(st["tiles"]) &&
    Array.isArray(st["inv"])
  );
}

/** Nâng cấp save cũ lên định dạng hiện tại.
 *  Mỗi lần tăng SAVE_VERSION thì thêm một bước ở đây. Trả null nếu quá cũ
 *  để không cố cứu một file không cứu được. */
export function migrateSave(data: SaveData): GameState | null {
  const v = data.state.save;
  if (v > SAVE_VERSION) return null; // save từ bản MỚI hơn — không đọc ngược được
  if (v === SAVE_VERSION) return data.state;
  // Chưa có bước migrate nào (đang ở v1). Ví dụ cho lần sau:
  //   let s = data.state;
  //   if (s.save === 1) { s = { ...s, thuộcTínhMới: giáTrịMặcĐịnh, save: 2 }; }
  //   return s;
  return null;
}

/* ---------------------------------------------------------------------------
   API công khai
--------------------------------------------------------------------------- */

export interface SaveResult {
  ok: boolean;
  where: "indexeddb" | "localstorage" | "none";
}

export async function saveGame(data: SaveData, slot = SLOT_MAIN): Promise<SaveResult> {
  const db = await openDb();
  if (db) {
    const ok = await idbPut(db, slot, data);
    db.close();
    if (ok) return { ok: true, where: "indexeddb" };
  }
  try {
    localStorage.setItem(`${LS_KEY}:${slot}`, JSON.stringify(data));
    return { ok: true, where: "localstorage" };
  } catch {
    return { ok: false, where: "none" };
  }
}

export async function loadGame(slot = SLOT_MAIN): Promise<SaveData | null> {
  const db = await openDb();
  if (db) {
    const v = await idbGet<unknown>(db, slot);
    db.close();
    if (isSaveData(v)) return v;
  }
  try {
    const raw = localStorage.getItem(`${LS_KEY}:${slot}`);
    if (!raw) return null;
    const v: unknown = JSON.parse(raw);
    return isSaveData(v) ? v : null;
  } catch {
    return null;
  }
}

export async function deleteGame(slot = SLOT_MAIN): Promise<void> {
  const db = await openDb();
  if (db) {
    await idbDelete(db, slot);
    db.close();
  }
  try {
    localStorage.removeItem(`${LS_KEY}:${slot}`);
  } catch {
    /* không sao */
  }
}

export async function hasSave(slot = SLOT_MAIN): Promise<boolean> {
  return (await loadGame(slot)) !== null;
}

/* ---- tầng 3: file ------------------------------------------------------- */

export function exportToFile(data: SaveData, name?: string) {
  const stamp = new Date().toISOString().slice(0, 10);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name ?? `oni-farm-ngay${data.state.day}-${stamp}.json`;
  a.click();
  // nhả URL ở lần lặp sau để Safari kịp bắt đầu tải
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function importFromFile(): Promise<SaveData | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      try {
        const v: unknown = JSON.parse(await file.text());
        resolve(isSaveData(v) ? v : null);
      } catch {
        resolve(null);
      }
    };
    input.click();
  });
}

/* ---------------------------------------------------------------------------
   Kho khoá-giá trị nhỏ dùng chung cho content pack OTA (src/core/content/ota.ts).
   Cùng cơ chế tụt tầng IndexedDB → localStorage như save game.
--------------------------------------------------------------------------- */

export async function kvSetContent(key: string, value: unknown): Promise<boolean> {
  const db = await openDb();
  if (db) {
    const ok = await idbPut(db, key, value, STORE_CONTENT);
    db.close();
    if (ok) return true;
  }
  try {
    localStorage.setItem(`${LS_KEY_CONTENT}:${key}`, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export async function kvGetContent<T>(key: string): Promise<T | null> {
  const db = await openDb();
  if (db) {
    const v = await idbGet<T>(db, key, STORE_CONTENT);
    db.close();
    if (v !== null && v !== undefined) return v;
  }
  try {
    const raw = localStorage.getItem(`${LS_KEY_CONTENT}:${key}`);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export async function kvDeleteContent(key: string): Promise<void> {
  const db = await openDb();
  if (db) {
    await idbDelete(db, key, STORE_CONTENT);
    db.close();
  }
  try {
    localStorage.removeItem(`${LS_KEY_CONTENT}:${key}`);
  } catch {
    /* không sao */
  }
}
