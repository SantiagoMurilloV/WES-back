import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import {
  listarPolizas,
  obtenerPoliza,
  crearPoliza,
  actualizarPoliza,
  eliminarPoliza,
} from "../controllers/polizas.controller";

const router = Router();

router.use(requireAuth);

router.get("/",    listarPolizas);
router.get("/:id", obtenerPoliza);
router.post("/",   crearPoliza);
router.put("/:id", actualizarPoliza);
router.delete("/:id", eliminarPoliza);

export default router;
