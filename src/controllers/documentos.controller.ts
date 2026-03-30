// ══════════════════════════════════════════
//  Documentos Controller — PDFs de pólizas
// ══════════════════════════════════════════
import path from "path";
import fs from "fs";
import { Response, NextFunction } from "express";
import { query, queryOne } from "../config/db";
import { AppError } from "../middleware/errorHandler";
import { AuthRequest } from "../types";

const UPLOAD_DIR = path.join(process.cwd(), "uploads", "polizas");

// POST /api/polizas/:id/documentos
export async function subirDocumento(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.file) throw new AppError(400, "Debes adjuntar un archivo PDF.");

    const { id: poliza_id } = req.params;

    // Verificar que la póliza existe
    const poliza = await queryOne("SELECT id FROM polizas WHERE id = $1", [poliza_id]);
    if (!poliza) throw new AppError(404, "Póliza no encontrada.");

    // Guardar en disco
    if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    const filename = `${poliza_id}_${Date.now()}_${req.file.originalname.replace(/\s+/g, "_")}`;
    const ruta = path.join(UPLOAD_DIR, filename);
    fs.writeFileSync(ruta, req.file.buffer);

    const doc = await queryOne(
      `INSERT INTO documentos_poliza (poliza_id, nombre, mimetype, tamano_bytes, ruta_archivo)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [poliza_id, req.file.originalname, req.file.mimetype, req.file.size, filename]
    );

    res.status(201).json({ ok: true, data: doc, message: "Documento guardado" });
  } catch (err) {
    next(err);
  }
}

// GET /api/polizas/:id/documentos
export async function listarDocumentos(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id: poliza_id } = req.params;
    const docs = await query(
      "SELECT * FROM documentos_poliza WHERE poliza_id = $1 ORDER BY created_at DESC",
      [poliza_id]
    );
    res.json({ ok: true, data: docs });
  } catch (err) {
    next(err);
  }
}

// GET /api/polizas/:id/documentos/:docId/ver
export async function verDocumento(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { docId } = req.params;
    const doc = await queryOne<{ ruta_archivo: string; mimetype: string; nombre: string }>(
      "SELECT * FROM documentos_poliza WHERE id = $1",
      [docId]
    );
    if (!doc) throw new AppError(404, "Documento no encontrado.");

    const ruta = path.join(UPLOAD_DIR, doc.ruta_archivo);
    if (!fs.existsSync(ruta)) throw new AppError(404, "Archivo no encontrado en disco.");

    res.setHeader("Content-Type", doc.mimetype);
    res.setHeader("Content-Disposition", `inline; filename="${doc.nombre}"`);
    fs.createReadStream(ruta).pipe(res);
  } catch (err) {
    next(err);
  }
}

// DELETE /api/polizas/:id/documentos/:docId
export async function eliminarDocumento(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { docId } = req.params;
    const doc = await queryOne<{ ruta_archivo: string }>(
      "DELETE FROM documentos_poliza WHERE id = $1 RETURNING ruta_archivo",
      [docId]
    );
    if (!doc) throw new AppError(404, "Documento no encontrado.");

    const ruta = path.join(UPLOAD_DIR, doc.ruta_archivo);
    if (fs.existsSync(ruta)) fs.unlinkSync(ruta);

    res.json({ ok: true, message: "Documento eliminado" });
  } catch (err) {
    next(err);
  }
}
