import { db } from "../../lib/db.js";

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

// GET
export async function GET() {
  try {
    const [rows] = await db.query(`
      SELECT
        id,
        judul,
        isi,
        gambar,
        tipe,
        icon,
        link,
        teks_link
      FROM notifikasi_beranda
      WHERE active = 'Y'
        AND (mulai IS NULL OR mulai <= NOW())
        AND (selesai IS NULL OR selesai >= NOW())
      ORDER BY urutan ASC, id DESC
      LIMIT 5
    `);

    return jsonResponse({
      success: true,
      data: rows,
    });
  } catch (error) {
    console.error(error);

    return jsonResponse({
      success: false,
      error: error.message,
    }, 500);
  }
}

// POST
export async function POST({ request }) {
  try {
    const data = await request.json();

    const [result] = await db.query(
      `
      INSERT INTO notifikasi_beranda
      (
        judul,
        isi,
        gambar,
        tipe,
        icon,
        link,
        teks_link,
        active,
        mulai,
        selesai,
        urutan
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        data.judul || "",
        data.isi || null,
        data.gambar || null,
        data.tipe || "info",
        data.icon || "fa-circle-info",
        data.link || null,
        data.teks_link || null,
        data.active || "Y",
        data.mulai || null,
        data.selesai || null,
        Number(data.urutan || 0),
      ]
    );

    return jsonResponse({
      success: true,
      id: result.insertId,
    }, 201);

  } catch (error) {
    console.error(error);

    return jsonResponse({
      success: false,
      error: error.message,
    }, 500);
  }
}

// DELETE
export async function DELETE({ request }) {
  try {

    // =========================================
    // AMBIL ID DARI URL
    // /api/pemberitahuan?id=3
    // =========================================

    const url = new URL(request.url);

    const idParam = url.searchParams.get("id");

    console.log("=================================");
    console.log("DELETE PEMBERITAHUAN");
    console.log("URL:", request.url);
    console.log("ID PARAM:", idParam);
    console.log("=================================");

    const id = parseInt(idParam, 10);

    if (!Number.isInteger(id) || id <= 0) {
      return jsonResponse({
        success: false,
        error: "ID pemberitahuan tidak valid.",
        received: idParam,
      }, 400);
    }

    // =========================================
    // CEK DATA
    // =========================================

    const [rows] = await db.query(
      `
      SELECT id, judul
      FROM notifikasi_beranda
      WHERE id = ?
      LIMIT 1
      `,
      [id]
    );

    console.log("DATA:", rows);

    if (!rows || rows.length === 0) {
      return jsonResponse({
        success: false,
        error: "Pemberitahuan tidak ditemukan.",
        id,
      }, 404);
    }

    // =========================================
    // DELETE
    // =========================================

    const [result] = await db.query(
      `
      DELETE FROM notifikasi_beranda
      WHERE id = ?
      `,
      [id]
    );
 
    console.log("DELETE RESULT:", result);

    if (result.affectedRows !== 1) {
      return jsonResponse({
        success: false,
        error: "Data gagal dihapus.",
      }, 500);
    }

    return jsonResponse({
      success: true,
      message: "Pemberitahuan berhasil dihapus.",
      id,
    });

  } catch (error) {

    console.error("DELETE ERROR:", error);

    return jsonResponse({
      success: false,
      error:
        error instanceof Error
          ? error.message
          : String(error),
    }, 500);
  }
}