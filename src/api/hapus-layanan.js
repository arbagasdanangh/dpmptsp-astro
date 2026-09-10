import { db } from "../../lib/db.js";
import fs from "node:fs";
import path from "node:path";

export const prerender = false;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

export async function DELETE({ request }) {
  try {
    const body = await request.json();

    const id = Number(body.id);

    if (!id || Number.isNaN(id)) {
      return json(
        {
          success: false,
          error: "ID layanan tidak valid.",
        },
        400
      );
    }

    // Ambil data gambar sebelum dihapus
    const [rows] = await db.query(
      `
      SELECT id, gambar
      FROM tempat_layanan
      WHERE id = ?
      LIMIT 1
      `,
      [id]
    );

    const data = rows?.[0];

    if (!data) {
      return json(
        {
          success: false,
          error: "Data layanan tidak ditemukan.",
        },
        404
      );
    }

    // Hapus data database
    await db.query(
      `
      DELETE FROM tempat_layanan
      WHERE id = ?
      `,
      [id]
    );

    // Hapus file gambar jika berasal dari /uploads/
    if (
      data.gambar &&
      typeof data.gambar === "string" &&
      data.gambar.startsWith("/uploads/")
    ) {
      const fileName = path.basename(data.gambar);

      const filePath = path.join(
        process.cwd(),
        "public",
        "uploads",
        fileName
      );

      try {
        await fs.promises.unlink(filePath);
        console.log("Gambar dihapus:", filePath);
      } catch (error) {
        // Kalau file sudah tidak ada, database tetap dianggap berhasil dihapus
        console.log(
          "File gambar tidak ditemukan, lanjut hapus database."
        );
      }
    }

    return json({
      success: true,
      message: "Layanan berhasil dihapus.",
    });
  } catch (error) {
    console.error("DELETE LAYANAN ERROR:", error);

    return json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : String(error),
      },
      500
    );
  }
}
