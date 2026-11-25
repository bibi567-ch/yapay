import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { test } from 'node:test';

process.env.JWT_SECRET ??= 'test-secret-that-is-at-least-32-bytes-long';
const { app } = await import('../src/app.js');
const { createAccessToken } = await import('../src/auth/tokens.js');

const ids = {
  userId: '30a86a83-8809-4df4-80e4-2d0fcba0647e',
  businessId: '228eae95-7c43-48ea-90bb-4e1fb9a0374c'
};

async function startTestServer(): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = createServer(app);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    })
  };
}

test('staff role is forbidden from owner-only actions (RBAC)', async (context) => {
  const server = await startTestServer();
  context.after(server.close);
  const token = await createAccessToken({ ...ids, role: 'staff' });
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  const productId = '7b0e3c7e-8f9a-4d5e-9b1a-2c3d4e5f6a7b';
  const requests: Array<Promise<Response>> = [
    fetch(`${server.baseUrl}/api/v1/products/${productId}`, { method: 'DELETE', headers }),
    fetch(`${server.baseUrl}/api/v1/products/${productId}`, {
      method: 'PUT', headers, body: JSON.stringify({ name: 'Pan', unit: 'unidad', salePrice: 1 })
    }),
    fetch(`${server.baseUrl}/api/v1/auth/business`, {
      method: 'PUT', headers, body: JSON.stringify({ nombreNegocio: 'Tienda', rubro: 'Abarrotes' })
    }),
    fetch(`${server.baseUrl}/api/v1/auth/staff`, { headers }),
    fetch(`${server.baseUrl}/api/v1/auth/staff`, {
      method: 'POST', headers, body: JSON.stringify({ nombre: 'Ana', email: 'ana@example.test', password: 'a-long-password' })
    }),
    fetch(`${server.baseUrl}/api/v1/qr`, { method: 'POST', headers, body: JSON.stringify({ qrBase64: 'aGVsbG8=' }) })
  ];

  for (const response of await Promise.all(requests)) {
    const body = await response.json() as { error?: { code?: string } };
    assert.equal(response.status, 403);
    assert.equal(body.error?.code, 'forbidden');
  }
});

test('owner role passes RBAC and reaches input validation', async (context) => {
  const server = await startTestServer();
  context.after(server.close);
  const token = await createAccessToken({ ...ids, role: 'owner' });
  const response = await fetch(`${server.baseUrl}/api/v1/auth/staff`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ nombre: '', email: 'not-an-email', password: 'short' })
  });
  const body = await response.json() as { error?: { code?: string } };
  assert.equal(response.status, 400);
  assert.equal(body.error?.code, 'invalid_staff');
});

test('responses carry security headers and private cache control', async (context) => {
  const server = await startTestServer();
  context.after(server.close);
  const response = await fetch(`${server.baseUrl}/api/v1/products`);
  assert.equal(response.status, 401);
  assert.match(response.headers.get('content-security-policy') ?? '', /frame-ancestors 'none'/);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.ok(response.headers.get('strict-transport-security'));
  assert.equal(response.headers.get('x-powered-by'), null);
  assert.equal(response.headers.get('cache-control'), 'private, no-cache');
});

test('OpenAPI document and Swagger UI are published', async (context) => {
  const server = await startTestServer();
  context.after(server.close);
  const spec = await fetch(`${server.baseUrl}/api/openapi.json`);
  const document = await spec.json() as { openapi?: string; paths?: Record<string, unknown> };
  assert.equal(spec.status, 200);
  assert.equal(document.openapi, '3.0.3');
  assert.ok(document.paths?.['/api/v1/products/{id}']);
  assert.ok(document.paths?.['/api/v1/auth/staff']);

  const ui = await fetch(`${server.baseUrl}/api/docs/`);
  assert.equal(ui.status, 200);
  assert.match(await ui.text(), /swagger-ui/i);
});

test('login is rate limited after repeated attempts', async (context) => {
  const server = await startTestServer();
  context.after(server.close);
  const limit = Number(process.env.AUTH_RATE_LIMIT_MAX ?? 20);
  let lastStatus = 0;
  for (let attempt = 0; attempt <= limit; attempt += 1) {
    const response = await fetch(`${server.baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'x', password: 'y' })
    });
    lastStatus = response.status;
    await response.arrayBuffer();
  }
  assert.equal(lastStatus, 429);
});
