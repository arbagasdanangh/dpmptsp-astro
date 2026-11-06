"""Takok Pelayanan Suroboyo - API untuk Vercel (Python serverless).

Penyimpanan : Upstash Redis (lewat Vercel Marketplace), diakses via REST.
Variabel    : lihat BACA-SAYA.md (SESSION_SECRET, ADMIN_PASSWORD, KV_REST_API_URL/TOKEN).
Satu endpoint: /api/app?p=/rute  (mis. /api/app?p=/info)
"""
import base64, csv, hashlib, hmac, io, json, os, re, secrets, sys, time
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _data import SEED  # noqa: E402

SECRET = (os.environ.get("SESSION_SECRET") or "").encode()
SECURE = os.environ.get("COOKIE_SECURE", "1") != "0"
CSP = ("default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; "
       "connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'")


class HttpError(Exception):
    def __init__(self, code, msg):
        self.code, self.msg = code, msg


# ---------------- Redis (Upstash REST) ----------------
def find_redis_env():
    """Cari URL dan token REST Redis, apa pun awalan nama variabelnya (KV_, UPSTASH_REDIS_, STORAGE_, dst)."""
    e = os.environ
    for u, t in (("KV_REST_API_URL", "KV_REST_API_TOKEN"), ("UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN")):
        if e.get(u) and e.get(t):
            return e[u], e[t]
    for k, v in e.items():
        for suf_u, suf_t in (("_REST_API_URL", "_REST_API_TOKEN"), ("_REST_URL", "_REST_TOKEN")):
            if k.endswith(suf_u) and v:
                tok = e.get(k[:-len(suf_u)] + suf_t)
                if tok:
                    return v, tok
    return "", ""


class Upstash:
    def __init__(self):
        self.url, self.tok = find_redis_env()
        self.url = self.url.rstrip("/")

    def _post(self, path, body):
        if not self.url:
            raise HttpError(500, "Penyimpanan Redis belum disambungkan. Isi KV_REST_API_URL dan KV_REST_API_TOKEN di Environment Variables, lalu Redeploy.")
        req = urllib.request.Request(self.url + path, json.dumps(body).encode(),
                                     {"Authorization": "Bearer " + self.tok, "Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=8) as r:
            return json.loads(r.read())

    def cmd(self, *a):
        j = self._post("", [str(x) for x in a])
        if isinstance(j, dict) and j.get("error"):
            raise RuntimeError(j["error"])
        return j.get("result")

    def pipe(self, cmds):
        if not cmds:
            return []
        out = self._post("/pipeline", [[str(x) for x in c] for c in cmds])
        res = []
        for o in out:
            if o.get("error"):
                raise RuntimeError(o["error"])
            res.append(o.get("result"))
        return res


R = None


def db():
    global R
    if R is None:
        R = Upstash()
    return R


def hall(v):
    """HGETALL -> dict (REST mengembalikan daftar datar)."""
    if isinstance(v, dict):
        return v
    v = v or []
    return {v[i]: v[i + 1] for i in range(0, len(v), 2)}


# ---------------- Util ----------------
def now_ms():
    return int(time.time() * 1000)


def hash_pw(pw, salt=None):
    salt = salt or secrets.token_hex(8)
    return salt + "$" + hashlib.pbkdf2_hmac("sha256", pw.encode(), salt.encode(), 150000).hex()


def check_pw(pw, h):
    return bool(h) and "$" in h and hmac.compare_digest(hash_pw(pw, h.split("$")[0]), h)


def sign(p):
    if not SECRET:
        raise HttpError(500, "SESSION_SECRET belum diisi di pengaturan Vercel.")
    b = base64.urlsafe_b64encode(json.dumps(p).encode()).decode().rstrip("=")
    return b + "." + hmac.new(SECRET, b.encode(), hashlib.sha256).hexdigest()


def unsign(tok):
    try:
        b, sig = tok.split(".")
        if not SECRET or not hmac.compare_digest(sig, hmac.new(SECRET, b.encode(), hashlib.sha256).hexdigest()):
            return None
        p = json.loads(base64.urlsafe_b64decode(b + "=" * (-len(b) % 4)))
        return p if p.get("exp", 0) > time.time() else None
    except Exception:
        return None


def norm_hp(s):
    s = re.sub(r"[\s.\-()]", "", str(s))
    if re.match(r"^\+?62", s):
        s = re.sub(r"^\+?62", "0", s)
    return s if re.match(r"^08\d{7,12}$", s) else None


def ok_email(s):
    s = str(s).strip()
    return s if len(s) <= 100 and re.match(r"^[^\s@<>\"']+@[^\s@<>\"']+\.[^\s@<>\"']{2,}$", s) else None


def clean(s, n):
    return re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", str(s)).strip()[:n]


LOKASI = {l["id"]: l["nm"] for l in SEED["lokasi"]}
LOKET = {"%s_%s" % (e["lokasi"], e["no"]): e for e in SEED["loket"]}


def valid_key(k):
    return str(k) in LOKET


def label(k):
    e = LOKET.get(k)
    return (LOKASI.get(e["lokasi"], "") + " - " + e["nama"]) if e else k


def limited(key, maxn, window):
    """Hitung percobaan di Redis; True bila sudah melewati batas."""
    c = db().pipe([["INCR", key], ["EXPIRE", key, window, "NX"]])[0]
    return int(c) > maxn


def cfg_all():
    return hall(db().cmd("HGETALL", "cfg"))


def parse(s, d=None):
    try:
        return json.loads(s)
    except Exception:
        return d


# ---------------- Logika data ----------------
def threads():
    r = db().pipe([["HGETALL", "tlu"], ["HGETALL", "tla"], ["HGETALL", "tlast"], ["HGETALL", "sel"], ["HGETALL", "nilai"], ["HGETALL", "pemohon"]])
    tlu, tla, tlast, sel, nilai, pem = [hall(x) for x in r]
    pem = {k: parse(v, {}) for k, v in pem.items()}
    out = []
    for f, last in tlast.items():
        pid, kunci = f.split("|", 1)
        p = pem.get(pid)
        if not p:
            continue
        l = parse(last, {})
        lu, la, sl = int(tlu.get(f, 0)), int(tla.get(f, 0)), int(sel.get(f, 0))
        out.append({"pid": int(pid), "kunci": kunci, "nama": p["nama"], "hp": p["hp"], "email": p.get("email", ""),
                    "teks": l.get("teks", ""), "waktu": l.get("waktu", 0), "pend": lu > max(la, sl),
                    "nilai": int(nilai[f]) if f in nilai else None})
    return sorted(out, key=lambda x: (not x["pend"], -x["waktu"]))


def add_msg(pid, kunci, dari, isi):
    f = "%s|%s" % (pid, kunci)
    mid = int(db().cmd("INCR", "seq:pesan"))
    t = now_ms()
    m = {"id": mid, "dari": dari, "isi": isi, "waktu": t}
    db().pipe([["RPUSH", "msgs:" + f, json.dumps(m, ensure_ascii=False)], ["SADD", "pk:%s" % pid, kunci],
               ["HSET", "tlu" if dari == "pemohon" else "tla", f, t],
               ["HSET", "tlast", f, json.dumps({"teks": isi[:100], "waktu": t}, ensure_ascii=False)]])


# ---------------- Handler ----------------
class handler(BaseHTTPRequestHandler):
    server_version = "Takok"
    sys_version = ""

    def log_message(self, *a):
        pass

    def ip(self):
        return (self.headers.get("X-Forwarded-For") or self.client_address[0]).split(",")[0].strip()

    def out(self, code, body, ctype, extra=()):
        if isinstance(body, str):
            body = body.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Content-Security-Policy", CSP)
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Cache-Control", "no-store")
        for k, v in extra:
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def json(self, obj, code=200, extra=()):
        self.out(code, json.dumps(obj, ensure_ascii=False), "application/json; charset=utf-8", extra)

    def cookie(self, tok, maxage):
        return [("Set-Cookie", "sid=%s; Path=/; HttpOnly; SameSite=Strict; Max-Age=%d%s" % (tok, maxage, "; Secure" if SECURE else ""))]

    def session(self):
        m = re.search(r"(?:^|;\s*)sid=([^;]+)", self.headers.get("Cookie", ""))
        p = unsign(m.group(1)) if m else None
        if p and p["r"] == "adm" and p.get("v") != (db().cmd("HGET", "cfg", "admin_hash") or "")[:12]:
            return None
        return p

    def refresh(self, p):
        q = dict(p)
        q["exp"] = int(time.time()) + (1800 if p["r"] == "adm" else 3600)
        return self.cookie(sign(q), 3600)

    def do_GET(self):
        self.go("GET")

    def do_POST(self):
        self.go("POST")

    def go(self, method):
        try:
            u = urlparse(self.path)
            q = parse_qs(u.query)
            path = (q.get("p") or ["/"])[0]
            body = {}
            if method == "POST":
                org = self.headers.get("Origin")
                if org and urlparse(org).netloc != self.headers.get("Host"):
                    raise HttpError(403, "Permintaan ditolak.")
                if "application/json" not in (self.headers.get("Content-Type") or ""):
                    raise HttpError(415, "Format permintaan tidak valid.")
                n = int(self.headers.get("Content-Length") or 0)
                if n > 10000:
                    raise HttpError(413, "Permintaan terlalu besar.")
                try:
                    body = json.loads(self.rfile.read(n) or b"{}")
                    assert isinstance(body, dict)
                except Exception:
                    raise HttpError(400, "Data tidak valid.")
            self.route(method, path, q, body)
        except HttpError as e:
            self.json({"error": e.msg}, e.code)
        except Exception as e:
            print("ERROR", repr(e))
            self.json({"error": "Terjadi kesalahan pada server."}, 500)

    def route(self, method, path, q, b):
        if path == "/info":
            return self.info(self.session())
        if path == "/daftar" and method == "POST":
            return self.daftar(b)
        if path == "/masuk" and method == "POST":
            return self.masuk(b)
        if path == "/admin/masuk" and method == "POST":
            return self.admin_masuk(b)
        if path == "/keluar" and method == "POST":
            return self.json({"ok": True}, extra=self.cookie("", 0))
        ses = self.session()
        if not ses:
            raise HttpError(401, "Silakan masuk terlebih dahulu.")
        ex = self.refresh(ses)
        if ses["r"] == "user":
            if path == "/pesan" and method == "GET":
                return self.user_pesan(ses, ex)
            if path == "/pesan" and method == "POST":
                return self.user_kirim(ses, b, ex)
            if path == "/nilai" and method == "POST":
                return self.user_nilai(ses, b, ex)
        if ses["r"] == "adm" and path.startswith("/admin/"):
            return self.admin(method, path[7:], q, b, ex)
        raise HttpError(403, "Tidak diizinkan.")

    def info(self, ses):
        who = None
        if ses and ses["r"] == "adm":
            who = {"peran": "admin"}
        elif ses:
            p = parse(db().cmd("HGET", "pemohon", ses.get("id")))
            if p:
                who = {"peran": "pemohon", "nama": p["nama"], "hp": p["hp"], "email": p.get("email", "")}
        c = cfg_all()
        self.json({"lokasi": [{"id": k, "nama": v} for k, v in LOKASI.items()],
                   "loket": [[e["lokasi"], e["no"], e["nama"], e["uraian"], e["sistem"], e.get("zona", ""), 1 if e.get("diskusi", True) else 0] for e in SEED["loket"]],
                   "cfg": {k: c.get(k, "") for k in ("wa", "jam", "info")}, "saya": who},
                  extra=self.refresh(ses) if ses and who else ())

    def daftar(self, b):
        ip = self.ip()
        if limited("rl:daftar:" + ip, 10, 3600):
            raise HttpError(429, "Terlalu banyak pendaftaran. Coba lagi nanti.")
        nama, hp, em, pin = clean(b.get("nama", ""), 60), norm_hp(b.get("hp", "")), ok_email(b.get("email", "")), str(b.get("pin", ""))
        if len(nama) < 2:
            raise HttpError(400, "Isi nama Anda.")
        if not hp:
            raise HttpError(400, "Nomor HP tidak valid. Contoh: 081234567890.")
        if not em:
            raise HttpError(400, "Email tidak valid.")
        if not re.match(r"^\d{6}$", pin):
            raise HttpError(400, "PIN harus 6 angka.")
        pid = int(db().cmd("INCR", "seq:pemohon"))
        if int(db().cmd("HSETNX", "hp", hp, pid)) == 0:
            raise HttpError(409, "Nomor HP sudah terdaftar. Silakan masuk dengan PIN Anda.")
        db().cmd("HSET", "pemohon", pid, json.dumps({"id": pid, "nama": nama, "hp": hp, "email": em, "pin": hash_pw(pin), "dibuat": now_ms()}))
        tok = sign({"r": "user", "id": pid, "exp": int(time.time()) + 3600})
        self.json({"ok": True, "saya": {"peran": "pemohon", "nama": nama, "hp": hp, "email": em}}, extra=self.cookie(tok, 3600))

    def masuk(self, b):
        hp, pin, ip = norm_hp(b.get("hp", "")), str(b.get("pin", "")), self.ip()
        if not hp or not re.match(r"^\d{6}$", pin):
            raise HttpError(400, "Nomor HP atau PIN tidak valid.")
        if limited("rl:pin:" + hp, 5, 900) or limited("rl:pinip:" + ip, 30, 900):
            raise HttpError(429, "Terlalu banyak percobaan. Coba lagi dalam 15 menit.")
        pid = db().cmd("HGET", "hp", hp)
        p = parse(db().cmd("HGET", "pemohon", pid)) if pid else None
        if not p or not check_pw(pin, p["pin"]):
            raise HttpError(401, "Nomor HP atau PIN salah.")
        db().cmd("DEL", "rl:pin:" + hp)
        tok = sign({"r": "user", "id": p["id"], "exp": int(time.time()) + 3600})
        self.json({"ok": True, "saya": {"peran": "pemohon", "nama": p["nama"], "hp": p["hp"], "email": p.get("email", "")}}, extra=self.cookie(tok, 3600))

    def admin_masuk(self, b):
        ip, pw = self.ip(), str(b.get("password", ""))
        if limited("rl:adm:" + ip, 5, 600):
            raise HttpError(429, "Terlalu banyak percobaan. Coba lagi dalam 10 menit.")
        h = db().cmd("HGET", "cfg", "admin_hash") or ""
        env = os.environ.get("ADMIN_PASSWORD") or ""
        ok = check_pw(pw, h) if h else (bool(env) and hmac.compare_digest(pw.encode(), env.encode()))
        if not ok:
            time.sleep(0.8)
            raise HttpError(401, "Kata sandi admin salah.")
        if not h:  # pertama kali: simpan hash agar bisa diganti dari panel
            h = hash_pw(pw)
            db().cmd("HSET", "cfg", "admin_hash", h)
        db().cmd("DEL", "rl:adm:" + ip)
        tok = sign({"r": "adm", "v": h[:12], "exp": int(time.time()) + 1800})
        self.json({"ok": True, "saya": {"peran": "admin"}}, extra=self.cookie(tok, 1800))

    # ---- pemohon ----
    def user_pesan(self, ses, ex):
        pid = ses["id"]
        ks = sorted(db().cmd("SMEMBERS", "pk:%s" % pid) or [])
        res = db().pipe([["LRANGE", "msgs:%s|%s" % (pid, k), 0, -1] for k in ks] + [["HGETALL", "nilai"]])
        ms = []
        for k, lst in zip(ks, res[:-1]):
            for s in lst or []:
                m = parse(s)
                if m:
                    ms.append({"id": m["id"], "kunci": k, "dari": m["dari"], "isi": m["isi"], "waktu": m["waktu"]})
        nl = hall(res[-1])
        self.json({"pesan": ms, "status": {k: {"nilai": int(nl["%s|%s" % (pid, k)])} for k in ks if "%s|%s" % (pid, k) in nl}}, extra=ex)

    def user_kirim(self, ses, b, ex):
        pid, k, isi = ses["id"], str(b.get("kunci", "")), clean(b.get("isi", ""), 800)
        if not valid_key(k) or not isi:
            raise HttpError(400, "Pesan tidak valid.")
        if not LOKET[k].get("diskusi", True):
            raise HttpError(400, "Fasilitas ini tidak menerima pertanyaan lewat aplikasi.")
        if re.search(r"\d{16}", re.sub(r"[\s.\-]", "", isi)):
            raise HttpError(400, "Demi keamanan, jangan kirim NIK/KTP lengkap di sini.")
        if limited("rl:kirim:%s" % pid, 5, 60):
            raise HttpError(429, "Terlalu banyak pesan dalam satu menit.")
        if int(db().cmd("LLEN", "msgs:%s|%s" % (pid, k)) or 0) >= 200:
            raise HttpError(400, "Percakapan ini sudah penuh. Silakan hubungi loket langsung.")
        add_msg(pid, k, "pemohon", isi)
        self.json({"ok": True}, extra=ex)

    def user_nilai(self, ses, b, ex):
        k, v, pid = str(b.get("kunci", "")), b.get("nilai"), ses["id"]
        if not valid_key(k) or v not in (1, 2, 3, 4, 5):
            raise HttpError(400, "Penilaian tidak valid.")
        if not db().cmd("HGET", "tla", "%s|%s" % (pid, k)):
            raise HttpError(400, "Belum ada balasan admin untuk dinilai.")
        db().cmd("HSET", "nilai", "%s|%s" % (pid, k), v)
        self.json({"ok": True}, extra=ex)

    # ---- admin ----
    def admin(self, method, r, q, b, ex):
        if r == "percakapan":
            return self.json({"daftar": threads()}, extra=ex)
        if r == "pesan":
            pid, k = int((q.get("pid") or ["0"])[0] or 0), (q.get("kunci") or [""])[0]
            if not valid_key(k):
                raise HttpError(400, "Data tidak valid.")
            ms = [parse(s) for s in db().cmd("LRANGE", "msgs:%s|%s" % (pid, k), 0, -1) or []]
            return self.json({"pesan": [m for m in ms if m]}, extra=ex)
        if r == "rekap.csv":
            return self.rekap(ex)
        if r == "data.xlsx":
            return self.xlsx(ex)
        if method != "POST":
            raise HttpError(404, "Tidak ditemukan.")
        if r == "balas":
            pid, k, isi = int(b.get("pid") or 0), str(b.get("kunci", "")), clean(b.get("isi", ""), 800)
            if not valid_key(k) or not isi or not db().cmd("HGET", "pemohon", pid):
                raise HttpError(400, "Balasan tidak valid.")
            add_msg(pid, k, "admin", isi)
            return self.json({"ok": True}, extra=ex)
        if r == "selesai":
            pid, k = int(b.get("pid") or 0), str(b.get("kunci", ""))
            if not valid_key(k):
                raise HttpError(400, "Data tidak valid.")
            db().cmd("HSET", "sel", "%s|%s" % (pid, k), now_ms())
            return self.json({"ok": True}, extra=ex)
        if r == "hapus":
            pid, k = int(b.get("pid") or 0), str(b.get("kunci", ""))
            f = "%s|%s" % (pid, k)
            db().pipe([["DEL", "msgs:" + f], ["SREM", "pk:%s" % pid, k]] + [["HDEL", h, f] for h in ("tlu", "tla", "tlast", "sel", "nilai")])
            return self.json({"ok": True}, extra=ex)
        if r == "pengaturan":
            wa = clean(b.get("wa", ""), 16)
            if wa and not norm_hp(wa):
                raise HttpError(400, "Nomor WA resmi tidak valid.")
            db().pipe([["HSET", "cfg", "wa", norm_hp(wa) or ""], ["HSET", "cfg", "jam", clean(b.get("jam", ""), 100)],
                       ["HSET", "cfg", "info", clean(b.get("info", ""), 300)]])
            return self.json({"ok": True}, extra=ex)
        if r == "password":
            h = db().cmd("HGET", "cfg", "admin_hash") or ""
            if not check_pw(str(b.get("lama", "")), h):
                raise HttpError(401, "Kata sandi lama salah.")
            baru = str(b.get("baru", ""))
            if len(baru) < 8:
                raise HttpError(400, "Kata sandi minimal 8 karakter.")
            db().cmd("HSET", "cfg", "admin_hash", hash_pw(baru))
            return self.json({"ok": True}, extra=self.cookie("", 0))
        raise HttpError(404, "Tidak ditemukan.")

    def rekap(self, ex):
        def c(v):
            v = "" if v is None else str(v)
            return "'" + v if v[:1] in ("=", "+", "-", "@", "\t", "\r") else v
        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow(["Nama", "Nomor HP", "Email", "Lokasi dan loket", "Pesan terakhir", "Waktu", "Status", "Nilai"])
        for t in threads():
            w.writerow([c(t["nama"]), c(t["hp"]), c(t["email"]), c(label(t["kunci"])), c(t["teks"]),
                        time.strftime("%d-%m-%Y %H:%M", time.gmtime(t["waktu"] / 1000 + 7 * 3600)),
                        "Perlu dijawab" if t["pend"] else "Sudah dijawab", t["nilai"] or ""])
        self.out(200, "\ufeff" + buf.getvalue(), "text/csv; charset=utf-8", [("Content-Disposition", 'attachment; filename="rekap.csv"')] + ex)

    def xlsx(self, ex):
        from openpyxl import Workbook
        wb = Workbook()
        wb.remove(wb.active)

        def sheet(name, head, rows):
            ws = wb.create_sheet(name)
            ws.append(head)
            for i, r in enumerate(rows, start=2):
                for j, v in enumerate(r, start=1):
                    c = ws.cell(row=i, column=j, value=v)
                    if isinstance(v, str):
                        c.data_type = "s"
            for col in ws.columns:
                ws.column_dimensions[col[0].column_letter].width = 24
            ws.freeze_panes = "A2"
        pem = {k: parse(v, {}) for k, v in hall(db().cmd("HGETALL", "pemohon")).items()}
        sheet("Pemohon", ["id", "nama", "hp", "email", "dibuat"],
              [[p["id"], p["nama"], p["hp"], p.get("email", ""), time.strftime("%d-%m-%Y %H:%M", time.gmtime(p.get("dibuat", 0) / 1000 + 7 * 3600))] for p in pem.values()])
        ts = threads()
        lists = db().pipe([["LRANGE", "msgs:%s|%s" % (t["pid"], t["kunci"]), 0, -1] for t in ts])
        rows = []
        for t, lst in zip(ts, lists):
            for s in lst or []:
                m = parse(s)
                if m:
                    rows.append([m["id"], t["pid"], t["nama"], label(t["kunci"]), m["dari"], m["isi"], time.strftime("%d-%m-%Y %H:%M", time.gmtime(m["waktu"] / 1000 + 7 * 3600))])
        sheet("Pesan", ["id", "pid", "nama", "loket", "dari", "isi", "waktu"], rows)
        sheet("Status", ["nama", "loket", "perlu_dijawab", "nilai"], [[t["nama"], label(t["kunci"]), "ya" if t["pend"] else "tidak", t["nilai"] or ""] for t in ts])
        sheet("Loket", ["lokasi", "no", "nama", "zona", "uraian", "sistem"], [[e["lokasi"], e["no"], e["nama"], e.get("zona", ""), e["uraian"], e["sistem"]] for e in SEED["loket"]])
        bio = io.BytesIO()
        wb.save(bio)
        self.out(200, bio.getvalue(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                 [("Content-Disposition", 'attachment; filename="data-takok.xlsx"')] + ex)
