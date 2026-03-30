import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../middleware/auth";
import { importarClientes, listarImportaciones } from "../controllers/importaciones.controller";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const router = Router();
router.use(requireAuth);
router.get("/", listarImportaciones);
router.post("/clientes", upload.single("archivo"), importarClientes);
export default router;
