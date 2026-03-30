// ══════════════════════════════════════════
//  Clientes Controller — CRUD completo
// ══════════════════════════════════════════
import { Response, NextFunction } from "express";
import { query, queryOne } from "../config/db";
import { AppError } from "../middleware/errorHandler";
import { AuthRequest, Cliente, CreateClienteDto, UpdateClienteDto } from "../types";

// GET /api/clientes
export async function listarClientes(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { search, page = "1", limit = "20" } = req.query as Record<string, string>;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let sql = `
      SELECT c.*,
        COUNT(p.id) FILTER (WHERE p.estado = 'activo')  AS polizas_activas,
        COUNT(p.id) FILTER (WHERE p.estado = 'vencido') AS polizas_vencidas
      FROM clientes c
      LEFT JOIN polizas p ON p.cliente_id = c.id
    `;
    const params: unknown[] = [];

    if (search) {
      params.push(`%${search}%`);
      sql += ` WHERE c.nombre ILIKE $${params.length} OR c.documento ILIKE $${params.length}`;
    }

    sql += ` GROUP BY c.id ORDER BY c.nombre ASC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit), offset);

    // Total para paginación
    let countSql = "SELECT COUNT(*) FROM clientes c";
    const countParams: unknown[] = [];
    if (search) {
      countParams.push(`%${search}%`);
      countSql += ` WHERE c.nombre ILIKE $1 OR c.documento ILIKE $1`;
    }

    const [clientes, countResult] = await Promise.all([
      query<Cliente>(sql, params),
      queryOne<{ count: string }>(countSql, countParams),
    ]);

    res.json({
      ok: true,
      data: clientes,
      total: parseInt(countResult?.count ?? "0"),
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/clientes/:id
export async function obtenerCliente(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;

    const cliente = await queryOne<Cliente>(
      "SELECT * FROM clientes WHERE id = $1",
      [id]
    );

    if (!cliente) throw new AppError(404, "Cliente no encontrado.");

    // Pólizas del cliente
    const polizas = await query(
      "SELECT * FROM polizas WHERE cliente_id = $1 ORDER BY fecha_vencimiento DESC",
      [id]
    );

    // Últimas notificaciones
    const notificaciones = await query(
      "SELECT * FROM notificaciones WHERE cliente_id = $1 ORDER BY created_at DESC LIMIT 10",
      [id]
    );

    res.json({ ok: true, data: { ...cliente, polizas, notificaciones } });
  } catch (err) {
    next(err);
  }
}

// POST /api/clientes
export async function crearCliente(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { nombre, documento, telefono, email, direccion, notas } =
      req.body as CreateClienteDto;

    if (!nombre?.trim()) throw new AppError(400, "El nombre es requerido.");

    const cliente = await queryOne<Cliente>(
      `INSERT INTO clientes (nombre, documento, telefono, email, direccion, notas)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [nombre.trim(), documento || null, telefono || null, email || null, direccion || null, notas || null]
    );

    res.status(201).json({ ok: true, data: cliente, message: "Cliente guardado" });
  } catch (err) {
    next(err);
  }
}

// PUT /api/clientes/:id
export async function actualizarCliente(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    const updates = req.body as UpdateClienteDto;

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

    params.push(id);
    const cliente = await queryOne<Cliente>(
      `UPDATE clientes SET ${fields.join(", ")} WHERE id = $${i} RETURNING *`,
      params
    );

    if (!cliente) throw new AppError(404, "Cliente no encontrado.");

    res.json({ ok: true, data: cliente, message: "Cambios guardados" });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/clientes/:id
export async function eliminarCliente(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;

    const result = await queryOne<{ id: string }>(
      "DELETE FROM clientes WHERE id = $1 RETURNING id",
      [id]
    );

    if (!result) throw new AppError(404, "Cliente no encontrado.");

    res.json({ ok: true, message: "Cliente eliminado" });
  } catch (err) {
    next(err);
  }
}
