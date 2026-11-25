// Cliente de la API REST de Yapay. El token JWT vive solo en sessionStorage (se borra al cerrar la pestaña).
export type Role = 'owner' | 'staff';

export interface ApiError { status: number; code: string; message: string }

const TOKEN_KEY = 'yapay.token';
const REFRESH_KEY = 'yapay.refresh';

export function getToken(): string | null {
  try { return sessionStorage.getItem(TOKEN_KEY); } catch { return null; }
}
export function setToken(token: string | null, refreshToken?: string | null): void {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
    if (refreshToken) sessionStorage.setItem(REFRESH_KEY, refreshToken);
    else if (refreshToken === null || !token) sessionStorage.removeItem(REFRESH_KEY);
  } catch { /* almacenamiento no disponible */ }
}

function getRefreshToken(): string | null {
  try { return sessionStorage.getItem(REFRESH_KEY); } catch { return null; }
}

// Renueva la sesión una sola vez cuando el token de 15 minutos vence.
let refreshing: Promise<boolean> | null = null;
async function renewSession(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;
  refreshing ??= (async () => {
    try {
      const response = await fetch('/api/v1/auth/refresh', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refreshToken })
      });
      if (!response.ok) return false;
      const data = await response.json() as { accessToken: string; refreshToken: string };
      setToken(data.accessToken, data.refreshToken);
      return true;
    } catch {
      return false;
    } finally {
      setTimeout(() => { refreshing = null; }, 0);
    }
  })();
  return refreshing;
}

export async function logoutSession(): Promise<void> {
  const refreshToken = getRefreshToken();
  setToken(null, null);
  if (refreshToken) {
    await fetch('/api/v1/auth/logout', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refreshToken })
    }).catch(() => undefined);
  }
}

const messages: Record<string, string> = {
  invalid_credentials: 'Correo o contraseña incorrectos.',
  invalid_credentials_format: 'Escribe tu correo y tu contraseña.',
  too_many_requests: 'Demasiados intentos. Espera unos minutos.',
  email_already_registered: 'Ya existe una cuenta con ese correo.',
  invalid_registration: 'Revisa los datos. La contraseña debe tener al menos 12 caracteres.',
  invalid_product: 'Revisa el nombre, la unidad y el precio (máximo 2 decimales).',
  product_already_exists: 'Ya existe un producto con ese nombre.',
  invalid_staff: 'Revisa el nombre, el correo y la contraseña (mínimo 12 caracteres).',
  forbidden: 'Tu rol no permite esta acción.',
  unauthorized: 'Tu sesión venció. Vuelve a iniciar sesión.'
};

export async function api<T>(path: string, options: { method?: string; body?: unknown } = {}, retried = false): Promise<T> {
  const headers: Record<string, string> = { accept: 'application/json' };
  const token = getToken();
  if (token) headers.authorization = `Bearer ${token}`;
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  let response: Response;
  try {
    response = await fetch(`/api/v1${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body)
    });
  } catch {
    throw { status: 0, code: 'network', message: 'Sin conexión con el servidor.' } satisfies ApiError;
  }
  if (response.status === 401 && !retried && !path.startsWith('/auth/login') && !path.startsWith('/auth/register')) {
    if (await renewSession()) return api<T>(path, options, true);
  }
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => ({})) as { error?: { code?: string; message?: string } };
  if (!response.ok) {
    const code = data.error?.code ?? 'error';
    if (response.status === 401) setToken(null, null);
    throw { status: response.status, code, message: messages[code] ?? 'Ocurrió un error. Intenta de nuevo.' } satisfies ApiError;
  }
  return data as T;
}

export function errorMessage(error: unknown): string {
  return (error as ApiError)?.message ?? 'Ocurrió un error. Intenta de nuevo.';
}

export interface Me { email: string; nombre: string | null; role: Role; negocio: { nombre: string; rubro: string | null } }
export interface Producto { id: string; name: string; unit: string; salePrice: string; updatedAt: string }
export interface Transaccion { id: string; tipo: string; total: string; formaPago: string; cliente: string | null; estado: string; createdAt: string }
export interface Resumen { ventasHoy: number; totalHoy: string; fiadoHoy: string }
export interface Usuario { id: string; email: string; nombre: string | null; role: Role; createdAt: string }

export const bs = (value: string | number): string =>
  `Bs ${Number(value).toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
