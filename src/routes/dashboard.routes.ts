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

// ── GET /dashboard/reportes ───────────────────────────────────────────────
// Datos reales para la página de Reportes
router.get("/reportes", async (_req, res: Response, next: NextFunction) => {
  try {
    const [porAseguradora, porEstado, proximosMeses, comisionesPorAsesor] = await Promise.all([

      // Pólizas activas agrupadas por aseguradora
      query<{ aseguradora: string; total: string }>(`
        SELECT aseguradora, COUNT(*) AS total
        FROM polizas
        WHERE estado = 'activo'
        GROUP BY aseguradora
        ORDER BY total DESC
      `),

      // Distribución de estados de pólizas
      query<{ estado: string; total: string }>(`
        SELECT estado, COUNT(*) AS total
        FROM polizas
        GROUP BY estado
        ORDER BY total DESC
      `),

      // Pólizas que vencen en los próximos 6 meses (agrupadas por mes)
      query<{ mes: string; total: string }>(`
        SELECT
          TO_CHAR(fecha_vencimiento, 'Mon YYYY') AS mes,
          COUNT(*) AS total
        FROM polizas
        WHERE estado IN ('activo', 'pendiente')
          AND fecha_vencimiento BETWEEN NOW() AND NOW() + INTERVAL '6 months'
        GROUP BY DATE_TRUNC('month', fecha_vencimiento), TO_CHAR(fecha_vencimiento, 'Mon YYYY')
        ORDER BY DATE_TRUNC('month', fecha_vencimiento) ASC
      `),

      // Comisiones por asesor (de liquidaciones completadas)
      query<{ asesor_nombre: string; total_items: string; total_monto: string }>(`
        SELECT
          a.nombre AS asesor_nombre,
          COUNT(li.id) AS total_items,
          COALESCE(SUM(li.monto), 0) AS total_monto
        FROM asesores a
        LEFT JOIN liquidacion_items li ON li.asesor_id = a.id
        WHERE a.activo = TRUE
        GROUP BY a.id, a.nombre
        ORDER BY a.nombre
      `),
    ]);

    res.json({
      ok: true,
      data: {
        polizas_por_aseguradora: porAseguradora.map((r) => ({
          aseguradora: r.aseguradora,
          total: parseInt(r.total),
        })),
        estados_polizas: porEstado.map((r) => ({
          estado: r.estado,
          total: parseInt(r.total),
        })),
        proximas_vencer_por_mes: proximosMeses.map((r) => ({
          mes: r.mes,
          total: parseInt(r.total),
        })),
        comisiones_por_asesor: comisionesPorAsesor.map((r) => ({
          asesor: r.asesor_nombre,
          items: parseInt(r.total_items),
          monto: parseFloat(r.total_monto),
        })),
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
