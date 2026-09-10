export const prerender = false;

import { db } from "../../lib/db.js";
import fs from "node:fs/promises";
import path from "node:path";

export async function GET({ request }) {
    try {
        const url = new URL(request.url);

        const id = url.searchParams.get("id");

        if (!id) {
            return new Response(
                JSON.stringify({
                    success: false,
                    message: "ID artikel tidak ditemukan",
                }),
                {
                    status: 400,
                    headers: {
                        "Content-Type": "application/json",
                    },
                }
            );
        }

        // Ambil artikel terlebih dahulu
        // supaya nama gambar bisa diketahui
        const [rows] = await db.query(
            `
            SELECT id_post, picture
            FROM post
            WHERE id_post = ?
            LIMIT 1
            `,
            [id]
        );

        if (!rows || rows.length === 0) {
            return new Response(
                JSON.stringify({
                    success: false,
                    message: "Artikel tidak ditemukan",
                }),
                {
                    status: 404,
                    headers: {
                        "Content-Type": "application/json",
                    },
                }
            );
        }

        const artikel = rows[0];

        // Hapus dari database
        await db.query(
            `
            DELETE FROM post
            WHERE id_post = ?
            `,
            [id]
        );

        // Hapus gambar jika ada
        if (artikel.picture) {
            const namaFile = String(
                artikel.picture
            ).trim();

            if (
                namaFile &&
                !namaFile.startsWith("http://") &&
                !namaFile.startsWith("https://") &&
                !namaFile.startsWith("//")
            ) {
                const filePath = path.join(
                    process.cwd(),
                    "public",
                    "uploads",
                    namaFile
                );

                try {
                    await fs.unlink(filePath);
                } catch (error) {
                    console.warn(
                        "File gambar tidak ditemukan:",
                        filePath
                    );
                }
            }
        }

        // Kembali ke halaman artikel
        return Response.redirect(
            new URL("/admin/artikel", request.url),
            302
        );

    } catch (error) {
        console.error(
            "ERROR API HAPUS ARTIKEL:",
            error
        );

        return new Response(
            JSON.stringify({
                success: false,
                message: "Gagal menghapus artikel",
                error:
                    error?.message ||
                    String(error),
            }),
            {
                status: 500,
                headers: {
                    "Content-Type":
                        "application/json",
                },
            }
        );
    }
}
