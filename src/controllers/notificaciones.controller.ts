// ══════════════════════════════════════════
//  Notificaciones Controller — WhatsApp vía n8n
// ══════════════════════════════════════════
import { Response, NextFunction } from "express";
import { query, queryOne } from "../config/db";
import { AppError } from "../middleware/errorHandler";
import { AuthRequest, EnviarNotificacionDto } from "../types";
import { env } from "../config/env";

// Llama al webhook de n8n para enviar el mensaje
async function dispararn8n(payload: {
  to: string;
  mensaje: string;
  tipo: string;
  cliente_nombre: string;
}): Promise<void> {
  const res = await fetch(env.N8N_WEBHOOK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(env.N8N_WEBHOOK_SECRET
        ? { "x-webhook-secret": env.N8N_WEBHOOK_SECRET }
        : {}),
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(`n8n respondió con ${res.status}`);
  }
}

// POST /api/notificaciones/enviar
export async function enviarNotificaciones(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { cliente_ids, tipo, mensaje } = req.body as EnviarNotificacionDto;

    if (!cliente_ids?.length) throw new AppError(400, "Selecciona al menos un cliente.");
    if (!mensaje?.trim())     throw new AppError(400, "El mensaje no puede estar vacío.");

    // Buscar teléfonos de los clientes seleccionados
    const placeholders = cliente_ids.map((_, i) => `$${i + 1}`).join(", ");
    const clientes = await query<{ id: string; nombre: string; telefono: string }>(
      `SELECT id, nombre, telefono FROM clientes WHERE id IN (${placeholders}) AND telefono IS NOT NULL`,
      cliente_ids
    );

    if (!clientes.length) {
      throw new AppError(400, "Ningún cliente seleccionado tiene teléfono registrado.");
    }

    const resultados: Array<{ cliente_id: string; estado: string; error?: string }> = [];

    for (const cliente of clientes) {
      try {
        const mensajePersonalizado = mensaje
          .replace(/\{nombre\}/gi, cliente.nombre);

        await dispararn8n({
          to: cliente.telefono,
          mensaje: mensajePersonalizado,
          tipo,
          cliente_nombre: cliente.nombre,
        });

        // Log en BD
        await queryOne(
          `INSERT INTO notificaciones (cliente_id, tipo, mensaje, telefono, estado, enviado_en)
           VALUES ($1, $2, $3, $4, 'enviado', NOW())`,
          [cliente.id, tipo, mensajePersonalizado, cliente.telefono]
        );

        resultados.push({ cliente_id: cliente.id, estado: "enviado" });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Error desconocido";

        // Log fallo
        await queryOne(
          `INSERT INTO notificaciones (cliente_id, tipo, mensaje, telefono, estado, error_detalle)
           VALUES ($1, $2, $3, $4, 'fallido', $5)`,
          [cliente.id, tipo, mensaje, cliente.telefono, errorMsg]
        );

        resultados.push({ cliente_id: cliente.id, estado: "fallido", error: errorMsg });
      }
    }

    const enviados = resultados.filter((r) => r.estado === "enviado").length;
    const fallidos = resultados.filter((r) => r.estado === "fallido").length;

    res.json({
      ok: true,
      message: `Mensaje enviado a ${enviados} cliente(s).${fallidos ? ` ${fallidos} fallaron.` : ""}`,
      data: resultados,
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/notificaciones — historial
export async function listarNotificaciones(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { cliente_id, page = "1", limit = "30" } = req.query as Record<string, string>;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const params: unknown[] = [];
    let where = "";

    if (cliente_id) {
      params.push(cliente_id);
      where = `WHERE n.cliente_id = $1`;
    }

    const notificaciones = await query(
      `SELECT n.*, c.nombre AS cliente_nombre
       FROM notificaciones n
       JOIN clientes c ON c.id = n.cliente_id
       ${where}
       ORDER BY n.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, parseInt(limit), offset]
    );

    res.json({ ok: true, data: notificaciones });
  } catch (err) {
    next(err);
  }
}
