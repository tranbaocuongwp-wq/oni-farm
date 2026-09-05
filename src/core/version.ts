/** Phiên bản CORE (làn chậm). Content pack chỉ được nhận nếu `requiresCore`
 *  của nó khớp semver với con số này — xem src/core/content/ota.ts. */
export const CORE_VERSION = "1.27.0";

/** Phiên bản ĐỊNH DẠNG SAVE. Tăng khi cấu trúc GameState đổi, và thêm bước
 *  migration tương ứng trong src/core/save.ts. */
export const SAVE_VERSION = 9;
