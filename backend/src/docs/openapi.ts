// Especificación OpenAPI 3.0 de la API de Yapay (MYPES Vinto).
// Se sirve en /api/openapi.json y se visualiza con Swagger UI en /api/docs.

const errorResponse = {
  description: 'Error con formato estándar',
  content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } }
};

const secured = [{ bearerAuth: [] }];

export const openApiDocument = {
  openapi: '3.0.3',
  info: {
    title: 'Yapay — API MYPES Vinto',
    version: '1.1.0',
    description:
      'API REST del asistente offline-first para MYPES de Vinto. Autenticación con JWT Bearer (15 minutos) y '
      + 'control de acceso por rol (owner = propietario, staff = empleado). Todas las respuestas son JSON; '
      + 'los errores usan { error: { code, message } }.'
  },
  servers: [{ url: '/', description: 'Servidor actual' }],
  tags: [
    { name: 'Salud' },
    { name: 'Autenticación' },
    { name: 'Empleados (RBAC)' },
    { name: 'Productos' },
    { name: 'Sincronización' },
    { name: 'Nube' },
    { name: 'Asistente' }
  ],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }
    },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          error: {
            type: 'object',
            properties: { code: { type: 'string' }, message: { type: 'string' } },
            required: ['code', 'message']
          }
        }
      },
      Token: {
        type: 'object',
        properties: {
          accessToken: { type: 'string' },
          tokenType: { type: 'string', example: 'Bearer' },
          expiresIn: { type: 'integer', example: 900 },
          refreshToken: { type: 'string', description: 'Token de renovación rotativo (30 días)' },
          refreshExpiresIn: { type: 'integer', example: 2592000 },
          role: { type: 'string', enum: ['owner', 'staff'] }
        }
      },
      Producto: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string', example: 'Arroz 1 kg' },
          unit: { type: 'string', example: 'unidad' },
          salePrice: { type: 'string', example: '8.50' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' }
        }
      },
      ProductoEntrada: {
        type: 'object',
        required: ['name', 'unit', 'salePrice'],
        properties: {
          name: { type: 'string', maxLength: 160 },
          unit: { type: 'string', maxLength: 40 },
          salePrice: { type: 'string', pattern: '^(0|[1-9]\\d{0,9})(\\.\\d{1,2})?$', example: '8.50' }
        }
      },
      Transaccion: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          tipo: { type: 'string', enum: ['VENTA', 'COMPRA', 'FIADO', 'COBRO'] },
          total: { type: 'string', example: '25.00' },
          formaPago: { type: 'string', enum: ['CONTADO', 'FIADO'] },
          cliente: { type: 'string', nullable: true },
          estado: { type: 'string', enum: ['ACEPTADA', 'DUPLICADA', 'CONFLICTO', 'RECHAZADA'] },
          createdAt: { type: 'string', format: 'date-time' }
        }
      }
    }
  },
  paths: {
    '/api/v1/health': {
      get: {
        tags: ['Salud'],
        summary: 'Estado del servicio y de la base de datos',
        responses: { 200: { description: 'Servicio y PostgreSQL disponibles' }, 503: errorResponse }
      }
    },
    '/api/v1/auth/register': {
      post: {
        tags: ['Autenticación'],
        summary: 'Registra un propietario y su negocio',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['nombre', 'carnet', 'celular', 'email', 'password'],
                properties: {
                  nombre: { type: 'string' },
                  carnet: { type: 'string' },
                  celular: { type: 'string' },
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string', minLength: 12 },
                  nombreNegocio: { type: 'string' },
                  rubro: { type: 'string' }
                }
              }
            }
          }
        },
        responses: {
          201: { description: 'Cuenta creada', content: { 'application/json': { schema: { $ref: '#/components/schemas/Token' } } } },
          400: errorResponse,
          409: errorResponse,
          429: errorResponse
        }
      }
    },
    '/api/v1/auth/login': {
      post: {
        tags: ['Autenticación'],
        summary: 'Inicia sesión y devuelve un JWT de 15 minutos',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: { email: { type: 'string' }, password: { type: 'string' } }
              }
            }
          }
        },
        responses: {
          200: { description: 'Sesión iniciada', content: { 'application/json': { schema: { $ref: '#/components/schemas/Token' } } } },
          400: errorResponse,
          401: errorResponse,
          429: errorResponse
        }
      }
    },
    '/api/v1/auth/refresh': {
      post: {
        tags: ['Autenticación'],
        summary: 'Renueva la sesión con un refresh token rotativo (un solo uso)',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['refreshToken'], properties: { refreshToken: { type: 'string' } } } } }
        },
        responses: {
          200: { description: 'Nueva sesión', content: { 'application/json': { schema: { $ref: '#/components/schemas/Token' } } } },
          401: errorResponse
        }
      }
    },
    '/api/v1/auth/logout': {
      post: {
        tags: ['Autenticación'],
        summary: 'Revoca el refresh token',
        responses: { 204: { description: 'Sesión cerrada' } }
      }
    },
    '/api/v1/auth/me': {
      get: {
        tags: ['Autenticación'],
        summary: 'Perfil del usuario autenticado, su rol y su negocio',
        security: secured,
        responses: { 200: { description: 'Perfil' }, 401: errorResponse }
      }
    },
    '/api/v1/auth/business': {
      put: {
        tags: ['Autenticación'],
        summary: 'Actualiza el perfil del negocio (solo propietario)',
        security: secured,
        responses: { 204: { description: 'Actualizado' }, 400: errorResponse, 401: errorResponse, 403: errorResponse }
      }
    },
    '/api/v1/auth/change-password': {
      post: {
        tags: ['Autenticación'],
        summary: 'Cambia la contraseña verificando la actual',
        security: secured,
        responses: { 204: { description: 'Contraseña cambiada' }, 400: errorResponse, 401: errorResponse }
      }
    },
    '/api/v1/auth/staff': {
      get: {
        tags: ['Empleados (RBAC)'],
        summary: 'Lista los usuarios del negocio (solo propietario)',
        security: secured,
        responses: { 200: { description: 'Usuarios' }, 401: errorResponse, 403: errorResponse }
      },
      post: {
        tags: ['Empleados (RBAC)'],
        summary: 'Crea una cuenta de empleado con rol staff (solo propietario)',
        security: secured,
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['nombre', 'email', 'password'],
                properties: {
                  nombre: { type: 'string' },
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string', minLength: 12 }
                }
              }
            }
          }
        },
        responses: { 201: { description: 'Empleado creado' }, 400: errorResponse, 401: errorResponse, 403: errorResponse, 409: errorResponse }
      }
    },
    '/api/v1/products': {
      get: {
        tags: ['Productos'],
        summary: 'Lista productos del negocio (paginado)',
        security: secured,
        parameters: [
          { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 50 } },
          { name: 'offset', in: 'query', schema: { type: 'integer', minimum: 0, default: 0 } }
        ],
        responses: {
          200: {
            description: 'Productos',
            content: {
              'application/json': {
                schema: { type: 'object', properties: { items: { type: 'array', items: { $ref: '#/components/schemas/Producto' } } } }
              }
            }
          },
          400: errorResponse,
          401: errorResponse
        }
      },
      post: {
        tags: ['Productos'],
        summary: 'Crea un producto (propietario o empleado)',
        security: secured,
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/ProductoEntrada' } } } },
        responses: { 201: { description: 'Creado' }, 400: errorResponse, 401: errorResponse, 409: errorResponse }
      }
    },
    '/api/v1/products/{id}': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      put: {
        tags: ['Productos'],
        summary: 'Actualiza un producto (solo propietario)',
        security: secured,
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/ProductoEntrada' } } } },
        responses: { 200: { description: 'Actualizado' }, 400: errorResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse }
      },
      delete: {
        tags: ['Productos'],
        summary: 'Elimina un producto (solo propietario)',
        security: secured,
        responses: { 204: { description: 'Eliminado' }, 401: errorResponse, 403: errorResponse, 404: errorResponse }
      }
    },
    '/api/v1/products/batch-upsert': {
      post: {
        tags: ['Sincronización'],
        summary: 'Sube productos creados en el celular (upsert por id; gana el cambio más reciente)',
        security: secured,
        responses: { 200: { description: 'recibidos, guardados y omitidos' }, 400: errorResponse, 401: errorResponse }
      }
    },
    '/api/v1/products/sync': {
      get: {
        tags: ['Sincronización'],
        summary: 'Catálogo modificado desde una fecha (para la app móvil)',
        security: secured,
        responses: { 200: { description: 'Productos modificados' }, 400: errorResponse, 401: errorResponse }
      }
    },
    '/api/v1/transacciones': {
      get: {
        tags: ['Sincronización'],
        summary: 'Últimas transacciones sincronizadas del negocio',
        security: secured,
        parameters: [{ name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } }],
        responses: {
          200: {
            description: 'Transacciones',
            content: {
              'application/json': {
                schema: { type: 'object', properties: { items: { type: 'array', items: { $ref: '#/components/schemas/Transaccion' } } } }
              }
            }
          },
          400: errorResponse,
          401: errorResponse
        }
      }
    },
    '/api/v1/transacciones/resumen': {
      get: {
        tags: ['Sincronización'],
        summary: 'Ventas, total y fiado del día (hora de Bolivia)',
        security: secured,
        responses: { 200: { description: 'Resumen del día' }, 401: errorResponse }
      }
    },
    '/api/v1/transacciones/batch': {
      post: {
        tags: ['Sincronización'],
        summary: 'Recibe hasta 100 operaciones offline; idempotente por operationId',
        security: secured,
        responses: { 200: { description: 'Resultado por operación: ACEPTADA, DUPLICADA, CONFLICTO o RECHAZADA' }, 400: errorResponse, 401: errorResponse }
      }
    },
    '/api/v1/sync/updates': {
      get: {
        tags: ['Sincronización'],
        summary: 'Canal SSE con eventos del negocio',
        security: secured,
        responses: { 200: { description: 'text/event-stream' }, 401: errorResponse }
      }
    },
    '/api/v1/facturas': {
      post: {
        tags: ['Nube'],
        summary: 'Factura de prueba con PDF simulado (no fiscal)',
        security: secured,
        responses: { 201: { description: 'Factura de prueba' }, 400: errorResponse, 401: errorResponse }
      }
    },
    '/api/v1/qr': {
      post: {
        tags: ['Nube'],
        summary: 'Guarda el QR de pago del negocio (solo propietario)',
        security: secured,
        responses: { 200: { description: 'Guardado' }, 400: errorResponse, 401: errorResponse, 403: errorResponse }
      }
    },
    '/api/v1/assistant/query': {
      post: {
        tags: ['Asistente'],
        summary: 'Consulta al asistente en la nube',
        security: secured,
        responses: { 200: { description: 'Respuesta' }, 400: errorResponse, 401: errorResponse }
      }
    },
    '/api/v1/app-updates/latest': {
      get: {
        tags: ['Asistente'],
        summary: 'Última versión publicada de la app Android',
        responses: { 200: { description: 'Metadatos de versión' } }
      }
    }
  }
} as const;
