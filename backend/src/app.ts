import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import compression from 'compression';
import express from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import { openApiDocument } from './docs/openapi.js';
import { authRouter } from './routes/auth.routes.js';
import { asrRouter } from './routes/asr.routes.js';
import { appUpdatesRouter } from './routes/app-updates.routes.js';
import { assistantRouter } from './routes/assistant.routes.js';
import { cloudRouter } from './routes/cloud.routes.js';
import { healthRouter } from './routes/health.routes.js';
import { learningRouter } from './routes/learning.routes.js';
import { logsRouter } from './routes/logs.routes.js';
import { productsRouter } from './routes/products.routes.js';
import { transaccionesRouter } from './routes/transacciones.routes.js';

export const app = express();
app.disable('x-powered-by');
// Railway entrega las peticiones a través de un proxy HTTPS: necesario para la IP real en el límite de intentos.
app.set('trust proxy', 1);

// Cabeceras de seguridad (CSP, HSTS, X-Frame-Options/frame-ancestors, nosniff, Referrer-Policy) — OWASP A05.
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      frameAncestors: ["'none'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      // En desarrollo local (http://localhost) no se fuerza HTTPS; en Railway sí.
      upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null
    }
  }
}));
// Compresión gzip de respuestas (optimización de red).
app.use(compression());
app.use(express.json({ limit: '100kb' }));

// Respuestas de la API: privadas y revalidables con ETag (Express genera ETag por defecto).
app.use('/api', (_request, response, next) => {
  response.setHeader('Cache-Control', 'private, no-cache');
  next();
});

// Límite de intentos en login y registro contra fuerza bruta — OWASP A07.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.AUTH_RATE_LIMIT_MAX ?? 20),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { code: 'too_many_requests', message: 'Too many attempts. Try again in a few minutes.' } }
});
app.use('/api/v1/auth/login', authLimiter);
app.use('/api/v1/auth/register', authLimiter);
app.use('/api/v1/auth/refresh', rateLimit({ windowMs: 15 * 60 * 1000, limit: 120, standardHeaders: 'draft-7', legacyHeaders: false }));

// Documentación interactiva de la API (Swagger UI).
app.get('/api/openapi.json', (_request, response) => {
  response.json(openApiDocument);
});
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openApiDocument, { customSiteTitle: 'Yapay API — Swagger' }));
app.use('/api/v1/health', healthRouter);
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/asr', asrRouter);
app.use('/api/v1/app-updates', appUpdatesRouter);
app.use('/api/v1/assistant', assistantRouter);
app.use('/api/v1/learning', learningRouter);
app.use('/api/v1/logs', logsRouter);
app.use('/api/v1', cloudRouter);
app.use('/api/v1/products', productsRouter);
app.use('/api/v1/transacciones', transaccionesRouter);

// Interfaz web (React) compilada en backend/public: archivos con hash se guardan en caché un año.
const publicDir = fileURLToPath(new URL('../public', import.meta.url));
const indexHtml = `${publicDir}/index.html`;
if (existsSync(indexHtml)) {
  app.use(express.static(publicDir, {
    index: false,
    setHeaders: (response, filePath) => {
      response.setHeader(
        'Cache-Control',
        filePath.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache'
      );
    }
  }));
  app.get(/^\/(?!api\/).*/, (_request, response) => {
    response.setHeader('Cache-Control', 'no-cache');
    response.sendFile(indexHtml);
  });
}

app.use((_request, response) => {
  response.status(404).json({ error: { code: 'not_found', message: 'The requested endpoint does not exist.' } });
});

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  if (
    typeof error === 'object'
    && error !== null
    && 'type' in error
    && error.type === 'entity.parse.failed'
  ) {
    response.status(400).json({ error: { code: 'invalid_json', message: 'The request body must be valid JSON.' } });
    return;
  }

  if (
    typeof error === 'object'
    && error !== null
    && 'type' in error
    && error.type === 'entity.too.large'
  ) {
    response.status(413).json({ error: { code: 'payload_too_large', message: 'The request body is too large.' } });
    return;
  }

  console.error('Unhandled API error.');
  response.status(500).json({ error: { code: 'internal_error', message: 'An unexpected error occurred.' } });
});
