// ══════════════════════════════════════════
//  WES Backend — Tipos globales
// ══════════════════════════════════════════

import { Request } from "express";

// ── Auth ──────────────────────────────────
export interface JwtPayload {
  sub: string;   // user identifier
  email: string;
  iat?: number;
  exp?: number;
}

export interface AuthRequest extends Request {
  user?: JwtPayload;
}

// ── Clientes ──────────────────────────────
export interface Cliente {
  id: string;
  nombre: string;
  documento: string | null;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
  notas: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateClienteDto {
  nombre: string;
  documento?: string;
  telefono?: string;
  email?: string;
  direccion?: string;
  notas?: string;
}

export type UpdateClienteDto = Partial<CreateClienteDto>;

// ── Pólizas ───────────────────────────────
export type TipoSeguro = "auto" | "hogar" | "vida" | "soat" | "salud" | "otro";
export type EstadoPoliza = "activo" | "pendiente" | "vencido" | "cancelado";

export interface Poliza {
  id: string;
  cliente_id: string;
  numero_poliza: string | null;
  aseguradora: string;
  tipo: TipoSeguro;
  fecha_inicio: string;
  fecha_vencimiento: string;
  valor_prima: number | null;
  estado: EstadoPoliza;
  notas: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreatePolizaDto {
  cliente_id: string;
  numero_poliza?: string;
  aseguradora: string;
  tipo: TipoSeguro;
  fecha_inicio: string;
  fecha_vencimiento: string;
  valor_prima?: number;
  estado?: EstadoPoliza;
  notas?: string;
}

export type UpdatePolizaDto = Partial<Omit<CreatePolizaDto, "cliente_id">>;

// ── Pagos ─────────────────────────────────
export type EstadoPago = "pendiente" | "pagado" | "vencido";

export interface Pago {
  id: string;
  poliza_id: string;
  monto: number;
  fecha_pago: string | null;
  fecha_vence: string | null;
  estado: EstadoPago;
  notas: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreatePagoDto {
  poliza_id: string;
  monto: number;
  fecha_pago?: string;
  fecha_vence?: string;
  estado?: EstadoPago;
  notas?: string;
}

export type UpdatePagoDto = Partial<Omit<CreatePagoDto, "poliza_id">>;

// ── Notificaciones ────────────────────────
export type TipoNotificacion = "recordatorio_pago" | "vencimiento_poliza" | "manual" | "campaña";

export interface EnviarNotificacionDto {
  cliente_ids: string[];
  tipo: TipoNotificacion;
  mensaje: string;
}

// ── Respuestas API ────────────────────────
export interface ApiResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  total: number;
  page: number;
  limit: number;
}
