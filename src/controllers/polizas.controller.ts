// ══════════════════════════════════════════
//  Pólizas Controller — CRUD completo
// ══════════════════════════════════════════
import { Response, NextFunction } from "express";
import { query, queryOne } from "../config/db";
import { AppError } from "../middleware/errorHandler";
import { AuthRequest, Poliza, CreatePolizaDto, UpdatePolizaDto } from "../types";

// GET /api/polizas
export async function listarPolizas(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const {
      estado,
      tipo,
      aseguradora,
      cliente_id,
      vence_en_dias,
      page = "1",
      limit = "20",
    } = req.query as Record<string, string>;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const params: unknown[] = [];
    const where: string[] = [];

    if (estado) {
      params.push(estado);
      where.push(`p.estado = $${params.length}`);
    }
    if (tipo) {
      params.push(tipo);
      where.push(`p.tipo = $${params.length}`);
    }
    if (aseguradora) {
      params.push(`%${aseguradora}%`);
      where.push(`p.aseguradora ILIKE $${params.length}`);
    }
    if (cliente_id) {
      params.push(cliente_id);
      where.push(`p.cliente_id = $${params.length}`);
    }
    if (vence_en_dias) {
      params.push(parseInt(vence_en_dias));
      where.push(`p.fecha_vencimiento <= NOW() + ($${params.length} || ' days')::INTERVAL`);
      where.push(`p.estado = 'activo'`);
    }

    const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const sql = `
      SELECT
        p.*,
        c.nombre AS cliente_nombre,
        c.telefono AS cliente_telefono,
        COALESCE(doc_count.documentos_count, 0) AS documentos_count,
        latest_doc.ultimo_documento_id,
        latest_doc.ultimo_documento_nombre
      FROM polizas p
      JOIN clientes c ON c.id = p.cliente_id
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS documentos_count
        FROM documentos_poliza d
        WHERE d.poliza_id = p.id
      ) doc_count ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          d.id AS ultimo_documento_id,
          d.nombre AS ultimo_documento_nombre
        FROM documentos_poliza d
        WHERE d.poliza_id = p.id
        ORDER BY d.created_at DESC
        LIMIT 1
      ) latest_doc ON TRUE
      ${whereClause}
      ORDER BY p.fecha_vencimiento ASC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;
    params.push(parseInt(limit), offset);

    const countSql = `SELECT COUNT(*) FROM polizas p ${whereClause}`;
    const countParams = params.slice(0, params.length - 2);

    const [polizas, countResult] = await Promise.all([
      query<Poliza>(sql, params),
      queryOne<{ count: string }>(countSql, countParams),
    ]);

    res.json({
      ok: true,
      data: polizas,
      total: parseInt(countResult?.count ?? "0"),
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/polizas/:id
export async function obtenerPoliza(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const poliza = await queryOne<Poliza>(
      `SELECT p.*, c.nombre AS cliente_nombre, c.telefono AS cliente_telefono
       FROM polizas p JOIN clientes c ON c.id = p.cliente_id
       WHERE p.id = $1`,
      [req.params.id]
    );
    if (!poliza) throw new AppError(404, "Póliza no encontrada.");

    const pagos = await query(
      "SELECT * FROM pagos WHERE poliza_id = $1 ORDER BY fecha_vence DESC",
      [req.params.id]
    );

    res.json({ ok: true, data: { ...poliza, pagos } });
  } catch (err) {
    next(err);
  }
}

// POST /api/polizas
export async function crearPoliza(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const {
      cliente_id, numero_poliza, aseguradora, tipo,
      fecha_inicio, fecha_vencimiento, valor_prima, estado, notas,
    } = req.body as CreatePolizaDto;

    if (!cliente_id || !aseguradora || !tipo || !fecha_inicio || !fecha_vencimiento) {
      throw new AppError(400, "Faltan campos obligatorios: cliente, aseguradora, tipo, fechas.");
    }

    const poliza = await queryOne<Poliza>(
      `INSERT INTO polizas
         (cliente_id, numero_poliza, aseguradora, tipo, fecha_inicio, fecha_vencimiento, valor_prima, estado, notas)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [
        cliente_id, numero_poliza || null, aseguradora, tipo,
        fecha_inicio, fecha_vencimiento, valor_prima || null,
        estado || "activo", notas || null,
      ]
    );

    res.status(201).json({ ok: true, data: poliza, message: "Póliza registrada" });
  } catch (err) {
    next(err);
  }
}

// PUT /api/polizas/:id
export async function actualizarPoliza(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const updates = req.body as UpdatePolizaDto;
    const fields: string[] = [];
    const params: unknown[] = [];
    let i = 1;

    for (const [key, val] of Object.entries(updates)) {
      if (val !== undefined) {
        fields.push(`${key} = $${i++}`);
        params.push(val);
      }
    }

    if (fields.length === 0) throw new AppError(400, "No hay campos para actualizar.");

    params.push(req.params.id);
    const poliza = await queryOne<Poliza>(
      `UPDATE polizas SET ${fields.join(", ")} WHERE id = $${i} RETURNING *`,
      params
    );

    if (!poliza) throw new AppError(404, "Póliza no encontrada.");
    res.json({ ok: true, data: poliza, message: "Póliza actualizada" });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/polizas/:id
export async function eliminarPoliza(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = await queryOne<{ id: string }>(
      "DELETE FROM polizas WHERE id = $1 RETURNING id",
      [req.params.id]
    );
    if (!result) throw new AppError(404, "Póliza no encontrada.");
    res.json({ ok: true, message: "Póliza eliminada" });
  } catch (err) {
    next(err);
  }
}
