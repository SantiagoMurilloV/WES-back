// ══════════════════════════════════════════
//  Auth Controller — Login + Refresh token
// ══════════════════════════════════════════
import { Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { AppError } from "../middleware/errorHandler";
import { JwtPayload } from "../types";

// En Fase 1 hay un único usuario (el agente WES).
// Las credenciales viven en .env. En Fase 2 se puede migrar a tabla usuarios.
const ADMIN_USER = {
  id: "wes-admin",
  email: env.ADMIN_EMAIL,
  // Hash generado al iniciar el servidor para no guardar plaintext en memoria
  passwordHash: bcrypt.hashSync(env.ADMIN_PASSWORD, 10),
};

function signAccess(payload: Omit<JwtPayload, "iat" | "exp">): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as string,
  });
}

function signRefresh(payload: Omit<JwtPayload, "iat" | "exp">): string {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN as string,
  });
}

// POST /api/auth/login
export async function login(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { email, password } = req.body as { email?: string; password?: string };

    if (!email || !password) {
      throw new AppError(400, "Correo y contraseña son requeridos.");
    }

    if (email.toLowerCase() !== ADMIN_USER.email.toLowerCase()) {
      throw new AppError(401, "Usuario o contraseña incorrectos.");
    }

    const valid = await bcrypt.compare(password, ADMIN_USER.passwordHash);
    if (!valid) {
      throw new AppError(401, "Usuario o contraseña incorrectos.");
    }

    const tokenPayload = { sub: ADMIN_USER.id, email: ADMIN_USER.email };
    const accessToken = signAccess(tokenPayload);
    const refreshToken = signRefresh(tokenPayload);

    // Refresh token en httpOnly cookie
    res.cookie("refresh_token", refreshToken, {
      httpOnly: true,
      secure: env.IS_PROD,
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 días
    });

    res.json({
      ok: true,
      data: {
        accessToken,
        user: { id: ADMIN_USER.id, email: ADMIN_USER.email },
      },
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/auth/refresh
export async function refresh(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const refreshToken = req.cookies?.refresh_token as string | undefined;

    if (!refreshToken) {
      throw new AppError(401, "Sesión expirada. Ingresa de nuevo.");
    }

    let payload: JwtPayload;
    try {
      payload = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET) as JwtPayload;
    } catch {
      throw new AppError(401, "Sesión expirada. Ingresa de nuevo.");
    }

    const accessToken = signAccess({ sub: payload.sub, email: payload.email });

    res.json({ ok: true, data: { accessToken } });
  } catch (err) {
    next(err);
  }
}

// POST /api/auth/logout
export function logout(_req: Request, res: Response): void {
  res.clearCookie("refresh_token");
  res.json({ ok: true, message: "Sesión cerrada" });
}
