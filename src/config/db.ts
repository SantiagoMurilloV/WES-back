// ══════════════════════════════════════════
//  Pool de conexión a PostgreSQL (Supabase)
// ══════════════════════════════════════════
import { Pool } from "pg";
import { env } from "./env";

export const db = new Pool({
  connectionString: env.DATABASE_URL,
  ssl: env.IS_PROD ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

db.on("error", (err) => {
  console.error("❌ Error inesperado en el pool de PostgreSQL:", err);
});

// Helper: ejecutar query con manejo de errores consistente
export async function query<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[]
): Promise<T[]> {
  const { rows } = await db.query(sql, params);
  return rows as T[];
}

// Helper: obtener un solo registro
export async function queryOne<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[]
): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}
