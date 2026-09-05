# -*- coding: utf-8 -*-
"""Sinh lại BẢN ĐỒ NÔNG TRẠI theo lối phân lô bàn cờ.

Chạy tay, kết quả ghi thẳng vào src/content/maps/farm.ascii + tiles.json.
Đặt ở đây (không phải scripts/) vì nó là công cụ THIẾT KẾ dùng một lần: bản đồ
sau khi sinh ra là nguồn sự thật, sửa tay tiếp được như mọi file ascii khác.
"""
import json, io, collections

W, H = 48, 37

# ---- các mốc bố cục (mọi chỗ khác trong file suy ra từ đây) ----------------
AVE_N, AVE_S = 8, 26          # hai đường trục ngang
AVE_V = 30                    # đường trục dọc
CROP_X0, CROP_X1 = 1, 29      # dải ruộng
CROP_Y0, CROP_Y1 = 9, 25
LOT_COLS = [(2, 7), (9, 14), (16, 21), (23, 28)]   # 4 cột lô, mỗi lô rộng 6
LOT_ROWS = [(9, 13), (15, 19), (21, 25)]           # 3 hàng lô, mỗi lô cao 5
LANE_X = [1, 8, 15, 22, 29]
LANE_Y = [14, 20]

# Ba chuồng nằm ĐÚNG TRÊN LƯỚI BÀN CỜ như ruộng: mỗi chuồng một khối riêng,
# và hai ngõ ngăn giữa chúng CHÍNH LÀ hai ngõ ngang của ruộng (y=14 và y=20).
# Nhìn ngang qua đường trục là thấy ngõ bên ruộng nối thẳng sang ngõ bên chuồng.
#
# Trước đây ba chuồng dùng chung vách: đọc ra một khối to bị chia vụn chứ không
# ra ba cái chuồng, và con vật chuồng này đứng sát mặt con vật chuồng kia.
PEN_X0, PEN_X1 = 32, 45       # viền RÀO của mọi chuồng
PENS = [  # (id, tên, y rào đầu, y rào cuối, các ô cổng trên cột x=PEN_X0)
    ("cattle", "Khu gia súc",  9, 13, [11]),
    ("pigpen", "Khu heo",     15, 19, [17]),
    ("coop",   "Khu gia cầm", 21, 25, [23]),
]
POND = (2, 2, 11, 6)          # x0,y0,x1,y1 — mặt nước
PIER_Y, PIER_X0, PIER_X1 = 4, 6, 11
HOUSE = (15, 2, 22, 3)        # x0,y0,x1,y1
DOOR = (18, 3)
BENCH = (21, 5)
WELL = (13, 3)
SHOP, COUNTER = (26, 3), (28, 3)
WARE = (39, 2, 44, 4)
STORE_DOOR = (41, 4)
SPUR_Y, SPUR_X0, SPUR_X1 = 6, 30, 45
PARKING = [(40, 6), (41, 6), (42, 6)]
# SÂN SAU — khoảnh đất trống có chủ ý, giữa đường trục dọc và cái kho.
# Ruộng chia lô kín, chuồng lát bê tông kín, rừng thì dày: không chừa chỗ này
# thì cả nông trại không còn một mảnh đất trống nào để đặt vòi tưới hay nhà
# kính mà không phải hy sinh một ô ruộng.
YARD = (31, 1, 38, 3)
DROPOFF = (30, 4)
GATE = (30, H - 1)
SPAWN = (18, 5)
FOREST_Y0, FOREST_Y1 = 27, 35
FOREST_LANE_X = [8, 16, 23, 38]
FOREST_LANE_Y = [30, 33]

SOLID = set("TtsobGHDSBWCdgUuLKkM".replace("g", ""))  # 'g' cỏ non KHÔNG đặc
SOLID = set("TtsobGHDSBWCdUuLKkM")
WALK_GROUND = set(".,:=gwPN#m")  # ký tự đi được (P cầu, N biển, # bê tông, m máng)

g = [["." for _ in range(W)] for _ in range(H)]

def box(x0, y0, x1, y1, ch):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            g[y][x] = ch

def rect(x0, y0, x1, y1, ch):
    for x in range(x0, x1 + 1):
        g[y0][x] = ch; g[y1][x] = ch
    for y in range(y0, y1 + 1):
        g[y][x0] = ch; g[y][x1] = ch

# ---- ngẫu nhiên TÁI LẬP ĐƯỢC (LCG) ----------------------------------------
_seed = 20260905
def rnd():
    global _seed
    _seed = (_seed * 1103515245 + 12345) & 0x7FFFFFFF
    return _seed / 0x7FFFFFFF

def pick(pairs):
    r = rnd(); acc = 0
    for ch, wgt in pairs:
        acc += wgt
        if r < acc: return ch
    return pairs[-1][0]

# ---------------------------------------------------------------- 1. viền
box(0, 0, W - 1, 0, "T"); box(0, H - 1, W - 1, H - 1, "T")
box(0, 0, 0, H - 1, "T"); box(W - 1, 0, W - 1, H - 1, "T")

# ---------------------------------------------------- 2. dải bắc: ao, nhà, chợ, kho
box(*POND, "~")
box(PIER_X0, PIER_Y, PIER_X1, PIER_Y, "P")
ROCKS = [(12, 2), (12, 6), (12, 7), (3, 7), (7, 7), (10, 7), (13, 7)]
box(13, 4, 25, 5, ":")           # sân trước nhà
box(*HOUSE, "H"); g[DOOR[1]][DOOR[0]] = "D"
g[BENCH[1]][BENCH[0]] = "C"
g[WELL[1]][WELL[0]] = "G"
box(25, 2, 29, 5, ":")           # sân chợ
g[SHOP[1]][SHOP[0]] = "S"; g[COUNTER[1]][COUNTER[0]] = "B"
box(*WARE, "K"); g[STORE_DOOR[1]][STORE_DOOR[0]] = "k"
box(36, 5, 45, 5, ":")           # lối trước kho
box(*YARD, ".")                  # sân sau: để trống hẳn, không rắc gì lên

# ------------------------------------------------------------- 3. đường sá
box(1, AVE_N, W - 2, AVE_N, "=")
box(1, AVE_S, W - 2, AVE_S, "=")
box(AVE_V, 3, AVE_V, H - 1, "=")
box(SPUR_X0, SPUR_Y, SPUR_X1, SPUR_Y, "=")

# --------------------------------------------------------------- 4. ruộng
box(CROP_X0, CROP_Y0, CROP_X1, CROP_Y1, ".")
for x in LANE_X: box(x, CROP_Y0, x, CROP_Y1, ":")
for y in LANE_Y: box(CROP_X0, y, CROP_X1, y, ":")

# ------------------------------------------------------------ 5. chăn nuôi
box(31, CROP_Y0, 31, CROP_Y1, ":")     # ngõ dọc phía tây dãy chuồng
box(46, CROP_Y0, 46, CROP_Y1, ".")     # ngõ dọc phía đông
for (_id, _nm, fy0, fy1, gates) in PENS:
    # Ruột chuồng lát BÊ TÔNG. Sàn riêng là thứ làm cái chuồng đọc ra là chuồng
    # chứ không phải một khoảnh cỏ có hàng rào quanh; và bê tông không phải cỏ
    # nên cái cuốc tự nhiên không ăn ở đây, khỏi cần thêm luật nào.
    box(PEN_X0 + 1, fy0 + 1, PEN_X1 - 1, fy1 - 1, "#")
    rect(PEN_X0, fy0, PEN_X1, fy1, "F")
    for gy in gates: g[gy][PEN_X0] = ":"
    g[(fy0 + fy1) // 2][36] = "m"


# ----------------------------------------------------------------- 6. rừng
FOR = [("T", .30), ("t", .09), ("s", .04), ("L", .05), ("U", .06), ("u", .06),
       ("o", .04), ("w", .11), ("g", .10), (",", .07), (".", .08)]
for y in range(FOREST_Y0, FOREST_Y1 + 1):
    for x in range(1, W - 1):
        if x == AVE_V: continue
        g[y][x] = pick(FOR)
for y in LANE_Y: box(31, y, 46, y, ":")   # ngõ ngang xuyên cả dãy chuồng
for x in FOREST_LANE_X: box(x, FOREST_Y0, x, FOREST_Y1, ":")
for y in FOREST_LANE_Y:
    for x in range(1, W - 1):
        if x != AVE_V: g[y][x] = ":"
g[GATE[1]][GATE[0]] = "="

# -------------------------------------------- 7. rắc cỏ/bụi ở các dải trống
DECOR = [(",", .24), ("g", .22), ("w", .12), ("u", .06), ("U", .05),
         ("T", .06), ("t", .04), (".", .21)]
LIGHT = [(",", .34), ("g", .30), ("w", .16), (".", .20)]
def trong(x, y): return g[y][x] == "."

# Quầng KHÔNG đặt vật đặc: một bụi rậm mọc trước cửa kho thì cái kho coi như
# không có. Bấm được cái gì thì chừa trống quanh cái đó.
CUA = [DOOR, WELL, SHOP, COUNTER, STORE_DOOR, BENCH, SPAWN]
def gan_cua(x, y, r=1):
    return any(abs(x - a) <= r and abs(y - b) <= r for (a, b) in CUA)

# BỜ HỒ rộng đúng MỘT ô. Một hòn đá đặt bừa ở đây không làm cảnh, nó cắt dải bờ
# thành hai khúc rời — nên vùng này chỉ rắc cỏ, còn đá thì đặt tay ở ROCKS.
for y in range(1, AVE_N):
    for x in range(1, 14):
        if trong(x, y) and not gan_cua(x, y): g[y][x] = pick(LIGHT)
def trong_san(x, y):
    return YARD[0] <= x <= YARD[2] and YARD[1] <= y <= YARD[3]

for y in range(1, AVE_N):
    for x in range(14, W - 1):
        if not trong(x, y) or gan_cua(x, y) or trong_san(x, y): continue
        ch = pick(DECOR)
        if ch in "uUTt" and gan_cua(x, y, 2): ch = "g"
        g[y][x] = ch
for (x, y) in ROCKS: g[y][x] = "o"
for y in range(CROP_Y0, CROP_Y1 + 1):
    for x in (46,):
        if trong(x, y): g[y][x] = pick([(",", .3), ("g", .3), ("w", .2), (".", .2)])
for (lx0, lx1) in LOT_COLS:
    for (ly0, ly1) in LOT_ROWS:
        for y in range(ly0, ly1 + 1):
            for x in range(lx0, lx1 + 1):
                if rnd() < 0.05: g[y][x] = ","
g[SPAWN[1]][SPAWN[0]] = ":"

# ------------------------------------------------------------- 7b. cắm BIỂN
# Biển đặt trên NGÕ / SÂN / ĐƯỜNG, không bao giờ trên ruột lô hay ruột chuồng:
# một ô có vật thể là một ô không cuốc được, và cái biển gọi tên cái lô mà lại
# ăn mất một ô của chính nó thì vô lý. Biển KHÔNG ĐẶC nên cắm giữa ngõ rộng một
# ô vẫn đi qua được.
BIEN = []
def cam(x, y, chu):
    assert g[y][x] not in SOLID and g[y][x] != "~", f"cắm biển vào ô đặc ({x},{y})={g[y][x]}"
    # Ô mang biển có nền `path`. Cắm lên asphalt là đục thủng mặt đường thành
    # một ô lối mòn — và cái cọc thì đứng giữa lòng đường.
    assert g[y][x] != "=", f"cắm biển ra giữa đường nhựa ({x},{y})"
    g[y][x] = "N"
    BIEN.append((x, y, chu))

for ri, (ly0, ly1) in enumerate(LOT_ROWS):
    for ci, (lx0, lx1) in enumerate(LOT_COLS):
        cam(lx0 - 1, ly0, f"Lô {'ABCD'[ri]}{ci + 1}")
cam(DOOR[0] - 3, DOOR[1] + 1, "Nhà")
cam(SHOP[0] - 1, SHOP[1] + 1, "Chợ")
cam(WELL[0], WELL[1] + 1, "Giếng")
cam(STORE_DOOR[0] - 2, STORE_DOOR[1] + 1, "Kho")
# Trên LỐI ĐI trước kho, không phải trên mặt bãi đậu: bãi đậu là asphalt.
cam(PARKING[2][0] + 2, 5, "Bãi đậu xe")
cam(YARD[0] - 1, YARD[1] + 1, "Sân sau")
for (_id, nm, fy0, fy1, gates) in PENS:
    cam(PEN_X0 - 1, gates[0], nm)
cam(POND[2] + 1, PIER_Y - 1, "Hồ cá")
# Biển RỪNG cắm ở đầu NGÕ xuyên rừng, không cắm ra giữa đường trục: ô mang
# biển có nền `path`, nên cắm lên mặt đường là đục thủng một lỗ lối mòn giữa
# đường nhựa — nhìn thấy ngay mà chẳng ai ngờ tới lúc đặt.
cam(FOREST_LANE_X[1], FOREST_Y0, "Rừng")

# ------------------------------------------------- 8. kiểm tra & vá liên thông
def walkable(x, y): return g[y][x] not in SOLID and g[y][x] != "~"

def flood(sx, sy):
    seen = {(sx, sy)}; q = collections.deque([(sx, sy)])
    while q:
        x, y = q.popleft()
        for dx, dy in ((1,0),(-1,0),(0,1),(0,-1)):
            nx, ny = x+dx, y+dy
            if 0 <= nx < W and 0 <= ny < H and (nx,ny) not in seen and walkable(nx,ny):
                seen.add((nx,ny)); q.append((nx,ny))
    return seen

VA = [0, 0]; VA2 = []
def patch():
    """Ô đi được nhưng lạc khỏi khối chính → đục thông bằng BFS xuyên vật cản."""
    for _ in range(400):
        main = flood(*SPAWN)
        lost = [(x,y) for y in range(H) for x in range(W)
                if walkable(x,y) and (x,y) not in main]
        if not lost: return True
        tx, ty = lost[0]
        VA[0] += 1
        prev = {(tx,ty): None}; q = collections.deque([(tx,ty)])
        hit = None
        while q and hit is None:
            x, y = q.popleft()
            for dx, dy in ((1,0),(-1,0),(0,1),(0,-1)):
                nx, ny = x+dx, y+dy
                if not (0 < nx < W-1 and 0 < ny < H-1) or (nx,ny) in prev: continue
                if g[ny][nx] == "~": continue          # không lấp hồ
                prev[(nx,ny)] = (x,y)
                if (nx,ny) in main: hit = (nx,ny); break
                q.append((nx,ny))
        if hit is None:
            g[ty][tx] = "."
            continue
        cur = hit
        while cur is not None:
            if g[cur[1]][cur[0]] in SOLID:
                VA2.append((cur[0], cur[1], g[cur[1]][cur[0]]))
                g[cur[1]][cur[0]] = "."; VA[1] += 1
            cur = prev[cur]
    return False

assert patch(), "không vá nổi liên thông"

# ruột chuồng và ruột lô phải SẠCH (đã dựng ở trên, kiểm lại cho chắc)
for (_id, _nm, fy0, fy1, _gt) in PENS:
    for y in range(fy0+1, fy1):
        for x in range(PEN_X0+1, PEN_X1):
            assert g[y][x] in "#m", f"ruột chuồng bẩn ở ({x},{y}) = {g[y][x]}"
for (lx0, lx1) in LOT_COLS:
    for (ly0, ly1) in LOT_ROWS:
        for y in range(ly0, ly1+1):
            for x in range(lx0, lx1+1):
                assert g[y][x] in ".,", f"lô bẩn ở ({x},{y}) = {g[y][x]}"
for y in range(POND[1], POND[3]+1):
    for x in range(POND[0], POND[2]+1):
        assert g[y][x] in "~P", f"ao thủng ở ({x},{y}) = {g[y][x]}"

rows = ["".join(r) for r in g]
assert all(len(r) == W for r in rows)
io.open("src/content/maps/farm.ascii", "w", encoding="utf8").write("\n".join(rows) + "\n")

# ------------------------------------------------------------- 9. tiles.json
p = "src/content/tiles.json"
d = json.load(io.open(p, encoding="utf8"), object_pairs_hook=collections.OrderedDict)
d["spawn"] = collections.OrderedDict([("map","farm"),("x",SPAWN[0]),("y",SPAWN[1])])
d["dropoff"] = collections.OrderedDict([("map","farm"),("x",DROPOFF[0]),("y",DROPOFF[1])])
d["gate"] = collections.OrderedDict([("map","farm"),("x",GATE[0]),("y",GATE[1])])
d["parking"] = collections.OrderedDict([("map","farm"),
    ("spots",[collections.OrderedDict([("x",x),("y",y)]) for x,y in PARKING])])

feeds = {p_["id"]: p_["feeds"] for p_ in d["pens"]}
pens = []
for (pid, nm, fy0, fy1, _gt) in PENS:
    pens.append(collections.OrderedDict([
        ("id",pid),("name",nm),("map","farm"),
        ("x",PEN_X0+1),("y",fy0+1),("w",PEN_X1-PEN_X0-1),("h",fy1-fy0-1),
        ("feeds",feeds[pid])]))
pens.append(collections.OrderedDict([
    ("id","pond"),("name","Hồ cá"),("map","farm"),
    ("x",POND[0]),("y",POND[1]),("w",POND[2]-POND[0]+1),("h",POND[3]-POND[1]+1),
    ("swim",True),("feeds",feeds["pond"])]))
d["pens"] = pens

zones = []
for ri,(ly0,ly1) in enumerate(LOT_ROWS):
    for ci,(lx0,lx1) in enumerate(LOT_COLS):
        zones.append(collections.OrderedDict([
            ("id",f"lo{'ABCD'[ri]}{ci+1}".lower()),("name",f"Lô {'ABCD'[ri]}{ci+1}"),
            ("kind","farm"),("map","farm"),
            ("x",lx0),("y",ly0),("w",lx1-lx0+1),("h",ly1-ly0+1)]))
zones.append(collections.OrderedDict([
    ("id","woods"),("name","Rừng"),("kind","forest"),("map","farm"),
    ("x",1),("y",FOREST_Y0),("w",W-2),("h",FOREST_Y1-FOREST_Y0+1)]))
d["zones"] = zones
d["signs"] = [collections.OrderedDict([("map","farm"),("x",x),("y",y),("text",t)])
              for (x, y, t) in BIEN]
io.open(p,"w",encoding="utf8").write(json.dumps(d,ensure_ascii=False,indent=2)+"\n")

# ------------------------------------------------------- 10. cửa ra nhà → sân
p = "src/content/props.json"
pr = json.load(io.open(p, encoding="utf8"), object_pairs_hook=collections.OrderedDict)
for it in pr["props"]:
    if it["id"] == "door_in":
        it["portal"]["x"], it["portal"]["y"] = DOOR[0], DOOR[1] + 1
io.open(p,"w",encoding="utf8").write(json.dumps(pr,ensure_ascii=False,indent=2)+"\n")

# ------------------------------------------------------------------ báo cáo
til = sum(1 for (lx0,lx1) in LOT_COLS for (ly0,ly1) in LOT_ROWS
          for y in range(ly0,ly1+1) for x in range(lx0,lx1+1))
print(f"bản đồ {W}×{H}")
print(f"vá liên thông: {VA[0]} chỗ kẹt, đục {VA[1]} ô")

lw = LOT_COLS[0][1] - LOT_COLS[0][0] + 1
lh = LOT_ROWS[0][1] - LOT_ROWS[0][0] + 1
print(f"ruộng   : {len(LOT_COLS)}×{len(LOT_ROWS)} = {len(LOT_COLS)*len(LOT_ROWS)} lô, "
      f"mỗi lô {lw}×{lh} → {til} ô cuốc được")
print(f"chuồng  : {len(PENS)} khu trên cạn + 1 ao cá")
print(f"rừng    : {W-2}×{FOREST_Y1-FOREST_Y0+1}")
print(f"biển cắm: {len(BIEN)} tấm")
print(f"sân sau : {YARD[2]-YARD[0]+1}×{YARD[3]-YARD[1]+1} ô trống")
print("\n".join(rows))
