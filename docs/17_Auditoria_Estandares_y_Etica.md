# 17. Auditoría técnica, de estándares web y de impacto socio-digital

**Proyecto:** Yapay — Asistente offline-first para MYPES de Vinto
**Rama de trabajo:** `feature/rubrica-web` · **Fecha:** 25/11/2026
**Alcance:** API REST (`backend/`), panel web (`web/`) y app Android (`mobile/`).

Este documento registra qué se revisó, cómo se comprobó y qué queda pendiente. Una comprobación automática no equivale a una certificación: donde la evidencia es parcial, se indica.

## 1. Optimización de rendimiento

| Área | Medida aplicada | Evidencia |
|---|---|---|
| Base de datos | Índices por negocio y fecha: `transacciones (business_id, created_at DESC)`, `invoices (business_id, created_at DESC)`, `conflictos (business_id, resuelto)`, `users (business_id)`; únicos `products (business_id, name)` y `transacciones (business_id, operation_id)` | `backend/db/migrations/001`–`007` |
| Consultas | Paginación con límite máximo de 100 registros; lotes de sincronización de hasta 100 operaciones | `products.routes.ts`, `transacciones.routes.ts` |
| Red | Compresión gzip de respuestas (`compression`) y cuerpo JSON limitado a 100 kB | `backend/src/app.ts` |
| Caché HTTP | Archivos del panel web con nombre con hash: `Cache-Control: public, max-age=31536000, immutable`; HTML y API: `no-cache` / `private, no-cache` con revalidación por ETag | `app.ts`; prueba `rbac-security.test.ts` |
| Frontend | Build de producción con Vite: JS 158 kB (50,6 kB gzip), CSS 4,7 kB (1,6 kB gzip); sin fuentes ni librerías externas | Salida de `npm run build` en `web/` |
| Móvil | Operación offline-first: las ventas se guardan localmente y se envían en lote con reintentos exponenciales (WorkManager, 30 s inicial) | `mobile/.../sync/SyncScheduler.kt` |

**Pendiente:** pruebas de carga y medición de latencia en Railway; métricas de tiempo de respuesta en el teléfono.

## 2. Estándares web, accesibilidad y diseño responsive

| Criterio | Aplicación | Evidencia |
|---|---|---|
| HTML semántico (W3C) | `lang="es"`, `header`, `nav`, `main`, `footer`, tablas con `caption` y `th scope` | `web/index.html`, `web/src/` |
| WCAG 2.1 AA — contraste | Texto principal #14213D sobre #F6F4EE (≈14:1); botón #0F7A5F con texto blanco (≈5,3:1) | `web/src/styles.css` |
| WCAG 2.1 AA — teclado y foco | Enlace “Saltar al contenido”, foco visible de 3 px, navegación completa con teclado | `App.tsx`, `styles.css` |
| WCAG 2.1 AA — formularios | Cada campo tiene `label`; mensajes de error con `role="alert"` y confirmaciones con `aria-live` | páginas en `web/src/pages/` |
| Áreas táctiles | Botones y enlaces de al menos 44 px de alto | `styles.css` |
| Responsive | Diseño fluido con `grid`/`flex`, tablas con desplazamiento horizontal y ajuste a 390 px de ancho | Capturas de escritorio (1280 px) y móvil (390 px) |
| Movimiento reducido | Respeta `prefers-reduced-motion` | `styles.css` |
| Verificación automática | **axe-core 4 (reglas WCAG 2.0/2.1 A y AA): 0 violaciones** en login, panel, productos y empleados | Ejecución local del 25/11/2026 con Chrome sin interfaz |

Una auditoría automática detecta cerca de un tercio de los problemas de accesibilidad. **Pendiente:** prueba con lector de pantalla (NVDA/TalkBack) y con usuarios reales; la app Android usa botones grandes y lectura en voz alta, pero no tiene auditoría formal de accesibilidad.

## 3. Seguridad (OWASP Top 10 2021)

| Riesgo | Control | Evidencia |
|---|---|---|
| A01 Control de acceso | JWT con rol; `requireRole('owner')` en editar/eliminar productos, perfil del negocio, QR y gestión de empleados; datos filtrados por `business_id` del token | `require-auth.ts`; pruebas `rbac-security.test.ts` y `integration/rbac-staff.test.ts` (403 para empleados) |
| A02 Fallas criptográficas | HTTPS en Railway; TLS verificado hacia PostgreSQL; scrypt para contraseñas; PBKDF2-HMAC-SHA256 (120 000 iteraciones) para el PIN; SQLCipher con clave protegida por Android Keystore | `password.ts`, `postgres-ssl.ts`, `PinHasher.kt`, `ClaveDb.kt` |
| A03 Inyección | Consultas parametrizadas en todas las rutas; validación de tipos, longitudes y formatos | `backend/src/routes/` |
| XSS | React escapa el contenido por defecto; CSP `script-src 'self'` bloquea scripts en línea (comprobado: el navegador rechazó la inyección de un script durante la auditoría) | `app.ts` |
| CSRF | La API usa token Bearer en la cabecera `Authorization`, no cookies: un sitio externo no puede enviar credenciales automáticamente | Diseño de autenticación |
| Clickjacking | `frame-ancestors 'none'` y `X-Frame-Options` | Prueba de cabeceras |
| A05 Configuración | Helmet: CSP, HSTS, `nosniff`, `Referrer-Policy`; sin `X-Powered-By`; errores genéricos sin detalles internos | `app.ts` |
| A06 Componentes | `npm audit`: 0 vulnerabilidades en backend y web | Ejecución del 25/11/2026 |
| A07 Autenticación | Límite de 20 intentos cada 15 minutos en login y registro (configurable con `AUTH_RATE_LIMIT_MAX`); sesión de 15 minutos renovable con refresh token rotativo (30 días, guardado como hash SHA-256, detección de reutilización); contraseña mínima de 12 caracteres | Pruebas `login is rate limited` y `refresh tokens rotate…` |
| Secretos | Solo `.env.example` en el repositorio; `JWT_SECRET` de al menos 32 bytes exigido al iniciar | `config/env.ts`, `.gitignore` |

**Pendiente:** prueba de penetración externa.

## 4. Impacto socio-digital y ética

**Beneficios esperados**

- **Inclusión digital:** uso por voz y con confirmación, pensado para personas con poca experiencia en aplicaciones.
- **Continuidad del negocio:** funciona sin datos móviles ni señal estable.
- **Control del propio negocio:** el propietario ve sus ventas del día y gestiona a su personal desde el panel web.

**Riesgos y mitigaciones**

| Riesgo | Mitigación |
|---|---|
| Exposición de datos comerciales y de clientes | Cifrado en el teléfono y en tránsito; aislamiento por negocio; empleados con permisos limitados |
| Grabación de voz sin consentimiento | El registro de comandos de voz solo se envía al servidor si el usuario lo autoriza (`consentToUpload`) |
| Acciones no deseadas por errores de reconocimiento | El asistente repite lo que entendió y solo actúa con confirmación; si no entiende, no ejecuta nada |
| Sesgo del reconocimiento de voz (acentos, quechua) | El modelo es español; el soporte quechua se declara experimental y no se usa para ventas |
| Exclusión de quien no tiene smartphone o no lee | El panel web y la voz amplían el acceso, pero no lo resuelven todo; se requiere validación con comerciantes |
| Uso comercial de modelos con licencia no comercial | El modelo Whisper Puno (CC BY-NC 4.0) queda restringido a evaluación académica |
| Huella energética | Procesamiento local y envío por lotes reducen el uso de red; imagen Docker liviana (node:24-alpine) |

**Datos mínimos:** la nube guarda cuenta, negocio, catálogo y eventos de sincronización; no guarda audio salvo consentimiento.

**Pendiente:** consulta y validación con comerciantes de Vinto, y medición de usabilidad (SUS).

## 5. Cómo reproducir las comprobaciones

```bash
cd backend && npm test && npm run test:integration   # 33 unitarias + 14 de integración (25/11/2026)
cd backend && npm audit && cd ../web && npm audit --omit=dev
cd web && npm run build                               # tamaños del bundle
```

La auditoría axe-core se ejecutó con Chrome sin interfaz sobre el panel servido por la API local.
