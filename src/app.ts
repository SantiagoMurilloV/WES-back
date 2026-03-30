// ══════════════════════════════════════════
//  WES Backend — Entrada principal
// ══════════════════════════════════════════
import "dotenv/config";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import { env } from "./config/env";
import { db } from "./config/db";
import routes from "./routes";
import { errorHandler } from "./middleware/errorHandler";

const app = express();

// ── Seguridad ──────────────────────────────
app.use(helmet());
app.use(cors({
  origin: [env.FRONTEND_URL, "http://localhost:5173"],
  credentials: true,
}));

// ── Parsers ────────────────────────────────
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ── Rutas ──────────────────────────────────
app.use("/api", routes);

// ── Health check ───────────────────────────
app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "wes-backend", env: env.NODE_ENV });
});

// ── Error handler (debe ir al final) ───────
app.use(errorHandler);

// ── Arrancar servidor ──────────────────────
async function bootstrap(): Promise<void> {
  // Verificar conexión a BD
  try {
    await db.query("SELECT 1");
    console.log("✅ Conectado a PostgreSQL");
  } catch (err) {
    console.error("❌ No se pudo conectar a la base de datos:", err);
    process.exit(1);
  }

  app.listen(env.PORT, () => {
    console.log(`🚀 WES Backend corriendo en http://localhost:${env.PORT}`);
    console.log(`   Entorno: ${env.NODE_ENV}`);
    console.log(`   Frontend permitido: ${env.FRONTEND_URL}`);
  });
}

bootstrap();

export default app;
