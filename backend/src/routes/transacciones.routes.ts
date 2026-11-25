import { Router } from 'express';
import { requireAuth } from '../auth/require-auth.js';
import { pool } from '../db/pool.js';
import { esTipoTransaccion, procesarLote } from '../sincronizacion/service/sincronizacion.service.js';
import { esFormaPago } from '../sincronizacion/dto/transaccion.dto.js';
import type { SyncBatchRequest, TransaccionEntrante } from '../sincronizacion/dto/transaccion.dto.js';

export const transaccionesRouter = Router();
transaccionesRouter.use(requireAuth);

transaccionesRouter.get('/', async (request, response) => {
  const businessId = request.auth?.businessId;
  const limit = Number(request.query.limit ?? 20);
  if (!businessId) {
    response.status(401).json({ error: { code: 'unauthorized', message: 'Authentication required.' } });
    return;
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    response.status(400).json({ error: { code: 'invalid_pagination', message: 'Use limit 1-100.' } });
    return;
  }
  const result = await pool.query<{
    id: string; tipo: string; total: string; forma_pago: string; cliente_nombre: string | null; estado: string; created_at: Date;
  }>(
    `SELECT id, tipo, total, forma_pago, cliente_nombre, estado, created_at
     FROM transacciones
     WHERE business_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [businessId, limit]
  );
  response.status(200).json({
    items: result.rows.map((row) => ({
      id: row.id,
      tipo: row.tipo,
      total: row.total,
      formaPago: row.forma_pago,
      cliente: row.cliente_nombre,
      estado: row.estado,
      createdAt: row.created_at
    }))
  });
});

transaccionesRouter.get('/resumen', async (request, response) => {
  const businessId = request.auth?.businessId;
  if (!businessId) {
    response.status(401).json({ error: { code: 'unauthorized', message: 'Authentication required.' } });
    return;
  }
  // Día calendario de Bolivia (UTC-4), usando el índice (business_id, created_at).
  const result = await pool.query<{ ventas: string; total: string; fiado: string }>(
    `SELECT COUNT(*) FILTER (WHERE tipo IN ('VENTA', 'FIADO'))::text AS ventas,
            COALESCE(SUM(total) FILTER (WHERE tipo IN ('VENTA', 'FIADO')), 0)::text AS total,
            COALESCE(SUM(total) FILTER (WHERE forma_pago = 'FIADO' AND tipo IN ('VENTA', 'FIADO')), 0)::text AS fiado
     FROM transacciones
     WHERE business_id = $1
       AND estado = 'ACEPTADA'
       AND created_at >= (date_trunc('day', now() AT TIME ZONE 'America/La_Paz') AT TIME ZONE 'America/La_Paz')`,
    [businessId]
  );
  const row = result.rows[0] ?? { ventas: '0', total: '0', fiado: '0' };
  response.status(200).json({ ventasHoy: Number(row.ventas), totalHoy: row.total, fiadoHoy: row.fiado });
});

transaccionesRouter.post('/batch', async (request, response) => {
  const businessId = request.auth?.businessId;
  if (!businessId) {
    response.status(401).json({ error: { code: 'unauthorized', message: 'Authentication required.' } });
    return;
  }

  const body = request.body as Partial<SyncBatchRequest> | null;
  if (!body || !Array.isArray(body.transacciones)) {
    response.status(400).json({
      error: { code: 'invalid_batch', message: 'El cuerpo debe contener un arreglo "transacciones".' }
    });
    return;
  }
  if (body.transacciones.length === 0) {
    response.status(200).json({ procesadas: 0, resultados: [] });
    return;
  }
  if (body.transacciones.length > 100) {
    response.status(400).json({
      error: { code: 'batch_too_large', message: 'Máximo 100 transacciones por lote.' }
    });
    return;
  }
  if (!body.transacciones.every(esTransaccionValida)) {
    response.status(400).json({
      error: { code: 'invalid_transaction', message: 'Una o más transacciones están mal formadas.' }
    });
    return;
  }

  try {
    response.status(200).json(await procesarLote(businessId, body.transacciones));
  } catch {
    console.error('Error al procesar lote de transacciones.');
    response.status(500).json({
      error: { code: 'sync_failed', message: 'No se pudo procesar el lote.' }
    });
  }
});

function esTransaccionValida(value: unknown): value is TransaccionEntrante {
  if (!value || typeof value !== 'object') return false;
  const transaction = value as Partial<TransaccionEntrante>;
  const payload = transaction.payload;
  return (
    typeof transaction.operationId === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(transaction.operationId)
    && esTipoTransaccion(transaction.tipo)
    && typeof transaction.schemaVersion === 'number'
    && Number.isInteger(transaction.schemaVersion)
    && transaction.schemaVersion > 0
    && !!payload
    && typeof payload === 'object'
    && typeof payload.ventaId === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(payload.ventaId)
    && typeof payload.productoId === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(payload.productoId)
    && typeof payload.cantidad === 'number'
    && Number.isFinite(payload.cantidad)
    && payload.cantidad > 0
    && typeof payload.precioUnitario === 'number'
    && Number.isFinite(payload.precioUnitario)
    && payload.precioUnitario >= 0
    && typeof payload.total === 'number'
    && Number.isFinite(payload.total)
    && payload.total >= 0
    && esFormaPago(payload.formaPago)
    && typeof payload.creadoEn === 'number'
    && Number.isFinite(payload.creadoEn)
  );
}
