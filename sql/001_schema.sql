-- ══════════════════════════════════════════════════════════════
--  WES Agencia de Seguros — Schema PostgreSQL (Fase 1)
--  Ejecutar en Supabase: SQL Editor → New query → Run
-- ══════════════════════════════════════════════════════════════

-- Extensión para UUIDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ──────────────────────────────────────────
--  CLIENTES
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clientes (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre        TEXT NOT NULL,
  documento     TEXT UNIQUE,
  telefono      TEXT,
  email         TEXT,
  direccion     TEXT,
  notas         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clientes_documento ON clientes (documento);
CREATE INDEX IF NOT EXISTS idx_clientes_nombre    ON clientes (nombre);

-- ──────────────────────────────────────────
--  PÓLIZAS
-- ──────────────────────────────────────────
CREATE TYPE tipo_seguro AS ENUM ('auto', 'hogar', 'vida', 'soat', 'salud', 'otro');
CREATE TYPE estado_poliza AS ENUM ('activo', 'pendiente', 'vencido', 'cancelado');

CREATE TABLE IF NOT EXISTS polizas (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cliente_id          UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  numero_poliza       TEXT,
  aseguradora         TEXT NOT NULL,
  tipo                tipo_seguro NOT NULL,
  fecha_inicio        DATE NOT NULL,
  fecha_vencimiento   DATE NOT NULL,
  valor_prima         NUMERIC(12, 2),
  estado              estado_poliza NOT NULL DEFAULT 'activo',
  notas               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_polizas_cliente_id        ON polizas (cliente_id);
CREATE INDEX IF NOT EXISTS idx_polizas_estado            ON polizas (estado);
CREATE INDEX IF NOT EXISTS idx_polizas_fecha_vencimiento ON polizas (fecha_vencimiento);

-- ──────────────────────────────────────────
--  PAGOS
-- ──────────────────────────────────────────
CREATE TYPE estado_pago AS ENUM ('pendiente', 'pagado', 'vencido');

CREATE TABLE IF NOT EXISTS pagos (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  poliza_id     UUID NOT NULL REFERENCES polizas(id) ON DELETE CASCADE,
  monto         NUMERIC(12, 2) NOT NULL,
  fecha_pago    DATE,
  fecha_vence   DATE,
  estado        estado_pago NOT NULL DEFAULT 'pendiente',
  notas         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pagos_poliza_id ON pagos (poliza_id);
CREATE INDEX IF NOT EXISTS idx_pagos_estado    ON pagos (estado);

-- ──────────────────────────────────────────
--  NOTIFICACIONES (log de WhatsApp)
-- ──────────────────────────────────────────
CREATE TYPE tipo_notificacion AS ENUM ('recordatorio_pago', 'vencimiento_poliza', 'manual', 'campaña');
CREATE TYPE estado_notificacion AS ENUM ('enviado', 'fallido', 'pendiente');

CREATE TABLE IF NOT EXISTS notificaciones (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cliente_id    UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  tipo          tipo_notificacion NOT NULL,
  mensaje       TEXT NOT NULL,
  telefono      TEXT NOT NULL,
  estado        estado_notificacion NOT NULL DEFAULT 'pendiente',
  enviado_en    TIMESTAMPTZ,
  error_detalle TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notificaciones_cliente_id ON notificaciones (cliente_id);
CREATE INDEX IF NOT EXISTS idx_notificaciones_estado     ON notificaciones (estado);

-- ──────────────────────────────────────────
--  FUNCIÓN auto-update updated_at
-- ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_clientes_updated_at
  BEFORE UPDATE ON clientes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_polizas_updated_at
  BEFORE UPDATE ON polizas
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_pagos_updated_at
  BEFORE UPDATE ON pagos
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
