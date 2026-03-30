import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import {
  listarClientes,
  obtenerCliente,
  crearCliente,
  actualizarCliente,
  eliminarCliente,
} from "../controllers/clientes.controller";

const router = Router();

router.use(requireAuth);

router.get("/",    listarClientes);
router.get("/:id", obtenerCliente);
router.post("/",   crearCliente);
router.put("/:id", actualizarCliente);
router.delete("/:id", eliminarCliente);

export default router;
