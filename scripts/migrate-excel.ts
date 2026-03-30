// ══════════════════════════════════════════
//  Script de migración: Excel → PostgreSQL
//  Uso: npm run migrate -- --file=ruta/al/archivo.xlsx
//       o: tsx scripts/migrate-excel.ts --file=clientes.xlsx
// ══════════════════════════════════════════
import "dotenv/config";
import path from "path";
import * as XLSX from "xlsx";
import { Pool } from "pg";

// ── Config ──────────────────────────────────
const DATABASE_URL = process.env.DATABASE_URL!;
if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL no está definida en .env");
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});

// ── Obtener path del archivo ─────────────────
const args = process.argv.slice(2);
const fileArg = args.find((a) => a.startsWith("--file="));
const filePath = fileArg ? fileArg.split("=")[1] : null;

if (!filePath) {
  console.error("❌ Debes indicar el archivo: --file=ruta/al/archivo.xlsx");
  process.exit(1);
}

const absolutePath = path.resolve(filePath);

// ── Normalizar texto ──────────────────────────
function normalize(val: unknown): string | null {
  if (val === null || val === undefined || val === "") return null;
  return String(val).trim();
}

function normalizeNombre(val: unknown): string {
  const str = normalize(val);
  if (!str) return "";
  // MARIA GARCIA → María García
  return str
    .toLowerCase()
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function normalizeTelefono(val: unknown): string | null {
  const str = normalize(val);
  if (!str) return null;
  const digits = str.replace(/\D/g, "");
  if (digits.length === 10) return `+57 ${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
  if (digits.length === 12 && digits.startsWith("57")) {
    return `+${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}`;
  }
  return str; // devolver como está si no reconocemos el formato
}

// ── Resultado de migración ────────────────────
interface MigResult {
  exitosos: number;
  errores: Array<{ fila: number; nombre: string; error: string }>;
}

// ── Migración principal ───────────────────────
async function migrar(): Promise<void> {
  console.log(`\n📂 Leyendo archivo: ${absolutePath}\n`);

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.readFile(absolutePath);
  } catch {
    console.error("❌ No se pudo leer el archivo Excel. ¿Es un .xlsx o .xls válido?");
    process.exit(1);
  }

  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

  if (!rows.length) {
    console.error("❌ El archivo está vacío o no tiene datos en la primera hoja.");
    process.exit(1);
  }

  console.log(`📊 Hoja: "${sheetName}" — ${rows.length} filas encontradas`);
  console.log(`📋 Columnas detectadas: ${Object.keys(rows[0]).join(", ")}\n`);

  // Mapeo flexible de columnas (acepta variaciones de nombres)
  function col(row: Record<string, unknown>, ...keys: string[]): string | null {
    for (const k of keys) {
      const found = Object.keys(row).find(
        (rk) => rk.toLowerCase().replace(/[\s_]/g, "") === k.toLowerCase().replace(/[\s_]/g, "")
      );
      if (found && row[found] !== "" && row[found] !== undefined) {
        return normalize(row[found]);
      }
    }
    return null;
  }

  const result: MigResult = { exitosos: 0, errores: [] };
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const filaNro = i + 2; // +2 porque fila 1 es encabezado

      const nombre = normalizeNombre(col(row, "nombre", "nombrecliente", "cliente", "name"));
      if (!nombre) {
        result.errores.push({ fila: filaNro, nombre: "(sin nombre)", error: "Nombre vacío — fila omitida" });
        continue;
      }

      const documento    = col(row, "documento", "cedula", "nit", "id", "identificacion");
      const telefono     = normalizeTelefono(col(row, "telefono", "celular", "phone", "tel", "movil"));
      const email        = col(row, "email", "correo", "mail");
      const direccion    = col(row, "direccion", "direccion", "address");
      const aseguradora  = col(row, "aseguradora", "compania", "empresa", "insurrer");
      const tipoRaw      = col(row, "tipo", "tiposeguro", "poliza", "seguro", "product");
      const fechaVence   = col(row, "fechavencimiento", "vencimiento", "fechaexpiracion", "expira");
      const valorRaw     = col(row, "valorprima", "prima", "valor", "monto", "cuota");

      // Mapear tipo
      const tipoMap: Record<string, string> = {
        auto: "auto", carro: "auto", vehiculo: "auto", automovil: "auto",
        hogar: "hogar", casa: "hogar",
        vida: "vida",
        soat: "soat",
        salud: "salud", medico: "salud",
      };
      const tipo = tipoMap[tipoRaw?.toLowerCase() ?? ""] ?? "otro";

      try {
        // Insertar cliente (ignorar si ya existe por documento)
        const clienteRes = await client.query(
          `INSERT INTO clientes (nombre, documento, telefono, email, direccion)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (documento) DO UPDATE
             SET nombre = EXCLUDED.nombre,
                 telefono = COALESCE(EXCLUDED.telefono, clientes.telefono),
                 email    = COALESCE(EXCLUDED.email,    clientes.email)
           RETURNING id`,
          [nombre, documento, telefono, email, direccion]
        );
        const clienteId = clienteRes.rows[0].id as string;

        // Insertar póliza si hay datos de aseguradora
        if (aseguradora && tipo) {
          const valor = valorRaw ? parseFloat(valorRaw.replace(/[^0-9.]/g, "")) : null;
          const fechaVencDate = fechaVence ? new Date(fechaVence) : null;
          const fechaInicioDate = new Date();

          if (fechaVencDate && !isNaN(fechaVencDate.getTime())) {
            const estadoPoliza = fechaVencDate < new Date() ? "vencido" : "activo";

            await client.query(
              `INSERT INTO polizas (cliente_id, aseguradora, tipo, fecha_inicio, fecha_vencimiento, valor_prima, estado)
               VALUES ($1, $2, $3, $4, $5, $6, $7)`,
              [clienteId, aseguradora, tipo, fechaInicioDate, fechaVencDate, valor, estadoPoliza]
            );
          }
        }

        result.exitosos++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        result.errores.push({ fila: filaNro, nombre, error: msg });
      }
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Error crítico — se revirtió todo:", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }

  // ── Reporte final ──────────────────────────
  console.log("\n══════════════════════════════════════");
  console.log(`✅ Importación completada`);
  console.log(`   Exitosos : ${result.exitosos}`);
  console.log(`   Errores  : ${result.errores.length}`);
  console.log("══════════════════════════════════════");

  if (result.errores.length) {
    console.log("\n⚠️  Filas con error:");
    result.errores.forEach(({ fila, nombre, error }) => {
      console.log(`   Fila ${fila} — ${nombre}: ${error}`);
    });
  }

  console.log("\n🎉 Listo. Puedes verificar los datos en Supabase.\n");
}

migrar().catch((err) => {
  console.error("Error inesperado:", err);
  process.exit(1);
});
