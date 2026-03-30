import { Router } from "express";
import authRoutes           from "./auth.routes";
import clientesRoutes       from "./clientes.routes";
import polizasRoutes        from "./polizas.routes";
import pagosRoutes          from "./pagos.routes";
import notificacionesRoutes from "./notificaciones.routes";
import dashboardRoutes      from "./dashboard.routes";

const router = Router();

router.use("/auth",           authRoutes);
router.use("/clientes",       clientesRoutes);
router.use("/polizas",        polizasRoutes);
router.use("/pagos",          pagosRoutes);
router.use("/notificaciones", notificacionesRoutes);
router.use("/dashboard",      dashboardRoutes);

export default router;
