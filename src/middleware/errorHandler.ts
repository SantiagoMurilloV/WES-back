// ══════════════════════════════════════════
//  Middleware global de manejo de errores
// ══════════════════════════════════════════
import { Request, Response, NextFunction } from "express";
import { env } from "../config/env";

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ ok: false, error: err.message });
    return;
  }

  // Error de PostgreSQL: violación de unicidad
  if ((err as { code?: string }).code === "23505") {
    res.status(409).json({ ok: false, error: "Ya existe un registro con esos datos." });
    return;
  }

  // Error de FK inexistente
  if ((err as { code?: string }).code === "23503") {
    res.status(400).json({ ok: false, error: "El registro referenciado no existe." });
    return;
  }

  console.error("Error no manejado:", err);

  res.status(500).json({
    ok: false,
    error: "Error interno del servidor. Intenta de nuevo en unos segundos.",
    ...(env.IS_PROD ? {} : { stack: err.stack }),
  });
}
