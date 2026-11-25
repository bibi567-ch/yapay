import { useCallback, useEffect, useState } from 'react';
import { api, getToken, logoutSession, type Me } from './api';
import { Login } from './pages/Login';
import { Panel } from './pages/Panel';
import { Productos } from './pages/Productos';
import { Empleados } from './pages/Empleados';

type Page = 'panel' | 'productos' | 'empleados';

function pageFromHash(): Page {
  const value = window.location.hash.replace('#/', '');
  return value === 'productos' || value === 'empleados' ? value : 'panel';
}

export function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(Boolean(getToken()));
  const [page, setPage] = useState<Page>(pageFromHash());

  const loadMe = useCallback(async () => {
    if (!getToken()) { setLoading(false); return; }
    try { setMe(await api<Me>('/auth/me')); } catch { setMe(null); } finally { setLoading(false); }
  }, []);

  useEffect(() => { void loadMe(); }, [loadMe]);
  useEffect(() => {
    const onHash = () => setPage(pageFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const logout = () => { void logoutSession(); setMe(null); window.location.hash = '#/'; };

  if (loading) return <p className="center" role="status">Cargando…</p>;
  if (!me) return <Login onLoggedIn={loadMe} />;

  const links: Array<{ id: Page; label: string; ownerOnly?: boolean }> = [
    { id: 'panel', label: 'Panel' },
    { id: 'productos', label: 'Productos' },
    { id: 'empleados', label: 'Empleados', ownerOnly: true }
  ];

  return (
    <>
      <a className="skip" href="#contenido">Saltar al contenido</a>
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden="true">Y</span>
          <div>
            <strong>Yapay</strong>
            <span className="muted small">{me.negocio.nombre}</span>
          </div>
        </div>
        <nav aria-label="Secciones">
          <ul>
            {links.filter((link) => !link.ownerOnly || me.role === 'owner').map((link) => (
              <li key={link.id}>
                <a href={`#/${link.id}`} aria-current={page === link.id ? 'page' : undefined}>{link.label}</a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="user">
          <span className="badge" title="Rol de acceso">{me.role === 'owner' ? 'Propietario' : 'Empleado'}</span>
          <button type="button" className="ghost" onClick={logout}>Cerrar sesión</button>
        </div>
      </header>
      <main id="contenido" tabIndex={-1}>
        {page === 'panel' && <Panel me={me} />}
        {page === 'productos' && <Productos me={me} />}
        {page === 'empleados' && me.role === 'owner' && <Empleados />}
        {page === 'empleados' && me.role !== 'owner' && <p role="alert">Esta sección es solo para el propietario.</p>}
      </main>
      <footer className="footer muted small">
        Yapay · MYPES de Vinto · <a href="/api/docs" target="_blank" rel="noopener">Documentación de la API</a>
      </footer>
    </>
  );
}
