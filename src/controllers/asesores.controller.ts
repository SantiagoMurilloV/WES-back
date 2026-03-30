// ══════════════════════════════════════════
//  Asesores Controller
// ══════════════════════════════════════════
import { Response, NextFunction } from "express";
import { query, queryOne } from "../config/db";
import { AppError } from "../middleware/errorHandler";
import { AuthRequest } from "../types";

// GET /api/asesores
export async function listarAsesores(
  _req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const asesores = await query(
      "SELECT * FROM asesores WHERE activo = TRUE ORDER BY nombre ASC"
    );
    res.json({ ok: true, data: asesores });
  } catch (err) {
    next(err);
  }
}

// PUT /api/asesores/:id — actualizar nombre/telefono
export async function actualizarAsesor(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    const { nombre, telefono } = req.body as { nombre?: string; telefono?: string };

    const asesor = await queryOne(
      `UPDATE asesores SET nombre = COALESCE($1, nombre), telefono = COALESCE($2, telefono)
       WHERE id = $3 RETURNING *`,
      [nombre || null, telefono || null, id]
    );

    if (!asesor) throw new AppError(404, "Asesor no encontrado.");
    res.json({ ok: true, data: asesor });
  } catch (err) {
    next(err);
  }
}
