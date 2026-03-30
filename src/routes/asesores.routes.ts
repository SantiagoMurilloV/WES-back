import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { listarAsesores, actualizarAsesor } from "../controllers/asesores.controller";

const router = Router();
router.use(requireAuth);
router.get("/", listarAsesores);
router.put("/:id", actualizarAsesor);
export default router;
