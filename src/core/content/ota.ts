/* ============================================================================
   OTA — cập nhật NỘI DUNG mà không cần phát hành lại core.

   Nguyên tắc, theo đúng thứ tự ưu tiên:

   1. KHÔNG BAO GIỜ CHẶN. Game luôn khởi động bằng content đóng kèm hoặc content
      đã cache. Việc hỏi thăm bản mới chạy ngầm; hỏng thì im lặng bỏ qua.
   2. CHỈ DỮ LIỆU, KHÔNG BAO GIỜ LÀ CODE. Không eval, không import động, không
      <script>. Pack chỉ là JSON, và phải qua schema mới được dùng.
   3. CỔNG SEMVER là chốt chặn chính: pack khai `requiresCore`, core chỉ nhận
      khi phiên bản của mình thoả dải đó.
   4. ÁP DỤNG Ở LẦN KHỞI ĐỘNG SAU. Không đổi luật chơi giữa lúc đang chơi dở.
   5. LUÔN CÓ ĐƯỜNG LUI. `revertToBundled()` xoá cache, quay về bản đóng kèm.

   Không cấu hình `contentUrl` thì toàn bộ file này nằm im — game chạy thuần offline.
============================================================================ */

import type { Content } from "../../game/types.ts";
import { kvDeleteContent, kvGetContent, kvSetContent } from "../save.ts";
import { CORE_VERSION } from "../version.ts";
import { buildContent, validatePack, type RawPack } from "./loader.ts";
import { bundledContent, bundledRawPack } from "./bundled.ts";
import { isNewer, satisfies } from "./semver.ts";

const KEY_PACK = "pack";

/** manifest đã xuất bản (do scripts/build-content.mjs sinh ra) */
interface PublishedManifest {
  contentVersion: string;
  requiresCore: string;
  name?: string;
  base: string;
  files: Record<string, string>;
}

interface CachedPack {
  contentVersion: string;
  raw: RawPack;
  fetchedAt: number;
}

/** Ánh xạ tên file trong manifest sang khoá của RawPack. */
/** File bản đồ ghi vào `maps[<tên>]` chứ không phải một khoá cố định — nhờ vậy
 *  content pack thêm bản đồ mới không cần core biết trước tên nó. */
const MAP_FILE = /^maps\/(.+)\.json$/;

const FILE_TO_KEY: Record<string, keyof RawPack> = {
  "tiles.json": "tiles",
  "props.json": "props",
  "crops.json": "crops",
  "buildings.json": "buildings",
  "items.json": "items",
  "recipes.json": "recipes",
  "balance.json": "balance",
  "progression.json": "progression",
  "strings.vi.json": "strings",
  "weather.json": "weather",
  "seasons.json": "seasons",
  "actors.json": "actors",
};

export interface OtaOptions {
  /** Gốc URL nơi host content pack, ví dụ "https://cdn.example.com".
   *  Để trống/undefined = tắt hẳn OTA. */
  contentUrl?: string | undefined;
  /** Bỏ cuộc sau bao nhiêu ms — không để người chơi chờ mạng. */
  timeoutMs?: number;
}

export type OtaResult =
  | { status: "disabled" }
  | { status: "up-to-date"; contentVersion: string }
  | { status: "incompatible"; contentVersion: string; requiresCore: string }
  | { status: "invalid"; problems: string[] }
  | { status: "error"; reason: string }
  | { status: "ready"; contentVersion: string };

/* -------------------------------------------------------------------------- */

async function fetchJson(url: string, timeoutMs: number): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Hỏi thăm bản nội dung mới. Chạy ngầm, KHÔNG await ở đường khởi động.
 * Thành công thì pack được cache lại và áp dụng ở lần mở game sau.
 */
export async function checkForUpdate(
  currentVersion: string,
  opts: OtaOptions = {},
): Promise<OtaResult> {
  const base = opts.contentUrl?.replace(/\/$/, "");
  if (!base) return { status: "disabled" };
  const timeoutMs = opts.timeoutMs ?? 8000;

  try {
    const latest = (await fetchJson(`${base}/content/latest.json`, timeoutMs)) as {
      contentVersion?: string;
      manifest?: string;
    };
    if (!latest?.contentVersion || !latest.manifest)
      return { status: "error", reason: "latest.json sai định dạng" };

    if (!isNewer(latest.contentVersion, currentVersion))
      return { status: "up-to-date", contentVersion: currentVersion };

    const manifest = (await fetchJson(
      `${base}${latest.manifest}`,
      timeoutMs,
    )) as PublishedManifest;

    // ---- CỔNG TƯƠNG THÍCH: kiểm TRƯỚC khi tải phần còn lại ----
    if (!satisfies(CORE_VERSION, manifest.requiresCore))
      return {
        status: "incompatible",
        contentVersion: manifest.contentVersion,
        requiresCore: manifest.requiresCore,
      };

    // Bắt đầu từ pack đóng kèm rồi ghi đè từng file — pack mới thiếu file nào
    // thì file đó vẫn dùng bản đóng kèm, thay vì thủng lỗ.
    const raw: RawPack = { ...bundledRawPack(), manifest };
    for (const rel of Object.keys(manifest.files)) {
      const m = MAP_FILE.exec(rel);
      if (m) {
        raw.maps = { ...raw.maps, [m[1]!]: await fetchJson(`${base}${manifest.base}${rel}`, timeoutMs) };
        continue;
      }
      const key = FILE_TO_KEY[rel];
      if (!key) continue; // file lạ trong manifest — bỏ qua, không đoán mò
      raw[key] = await fetchJson(`${base}${manifest.base}${rel}`, timeoutMs) as never;
    }

    // ---- validate trước khi cho chạm vào bất cứ thứ gì ----
    const problems = validatePack(raw);
    if (problems.length) return { status: "invalid", problems };

    const cached: CachedPack = {
      contentVersion: manifest.contentVersion,
      raw,
      fetchedAt: Date.now(),
    };
    await kvSetContent(KEY_PACK, cached);
    return { status: "ready", contentVersion: manifest.contentVersion };
  } catch (e) {
    return { status: "error", reason: e instanceof Error ? e.message : String(e) };
  }
}

export interface ResolvedContent {
  content: Content;
  source: "bundled" | "ota";
  /** cảnh báo để hiện toast, ví dụ pack cache đã hỏng nên phải quay về bản đóng kèm */
  warnings: string[];
}

/**
 * Nội dung dùng cho phiên chơi này: ưu tiên pack OTA đã cache, ngược lại dùng
 * pack đóng kèm. Cache được kiểm lại TỪ ĐẦU mỗi lần khởi động — vì core có thể
 * đã nâng cấp kể từ lúc tải pack về, và một pack từng hợp lệ vẫn có thể trở
 * nên không tương thích.
 */
export async function resolveContent(): Promise<ResolvedContent> {
  const warnings: string[] = [];
  try {
    const cached = await kvGetContent<CachedPack>(KEY_PACK);
    if (cached?.raw) {
      const m = cached.raw.manifest as { requiresCore?: string } | undefined;
      if (!m?.requiresCore || !satisfies(CORE_VERSION, m.requiresCore)) {
        warnings.push(
          `Nội dung ${cached.contentVersion} không hợp với core ${CORE_VERSION} — đã quay về bản đóng kèm.`,
        );
        await kvDeleteContent(KEY_PACK);
      } else {
        const problems = validatePack(cached.raw);
        if (problems.length) {
          warnings.push("Nội dung đã tải về bị hỏng — đã quay về bản đóng kèm.");
          await kvDeleteContent(KEY_PACK);
        } else {
          return { content: buildContent(cached.raw), source: "ota", warnings };
        }
      }
    }
  } catch {
    warnings.push("Không đọc được nội dung đã tải — dùng bản đóng kèm.");
  }
  return { content: bundledContent(), source: "bundled", warnings };
}

/** Đường lui: xoá pack đã tải, lần khởi động sau quay về bản đóng kèm. */
export async function revertToBundled(): Promise<void> {
  await kvDeleteContent(KEY_PACK);
}

/** Có pack OTA đang chờ áp dụng không (để hiện nút "Khởi động lại để cập nhật"). */
export async function pendingContentVersion(): Promise<string | null> {
  const cached = await kvGetContent<CachedPack>(KEY_PACK);
  return cached?.contentVersion ?? null;
}
