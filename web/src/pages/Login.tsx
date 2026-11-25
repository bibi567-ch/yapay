import { useState, type FormEvent } from 'react';
import { api, errorMessage, setToken } from '../api';

export function Login({ onLoggedIn }: { onLoggedIn: () => Promise<void> }) {
  const [mode, setMode] = useState<'login' | 'registro'>('login');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setBusy(true);
    const form = new FormData(event.currentTarget);
    const value = (name: string) => String(form.get(name) ?? '').trim();
    try {
      const body = mode === 'login'
        ? { email: value('email'), password: String(form.get('password') ?? '') }
        : {
            nombre: value('nombre'), carnet: value('carnet'), celular: value('celular'),
            email: value('email'), password: String(form.get('password') ?? ''),
            nombreNegocio: value('nombreNegocio') || undefined
          };
      const session = await api<{ accessToken: string; refreshToken?: string }>(mode === 'login' ? '/auth/login' : '/auth/register', { method: 'POST', body });
      setToken(session.accessToken, session.refreshToken ?? null);
      await onLoggedIn();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth">
      <section className="auth-card" aria-labelledby="auth-title">
        <div className="brand big">
          <span className="logo" aria-hidden="true">Y</span>
          <strong>Yapay</strong>
        </div>
        <h1 id="auth-title">{mode === 'login' ? 'Ingresa a tu negocio' : 'Crea tu cuenta'}</h1>
        <p className="muted">Panel web de ventas, productos y empleados. Usa la misma cuenta que en la app.</p>
        <form onSubmit={submit} noValidate={false}>
          {mode === 'registro' && (
            <>
              <label>Nombre completo<input name="nombre" required maxLength={160} autoComplete="name" /></label>
              <div className="two">
                <label>Carnet<input name="carnet" required maxLength={40} /></label>
                <label>Celular<input name="celular" required maxLength={40} inputMode="tel" autoComplete="tel" /></label>
              </div>
              <label>Nombre del negocio (opcional)<input name="nombreNegocio" maxLength={160} /></label>
            </>
          )}
          <label>Correo<input name="email" type="email" required autoComplete="email" /></label>
          <label>Contraseña
            <input name="password" type="password" required minLength={mode === 'registro' ? 12 : 1}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
          </label>
          {mode === 'registro' && <p className="muted small">Mínimo 12 caracteres.</p>}
          <p className="error" role="alert" aria-live="assertive">{error}</p>
          <button type="submit" disabled={busy}>{busy ? 'Un momento…' : mode === 'login' ? 'Ingresar' : 'Crear cuenta'}</button>
        </form>
        <button type="button" className="link" onClick={() => { setMode(mode === 'login' ? 'registro' : 'login'); setError(''); }}>
          {mode === 'login' ? '¿No tienes cuenta? Créala aquí' : 'Ya tengo cuenta'}
        </button>
      </section>
    </main>
  );
}
