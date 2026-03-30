import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../middleware/auth";
import {
  listarPolizas,
  obtenerPoliza,
  crearPoliza,
  actualizarPoliza,
  eliminarPoliza,
} from "../controllers/polizas.controller";
import {
  subirDocumento,
  listarDocumentos,
  verDocumento,
  eliminarDocumento,
} from "../controllers/documentos.controller";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
const router = Router();

router.use(requireAuth);

router.get("/",    listarPolizas);
router.get("/:id", obtenerPoliza);
router.post("/",   crearPoliza);
router.put("/:id", actualizarPoliza);
router.delete("/:id", eliminarPoliza);

// Documentos PDF de póliza
router.get("/:id/documentos",              listarDocumentos);
router.post("/:id/documentos", upload.single("archivo"), subirDocumento);
router.get("/:id/documentos/:docId/ver",   verDocumento);
router.delete("/:id/documentos/:docId",    eliminarDocumento);

export default router;
