/* ============================================================================
   SCHEMA — kiểm tra content pack TRƯỚC khi cho nó chạm vào game.

   Vì content đến từ OTA (có thể là file lạ, file hỏng, file của phiên bản khác),
   đây là biên giới không tin cậy. Mọi thứ đi qua đây đều bị soi. Hàm trả về
   DANH SÁCH lỗi thay vì ném ngoại lệ ở lỗi đầu tiên — để báo cáo một lần đủ ý.

   Không dùng thư viện ngoài: giữ core không phụ thuộc, chạy được cả trong Node.
============================================================================ */

type Any = Record<string, unknown>;

const isObj = (v: unknown): v is Any =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === "string";

class Check {
  errors: string[] = [];
  path: string;
  constructor(path: string) {
    this.path = path;
  }

  private at(k: string) {
    return this.path ? `${this.path}.${k}` : k;
  }

  fail(k: string, why: string) {
    this.errors.push(`${this.at(k)}: ${why}`);
  }

  obj(src: Any, k: string): Any | null {
    const v = src[k];
    if (!isObj(v)) {
      this.fail(k, "phải là object");
      return null;
    }
    return v;
  }

  arr(src: Any, k: string): unknown[] | null {
    const v = src[k];
    if (!Array.isArray(v)) {
      this.fail(k, "phải là mảng");
      return null;
    }
    return v;
  }

  str(src: Any, k: string): string | null {
    const v = src[k];
    if (!isStr(v) || v.length === 0) {
      this.fail(k, "phải là chuỗi khác rỗng");
      return null;
    }
    return v;
  }

  num(src: Any, k: string, min = -Infinity, max = Infinity): number | null {
    const v = src[k];
    if (!isNum(v)) {
      this.fail(k, "phải là số");
      return null;
    }
    if (v < min || v > max) {
      this.fail(k, `phải nằm trong [${min}, ${max}], nhận ${v}`);
      return null;
    }
    return v;
  }

  enumStr<T extends string>(src: Any, k: string, allowed: readonly T[]): T | null {
    const v = src[k];
    if (!isStr(v) || !(allowed as readonly string[]).includes(v)) {
      this.fail(k, `phải là một trong [${allowed.join(", ")}]`);
      return null;
    }
    return v as T;
  }

  child(k: string): Check {
    const c = new Check(this.at(k));
    // gom lỗi con vào cha khi kết thúc — gọi merge() sau khi dùng xong
    return c;
  }

  merge(c: Check) {
    this.errors.push(...c.errors);
  }
}

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Phải khớp với kiểu CropForm trong src/game/types.ts. */
const CROP_FORMS = ["leafy", "root", "vine", "stalk", "bush", "grain", "flower"] as const;

function colors(c: Check, src: Any, keys: string[], where: string) {
  for (const k of keys) {
    const v = src[k];
    if (!isStr(v) || !HEX.test(v)) c.fail(`${where}.${k}`, "phải là màu hex dạng #rrggbb");
  }
}

/* -------------------------------------------------------------------------- */

export function validateCrops(raw: unknown): string[] {
  const c = new Check("crops.json");
  if (!isObj(raw)) return ["crops.json: phải là object"];
  const list = c.arr(raw, "crops");
  if (!list) return c.errors;
  if (list.length === 0) c.fail("crops", "phải có ít nhất một cây");

  const seen = new Set<string>();
  list.forEach((item, i) => {
    const k = new Check(`crops[${i}]`);
    if (!isObj(item)) {
      c.fail(`crops[${i}]`, "phải là object");
      return;
    }
    const id = k.str(item, "id");
    if (id) {
      if (seen.has(id)) k.fail("id", `trùng id '${id}'`);
      seen.add(id);
    }
    k.str(item, "name");
    k.str(item, "seedName");
    k.num(item, "seedPrice", 0);
    k.num(item, "sellPrice", 0);
    const gd = k.arr(item, "growthDays");
    if (gd) {
      if (gd.length === 0) k.fail("growthDays", "phải có ít nhất một giai đoạn");
      gd.forEach((d, j) => {
        if (!isNum(d) || d < 1 || !Number.isInteger(d))
          k.fail(`growthDays[${j}]`, "phải là số nguyên >= 1");
      });
    }
    const rg = item["regrowDays"];
    if (rg !== null && (!isNum(rg) || rg < 1))
      k.fail("regrowDays", "phải là null hoặc số >= 1");
    // seasons TUỲ CHỌN: pack cũ không có trường này thì cây gieo được quanh
    // năm — giữ nguyên hành vi trước khi có mùa. Có thì phải là mảng chuỗi;
    // tên mùa lạ được bắt ở loader (chỗ đó mới biết danh sách mùa).
    const seasons = item["seasons"];
    if (seasons !== undefined) {
      if (!Array.isArray(seasons)) k.fail("seasons", "phải là mảng tên mùa");
      else
        seasons.forEach((v, j) => {
          if (!isStr(v)) k.fail(`seasons[${j}]`, "phải là chuỗi");
        });
    }
    const ymin = k.num(item, "yieldMin", 1);
    const ymax = k.num(item, "yieldMax", 1);
    if (ymin !== null && ymax !== null && ymax < ymin)
      k.fail("yieldMax", "phải >= yieldMin");
    const art = k.obj(item, "art");
    if (art) {
      // form là TUỲ CHỌN: pack cũ không có trường này vẫn hợp lệ và vẫn vẽ như xưa.
      // Nhưng nếu có mà sai tên thì phải chặn — không lẳng lặng rơi về "leafy",
      // vì như thế một lỗi chính tả sẽ biến cả ruộng dưa thành cây lá.
      if (art["form"] !== undefined)
        k.enumStr(art, "form", CROP_FORMS);
      colors(k, art, ["stem", "leaf", "leafDark", "fruit", "fruitDark"], "art");
      for (const n of ["height", "leaves", "spread", "fruitCount", "fruitSize"])
        if (!isNum(art[n]) || (art[n] as number) < 0) k.fail(`art.${n}`, "phải là số >= 0");
    }
    c.merge(k);
  });
  return c.errors;
}

export function validateBuildings(raw: unknown): string[] {
  const c = new Check("buildings.json");
  if (!isObj(raw)) return ["buildings.json: phải là object"];
  const list = c.arr(raw, "buildings");
  if (!list) return c.errors;

  const seen = new Set<string>();
  list.forEach((item, i) => {
    const k = new Check(`buildings[${i}]`);
    if (!isObj(item)) {
      c.fail(`buildings[${i}]`, "phải là object");
      return;
    }
    const id = k.str(item, "id");
    if (id) {
      if (seen.has(id)) k.fail("id", `trùng id '${id}'`);
      seen.add(id);
    }
    k.str(item, "name");
    k.str(item, "desc");
    k.num(item, "price", 0);
    k.enumStr(item, "kind", ["floor", "object"] as const);
    if (typeof item["solid"] !== "boolean") k.fail("solid", "phải là boolean");
    if (item["autotile"] !== undefined) k.enumStr(item, "autotile", ["fence"] as const);

    const eff = k.obj(item, "effects");
    if (eff) {
      const allowed = ["waterRadius", "autoWet", "allSeason", "speedMul", "income", "harvestRadius"];
      for (const key of Object.keys(eff))
        if (!allowed.includes(key))
          k.fail(`effects.${key}`, `hiệu ứng không được core hỗ trợ (core biết: ${allowed.join(", ")})`);
      for (const n of ["waterRadius", "income", "harvestRadius"])
        if (eff[n] !== undefined && (!isNum(eff[n]) || (eff[n] as number) < 0))
          k.fail(`effects.${n}`, "phải là số >= 0");
      if (eff["autoWet"] !== undefined && typeof eff["autoWet"] !== "boolean")
        k.fail("effects.autoWet", "phải là boolean");
    }

    const pw = k.obj(item, "power");
    if (pw) {
      k.merge(numsIn(pw, ["produce", "consume"], `buildings[${i}].power`));
    }
    const art = k.obj(item, "art");
    if (art) colors(k, art, ["body", "dark", "accent"], "art");
    c.merge(k);
  });
  return c.errors;
}

function numsIn(src: Any, keys: string[], path: string): Check {
  const c = new Check(path);
  for (const k of keys)
    if (!isNum(src[k]) || (src[k] as number) < 0) c.fail(k, "phải là số >= 0");
  return c;
}

export function validateItems(raw: unknown): string[] {
  const c = new Check("items.json");
  if (!isObj(raw)) return ["items.json: phải là object"];
  const list = c.arr(raw, "tools");
  if (list)
    list.forEach((item, i) => {
      const k = new Check(`tools[${i}]`);
      if (!isObj(item)) {
        c.fail(`tools[${i}]`, "phải là object");
        return;
      }
      k.str(item, "id");
      k.str(item, "name");
      k.enumStr(item, "action", ["TILL", "WATER", "CHOP", "MINE"] as const);
      if (item["power"] !== undefined) k.num(item, "power", 1, 10);
      if (item["capacity"] !== undefined) k.num(item, "capacity", 1, 999);
      if (item["action"] === "WATER" && item["capacity"] === undefined)
        k.fail("capacity", "công cụ tưới phải khai sức chứa");
      c.merge(k);
    });

  const mats = c.arr(raw, "materials");
  if (mats)
    mats.forEach((m, i) => {
      const k = new Check(`materials[${i}]`);
      if (!isObj(m)) {
        c.fail(`materials[${i}]`, "phải là object");
        return;
      }
      k.str(m, "id");
      k.str(m, "name");
      k.num(m, "sellPrice", 0);
      if (m["buyPrice"] !== undefined) k.num(m, "buyPrice", 0);
      c.merge(k);
    });
  return c.errors;
}

const INTERACTS = ["SLEEP", "SHOP", "SELL", "REFILL", "CRAFT", "PORTAL", "STORE"] as const;
const TOOL_ACTIONS = ["TILL", "WATER", "CHOP", "MINE"] as const;

export function validateProps(raw: unknown): string[] {
  const c = new Check("props.json");
  if (!isObj(raw)) return ["props.json: phải là object"];
  const list = c.arr(raw, "props");
  if (!list) return c.errors;

  const seen = new Set<string>();
  list.forEach((item, i) => {
    const k = new Check(`props[${i}]`);
    if (!isObj(item)) {
      c.fail(`props[${i}]`, "phải là object");
      return;
    }
    const id = k.str(item, "id");
    if (id) {
      if (seen.has(id)) k.fail("id", `trùng id '${id}'`);
      seen.add(id);
    }
    k.str(item, "name");
    if (typeof item["solid"] !== "boolean") k.fail("solid", "phải là boolean");
    if (item["tall"] !== undefined && typeof item["tall"] !== "boolean")
      k.fail("tall", "phải là boolean");
    if (item["hits"] !== undefined) k.num(item, "hits", 1, 99);
    if (item["tool"] !== undefined) k.enumStr(item, "tool", TOOL_ACTIONS);
    if (item["becomes"] !== undefined && !isStr(item["becomes"]))
      k.fail("becomes", "phải là chuỗi id prop");
    if (item["interact"] !== undefined) k.enumStr(item, "interact", INTERACTS);

    const drops = item["drops"];
    if (drops !== undefined) {
      if (!Array.isArray(drops)) k.fail("drops", "phải là mảng");
      else
        drops.forEach((d, j) => {
          if (!isObj(d)) return k.fail(`drops[${j}]`, "phải là object");
          if (!isStr(d["id"])) k.fail(`drops[${j}].id`, "phải là chuỗi");
          const mn = d["min"];
          const mx = d["max"];
          if (!isNum(mn) || mn < 0) k.fail(`drops[${j}].min`, "phải là số >= 0");
          if (!isNum(mx) || (isNum(mn) && mx < mn)) k.fail(`drops[${j}].max`, "phải >= min");
        });
      if (item["hits"] === undefined) k.fail("drops", "có drops thì phải có hits");
    }

    const portal = item["portal"];
    if (portal !== undefined) {
      if (!isObj(portal)) k.fail("portal", "phải là object {x,y}");
      else {
        if (!isNum(portal["x"]) || !isNum(portal["y"])) k.fail("portal", "x,y phải là số");
      }
      if (item["interact"] !== "PORTAL") k.fail("portal", "chỉ có nghĩa khi interact = PORTAL");
    }
    if (item["interact"] === "PORTAL" && portal === undefined)
      k.fail("interact", "PORTAL thì phải khai portal {x,y}");

    // ---- lớn theo ngày / lan / bị bão quật (core 1.3) ----
    const grow = item["grow"];
    if (grow !== undefined) {
      if (!isObj(grow)) k.fail("grow", "phải là object {to, days}");
      else {
        if (!isStr(grow["to"])) k.fail("grow.to", "phải là chuỗi id prop");
        if (!isNum(grow["days"]) || grow["days"] < 1) k.fail("grow.days", "phải là số >= 1");
      }
    }
    const spread = item["spread"];
    if (spread !== undefined) {
      if (!isObj(spread)) k.fail("spread", "phải là object {chance, into}");
      else {
        if (!isStr(spread["into"])) k.fail("spread.into", "phải là chuỗi id prop");
        if (!isNum(spread["chance"]) || spread["chance"] < 0 || spread["chance"] > 1)
          k.fail("spread.chance", "phải nằm trong [0, 1]");
      }
    }
    const fell = item["stormFell"];
    if (fell !== undefined) {
      if (!isObj(fell)) k.fail("stormFell", "phải là object {to, chance}");
      else {
        if (!isStr(fell["to"])) k.fail("stormFell.to", "phải là chuỗi id prop");
        if (!isNum(fell["chance"]) || fell["chance"] < 0 || fell["chance"] > 1)
          k.fail("stormFell.chance", "phải nằm trong [0, 1]");
      }
    }

    const art = k.obj(item, "art");
    if (art) colors(k, art, ["body", "dark", "accent"], "art");
    c.merge(k);
  });
  return c.errors;
}

/**
 * seasons.json — bốn mùa. TUỲ CHỌN ở cấp pack (pack cũ đã cache không có file
 * này vẫn nạp được, loader sẽ coi như "không có mùa"), nhưng có thì phải đủ.
 */
const ANIMAL_FORMS = ["quadruped", "bird", "fish", "critter"] as const;
const HOUSINGS = ["pen", "free", "water"] as const;
const JOBS = ["patrol", "pest"] as const;

/**
 * actors.json — vật nuôi và sâu bọ. TUỲ CHỌN ở cấp pack (pack cũ đã cache không
 * có file này vẫn nạp được, chỉ là chưa có con vật nào).
 */
export function validateActors(raw: unknown): string[] {
  const c = new Check("actors.json");
  if (!isObj(raw)) return ["actors.json: phải là object"];
  const seen = new Set<string>();

  const one = (item: unknown, where: string) => {
    const k = new Check(where);
    if (!isObj(item)) {
      c.fail(where, "phải là object");
      return;
    }
    const id = k.str(item, "id");
    if (id) {
      if (seen.has(id)) k.fail("id", `trùng id '${id}'`);
      seen.add(id);
    }
    k.str(item, "name");
    k.num(item, "price", 0);
    k.enumStr(item, "housing", HOUSINGS);
    const feed = item["feed"];
    if (feed !== null && !isStr(feed)) k.fail("feed", "phải là id vật phẩm hoặc null");
    k.num(item, "fedMinutes", 1, 100000);
    k.num(item, "matureDays", 0, 999);
    k.num(item, "starveDays", 0, 99999);
    k.num(item, "speed", 1, 400);
    if (item["job"] !== undefined) k.enumStr(item, "job", JOBS);

    const box = k.obj(item, "box");
    if (box) {
      k.num(box as Record<string, unknown>, "w", 1, 64);
      k.num(box as Record<string, unknown>, "h", 1, 64);
    }

    const prods = k.arr(item, "products");
    if (prods)
      prods.forEach((p, j) => {
        if (!isObj(p)) {
          k.fail(`products[${j}]`, "phải là object");
          return;
        }
        if (!isStr(p["id"])) k.fail(`products[${j}].id`, "phải là chuỗi");
        k.num(p, "every", 1, 999);
        k.num(p, "min", 0);
        k.num(p, "max", 0);
      });

    const meat = item["meat"];
    if (meat !== null && meat !== undefined) {
      if (!isObj(meat)) k.fail("meat", "phải là object hoặc null");
      else {
        if (!isStr(meat["id"])) k.fail("meat.id", "phải là chuỗi");
        k.num(meat, "min", 0);
        k.num(meat, "max", 0);
      }
    }

    const art = k.obj(item, "art");
    if (art) {
      k.enumStr(art as Record<string, unknown>, "form", ANIMAL_FORMS);
      for (const key of ["body", "bodyDark", "belly", "accent"])
        if (!isStr(art[key]) || !/^#[0-9a-fA-F]{6}$/.test(art[key] as string))
          k.fail(`art.${key}`, "phải là mã màu #rrggbb");
      k.num(art as Record<string, unknown>, "w", 1, 16);
      k.num(art as Record<string, unknown>, "h", 1, 16);
      for (const key of ["fluff", "patch"])
        if (art[key] !== undefined) k.num(art as Record<string, unknown>, key, 0, 1);
      if (art["horn"] !== undefined) k.num(art as Record<string, unknown>, "horn", 0, 3);
    }
    c.merge(k);
  };

  for (const group of ["animals", "pests"] as const) {
    const list = c.arr(raw, group);
    if (!list) continue;
    list.forEach((item, i) => one(item, `${group}[${i}]`));
  }
  return c.errors;
}

export function validateSeasons(raw: unknown): string[] {
  const c = new Check("seasons.json");
  if (!isObj(raw)) return ["seasons.json: phải là object"];
  c.num(raw, "daysPerSeason", 1, 365);
  const list = c.arr(raw, "seasons");
  if (!list) return c.errors;
  if (list.length === 0) c.fail("seasons", "phải có ít nhất một mùa");
  const seen = new Set<string>();
  list.forEach((item, i) => {
    const k = new Check(`seasons[${i}]`);
    if (!isObj(item)) {
      c.fail(`seasons[${i}]`, "phải là object");
      return;
    }
    const id = k.str(item, "id");
    if (id) {
      if (seen.has(id)) k.fail("id", `trùng id '${id}'`);
      seen.add(id);
    }
    k.str(item, "name");
    k.num(item, "growMul", 0, 10);
    const w = k.obj(item, "weather");
    if (w)
      for (const [wid, v] of Object.entries(w))
        if (!isNum(v) || v < 0) k.fail(`weather.${wid}`, "phải là số >= 0");
    if (item["tint"] !== undefined) {
      const t = k.obj(item, "tint");
      if (t) {
        if (!isStr(t["color"]) || !/^#[0-9a-fA-F]{6}$/.test(t["color"] as string))
          k.fail("tint.color", "phải là mã màu dạng #rrggbb");
        k.num(t as Record<string, unknown>, "alpha", 0, 1);
        if (t["desat"] !== undefined) k.num(t as Record<string, unknown>, "desat", 0, 1);
      }
    }
    c.merge(k);
  });
  return c.errors;
}

export function validateWeather(raw: unknown): string[] {
  const c = new Check("weather.json");
  if (!isObj(raw)) return ["weather.json: phải là object"];
  const list = c.arr(raw, "weathers");
  if (!list) return c.errors;
  if (list.length === 0) c.fail("weathers", "phải có ít nhất một kiểu thời tiết");
  const seen = new Set<string>();
  let totalWeight = 0;
  list.forEach((item, i) => {
    const k = new Check(`weathers[${i}]`);
    if (!isObj(item)) {
      c.fail(`weathers[${i}]`, "phải là object");
      return;
    }
    const id = k.str(item, "id");
    if (id) {
      if (seen.has(id)) k.fail("id", `trùng id '${id}'`);
      seen.add(id);
    }
    k.str(item, "name");
    const w = k.num(item, "weight", 0);
    if (w !== null) totalWeight += w;
    if (typeof item["wet"] !== "boolean") k.fail("wet", "phải là boolean");
    k.num(item, "growMul", 0, 10);
    k.num(item, "wind", 0, 1);
    if (item["hot"] !== undefined && typeof item["hot"] !== "boolean") k.fail("hot", "phải là boolean");
    if (item["diseaseMul"] !== undefined) k.num(item, "diseaseMul", 0, 20);
    if (item["fogUntil"] !== undefined) k.num(item, "fogUntil", 0, 2880);
    const streak = item["streak"];
    if (streak !== undefined) {
      if (!isObj(streak)) k.fail("streak", "phải là object {max, chance}");
      else {
        if (!isNum(streak["max"]) || streak["max"] < 1) k.fail("streak.max", "phải là số >= 1");
        if (!isNum(streak["chance"]) || streak["chance"] < 0 || streak["chance"] > 1)
          k.fail("streak.chance", "phải nằm trong [0, 1]");
      }
    }
    const storm = item["storm"];
    if (storm !== undefined) {
      if (!isObj(storm)) k.fail("storm", "phải là object {cropChance}");
      else if (!isNum(storm["cropChance"]) || storm["cropChance"] < 0 || storm["cropChance"] > 1)
        k.fail("storm.cropChance", "phải nằm trong [0, 1]");
    }
    c.merge(k);
  });
  if (list.length > 0 && !(totalWeight > 0)) c.fail("weathers", "tổng weight phải > 0, không thì không rút thăm được");
  const first = c.str(raw, "firstDay");
  if (first && !seen.has(first)) c.fail("firstDay", `'${first}' không có trong weathers`);
  return c.errors;
}

export function validateRecipes(raw: unknown): string[] {
  const c = new Check("recipes.json");
  if (!isObj(raw)) return ["recipes.json: phải là object"];
  const list = c.arr(raw, "recipes");
  if (!list) return c.errors;
  const seen = new Set<string>();
  list.forEach((item, i) => {
    const k = new Check(`recipes[${i}]`);
    if (!isObj(item)) {
      c.fail(`recipes[${i}]`, "phải là object");
      return;
    }
    const id = k.str(item, "id");
    if (id) {
      if (seen.has(id)) k.fail("id", `trùng id '${id}'`);
      seen.add(id);
    }
    k.str(item, "name");
    const out = k.obj(item, "out");
    if (out) {
      if (!isStr(out["id"])) k.fail("out.id", "phải là chuỗi");
      if (!isNum(out["n"]) || (out["n"] as number) < 1) k.fail("out.n", "phải là số >= 1");
    }
    const ins = k.arr(item, "in");
    if (ins) {
      if (!ins.length) k.fail("in", "phải có ít nhất một nguyên liệu");
      ins.forEach((v, j) => {
        if (!isObj(v)) return k.fail(`in[${j}]`, "phải là object");
        if (!isStr(v["id"])) k.fail(`in[${j}].id`, "phải là chuỗi");
        if (!isNum(v["n"]) || (v["n"] as number) < 1) k.fail(`in[${j}].n`, "phải là số >= 1");
      });
    }
    c.merge(k);
  });
  return c.errors;
}

export function validateBalance(raw: unknown): string[] {
  const c = new Check("balance.json");
  if (!isObj(raw)) return ["balance.json: phải là object"];
  c.num(raw, "startMoney", 0);
  c.num(raw, "energyMax", 1);
  c.num(raw, "dayStartMinutes", 0, 1440);
  const end = c.num(raw, "dayEndMinutes", 0, 2880);
  const start = raw["dayStartMinutes"];
  if (isNum(start) && end !== null && end <= start)
    c.fail("dayEndMinutes", "phải lớn hơn dayStartMinutes");
  c.num(raw, "realSecondsPerGameTenMinutes", 0.01);
  c.num(raw, "sleepRestore", 0, 1);
  c.num(raw, "lateSleepPenalty", 0, 1);
  c.num(raw, "passOutEnergy", 0, 1);
  c.num(raw, "inventorySlots", 1, 200);
  const hb = c.num(raw, "hotbarSlots", 1, 20);
  const inv = raw["inventorySlots"];
  if (hb !== null && isNum(inv) && hb > inv)
    c.fail("hotbarSlots", "không được lớn hơn inventorySlots");

  const cost = c.obj(raw, "energyCost");
  if (cost) {
    c.merge(
      numsIn(cost, ["till", "water", "plant", "harvest", "build", "chop", "mine"], "energyCost"),
    );
    for (const k of ["cure", "pull"])
      if (cost[k] !== undefined && (!isNum(cost[k]) || (cost[k] as number) < 0))
        c.fail(`energyCost.${k}`, "phải là số >= 0");
  }
  // core 1.3 — tuỳ chọn, có thì phải hợp lệ
  for (const [k, min, max] of [
    ["diseaseChance", 0, 1],
    // Trần rộng tay: xác suất cuối đã bị kẹp về 1, nên số lớn chỉ có nghĩa
    // "kề cây bệnh là chắc chắn lây". Với diseaseChance nhỏ (0,001) thì phải
    // tới ba chữ số mới diễn đạt được ý đó — chặn ở 50 là chặn nhầm thiết kế
    // hợp lệ. Vẫn đủ để bắt lỗi gõ nhầm kiểu 1e9.
    ["diseaseNeighbourMul", 0, 1000],
    ["sickYieldMul", 0, 1],
    ["noonDryMinutes", 0, 2880],
  ] as [string, number, number][])
    if (raw[k] !== undefined) c.num(raw, k, min, max);

  // Ba trường dưới đây được thêm ở core 1.1: cho phép THIẾU để pack cũ đã cache
  // vẫn dùng được (loader sẽ điền giá trị mặc định), nhưng có thì phải hợp lệ.
  for (const [k, min, max] of [
    ["moveSpeed", 8, 400],
    ["runSpeed", 8, 600],
    ["actionSeconds", 0, 5],
    ["actionImpact", 0, 1],
  ] as [string, number, number][])
    if (raw[k] !== undefined) c.num(raw, k, min, max);
  if (isNum(raw["moveSpeed"]) && isNum(raw["runSpeed"]) && raw["runSpeed"] < raw["moveSpeed"])
    c.fail("runSpeed", "không được nhỏ hơn moveSpeed");

  const seeds = c.obj(raw, "startSeeds");
  if (seeds)
    for (const [k, v] of Object.entries(seeds))
      if (!isNum(v) || v < 0) c.fail(`startSeeds.${k}`, "phải là số >= 0");
  return c.errors;
}

const GROUNDS = ["grass", "path", "water", "wood", "asphalt"] as const;

export function validateTiles(raw: unknown): string[] {
  const c = new Check("tiles.json");
  if (!isObj(raw)) return ["tiles.json: phải là object"];

  const grounds = c.obj(raw, "grounds");
  if (grounds)
    for (const [name, v] of Object.entries(grounds)) {
      if (!(GROUNDS as readonly string[]).includes(name))
        c.fail(`grounds.${name}`, `nền không có thật (core biết: ${GROUNDS.join(", ")})`);
      if (!isObj(v)) {
        c.fail(`grounds.${name}`, "phải là object");
        continue;
      }
      const k = new Check(`grounds.${name}`);
      if (v["solid"] !== undefined && typeof v["solid"] !== "boolean")
        k.fail("solid", "phải là boolean");
      if (v["interact"] !== undefined) k.enumStr(v, "interact", INTERACTS);
      // Trần 4: nhanh hơn thế thì nhân vật lướt qua ô nhanh hơn một khung hình
      // và va chạm bắt đầu bỏ sót tường. Sàn 0,1 để không có nền nào đứng hình.
      if (v["speedMul"] !== undefined) k.num(v as Record<string, unknown>, "speedMul", 0.1, 4);
      c.merge(k);
    }

  const legend = c.obj(raw, "legend");
  if (legend) {
    for (const [ch, v] of Object.entries(legend)) {
      if (ch.length !== 1) c.fail(`legend.${ch}`, "khoá phải đúng MỘT ký tự");
      if (!isObj(v)) {
        c.fail(`legend.${ch}`, "phải là object");
        continue;
      }
      const k = new Check(`legend.${ch}`);
      k.enumStr(v, "ground", GROUNDS);
      c.merge(k);
    }
  }
  const spawn = c.obj(raw, "spawn");
  if (spawn) c.merge(numsIn(spawn, ["x", "y"], "spawn"));
  const indoor = raw["indoorMaps"];
  if (indoor !== undefined) {
    if (!Array.isArray(indoor)) c.fail("indoorMaps", "phải là mảng tên bản đồ");
    else indoor.forEach((v, i) => { if (!isStr(v)) c.fail(`indoorMaps[${i}]`, "phải là chuỗi"); });
  }
  return c.errors;
}

export function validateMap(raw: unknown, legendChars: Set<string>): string[] {
  const c = new Check("maps/farm.json");
  if (!isObj(raw)) return ["maps/farm.json: phải là object"];
  const w = c.num(raw, "w", 1, 1000);
  const h = c.num(raw, "h", 1, 1000);
  const rows = c.arr(raw, "rows");
  if (!rows || w === null || h === null) return c.errors;
  if (rows.length !== h) c.fail("rows", `phải có đúng ${h} hàng, nhận ${rows.length}`);

  const unknown = new Set<string>();
  rows.forEach((r, y) => {
    if (!isStr(r)) {
      c.fail(`rows[${y}]`, "phải là chuỗi");
      return;
    }
    if (r.length !== w) c.fail(`rows[${y}]`, `phải dài ${w} ký tự, nhận ${r.length}`);
    for (const ch of r) if (!legendChars.has(ch)) unknown.add(ch);
  });
  if (unknown.size)
    c.fail("rows", `dùng ký tự không có trong tiles.json legend: ${[...unknown].join(" ")}`);
  return c.errors;
}

export function validateProgression(raw: unknown): string[] {
  const c = new Check("progression.json");
  if (!isObj(raw)) return ["progression.json: phải là object"];
  for (const key of ["stages", "goals"]) {
    const list = c.arr(raw, key);
    if (!list) continue;
    const seen = new Set<string>();
    list.forEach((item, i) => {
      const k = new Check(`${key}[${i}]`);
      if (!isObj(item)) {
        c.fail(`${key}[${i}]`, "phải là object");
        return;
      }
      const id = k.str(item, "id");
      if (id) {
        if (seen.has(id)) k.fail("id", `trùng id '${id}'`);
        seen.add(id);
      }
      if (key === "stages") {
        k.str(item, "name");
        const un = k.arr(item, "unlocks");
        if (un) un.forEach((u, j) => { if (!isStr(u)) k.fail(`unlocks[${j}]`, "phải là chuỗi"); });
      } else {
        k.str(item, "text");
      }
      const req = k.obj(item, "require");
      if (req)
        for (const [rk, rv] of Object.entries(req))
          if (!isNum(rv)) k.fail(`require.${rk}`, "phải là số");
      c.merge(k);
    });
  }
  return c.errors;
}

export function validateStrings(raw: unknown): string[] {
  const c = new Check("strings.json");
  if (!isObj(raw)) return ["strings.json: phải là object"];
  c.str(raw, "lang");
  c.obj(raw, "ui");
  c.obj(raw, "msg");
  return c.errors;
}

export function validateManifest(raw: unknown): string[] {
  const c = new Check("manifest.json");
  if (!isObj(raw)) return ["manifest.json: phải là object"];
  const v = c.str(raw, "contentVersion");
  if (v && !/^\d+\.\d+\.\d+$/.test(v))
    c.fail("contentVersion", "phải đúng dạng semver x.y.z");
  const rc = c.str(raw, "requiresCore");
  if (rc && !/^[\^~]?\d+\.\d+\.\d+$/.test(rc))
    c.fail("requiresCore", "phải là dải semver dạng ^1.0.0 / ~1.2.0 / 1.0.0");
  return c.errors;
}
