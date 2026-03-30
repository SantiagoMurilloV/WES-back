import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { listarPagos, crearPago, actualizarPago, eliminarPago } from "../controllers/pagos.controller";

const router = Router();

router.use(requireAuth);

router.get("/",    listarPagos);
router.post("/",   crearPago);
router.put("/:id", actualizarPago);
router.delete("/:id", eliminarPago);

export default router;
