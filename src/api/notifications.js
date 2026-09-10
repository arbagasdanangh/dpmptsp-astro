import { db } from "../../lib/db.js";

export const prerender = false;

export async function GET({ cookies }) {
  const auth = cookies.get("admin-auth");

  // =========================================
  // CEK LOGIN ADMIN
  // =========================================
  if (!auth?.value) {
    return new Response(
      JSON.stringify({
        success: false,
        total: 0,
        notifications: [],
        message: "Unauthorized",
      }),
      {
        status: 401,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      }
    );
  }

  try {
    console.log("=================================");
    console.log("NOTIFICATION API DIPANGGIL");

    // =========================================
    // AMBIL DATA DARI SEMUA TABEL
    // =========================================

    // BERITA / ARTIKEL
    const [postRows] = await db.query(`
      SELECT
        id_post,
        id_category
      FROM post
      ORDER BY id_post DESC
      LIMIT 10
    `);

    // KONTEN
    const [kontenRows] = await db.query(`
      SELECT
        Id_Konten,
        Nama_Konten,
        Judul_Konten
      FROM tentangkamiswebv5
      ORDER BY Id_Konten DESC
      LIMIT 10
    `);

    // TEMPAT LAYANAN
    const [tempatRows] = await db.query(`
      SELECT *
      FROM tempat_layanan
      ORDER BY id DESC
      LIMIT 10
    `);

    // KINERJA INVESTASI
    const [kinerjaRows] = await db.query(`
      SELECT *
      FROM twdata
      ORDER BY id DESC
      LIMIT 10
    `);

    // INOVASI LAYANAN
    const [inovasiRows] = await db.query(`
      SELECT *
      FROM inovasi_layanan
      ORDER BY id DESC
      LIMIT 10
    `);

    // CAROUSEL
    const [carouselRows] = await db.query(`
      SELECT *
      FROM beranda_slider
      ORDER BY urutan ASC, id ASC
      LIMIT 10
    `);

    console.log("POST:", postRows.length);
    console.log("KONTEN:", kontenRows.length);
    console.log("TEMPAT:", tempatRows.length);
    console.log("KINERJA:", kinerjaRows.length);
    console.log("INOVASI:", inovasiRows.length);
    console.log("CAROUSEL:", carouselRows.length);

    // =========================================
    // GABUNG SEMUA NOTIFIKASI
    // =========================================

    const notifications = [];

    // =========================================
    // 1. BERITA / ARTIKEL
    // =========================================

    for (const row of postRows) {
      const category = Number(row.id_category);

      const isBerita =
        category === 1 ||
        category === 8;

      notifications.push({
        id: `post-${row.id_post}`,

        source: "post",

        type: isBerita
          ? "Berita"
          : "Artikel",

        title: isBerita
          ? "Berita baru ditambahkan"
          : "Artikel baru ditambahkan",

        message: isBerita
          ? "Data berita baru telah masuk."
          : "Data artikel baru telah masuk.",

        icon: isBerita
          ? "📰"
          : "📝",

        url: isBerita
          ? "/admin/artikel?type=berita"
          : "/admin/artikel?type=artikel",

        created_id: Number(row.id_post),
      });
    }

    // =========================================
    // 2. KONTEN
    // =========================================

    for (const row of kontenRows) {
      notifications.push({
        id: `konten-${row.Id_Konten}`,

        source: "tentangkamiswebv5",

        type: "Konten",

        title: "Konten baru ditambahkan",

        message:
          row.Judul_Konten ||
          row.Nama_Konten ||
          "Data konten baru telah masuk.",

        icon: "📄",

        url: "/admin/konten",

        created_id: Number(row.Id_Konten),
      });
    }

    // =========================================
    // 3. TEMPAT LAYANAN
    // =========================================

    for (const row of tempatRows) {
      notifications.push({
        id: `tempat-${row.id}`,

        source: "tempat_layanan",

        type: "Tempat Layanan",

        title: "Tempat layanan baru ditambahkan",

        message:
          row.nama ||
          row.nama_tempat ||
          "Data tempat layanan baru telah masuk.",

        icon: "📍",

        url: "/admin/tempat-layanan",

        created_id: Number(row.id),
      });
    }

    // =========================================
    // 4. KINERJA INVESTASI
    // =========================================

    for (const row of kinerjaRows) {
      notifications.push({
        id: `kinerja-${row.id}`,

        source: "twdata",

        type: "Kinerja Investasi",

        title: "Kinerja Investasi baru ditambahkan",

        message:
          row.tw_option ||
          "Data kinerja investasi baru telah masuk.",

        icon: "📊",

        url: "/admin/kinerja",

        created_id: Number(row.id),
      });
    }

    // =========================================
    // 5. INOVASI LAYANAN
    // =========================================

    for (const row of inovasiRows) {
      notifications.push({
        id: `inovasi-${row.id}`,

        source: "inovasi_layanan",

        type: "Inovasi Layanan",

        title: "Inovasi layanan baru ditambahkan",

        message:
          row.nama ||
          row.nama_inovasi ||
          "Data inovasi layanan baru telah masuk.",

        icon: "💡",

        url: "/admin/inovasi-layanan",

        created_id: Number(row.id),
      });
    }

    // =========================================
    // 6. CAROUSEL
    // =========================================

    for (const row of carouselRows) {
      notifications.push({
        id: `carousel-${row.id}`,

        source: "beranda_slider",

        type: "Carousel",

        title: "Carousel baru ditambahkan",

        message: "Data carousel baru telah masuk.",

        icon: "🖼️",

        url: "/admin/carousel",

        created_id: Number(row.id),
      });
    }

    // =========================================
    // URUTKAN
    // =========================================
    //
    // Karena tabel berbeda tidak mempunyai
    // timestamp yang sama, kita tidak boleh
    // menganggap ID antar tabel sebagai waktu.
    //
    // Untuk sementara setiap sumber sudah
    // mengambil data terbaru berdasarkan ID.
    //
    // Kinerja diprioritaskan supaya data baru
    // yang ditambahkan langsung terlihat.
    // =========================================

    const priority = {
      "twdata": 6,
      "post": 5,
      "tentangkamiswebv5": 4,
      "tempat_layanan": 3,
      "inovasi_layanan": 2,
      "beranda_slider": 1,
    };

    notifications.sort((a, b) => {
      const priorityA = priority[a.source] || 0;
      const priorityB = priority[b.source] || 0;

      if (priorityA !== priorityB) {
        return priorityB - priorityA;
      }

      return b.created_id - a.created_id;
    });

    // =========================================
    // AMBIL 10 NOTIFIKASI
    // =========================================

    const latestNotifications = notifications
      .slice(0, 10)
      .map(({ created_id, ...notification }) => notification);

    // =========================================
    // RESPONSE
    // =========================================

    return new Response(
      JSON.stringify({
        success: true,
        total: latestNotifications.length,
        notifications: latestNotifications,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control":
            "no-store, no-cache, must-revalidate, proxy-revalidate",
          Pragma: "no-cache",
          Expires: "0",
        },
      }
    );
  } catch (error) {
    console.error("=================================");
    console.error("NOTIFICATION ERROR:");
    console.error(error);
    console.error("=================================");

    return new Response(
      JSON.stringify({
        success: false,
        total: 0,
        notifications: [],
        message: "Gagal mengambil pemberitahuan",
        error: error?.message || String(error),
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      }
    );
  }
}