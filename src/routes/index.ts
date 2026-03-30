import { Router } from "express";
import authRoutes           from "./auth.routes";
import clientesRoutes       from "./clientes.routes";
import polizasRoutes        from "./polizas.routes";
import pagosRoutes          from "./pagos.routes";
import notificacionesRoutes from "./notificaciones.routes";
import dashboardRoutes      from "./dashboard.routes";
import asesoresRoutes       from "./asesores.routes";
import importacionesRoutes  from "./importaciones.routes";
import liquidacionesRoutes  from "./liquidaciones.routes";

const router = Router();

router.use("/auth",           authRoutes);
router.use("/clientes",       clientesRoutes);
router.use("/polizas",        polizasRoutes);
router.use("/pagos",          pagosRoutes);
router.use("/notificaciones", notificacionesRoutes);
router.use("/dashboard",      dashboardRoutes);
router.use("/asesores",       asesoresRoutes);
router.use("/importaciones",  importacionesRoutes);
router.use("/liquidaciones",  liquidacionesRoutes);

export default router;
