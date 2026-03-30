import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { enviarNotificaciones, listarNotificaciones } from "../controllers/notificaciones.controller";

const router = Router();

router.use(requireAuth);

router.get("/",       listarNotificaciones);
router.post("/enviar", enviarNotificaciones);

export default router;
