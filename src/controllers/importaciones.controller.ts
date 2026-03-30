// ══════════════════════════════════════════
//  Importaciones Controller — Excel → Clientes / Pólizas
// ══════════════════════════════════════════
import { Response, NextFunction } from "express";
import * as XLSX from "xlsx";
import { db, query, queryOne } from "../config/db";
import { AppError } from "../middleware/errorHandler";
import { AuthRequest } from "../types";

type TipoSeguro = "auto" | "hogar" | "vida" | "soat" | "salud" | "otro";
type EstadoPoliza = "activo" | "pendiente" | "vencido";

interface RowImport {
  nombre?: string;
  documento?: string;
  telefono?: string;
  email?: string;
  direccion?: string;
  notas?: string;
  asesor?: string;
  asesor_id?: string;
  numero_poliza?: string;
  aseguradora?: string;
  tipo_seguro?: string;
  fecha_inicio?: string;
  fecha_vencimiento?: string;
  valor_prima?: string;
}

// Valida si un string es UUID v4
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizeHeader(header: string): string {
  return header
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeComparable(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function asTrimmedString(value: unknown): string {
  return String(value ?? "").trim();
}

function asNullableString(value: unknown): string | null {
  const normalized = asTrimmedString(value);
  return normalized ? normalized : null;
}

function normalizeNombre(value: string | undefined): string {
  return asTrimmedString(value);
}

function normalizeTelefono(value: string | undefined): string | null {
  const raw = asNullableString(value);
  if (!raw) return null;

  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) {
    return `+57 ${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
  }
  if (digits.length === 12 && digits.startsWith("57")) {
    return `+${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}`;
  }

  return raw;
}

function normalizeEmail(value: string | undefined): string | null {
  const raw = asNullableString(value);
  return raw ? raw.toLowerCase() : null;
}

function parseExcelDate(value: string | undefined): string | null {
  const raw = asNullableString(value);
  if (!raw) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const asNumber = Number(raw);
  if (Number.isFinite(asNumber) && raw === String(asNumber)) {
    const parsed = XLSX.SSF.parse_date_code(asNumber);
    if (parsed) {
      const month = String(parsed.m).padStart(2, "0");
      const day = String(parsed.d).padStart(2, "0");
      return `${parsed.y}-${month}-${day}`;
    }
  }

  const parsedDate = new Date(raw);
  if (Number.isNaN(parsedDate.getTime())) return null;
  return parsedDate.toISOString().slice(0, 10);
}

function parseMoney(value: string | undefined): number | null {
  const raw = asNullableString(value);
  if (!raw) return null;

  const cleaned = raw
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(/,/g, ".")
    .replace(/[^0-9.-]/g, "");

  const amount = Number(cleaned);
  return Number.isFinite(amount) ? amount : null;
}

function mapTipoSeguro(value: string | undefined): TipoSeguro {
  const raw = normalizeComparable(value ?? "");
  const typeMap: Record<string, TipoSeguro> = {
    auto: "auto",
    carro: "auto",
    vehiculo: "auto",
    automovil: "auto",
    hogar: "hogar",
    casa: "hogar",
    vida: "vida",
    soat: "soat",
    salud: "salud",
    medico: "salud",
    medicina: "salud",
  };

  return typeMap[raw] ?? "otro";
}

function computeEstadoPoliza(fechaVencimiento: string): EstadoPoliza {
  const now = new Date();
  const vence = new Date(`${fechaVencimiento}T00:00:00`);
  const diffDays = (vence.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);

  if (diffDays < 0) return "vencido";
  if (diffDays < 30) return "pendiente";
  return "activo";
}

function hasPolicyData(row: RowImport): boolean {
  return Boolean(
    row.numero_poliza ||
      row.aseguradora ||
      row.tipo_seguro ||
      row.fecha_inicio ||
      row.fecha_vencimiento ||
      row.valor_prima
  );
}

async function tableExists(tableName: string): Promise<boolean> {
  const result = await queryOne<{ exists: boolean }>(
    "SELECT to_regclass($1) IS NOT NULL AS exists",
    [`public.${tableName}`]
  );
  return Boolean(result?.exists);
}

async function columnExists(tableName: string, columnName: string): Promise<boolean> {
  const result = await queryOne<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = $1
         AND column_name = $2
     ) AS exists`,
    [tableName, columnName]
  );
  return Boolean(result?.exists);
}

const COLUMN_MAP: Record<string, keyof RowImport> = {
  nombre: "nombre",
  nombre_completo: "nombre",
  cliente: "nombre",
  asegurado: "nombre",
  documento: "documento",
  cedula: "documento",
  identificacion: "documento",
  numero_documento: "documento",
  cc: "documento",
  nit: "documento",
  telefono: "telefono",
  telefono_celular: "telefono",
  telefono_movil: "telefono",
  celular: "telefono",
  movil: "telefono",
  tel: "telefono",
  email: "email",
  correo: "email",
  correo_electronico: "email",
  direccion: "direccion",
  address: "direccion",
  notas: "notas",
  observaciones: "notas",
  asesor: "asesor",
  nombre_asesor: "asesor",
  asesor_id: "asesor_id",
  numero_poliza: "numero_poliza",
  poliza: "numero_poliza",
  nro_poliza: "numero_poliza",
  tipo_seguro: "tipo_seguro",
  tipo_poliza: "tipo_seguro",
  tipo: "tipo_seguro",
  aseguradora: "aseguradora",
  compania: "aseguradora",
  fecha_inicio: "fecha_inicio",
  inicio: "fecha_inicio",
  fecha_vencimiento: "fecha_vencimiento",
  vencimiento: "fecha_vencimiento",
  fecha_fin: "fecha_vencimiento",
  valor_prima: "valor_prima",
  prima: "valor_prima",
  valor: "valor_prima",
  monto: "valor_prima",
};

// POST /api/importaciones/clientes
export async function importarClientes(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.file) throw new AppError(400, "Debes adjuntar un archivo Excel.");

    const workbook = XLSX.read(req.file.buffer, { type: "buffer", cellDates: false });
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: "" });

    if (rawRows.length === 0) {
      throw new AppError(400, "El archivo no tiene filas de datos.");
    }

    const firstRow = rawRows[0];
    const headerMap: Record<string, keyof RowImport> = {};
    for (const rawKey of Object.keys(firstRow)) {
      const normalized = normalizeHeader(rawKey);
      const field = COLUMN_MAP[normalized];
      if (field) headerMap[rawKey] = field;
    }

    if (!Object.values(headerMap).includes("nombre")) {
      throw new AppError(
        400,
        'El Excel debe tener una columna "Nombre", "Cliente" o "Asegurado". Columnas encontradas: ' +
          Object.keys(firstRow).join(", ")
      );
    }

    const [hasAsesorIdColumn, hasPolizasTable, hasImportacionesTable] = await Promise.all([
      columnExists("clientes", "asesor_id").catch(() => false),
      tableExists("polizas").catch(() => false),
      tableExists("importaciones").catch(() => false),
    ]);

    let asesores: Array<{ id: string; nombre: string }> = [];
    try {
      asesores = await query<{ id: string; nombre: string }>(
        "SELECT id, nombre FROM asesores WHERE activo = TRUE"
      );
    } catch {
      asesores = [];
    }

    const asesorByName = new Map(
      asesores.map((asesor) => [normalizeComparable(asesor.nombre), asesor.id])
    );

    const defaultAsesorIdRaw = asNullableString(req.body?.asesor_id);
    const defaultAsesorId = defaultAsesorIdRaw && UUID_RE.test(defaultAsesorIdRaw)
      ? defaultAsesorIdRaw
      : null;

    const resolveAsesorId = (row: RowImport): string | null => {
      const explicitId = asNullableString(row.asesor_id);
      if (explicitId && UUID_RE.test(explicitId)) return explicitId;

      const asesorName = asNullableString(row.asesor);
      if (asesorName) {
        const matched = asesorByName.get(normalizeComparable(asesorName));
        if (matched) return matched;
      }

      return defaultAsesorId;
    };

    let filas_ok = 0;
    let filas_error = 0;
    const detalle_errores: { fila: number; error: string }[] = [];

    const clientInsertSql = hasAsesorIdColumn
      ? `INSERT INTO clientes (nombre, documento, telefono, email, direccion, notas, asesor_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (documento) DO UPDATE SET
           nombre    = EXCLUDED.nombre,
           telefono  = COALESCE(EXCLUDED.telefono,  clientes.telefono),
           email     = COALESCE(EXCLUDED.email,     clientes.email),
           direccion = COALESCE(EXCLUDED.direccion, clientes.direccion),
           notas     = COALESCE(EXCLUDED.notas,     clientes.notas),
           asesor_id = COALESCE(EXCLUDED.asesor_id, clientes.asesor_id)
         RETURNING id`
      : `INSERT INTO clientes (nombre, documento, telefono, email, direccion, notas)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (documento) DO UPDATE SET
           nombre    = EXCLUDED.nombre,
           telefono  = COALESCE(EXCLUDED.telefono,  clientes.telefono),
           email     = COALESCE(EXCLUDED.email,     clientes.email),
           direccion = COALESCE(EXCLUDED.direccion, clientes.direccion),
           notas     = COALESCE(EXCLUDED.notas,     clientes.notas)
         RETURNING id`;

    for (let i = 0; i < rawRows.length; i++) {
      const raw = rawRows[i];
      const row: RowImport = {};

      for (const [rawKey, field] of Object.entries(headerMap)) {
        const value = asTrimmedString(raw[rawKey]);
        if (value) row[field] = value;
      }

      row.nombre = normalizeNombre(row.nombre);
      row.telefono = normalizeTelefono(row.telefono) ?? undefined;
      row.email = normalizeEmail(row.email) ?? undefined;

      if (!row.nombre) {
        detalle_errores.push({ fila: i + 2, error: "Nombre vacío" });
        filas_error++;
        continue;
      }

      const asesorId = hasAsesorIdColumn ? resolveAsesorId(row) : null;
      const fechaInicio = parseExcelDate(row.fecha_inicio) ?? new Date().toISOString().slice(0, 10);
      const fechaVencimiento = parseExcelDate(row.fecha_vencimiento);
      const valorPrima = parseMoney(row.valor_prima);
      const tipoSeguro = mapTipoSeguro(row.tipo_seguro);
      const numeroPoliza = asNullableString(row.numero_poliza);
      const aseguradora = asNullableString(row.aseguradora);

      try {
        const clienteParams = hasAsesorIdColumn
          ? [
              row.nombre,
              asNullableString(row.documento),
              row.telefono ?? null,
              row.email ?? null,
              asNullableString(row.direccion),
              asNullableString(row.notas),
              asesorId,
            ]
          : [
              row.nombre,
              asNullableString(row.documento),
              row.telefono ?? null,
              row.email ?? null,
              asNullableString(row.direccion),
              asNullableString(row.notas),
            ];

        const cliente = await queryOne<{ id: string }>(clientInsertSql, clienteParams);
        const clienteId = cliente?.id;

        if (!clienteId) {
          throw new Error("No se pudo obtener el cliente importado.");
        }

        if (
          hasPolizasTable &&
          hasPolicyData(row) &&
          aseguradora &&
          fechaVencimiento
        ) {
          try {
            const estado = computeEstadoPoliza(fechaVencimiento);
            const existingPolicy = numeroPoliza
              ? await queryOne<{ id: string }>(
                  "SELECT id FROM polizas WHERE numero_poliza = $1 LIMIT 1",
                  [numeroPoliza]
                )
              : await queryOne<{ id: string }>(
                  `SELECT id
                   FROM polizas
                   WHERE cliente_id = $1
                     AND aseguradora = $2
                     AND tipo = $3
                     AND fecha_vencimiento = $4
                   LIMIT 1`,
                  [clienteId, aseguradora, tipoSeguro, fechaVencimiento]
                );

            if (existingPolicy?.id) {
              await query(
                `UPDATE polizas
                 SET cliente_id = $2,
                     numero_poliza = $3,
                     aseguradora = $4,
                     tipo = $5,
                     fecha_inicio = $6,
                     fecha_vencimiento = $7,
                     valor_prima = COALESCE($8, valor_prima),
                     estado = $9
                 WHERE id = $1`,
                [
                  existingPolicy.id,
                  clienteId,
                  numeroPoliza,
                  aseguradora,
                  tipoSeguro,
                  fechaInicio,
                  fechaVencimiento,
                  valorPrima,
                  estado,
                ]
              );
            } else {
              await query(
                `INSERT INTO polizas
                   (cliente_id, numero_poliza, aseguradora, tipo, fecha_inicio, fecha_vencimiento, valor_prima, estado)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [
                  clienteId,
                  numeroPoliza,
                  aseguradora,
                  tipoSeguro,
                  fechaInicio,
                  fechaVencimiento,
                  valorPrima,
                  estado,
                ]
              );
            }
          } catch {
            // Para pruebas, la póliza no debe bloquear la creación del cliente.
          }
        }

        filas_ok++;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Error desconocido";
        detalle_errores.push({ fila: i + 2, error: message });
        filas_error++;
      }
    }

    if (hasImportacionesTable) {
      await queryOne(
        `INSERT INTO importaciones (tipo, archivo_nombre, total_filas, filas_ok, filas_error, detalle_errores)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [
          "clientes",
          req.file.originalname,
          rawRows.length,
          filas_ok,
          filas_error,
          JSON.stringify(detalle_errores),
        ]
      );
    }

    res.json({
      ok: true,
      data: { total: rawRows.length, filas_ok, filas_error, detalle_errores },
      message: `Importación completada: ${filas_ok} clientes procesados, ${filas_error} errores.`,
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/importaciones — historial
export async function listarImportaciones(
  _req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const rows = await query(
      "SELECT * FROM importaciones ORDER BY created_at DESC LIMIT 50"
    );
    res.json({ ok: true, data: rows });
  } catch (err) {
    next(err);
  }
}
