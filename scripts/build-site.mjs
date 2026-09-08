/* ============================================================================
   BUILD-SITE — sinh TOÀN BỘ trang tĩnh: vỏ trang, các trang giới thiệu, và
   thư viện tra cứu.

   Hai lý do, và lý do thứ hai mới là lý do thật:

   1. THƯ VIỆN quá lớn để viết tay. 61 cây, 10 loài, 7 công cụ, 6 công trình —
      viết tay nghĩa là 84 khối HTML phải tự sửa mỗi lần chỉnh một con số cân
      bằng, và chỉ cần quên một chỗ là trang tài liệu nói sai giá. Ở đây trang
      đọc ĐÚNG file mà game đọc: chỉnh giá cà rốt trong crops.json thì trang cà
      rốt đổi theo ngay lần build sau.

   2. VỎ TRANG chỉ được phép có MỘT bản. Trước đây bảy trang giới thiệu tự chép
      lấy `<head>`, nav và chân trang của mình, còn khuôn `page()` ở đây chỉ
      phục vụ bốn trang thư viện — tức mười một bản sao của cùng một cái vỏ.
      Chúng đã trôi khỏi nhau đúng như phải thế: bốn trang không khai một dòng
      `rel="icon"` nào (tab trình duyệt hiện icon mặc định suốt nhiều tháng),
      và trang Tính năng khoe "63 kịch bản kiểm thử" trong khi con số thật đã
      là hơn gấp đôi — ngay trên trang tự nhận "số trên trang không bao giờ
      lệch với số trong game".

      Giờ vỏ nằm ở đúng một chỗ: `page()`. Phần CHỮ của mỗi trang là một mẩu
      HTML rời trong `src/site/noi-dung/`, và builder lồng nó vào vỏ. Sửa chữ
      thì mở file HTML (không phải chuỗi trong JS); sửa vỏ thì sửa một chỗ và
      cả site đổi theo.

   3. MỌI CON SỐ trên site đều sinh từ nguồn, không gõ tay. Số cây, số loài, số
      kịch bản kiểm thử, độ dài một ngày, giá, năng lượng — xem `SO_LIEU` bên
      dưới. Một con số gõ tay là một con số sẽ sai, chỉ là chưa biết lúc nào.

   Hình thì `src/site/sprites.ts` lo: HTML chỉ đặt sẵn `<canvas data-sprite>`,
   trình duyệt gọi đúng hàm vẽ của game. Nên tắt JS vẫn đọc được TOÀN BỘ số
   liệu — chỉ mất phần minh hoạ.

   Chạy: npm run site:build   (đã gắn vào `npm run build`)
============================================================================ */

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadContent } from "./lib/load-content.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = resolve(ROOT, "src");
const content = loadContent();

/* ------------------------------------------------------- KHUNG HÌNH NHÂN VẬT

   Cường: "thiếu trang nhân vật". Trang ấy chỉ có nghĩa nếu nó BÀY RA từng tư
   thế, và danh sách tư thế phải đọc từ `atlas.ts` chứ không gõ tay — nếu không,
   đợt sau thêm khung thứ 19 thì trang này im lặng bỏ sót nó.
--------------------------------------------------------------------------- */

const ATLAS_SRC = readFileSync(resolve(SRC, "art/atlas.ts"), "utf8");

const SO_KHUNG_NGUOI = Number(/export const PLAYER_FRAMES = (\d+)/.exec(ATLAS_SRC)?.[1] ?? 0);
if (!SO_KHUNG_NGUOI) throw new Error("không đọc được PLAYER_FRAMES từ src/art/atlas.ts");

/* Khung 0..6 không có hằng PF_ riêng (chúng có từ trước khi bảng này ra đời),
   nên tả ở đây; từ 7 trở đi lấy thẳng chú thích trên đầu mỗi hằng PF_. */
const KHUNG_NGUOI = (() => {
  const ra = [
    ["Đứng yên", "Tư thế nghỉ, không làm gì."],
    ["Bước 1", "Khung đi thứ nhất."],
    ["Bước 2", "Khung đi thứ hai — chân kia."],
    ["Bước 3", "Khung đi thứ ba."],
    ["Bước 4", "Khung đi thứ tư, khép lại một nhịp chân."],
    ["Ra tay", "Khung lúc công cụ chạm đất: cày, tưới, chặt, đập."],
    ["Giơ lên", "Vung công cụ lên trước khi bổ xuống."],
  ].map(([ten, mo], i) => ({ i, ten, mo }));
  for (const m of ATLAS_SRC.matchAll(/\/\*\* ([^*]+?) \*\/\s*export const PF_(\w+) = (\d+);/g)) {
    const cut = m[1].indexOf(":");
    const ten = (cut < 0 ? m[1] : m[1].slice(0, cut)).trim().replace(/\.$/, "");
    const mo = cut < 0 ? "" : m[1].slice(cut + 1).trim();
    ra.push({ i: Number(m[3]), ten: ten.charAt(0) + ten.slice(1).toLowerCase(), mo });
  }
  ra.sort((a, b) => a.i - b.i);
  if (ra.length !== SO_KHUNG_NGUOI || ra.some((k, i) => k.i !== i)) {
    throw new Error(
      `atlas.ts có ${SO_KHUNG_NGUOI} khung người nhưng trang Nhân vật tả được ${ra.length} ` +
        "(chỉ số: " + ra.map((k) => k.i).join(",") + ") — thêm chú thích /** ... */ cho hằng PF_ mới",
    );
  }
  return ra;
})();

/* ------------------------------------------------------------------ tiện ích */

const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** Nhãn tiền: người Việt đọc "1.240" chứ không phải "1240". */
const tien = (n) => Number(n ?? 0).toLocaleString("vi-VN");

/** "1 ngày" / "3 ngày" — số ít số nhiều tiếng Việt giống nhau, nhưng viết hàm
 *  để chỗ gọi đọc như câu tiếng Việt chứ không phải phép nối chuỗi. */
const ngay = (n) => `${n} ngày`;

/**
 * Ô chờ sprite. `src/site/sprites.ts` sẽ vẽ vào lúc trang chạy.
 *
 * Khoá được KIỂM ngay tại đây. Một khoá sai không báo lỗi gì cả — nó chỉ vẽ ra
 * một ô trống, và một ô trống giữa hàng chục ô có hình thì không ai nhận ra là
 * thiếu. Kiểm lúc sinh thì sai một khoá là build đỏ, kèm tên khoá.
 */
/**
 * Một hình sprite, LUÔN nằm trong một khối VUÔNG đúng `size`.
 *
 * Cường: "tất cả các ảnh phải đưa vô khối, kéo nó nằm trong hình vuông để nó
 * bằng nhau, hiển thị cho nó thân thiện".
 *
 * Vì sao cần: sprite trong game không cùng tỉ lệ — cây cao 16×24, con vật
 * 16×16, món đồ 16×16, và bộ đo còn cắt bỏ viền trong suốt nên hai cây cạnh
 * nhau ra hai bề ngang khác nhau. Thả thẳng vào một dòng thì mỗi ô một cỡ, và
 * cả lưới thành răng cưa — đúng như ảnh Cường gửi. Bọc trong một khối vuông cố
 * định thì hình to nhỏ thế nào cũng chiếm đúng ngần ấy chỗ, và mọi thứ thẳng
 * hàng.
 */
function cx(key, size = 48, alt = "") {
  kiemKhoaSprite(key);
  return (
    `<span class="ic" style="--s:${size}px">` +
    `<canvas class="sp" data-sprite="${esc(key)}" data-size="${size}" role="img" aria-label="${esc(alt)}"></canvas>` +
    `</span>`
  );
}

/* ---------------------------------------------------------------------------
   TIỀN — Cường: "không được xài đơn vị tiền tệ, phải xài biểu tượng đồng xu".

   Dùng SVG nội tuyến chứ không phải một canvas sprite nữa: một trang cây có 61
   dòng × ba cột tiền là 183 hình, mà 183 canvas thì phải chờ JS dựng atlas mới
   hiện. Đồng xu là một hình tròn hai màu — nó không cần cả bộ atlas, và vẽ bằng
   SVG thì nó hiện ngay cả khi JS chưa chạy hoặc bị tắt.

   Một `<symbol>` khai một lần ở đầu body, mọi chỗ còn lại chỉ `<use>`.
--------------------------------------------------------------------------- */
const XU_SYMBOL = `<svg class="xu-def" aria-hidden="true"><symbol id="xu" viewBox="0 0 16 16">` +
  `<circle cx="8" cy="8" r="7" fill="#c9931a"/>` +
  `<circle cx="8" cy="8" r="5.6" fill="#ffd84a"/>` +
  `<circle cx="8" cy="8" r="3.2" fill="#e8b52c"/>` +
  `<path d="M4.6 5.2a4.8 4.8 0 0 1 3-2" stroke="#fff3bf" stroke-width="1.2" fill="none" stroke-linecap="round"/>` +
  `</symbol></svg>`;

/** `1.234` + đồng xu. Số in ĐẬM vì đó là thứ người ta tới đây để đọc.

   Bọc trong một `<span class="gia">` vì nếu không, trên màn 320px đồng xu rơi
   xuống dòng dưới tách khỏi con số của nó — "42" một dòng, hình xu một dòng —
   và bảng giá đọc thành hai cột lệch nhau. */
function xu(n) {
  return `<span class="gia"><b class="tien">${tien(n)}</b><svg class="xu" aria-label="đồng" role="img"><use href="#xu"/></svg></span>`;
}

const HUONG_NV = ["down", "up", "left", "right"];

/** Soát phần đuôi "right:5" của khoá nhân vật. Khớp `docTuThe` trong sprites.ts. */
function kiemTuThe(duoi, hong) {
  const phan = duoi.split(":").filter(Boolean);
  if (!phan.length) return;
  if (!HUONG_NV.includes(phan[0])) return hong(`hướng "${phan[0]}" không có — chỉ ${HUONG_NV.join(" · ")}`);
  if (phan.length === 1) return;
  const f = Number(phan[1]);
  if (!Number.isInteger(f) || f < 0 || f >= SO_KHUNG_NGUOI)
    return hong(`khung ${phan[1]} nằm ngoài 0..${SO_KHUNG_NGUOI - 1}`);
}

/** Ném lỗi nếu `key` không trỏ tới thứ có thật. Luật khớp `spriteFor`. */
function kiemKhoaSprite(key) {
  const hong = (vi) => {
    throw new Error(`data-sprite="${key}" không vẽ được: ${vi}`);
  };
  /* "player" · "player:right" · "player:right:5" — hướng phải có thật và khung
     phải nằm trong 0..PLAYER_FRAMES-1, nếu không trang Nhân vật sẽ lặng lẽ vẽ
     khung 0 ở mọi ô và không ai nhận ra. */
  if (key === "player" || key.startsWith("player:")) return kiemTuThe(key.slice(7), hong);
  if (key.startsWith("worker:")) {
    const phan = key.slice(7).split(":");
    if (!/^\d+$/.test(phan[0] ?? "")) return hong("bộ đồ người làm phải là một số");
    return kiemTuThe(phan.slice(1).join(":"), hong);
  }
  if (key.startsWith("ui:")) return; // do atlas tự lo
  if (key.startsWith("weather:"))
    return content.weathers[key.slice(8)] ? undefined : hong("không có kiểu thời tiết này");
  const sau = (n) => key.slice(n);
  if (key.startsWith("animal:")) return content.animals[sau(7)] ? undefined : hong("không có loài này");
  if (key.startsWith("vehicle:")) return content.vehicles[sau(8)] ? undefined : hong("không có xe này");
  if (key.startsWith("build:")) return content.buildings[sau(6)] ? undefined : hong("không có công trình này");
  if (key.startsWith("prop:")) return content.props[sau(5)] ? undefined : hong("không có vật thể này");
  if (key.startsWith("tool:")) return content.tools[sau(5)] ? undefined : hong("không có công cụ này");
  if (key.startsWith("seed:")) return content.crops[sau(5)] ? undefined : hong("không có cây này");
  if (key.startsWith("crop:")) {
    const rest = sau(5);
    const cut = rest.lastIndexOf(":");
    const id = cut < 0 ? rest : rest.slice(0, cut);
    const def = content.crops[id];
    if (!def) return hong("không có cây này");
    if (cut < 0) return;
    const i = Number(rest.slice(cut + 1));
    if (!Number.isInteger(i) || i < 0 || i > def.growthDays.length)
      return hong(`giai đoạn ${rest.slice(cut + 1)} nằm ngoài 0..${def.growthDays.length}`);
    return;
  }
  if (key.startsWith("item:")) {
    const r = sau(5);
    if (content.materials[r]) return;
    return hong("không có vật liệu này");
  }
  return hong("không khớp tiền tố nào mà sprites.ts hiểu");
}

/* ---------------------------------------------------------------- số liệu ---

   MỌI con số xuất hiện trên site lấy từ đây, và mọi giá trị ở đây đọc từ
   nguồn thật — content, hoặc chính mã nguồn. Không con số nào được gõ tay vào
   một mẩu HTML.

   Vì sao gắt thế: trang Tính năng từng khoe "63 kịch bản kiểm thử" và con số
   đó đứng yên suốt bảy đợt trong khi bộ test lớn hơn gấp đôi. Không ai nói
   dối cả — chỉ là một con số gõ tay thì không có gì buộc nó phải đúng, còn
   một con số đếm được thì không có cách nào sai.

   Cách dùng trong file nội dung: viết `{{soCay}}`, builder thay lúc build.
   Gõ một khoá không có thật thì build ĐỎ ngay, chứ không lặng lẽ để lại
   `{{soKichBan}}` giữa trang. */

/** Đếm kịch bản trong bộ sim — đọc chính file test, không gõ số. */
function demKichBan() {
  const src = readFileSync(resolve(ROOT, "scripts/sim.mjs"), "utf8");
  return (src.match(/^test\(/gm) ?? []).length + (src.match(/^testAsync\(/gm) ?? []).length;
}

const bal = content.balance;
const gioPhut = (m) => `${Math.floor(m / 60)}:${String(Math.round(m % 60)).padStart(2, "0")}`;

/* PHIÊN BẢN của số liệu trên trang — Cường: "ghi chép tài liệu phiên bản cho
   từng loại trang". Một trang tra cứu mà không nói nó chép từ bản nào thì người
   đọc không có cách nào biết con số đã cũ hay chưa; đây là điều một cái wiki
   game bắt buộc phải có, vì luật chơi đổi theo bản. Đọc thẳng từ mã và từ
   content, nên nó không thể trôi khỏi thứ nó mô tả. */
const PHIEN_BAN = {
  core: (() => {
    const src = readFileSync(resolve(ROOT, "src/core/version.ts"), "utf8");
    return /CORE_VERSION\s*=\s*"([^"]+)"/.exec(src)?.[1] ?? "?";
  })(),
  content: JSON.parse(readFileSync(resolve(ROOT, "src/content/manifest.json"), "utf8")).contentVersion,
};

const SO_LIEU = {
  soCay: content.cropOrder.length,
  soLoai: content.animalOrder.filter((id) => content.animals[id]?.job !== "pest").length,
  soLoaiKeSau: content.animalOrder.length,
  soCongThuc: Object.keys(content.recipes ?? {}).length,
  soCongTrinh: Object.keys(content.buildings ?? {}).length,
  soMua: content.seasonOrder?.length ?? Object.keys(content.seasons ?? {}).length,
  soThoiTiet: Object.keys(content.weathers ?? {}).length,
  soNac: (content.stages ?? []).length,
  soMucTieu: (content.goals ?? []).length,
  soKichBan: demKichBan(),
  gioDay: gioPhut(bal.dayStartMinutes),
  gioToi: gioPhut(bal.daylightEndMinutes),
  gioNgat: gioPhut(bal.dayEndMinutes % 1440),
  phutMoiNgayThat: Math.round(((bal.dayEndMinutes - bal.dayStartMinutes) / 10) * bal.realSecondsPerGameTenMinutes / 60),
  tienDau: tien(bal.startMoney),
  nangLuong: bal.energyMax,
  oBalo: bal.inventorySlots,
  oHotbar: bal.hotbarSlots,
  ngayMoiMua: content.daysPerSeason,
  thueNguoi: tien(content.workers?.hireFee ?? 0),
  luongNguoi: tien(content.workers?.wage ?? 0),
  ngayTraLuong: content.workers?.wageEveryDays ?? 0,
  get bangCayMau() {
    return bangCayMau();
  },
  get bangCongTrinh() {
    return bangCongTrinh();
  },
  get bangKhaiThac() {
    return bangKhaiThac();
  },
  get theCheTao() {
    return theCheTao();
  },
};

/* ---- hai bảng của trang Tính năng, sinh từ content ------------------------

   Trước đây chúng là HTML gõ tay, và cả hai đều đã sai theo kiểu khó thấy:
   bảng công trình ghi vòi tưới "tự tưới 4 ô kề bên", trong khi `waterRadius: 1`
   tưới cả khối 3×3 — tức TÁM ô quanh nó, gấp đôi. Con số giá thì tình cờ vẫn
   đúng, nhưng "tình cờ vẫn đúng" không phải một tính chất đáng dựa vào. */

/** Ba cây LÀM VÍ DỤ, chọn bằng dữ liệu chứ không bằng trí nhớ. */
function bangCayMau() {
  const list = content.cropOrder.map((id) => content.crops[id]).filter(Boolean);
  const nhanhNhat = list.reduce((a, b) => (tongNgay(b) < tongNgay(a) ? b : a));
  const mocLai = list.filter((c) => c.regrowDays > 0).sort((a, b) => tongNgay(a) - tongNgay(b))[0];
  const datNhat = list.reduce((a, b) => (b.sellPrice > a.sellPrice ? b : a));
  const ghiChu = {
    [nhanhNhat.id]: "Nhanh nhất — cây khởi động, vòng quay ngắn",
    [mocLai?.id]: `Thu xong mọc lại sau ${ngay(mocLai?.regrowDays ?? 0)} — gieo một lần, hái mãi`,
    [datNhat.id]: "Bán đắt nhất — đầu tư dài, lãi lớn",
  };
  const chon = [...new Map([nhanhNhat, mocLai, datNhat].filter(Boolean).map((c) => [c.id, c])).values()];
  return (
    `<div class="table-wrap"><table>
          <tr><th>Cây</th><th>Thời gian</th><th>Hạt</th><th>Bán</th><th>Ghi chú</th></tr>` +
    chon
      .map(
        (c) =>
          `<tr><td>${nhan(`crop:${c.id}`, 26)}</td><td>${ngay(tongNgay(c))}</td><td>${xu(c.seedPrice)}</td><td>${xu(c.sellPrice)}</td><td>${esc(ghiChu[c.id] ?? "")}</td></tr>`,
      )
      .join("\n          ") +
    `\n        </table></div>`
  );
}

/** Mọi công trình mua được, kèm tác dụng ĐỌC TỪ `effects`. */
function bangCongTrinh() {
  const rows = content.buildingOrder
    .map((id) => content.buildings[id])
    .filter((b) => b && b.price > 0)
    .map((b) => {
      const e = b.effects ?? {};
      const y = [];
      if (e.waterRadius > 0) {
        const canh = e.waterRadius * 2 + 1;
        y.push(`Mỗi sáng tự tưới cả khối ${canh}×${canh} quanh nó — ${canh * canh - 1} ô kề`);
      }
      if (e.autoWet) y.push("Ô luôn giữ ẩm, không phải tưới");
      if (e.allSeason) y.push("Trồng được quanh năm, không lo trái mùa");
      if (e.speedMul) y.push(`Đi nhanh hơn ${Math.round((e.speedMul - 1) * 100)}%`);
      return `<tr><td><b>${esc(b.name)}</b></td><td>${xu(b.price)}${b.kind === "floor" ? "/ô" : ""}</td><td>${y.join(" · ") || "—"}</td></tr>`;
    });
  return (
    `<div class="table-wrap"><table>
          <tr><th>Công trình</th><th>Giá</th><th>Tác dụng</th></tr>` +
    rows.join("\n          ") +
    `\n        </table></div>`
  );
}

/** Địa hình khai thác được — số nhát và sản lượng đọc từ `props`. */
function bangKhaiThac() {
  const TEN_CONG_CU = { CHOP: "Rìu", MINE: "Cuốc chim", TILL: "Cuốc" };
  const rows = (content.propOrder ?? Object.keys(content.props))
    .map((id) => content.props[id])
    .filter((p) => p && ((p.drops ?? []).length > 0 || p.interact === "REFILL"))
    .map((p) => {
      const can =
        p.interact === "REFILL"
          ? "Đứng cạnh rồi bấm"
          : `${TEN_CONG_CU[p.tool] ?? "Tay không"}${p.hits > 1 ? ` · ${p.hits} nhát` : ""}`;
      const ra = p.interact === "REFILL"
        ? "Đầy bình tưới"
        : (p.drops ?? [])
            .map((d) => `${d.min === d.max ? d.min : `${d.min}–${d.max}`} ${esc(itemName(d.id)).toLowerCase()}`)
            .join(", ") + (p.becomes ? `, để lại ${esc(content.props[p.becomes]?.name ?? p.becomes).toLowerCase()}` : "");
      return `<tr><td><b>${esc(p.name)}</b></td><td>${can}</td><td>${ra}</td></tr>`;
    });
  return (
    `<div class="table-wrap"><table>
          <tr><th>Thứ</th><th>Cần gì</th><th>Ra gì</th></tr>` +
    rows.join("\n          ") +
    `\n        </table></div>`
  );
}

/** Công thức chế ra CÔNG CỤ — nguyên liệu đọc từ `recipes`. */
function theCheTao() {
  return Object.values(content.recipes)
    .filter((r) => r && r.out?.id?.startsWith("tool:"))
    .map((r) => {
      const t = content.tools[r.out.id.slice(5)];
      const them = t?.capacity ? ` — chứa ${t.capacity} nước` : "";
      return `<div class="card"><h3>${esc(r.name)}</h3><p>${r.in
        .map((x) => `${x.n} ${esc(itemName(x.id)).toLowerCase()}`)
        .join(" + ")}${them}</p></div>`;
    })
    .join("\n          ");
}

/** Thay `{{khoa}}` trong một mẩu nội dung. Khoá lạ → build ĐỎ. */
function thaySoLieu(html, ten) {
  return html.replace(/\{\{(\w+)\}\}/g, (_, k) => {
    if (!(k in SO_LIEU)) {
      throw new Error(`src/site/noi-dung/${ten}.html dùng {{${k}}} — không có khoá đó trong SO_LIEU`);
    }
    return String(SO_LIEU[k]);
  });
}

/** Đọc phần THÂN của một trang. Chữ nằm trong HTML, không nằm trong chuỗi JS. */
function noiDung(ten) {
  const raw = readFileSync(resolve(SRC, "site/noi-dung", `${ten}.html`), "utf8");
  return thaySoLieu(raw, ten);
}

/* ------------------------------------------------------------------- khung */

/* ---------------------------------------------------------------------------
   TRANG TÀI LIỆU KIỂU WIKI.

   Cường: "loại bỏ các trang tĩnh khác, chỉ để lại [game] và docs; trình bày
   trang tài liệu này giống như wiki — lối chơi, các vật, chi tiết vật. Tác giả
   / story: TRẦN CƯỜNG".

   Bốn trang giới thiệu cũ (Tính năng · Hướng dẫn · Cách game vận hành · Cài về
   máy) là trang QUẢNG CÁO: chúng nói về game cho người chưa chơi. Một cái wiki
   thì nói về THỨ TRONG GAME cho người đang chơi — mỗi cây, mỗi con, mỗi món đồ
   một trang tra được. Hai thể loại ấy không trộn vào nhau được, nên bốn trang
   kia đi hẳn.

   Nav xếp theo NHÓM như thanh bên của một wiki thật, không phải một hàng ngang:
   người tra cứu nhảy giữa các mục cùng loại, chứ không đọc tuần tự từ trái sang
   phải như trang giới thiệu.
--------------------------------------------------------------------------- */

const NAV_NHOM = [
  ["Bắt đầu", [
    ["/", "Trang chính"],
    ["/loi-choi/", "Lối chơi"],
  ]],
  ["Tra cứu", [
    ["/cay-trong/", "Cây trồng"],
    ["/vat-nuoi/", "Vật nuôi"],
    ["/vat-pham/", "Vật phẩm"],
    ["/cong-trinh/", "Công trình"],
    ["/dia-hinh/", "Địa hình"],
    ["/thoi-tiet/", "Thời tiết"],
    ["/nhan-vat/", "Nhân vật"],
    ["/hanh-dong/", "Hành động"],
    ["/bieu-tuong/", "Biểu tượng"],
  ]],
  ["Về dự án", [
    ["/tac-gia/", "Tác giả"],
    ["/privacy/", "Quyền riêng tư"],
  ]],
];

/** Danh sách phẳng — dùng cho phép soát "mục nào trong nav cũng có trang thật". */
const NAV = NAV_NHOM.flatMap(([, ds]) => ds);

/**
 * Vỏ trang — MỘT chỗ duy nhất quyết định nav, thẻ meta, chân trang.
 *
 * Các trang viết tay cũng dùng đúng khuôn này (xem `writeStaticNav` bên dưới
 * đồng bộ lại nav cho chúng), nên năm trang không bao giờ lệch nhau một mục.
 */
/**
 * Vỏ trang WIKI — MỘT chỗ duy nhất quyết định thanh bên, thẻ meta, chân trang.
 *
 * `hop` là hộp thông tin bên phải (infobox) — thứ làm một trang wiki ra wiki:
 * đọc cái hộp là biết ngay các con số, không phải đọc hết bài. `muc` là mục lục
 * dựng từ chính các tiêu đề của bài.
 */
function page({ title, desc, url, h1, tag, body, sprites = true, hop = "", muc = [], dan = "" }) {
  const nav = NAV_NHOM.map(
    ([ten, ds]) =>
      `<div class="wgrp"><b>${ten}</b>\n          ${ds
        .map(
          ([href, text]) =>
            `<a href="${href}"${href === url ? ' aria-current="page"' : ""}>${text}</a>`,
        )
        .join("\n          ")}</div>`,
  ).join("\n        ");
  const mucLuc = muc.length
    ? `      <nav class="wtoc" aria-label="Mục lục">
        <b>Mục lục</b>
        <ol>${muc.map(([id, ten]) => `<li><a href="#${id}">${esc(ten)}</a></li>`).join("")}</ol>
      </nav>\n`
    : "";
  return `<!doctype html>
<html lang="vi">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#f6f6f4" media="(prefers-color-scheme: light)" />
    <meta name="theme-color" content="#1b1b1d" media="(prefers-color-scheme: dark)" />
    <meta name="description" content="${esc(desc)}" />
    <meta name="author" content="Trần Cường" />
    <meta property="og:title" content="${esc(title)}" />
    <meta property="og:description" content="${esc(desc)}" />
    <meta property="og:type" content="article" />
    <title>${esc(title)}</title>
    <link rel="stylesheet" href="/site/site.css" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <link rel="icon" href="/favicon-32.png" sizes="32x32" />
    <link rel="apple-touch-icon" href="/icon-180.png" />
${sprites ? '    <script type="module" src="/site/sprites.ts"></script>\n' : ""}  </head>
  <body class="wiki">
    ${XU_SYMBOL}
    <header class="wtop">
      <a class="wlogo" href="/"><img src="/favicon.svg" alt="" width="24" height="24" /><span>ONI<b>FARM</b> WIKI</span></a>
      <a class="wplay" href="/farm/">Chơi ngay →</a>
    </header>
    <div class="wgrid">
      <aside class="wside">
        ${nav}
      </aside>
      <main class="wmain">
        <h1 class="wh1">${h1}</h1>
        <p class="wfrom">Từ OniFarm Wiki${tag ? ` · ${tag}` : ""}</p>
        <hr class="wrule" />
${hop}${dan}${mucLuc}${body}
        <div class="wcredit">
          <b>Tác giả · story:</b> TRẦN CƯỜNG · <a href="/tac-gia/">trang tác giả</a><br />
          <b>Số liệu theo bản:</b> nội dung <b>${PHIEN_BAN.content}</b> · lõi <b>${PHIEN_BAN.core}</b>
        </div>
      </main>
    </div>
    <footer class="wfoot">
      <div class="wrap">
        OniFarm · game offline, save nằm trên máy bạn ·
        <a href="/">Trang chính</a> ·
        <a href="/privacy/">Quyền riêng tư</a> ·
        Tác giả: TRẦN CƯỜNG
      </div>
    </footer>
  </body>
</html>
`;
}

function write(rel, html) {
  kiemBangCuonDuoc(rel, html);
  const out = resolve(SRC, rel, "index.html");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, html);
  return out;
}

/* Bảng rộng hơn màn 320px mà KHÔNG nằm trong `.table-wrap` thì nó đẩy lệch cả
   trang: người đọc trên điện thoại phải vuốt ngang cả bài để xem nốt một cột,
   và tiêu đề trôi mất khỏi mép trái. Trang Vật phẩm đã mắc đúng lỗi này và
   build vẫn xanh, vì không có gì soát — nên soát ở đây, một lần cho mọi trang,
   thay vì trông vào việc nhớ gõ `<div class="table-wrap">` mỗi lần thêm bảng. */
function kiemBangCuonDuoc(rel, html) {
  for (const m of html.matchAll(/<table\b/g)) {
    const truoc = html.slice(Math.max(0, m.index - 60), m.index);
    if (!truoc.includes('class="table-wrap"')) {
      throw new Error(
        `trang /${rel}/ có <table> không nằm trong <div class="table-wrap"> — ` +
          "bảng rộng sẽ đẩy lệch cả trang trên màn hình nhỏ",
      );
    }
  }
}

/* ---------------------------------------------------------------------------
   HÌNH và LIÊN KẾT NỘI BỘ cho mọi thứ được nhắc tên.

   Cường: "cái nào sử dụng được hình minh hoạ, hoặc là link nội bộ trong bài
   viết, thì phải gắn vào hết — ví dụ nói về cỏ thì phải có cái hình kế bên".

   Đúng, và trước đó wiki này chỉ làm được một nửa: bảng nào cũng có hình,
   nhưng CHỮ trong bài thì trơ trọi. Một dòng viết "Bò ăn Rơm, Cỏ khô, Cám tổng
   hợp" bắt người đọc phải tự đi tìm ba món ấy là gì và mua ở đâu — trong khi
   wiki đang có sẵn ba trang nói đúng chuyện đó.

   Từ đây mọi tên đi qua `nhan()`: hình sprite + tên + liên kết tới trang chi
   tiết của chính nó. Một hàm, nên không có chỗ nào để quên.
--------------------------------------------------------------------------- */

/** Khoá sprite → đường dẫn trang chi tiết. `null` = chưa có trang riêng. */
function duongDan(key) {
  const i = key.indexOf(":");
  if (i < 0) return null;
  const loai = key.slice(0, i);
  const id = key.slice(i + 1);
  if (loai === "crop") return content.crops[id] ? `/cay-trong/${id}/` : null;
  if (loai === "animal") return content.animals[id] ? `/vat-nuoi/${id}/` : null;
  if (loai === "item") return content.materials[id] ? `/vat-pham/vp-${id}/` : null;
  if (loai === "tool") return content.tools[id] ? `/vat-pham/vp-tool-${id}/` : null;
  if (loai === "build") return content.buildings[id] ? `/cong-trinh/${id}/` : null;
  if (loai === "prop") return content.props[id] ? `/dia-hinh/${id}/` : null;
  if (loai === "seed") return content.crops[id] ? `/cay-trong/${id}/` : null;
  return null;
}

/**
 * HÌNH + TÊN + LIÊN KẾT của một thứ trong game.
 *
 * `co` là cỡ hình; 20 vừa đúng một dòng chữ 16px nên nó nằm gọn giữa câu mà
 * không đẩy dòng ra. Thứ chưa có trang riêng thì vẫn có hình — thiếu trang là
 * lý do để không liên kết, không phải lý do để bỏ luôn hình minh hoạ.
 */
function nhan(key, co = 26) {
  const ten = itemName(key);
  const hinh = cx(key, co, ten);
  const d = duongDan(key);
  const than = `${hinh}<span>${esc(ten)}</span>`;
  return d
    ? `<a class="ilk" href="${d}">${than}</a>`
    : `<span class="ilk">${than}</span>`;
}

/** Danh sách khoá → chuỗi nhãn ngăn bằng dấu chấm giữa. */
const nhanDs = (keys, co = 26) => keys.map((k) => nhan(k, co)).join(" · ");

/* ------------------------------------------------------------- cây trồng */

const seasonName = (id) => content.seasons[id]?.name ?? id;

/** Tổng số ngày từ lúc gieo tới lúc chín. */
const tongNgay = (c) => c.growthDays.reduce((a, b) => a + b, 0);

/**
 * Lãi mỗi vụ, tính theo mức thu THẤP NHẤT.
 *
 * Cố ý lấy `yieldMin` chứ không lấy trung bình: con số trên trang phải là con
 * số người chơi CHẮC CHẮN nhận được. Hứa mức trung bình rồi người ta thu được
 * ít hơn là mất lòng tin, mà lòng tin thì không lấy lại bằng một dòng ghi chú.
 */
const lai = (c) => c.sellPrice * c.yieldMin - c.seedPrice;

function cropCard(c) {
  const stages = c.growthDays.map((_, i) => cx(`crop:${c.id}:${i}`, 44, ""));
  stages.push(cx(`crop:${c.id}`, 52, `${c.name} chín`));
  const mua = c.seasons.map((s) => `<span class="chip">${esc(seasonName(s))}</span>`).join("");
  const l = lai(c);
  return `        <article class="ent" id="cay-${esc(c.id)}">
          <div class="ent-art">${cx(`crop:${c.id}`, 88, c.name)}</div>
          <div class="ent-main">
            <h3><a href="/cay-trong/${c.id}/">${esc(c.name)}</a></h3>
            <p class="ent-sub">Hạt giống: ${esc(c.seedName)} · ${xu(c.seedPrice)} một gói</p>
            <div class="chips">${mua}${c.regrowDays ? '<span class="chip alt">Thu nhiều lần</span>' : ""}</div>
            <dl class="facts">
              <div><dt>Trồng bao lâu</dt><dd>${ngay(tongNgay(c))}</dd></div>
              <div><dt>Mỗi lần thu</dt><dd>${c.yieldMin === c.yieldMax ? c.yieldMin : `${c.yieldMin}–${c.yieldMax}`} quả</dd></div>
              <div><dt>Bán được</dt><dd>${xu(c.sellPrice)} một quả</dd></div>
              <div><dt>Lãi chắc chắn</dt><dd class="${l >= 0 ? "up" : "down"}">${l >= 0 ? "+" : ""}${xu(l)}</dd></div>
              ${c.regrowDays ? `<div><dt>Thu lại sau</dt><dd>${ngay(c.regrowDays)}</dd></div>` : ""}
            </dl>
            <div class="grow">
              <span class="grow-lbl">Cây lớn dần:</span>
              ${stages.join("")}
            </div>
          </div>
        </article>`;
}

/**
 * Lãi MỖI NGÀY ở nhịp ổn định — con số trả lời đúng câu người chơi hỏi.
 *
 * "Lãi 520đ" tự nó không nói gì: 520đ sau năm ngày khác hẳn 520đ sau mười hai
 * ngày, mà trên cùng một mảnh đất thì thứ khan hiếm là NGÀY chứ không phải ô
 * đất. Nên chia cho số ngày.
 *
 * Hai công thức, vì hai loại cây khác nhau thật sự:
 *   · cây thu MỘT lần → (tiền bán − tiền hạt) / tổng số ngày lớn;
 *   · cây thu NHIỀU lần → tiền bán / nhịp thu lại, KHÔNG trừ tiền hạt.
 *
 * Chỗ thứ hai là chỗ dễ sai và tôi đã sai một lần: trừ tiền hạt ở mỗi lứa thì
 * cây thu nhiều lần bị tính thiệt, trong khi cả điểm mạnh của nó là gieo một
 * lần rồi hái mãi. Vụ ĐẦU vẫn tốn hạt và vẫn mất trọn `tongNgay` ngày — ghi rõ
 * dưới bảng, chứ không giấu vào một con số trung bình.
 */
function laiMoiNgay(c) {
  if (c.regrowDays > 0) return (c.sellPrice * c.yieldMin) / c.regrowDays;
  const n = tongNgay(c);
  return n > 0 ? lai(c) / n : 0;
}

/** Một hàng trong bảng so sánh. */
function cropRow(c) {
  const l = lai(c);
  const ld = laiMoiNgay(c);
  return `<tr>
    <th scope="row">${nhan(`crop:${c.id}`, 26)}</th>
    <td>${c.seasons.map((x) => esc(seasonName(x))).join(", ")}</td>
    <td class="num">${ngay(tongNgay(c))}</td>
    <td class="num">${xu(c.seedPrice)}</td>
    <td class="num">${xu(c.sellPrice)}</td>
    <td class="num ${l >= 0 ? "up" : "down"}">${l >= 0 ? "+" : ""}${xu(l)}</td>
    <td class="num ${ld >= 0 ? "up" : "down"}"><b>${ld >= 0 ? "+" : ""}${xu(Math.round(ld))}</b></td>
  </tr>`;
}

function cropsPage() {
  const list = content.cropOrder.map((id) => content.crops[id]).filter(Boolean);

  /* MỘT thẻ cho MỘT cây.
     Bản cũ nhóm theo mùa rồi vẽ trọn cái thẻ trong TỪNG mùa cây đó hợp — hành
     là bốn mùa nên hành hiện bốn lần. Ra 120 thẻ cho 61 cây, trang nặng 174 KB,
     và tệ hơn cả: bốn thẻ cùng mang `id="cay-scallion"`, tức HTML sai và mọi
     liên kết `#cay-scallion` trở thành mơ hồ. Giờ mùa chỉ còn là một BẢNG MỤC
     trỏ tới thẻ duy nhất của cây đó. */
  const theoMua = content.seasonOrder.map((s) => ({
    id: s,
    name: seasonName(s),
    cay: list.filter((c) => c.seasons.includes(s)),
  }));

  const muc = theoMua
    .map((m) => `<a class="jump" href="#mua-${m.id}">${esc(m.name)} <b>${m.cay.length}</b></a>`)
    .join("") + `<a class="jump" href="#bang-lai">Lãi nhất</a>`;

  const mucMua = theoMua
    .map(
      (m) => `        <div class="mua-muc" id="mua-${m.id}">
          <h3>${esc(m.name)} <b>${m.cay.length}</b></h3>
          <div class="chips">
            ${m.cay.map((c) => `<a class="chip" href="/cay-trong/${c.id}/">${cx(`crop:${c.id}`, 40, "")}${esc(c.name)}</a>`).join("")}
          </div>
        </div>`,
    )
    .join("\n");

  /* Bảng so sánh, sắp theo LÃI MỖI NGÀY. Cây thu nhiều lần lên đầu là đúng —
     đó chính là điều làm chúng đáng trồng, và nhìn bảng là thấy ngay. */
  const bang = list
    .slice()
    .sort((a, b) => laiMoiNgay(b) - laiMoiNgay(a) || a.name.localeCompare(b.name, "vi"))
    .map(cropRow)
    .join("\n");

  return page({
    title: "Cây trồng — OniFarm Wiki",
    desc: `Chi tiết ${list.length} loại cây trong OniFarm: trồng mấy ngày, thu được bao nhiêu, bán được bao nhiêu, lãi mỗi ngày, hợp mùa nào.`,
    url: "/cay-trong/",
    h1: "Cây trồng",
    tag: `Toàn bộ ${list.length} loại cây, kèm số ngày lớn, sản lượng và lãi mỗi ngày. Số lấy thẳng từ game nên không bao giờ lệch.`,
    wide: true,
    body: `    <section class="jump-bar"><div class="wrap"><div class="jumps">${muc}</div></div></section>

    <section>
      <div class="wrap">
        <h2>Mùa nào trồng được gì</h2>
        <p class="lead">Gieo trái mùa thì <b>không gieo được</b> — và cửa hàng cũng không bày bán hạt trái mùa, nên không có cách nào lỡ mua nhầm. Sàn <b>nhà kính</b> là ngoại lệ duy nhất: trên đó trồng gì cũng được, quanh năm.</p>
${mucMua}
        <p class="note">Sang mùa mà cây <b>chưa chín</b> và trái mùa thì héo. Cây <b>đã chín</b> thì không bao giờ mất — vụ đang chờ gặt luôn an toàn.</p>
      </div>
    </section>

    <section class="alt" id="bang-lai">
      <div class="wrap">
        <h2>Cây nào lãi nhất</h2>
        <p class="lead">Sắp theo <b>lãi mỗi ngày</b>, không phải lãi một vụ — trên cùng một mảnh đất thì thứ khan hiếm là ngày chứ không phải ô đất.</p>
        <div class="table-wrap">
          <table class="so-sanh">
            <thead><tr>
              <th scope="col">Cây</th><th scope="col">Mùa</th><th scope="col">Ngày</th>
              <th scope="col">Hạt</th><th scope="col">Bán</th><th scope="col">Lãi một vụ</th><th scope="col">Lãi mỗi ngày</th>
            </tr></thead>
            <tbody>
${bang}
            </tbody>
          </table>
        </div>
        <p class="note">Lãi tính theo sản lượng <b>thấp nhất</b> — con số chắc chắn thu được, không phải con số may mắn.
        Cây <b>thu nhiều lần</b> tính ở nhịp ổn định: gieo một lần rồi hái mãi, nên không trừ tiền hạt.
        Vụ <b>đầu</b> của chúng vẫn tốn tiền hạt và vẫn phải chờ trọn số ngày ở cột “Ngày”.</p>
      </div>
    </section>

    <section>
      <div class="wrap">
        <h2>Từng loại một</h2>
        <div class="ents">
${list.map(cropCard).join("\n")}
        </div>
      </div>
    </section>`,
  });
}

/* ------------------------------------------------------------- vật nuôi */

const HOUSING = {
  pen: "Nuôi trong chuồng có rào",
  free: "Thả rông quanh sân",
  water: "Sống dưới ao",
};

/** Khu chuồng dựng sẵn theo id, hoặc null. */
const penOf = (a) => (content.tiles.pens ?? []).find((q) => q.id === a.pen) ?? null;

const JOB = {
  patrol: "Đi tuần, đuổi chuột và sóc",
  pest: "Phá hoại — không nuôi được",
};

function animalCard(a) {
  const sp = a.products
    .map(
      (p) =>
        `<li>${nhan(p.id, 26)} — ${p.min === p.max ? p.min : `${p.min}–${p.max}`} mỗi ${ngay(p.every)}</li>`,
    )
    .join("");
  const thit = a.meat
    ? `<li>${nhan(a.meat.id, 26)} — ${a.meat.min === a.meat.max ? a.meat.min : `${a.meat.min}–${a.meat.max}`}, lấy một lần khi bán con vật</li>`
    : "";
  return `        <article class="ent" id="vat-${esc(a.id)}">
          <div class="ent-art">${cx(`animal:${a.id}`, 88, a.name)}</div>
          <div class="ent-main">
            <h3><a href="/vat-nuoi/${a.id}/">${esc(a.name)}</a></h3>
            <p class="ent-sub">${a.price ? `${xu(a.price)} một con` : "Không mua được"}</p>
            <div class="chips">
              <span class="chip">${esc(penOf(a)?.name ?? HOUSING[a.housing] ?? a.housing)}</span>
              ${a.job ? `<span class="chip alt">${esc(JOB[a.job] ?? a.job)}</span>` : ""}
            </div>
            <dl class="facts">
              <div><dt>Lớn sau</dt><dd>${ngay(a.matureDays)}</dd></div>
              <div><dt>Ăn gì</dt><dd>${a.feed.length ? a.feed.map((f) => nhan(f, 26)).join(" ") : "Tự kiếm ăn"}${a.pecks ? " · mổ sâu trên cỏ" : ""}</dd></div>
              <div><dt>Về đâu</dt><dd>${penOf(a) ? `${esc(penOf(a).name)}${penOf(a).feed ? ", có máng" : ""}` : "Không có chuồng — đi khắp nông trại"}</dd></div>
              <div><dt>Bỏ đói</dt><dd>${a.pecks ? "Gần như không chết đói — còn cỏ là còn ăn" : `Chết sau ${ngay(a.starveDays)} nhịn liên tiếp`}</dd></div>
            </dl>
            ${sp || thit ? `<ul class="prods">${sp}${thit}</ul>` : ""}
          </div>
        </article>`;
}

function itemName(id) {
  const [pre, rest] = [id.slice(0, id.indexOf(":")), id.slice(id.indexOf(":") + 1)];
  if (pre === "item") return content.materials[rest]?.name ?? rest;
  if (pre === "crop") return content.crops[rest]?.name ?? rest;
  if (pre === "seed") return content.crops[rest]?.seedName ?? rest;
  if (pre === "tool") return content.tools[rest]?.name ?? rest;
  if (pre === "build") return content.buildings[rest]?.name ?? rest;
  return id;
}

function animalsPage() {
  const all = content.animalOrder.map((id) => content.animals[id]).filter(Boolean);
  const nuoi = all.filter((a) => a.job !== "pest");
  const pha = all.filter((a) => a.job === "pest");
  const xe = content.vehicleOrder.map((id) => content.vehicles[id]).filter(Boolean);

  return page({
    title: "Vật nuôi — OniFarm Wiki",
    desc: "Chi tiết từng con vật trong OniFarm: nuôi bao lâu thì lớn, ăn gì, cho sữa/trứng/lông mấy ngày một lần, bán thịt được bao nhiêu.",
    url: "/vat-nuoi/",
    h1: "Vật nuôi",
    tag: "Con nào ăn gì, mấy ngày cho một lứa, và chuyện gì xảy ra nếu bạn quên cho ăn.",
    wide: true,
    body: `    <section>
      <div class="wrap">
        <h2>Nuôi được</h2>
        <p class="lead">Mua ở cửa hàng rồi có <b>xe thật</b> chạy từ cổng vào, đậu ở kho và thả hàng xuống; con vật tự đi về khu của nó. Loài <b>dưới nước</b> thì xe đậu ở <b>bờ ao</b> và thả thẳng xuống nước — không có chuyện con cá xuất hiện giữa sân rồi tự bơi qua đất.</p>
        <p>Đứng cạnh con vật là nút hành động đổi thành <span class="btn-pill">THU</span>; còn cho ăn thì <b>đổ vào máng</b> chứ không đút tận miệng — xem mục dưới.</p>
        <div class="ents">
${nuoi.map(animalCard).join("\n")}
        </div>
      </div>
    </section>
    <section>
      <div class="wrap">
        <h2>Nông trại chia lô</h2>
        <p class="lead">Bản đồ quy hoạch sẵn thành từng vùng, mỗi vùng một việc — bạn không phải phân lô gì cả. Ruộng là một lưới BÀN CỜ: lô nào cũng bằng nhau, giữa hai lô là một ô bờ lát lối mòn, và mỗi lô có một tấm biển cắm ghi tên.</p>
        <div class="ents">
${(content.tiles.zones ?? [])
  .map((z) => `        <article class="ent sm">
          <div class="ent-main">
            <h3>${esc(z.name)}</h3>
            <p class="ent-sub">${z.w}×${z.h} ô</p>
            <p>${
              z.kind === "farm"
                ? "Chỗ DUY NHẤT cuốc được. Ra ngoài vùng này cuốc không ăn, nên bạn không thể lỡ tay băm nát địa hình thành luống — mà luống bỏ hoang thì phải mấy đêm mới mọc cỏ lại."
                : `Chỗ đốn gỗ. Mỗi đêm ô cỏ trống trong rừng có ${Math.round((content.balance.forestRegrowChance ?? 0) * 100)}% mọc lên cây con, cây con lớn dần thành cây gỗ — nên chặt trụi một vạt thì vài đêm sau nó về.`
            }</p>
          </div>
        </article>`)
  .join("\n")}
        <article class="ent sm">
          <div class="ent-main">
            <h3>Hồ nước</h3>
            <p class="ent-sub">có cầu gỗ ra giữa hồ</p>
            <p>Hồ trũng hẳn xuống so với đồng cỏ, vành đá quanh bờ. Cầu gỗ bắc TRÊN mặt nước — bạn đi ra tới giữa hồ, còn cá vẫn bơi ngay dưới chân. Đứng bờ hoặc đứng cầu, cầm cám cá rồi bấm CHO CÁ ĂN.</p>
          </div>
        </article>
        </div>
      </div>
    </section>
    <section>
      <div class="wrap">
        <h2>Khu chuồng</h2>
        <p class="lead">Nông trại chia lô sẵn: rào đã đóng, máng đã đặt, cổng để mở. Bạn không phải xây gì cả — mua con vật là nó tự đi về khu của mình. Loài nào ăn cùng một thứ thì ở chung khu và chung một cái máng.</p>
        <div class="ents">
${(content.tiles.pens ?? [])
  .map((pen) => {
    const o = content.animalOrder
      .map((id) => content.animals[id])
      .filter((a) => a && a.pen === pen.id);
    return `        <article class="ent sm">
          <div class="ent-main">
            <h3>${esc(pen.name)}</h3>
            <p class="ent-sub">${pen.w}×${pen.h} ô${pen.swim ? " · dưới nước, không cần rào" : " · có rào, cổng mở ra đường"}</p>
            <p>${o.length ? `Nuôi: ${o.map((a) => esc(a.name)).join(", ")}.` : "Chưa loài nào ở đây."} ${
              (pen.feeds ?? []).length === 0
                ? "Khu này không có máng."
                : pen.swim
                  ? `Không đặt được máng giữa hồ: đứng bờ ao, cầm ${(pen.feeds ?? []).map((f) => esc(itemName(f))).join(" hoặc ")} rồi bấm CHO CÁ ĂN — cả đàn đang đói ăn cùng lúc.`
                  : `Máng trong khu nhận ${(pen.feeds ?? []).map((f) => esc(itemName(f))).join(", ")} — đứng cạnh máng, cầm một trong số đó rồi bấm ĐỔ MÁNG. Máng chứa ${content.balance.troughMax ?? 12} phần; con vật đói tự tới ăn, mỗi bữa một phần.`
            }</p>
          </div>
        </article>`;
  })
  .join("\n")}
        </div>
      </div>
    </section>
    <section>
      <div class="wrap">
        <h2>Thức ăn</h2>
        <p class="lead">Mỗi loài ăn được vài món chứ không phải đúng một món — hết thứ này thì còn thứ kia. Cắt cỏ dày lấy rơm, bó sợi cỏ thành cỏ khô, hoặc mua thẳng ở tab <b>Thức ăn</b> trong cửa hàng: mua thì đắt hơn tự cắt, đó là chỗ đánh đổi.</p>
        <div class="ents">
${content.materialOrder
  .map((id) => content.materials[id])
  .filter((m) => (m.buyPrice ?? 0) > 0)
  .map((m) => {
    const an = content.animalOrder
      .map((id) => content.animals[id])
      .filter((a) => a && a.job !== "pest" && a.feed.includes(`item:${m.id}`));
    return `        <article class="ent sm">
          <div class="ent-art">${cx(`item:${m.id}`, 40, m.name)}</div>
          <div class="ent-main">
            <h3>${esc(m.name)}</h3>
            <p class="ent-sub">Mua ${xu(m.buyPrice)} · bán ${xu(m.sellPrice)}</p>
            <p>${an.length ? `Cho: ${an.map((a) => esc(a.name)).join(", ")}.` : "Chưa loài nào ăn."}</p>
          </div>
        </article>`;
  })
  .join("\n")}
        </div>
      </div>
    </section>
    <section>
      <div class="wrap">
        <h2>Kẻ phá hoại</h2>
        <p class="lead">Chúng sinh ra <b>về đêm</b>, và càng nhiều cây chín bỏ ngoài ruộng thì càng nhiều con — ruộng trống thì không có con nào. Đó là lý do nên thu hoạch trước khi đi ngủ.</p>
        <p>Con <b>chó</b> là câu trả lời: ban ngày nó <b>đi tuần</b> qua từng lô ruộng và từng chuồng, gặp là bắt. Tối thì nó <b>về nhà nằm</b> — nên chó không canh hộ bạn qua đêm, nó dọn sạch vào sáng hôm sau.</p>
        <div class="ents">
${pha.map(animalCard).join("\n")}
        </div>
      </div>
    </section>
    <section>
      <div class="wrap">
        <h2>Xe cộ</h2>
        <p class="lead">Xe chạy trên đường nhựa và lối mòn. Xe giao hàng chở con vật và xe mới bạn vừa mua vào tận nơi; xe thu mua thì tự ghé bãi đậu lấy nông sản trong kho và trả tiền.</p>
        <div class="ents">
${xe
  .map(
    (v) => `        <article class="ent">
          <div class="ent-art">${cx(`vehicle:${v.id}`, 64, v.name)}</div>
          <div class="ent-main">
            <h3>${esc(v.name)}</h3>
            <p class="ent-sub">${v.price ? `${xu(v.price)}` : "Không mua — xe của bên ngoài tự ghé"}</p>
            <dl class="facts">
              <div><dt>Chở được</dt><dd>${v.capacity} món</dd></div>
              ${v.buyBonus ? `<div><dt>Trả cao hơn</dt><dd>+${Math.round(v.buyBonus * 100)}%</dd></div>` : ""}
            </dl>
          </div>
        </article>`,
  )
  .join("\n")}
        </div>
      </div>
    </section>`,
  });
}

/* ------------------------------------------------------------- hành động */

/** Mọi việc nhân vật làm được, viết bằng lời của người chơi chứ không phải của
 *  người lập trình. `nut` là đúng chữ in trên nút hành động trong game. */
const HANH_DONG = [
  {
    nut: "CÀY",
    ten: "Cày đất",
    can: "tool:hoe",
    y: "Biến một ô cỏ thành luống đất gieo được. Chỉ ăn TRONG KHU RUỘNG — nông trại chia lô sẵn, ra ngoài vùng đó thì cuốc không ăn.",
    meo: "Nhờ thế bạn không thể vô tình băm cả bản đồ thành luống: rừng vẫn là rừng, sân vẫn là sân. Đất đã cày mà bỏ không vài ngày sẽ tự mọc cỏ lại.",
  },
  {
    nut: "GIEO",
    ten: "Gieo hạt",
    can: null,
    y: "Cầm một gói hạt trên hotbar rồi bấm vào ô đất đã cày. Mỗi gói gieo được một ô.",
    meo: "Gieo trái mùa thì KHÔNG gieo được — cửa hàng cũng không bày bán hạt trái mùa, nên không có cách nào lỡ mua nhầm. Sàn nhà kính là ngoại lệ duy nhất: trên đó trồng gì cũng được, quanh năm.",
  },
  {
    nut: "TƯỚI",
    ten: "Tưới nước",
    can: "tool:can",
    y: "Đất ẩm thì đêm đó cây mới lớn. Quên tưới là cây đứng yên một ngày, không có ngoại lệ.",
    meo: "Trời mưa thì cả ruộng ngoài trời tự ẩm — hôm đó khỏi tưới, để dành sức làm việc khác.",
  },
  {
    nut: "MÚC",
    ten: "Múc đầy bình",
    can: "tool:can",
    y: "Đứng cạnh ao hoặc giếng rồi bấm. Bình hết nước thì tưới không ăn thua.",
    meo: "Bình tưới lớn chứa nhiều hơn gấp đôi, đỡ phải chạy đi chạy lại.",
  },
  {
    nut: "THU",
    ten: "Thu hoạch",
    can: null,
    y: "Cây chín có ánh lấp lánh. Bấm là nông sản vào túi. Vài loại cây thu xong mọc lại, không phải gieo mới.",
    meo: "Cây bị bệnh vẫn thu được nhưng ít hơn hẳn — thấy đốm là chữa ngay.",
  },
  {
    nut: "CHỮA",
    ten: "Chữa cây bệnh",
    can: "item:medicine",
    y: "Cây có đốm nâu là đang bệnh: nó không lớn thêm và thu được ít. Một lọ thuốc chữa một cây.",
    meo: "Bệnh hay xuất hiện sau mấy ngày ẩm liên tiếp. Trời mưa dài thì sáng ra đi soi ruộng một vòng.",
  },
  {
    nut: "NHỔ",
    ten: "Nhổ cỏ dại",
    can: null,
    y: "Cỏ dại mọc chen vào luống bỏ không. Nhổ đi để lấy lại ô đất.",
    meo: "Cỏ cao cắt ra rơm và cỏ khô — thứ để cho bò, dê, cừu ăn. Đừng dọn sạch cỏ quá sớm.",
  },
  {
    nut: "DỌN CỎ",
    ten: "Dọn cỏ dại trong lô",
    can: null,
    y: "Cỏ dại và bụi nhỏ mọc lan vào lô ruộng qua đêm, và một ô có cỏ là một ô không cày được. Nhổ tay không, không cần công cụ gì.",
    meo: "Đây là việc DUY NHẤT trong nhóm phá vật thể mà người làm thuê và nút Tự động làm được phép tự ý làm — vì nó chỉ đụng thứ tự mọc lên và chỉ trong lô ruộng. Cây và đá ở ngoài vẫn phải bấm tay, nên không có cách nào chúng dọn mất cảnh quan bạn cố ý chừa.",
  },
  {
    nut: "CHẶT",
    ten: "Chặt cây lấy gỗ",
    can: "tool:axe",
    y: "Cây to cần chặt vài nhát mới đổ. Gỗ dùng để chế công cụ và xây công trình.",
    meo: "Rìu thép chặt một nhát bằng rìu gỗ hai nhát, và tốn cùng ngần ấy sức.",
  },
  {
    nut: "ĐẬP",
    ten: "Đập đá lấy khoáng",
    can: "tool:pickaxe",
    y: "Đá cho đá xây, quặng cho kim loại. Đây là nguồn nguyên liệu chính cho mọi thứ hiện đại.",
    meo: "Đá đập hết sẽ mọc lại sau vài ngày, không lo cạn.",
  },
  {
    nut: "XÂY",
    ten: "Chế độ xây dựng",
    can: null,
    y: "Công trình — vòi tưới và sàn nhà kính — dựng ở đây. Bấm XÂY là thời gian dừng lại; ấn ở đầu đoạn, rê tới cuối, nhả tay là cả đoạn hiện ra. Hàng rào thì không: các khu chuồng đã rào sẵn từ đầu.",
    meo: "Vẽ bao nhiêu ô thì trả tiền bấy nhiêu, không phải mua trước rồi đoán xem cần mấy ô.",
  },
  {
    nut: "MUA",
    ten: "Mua ở cửa hàng",
    can: null,
    y: "Hạt giống, công cụ, công trình, con vật và xe. Mỗi tab một loại, có hình minh hoạ để khỏi đoán.",
    meo: "Con vật và xe không vào túi — một chiếc xe sẽ chở tới điểm giao cạnh quầy bán.",
  },
  {
    nut: "BÁN",
    ten: "Bán ở quầy thu mua",
    can: null,
    y: "Bán từng phần bằng nút cộng trừ, hoặc bán tất cả một lần. Quầy đọc được cả kho chứ không chỉ túi.",
    meo: "Nông sản để lâu không hỏng — có thể gom một vụ rồi bán một lượt.",
  },
  {
    nut: "KHO",
    ten: "Gửi hàng vào kho",
    can: null,
    y: "Kho chứa được nhiều hơn túi rất nhiều. Có nút cất tất cả nông sản chỉ bằng một bấm.",
    meo: "Người làm thuê tự đem hàng về kho, và xe thu mua cũng lấy từ kho. Kho là trung tâm của nông trại.",
  },
  {
    nut: "CHẾ",
    ten: "Chế tạo",
    can: null,
    y: "Ghép nguyên liệu thành công cụ tốt hơn và vật liệu cao cấp. Thiếu thứ gì thì hiện đỏ ngay.",
    meo: "Nâng cấp bình tưới và rìu sớm — chúng tiết kiệm sức mỗi ngày, càng dùng lâu càng lời.",
  },
  {
    nut: "ĐỔ MÁNG",
    ten: "Đổ thức ăn vào máng",
    can: null,
    y: "Cầm thức ăn, đứng cạnh cái MÁNG của khu rồi bấm. Không có kiểu đút tận miệng từng con — thức ăn vào chuồng bằng đúng một cửa là cái máng.",
    meo: "Máng là một bể chung: món nào đổ cũng được và trộn lẫn, món đắt thì no lâu hơn. Nhờ vậy đi vắng vài ngày đàn vẫn có cái ăn. Bò, dê và cừu cùng ăn rơm nên dùng chung một máng.",
  },
  {
    nut: "RẮC HỒ",
    ten: "Rắc thức ăn xuống ao",
    can: null,
    y: "Cá không có máng — đứng ở bờ, cầm thức ăn của chúng rồi bấm là rắc xuống mặt nước.",
    meo: "Gà và vịt thì không cần cả hai: chúng mổ sâu trên cỏ, nên khu của chúng cố ý không có máng.",
  },
  {
    nut: "NHẤC",
    ten: "Nhấc một vật lên vác",
    can: null,
    y: "Tay không, đứng cạnh khúc gỗ hay hòn đá rồi bấm là vác lên. Đang vác thì nút đổi thành ĐẶT để hạ xuống một ô trống.",
    meo: "Vác là cách dọn một vật ra khỏi chỗ nó đang chắn đường, mà không phải đập vỡ nó. Không đặt xuống được ô nào sẽ tự nhốt mình — game chặn trước, không cho đặt.",
  },
  {
    nut: "VÀO",
    ten: "Vào nhà",
    can: null,
    y: "Chạm cửa nhà để vào trong. Trong nhà có giường để ngủ.",
    meo: "Thời gian vẫn trôi khi bạn ở trong nhà — cây vẫn lớn, con vật vẫn đói.",
  },
  {
    nut: "NGỦ",
    ten: "Ngủ qua đêm",
    can: null,
    y: "Đây là lúc mọi thứ xảy ra: cây lớn thêm một bậc, tiền lãi vào, thời tiết đổi, con vật già thêm một ngày.",
    meo: "Quá 2 giờ sáng mà chưa ngủ là ngất giữa đồng, sáng dậy mất sức. Về sớm.",
  },
];

function actionsPage() {
  const cards = HANH_DONG.map(
    (h) => `        <article class="act">
          <div class="act-head">
            <span class="btn-pill big">${esc(h.nut)}</span>
            ${h.can ? cx(h.can, 44, itemName(h.can)) : ""}
          </div>
          <h3>${esc(h.ten)}</h3>
          ${h.can ? `<p class="ent-sub">Cần cầm: ${nhan(h.can, 26)}</p>` : ""}
          <p>${esc(h.y)}</p>
          <p class="meo"><b>Mẹo.</b> ${esc(h.meo)}</p>
        </article>`,
  ).join("\n");

  const cong = content.toolOrder
    .map((id) => content.tools[id])
    .filter(Boolean)
    .map(
      (t) => `        <article class="ent sm">
          <div class="ent-art">${cx(`tool:${t.id}`, 40, t.name)}</div>
          <div class="ent-main">
            <h3>${esc(t.name)}</h3>
            <p class="ent-sub">${t.capacity ? `Chứa ${t.capacity} lần tưới` : t.power ? `Mạnh ${t.power}` : "Dụng cụ cơ bản"}</p>
          </div>
        </article>`,
    )
    .join("\n");

  const ct = content.buildingOrder
    .map((id) => content.buildings[id])
    // Hàng rào là địa hình dựng sẵn của khu chuồng, không phải hàng xây được —
    // liệt kê nó ở bảng "xây được những gì" là hứa một thứ không có.
    .filter((b) => b && b.buildable !== false)
    .map(
      (b) => `        <article class="ent sm">
          <div class="ent-art">${cx(`build:${b.id}`, 40, b.name)}</div>
          <div class="ent-main">
            <h3>${esc(b.name)}</h3>
            <p class="ent-sub">${xu(b.price ?? 0)}</p>
            ${b.desc ? `<p>${esc(b.desc)}</p>` : ""}
          </div>
        </article>`,
    )
    .join("\n");

  return page({
    title: "Hành động — OniFarm Wiki",
    desc: "Tất cả việc nhân vật trong OniFarm làm được: cày, gieo, tưới, thu, chặt, đập, xây, mua bán, chế tạo, chăn nuôi — kèm mẹo cho từng việc.",
    url: "/hanh-dong/",
    h1: "Hành động",
    tag: "Nút to góc dưới màn hình đổi chữ theo việc bạn sắp làm. Đây là toàn bộ danh sách chữ đó.",
    wide: true,
    body: `    <section>
      <div class="wrap">
        <h2>Nút hành động nói gì</h2>
        <p class="lead">Bạn không phải nhớ phím nào cả. Ngắm vào một ô, nút sẽ tự ghi việc làm được ở đó — và nếu chưa làm được, nó nói luôn vì sao.</p>
        <div class="acts">
${cards}
        </div>
      </div>
    </section>
    <section>
      <div class="wrap">
        <h2>Công cụ</h2>
        <div class="ents cols">
${cong}
        </div>
      </div>
    </section>
    <section>
      <div class="wrap">
        <h2>Công trình xây được</h2>
        <div class="ents cols">
${ct}
        </div>
      </div>
    </section>`,
  });
}


/* ------------------------------------------------------------- luật chơi ---

   Bản DÀNH CHO NGƯỜI CHƠI của `docs/LOI-CHOI.md`. Tài liệu trong `docs/` viết
   cho người sửa mã: nó nói vì sao luật được quyết như thế. Trang này chỉ trả
   lời "chơi thì phải biết gì", và mọi con số đọc thẳng từ content — nên không
   có cách nào nó nói sai giờ ngủ hay sai xác suất bệnh.
*/

function bangLuat(hang) {
  return (
    `<div class="table-wrap"><table class="luat"><tbody>` +
    hang.map(([k, v]) => `<tr><th scope="row">${k}</th><td>${v}</td></tr>`).join("") +
    `</tbody></table></div>`
  );
}

/* ------------------------------------------------------------ TRANG CHÍNH */

/**
 * Trang chính của wiki. Không phải trang quảng cáo: nó là CỬA TRA CỨU — bao
 * nhiêu cây, bao nhiêu loài, bao nhiêu món, và đường vào từng danh mục.
 */
function trangChinhPage() {
  const nCay = content.cropOrder.length;
  const nVat = content.animalOrder.filter((id) => content.animals[id]?.job !== "pest").length;
  const nMon = content.materialOrder.length;
  const nCong = content.toolOrder.length;
  /* Mỗi thẻ trong danh mục phải có hình của CHÍNH thứ nó dẫn tới. Trước đó chỉ
     Cây trồng và Vật nuôi có hình, tám thẻ còn lại là một khung trống — mà tám
     thẻ ấy gồm cả Công trình, tức đúng chỗ người ta vào tìm cái nhà. */
  const mau = (ks, co = 40) => ks.map((k) => cx(k, co, "")).join("");
  const mauCay = mau(content.cropOrder.slice(0, 10).map((id) => `crop:${id}`));
  const mauVat = mau(content.animalOrder.slice(0, 6).map((id) => `animal:${id}`));
  const mauLuat = mau(["player:down:0", "ui:energy", "ui:water", "weather:rain", "ui:day"]);
  const mauDo = mau(["item:wood", "item:stone", "item:milk", "item:egg", "tool:hoe", "tool:axe"]);
  const mauNha = mau(["prop:house", "prop:warehouse", "prop:shop", "prop:counter", "prop:well", "build:sprinkler"]);
  const mauDat = mau(["prop:tree", "prop:rock", "prop:log", "prop:bush", "prop:pine", "prop:boulder"]);
  const mauTroi = mau(Object.keys(content.weathers ?? {}).map((id) => `weather:${id}`));
  const mauViec = mau(["tool:hoe", "tool:can", "tool:axe", "tool:pickaxe"]);
  const mauIcon = mau(["ui:coin", "ui:bag", "ui:build", "ui:power", "ui:gear", "ui:goal"]);
  const mauNguoi = mau(["player:down:0", "worker:1:down:13", "worker:2:down:7", "worker:3:down:10"]);
  const mauTacGia = mau(["player:down:15", "prop:house", "animal:cow"]);

  const the = (href, ten, dem, mo, anh) => `          <a class="wcard" href="${href}">
            <div class="wcard-art">${anh}</div>
            <b>${esc(ten)}</b>
            <span class="wcard-n">${dem}</span>
            <p>${esc(mo)}</p>
          </a>`;

  const dan = `        <section class="wbox">
      <p class="lead">
        Đây là sổ tra cứu của <b>OniFarm</b> — một game nông trại pixel chơi thẳng trên trình duyệt,
        không cần cài, không cần mạng sau lần mở đầu. Mọi con số trên các trang dưới đây
        <b>sinh thẳng từ dữ liệu game</b>, nên chúng không bao giờ lệch với thứ bạn gặp lúc chơi.
      </p>
      <p class="lead">Tác giả · story: <b>TRẦN CƯỜNG</b>.</p>
    </section>
`;

  const body = `
    <h2 id="danh-muc">Danh mục</h2>
    <div class="wcards">
${the("/loi-choi/", "Lối chơi", "luật", "Một ngày dài bao lâu, năng lượng tiêu thế nào, mùa và thời tiết đổi ra sao.", mauLuat)}
${the("/cay-trong/", "Cây trồng", `${nCay} loại`, "Mỗi cây: gieo mùa nào, mấy ngày chín, giá hạt, giá bán, lãi mỗi ngày.", mauCay)}
${the("/vat-nuoi/", "Vật nuôi", `${nVat} loài`, "Ăn gì, mấy ngày một lứa, cho sữa/trứng/lông hay lấy thịt.", mauVat)}
${the("/vat-pham/", "Vật phẩm", `${nMon + nCong} món`, "Nguyên liệu, món chế biến và công cụ — mỗi món một trang chi tiết.", mauDo)}
${the("/cong-trinh/", "Công trình", `${content.buildingOrder.length} thứ`, "Nhà, kho, chợ, quầy, giếng — và vòi tưới, sàn nhà kính, hàng rào tự xây.", mauNha)}
${the("/dia-hinh/", "Địa hình", `${content.propOrder.length} vật thể`, "Nền đất, cây cối, đá, gỗ chết, cỏ bụi và đồ trong nhà.", mauDat)}
${the("/thoi-tiet/", "Thời tiết", `${Object.keys(content.weathers ?? {}).length} kiểu trời`, "Trời đổi luật chơi của một ngày thế nào.", mauTroi)}
${the("/nhan-vat/", "Nhân vật", `${SO_KHUNG_NGUOI} tư thế`, "Nhân vật và người làm: từng tư thế, khi nào hiện khung nào, tiền thuê và lương.", mauNguoi)}
${the("/hanh-dong/", "Hành động", "mọi nút", "Từng việc nhân vật làm được trên một ô đất, cần cầm gì và tốn bao nhiêu sức.", mauViec)}
${the("/bieu-tuong/", "Biểu tượng", "HUD · menu", "Mỗi biểu tượng trên thanh trạng thái và trong menu nói gì.", mauIcon)}
${the("/tac-gia/", "Tác giả", "story", "Ai làm ra nông trại này, và nó bắt đầu từ đâu.", mauTacGia)}
    </div>

    <h2 id="bat-dau">Bắt đầu từ đâu</h2>
    <ol class="wsteps">
      <li><b>Cày một ô đất.</b> Cầm cuốc, đứng cạnh ô trong lô ruộng, bấm nút chính.</li>
      <li><b>Gieo rồi tưới.</b> Hạt mua ở Chợ; nước múc ở giếng hoặc bờ hồ.</li>
      <li><b>Ngủ một đêm.</b> Cây chỉ lớn khi sang ngày mới, và chỉ lớn nếu ô còn ẩm.</li>
      <li><b>Thu rồi bán.</b> Bán ở Quầy thu mua, hoặc để xe tới chở đi.</li>
      <li><b>Thuê người làm.</b> Từ đó nông trại chạy cả lúc bạn đứng nhìn.</li>
    </ol>

    <h2 id="so-lieu">Vài con số</h2>
    ${bangLuat([
      ["Cây trồng", `${nCay} loại`],
      ["Vật nuôi", `${nVat} loài`],
      ["Nguyên liệu và món chế biến", `${nMon} món`],
      ["Công cụ", `${nCong} món`],
      ["Công thức chế tạo", `${SO_LIEU.soCongThuc}`],
      ["Một ngày trong game", `${SO_LIEU.phutMoiNgayThat} phút ngoài đời`],
      ["Kịch bản kiểm thử", `${SO_LIEU.soKichBan}`],
    ])}
`;

  return page({
    title: "OniFarm Wiki — sổ tra cứu cây trồng, vật nuôi, vật phẩm",
    desc: `Sổ tra cứu OniFarm: ${nCay} loại cây, ${nVat} loài vật, ${nMon + nCong} vật phẩm, luật chơi và mọi hành động. Số liệu sinh thẳng từ dữ liệu game. Tác giả: Trần Cường.`,
    url: "/",
    h1: "Trang chính",
    tag: "sổ tra cứu của OniFarm",
    muc: [["danh-muc", "Danh mục"], ["bat-dau", "Bắt đầu từ đâu"], ["so-lieu", "Vài con số"]],
    dan,
    body,
  });
}

/* -------------------------------------------------------------- VẬT PHẨM */

/** Mọi thứ CẦM ĐƯỢC, gom một chỗ: nguyên liệu · món chế biến · công cụ · nông sản. */
function moiVatPham() {
  const ra = [];
  for (const id of content.materialOrder) {
    const m = content.materials[id];
    if (!m) continue;
    const ct = Object.values(content.recipes ?? {}).find((r) => r.out?.id === `item:${id}`);
    ra.push({
      key: `item:${id}`, slug: `vp-${id}`, ten: m.name,
      loai: ct ? "Món chế biến" : "Nguyên liệu",
      ban: m.sellPrice ?? 0, mua: m.buyPrice ?? 0,
      banDuoc: m.sell !== false, congThuc: ct ?? null,
      nangLuong: m.energy ?? 0,
    });
  }
  for (const id of content.toolOrder) {
    const t = content.tools[id];
    if (!t) continue;
    const ct = Object.values(content.recipes ?? {}).find((r) => r.out?.id === `tool:${id}`);
    ra.push({
      key: `tool:${id}`, slug: `vp-tool-${id}`, ten: t.name,
      loai: "Công cụ", ban: 0, mua: t.buyPrice ?? 0, banDuoc: false,
      congThuc: ct ?? null, nangLuong: 0, viec: t.action ?? "", suc: t.capacity ?? 0,
    });
  }
  return ra;
}

const tenNguyenLieu = (id) => itemName(id);

function vatPhamPage() {
  const ds = moiVatPham();
  const nhom = [
    ["Nguyên liệu", ds.filter((v) => v.loai === "Nguyên liệu")],
    ["Món chế biến", ds.filter((v) => v.loai === "Món chế biến")],
    ["Công cụ", ds.filter((v) => v.loai === "Công cụ")],
  ];

  const bang = (list) => `        <div class="table-wrap"><table class="wtab">
          <thead><tr><th>Món</th><th>Bán</th><th>Mua</th><th>Chế tạo từ</th></tr></thead>
          <tbody>
${list
  .map(
    (v) => `            <tr id="${v.slug}">
              <th scope="row"><a class="ilk" href="/vat-pham/${v.slug}/">${cx(v.key, 30, v.ten)}<span>${esc(v.ten)}</span></a></th>
              <td>${v.banDuoc && v.ban ? `${xu(v.ban)}` : "—"}</td>
              <td>${v.mua ? `${xu(v.mua)}` : "—"}</td>
              <td>${v.congThuc ? v.congThuc.in.map((i) => `${nhan(i.id)} ×${i.n}`).join(" + ") : "—"}</td>
            </tr>`,
  )
  .join("\n")}
          </tbody>
        </table></div>`;

  const body = nhom
    .map(
      ([ten, list], i) => `
    <h2 id="n${i}">${esc(ten)} <span class="wdem">${list.length} món</span></h2>
${bang(list)}`,
    )
    .join("\n");

  return page({
    title: "Vật phẩm — OniFarm Wiki",
    desc: `Toàn bộ ${ds.length} vật phẩm trong OniFarm: nguyên liệu, món chế biến và công cụ — giá bán, giá mua, công thức chế tạo.`,
    url: "/vat-pham/",
    h1: "Vật phẩm",
    tag: `${ds.length} món`,
    muc: nhom.map(([ten], i) => [`n${i}`, ten]),
    body,
  });
}

/** Một trang CHI TIẾT cho mỗi món — đây là thứ làm sổ tra cứu ra wiki. */
function vatPhamChiTiet(v) {
  const dung = Object.values(content.recipes ?? {}).filter((r) =>
    (r.in ?? []).some((i) => i.id === v.key),
  );
  const hop = `        <aside class="winfo">
          <div class="winfo-art">${cx(v.key, 112, v.ten)}</div>
          <b class="winfo-ten">${esc(v.ten)}</b>
          <dl>
            <dt>Loại</dt><dd>${esc(v.loai)}</dd>
            ${v.banDuoc && v.ban ? `<dt>Giá bán</dt><dd>${`${xu(v.ban)}`}</dd>` : ""}
            ${v.mua ? `<dt>Giá mua</dt><dd>${`${xu(v.mua)}`}</dd>` : ""}
            ${!v.banDuoc && v.loai !== "Công cụ" ? `<dt>Bán</dt><dd>không bán được</dd>` : ""}
            ${v.nangLuong ? `<dt>Ăn được</dt><dd>hồi ${v.nangLuong} năng lượng</dd>` : ""}
            ${v.viec ? `<dt>Dùng để</dt><dd>${esc(v.viec)}</dd>` : ""}
            ${v.suc ? `<dt>Dung tích</dt><dd>${v.suc} lần tưới</dd>` : ""}
          </dl>
        </aside>`;

  const body = `
    <h2 id="lay">Lấy ở đâu</h2>
    <ul class="wlist">
      ${v.congThuc ? `<li><b>Chế tạo</b> từ ${v.congThuc.in.map((i) => `${nhan(i.id)} ×${i.n}`).join(" + ")}.</li>` : ""}
      ${v.mua ? `<li><b>Mua</b> ở Chợ với giá ${`${xu(v.mua)}`}.</li>` : ""}
      ${!v.congThuc && !v.mua ? "<li>Nhặt được ngoài nông trại, hoặc do vật nuôi cho.</li>" : ""}
    </ul>

    <h2 id="dung">Dùng làm gì</h2>
    <ul class="wlist">
      ${v.banDuoc && v.ban ? `<li><b>Bán</b> ở Quầy thu mua, ${`${xu(v.ban)}`} một đơn vị.</li>` : ""}
      ${v.nangLuong ? `<li><b>Ăn</b> để hồi ${v.nangLuong} năng lượng.</li>` : ""}
      ${dung.length
        ? dung
            .map(
              (r) =>
                `<li><b>Chế tạo</b> ${esc(r.name)} (cần ${(r.in ?? []).map((i) => `${nhan(i.id)} ×${i.n}`).join(" + ")}).</li>`,
            )
            .join("\n      ")
        : ""}
      ${!v.banDuoc && !v.nangLuong && !dung.length ? "<li>Giữ trong kho để dùng khi cần.</li>" : ""}
    </ul>

    <p class="wback"><a href="/vat-pham/">← Về danh sách vật phẩm</a></p>
`;

  return page({
    title: `${v.ten} — OniFarm Wiki`,
    desc: `${v.ten} trong OniFarm: ${v.loai.toLowerCase()}${v.ban ? `, bán ${v.ban} xu` : ""}${v.congThuc ? ", chế tạo được" : ""}.`,
    url: "/vat-pham/",
    h1: esc(v.ten),
    tag: v.loai.toLowerCase(),
    hop,
    muc: [["lay", "Lấy ở đâu"], ["dung", "Dùng làm gì"]],
    body,
  });
}

/* --------------------------------------------------------------- TÁC GIẢ */

function tacGiaPage() {
  const dan = `        <section class="wbox">
      <p class="lead">
        OniFarm do <b>TRẦN CƯỜNG</b> nghĩ ra và dựng nên — từ ý tưởng, luật chơi, bố cục nông trại,
        cho tới từng vòng phản hồi "chỗ này nhìn kì, sửa đi".
      </p>
    </section>
`;

  /* Một dải hình ngay đầu bài: trang này nói VỀ nông trại, mà trước đó nó là
     trang duy nhất trong wiki không có lấy một hình của chính nông trại ấy. */
  const hop = `        <aside class="winfo">
          <div class="winfo-art">${cx("player:down:15", 112, "Nhân vật giơ tay mừng")}</div>
          <p class="winfo-ten">OniFarm</p>
          <dl>
            <dt>Tác giả · story</dt><dd><b>TRẦN CƯỜNG</b></dd>
            <dt>Bản lõi</dt><dd>${esc(PHIEN_BAN.core)}</dd>
            <dt>Bản nội dung</dt><dd>${esc(PHIEN_BAN.content)}</dd>
            <dt>Cây trồng</dt><dd>${SO_LIEU.soCay} loại</dd>
            <dt>Vật nuôi</dt><dd>${SO_LIEU.soLoai} loài</dd>
            <dt>Kịch bản kiểm thử</dt><dd>${SO_LIEU.soKichBan}</dd>
          </dl>
        </aside>`;

  const body = `
    <div class="wgal">
      <figure class="wgal-o">${cx("prop:house", 72, "Nhà")}<figcaption>Nhà</figcaption></figure>
      <figure class="wgal-o">${cx("animal:cow", 72, "Bò")}<figcaption>Bò</figcaption></figure>
      <figure class="wgal-o">${cx("crop:tomato", 72, "Cà chua")}<figcaption>Cà chua</figcaption></figure>
      <figure class="wgal-o">${cx("prop:tree", 72, "Cây")}<figcaption>Cây</figcaption></figure>
      <figure class="wgal-o">${cx("weather:rain", 72, "Mưa")}<figcaption>Mưa</figcaption></figure>
      <figure class="wgal-o">${cx("player:down:0", 72, "Nhân vật")}<figcaption>Nhân vật</figcaption></figure>
    </div>

    <h2 id="story">Story</h2>
    <p>
      Bắt đầu từ một câu hỏi giản dị: <i>một cái nông trại chạy được, mở bằng trình duyệt, không cần cài,
      không cần mạng — thì nó phải như thế nào?</i>
    </p>
    <p>
      Trả lời câu ấy hoá ra không phải chuyện vẽ cho đẹp. Nó là chuyện một cái nút phải nói đúng thứ nó
      sẽ làm; một con bò đói phải nhìn ra là đang đói; một dòng sông phải chảy về đâu đó. Mỗi lần nông
      trại "nhìn kì", đào xuống dưới thì gần như lần nào cũng gặp một chỗ sai trong cách dựng, chứ không
      phải một nét vẽ xấu.
    </p>
    <p>
      Nông trại này lớn lên theo từng đợt như thế: nhìn, chỉ ra chỗ sai, đào tới gốc, sửa, rồi nhìn lại.
    </p>

    <h2 id="nguyen-tac">Ba nguyên tắc</h2>
    <ul class="wlist">
      <li><b>Số trên trang không bao giờ lệch với số trong game.</b> Mọi bảng ở wiki này sinh thẳng từ
        dữ liệu game, nên không có chỗ nào để một con số cũ nằm lại.</li>
      <li><b>Chơi được rồi mới đẹp.</b> Luật chơi chạy được kiểm bằng ${SO_LIEU.soKichBan} kịch bản mô
        phỏng, không cần trình duyệt.</li>
      <li><b>Save nằm trên máy bạn.</b> Không tài khoản, không máy chủ, không quảng cáo.</li>
    </ul>

    <h2 id="lien-he">Chơi thử</h2>
    <p><a class="cta" href="/farm/">Mở nông trại</a></p>
`;
  return page({
    title: "Tác giả — OniFarm Wiki",
    desc: "OniFarm do Trần Cường nghĩ ra và dựng nên: ý tưởng, luật chơi, bố cục nông trại và story.",
    url: "/tac-gia/",
    h1: "Tác giả",
    tag: "Trần Cường",
    muc: [["story", "Story"], ["nguyen-tac", "Ba nguyên tắc"], ["lien-he", "Chơi thử"]],
    hop,
    dan,
    body,
  });
}


/* ------------------------------------------------- trang chi tiết MỘT CÂY */

function cropDetailPage(c) {
  const l = lai(c);
  const stages = c.growthDays.map((_, i) => cx(`crop:${c.id}:${i}`, 48, `giai đoạn ${i + 1}`));
  stages.push(cx(`crop:${c.id}`, 56, `${c.name} chín`));
  const mua = c.seasons.length ? c.seasons.map((s) => esc(seasonName(s))).join(" · ") : "quanh năm";

  /* Món chế biến làm TỪ cây này — tra ngược công thức, nên thêm một công thức
     vào content là trang cây tự biết nói về nó. */
  const cheBien = Object.values(content.recipes ?? {}).filter((r) =>
    (r.in ?? []).some((i) => i.id === `crop:${c.id}`),
  );
  /* Con vật ĂN cây này — tra ngược `pen.feeds`, cùng lý do. */
  const anBoi = content.animalOrder.filter((a) =>
    (content.animals[a]?.feed ?? []).includes(`crop:${c.id}`),
  );

  const hop = `        <aside class="winfo">
          <div class="winfo-art">${cx(`crop:${c.id}`, 112, c.name)}</div>
          <b class="winfo-ten">${esc(c.name)}</b>
          <dl>
            <dt>Mùa gieo</dt><dd>${mua}</dd>
            <dt>Chín sau</dt><dd>${ngay(tongNgay(c))}</dd>
            <dt>Hạt giống</dt><dd>${xu(c.seedPrice)}</dd>
            <dt>Bán</dt><dd>${xu(c.sellPrice)} một quả</dd>
            <dt>Mỗi lần thu</dt><dd>${c.yieldMin === c.yieldMax ? c.yieldMin : `${c.yieldMin}–${c.yieldMax}`} quả</dd>
            ${c.regrowDays ? `<dt>Thu lại sau</dt><dd>${ngay(c.regrowDays)}</dd>` : ""}
            ${c.energy ? `<dt>Ăn được</dt><dd>hồi ${c.energy} năng lượng</dd>` : ""}
            <dt>Lãi mỗi ngày</dt><dd class="${laiMoiNgay(c) >= 0 ? "up" : "down"}">${xu(Math.round(laiMoiNgay(c)))}</dd>
          </dl>
        </aside>`;

  const body = `
    <h2 id="lon">Cây lớn thế nào</h2>
    <div class="grow">
      <span class="grow-lbl">Từ hạt tới lúc chín:</span>
      ${stages.join("")}
    </div>
    <p>
      Gieo xuống ô đã cày rồi tưới; cây chỉ lớn khi <b>sang ngày mới</b> và chỉ lớn nếu ô còn ẩm.
      Cả vụ mất ${ngay(tongNgay(c))}${c.regrowDays ? `, và sau lần thu đầu nó mọc lại sau ${ngay(c.regrowDays)} mà không phải gieo lại` : ""}.
    </p>

    <h2 id="tien">Tiền nong</h2>
    <div class="table-wrap">
    <table>
      <tbody>
        <tr><th scope="row">Hạt giống</th><td>${xu(c.seedPrice)} một gói</td></tr>
        <tr><th scope="row">Bán quả</th><td>${xu(c.sellPrice)}</td></tr>
        <tr><th scope="row">Lãi chắc chắn một vụ</th><td class="${l >= 0 ? "up" : "down"}">${l >= 0 ? "+" : ""}${xu(l)}</td></tr>
        <tr><th scope="row">Lãi mỗi ngày</th><td class="${laiMoiNgay(c) >= 0 ? "up" : "down"}">${xu(Math.round(laiMoiNgay(c)))}</td></tr>
      </tbody>
    </table>
    </div>
    <p class="note">Lãi tính theo mức thu <b>thấp nhất</b> — con số bạn chắc chắn nhận được, không phải mức trung bình.</p>

    <h2 id="dung">Dùng làm gì</h2>
    <ul class="wlist">
      <li>Bán ở <b>Quầy thu mua</b>, ${xu(c.sellPrice)} một quả.</li>
      ${c.energy ? `<li>Ăn để hồi <b>${c.energy}</b> năng lượng.</li>` : ""}
      ${cheBien.map((r) => `<li>Chế tạo ${esc(r.name)} — cần ${(r.in ?? []).map((i) => nhan(i.id)).join(" + ")}.</li>`).join("\n      ")}
      ${anBoi.length ? `<li>Cho ăn: ${nhanDs([...new Set(anBoi)].map((a) => `animal:${a}`))} ăn được món này.</li>` : ""}
    </ul>

    <p class="wback"><a href="/cay-trong/">← Về danh sách cây trồng</a></p>
`;

  return page({
    title: `${c.name} — OniFarm Wiki`,
    desc: `${c.name} trong OniFarm: gieo mùa ${mua}, chín sau ${tongNgay(c)} ngày, hạt ${c.seedPrice} xu, bán ${c.sellPrice} xu.`,
    url: "/cay-trong/",
    h1: esc(c.name),
    tag: "cây trồng",
    hop,
    muc: [["lon", "Cây lớn thế nào"], ["tien", "Tiền nong"], ["dung", "Dùng làm gì"]],
    body,
  });
}

/* ------------------------------------------------- trang chi tiết MỘT LOÀI */

function animalDetailPage(a) {
  const khu = (content.pens ?? []).find((p) => p.id === a.pen);
  /* Món ăn lấy từ `feed` của chính loài, không lấy từ `feeds` của khu: khu là
     cái MÁNG chứa được những gì, còn `feed` là con vật ăn được những gì. Hai
     danh sách ấy trùng nhau hôm nay nhưng chúng trả lời hai câu khác nhau. */
  const monAn = a.feed ?? khu?.feeds ?? [];
  const sp = (a.products ?? []).map((p) => p.id);
  const thit = a.meat ? [a.meat.id] : [];

  const hop = `        <aside class="winfo">
          <div class="winfo-art">${cx(`animal:${a.id}`, 112, a.name)}</div>
          <b class="winfo-ten">${esc(a.name)}</b>
          <dl>
            <dt>Giá mua</dt><dd>${xu(a.price ?? 0)}</dd>
            <dt>Lớn sau</dt><dd>${ngay(a.matureDays ?? 0)}</dd>
            ${khu ? `<dt>Ở khu</dt><dd>${esc(khu.name)}</dd>` : ""}
            ${a.fedMinutes ? `<dt>No được</dt><dd>${Math.round(a.fedMinutes / 60)} giờ game</dd>` : ""}
          </dl>
        </aside>`;

  const body = `
    <h2 id="an">Ăn gì</h2>
    ${monAn.length
      ? `<p>${nhanDs(monAn, 22)}</p>
    <p class="note">Cho ăn bằng cách <b>đổ vào máng</b> trong khu, không đút tận miệng. Máng là một bể điểm chung: món giá cao thì no lâu hơn.</p>`
      : `<p>Loài này tự kiếm ăn trên nền cỏ, gần như không bao giờ chết đói.</p>`}

    <h2 id="cho">Cho gì</h2>
    <ul class="wlist">
      ${sp
        .map((id) => {
          const pr = (a.products ?? []).find((p) => p.id === id);
          const nhip = pr?.every ? ` — mỗi ${ngay(pr.every)} một lứa` : "";
          const so = pr && pr.min ? `, ${pr.min === pr.max ? pr.min : `${pr.min}–${pr.max}`} một lứa` : "";
          return `<li>${nhan(id, 26)}${nhip}${so}.</li>`;
        })
        .join("\n      ")}
      ${thit.map((id) => `<li>${nhan(id, 26)} — khi mổ thịt.</li>`).join("\n      ")}
      ${!sp.length && !thit.length ? "<li>Không cho sản phẩm nào — nuôi để có bạn.</li>" : ""}
    </ul>

    <h2 id="nuoi">Nuôi thế nào</h2>
    <ul class="wlist">
      <li>Mua ở <b>Chợ</b> ${xu(a.price ?? 0)}; xe thật chở tới kho rồi thả xuống, con vật tự đi về khu của nó.</li>
      <li>Lớn sau <b>${ngay(a.matureDays ?? 0)}</b>; chưa lớn thì chưa cho sản phẩm.</li>
      ${a.starveDays ? `<li>Nhịn ăn <b>${a.starveDays} ngày liên tiếp</b> thì chết — đói thì trên đầu nó có bong bóng.</li>` : ""}
    </ul>

    <p class="wback"><a href="/vat-nuoi/">← Về danh sách vật nuôi</a></p>
`;

  return page({
    title: `${a.name} — OniFarm Wiki`,
    desc: `${a.name} trong OniFarm: mua ${a.price ?? 0} xu, lớn sau ${a.matureDays ?? 0} ngày, ăn gì và cho sản phẩm gì.`,
    url: "/vat-nuoi/",
    h1: esc(a.name),
    tag: a.job === "pest" ? "loài phá hoại" : "vật nuôi",
    hop,
    muc: [["an", "Ăn gì"], ["cho", "Cho gì"], ["nuoi", "Nuôi thế nào"]],
    body,
  });
}


/* ------------------------------------------------------- CÔNG TRÌNH · ĐỊA HÌNH

   Cường: "thiếu công trình và địa hình rồi, bổ sung luôn vào trang tài liệu".

   Đúng, và đó là hai mảng LỚN: người chơi xây vòi tưới, lát nhà kính, chặt cây,
   đập đá, nhặt khúc gỗ — nhưng wiki không có lấy một dòng nào về chúng. Trang
   Hành động có kể việc CHẶT và ĐẬP, mà không nói chặt cái gì ra cái gì.
--------------------------------------------------------------------------- */

const KIEU_XAY = { object: "Vật đặt trên ô", floor: "Sàn lát" };

/* NHÀ CỬA — Cường: "các loại công trình toà nhà đâu, sao không thấy render".

   Vì trong dữ liệu, nhà · kho · chợ · quầy KHÔNG nằm ở `buildings` mà ở `props`:
   `buildings` chỉ chứa ba thứ NGƯỜI CHƠI TỰ XÂY (vòi tưới, sàn nhà kính, rào),
   còn nhà cửa thì đã dựng sẵn trên bản đồ. Đúng về mặt luật chơi, nhưng người
   tra cứu không nghĩ như thế: họ tìm "Nhà" ở trang Công trình. Nên trang này
   kể cả hai, và mỗi thứ trỏ về trang chi tiết thật của nó.

   Danh sách gõ tay vì "cái nào là toà nhà" là một phán đoán biên tập, không có
   trong dữ liệu — nhưng `cx()` soát từng khoá, nên gõ sai một id là build đỏ. */
const NHA_CUA = [
  ["house", "Chỗ ở của bạn. Ngủ trong này để sang ngày mới."],
  ["door", "Cửa nhà — bước vào là đổi sang bản đồ trong nhà."],
  ["warehouse", "Nhà kho: nông sản dỡ vào đây, xe tới chở đi từ đây."],
  ["store_door", "Cửa kho — mở ra bảng kho hàng."],
  ["shop", "Chợ hạt giống: mua hạt, mua con giống, thuê người làm."],
  ["counter", "Quầy thu mua: bán mọi thứ đang cầm."],
  ["well", "Giếng nước: múc đầy bình tưới."],
  ["kennel", "Nhà chó — chỗ con chó về nghỉ."],
  ["trough", "Máng thức ăn: đổ vào đây thì cả chuồng tự tới ăn."],
  ["bench", "Bàn chế tạo, đặt trong nhà."],
  ["bed", "Giường — ngủ một đêm, cây lớn thêm một giai đoạn."],
  ["pier", "Cầu gỗ bắc qua nước, đi bộ được."],
  ["roadbridge", "Cầu đường: xe qua được, không chỉ người."],
];

function congTrinhPage() {
  const ds = content.buildingOrder.map((id) => content.buildings[id]).filter(Boolean);
  const the = (b) => `        <a class="chip" href="/cong-trinh/${b.id}/">
          ${cx(`build:${b.id}`, 40, b.name)}<span>${esc(b.name)}</span>
        </a>`;

  const theNha = ([id, mo]) => `        <article class="ent" id="nc-${esc(id)}">
          <div class="ent-art">${cx(`prop:${id}`, 88, content.props[id]?.name ?? id)}</div>
          <div class="ent-main">
            <h3><a href="/dia-hinh/${esc(id)}/">${esc(content.props[id]?.name ?? id)}</a></h3>
            <p>${esc(mo)}</p>
          </div>
        </article>`;

  const body = `
    <h2 id="nha">Nhà cửa dựng sẵn</h2>
    <p>Những thứ này <b>đã có sẵn trên bản đồ</b> — không mua, không xây, nhưng đây là chỗ mọi việc
       diễn ra: mua bán, cất hàng, ngủ, múc nước. Cửa nhà và cửa kho có hình <b>đóng và mở</b>,
       nên đứng gần là thấy nó hé ra.</p>
    <div class="ents">
${NHA_CUA.map(theNha).join("\n")}
    </div>

    <h2 id="ds">Xây được những gì</h2>
    <p>Ba thứ dưới đây thì ngược lại: <b>bạn tự mua và tự đặt</b>, ở đâu tuỳ ý.</p>
    <div class="chips">
${ds.map(the).join("\n")}
    </div>

    <h2 id="bang">Bảng so sánh</h2>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Công trình</th><th>Giá</th><th>Kiểu</th><th>Đi qua được</th></tr></thead>
        <tbody>
${ds
  .map(
    (b) => `          <tr>
            <th scope="row">${nhan(`build:${b.id}`, 26)}</th>
            <td class="num">${b.price ? xu(b.price) : "không mua"}</td>
            <td>${esc(KIEU_XAY[b.kind] ?? b.kind)}</td>
            <td>${b.solid ? "không" : "có"}</td>
          </tr>`,
  )
  .join("\n")}
        </tbody>
      </table>
    </div>

    <h2 id="xay">Xây thế nào</h2>
    <ul class="wlist">
      <li>Mở <b>chế độ xây dựng</b> trong lưới Tạm dừng, chọn thứ cần xây.</li>
      <li>Kéo một đường: game <b>xem trước cả tuyến</b> — ô nào đặt được thì khung xanh, không thì khung đỏ — và cộng sẵn tổng tiền trước khi bấm.</li>
      <li>Đặt nhầm thì <b>gỡ ra được</b>, và tiền vật liệu trả lại theo luật của từng thứ.</li>
    </ul>
`;
  return page({
    title: "Công trình — OniFarm Wiki",
    desc: `Nhà · kho · chợ · quầy · giếng và ${ds.length} công trình xây được trong OniFarm: mỗi thứ làm gì, giá bao nhiêu.`,
    url: "/cong-trinh/",
    h1: "Công trình",
    tag: `${NHA_CUA.length} nhà cửa · ${ds.length} thứ xây được`,
    muc: [
      ["nha", "Nhà cửa dựng sẵn"],
      ["ds", "Xây được những gì"],
      ["bang", "Bảng so sánh"],
      ["xay", "Xây thế nào"],
    ],
    body,
  });
}

function congTrinhChiTiet(b) {
  const hd = Object.entries(b.effects ?? {});
  const TEN_HD = {
    waterRadius: "Tự tưới quanh nó",
    autoWet: "Ô luôn giữ ẩm",
    allSeason: "Trồng được quanh năm",
    speedMul: "Đi nhanh hơn",
  };
  const hop = `        <aside class="winfo">
          <div class="winfo-art">${cx(`build:${b.id}`, 112, b.name)}</div>
          <b class="winfo-ten">${esc(b.name)}</b>
          <dl>
            <dt>Giá</dt><dd>${b.price ? xu(b.price) : "không mua được"}</dd>
            <dt>Kiểu</dt><dd>${esc(KIEU_XAY[b.kind] ?? b.kind)}</dd>
            <dt>Đi qua</dt><dd>${b.solid ? "không" : "được"}</dd>
          </dl>
        </aside>`;
  const body = `
    <h2 id="lam">Nó làm gì</h2>
    <p>${esc(b.desc ?? "")}</p>
    ${hd.length
      ? `<div class="table-wrap"><table>
      <tbody>
${hd.map(([k, v]) => `        <tr><th scope="row">${esc(TEN_HD[k] ?? k)}</th><td>${typeof v === "boolean" ? (v ? "có" : "không") : esc(String(v))}</td></tr>`).join("\n")}
      </tbody>
    </table></div>`
      : ""}

    <h2 id="xay">Xây thế nào</h2>
    <ul class="wlist">
      <li>${b.price ? `Tốn ${xu(b.price)} một ô.` : "Đã dựng sẵn trên bản đồ — không mua, không xây."}</li>
      <li>Mở <b>chế độ xây dựng</b>, chọn ${esc(b.name)}, rồi kéo một đường; xem trước cả tuyến trước khi bấm.</li>
    </ul>

    <p class="wback"><a href="/cong-trinh/">← Về danh sách công trình</a></p>
`;
  return page({
    title: `${b.name} — OniFarm Wiki`,
    desc: `${b.name} trong OniFarm: ${b.desc ?? ""}`.slice(0, 155),
    url: "/cong-trinh/",
    h1: esc(b.name),
    tag: "công trình",
    hop,
    muc: [["lam", "Nó làm gì"], ["xay", "Xây thế nào"]],
    body,
  });
}

/* ------------------------------------------------------------------ ĐỊA HÌNH */

const TEN_NEN = {
  grass: "Cỏ", path: "Lối đi", asphalt: "Đường nhựa", concrete: "Bê tông",
  water: "Nước", wood: "Sàn gỗ", soil: "Đất cày",
};

/** Vật thể chia nhóm theo VIỆC người chơi làm với nó, không theo tên. */
function nhomVatThe() {
  const p = (id) => content.props[id];
  const co = (id) => !!p(id);
  const ds = content.propOrder.filter(co);
  const la = (id, ...ten) => ten.some((t) => id.includes(t));
  return [
    ["Cây cối", ds.filter((id) => la(id, "tree", "sapling", "palm", "willow", "maple", "bamboo", "pine", "birch"))],
    ["Đá", ds.filter((id) => la(id, "rock", "boulder"))],
    ["Gỗ chết", ds.filter((id) => la(id, "log", "stump", "branch", "twig", "deadfall", "driftwood", "roots"))],
    ["Cỏ và bụi", ds.filter((id) => la(id, "grass", "bush"))],
    ["Công trình có sẵn", ds.filter((id) => la(id, "house", "door", "shop", "counter", "warehouse", "kennel", "well", "wall", "pier", "bridge", "sign", "trough", "bench", "bed", "waterfall"))],
    ["Đồ trong nhà", ds.filter((id) => la(id, "table", "chair", "rug", "shelf", "cabinet", "stove", "sink", "lamp", "potplant", "clock", "painting", "sofa", "barrel", "crate"))],
  ].map(([ten, ids]) => [ten, [...new Set(ids)]]);
}

function diaHinhPage() {
  const nhom = nhomVatThe();
  const daKe = new Set(nhom.flatMap(([, ids]) => ids));
  const conLai = content.propOrder.filter((id) => content.props[id] && !daKe.has(id));
  if (conLai.length) nhom.push(["Khác", conLai]);

  const the = (id) => `        <a class="chip" href="/dia-hinh/${id}/">
          ${cx(`prop:${id}`, 40, content.props[id].name)}<span>${esc(content.props[id].name)}</span>
        </a>`;

  /* Luật của NỀN nằm trong `tiles.grounds` chứ không phải ở gốc content — lấy
     sai chỗ thì mọi nền ra "đi qua được, 1×", tức là bảng nói ngược hẳn với
     game ở đúng dòng quan trọng nhất (mặt nước chắn đường). */
  const nen = Object.entries(TEN_NEN).map(([id, ten]) => {
    const g = content.tiles?.grounds?.[id] ?? {};
    return `          <tr>
            <th scope="row">${esc(ten)}</th>
            <td>${g.solid ? "<b>không</b>" : "được"}</td>
            <td>${g.speedMul ? `<b>${g.speedMul}×</b>` : "1×"}</td>
            <td>${id === "soil" ? "cày rồi mới gieo được" : id === "water" ? "múc nước, thả cá, đi thuyền" : id === "grass" ? "cày được trong lô ruộng" : "—"}</td>
          </tr>`;
  });

  const body = `
    <h2 id="nen">Nền đất</h2>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Nền</th><th>Đi qua</th><th>Tốc độ</th><th>Làm gì trên đó</th></tr></thead>
        <tbody>
${nen.join("\n")}
        </tbody>
      </table>
    </div>

${nhom
  .filter(([, ids]) => ids.length)
  .map(
    ([ten, ids], i) => `    <h2 id="v${i}">${esc(ten)} <span class="wdem">${ids.length} thứ</span></h2>
    <div class="chips">
${ids.map(the).join("\n")}
    </div>`,
  )
  .join("\n\n")}
`;
  return page({
    title: "Địa hình — OniFarm Wiki",
    desc: "Nền đất và toàn bộ vật thể trên bản đồ OniFarm: cây, đá, gỗ chết, cỏ bụi, công trình có sẵn và đồ trong nhà.",
    url: "/dia-hinh/",
    h1: "Địa hình",
    tag: `${content.propOrder.length} vật thể`,
    muc: [["nen", "Nền đất"], ...nhom.filter(([, ids]) => ids.length).map(([ten], i) => [`v${i}`, ten])],
    body,
  });
}

const TEN_CONG_CU = { CHOP: "Rìu", MINE: "Cuốc chim", TILL: "Cuốc", WATER: "Bình tưới" };

function diaHinhChiTiet(id) {
  const p = content.props[id];
  const rot = (p.drops ?? []).map((d) => `${nhan(d.id, 26)} ×${d.min === d.max ? d.min : `${d.min}–${d.max}`}`);
  const hop = `        <aside class="winfo">
          <div class="winfo-art">${cx(`prop:${id}`, 112, p.name)}</div>
          <b class="winfo-ten">${esc(p.name)}</b>
          <dl>
            <dt>Đi qua</dt><dd>${p.solid ? "không" : "được"}</dd>
            ${p.hits ? `<dt>Số nhát</dt><dd>${p.hits}</dd>` : ""}
            ${p.tool ? `<dt>Cần</dt><dd>${esc(TEN_CONG_CU[p.tool] ?? p.tool)}</dd>` : ""}
            ${p.portable ? `<dt>Nhấc được</dt><dd>có</dd>` : ""}
            ${p.tall ? `<dt>Cao</dt><dd>hai ô</dd>` : ""}
          </dl>
        </aside>`;

  const body = `
    <h2 id="go">Gỡ nó ra sao</h2>
    <ul class="wlist">
      ${p.hits
        ? `<li>Đập <b>${p.hits} nhát</b>${p.tool ? ` bằng <b>${esc(TEN_CONG_CU[p.tool] ?? p.tool)}</b>` : ""}.</li>`
        : "<li>Không gỡ được — nó là một phần của bản đồ.</li>"}
      ${rot.length ? `<li>Rơi ra: ${rot.join(" · ")}.</li>` : ""}
      ${p.becomes ? `<li>Gỡ xong còn lại ${nhan(`prop:${p.becomes}`, 26)}.</li>` : ""}
      ${p.portable ? "<li><b>Nhấc được</b>: cầm lên rồi đặt xuống chỗ khác, không cần đập.</li>" : ""}
    </ul>

    <h2 id="net">Nét riêng</h2>
    <ul class="wlist">
      <li>Đi qua được: <b>${p.solid ? "không" : "có"}</b>.</li>
      ${p.sway ? `<li>Lay theo gió — càng bão càng nghiêng.</li>` : ""}
      ${p.seasonal ? "<li>Đổi màu theo mùa: xanh non mùa xuân, vàng cam mùa thu, bạc đi mùa đông.</li>" : ""}
      ${p.grow ? `<li>Lớn lên thành ${nhan(`prop:${p.grow.to}`, 26)} sau ${ngay(p.grow.days)}.</li>` : ""}
      ${p.frames ? `<li>Có <b>${p.frames} kiểu hình</b> — mở ra khi có người tới gần.</li>` : ""}
      ${p.spread ? "<li>Tự lan sang ô bên cạnh qua đêm.</li>" : ""}
      ${p.bridge ? "<li>Bắc qua mặt nước — đi lên được.</li>" : ""}
    </ul>

    <p class="wback"><a href="/dia-hinh/">← Về danh sách địa hình</a></p>
`;
  return page({
    title: `${p.name} — OniFarm Wiki`,
    desc: `${p.name} trong OniFarm: ${p.solid ? "chắn đường" : "đi qua được"}${p.hits ? `, đập ${p.hits} nhát` : ""}${rot.length ? ", có rơi vật liệu" : ""}.`,
    url: "/dia-hinh/",
    h1: esc(p.name),
    tag: "vật thể trên bản đồ",
    hop,
    muc: [["go", "Gỡ nó ra sao"], ["net", "Nét riêng"]],
    body,
  });
}


/* ---------------------------------------------------- THỜI TIẾT · BIỂU TƯỢNG

   Cường: "tôi cũng nhớ là có vẻ một bộ ảnh thời tiết và menu, mà sao không đưa
   vào trang tài liệu luôn".

   Đúng — hai bộ hình ấy nằm sẵn trong atlas và game dùng hàng ngày trên HUD,
   nhưng wiki chưa nhắc tới chúng lấy một dòng. Mà thời tiết thì đổi hẳn luật
   chơi của một ngày (mưa thì cây lớn nhanh hơn rưỡi, bão thì xe không tới), còn
   biểu tượng thì là thứ người chơi nhìn thấy nhiều nhất mà không ai giải thích.
--------------------------------------------------------------------------- */

function thoiTietPage() {
  const ds = Object.values(content.weathers ?? {});
  const tong = ds.reduce((a, w) => a + (w.weight ?? 0), 0) || 1;
  const pt = (w) => `${Math.round(((w.weight ?? 0) / tong) * 100)}%`;

  const the = (w) => `        <article class="ent" id="wx-${esc(w.id)}">
          <div class="ent-art">${cx(`weather:${w.id}`, 88, w.name)}</div>
          <div class="ent-main">
            <h3>${esc(w.name)}</h3>
            <p class="ent-sub">Gặp khoảng <b>${pt(w)}</b> số ngày</p>
            <dl class="facts">
              <div><dt>Cây lớn</dt><dd>${w.growMul === 1 ? "như thường" : `<b>${w.growMul}×</b>`}</dd></div>
              <div><dt>Sáng ra ruộng</dt><dd>${w.wet ? "<b>đã ẩm sẵn</b>" : "phải tự tưới"}</dd></div>
              <div><dt>Gió</dt><dd>${Math.round((w.wind ?? 0) * 100)}%</dd></div>
              <div><dt>Sâu bệnh</dt><dd>${w.diseaseMul === 1 ? "như thường" : `${w.diseaseMul}×`}</dd></div>
              ${w.speedMul ? `<div><dt>Đi lại</dt><dd><b>${w.speedMul}×</b> — chậm hơn</dd></div>` : ""}
              ${w.hot ? `<div><dt>Nắng gắt</dt><dd>quá trưa là ô ẩm khô, cây chưa tưới trông héo</dd></div>` : ""}
              ${w.storm ? `<div><dt>Quật cây</dt><dd>mỗi cây có ${Math.round(w.storm.cropChance * 100)}% lùi một giai đoạn</dd></div>` : ""}
              ${w.shelter ? `<div><dt>Vật nuôi</dt><dd>vào trú, người làm về đứng trước kho</dd></div>` : ""}
              ${w.halt ? `<div><dt>Xe và thuyền</dt><dd><b>không ghé</b> hôm nay</dd></div>` : ""}
              ${w.streak ? `<div><dt>Dầm</dt><dd>có thể kéo tới ${w.streak.max} ngày liền</dd></div>` : ""}
              ${w.fogUntil ? `<div><dt>Sương</dt><dd>phủ tới ${gioPhut(w.fogUntil)}</dd></div>` : ""}
            </dl>
          </div>
        </article>`;

  const body = `
    <h2 id="ds">Sáu kiểu trời</h2>
    <div class="ents">
${ds.map(the).join("\n")}
    </div>

    <h2 id="luat">Trời đổi luật thế nào</h2>
    <ul class="wlist">
      <li>Mỗi ngày đúng <b>một</b> kiểu, rút thăm theo trọng số từ hạt của ván — nên cùng một ván chơi lại vẫn ra cùng chuỗi thời tiết.</li>
      <li>Ngày mai được rút <b>sẵn từ hôm nay</b>, nên HUD hiện được dự báo. Thấy báo bão thì hôm nay đừng đợi xe.</li>
      <li>Ngày <b>ẩm</b> thì sáng ra mọi ô đã cày ngoài trời tự ẩm, và đêm không khô đi — khỏi tưới.</li>
      <li>Ô trong <b>nhà kính</b> không nghe lời trời: luôn ẩm và trồng được quanh năm.</li>
    </ul>

    <h2 id="bang">Bảng so sánh</h2>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Trời</th><th>Gặp</th><th>Cây lớn</th><th>Ẩm sẵn</th><th>Đi lại</th><th>Xe ghé</th></tr></thead>
        <tbody>
${ds
  .map(
    (w) => `          <tr>
            <th scope="row"><span class="ilk">${cx(`weather:${w.id}`, 30, w.name)}<span>${esc(w.name)}</span></span></th>
            <td class="num">${pt(w)}</td>
            <td class="num">${w.growMul}×</td>
            <td>${w.wet ? "có" : "không"}</td>
            <td class="num">${w.speedMul ?? 1}×</td>
            <td>${w.halt ? "không" : "có"}</td>
          </tr>`,
  )
  .join("\n")}
        </tbody>
      </table>
    </div>
`;
  return page({
    title: "Thời tiết — OniFarm Wiki",
    desc: "Sáu kiểu thời tiết trong OniFarm và mỗi kiểu đổi luật chơi ra sao: cây lớn nhanh chậm, ruộng có ẩm sẵn không, xe có ghé không.",
    url: "/thoi-tiet/",
    h1: "Thời tiết",
    tag: `${ds.length} kiểu trời`,
    muc: [["ds", "Sáu kiểu trời"], ["luat", "Trời đổi luật thế nào"], ["bang", "Bảng so sánh"]],
    body,
  });
}

/** Bộ biểu tượng của HUD và menu — thứ người chơi nhìn nhiều nhất mà không ai giải thích. */
const BIEU_TUONG = [
  ["coin", "Tiền", "Số tiền đang có, và giá của mọi thứ."],
  ["day", "Ngày", "Ngày thứ mấy của mùa đang chơi."],
  ["sun", "Ban ngày", "Đồng hồ đang trong giờ sáng."],
  ["moon", "Ban đêm", "Quá giờ tối — con vật đi ngủ, cây thôi lớn cho tới sáng."],
  ["energy", "Năng lượng", "Còn bao nhiêu sức. Hết sức thì không cày gieo tưới được nữa."],
  ["water", "Nước trong bình", "Còn mấy lần tưới. Múc thêm ở giếng hoặc bờ nước."],
  ["goal", "Mục tiêu", "Nấc tiến trình đang nhắm tới."],
  ["bag", "Balo", "Mở túi đồ."],
  ["build", "Xây dựng", "Bật chế độ xây, kéo một tuyến rồi xem trước cả tuyến."],
  ["power", "Tự động làm", "Bật thì người làm và nút tự động cùng chạy một thang việc."],
  ["gear", "Cài đặt", "Tay thuận, cỡ chữ, phóng to, rung."],
  ["help", "Hướng dẫn", "Bảng nhắc thao tác."],
  ["save", "Lưu game", "Ghi tiến trình xuống máy."],
  ["load", "Tải game", "Đọc lại bản đã ghi."],
  ["file", "Save ra/vào", "Xuất bản lưu thành tệp, hoặc nạp một tệp vào."],
  ["reload", "Cập nhật", "Kiểm tra bản mới."],
  ["install", "Cài về máy", "Thêm vào màn hình chính như một app."],
  ["bug", "Gỡ lỗi", "Bảng công cụ dành cho người làm game."],
];

function bieuTuongPage() {
  const body = `
    <h2 id="ds">Bộ biểu tượng</h2>
    <div class="chips">
${BIEU_TUONG.map(
  ([id, ten]) => `        <span class="chip">${cx(`ui:${id}`, 40, ten)}<span>${esc(ten)}</span></span>`,
).join("\n")}
    </div>

    <h2 id="nghia">Nghĩa từng cái</h2>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Biểu tượng</th><th>Tên</th><th>Nói gì</th></tr></thead>
        <tbody>
${BIEU_TUONG.map(
  ([id, ten, y]) => `          <tr>
            <td>${cx(`ui:${id}`, 34, ten)}</td>
            <th scope="row">${esc(ten)}</th>
            <td>${esc(y)}</td>
          </tr>`,
).join("\n")}
        </tbody>
      </table>
    </div>

    <p class="note">
      Bộ này vẽ bằng code trong chính atlas của game, không phải emoji: emoji là font của hệ điều hành
      nên mỗi máy ra một hình khác, mà một biểu tượng đổi hình theo máy thì nó thôi làm được việc của nó.
    </p>
`;
  return page({
    title: "Biểu tượng — OniFarm Wiki",
    desc: "Bộ biểu tượng của HUD và menu OniFarm: tiền, ngày, năng lượng, nước, balo, xây dựng, tự động làm — mỗi cái nói gì.",
    url: "/bieu-tuong/",
    h1: "Biểu tượng",
    tag: `${BIEU_TUONG.length} biểu tượng`,
    muc: [["ds", "Bộ biểu tượng"], ["nghia", "Nghĩa từng cái"]],
    body,
  });
}

/* ------------------------------------------------------------- NHÂN VẬT

   Cường: "thiếu trang nhân vật". Wiki này tra được cây, con, đồ, nhà, đất,
   trời — mà bỏ trống đúng cái thứ người chơi điều khiển suốt buổi. Và vì mỗi
   khung hình đã có tên và lý do tồn tại trong `atlas.ts`, trang này chỉ việc
   bày chúng ra: không có con số nào gõ tay.
--------------------------------------------------------------------------- */

/** Khi nào người làm hiện khung nào — chép luật từ `khungNguoiLam` trong draw.ts. */
const KHI_NAO_KHUNG = [
  ["Đang tưới hoặc đổ máng", "Nghiêng bình tưới"],
  ["Đang gieo hạt", "Ngồi xổm rồi nghiêng người"],
  ["Đang cày · chặt · đập đá", "Giơ lên rồi ra tay"],
  ["Hết sức, đang đi tìm chỗ nghỉ", "Mệt"],
  ["Đang ngồi nghỉ lại sức", "Ngồi nghỉ"],
  ["Trời mưa bão, về đứng trước kho", "Quệt mồ hôi"],
  ["Đang nói chuyện với người khác", "Nói chuyện"],
  ["Đang vuốt ve con vật", "Ngồi xổm"],
  ["Trên tay còn hàng, hoặc đang dỡ vào kho", "Bê đồ"],
  ["Đang đi", "Bốn khung bước chân"],
  ["Đứng chờ việc", "Thỉnh thoảng vẫy tay, chỉ tay hoặc quệt mồ hôi"],
];

function nhanVatPage() {
  const skins = content.workers?.skins ?? [];
  const ten = content.workers?.names ?? [];
  const w = content.workers ?? {};

  const huong = [["down", "quay xuống"], ["up", "quay lên"], ["left", "quay trái"], ["right", "quay phải"]];

  const theKhung = (k) => `        <article class="ent" id="k${k.i}">
          <div class="ent-art">${cx(`player:down:${k.i}`, 88, k.ten)}</div>
          <div class="ent-main">
            <h3>${esc(k.ten)}</h3>
            <p class="ent-sub">khung <b>${k.i}</b></p>
${k.mo ? `            <p>${esc(k.mo.charAt(0).toUpperCase() + k.mo.slice(1))}</p>` : ""}
          </div>
        </article>`;

  const hop = `        <aside class="winfo">
          <div class="winfo-art">${cx("player:down:0", 112, "Nhân vật chính")}</div>
          <p class="winfo-ten">Nhân vật</p>
          <dl>
            <dt>Tư thế</dt><dd><b>${SO_KHUNG_NGUOI}</b> khung mỗi hướng</dd>
            <dt>Hướng</dt><dd>4 — ${huong.map(([, t]) => t.replace("quay ", "")).join(" · ")}</dd>
            <dt>Tổng hình</dt><dd>${SO_KHUNG_NGUOI * 4} khung nhân vật</dd>
            <dt>Bộ đồ người làm</dt><dd>${skins.length}</dd>
            <dt>Thuê một người</dt><dd>${xu(w.hireFee ?? 0)}</dd>
            <dt>Lương</dt><dd>${xu(w.wage ?? 0)} mỗi ${w.wageEveryDays ?? 0} ngày</dd>
          </dl>
        </aside>`;

  const body = `
    <h2 id="ban">Bạn</h2>
    <p>Nhân vật bạn điều khiển có <b>${SO_KHUNG_NGUOI} tư thế</b> vẽ riêng cho <b>mỗi hướng</b> —
       tổng cộng ${SO_KHUNG_NGUOI * 4} khung hình. Game chọn khung theo <b>việc đang làm</b>,
       không phải theo nút bạn bấm: nhìn từ xa là đoán được người kia đang cày hay đang tưới.</p>

    <div class="wgal">
${huong
  .map(
    ([d, t]) => `      <figure class="wgal-o">${cx(`player:${d}:0`, 72, `Đứng ${t}`)}<figcaption>Đứng, ${esc(t)}</figcaption></figure>`,
  )
  .join("\n")}
    </div>

    <h3 id="di">Một nhịp bước chân</h3>
    <p>Bốn khung nối vòng, đổi khung theo quãng đường đã đi chứ không theo đồng hồ — nên đi chậm thì bước chậm.</p>
    <div class="wgal">
${[1, 2, 3, 4]
  .map((f) => `      <figure class="wgal-o">${cx(`player:right:${f}`, 72, `Bước ${f}`)}<figcaption>Bước ${f}</figcaption></figure>`)
  .join("\n")}
    </div>

    <h2 id="tu-the">${SO_KHUNG_NGUOI} tư thế</h2>
    <div class="ents">
${KHUNG_NGUOI.map(theKhung).join("\n")}
    </div>

    <h2 id="nguoi-lam">Người làm</h2>
    <p>Thuê ở <b>Chợ</b> ${xu(w.hireFee ?? 0)} một người, rồi trả lương ${xu(w.wage ?? 0)}
       mỗi <b>${w.wageEveryDays ?? 0} ngày</b>. Họ dùng <b>đúng bộ hình của nhân vật chính</b>,
       chỉ khác bảng màu áo · quần · nón · tóc — nên mọi tư thế ở trên, họ cũng làm được.</p>

    <div class="wgal">
${skins
  .map(
    (sk, i) =>
      `      <figure class="wgal-o">${cx(`worker:${i}:down:0`, 72, `Bộ đồ ${i + 1}`)}<figcaption>Bộ đồ ${i + 1}</figcaption></figure>`,
  )
  .join("\n")}
    </div>

    <h3 id="viec">Họ đang làm gì</h3>
    <div class="wgal">
${[
  [1, "worker:1:right:13", "Tưới"],
  [2, "worker:2:down:12", "Gieo"],
  [3, "worker:3:right:6", "Cày"],
  [0, "worker:0:down:7", "Bê hàng"],
  [1, "worker:1:down:8", "Hết sức"],
  [2, "worker:2:down:9", "Ngồi nghỉ"],
  [3, "worker:3:down:11", "Tán chuyện"],
  [0, "worker:0:down:10", "Vẫy tay"],
]
  .map(([, k, t]) => `      <figure class="wgal-o">${cx(k, 72, t)}<figcaption>${esc(t)}</figcaption></figure>`)
  .join("\n")}
    </div>

    <h3 id="khi-nao">Khi nào hiện khung nào</h3>
    <p>Xét theo thứ tự này, gặp dòng nào đúng trước thì dừng ở dòng đó:</p>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Lúc ấy họ đang</th><th>Thì bạn thấy</th></tr></thead>
        <tbody>
${KHI_NAO_KHUNG.map(([a, b]) => `          <tr><td>${esc(a)}</td><td><b>${esc(b)}</b></td></tr>`).join("\n")}
        </tbody>
      </table>
    </div>
    <p class="note">Người đứng chờ bốc cử chỉ theo <b>số hiệu của chính họ</b> và nhịp bốn giây, nên ba người
       đứng cạnh nhau không bao giờ cùng vẫy tay một lúc — mà ván chơi lại vẫn ra đúng chuỗi ấy.</p>

    <h3 id="ten">Họ tên gì</h3>
    <p>Tên bốc từ danh sách ${ten.length} cái: ${ten.map((t) => `<b>${esc(t)}</b>`).join(" · ")}.</p>

    <h3 id="suc">Sức và sức chở</h3>
    <div class="table-wrap">
      <table>
        <tbody>
          <tr><th scope="row">Năng lượng đầy</th><td>${w.energyMax ?? 0}</td></tr>
          <tr><th scope="row">Mỗi việc tốn</th><td>${w.energyPerTask ?? 0}</td></tr>
          <tr><th scope="row">Dưới mức này thì đi nghỉ</th><td>${w.restBelow ?? 0}</td></tr>
          <tr><th scope="row">Nghỉ bao lâu</th><td>${w.restMinutes ?? 0} phút trong game</td></tr>
          <tr><th scope="row">Ôm được</th><td>${w.carryMax ?? 0} món</td></tr>
          <tr><th scope="row">Tốc độ</th><td>${w.speed ?? 0}</td></tr>
        </tbody>
      </table>
    </div>

    <h2 id="cam">Cầm gì trên tay</h2>
    <p>Công cụ đang cầm hiện ngay trong tay nhân vật, và nó quyết định
       <a href="/hanh-dong/">nút hành động</a> nào sáng lên trên ô đất trước mặt.</p>
    <div class="chips">
${content.toolOrder
  .filter((id) => content.tools[id])
  .map((id) => `      ${nhan(`tool:${id}`, 40)}`)
  .join("\n")}
    </div>
`;

  return page({
    title: "Nhân vật — OniFarm Wiki",
    desc: `Nhân vật và người làm trong OniFarm: ${SO_KHUNG_NGUOI} tư thế mỗi hướng, khi nào hiện khung nào, tiền thuê và lương người làm.`,
    url: "/nhan-vat/",
    h1: "Nhân vật",
    tag: `${SO_KHUNG_NGUOI} tư thế · 4 hướng`,
    muc: [
      ["ban", "Bạn"],
      ["tu-the", `${SO_KHUNG_NGUOI} tư thế`],
      ["nguoi-lam", "Người làm"],
      ["cam", "Cầm gì trên tay"],
    ],
    hop,
    body,
  });
}

function luatChoiPage() {
  const b = content.balance;
  const nl = b.energyCost ?? {};
  const tenViec = {
    till: "Cày", water: "Tưới", plant: "Gieo", harvest: "Thu hoạch",
    build: "Xây", chop: "Chặt cây", mine: "Đập đá", cure: "Chữa bệnh", pull: "Nhổ bỏ",
  };
  const mua = content.seasonOrder.map((id) => content.seasons[id]?.name ?? id);
  const thoiTiet = Object.values(content.weathers ?? {}).map((w) => w.name).filter(Boolean);

  const body = `
    <section>
      <div class="wrap">
        <h2>Một ngày</h2>
        <div class="wgal">
          <figure class="wgal-o">${cx("ui:sun", 64, "Ban ngày")}<figcaption>Ban ngày</figcaption></figure>
          <figure class="wgal-o">${cx("ui:moon", 64, "Ban đêm")}<figcaption>Ban đêm</figcaption></figure>
          <figure class="wgal-o">${cx("ui:energy", 64, "Năng lượng")}<figcaption>Năng lượng</figcaption></figure>
          <figure class="wgal-o">${cx("ui:water", 64, "Nước trong bình")}<figcaption>Nước</figcaption></figure>
          <figure class="wgal-o">${cx("prop:bed", 64, "Giường")}<figcaption>Giường</figcaption></figure>
        </div>
        <p class="lead">Đồng hồ chạy liên tục theo thời gian thật. Một ngày trong game dài khoảng <b>${SO_LIEU.phutMoiNgayThat} phút</b> ngoài đời.</p>
        ${bangLuat([
          ["Thức dậy", `${SO_LIEU.gioDay}`],
          ["Trời tối", `${SO_LIEU.gioToi} — sau giờ này cây ngừng lớn`],
          ["Gục tại chỗ", `${SO_LIEU.gioNgat} — chưa lên giường thì ngất, mất một phần năng lượng`],
          ["Nhịp đồng hồ", `${b.realSecondsPerGameTenMinutes} giây thật = 10 phút trong game`],
          ["Năng lượng", `tối đa ${b.energyMax}; ngủ hồi lại đầy, ngủ muộn thì hồi ít hơn`],
          ["Túi đồ", `${b.inventorySlots} ô, trong đó ${b.hotbarSlots} ô ngoài thanh nhanh`],
          ["Tiền khởi đầu", `${xu(bal.startMoney)}`],
        ])}
        <p class="note">Ngủ <b>trên giường</b> mới sang ngày — cửa nhà chỉ để đi vào. Ngủ trong nhà thì ngoài ruộng vẫn lớn, vẫn khô, vẫn mọc cỏ.</p>
      </div>
    </section>

    <section class="alt">
      <div class="wrap">
        <h2>Vòng lõi</h2>
        <p class="lead">CÀY → GIEO → TƯỚI → chờ cây lớn → THU → BÁN.</p>
        <div class="wgal">
          <figure class="wgal-o">${cx("tool:hoe", 64, "Cuốc")}<figcaption>Cày — cuốc</figcaption></figure>
          <figure class="wgal-o">${cx("seed:tomato", 64, "Hạt giống")}<figcaption>Gieo — hạt</figcaption></figure>
          <figure class="wgal-o">${cx("tool:can", 64, "Bình tưới")}<figcaption>Tưới — bình</figcaption></figure>
          <figure class="wgal-o">${cx("crop:tomato:1", 64, "Cây non")}<figcaption>Cây lớn dần</figcaption></figure>
          <figure class="wgal-o">${cx("crop:tomato", 64, "Cây chín")}<figcaption>Thu</figcaption></figure>
          <figure class="wgal-o">${cx("prop:counter", 64, "Quầy thu mua")}<figcaption>Bán</figcaption></figure>
        </div>
        <div class="grid">
          <div class="card"><h3>Cây lớn theo thời gian</h3>
            <p>Ô còn <b>ẩm</b> và trời còn sáng thì cây lớn dần trông thấy trong ngày, không nhảy cóc lúc ngủ. Đi ngủ sớm vẫn được cộng nốt phần ban ngày còn lại — không bị phạt.</p></div>
          <div class="card"><h3>Mỗi nhát tốn năng lượng</h3>
            <p>${Object.entries(nl).map(([k, v]) => `${tenViec[k] ?? k} ${v}`).join(" · ")}. Thao tác khoá tay ${b.actionSeconds}s và chỉ ăn ở giữa nhịp — bấm loạn không nhanh hơn.</p></div>
          <div class="card"><h3>Bỏ bê thì hoang</h3>
            <p>Đất đã cày mà bỏ không <b>${b.tilledIdleDays} đêm</b> thì mọc cỏ và trở lại như cũ. Cỏ dại lan sang ô cỏ trống kề bên, ${Math.round((b.grassSpreadChance ?? 0) * 100)}% mỗi đêm.</p></div>
          <div class="card"><h3>Bệnh lan theo luống</h3>
            <p>Mỗi đêm cây đang lớn có ${Math.round((b.diseaseChance ?? 0) * 100)}% nhiễm bệnh, và <b>gấp ${b.diseaseNeighbourMul} lần</b> nếu nằm cạnh cây bệnh. Cây bệnh không lớn và chỉ thu được ${Math.round((b.sickYieldMul ?? 0) * 100)}% sản lượng.</p></div>
        </div>
      </div>
    </section>

    <section>
      <div class="wrap">
        <h2>Bốn mùa</h2>
        <div class="wgal">
${Object.values(content.weathers ?? {})
  .map((w) => `          <figure class="wgal-o">${cx(`weather:${w.id}`, 64, w.name)}<figcaption>${esc(w.name)}</figcaption></figure>`)
  .join("\n")}
        </div>
        <p class="lead">Mỗi mùa <b>${SO_LIEU.ngayMoiMua} ngày</b>: ${mua.join(" → ")} → rồi quay lại. ${thoiTiet.length ? `Thời tiết rút mỗi ngày một kiểu trong ${thoiTiet.length}: ${thoiTiet.join(", ")}.` : ""}</p>
        ${bangLuat([
          ["Trái mùa", "gieo không được"],
          ["Sang mùa", "cây <b>chưa chín</b> mà trái mùa thì héo"],
          ["Cây đã chín", "không bao giờ mất — vụ đang chờ gặt luôn an toàn"],
          ["Nhà kính", "sàn nhà kính miễn nhiễm mùa, trồng gì cũng được quanh năm"],
        ])}
      </div>
    </section>

    <section class="alt">
      <div class="wrap">
        <h2>Chăn nuôi</h2>
        <div class="wgal">
${content.animalOrder
  .filter((id) => content.animals[id] && content.animals[id].job !== "pest")
  .slice(0, 7)
  .map(
    (id) =>
      `          <figure class="wgal-o"><a href="/vat-nuoi/${esc(id)}/">${cx(`animal:${id}`, 64, content.animals[id].name)}<figcaption>${esc(content.animals[id].name)}</figcaption></a></figure>`,
  )
  .join("\n")}
          <figure class="wgal-o"><a href="/dia-hinh/trough/">${cx("prop:trough", 64, "Máng thức ăn")}<figcaption>Máng</figcaption></a></figure>
        </div>
        <p class="lead">${SO_LIEU.soLoai} loài, mỗi loài có khu riêng dựng sẵn — không phải tự đóng rào.</p>
        <div class="grid">
          <div class="card"><h3>Máng là cửa duy nhất</h3>
            <p>Không cho ăn trực tiếp. Đổ vào <b>máng</b> (trên cạn) hoặc <b>rắc xuống hồ</b> (dưới nước). Máng là một bể điểm chung, trần ${b.troughMax} phần: món nào cũng đổ được, món đắt thì no lâu hơn.</p></div>
          <div class="card"><h3>Khu quyết định ăn gì</h3>
            <p>Bò, dê, cừu cùng ăn rơm nên dùng <b>chung một máng</b>. Gà vịt mổ sâu trên cỏ nên khu của chúng cố ý không có máng.</p></div>
          <div class="card"><h3>Cỏ là thức ăn thật</h3>
            <p>Con vật đói tự tìm bụi cỏ gần nhất và <b>ăn mất bụi cỏ đó</b>. Đàn đông sẽ gặm trụi quanh chuồng — phải chừa cỏ hoặc cắt cỏ tích rơm.</p></div>
          <div class="card"><h3>Đói quá thì chết</h3>
            <p>Hết cỏ, hết máng thì đói tiếp, và quá số ngày chịu đói của loài đó thì chết. Thẻ từng con cho biết còn no bao lâu.</p></div>
        </div>
        <p class="note"><a href="/vat-nuoi/">Xem chi tiết từng loài →</a></p>
      </div>
    </section>

    <section>
      <div class="wrap">
        <h2>Người làm thuê</h2>
        <div class="wgal">
          <figure class="wgal-o">${cx("worker:0:down:0", 64, "Người làm")}<figcaption>Đứng chờ</figcaption></figure>
          <figure class="wgal-o">${cx("worker:1:right:6", 64, "Cày")}<figcaption>Cày</figcaption></figure>
          <figure class="wgal-o">${cx("worker:2:down:13", 64, "Tưới")}<figcaption>Tưới</figcaption></figure>
          <figure class="wgal-o">${cx("worker:3:down:7", 64, "Bê hàng")}<figcaption>Bê hàng</figcaption></figure>
        </div>
        <p class="note"><a href="/nhan-vat/">Xem đủ ${SO_KHUNG_NGUOI} tư thế ở trang Nhân vật →</a></p>
        ${bangLuat([
          ["Thuê", `${xu(content.workers?.hireFee ?? 0)} một người`],
          ["Lương", `${xu(content.workers?.wage ?? 0)} mỗi ${SO_LIEU.ngayTraLuong} ngày`],
          ["Giao việc", "chăm cây <i>hoặc</i> chăn nuôi — trong phạm vi đó họ tự chọn việc"],
          ["Thứ tự ưu tiên", "cố định, không ngẫu nhiên — nên đoán được họ sẽ làm gì"],
          ["Rảnh việc", "đi kiếm gỗ đá trong rừng, không đụng cây cảnh bạn trồng"],
          ["Đầy tay", `mang về kho (${content.workers?.carryMax ?? 0} món)`],
        ])}
      </div>
    </section>

    <section class="alt">
      <div class="wrap">
        <h2>Mua bán</h2>
        <div class="wgal">
          <figure class="wgal-o"><a href="/dia-hinh/shop/">${cx("prop:shop", 64, "Chợ hạt giống")}<figcaption>Chợ</figcaption></a></figure>
          <figure class="wgal-o"><a href="/dia-hinh/counter/">${cx("prop:counter", 64, "Quầy thu mua")}<figcaption>Quầy</figcaption></a></figure>
          <figure class="wgal-o"><a href="/dia-hinh/warehouse/">${cx("prop:warehouse", 64, "Nhà kho")}<figcaption>Kho</figcaption></a></figure>
          <figure class="wgal-o">${cx("ui:coin", 64, "Tiền")}<figcaption>Tiền</figcaption></figure>
        </div>
        <div class="grid">
          <div class="card"><h3>Chợ và Quầy đứng hai đầu</h3>
            <p>Chợ để mua, Quầy thu mua để bán. Không ô nào bấm trúng cả hai.</p></div>
          <div class="card"><h3>Không có gì bị khoá</h3>
            <p>Cửa hàng bán mọi thứ ngay từ đầu — có tiền là mua được. ${SO_LIEU.soNac} nấc tiến trình chỉ đánh dấu chặng đường và phát thưởng, không mở khoá hàng hoá.</p></div>
          <div class="card"><h3>Mua con vật thì có xe chở tới</h3>
            <p>Xe chạy từ cổng vào theo đường nhựa, đậu ở kho rồi thả hàng. Mua cá thì xe đậu ở bờ ao. Không có đường thì xe không tới được.</p></div>
          <div class="card"><h3>Xe thu mua ghé kho</h3>
            <p>Gom sạch nông sản trong kho và trả cao hơn quầy một chút — bán buôn thì lời hơn bán lẻ.</p></div>
        </div>
      </div>
    </section>

    <section>
      <div class="wrap">
        <h2>Ba cách làm việc</h2>
        <p class="lead">Khác nhau ở đúng một điểm: có tự đổi món đang cầm hay không.</p>
        ${bangLuat([
          ["Nút DÙNG", "làm đúng ô đang ngắm. Không đổi món."],
          ["CHUYẾN", "món đang cầm quyết định việc và khu; tự đi khắp khu mà làm, làm gọn từng lô. <b>Không bao giờ</b> đổi món."],
          ["AUTO", "tự đổi món theo bậc ưu tiên THU → CHỮA → GIEO → TƯỚI → CÀY, quanh chỗ đứng."],
        ])}
        <p class="note">AUTO tự tắt khi bạn cầm lái, khi quanh đó hết việc, hoặc khi 4 giây liền không có tiến triển.</p>
      </div>
    </section>

    <section class="alt">
      <div class="wrap">
        <h2>Còn nữa</h2>
        <div class="grid">
          <div class="card"><h3>${SO_LIEU.soCongThuc} công thức chế biến</h3>
            <p>Một nguyên liệu → một món bán lãi hơn: phô mai, cuộn len, cà phê rang, mứt dâu, chả cá…</p></div>
          <div class="card"><h3>Ăn để hồi sức</h3>
            <p>Mọi cây và trứng/sữa đều ăn được — đầu ra thứ hai cho nông sản, và là cách gỡ khi hết năng lượng giữa đồng.</p></div>
          <div class="card"><h3>Chế độ xây dựng</h3>
            <p>Dừng đồng hồ lại, kéo thả để quy hoạch. Vẽ bao nhiêu tính tiền bấy nhiêu, xem trước rồi mới trả.</p></div>
          <div class="card"><h3>Save nằm trên máy bạn</h3>
            <p>Không tài khoản, không máy chủ. Xuất ra file để mang sang máy khác.</p></div>
        </div>
      </div>
    </section>
  `;

  return page({
    title: "Lối chơi — OniFarm Wiki",
    desc: `Toàn bộ luật chơi OniFarm: một ngày dài bao lâu, cây lớn thế nào, ${SO_LIEU.soMua} mùa, bệnh cây, cho vật nuôi ăn, thuê người làm, mua bán. Số liệu lấy thẳng từ bản đang chơi.`,
    url: "/loi-choi/",
    h1: "Lối chơi",
    tag: "Mọi thứ cần biết để chơi. Số liệu lấy thẳng từ bản đang chơi, không gõ tay.",
    body,
  });
}

/* --------------------------------------------------------------------- chạy */

/* Hai trang viết TAY còn lại: vỏ ở đây, CHỮ trong `src/site/noi-dung/*.html`.
   Bốn trang giới thiệu cũ (Tính năng · Hướng dẫn · Cách game vận hành · Cài về
   máy) đã gỡ theo yêu cầu của Cường — chúng nói VỀ game cho người chưa chơi,
   còn wiki thì nói về THỨ TRONG game cho người đang chơi. */
const outs = [
  write("", trangChinhPage()),
  write("loi-choi", luatChoiPage()),
  write("cay-trong", cropsPage()),
  write("vat-nuoi", animalsPage()),
  write("vat-pham", vatPhamPage()),
  write("cong-trinh", congTrinhPage()),
  write("dia-hinh", diaHinhPage()),
  write("thoi-tiet", thoiTietPage()),
  write("nhan-vat", nhanVatPage()),
  write("hanh-dong", actionsPage()),
  write("bieu-tuong", bieuTuongPage()),
  write("tac-gia", tacGiaPage()),
  write(
    "privacy",
    page({
      url: "/privacy/",
      h1: "Quyền riêng tư",
      tag: "ngắn thôi",
      title: "Quyền riêng tư — OniFarm Wiki",
      desc: "OniFarm không thu thập gì cả: không tài khoản, không máy chủ, không quảng cáo. Toàn bộ tiến trình nằm trên máy bạn.",
      body: noiDung("privacy"),
    }),
  ),
  /* MỖI MÓN MỘT TRANG — đây là thứ tách một cái wiki khỏi một trang danh sách:
     tra tới đâu cũng có chỗ để dừng lại đọc kỹ. */
  ...moiVatPham().map((v) => write(`vat-pham/${v.slug}`, vatPhamChiTiet(v))),
  ...content.cropOrder.map((id) => write(`cay-trong/${id}`, cropDetailPage(content.crops[id]))),
  ...content.animalOrder.map((id) => write(`vat-nuoi/${id}`, animalDetailPage(content.animals[id]))),
  ...content.buildingOrder
    .filter((id) => content.buildings[id])
    .map((id) => write(`cong-trinh/${id}`, congTrinhChiTiet(content.buildings[id]))),
  ...content.propOrder
    .filter((id) => content.props[id])
    .map((id) => write(`dia-hinh/${id}`, diaHinhChiTiet(id))),
];

/* ---- soát: trang HÀNH ĐỘNG phải khớp với mã, không phải với trí nhớ -------

   Trang này từng dạy một nút "CHO ĂN — đứng cạnh con vật và bấm" suốt ba đợt
   SAU KHI cho ăn trực tiếp đã bị gỡ khỏi game (Đợt 12 đưa thức ăn về đúng một
   cửa là cái máng). Không ai nói dối: danh sách hành động là chữ viết tay,
   còn `UseKind` là mã — hai thứ không có gì buộc phải khớp nhau.

   Giờ có: đọc `UseKind` thẳng từ `src/game/actions.ts` và đòi mọi việc LÀM
   TRÊN MỘT Ô đều có mặt trên trang. Thêm một hành động vào game mà quên viết
   cho nó một mục thì build đỏ.

   `putdown` cố ý không đòi riêng: nó là mặt kia của `lift` (đang vác thì nút
   đổi thành ĐẶT) và mục NHẤC đã kể cả hai. */
const VIEC_TREN_O = (() => {
  const src = readFileSync(resolve(ROOT, "src/game/actions.ts"), "utf8");
  const khoi = src.slice(src.indexOf("export type UseKind ="));
  const het = khoi.indexOf("null;");
  return [...khoi.slice(0, het).matchAll(/"(\w+)"/g)].map((m) => m[1]);
})();

/** Việc trong mã → nút trên trang. Sửa mã mà quên trang thì build đỏ ở dưới. */
const NUT_CUA_VIEC = {
  till: "CÀY", plant: "GIEO", water: "TƯỚI", harvest: "THU", cure: "CHỮA",
  pull: "NHỔ", chop: "CHẶT", mine: "ĐẬP", build: "XÂY",
  pour: "ĐỔ MÁNG", feedpond: "RẮC HỒ", lift: "NHẤC", putdown: "NHẤC",
  clear: "DỌN CỎ",
};

{
  const coTrenTrang = new Set(HANH_DONG.map((h) => h.nut));
  const thieu = VIEC_TREN_O.filter((v) => !coTrenTrang.has(NUT_CUA_VIEC[v]));
  if (thieu.length) {
    throw new Error(
      `src/game/actions.ts có việc ${thieu.join(", ")} mà trang Hành động không kể tới — ` +
        "thêm mục cho nó trong HANH_DONG, hoặc ánh xạ nó trong NUT_CUA_VIEC",
    );
  }
}

/* Mọi mục trong NAV phải có trang thật — thêm mục mà quên sinh trang thì đây
   là chỗ bắt được, chứ không phải người dùng bấm vào rồi gặp 404. */
for (const [href] of NAV) {
  const d = href.replace(/^\/|\/$/g, "");
  if (!outs.some((o) => o.endsWith(`${d}/index.html`) || (d === "" && o.endsWith("src/index.html")))) {
    throw new Error(`NAV có mục ${href} nhưng không trang nào được sinh ra cho nó`);
  }
}

console.log(
  `✓ site → ${outs.length} trang · ${content.cropOrder.length} cây · ${content.animalOrder.length} loài · ${HANH_DONG.length} hành động · ${SO_LIEU.soKichBan} kịch bản`,
);
