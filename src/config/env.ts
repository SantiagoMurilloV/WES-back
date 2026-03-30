// ══════════════════════════════════════════
//  Validación de variables de entorno
// ══════════════════════════════════════════
import "dotenv/config";

function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Variable de entorno requerida: ${key}`);
  return val;
}

export const env = {
  PORT: parseInt(process.env.PORT || "3001", 10),
  NODE_ENV: process.env.NODE_ENV || "development",
  IS_PROD: process.env.NODE_ENV === "production",

  DATABASE_URL: requireEnv("DATABASE_URL"),

  JWT_SECRET: requireEnv("JWT_SECRET"),
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "8h",
  JWT_REFRESH_SECRET: requireEnv("JWT_REFRESH_SECRET"),
  JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || "7d",

  ADMIN_EMAIL: requireEnv("ADMIN_EMAIL"),
  ADMIN_PASSWORD: requireEnv("ADMIN_PASSWORD"),

  N8N_WEBHOOK_URL: requireEnv("N8N_WEBHOOK_URL"),
  N8N_WEBHOOK_SECRET: process.env.N8N_WEBHOOK_SECRET || "",

  FRONTEND_URL: process.env.FRONTEND_URL || "http://localhost:5173",
} as const;
