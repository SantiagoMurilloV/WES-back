-- ══════════════════════════════════════════════════════════════
--  WES — Migración 002: Asesores, Documentos y Liquidaciones
--  Ejecutar: psql -U santimurilloval -d wes -f sql/002_asesores_liquidaciones.sql
-- ══════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────
--  ASESORES (los dos miembros de WES)
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS asesores (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre     TEXT NOT NULL,
  email      TEXT UNIQUE NOT NULL,
  telefono   TEXT,
  activo     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insertar los dos asesores base de WES
INSERT INTO asesores (nombre, email) VALUES
  ('Asesor 1 WES', 'asesor1@wesagencia.com'),
  ('Asesor 2 WES', 'asesor2@wesagencia.com')
ON CONFLICT (email) DO NOTHING;

-- ──────────────────────────────────────────
--  ASESOR en CLIENTES
-- ──────────────────────────────────────────
ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS asesor_id UUID REFERENCES asesores(id);

CREATE INDEX IF NOT EXISTS idx_clientes_asesor_id ON clientes (asesor_id);

-- ──────────────────────────────────────────
--  DOCUMENTOS DE PÓLIZA (PDFs)
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS documentos_poliza (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  poliza_id    UUID NOT NULL REFERENCES polizas(id) ON DELETE CASCADE,
  nombre       TEXT NOT NULL,
  mimetype     TEXT NOT NULL DEFAULT 'application/pdf',
  tamano_bytes BIGINT,
  ruta_archivo TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_documentos_poliza_poliza_id ON documentos_poliza (poliza_id);

-- ──────────────────────────────────────────
--  LIQUIDACIONES (informes quincenales de aseguradoras)
-- ──────────────────────────────────────────
CREATE TYPE estado_liquidacion AS ENUM ('pendiente', 'procesando', 'completado', 'error');

CREATE TABLE IF NOT EXISTS liquidaciones (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  aseguradora    TEXT NOT NULL,
  periodo        TEXT NOT NULL,        -- ej: "2026-03 Q1"
  archivo_nombre TEXT NOT NULL,
  archivo_ruta   TEXT NOT NULL,
  mimetype       TEXT NOT NULL,
  tamano_bytes   BIGINT,
  estado         estado_liquidacion NOT NULL DEFAULT 'pendiente',
  total_bruto    NUMERIC(14, 2),       -- total del informe
  total_asesor1  NUMERIC(14, 2),       -- porción asesor 1
  total_asesor2  NUMERIC(14, 2),       -- porción asesor 2
  total_sin_match NUMERIC(14, 2),      -- sin cliente identificado
  notas          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_liquidaciones_updated_at
  BEFORE UPDATE ON liquidaciones
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ──────────────────────────────────────────
--  ITEMS DE LIQUIDACIÓN (líneas del informe + matching)
-- ──────────────────────────────────────────
CREATE TYPE estado_match AS ENUM ('encontrado', 'no_encontrado', 'ambiguo');

CREATE TABLE IF NOT EXISTS liquidacion_items (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  liquidacion_id  UUID NOT NULL REFERENCES liquidaciones(id) ON DELETE CASCADE,
  -- Datos crudos del informe
  nombre_raw      TEXT,
  documento_raw   TEXT,
  poliza_raw      TEXT,
  monto           NUMERIC(12, 2) NOT NULL,
  concepto        TEXT,
  -- Resultado del matching
  estado_match    estado_match NOT NULL DEFAULT 'no_encontrado',
  cliente_id      UUID REFERENCES clientes(id),
  asesor_id       UUID REFERENCES asesores(id),
  confianza       SMALLINT DEFAULT 0, -- 0-100
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_liq_items_liquidacion_id ON liquidacion_items (liquidacion_id);
CREATE INDEX IF NOT EXISTS idx_liq_items_cliente_id     ON liquidacion_items (cliente_id);
CREATE INDEX IF NOT EXISTS idx_liq_items_asesor_id      ON liquidacion_items (asesor_id);

-- ──────────────────────────────────────────
--  IMPORTACIONES DE EXCEL (log de cargas)
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS importaciones (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tipo            TEXT NOT NULL,       -- 'clientes' | 'polizas'
  archivo_nombre  TEXT NOT NULL,
  total_filas     INTEGER,
  filas_ok        INTEGER,
  filas_error     INTEGER,
  detalle_errores JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
