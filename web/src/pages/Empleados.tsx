import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, errorMessage, type Usuario } from '../api';

export function Empleados() {
  const [items, setItems] = useState<Usuario[]>([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try { setItems((await api<{ items: Usuario[] }>('/auth/staff')).items); }
    catch (caught) { setError(errorMessage(caught)); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(''); setMessage('');
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const body = {
      nombre: String(form.get('nombre') ?? '').trim(),
      email: String(form.get('email') ?? '').trim(),
      password: String(form.get('password') ?? '')
    };
    try {
      await api('/auth/staff', { method: 'POST', body });
      setMessage(`Cuenta de empleado creada para ${body.nombre}.`);
      formElement.reset();
      await load();
    } catch (caught) { setError(errorMessage(caught)); }
  }

  return (
    <>
      <h1>Empleados</h1>
      <p className="muted">Solo el propietario crea cuentas. Un empleado puede vender y agregar productos, pero no editar ni eliminar el catálogo ni cambiar los datos del negocio.</p>
      <section className="card" aria-labelledby="nuevo">
        <h2 id="nuevo">Nueva cuenta de empleado</h2>
        <form className="inline-form" onSubmit={create}>
          <label>Nombre<input name="nombre" required maxLength={160} /></label>
          <label>Correo<input name="email" type="email" required autoComplete="off" /></label>
          <label>Contraseña temporal<input name="password" type="password" required minLength={12} autoComplete="new-password" /></label>
          <div className="actions"><button type="submit">Crear cuenta</button></div>
        </form>
        <p className="ok" role="status" aria-live="polite">{message}</p>
        <p className="error" role="alert">{error}</p>
      </section>
      <section aria-labelledby="equipo">
        <h2 id="equipo">Equipo</h2>
        <div className="table-wrap">
          <table>
            <caption className="sr-only">Usuarios del negocio</caption>
            <thead><tr><th scope="col">Nombre</th><th scope="col">Correo</th><th scope="col">Rol</th><th scope="col">Desde</th></tr></thead>
            <tbody>
              {items.map((user) => (
                <tr key={user.id}>
                  <td>{user.nombre ?? '—'}</td>
                  <td>{user.email}</td>
                  <td><span className="badge">{user.role === 'owner' ? 'Propietario' : 'Empleado'}</span></td>
                  <td>{new Date(user.createdAt).toLocaleDateString('es-BO')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
