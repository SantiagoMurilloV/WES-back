import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../middleware/auth";
import {
  crearLiquidacion,
  listarLiquidaciones,
  obtenerLiquidacion,
  descargarArchivoLiquidacion,
  corregirItem,
} from "../controllers/liquidaciones.controller";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

const router = Router();
router.use(requireAuth);
router.get("/", listarLiquidaciones);
router.post("/", upload.single("archivo"), crearLiquidacion);
router.get("/:id", obtenerLiquidacion);
router.get("/:id/archivo", descargarArchivoLiquidacion);
router.patch("/items/:itemId", corregirItem);
export default router;
