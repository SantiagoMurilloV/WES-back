// ══════════════════════════════════════════
//  Dashboard — KPIs en una sola query
// ══════════════════════════════════════════
import { Router, Response, NextFunction } from "express";
import { requireAuth } from "../middleware/auth";
import { queryOne, query } from "../config/db";
import { AuthRequest } from "../types";

const router = Router();
router.use(requireAuth);

router.get("/kpis", async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const [kpis, proximas, pendientes] = await Promise.all([
      // Totales generales
      queryOne<{
        total_clientes: string;
        polizas_activas: string;
        proximas_vencer: string;
        pagos_pendientes: string;
        cotizaciones_hoy: string;
      }>(`
        SELECT
          (SELECT COUNT(*) FROM clientes)                                         AS total_clientes,
          (SELECT COUNT(*) FROM polizas WHERE estado = 'activo')                  AS polizas_activas,
          (SELECT COUNT(*) FROM polizas WHERE estado = 'activo'
            AND fecha_vencimiento <= NOW() + INTERVAL '30 days')                  AS proximas_vencer,
          (SELECT COUNT(*) FROM pagos WHERE estado = 'pendiente')                 AS pagos_pendientes,
          0                                                                        AS cotizaciones_hoy
      `),
      // Pólizas próximas a vencer (próximos 30 días)
      query(`
        SELECT p.id, p.aseguradora, p.tipo, p.fecha_vencimiento,
               c.nombre AS cliente_nombre, c.telefono AS cliente_telefono
        FROM polizas p
        JOIN clientes c ON c.id = p.cliente_id
        WHERE p.estado = 'activo'
          AND p.fecha_vencimiento BETWEEN NOW() AND NOW() + INTERVAL '30 days'
        ORDER BY p.fecha_vencimiento ASC
        LIMIT 10
      `),
      // Pagos pendientes recientes
      query(`
        SELECT pa.id, pa.monto, pa.fecha_vence,
               c.nombre AS cliente_nombre, pol.tipo AS tipo_poliza, pol.aseguradora
        FROM pagos pa
        JOIN polizas pol ON pol.id = pa.poliza_id
        JOIN clientes c ON c.id = pol.cliente_id
        WHERE pa.estado = 'pendiente'
        ORDER BY pa.fecha_vence ASC NULLS LAST
        LIMIT 10
      `),
    ]);

    res.json({
      ok: true,
      data: {
        kpis: {
          total_clientes:  parseInt(kpis?.total_clientes  ?? "0"),
          polizas_activas: parseInt(kpis?.polizas_activas ?? "0"),
          proximas_vencer: parseInt(kpis?.proximas_vencer ?? "0"),
          pagos_pendientes:parseInt(kpis?.pagos_pendientes ?? "0"),
          cotizaciones_hoy:parseInt(kpis?.cotizaciones_hoy ?? "0"),
        },
        proximas_vencer: proximas,
        pagos_pendientes: pendientes,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
