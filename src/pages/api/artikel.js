export const prerender = false;

import { db } from "../../lib/db.js";
import fs from "node:fs/promises";
import path from "node:path";

export async function POST({ request }) {
    try {
        const formData = await request.formData();

        // =====================================================
        // TITLE
        // =====================================================

        const title =
            formData.get("title")?.toString().trim() || "";

        // =====================================================
        // SLUG
        // =====================================================

        const slug = title
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9\s-]/g, "")
            .replace(/\s+/g, "-")
            .replace(/-+/g, "-")
            .replace(/^-|-$/g, "");

        // =====================================================
        // CATEGORY
        // =====================================================

        const category =
            formData.get("category")?.toString().trim() || "";

        const categoryId = Number(category);

        // =====================================================
        // ISI ARTIKEL
        //
        // content      = slug
        // ref_content  = isi textarea/editor
        // =====================================================

        const refContent =
            formData.get("content")?.toString() || "";

        const content = slug;

        // =====================================================
        // STATUS
        // =====================================================

        const active =
            formData.get("active")?.toString() || "Y";

        // =====================================================
        // TAG
        // =====================================================

        const tag =
            formData.get("tag")?.toString() || "";

        // =====================================================
        // SEO TITLE
        // =====================================================

        const seoTitle =
            formData.get("seotitle")?.toString() || title;

        // =====================================================
        // DATE
        // =====================================================

        const date =
            formData.get("date")?.toString().trim() || "";

        // =====================================================
        // HEADLINE
        // =====================================================

        const headline =
            formData.get("headline")?.toString() || "N";

        // =====================================================
        // EDITOR
        // =====================================================
        //
        // Jika form belum mengirim editor,
        // gunakan "1" seperti kode sebelumnya.
        //
        // =====================================================

        const editor =
            formData.get("editor")?.toString() || "1";

        // =====================================================
        // AMBIL GAMBAR
        // =====================================================

        const picture =
            formData.get("picture");

        let namaFile = "";

        if (
            picture instanceof File &&
            picture.size > 0
        ) {

            // =================================================
            // FOLDER UPLOAD
            // =================================================

            const uploadDir = path.join(
                process.cwd(),
                "public",
                "uploads"
            );

            await fs.mkdir(
                uploadDir,
                {
                    recursive: true,
                }
            );

            // =================================================
            // EXTENSION FILE
            // =================================================

            const originalName =
                picture.name || "";

            let extension =
                path.extname(originalName)
                    .toLowerCase();

            // =================================================
            // FALLBACK EXTENSION
            // =================================================

            if (!extension) {
                extension = ".jpg";
            }

            // =================================================
            // TANGGAL UNTUK NAMA FILE
            //
            // Prioritas:
            // 1. date dari form
            // 2. tanggal hari ini
            // =================================================

            const tanggalFile =
                date ||
                new Date()
                    .toISOString()
                    .slice(0, 10);

            // =================================================
            // JENIS CONTENT
            //
            // 1, 8 = BERITA
            // 2, 3 = ARTIKEL
            // =================================================

            let jenisContent = "content";

            if (
                [1, 8].includes(categoryId)
            ) {

                jenisContent = "berita";

            } else if (
                [2, 3].includes(categoryId)
            ) {

                jenisContent = "artikel";

            }

            // =================================================
            // NAMA FILE
            // =================================================
            //
            // BERITA:
            //
            // berita-1-judul-2026-09-06.jpg
            //
            // ARTIKEL:
            //
            // artikel-2-judul-2026-09-06.jpg
            //
            // =================================================

            namaFile =
                `${jenisContent}-${categoryId}-${slug}-${tanggalFile}${extension}`;

            // =================================================
            // PATH FILE
            // =================================================

            const filePath =
                path.join(
                    uploadDir,
                    namaFile
                );

            // =================================================
            // BACA FILE
            // =================================================

            const buffer =
                Buffer.from(
                    await picture.arrayBuffer()
                );

            // =================================================
            // SIMPAN FILE
            // =================================================

            await fs.writeFile(
                filePath,
                buffer
            );
        }

        // =====================================================
        // INSERT DATABASE
        // =====================================================

        await db.query(
            `
            INSERT INTO post
            (
                id_category,
                title,
                content,
                ref_content,
                seotitle,
                tag,
                date,
                time,
                editor,
                active,
                headline,
                picture,
                hits
            )
            VALUES
            (
                ?,
                ?,
                ?,
                ?,
                ?,
                ?,
                ?,
                CURTIME(),
                ?,
                ?,
                ?,
                ?,
                ?
            )
            `,
            [
                categoryId,
                title,
                content,
                refContent,
                seoTitle,
                tag,
                date,
                editor,
                active,
                headline,
                namaFile,
                1,
            ]
        );

        // =====================================================
        // REDIRECT
        // =====================================================

        return Response.redirect(
            new URL(
                "/admin/artikel",
                request.url
            ),
            302
        );

    } catch (error) {

        console.error(
            "ERROR API ARTIKEL:",
            error
        );

        return new Response(
            JSON.stringify(
                {
                    success: false,
                    message:
                        "Gagal menyimpan artikel",
                    error:
                        error?.message ||
                        String(error),
                },
                null,
                2
            ),
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
