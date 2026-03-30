# WES Backend — API REST

Node.js + Express + TypeScript + PostgreSQL (Supabase)

## Setup

```bash
# 1. Instalar dependencias
npm install

# 2. Configurar variables de entorno
cp .env.example .env
# Edita .env con tus valores reales

# 3. Crear tablas en Supabase
# Ir a Supabase → SQL Editor → pegar contenido de sql/001_schema.sql → Run

# 4. Iniciar en desarrollo
npm run dev
```

## Migración desde Excel

```bash
npm run migrate -- --file=ruta/al/clientes.xlsx
```

El script acepta columnas con nombres flexibles. Columnas reconocidas:
- `Nombre` / `Cliente` / `NombreCliente`
- `Documento` / `Cédula` / `NIT`
- `Teléfono` / `Celular` / `Móvil`
- `Email` / `Correo`
- `Dirección`
- `Aseguradora` / `Compañía`
- `Tipo` / `TipoSeguro` / `Póliza`
- `FechaVencimiento` / `Vencimiento`
- `ValorPrima` / `Prima` / `Valor`

## Endpoints

### Auth
| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/auth/login` | Login → retorna accessToken |
| POST | `/api/auth/refresh` | Renovar accessToken (usa cookie httpOnly) |
| POST | `/api/auth/logout` | Cerrar sesión |

### Clientes
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/clientes` | Listar (con paginación y búsqueda) |
| GET | `/api/clientes/:id` | Detalle + pólizas + notificaciones |
| POST | `/api/clientes` | Crear cliente |
| PUT | `/api/clientes/:id` | Actualizar cliente |
| DELETE | `/api/clientes/:id` | Eliminar cliente |

### Pólizas
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/polizas` | Listar (filtros: estado, tipo, aseguradora, vence_en_dias) |
| GET | `/api/polizas/:id` | Detalle + pagos |
| POST | `/api/polizas` | Crear póliza |
| PUT | `/api/polizas/:id` | Actualizar póliza |
| DELETE | `/api/polizas/:id` | Eliminar póliza |

### Pagos
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/pagos` | Listar (filtros: poliza_id, estado) |
| POST | `/api/pagos` | Registrar pago |
| PUT | `/api/pagos/:id` | Actualizar pago |
| DELETE | `/api/pagos/:id` | Eliminar pago |

### Notificaciones (WhatsApp vía n8n)
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/notificaciones` | Historial de envíos |
| POST | `/api/notificaciones/enviar` | Enviar mensaje a clientes |

Body de `/enviar`:
```json
{
  "cliente_ids": ["uuid1", "uuid2"],
  "tipo": "recordatorio_pago",
  "mensaje": "Hola {nombre}, tienes un pago pendiente."
}
```

### Dashboard
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/dashboard/kpis` | KPIs + próximas a vencer + pagos pendientes |

## Deploy en Railway

1. Crear proyecto en [railway.app](https://railway.app)
2. Conectar repositorio GitHub
3. Agregar variables de entorno desde `.env`
4. Railway detecta automáticamente Node.js y corre `npm start`
