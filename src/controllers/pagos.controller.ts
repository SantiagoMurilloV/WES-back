// ══════════════════════════════════════════
//  Pagos Controller
// ══════════════════════════════════════════
import { Response, NextFunction } from "express";
import { query, queryOne } from "../config/db";
import { AppError } from "../middleware/errorHandler";
import { AuthRequest, Pago, CreatePagoDto, UpdatePagoDto } from "../types";

// GET /api/pagos?poliza_id=&estado=
export async function listarPagos(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { poliza_id, estado } = req.query as Record<string, string>;
    const params: unknown[] = [];
    const where: string[] = [];

    if (poliza_id) { params.push(poliza_id); where.push(`poliza_id = $${params.length}`); }
    if (estado)    { params.push(estado);    where.push(`estado = $${params.length}`); }

    const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const pagos = await query<Pago>(
      `SELECT * FROM pagos ${whereClause} ORDER BY fecha_vence DESC`,
      params
    );

    res.json({ ok: true, data: pagos });
  } catch (err) {
    next(err);
  }
}

// POST /api/pagos
export async function crearPago(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { poliza_id, monto, fecha_pago, fecha_vence, estado, notas } =
      req.body as CreatePagoDto;

    if (!poliza_id || !monto) {
      throw new AppError(400, "poliza_id y monto son requeridos.");
    }

    const pago = await queryOne<Pago>(
      `INSERT INTO pagos (poliza_id, monto, fecha_pago, fecha_vence, estado, notas)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [poliza_id, monto, fecha_pago || null, fecha_vence || null, estado || "pendiente", notas || null]
    );

    res.status(201).json({ ok: true, data: pago });
  } catch (err) {
    next(err);
  }
}

// PUT /api/pagos/:id
export async function actualizarPago(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const updates = req.body as UpdatePagoDto;
    const fields: string[] = [];
    const params: unknown[] = [];
    let i = 1;

    for (const [key, val] of Object.entries(updates)) {
      if (val !== undefined) { fields.push(`${key} = $${i++}`); params.push(val); }
    }

    if (fields.length === 0) throw new AppError(400, "No hay campos para actualizar.");

    params.push(req.params.id);
    const pago = await queryOne<Pago>(
      `UPDATE pagos SET ${fields.join(", ")} WHERE id = $${i} RETURNING *`,
      params
    );

    if (!pago) throw new AppError(404, "Pago no encontrado.");
    res.json({ ok: true, data: pago });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/pagos/:id
export async function eliminarPago(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = await queryOne<{ id: string }>(
      "DELETE FROM pagos WHERE id = $1 RETURNING id",
      [req.params.id]
    );
    if (!result) throw new AppError(404, "Pago no encontrado.");
    res.json({ ok: true, message: "Pago eliminado" });
  } catch (err) {
    next(err);
  }
}
