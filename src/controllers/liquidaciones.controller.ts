// ══════════════════════════════════════════
//  Liquidaciones Controller
//  Lógica: upload informe aseguradora → parse → match con clientes WES
// ══════════════════════════════════════════
import path from "path";
import fs from "fs";
import { Response, NextFunction } from "express";
import * as XLSX from "xlsx";
import { query, queryOne } from "../config/db";
import { AppError } from "../middleware/errorHandler";
import { AuthRequest } from "../types";

const UPLOAD_DIR = path.join(process.cwd(), "uploads", "liquidaciones");

// ── Tipos internos ────────────────────────────────────────────
interface RawItem {
  nombre_raw: string;
  documento_raw: string;
  poliza_raw: string;
  monto: number;
  concepto: string;
}

interface ClienteMatch {
  id: string;
  nombre: string;
  documento: string | null;
  asesor_id: string | null;
}

// ── Helpers de normalización para matching ────────────────────
function normalize(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .trim();
}

function calcSimilarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return 0;
  if (na === nb) return 100;
  // Bigram similarity
  const bigrams = (s: string) => {
    const set = new Set<string>();
    for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
    return set;
  };
  const ba = bigrams(na);
  const bb = bigrams(nb);
  let intersect = 0;
  ba.forEach((g) => { if (bb.has(g)) intersect++; });
  return Math.round((2 * intersect / (ba.size + bb.size)) * 100);
}

// ── Parse Excel de liquidación ────────────────────────────────
function parseExcelLiquidacion(buffer: Buffer): RawItem[] {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });

  const items: RawItem[] = [];
  for (const row of rows) {
    const keys = Object.keys(row).map((k) => k.toLowerCase());

    const get = (aliases: string[]): string => {
      for (const alias of aliases) {
        const k = Object.keys(row).find((rk) => normalize(rk).includes(alias));
        if (k) return String(row[k] ?? "").trim();
      }
      return "";
    };

    const montoRaw = get(["valor", "monto", "comision", "pago", "prima"]);
    const monto = parseFloat(montoRaw.replace(/[^0-9.-]/g, "")) || 0;
    if (monto === 0 && keys.length < 2) continue;

    items.push({
      nombre_raw: get(["nombre", "cliente", "asegurado", "tomador"]),
      documento_raw: get(["documento", "cedula", "cc", "identificacion", "nit"]),
      poliza_raw: get(["poliza", "numero", "contrato", "poliza_no"]),
      monto,
      concepto: get(["concepto", "descripcion", "ramo", "producto"]),
    });
  }
  return items.filter((i) => i.monto > 0);
}

// ── Matching engine ───────────────────────────────────────────
async function matchItems(
  items: RawItem[]
): Promise<Array<RawItem & { estado_match: string; cliente_id: string | null; asesor_id: string | null; confianza: number }>> {
  // Traer todos los clientes para matching en memoria (eficiente para el volumen de WES)
  const clientes = await query<ClienteMatch>(
    "SELECT id, nombre, documento, asesor_id FROM clientes"
  );

  return items.map((item) => {
    // 1. Match exacto por documento
    if (item.documento_raw) {
      const byDoc = clientes.find(
        (c) => c.documento && normalize(c.documento) === normalize(item.documento_raw)
      );
      if (byDoc) {
        return { ...item, estado_match: "encontrado", cliente_id: byDoc.id, asesor_id: byDoc.asesor_id, confianza: 100 };
      }
    }

    // 2. Match fuzzy por nombre
    if (item.nombre_raw) {
      let best: ClienteMatch | null = null;
      let bestScore = 0;
      for (const c of clientes) {
        const score = calcSimilarity(item.nombre_raw, c.nombre);
        if (score > bestScore) { best = c; bestScore = score; }
      }
      if (best && bestScore >= 70) {
        const estado = bestScore === 100 ? "encontrado" : "encontrado";
        return { ...item, estado_match: estado, cliente_id: best.id, asesor_id: best.asesor_id, confianza: bestScore };
      }
      if (best && bestScore >= 50) {
        return { ...item, estado_match: "ambiguo", cliente_id: best.id, asesor_id: best.asesor_id, confianza: bestScore };
      }
    }

    return { ...item, estado_match: "no_encontrado", cliente_id: null, asesor_id: null, confianza: 0 };
  });
}

// ── POST /api/liquidaciones ───────────────────────────────────
export async function crearLiquidacion(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.file) throw new AppError(400, "Debes adjuntar un archivo Excel o PDF.");

    const { aseguradora, periodo } = req.body as { aseguradora?: string; periodo?: string };
    if (!aseguradora?.trim()) throw new AppError(400, "El campo aseguradora es requerido.");
    if (!periodo?.trim()) throw new AppError(400, "El campo periodo es requerido.");

    // Guardar archivo
    if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    const filename = `${Date.now()}_${req.file.originalname.replace(/\s+/g, "_")}`;
    const ruta = path.join(UPLOAD_DIR, filename);
    fs.writeFileSync(ruta, req.file.buffer);

    // Crear registro en BD
    const liq = await queryOne<{ id: string }>(
      `INSERT INTO liquidaciones (aseguradora, periodo, archivo_nombre, archivo_ruta, mimetype, tamano_bytes, estado)
       VALUES ($1, $2, $3, $4, $5, $6, 'procesando') RETURNING id`,
      [aseguradora, periodo, req.file.originalname, filename, req.file.mimetype, req.file.size]
    );
    if (!liq) throw new AppError(500, "Error al crear la liquidación.");

    // Parsear y hacer matching (solo Excel por ahora; PDF requeriría OCR externo)
    let items: RawItem[] = [];
    if (req.file.mimetype.includes("sheet") || req.file.originalname.match(/\.xlsx?$/i)) {
      items = parseExcelLiquidacion(req.file.buffer);
    } else {
      // PDF: crear items vacíos y marcar para revisión manual
      await queryOne(
        `UPDATE liquidaciones SET estado = 'completado', notas = 'PDF subido. Revisión manual requerida para extraer datos.' WHERE id = $1`,
        [liq.id]
      );
      res.status(201).json({
        ok: true,
        data: { id: liq.id, aseguradora, periodo, items_procesados: 0 },
        message: "PDF guardado. Los datos deben ingresarse manualmente.",
      });
      return;
    }

    const matched = await matchItems(items);

    // Insertar items
    for (const item of matched) {
      await queryOne(
        `INSERT INTO liquidacion_items
           (liquidacion_id, nombre_raw, documento_raw, poliza_raw, monto, concepto, estado_match, cliente_id, asesor_id, confianza)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [liq.id, item.nombre_raw, item.documento_raw, item.poliza_raw, item.monto,
         item.concepto, item.estado_match, item.cliente_id, item.asesor_id, item.confianza]
      );
    }

    // Calcular totales por asesor
    const totales = await queryOne<{
      total_bruto: string; total_asesor1: string; total_asesor2: string; total_sin_match: string;
    }>(
      `SELECT
         SUM(monto)                                                            AS total_bruto,
         SUM(monto) FILTER (WHERE asesor_id = (SELECT id FROM asesores ORDER BY created_at ASC  LIMIT 1)) AS total_asesor1,
         SUM(monto) FILTER (WHERE asesor_id = (SELECT id FROM asesores ORDER BY created_at DESC LIMIT 1)) AS total_asesor2,
         SUM(monto) FILTER (WHERE estado_match = 'no_encontrado')              AS total_sin_match
       FROM liquidacion_items WHERE liquidacion_id = $1`,
      [liq.id]
    );

    await queryOne(
      `UPDATE liquidaciones SET
         estado = 'completado',
         total_bruto     = $1,
         total_asesor1   = $2,
         total_asesor2   = $3,
         total_sin_match = $4
       WHERE id = $5`,
      [
        totales?.total_bruto || 0,
        totales?.total_asesor1 || 0,
        totales?.total_asesor2 || 0,
        totales?.total_sin_match || 0,
        liq.id,
      ]
    );

    const encontrados = matched.filter((i) => i.estado_match === "encontrado").length;
    const noEncontrados = matched.filter((i) => i.estado_match === "no_encontrado").length;
    const ambiguos = matched.filter((i) => i.estado_match === "ambiguo").length;

    res.status(201).json({
      ok: true,
      data: {
        id: liq.id,
        aseguradora,
        periodo,
        items_procesados: matched.length,
        encontrados,
        ambiguos,
        no_encontrados: noEncontrados,
        total_bruto: parseFloat(totales?.total_bruto ?? "0"),
        total_asesor1: parseFloat(totales?.total_asesor1 ?? "0"),
        total_asesor2: parseFloat(totales?.total_asesor2 ?? "0"),
        total_sin_match: parseFloat(totales?.total_sin_match ?? "0"),
      },
      message: `Liquidación procesada: ${encontrados} coincidencias, ${ambiguos} ambiguas, ${noEncontrados} sin match.`,
    });
  } catch (err) {
    next(err);
  }
}

// ── GET /api/liquidaciones ────────────────────────────────────
export async function listarLiquidaciones(
  _req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const rows = await query(
      "SELECT * FROM liquidaciones ORDER BY created_at DESC LIMIT 100"
    );
    res.json({ ok: true, data: rows });
  } catch (err) {
    next(err);
  }
}

// ── GET /api/liquidaciones/:id ────────────────────────────────
export async function obtenerLiquidacion(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    const liq = await queryOne("SELECT * FROM liquidaciones WHERE id = $1", [id]);
    if (!liq) throw new AppError(404, "Liquidación no encontrada.");

    const items = await query(
      `SELECT li.*,
              c.nombre  AS cliente_nombre,
              c.documento AS cliente_documento,
              a.nombre  AS asesor_nombre
       FROM liquidacion_items li
       LEFT JOIN clientes  c ON c.id = li.cliente_id
       LEFT JOIN asesores  a ON a.id = li.asesor_id
       WHERE li.liquidacion_id = $1
       ORDER BY li.monto DESC`,
      [id]
    );

    // Resumen por asesor
    const resumen = await query(
      `SELECT a.nombre AS asesor_nombre, a.id AS asesor_id,
              COUNT(li.id) AS total_items,
              SUM(li.monto) AS total_monto
       FROM liquidacion_items li
       JOIN asesores a ON a.id = li.asesor_id
       WHERE li.liquidacion_id = $1
       GROUP BY a.id, a.nombre
       ORDER BY a.nombre`,
      [id]
    );

    res.json({ ok: true, data: { ...liq, items, resumen_asesores: resumen } });
  } catch (err) {
    next(err);
  }
}

// ── GET /api/liquidaciones/:id/archivo ───────────────────────
export async function descargarArchivoLiquidacion(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    const liq = await queryOne<{ archivo_ruta: string; mimetype: string; archivo_nombre: string }>(
      "SELECT archivo_ruta, mimetype, archivo_nombre FROM liquidaciones WHERE id = $1",
      [id]
    );
    if (!liq) throw new AppError(404, "Liquidación no encontrada.");

    const ruta = path.join(UPLOAD_DIR, liq.archivo_ruta);
    if (!fs.existsSync(ruta)) throw new AppError(404, "Archivo no encontrado en disco.");

    res.setHeader("Content-Type", liq.mimetype);
    res.setHeader("Content-Disposition", `attachment; filename="${liq.archivo_nombre}"`);
    fs.createReadStream(ruta).pipe(res);
  } catch (err) {
    next(err);
  }
}

// ── PATCH /api/liquidaciones/items/:itemId ────────────────────
// Corrección manual de un item (cuando el match fue ambiguo o no encontrado)
export async function corregirItem(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { itemId } = req.params;
    const { cliente_id } = req.body as { cliente_id: string };
    if (!cliente_id) throw new AppError(400, "cliente_id es requerido.");

    const cliente = await queryOne<{ id: string; asesor_id: string | null }>(
      "SELECT id, asesor_id FROM clientes WHERE id = $1",
      [cliente_id]
    );
    if (!cliente) throw new AppError(404, "Cliente no encontrado.");

    const item = await queryOne(
      `UPDATE liquidacion_items
       SET cliente_id = $1, asesor_id = $2, estado_match = 'encontrado', confianza = 100
       WHERE id = $3 RETURNING *`,
      [cliente_id, cliente.asesor_id, itemId]
    );
    if (!item) throw new AppError(404, "Item no encontrado.");

    // Recalcular totales de la liquidación
    const liqId = (item as Record<string, unknown>).liquidacion_id as string;
    const totales = await queryOne<{
      total_bruto: string; total_asesor1: string; total_asesor2: string; total_sin_match: string;
    }>(
      `SELECT
         SUM(monto)                                                            AS total_bruto,
         SUM(monto) FILTER (WHERE asesor_id = (SELECT id FROM asesores ORDER BY created_at ASC  LIMIT 1)) AS total_asesor1,
         SUM(monto) FILTER (WHERE asesor_id = (SELECT id FROM asesores ORDER BY created_at DESC LIMIT 1)) AS total_asesor2,
         SUM(monto) FILTER (WHERE estado_match = 'no_encontrado')              AS total_sin_match
       FROM liquidacion_items WHERE liquidacion_id = $1`,
      [liqId]
    );

    await queryOne(
      `UPDATE liquidaciones SET total_bruto=$1, total_asesor1=$2, total_asesor2=$3, total_sin_match=$4 WHERE id=$5`,
      [totales?.total_bruto || 0, totales?.total_asesor1 || 0, totales?.total_asesor2 || 0, totales?.total_sin_match || 0, liqId]
    );

    res.json({ ok: true, data: item, message: "Item corregido" });
  } catch (err) {
    next(err);
  }
}
