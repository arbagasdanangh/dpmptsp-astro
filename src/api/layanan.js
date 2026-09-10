import { db } from "../../lib/db.js";
import fs from "node:fs";
import path from "node:path";

export const prerender = false;


/* =========================================================
   JSON RESPONSE
========================================================= */

function json(data, status = 200) {
    return new Response(
        JSON.stringify(data),
        {
            status,
            headers: {
                "Content-Type": "application/json"
            }
        }
    );
}


/* =========================================================
   UPLOAD DIRECTORY
========================================================= */

function getUploadDir() {
    return path.join(
        process.cwd(),
        "public",
        "uploads"
    );
}


/* =========================================================
   SAFE FILE NAME
========================================================= */

function safeTitle(title) {
    return title
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}


/* =========================================================
   TANGGAL
   YYYYMMDD
========================================================= */

function getTanggal() {

    const now = new Date();

    return `${now.getFullYear()}${String(
        now.getMonth() + 1
    ).padStart(2, "0")}${String(
        now.getDate()
    ).padStart(2, "0")}`;
}


/* =========================================================
   NAMA FILE UNIK
========================================================= */

function getUniqueFileName(uploadDir, judul) {

    const tanggal =
        getTanggal();

    const cleanTitle =
        safeTitle(judul) || "Layanan";

    const baseName =
        `Layanan-${cleanTitle}-${tanggal}`;

    let fileName =
        `${baseName}.jpg`;

    let filePath =
        path.join(
            uploadDir,
            fileName
        );

    let nomor = 1;

    while (
        fs.existsSync(filePath)
    ) {

        fileName =
            `${baseName}-${nomor}.jpg`;

        filePath =
            path.join(
                uploadDir,
                fileName
            );

        nomor++;
    }

    return {
        fileName,
        filePath
    };
}


/* =========================================================
   VALIDASI IMAGE
========================================================= */

function isValidImage(file) {

    return (
        file instanceof File &&
        [
            "image/jpeg",
            "image/png"
        ].includes(file.type)
    );
}


/* =========================================================
   POST
   TAMBAH LAYANAN
========================================================= */

export async function POST({ request }) {

    try {

        const contentType =
            request.headers.get("content-type") || "";


        if (
            !contentType
                .toLowerCase()
                .includes("multipart/form-data")
        ) {

            return json(
                {
                    success: false,
                    error:
                        "Request harus menggunakan multipart/form-data."
                },
                400
            );

        }


        const formData =
            await request.formData();


        const judul =
            String(
                formData.get("judul") || ""
            ).trim();


        const deskripsi =
            String(
                formData.get("deskripsi") || ""
            ).trim();


        const altText =
            String(
                formData.get("alt_text") || ""
            ).trim();


        const lokasi =
            String(
                formData.get("lokasi") || ""
            ).trim();


        const alamat =
            String(
                formData.get("alamat") || ""
            ).trim();


        const gambar =
            formData.get("gambar");


        /* =====================================================
           VALIDASI
        ===================================================== */

        if (!judul) {

            return json(
                {
                    success: false,
                    error: "Judul wajib diisi."
                },
                400
            );

        }


        if (!isValidImage(gambar)) {

            return json(
                {
                    success: false,
                    error:
                        "File gambar harus JPG, JPEG, atau PNG."
                },
                400
            );

        }


        if (
            gambar.size >
            2 * 1024 * 1024
        ) {

            return json(
                {
                    success: false,
                    error:
                        "Ukuran gambar maksimal 2 MB."
                },
                400
            );

        }


        /* =====================================================
           FOLDER
        ===================================================== */

        const uploadDir =
            getUploadDir();


        await fs.promises.mkdir(
            uploadDir,
            {
                recursive: true
            }
        );


        /* =====================================================
           NAMA FILE
        ===================================================== */

        const {
            fileName,
            filePath
        } =
            getUniqueFileName(
                uploadDir,
                judul
            );


        /* =====================================================
           SIMPAN FILE
        ===================================================== */

        const buffer =
            Buffer.from(
                await gambar.arrayBuffer()
            );


        await fs.promises.writeFile(
            filePath,
            buffer
        );


        const imagePath =
            `/uploads/${fileName}`;


        /* =====================================================
           INSERT
        ===================================================== */

        await db.query(
            `
            INSERT INTO tempat_layanan
            (
                judul,
                deskripsi,
                gambar,
                alt_text,
                lokasi,
                alamat,
                warna
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
            `,
            [
                judul,
                deskripsi,
                imagePath,
                altText,
                lokasi,
                alamat,
                "blue"
            ]
        );


        return json({
            success: true,
            gambar: imagePath
        });


    } catch (error) {

        console.error(
            "POST LAYANAN ERROR:",
            error
        );


        return json(
            {
                success: false,
                error:
                    error instanceof Error
                        ? error.message
                        : String(error)
            },
            500
        );

    }

}


/* =========================================================
   PUT
   EDIT LAYANAN
========================================================= */

export async function PUT({ request }) {

    let newFilePath = null;

    try {

        const url =
            new URL(request.url);


        const id =
            url.searchParams.get("id");


        if (!id) {

            return json(
                {
                    success: false,
                    error:
                        "ID layanan tidak ditemukan."
                },
                400
            );

        }


        /* =====================================================
           CONTENT TYPE
        ===================================================== */

        const contentType =
            request.headers.get(
                "content-type"
            ) || "";


        if (
            !contentType
                .toLowerCase()
                .includes("multipart/form-data")
        ) {

            return json(
                {
                    success: false,
                    error:
                        "Request PUT harus menggunakan multipart/form-data."
                },
                400
            );

        }


        /* =====================================================
           FORM DATA
        ===================================================== */

        const formData =
            await request.formData();


        const judul =
            String(
                formData.get("judul") || ""
            ).trim();


        const deskripsi =
            String(
                formData.get("deskripsi") || ""
            ).trim();


        const altText =
            String(
                formData.get("alt_text") || ""
            ).trim();


        const lokasi =
            String(
                formData.get("lokasi") || ""
            ).trim();


        const alamat =
            String(
                formData.get("alamat") || ""
            ).trim();


        const gambar =
            formData.get("gambar");


        /* =====================================================
           VALIDASI JUDUL
        ===================================================== */

        if (!judul) {

            return json(
                {
                    success: false,
                    error:
                        "Judul wajib diisi."
                },
                400
            );

        }


        /* =====================================================
           AMBIL DATA LAMA
        ===================================================== */

        const [rows] =
            await db.query(
                `
                SELECT
                    id,
                    gambar
                FROM tempat_layanan
                WHERE id = ?
                LIMIT 1
                `,
                [id]
            );


        /*
         * PENTING:
         * Karena file JS, JANGAN pakai:
         *
         * (rows as any[])[0]
         *
         * Cukup:
         */

        const oldData =
            rows && rows.length > 0
                ? rows[0]
                : null;


        if (!oldData) {

            return json(
                {
                    success: false,
                    error:
                        "Data layanan tidak ditemukan."
                },
                404
            );

        }


        /* =====================================================
           CEK ADA FILE BARU ATAU TIDAK
        ===================================================== */

        const hasNewFile =
            gambar instanceof File &&
            gambar.size > 0;


        /* =====================================================
           UPDATE TANPA GAMBAR BARU
        ===================================================== */

        if (!hasNewFile) {

            await db.query(
                `
                UPDATE tempat_layanan
                SET
                    judul = ?,
                    deskripsi = ?,
                    alt_text = ?,
                    lokasi = ?,
                    alamat = ?
                WHERE id = ?
                `,
                [
                    judul,
                    deskripsi,
                    altText,
                    lokasi,
                    alamat,
                    id
                ]
            );


            return json({
                success: true,
                gambar: oldData.gambar
            });

        }


        /* =====================================================
           VALIDASI GAMBAR BARU
        ===================================================== */

        if (!isValidImage(gambar)) {

            return json(
                {
                    success: false,
                    error:
                        "File gambar harus JPG, JPEG, atau PNG."
                },
                400
            );

        }


        if (
            gambar.size >
            2 * 1024 * 1024
        ) {

            return json(
                {
                    success: false,
                    error:
                        "Ukuran gambar maksimal 2 MB."
                },
                400
            );

        }


        /* =====================================================
           FOLDER
        ===================================================== */

        const uploadDir =
            getUploadDir();


        await fs.promises.mkdir(
            uploadDir,
            {
                recursive: true
            }
        );


        /* =====================================================
           NAMA FILE BARU
        ===================================================== */

        const {
            fileName,
            filePath
        } =
            getUniqueFileName(
                uploadDir,
                judul
            );


        newFilePath =
            filePath;


        /* =====================================================
           SIMPAN FILE BARU
        ===================================================== */

        const buffer =
            Buffer.from(
                await gambar.arrayBuffer()
            );


        await fs.promises.writeFile(
            filePath,
            buffer
        );


        const imagePath =
            `/uploads/${fileName}`;


        /* =====================================================
           UPDATE DATABASE
        ===================================================== */

        await db.query(
            `
            UPDATE tempat_layanan
            SET
                judul = ?,
                deskripsi = ?,
                gambar = ?,
                alt_text = ?,
                lokasi = ?,
                alamat = ?
            WHERE id = ?
            `,
            [
                judul,
                deskripsi,
                imagePath,
                altText,
                lokasi,
                alamat,
                id
            ]
        );


        /* =====================================================
           HAPUS GAMBAR LAMA
        ===================================================== */

        if (
            oldData.gambar &&
            typeof oldData.gambar === "string" &&
            oldData.gambar.startsWith("/uploads/")
        ) {

            const oldFileName =
                path.basename(
                    oldData.gambar
                );


            const oldFilePath =
                path.join(
                    uploadDir,
                    oldFileName
                );


            if (
                oldFileName &&
                oldFileName !== fileName
            ) {

                try {

                    await fs.promises.unlink(
                        oldFilePath
                    );

                } catch {

                    /*
                     * File lama mungkin sudah
                     * tidak ada.
                     */

                }

            }

        }


        return json({
            success: true,
            gambar: imagePath
        });


    } catch (error) {

        console.error(
            "PUT LAYANAN ERROR:",
            error
        );


        /*
         * Kalau database gagal setelah
         * file baru berhasil dibuat,
         * hapus file baru agar tidak menjadi
         * file sampah.
         */

        if (newFilePath) {

            try {

                await fs.promises.unlink(
                    newFilePath
                );

            } catch {

                // Abaikan jika file tidak ada

            }

        }


        return json(
            {
                success: false,
                error:
                    error instanceof Error
                        ? error.message
                        : String(error)
            },
            500
        );

    }

}


/* =========================================================
   DELETE
   Opsional - hapus layanan
========================================================= */

export async function DELETE({ request }) {

    try {

        const url =
            new URL(request.url);


        const id =
            url.searchParams.get("id");


        if (!id) {

            return json(
                {
                    success: false,
                    error:
                        "ID layanan tidak ditemukan."
                },
                400
            );

        }


        const [rows] =
            await db.query(
                `
                SELECT
                    gambar
                FROM tempat_layanan
                WHERE id = ?
                LIMIT 1
                `,
                [id]
            );


        const oldData =
            rows && rows.length > 0
                ? rows[0]
                : null;


        if (!oldData) {

            return json(
                {
                    success: false,
                    error:
                        "Data layanan tidak ditemukan."
                },
                404
            );

        }


        await db.query(
            `
            DELETE FROM tempat_layanan
            WHERE id = ?
            `,
            [id]
        );


        /* =====================================================
           HAPUS FILE
        ===================================================== */

        if (
            oldData.gambar &&
            typeof oldData.gambar === "string" &&
            oldData.gambar.startsWith("/uploads/")
        ) {

            const uploadDir =
                getUploadDir();


            const fileName =
                path.basename(
                    oldData.gambar
                );


            const filePath =
                path.join(
                    uploadDir,
                    fileName
                );


            try {

                await fs.promises.unlink(
                    filePath
                );

            } catch {

                // File tidak ditemukan, abaikan

            }

        }


        return json({
            success: true
        });


    } catch (error) {

        console.error(
            "DELETE LAYANAN ERROR:",
            error
        );


        return json(
            {
                success: false,
                error:
                    error instanceof Error
                        ? error.message
                        : String(error)
            },
            500
        );

    }

}
