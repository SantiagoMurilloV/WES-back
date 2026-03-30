// ══════════════════════════════════════════
//  Middleware de autenticación JWT
// ══════════════════════════════════════════
import { Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { AuthRequest, JwtPayload } from "../types";

export function requireAuth(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ ok: false, error: "Token no proporcionado" });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
    req.user = payload;
    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      res.status(401).json({ ok: false, error: "Sesión expirada. Ingresa de nuevo." });
    } else {
      res.status(401).json({ ok: false, error: "Token inválido" });
    }
  }
}
