# Yapay — Asistente offline-first para MYPES de Vinto

Proyecto Integrador 2026 · Universidad Adventista de Bolivia · Ingeniería de Sistemas.

Yapay ayuda a los pequeños negocios del centro de Vinto (Cochabamba) a registrar ventas, fiados e inventario **aunque no haya internet**. La app Android guarda todo cifrado en el teléfono y lo sincroniza con la nube cuando vuelve la señal. El propietario también puede administrar su negocio desde un **panel web**, que comparte datos con la app: las ventas y los productos creados en el celular se suben al volver la señal, y los productos creados en la web bajan al celular.

## Componentes

| Carpeta | Qué es | Tecnología |
|---|---|---|
| `mobile/` | App Android con asistente de voz offline, base local cifrada y cola Outbox | Kotlin, Jetpack Compose, Room + SQLCipher, Vosk, WorkManager |
| `backend/` | API REST, autenticación JWT con roles, sincronización idempotente y servidor del panel web | Node.js 24, TypeScript, Express 5, PostgreSQL 16 |
| `web/` | Panel web responsive (login, resumen del día, productos, empleados) | React 18, Vite, TypeScript |
| `docs/` | Requisitos, arquitectura (SAD/C4), pruebas, despliegue y auditoría | Markdown |
| `diagrams/` | Diagramas C4, casos de uso y flujos | Mermaid, PlantUML |

## En la nube

- API y panel web: desplegados en Railway con HTTPS; PostgreSQL privado con TLS verificado.
- Salud del servicio: `GET /api/v1/health`.
- Documentación interactiva de la API (Swagger UI): `/api/docs` · especificación OpenAPI: `/api/openapi.json`.

## Seguridad (resumen)

- JWT HS256 de 15 minutos con emisor, audiencia y **rol** (`owner` propietario / `staff` empleado); control de acceso por rol en rutas sensibles.
- Sesión renovable con refresh token rotativo de 30 días (solo se guarda su hash; reutilizar un token revocado cierra todas las sesiones).
- Contraseñas con scrypt y comparación en tiempo constante; PIN local con PBKDF2-HMAC-SHA256; base Android cifrada con SQLCipher.
- Consultas SQL parametrizadas, validación de entradas, límite de 100 kB por petición.
- Cabeceras de seguridad (CSP, HSTS, frame-ancestors, nosniff) y límite de intentos en login y registro.
- Secretos solo en variables de entorno; el repositorio contiene únicamente archivos `.env.example`.

## Ejecutar en local

Requisitos: Node.js 24, Docker (opcional), Android Studio para la app.

```bash
# Base de datos y API con Docker
cp .env.example .env        # define POSTGRES_PASSWORD y JWT_SECRET (mínimo 32 bytes)
docker compose up --build

# o sin Docker, con PostgreSQL propio
cd backend
npm ci
npm run db:migrate
npm run dev                 # http://127.0.0.1:3000

# Panel web en modo desarrollo (usa la API local)
cd web
npm ci
npm run dev                 # http://127.0.0.1:5173
npm run build               # genera backend/public, que la API sirve en producción
```

Pruebas del backend: `npm test` (unitarias) y `npm run test:integration` (requiere PostgreSQL). La app Android se compila con `mobile/gradlew :app:assembleDebug`.

## Documentación

Empieza por [`docs/00_Indice.md`](docs/00_Indice.md). La auditoría de estándares web, rendimiento e impacto socio-digital está en [`docs/17_Auditoria_Estandares_y_Etica.md`](docs/17_Auditoria_Estandares_y_Etica.md).

## Equipo

Eva Lizeth Chino Quispe · Christian Gonzales Mamani · Marializ Mamani Quispe · Kevin Jhonathan Rocha Rojas · Luis Gerardo Lazo Bustamante
