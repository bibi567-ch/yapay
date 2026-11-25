import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { after, before, test } from 'node:test';

process.env.JWT_SECRET ??= 'integration-test-secret-that-is-at-least-32-bytes';
const { app } = await import('../../src/app.js');
const { pool } = await import('../../src/db/pool.js');

const prefix = randomUUID();
const ownerEmail = `owner.${prefix}@example.test`;
const staffEmail = `staff.${prefix}@example.test`;
let server: ReturnType<typeof createServer>;
let baseUrl: string;

before(async () => {
  server = createServer(app);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  if (server?.listening) {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
  const owners = await pool.query<{ business_id: string }>('SELECT business_id FROM users WHERE email = $1', [ownerEmail]);
  const businessIds = owners.rows.map((row) => row.business_id);
  if (businessIds.length > 0) {
    await pool.query('DELETE FROM transacciones WHERE business_id = ANY($1::uuid[])', [businessIds]);
    await pool.query('DELETE FROM sync_operations WHERE business_id = ANY($1::uuid[])', [businessIds]).catch(() => undefined);
    await pool.query('DELETE FROM products WHERE business_id = ANY($1::uuid[])', [businessIds]);
    await pool.query('DELETE FROM refresh_tokens WHERE user_id IN (SELECT id FROM users WHERE business_id = ANY($1::uuid[]))', [businessIds]);
    await pool.query('DELETE FROM users WHERE business_id = ANY($1::uuid[])', [businessIds]);
    await pool.query('DELETE FROM businesses WHERE id = ANY($1::uuid[])', [businessIds]);
  }
  await pool.end();
});

async function json<T>(response: Response): Promise<T> {
  return await response.json() as T;
}

test('owner creates an employee; the employee gets the staff role and owner-only actions are forbidden', async () => {
  const register = await fetch(`${baseUrl}/api/v1/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      nombre: 'Rosa Prueba', carnet: '7654321', celular: '70000001',
      email: ownerEmail, password: 'owner-long-password', nombreNegocio: 'Tienda Prueba', rubro: 'Abarrotes'
    })
  });
  assert.equal(register.status, 201);
  const ownerToken = (await json<{ accessToken: string }>(register)).accessToken;
  const ownerHeaders = { authorization: `Bearer ${ownerToken}`, 'content-type': 'application/json' };

  const me = await json<{ role: string; negocio: { nombre: string } }>(
    await fetch(`${baseUrl}/api/v1/auth/me`, { headers: ownerHeaders })
  );
  assert.equal(me.role, 'owner');
  assert.equal(me.negocio.nombre, 'Tienda Prueba');

  const created = await fetch(`${baseUrl}/api/v1/auth/staff`, {
    method: 'POST',
    headers: ownerHeaders,
    body: JSON.stringify({ nombre: 'Ana Empleada', email: staffEmail, password: 'staff-long-password' })
  });
  assert.equal(created.status, 201);

  const list = await json<{ items: Array<{ email: string; role: string }> }>(
    await fetch(`${baseUrl}/api/v1/auth/staff`, { headers: ownerHeaders })
  );
  assert.deepEqual(list.items.map((user) => user.role).sort(), ['owner', 'staff']);

  const login = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: staffEmail, password: 'staff-long-password' })
  });
  const staffSession = await json<{ accessToken: string; role: string }>(login);
  assert.equal(login.status, 200);
  assert.equal(staffSession.role, 'staff');
  const staffHeaders = { authorization: `Bearer ${staffSession.accessToken}`, 'content-type': 'application/json' };

  const product = await fetch(`${baseUrl}/api/v1/products`, {
    method: 'POST', headers: staffHeaders, body: JSON.stringify({ name: 'Arroz 1 kg', unit: 'unidad', salePrice: '8.50' })
  });
  assert.equal(product.status, 201);
  const productId = (await json<{ id: string }>(product)).id;

  const staffDelete = await fetch(`${baseUrl}/api/v1/products/${productId}`, { method: 'DELETE', headers: staffHeaders });
  assert.equal(staffDelete.status, 403);
  const ownerDelete = await fetch(`${baseUrl}/api/v1/products/${productId}`, { method: 'DELETE', headers: ownerHeaders });
  assert.equal(ownerDelete.status, 204);
});

test('synced sales appear in the list and in today\'s summary', async () => {
  const login = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: ownerEmail, password: 'owner-long-password' })
  });
  const token = (await json<{ accessToken: string }>(login)).accessToken;
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };

  const before = await json<{ ventasHoy: number }>(await fetch(`${baseUrl}/api/v1/transacciones/resumen`, { headers }));
  assert.equal(before.ventasHoy, 0);

  const operationId = randomUUID();
  const batch = {
    transacciones: [{
      operationId,
      tipo: 'VENTA',
      schemaVersion: 1,
      payload: {
        ventaId: randomUUID(),
        productoId: randomUUID(),
        cantidad: 2,
        precioUnitario: 12.5,
        total: 25,
        formaPago: 'CONTADO',
        creadoEn: Date.now()
      }
    }]
  };
  const sent = await fetch(`${baseUrl}/api/v1/transacciones/batch`, { method: 'POST', headers, body: JSON.stringify(batch) });
  const sentBody = await sent.text();
  assert.equal(sent.status, 200, sentBody);

  const summary = await json<{ ventasHoy: number; totalHoy: string }>(
    await fetch(`${baseUrl}/api/v1/transacciones/resumen`, { headers })
  );
  assert.equal(summary.ventasHoy, 1);
  assert.equal(Number(summary.totalHoy), 25);

  const list = await json<{ items: Array<{ tipo: string; total: string }> }>(
    await fetch(`${baseUrl}/api/v1/transacciones?limit=5`, { headers })
  );
  assert.equal(list.items.length, 1);
  assert.equal(list.items[0]?.tipo, 'VENTA');
});

test('refresh tokens rotate and a reused token revokes the session', async () => {
  const login = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: ownerEmail, password: 'owner-long-password' })
  });
  const first = await json<{ refreshToken: string; refreshExpiresIn: number }>(login);
  assert.ok(first.refreshToken.length >= 40);
  assert.equal(first.refreshExpiresIn, 30 * 24 * 60 * 60);

  const refresh = (token: string) => fetch(`${baseUrl}/api/v1/auth/refresh`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refreshToken: token })
  });
  const rotated = await refresh(first.refreshToken);
  assert.equal(rotated.status, 200);
  const second = await json<{ accessToken: string; refreshToken: string; role: string }>(rotated);
  assert.notEqual(second.refreshToken, first.refreshToken);
  assert.equal(second.role, 'owner');
  const me = await fetch(`${baseUrl}/api/v1/auth/me`, { headers: { authorization: `Bearer ${second.accessToken}` } });
  assert.equal(me.status, 200);

  const reused = await refresh(first.refreshToken);
  assert.equal(reused.status, 401);
  const afterReuse = await refresh(second.refreshToken);
  assert.equal(afterReuse.status, 401);
});

test('products created offline on the phone are uploaded by id and only newer changes win', async () => {
  const login = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: ownerEmail, password: 'owner-long-password' })
  });
  const token = (await json<{ accessToken: string }>(login)).accessToken;
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  const id = randomUUID();
  const now = Date.now();
  const upsert = (items: unknown[]) => fetch(`${baseUrl}/api/v1/products/batch-upsert`, {
    method: 'POST', headers, body: JSON.stringify({ items })
  });

  const first = await json<{ guardados: number }>(await upsert([{ id, name: 'Fideo 400 g', salePrice: 6.5, updatedAt: now }]));
  assert.equal(first.guardados, 1);
  const stale = await json<{ guardados: number }>(await upsert([{ id, name: 'Fideo viejo', salePrice: 1, updatedAt: now - 60_000 }]));
  assert.equal(stale.guardados, 0);
  const newer = await json<{ guardados: number }>(await upsert([{ id, name: 'Fideo 400 g', salePrice: 7, updatedAt: now + 1000 }]));
  assert.equal(newer.guardados, 1);

  const list = await json<{ items: Array<{ id: string; salePrice: string }> }>(
    await fetch(`${baseUrl}/api/v1/products?limit=100`, { headers })
  );
  assert.equal(list.items.find((product) => product.id === id)?.salePrice, '7.00');

  const invalid = await upsert([{ id: 'nope', name: '', salePrice: -1, updatedAt: 0 }]);
  assert.equal(invalid.status, 400);
});
