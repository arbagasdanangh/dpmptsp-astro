import type { APIRoute } from "astro";
import mysql from "mysql2/promise";

export const GET: APIRoute = async ({ url }) => {
  const lang = url.searchParams.get("lang") || "id";

  const db = await mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "",
    database: "ladpm"
  });

  const [rows] = await db.execute(
    "SELECT `key`, value FROM translations WHERE lang = ?",
    [lang]
  );

  const data: Record<string, string> = {};
  (rows as any[]).forEach(r => {
    data[r.key] = r.value;
  });

  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" }
  });
};
