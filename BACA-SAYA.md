# Takok Pelayanan Suroboyo - versi Vercel

Catatan penting: Vercel tidak menyimpan file secara permanen, jadi file Excel tidak bisa dipakai sebagai database langsung di sana.
Karena itu data disimpan di Upstash Redis (gratis, dipasang dari Vercel), dan **Excel tersedia sebagai unduhan** dari panel admin (tombol "Unduh database (Excel)").

## Langkah pasang
1. Unggah folder ini ke GitHub (atau jalankan `vercel` dari folder ini).
2. Di vercel.com: Add New > Project > pilih repo tersebut > Deploy.
3. Di proyek tersebut: tab **Storage** > Create/Connect **Upstash for Redis** (Marketplace) > hubungkan ke proyek.
   Ini otomatis menambah variabel `KV_REST_API_URL` dan `KV_REST_API_TOKEN`.
4. Tab **Settings > Environment Variables**, tambahkan:
   - `SESSION_SECRET` : teks acak panjang (minimal 32 karakter). Contoh buat di komputer: `python -c "import secrets;print(secrets.token_urlsafe(48))"`
   - `ADMIN_PASSWORD`  : kata sandi admin awal (minimal 8 karakter).
5. **Redeploy** (Deployments > titik tiga > Redeploy).
6. Buka alamat situs > "Masuk admin" > pakai `ADMIN_PASSWORD` > Pengaturan > ganti kata sandi. Setelah diganti, yang dipakai adalah kata sandi baru (disimpan sebagai hash), bukan variabel lagi.

## Mengubah isi loket
Edit `api/_data.py` (nama, uraian, sistem tiap loket; ada uraian yang masih "Belum diisi"), lalu commit dan deploy ulang.

## Keamanan
Kata sandi dan PIN di-hash (PBKDF2), cookie sesi bertanda tangan, HttpOnly, Secure, SameSite=Strict; batas percobaan masuk disimpan di Redis; perlindungan CSRF; header keamanan (CSP, HSTS); pemohon hanya bisa membaca percakapannya sendiri; pesan berisi NIK 16 digit ditolak.

## Batasan
- Notifikasi muncul saat halaman terbuka; halaman memeriksa balasan tiap 10-20 detik (lebih jarang saat tab tidak aktif) agar hemat kuota Redis.
- WhatsApp/email otomatis belum ada; admin memakai tombol WhatsApp/Email yang sudah terisi pesan.
- Paket gratis Vercel (Hobby) ditujukan untuk pemakaian pribadi/non-komersial. Untuk layanan instansi, periksa ketentuan dan pertimbangkan paket Pro.
- Nomor HP belum diverifikasi dengan OTP.

## Lokasi MPP Surabaya
Lokasi keenam, **MPP Surabaya** (Mal Pelayanan Publik), berisi instansi per zona dan fasilitas dari denah loket. Pemohon bisa menyaring per zona atau lewat ilustrasi zona.
Rincian layanan tiap instansi belum diisi; lengkapi di `api/_data.py` (kolom `uraian`). Fasilitas non-layanan (Musholla, Ruang Laktasi, dll.) tidak menerima diskusi (`diskusi: False`).
