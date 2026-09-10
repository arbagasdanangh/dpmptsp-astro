// src/pages/api/kontak.ts

import type { APIRoute } from "astro";
import mysql from "mysql2/promise";

export const prerender = false;

/* =========================================================
   DATABASE
========================================================= */

const DB_HOST = import.meta.env.DB_HOST || "127.0.0.1";
const DB_PORT = Number(import.meta.env.DB_PORT || 3306);
const DB_USER = import.meta.env.DB_USER || "root";
const DB_PASSWORD = import.meta.env.DB_PASSWORD || "root";
const DB_NAME = import.meta.env.DB_NAME || "ladpm";

/* =========================================================
   WHATSAPP CLOUD API
========================================================= */

const WA_PHONE_NUMBER_ID =
  import.meta.env.WA_PHONE_NUMBER_ID || "";

const WA_ACCESS_TOKEN =
  import.meta.env.WA_ACCESS_TOKEN || "";

const WA_ADMIN_PHONE =
  import.meta.env.WA_ADMIN_PHONE || "6282298112795";

/* =========================================================
   JSON RESPONSE
========================================================= */

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

/* =========================================================
   MYSQL CONNECTION
========================================================= */

async function getConnection() {
  return mysql.createConnection({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
  });
}

/* =========================================================
   GENERATE TICKET
========================================================= */

function generateTicket() {
  const now = new Date();

  const year = now.getFullYear();

  const month = String(
    now.getMonth() + 1
  ).padStart(2, "0");

  const day = String(
    now.getDate()
  ).padStart(2, "0");

  const random = Math.random()
    .toString(36)
    .substring(2, 6)
    .toUpperCase();

  return `DPMPTSP-${year}${month}${day}-${random}`;
}

/* =========================================================
   FORMAT TANGGAL
========================================================= */

function formatTanggal() {
  return new Intl.DateTimeFormat(
    "id-ID",
    {
      timeZone: "Asia/Jakarta",
      dateStyle: "short",
      timeStyle: "medium",
    }
  ).format(new Date());
}

/* =========================================================
   KIRIM WHATSAPP
========================================================= */

async function kirimWhatsApp({
  tiket,
  nama,
  telepon,
  email,
  kategori,
  subjek,
  pesan,
}: {
  tiket: string;
  nama: string;
  telepon: string;
  email: string;
  kategori: string;
  subjek: string;
  pesan: string;
}) {
  /*
   * Kalau credential WhatsApp belum diisi,
   * jangan membuat submit database gagal.
   */

  if (
    !WA_PHONE_NUMBER_ID ||
    !WA_ACCESS_TOKEN
  ) {
    console.warn(
      "WhatsApp API belum dikonfigurasi."
    );

    return {
      success: false,
      configured: false,
      message:
        "WhatsApp API belum dikonfigurasi.",
    };
  }

  const message = [
    "Halo Admin DPMPTSP,",
    "",
    "Ada pengaduan baru dari website.",
    "",
    "━━━━━━━━━━━━━━━━━━━━",
    "NOMOR TIKET",
    tiket,
    "━━━━━━━━━━━━━━━━━━━━",
    "",
    `Nama:`,
    nama,
    "",
    `Telepon / WhatsApp:`,
    telepon,
    "",
    `Email:`,
    email,
    "",
    `Kategori:`,
    kategori,
    "",
    `Subjek:`,
    subjek,
    "",
    `Pesan:`,
    pesan,
    "",
    `Tanggal:`,
    formatTanggal(),
    "",
    "Mohon pengaduan ini dapat ditindaklanjuti.",
    "",
    "Terima kasih.",
  ].join("\n");

  try {
    /*
     * Gunakan Graph API Meta.
     *
     * Versi API bisa berubah.
     * Untuk sementara ambil dari environment,
     * atau gunakan versi yang tersedia di akun Meta kamu.
     */

    const WA_API_VERSION =
      import.meta.env.WA_API_VERSION || "v23.0";

    const response = await fetch(
      `https://graph.facebook.com/${WA_API_VERSION}/${WA_PHONE_NUMBER_ID}/messages`,
      {
        method: "POST",

        headers: {
          Authorization:
            `Bearer ${WA_ACCESS_TOKEN}`,

          "Content-Type":
            "application/json",
        },

        body: JSON.stringify({
          messaging_product: "whatsapp",

          recipient_type:
            "individual",

          to: WA_ADMIN_PHONE,

          type: "text",

          text: {
            preview_url: false,
            body: message,
          },
        }),
      }
    );

    const raw =
      await response.text();

    let result: any = {};

    try {
      result =
        raw ? JSON.parse(raw) : {};
    } catch {
      result = {
        raw,
      };
    }

    if (!response.ok) {
      console.error(
        "WHATSAPP API ERROR:",
        result
      );

      return {
        success: false,
        configured: true,
        message:
          result?.error?.message ||
          "Gagal mengirim WhatsApp.",
        result,
      };
    }

    console.log(
      "WHATSAPP BERHASIL:",
      result
    );

    return {
      success: true,
      configured: true,
      result,
    };

  } catch (error) {

    console.error(
      "WHATSAPP REQUEST ERROR:",
      error
    );

    return {
      success: false,
      configured: true,
      message:
        error instanceof Error
          ? error.message
          : "Gagal menghubungi WhatsApp API.",
    };
  }
}

/* =========================================================
   POST
========================================================= */

export const POST: APIRoute = async ({
  request,
}) => {

  let connection;

  try {

    /* -----------------------------------------
       CONTENT TYPE
    ----------------------------------------- */

    const contentType =
      request.headers.get(
        "content-type"
      ) || "";

    if (
      !contentType.includes(
        "application/json"
      )
    ) {
      return json(
        {
          success: false,
          message:
            "Request harus menggunakan JSON.",
        },
        415
      );
    }

    /* -----------------------------------------
       BODY
    ----------------------------------------- */

    const body =
      await request.json();

    const nama =
      String(
        body?.nama || ""
      ).trim();

    const telepon =
      String(
        body?.telepon || ""
      ).trim();

    const kategori =
      String(
        body?.kategori || ""
      ).trim();

    const email =
      String(
        body?.email || ""
      ).trim();

    const subjek =
      String(
        body?.subjek || ""
      ).trim();

    const pesan =
      String(
        body?.pesan || ""
      ).trim();

    /* -----------------------------------------
       VALIDASI
    ----------------------------------------- */

    if (
      !nama ||
      !telepon ||
      !kategori ||
      !email ||
      !subjek ||
      !pesan
    ) {
      return json(
        {
          success: false,
          message:
            "Mohon lengkapi seluruh data pengaduan.",
        },
        400
      );
    }

    /* -----------------------------------------
       MYSQL
    ----------------------------------------- */

    connection =
      await getConnection();

    await connection.query(
      "SELECT 1"
    );

    /* -----------------------------------------
       TIKET
    ----------------------------------------- */

    let tiket = "";
    let ticketFound = false;

    for (let i = 0; i < 10; i++) {

      const calon =
        generateTicket();

      const [rows] =
        await connection.execute(
          `
          SELECT id
          FROM kontak_pengaduan
          WHERE tiket = ?
          LIMIT 1
          `,
          [calon]
        );

      if (
        (rows as any[]).length === 0
      ) {
        tiket = calon;
        ticketFound = true;
        break;
      }
    }

    if (
      !ticketFound ||
      !tiket
    ) {
      return json(
        {
          success: false,
          message:
            "Gagal membuat nomor tiket.",
        },
        500
      );
    }

    /* -----------------------------------------
       INSERT MYSQL
    ----------------------------------------- */

    await connection.execute(
      `
      INSERT INTO kontak_pengaduan
      (
        tiket,
        nama,
        telepon,
        email,
        kategori,
        subjek,
        pesan,
        status,
        tanggal
      )
      VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, NOW())
      `,
      [
        tiket,
        nama,
        telepon,
        email,
        kategori,
        subjek,
        pesan,
        "Diterima",
      ]
    );

    /* -----------------------------------------
       KIRIM WHATSAPP
    ----------------------------------------- */

    const whatsapp =
      await kirimWhatsApp({
        tiket,
        nama,
        telepon,
        email,
        kategori,
        subjek,
        pesan,
      });

    /* -----------------------------------------
       RESPONSE
    ----------------------------------------- */

    return json(
      {
        success: true,

        message:
          "Pengaduan berhasil disimpan.",

        tiket,

        whatsapp: {
          sent:
            whatsapp.success,

          configured:
            whatsapp.configured,

          message:
            whatsapp.message ||
            null,
        },
      },
      201
    );

  } catch (error) {

    console.error(
      "===================================="
    );

    console.error(
      "API KONTAK ERROR"
    );

    console.error(
      error
    );

    console.error(
      "===================================="
    );

    return json(
      {
        success: false,

        message:
          error instanceof Error
            ? error.message
            : "Terjadi kesalahan saat menyimpan pengaduan.",
      },
      500
    );

  } finally {

    if (connection) {

      try {
        await connection.end();
      } catch {
        // ignore
      }

    }

  }
};

/* =========================================================
   GET - TRACKING
========================================================= */

export const GET: APIRoute = async ({
  url,
}) => {

  let connection;

  try {

    const tiket =
      url.searchParams
        .get("tiket")
        ?.trim()
        .toUpperCase();

    if (!tiket) {
      return json(
        {
          success: false,
          message:
            "Nomor tiket wajib diisi.",
        },
        400
      );
    }

    connection =
      await getConnection();

    const [rows] =
      await connection.execute(
        `
        SELECT
          id,
          tiket,
          nama,
          telepon,
          email,
          kategori,
          subjek,
          pesan,
          status,
          tanggal
        FROM kontak_pengaduan
        WHERE tiket = ?
        LIMIT 1
        `,
        [tiket]
      );

    const data =
      (rows as any[])[0];

    if (!data) {
      return json(
        {
          success: false,
          message:
            "Nomor tiket tidak ditemukan.",
        },
        404
      );
    }

    return json(
      {
        success: true,
        data,
      },
      200
    );

  } catch (error) {

    console.error(
      "API TRACKING ERROR:",
      error
    );

    return json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Terjadi kesalahan saat mencari tiket.",
      },
      500
    );

  } finally {

    if (connection) {

      try {
        await connection.end();
      } catch {
        // ignore
      }

    }

  }
};