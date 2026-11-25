import { useEffect, useState } from 'react';
import { api, bs, errorMessage, type Me, type Resumen, type Transaccion } from '../api';

const estados: Record<string, string> = { ACEPTADA: 'Aceptada', DUPLICADA: 'Duplicada', CONFLICTO: 'Conflicto', RECHAZADA: 'Rechazada' };

export function Panel({ me }: { me: Me }) {
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [items, setItems] = useState<Transaccion[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([api<Resumen>('/transacciones/resumen'), api<{ items: Transaccion[] }>('/transacciones?limit=10')])
      .then(([summary, list]) => { setResumen(summary); setItems(list.items); })
      .catch((caught) => setError(errorMessage(caught)));
  }, []);

  return (
    <>
      <h1>Hola{me.nombre ? `, ${me.nombre.split(' ')[0]}` : ''}</h1>
      <p className="muted">Resumen de hoy con las ventas que ya se sincronizaron desde la app.</p>
      {error && <p className="error" role="alert">{error}</p>}
      <section className="stats" aria-label="Resumen del día">
        <article className="stat"><span className="muted">Ventas de hoy</span><strong>{resumen?.ventasHoy ?? '—'}</strong></article>
        <article className="stat"><span className="muted">Total vendido</span><strong>{resumen ? bs(resumen.totalHoy) : '—'}</strong></article>
        <article className="stat"><span className="muted">Vendido al fiado</span><strong>{resumen ? bs(resumen.fiadoHoy) : '—'}</strong></article>
      </section>
      <section aria-labelledby="ultimas">
        <h2 id="ultimas">Últimas operaciones sincronizadas</h2>
        {items.length === 0 ? (
          <p className="empty">Todavía no hay operaciones. Registra una venta en la app y se verá aquí al sincronizar.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <caption className="sr-only">Últimas operaciones</caption>
              <thead><tr><th scope="col">Fecha</th><th scope="col">Tipo</th><th scope="col">Pago</th><th scope="col">Cliente</th><th scope="col" className="num">Total</th><th scope="col">Estado</th></tr></thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>{new Date(item.createdAt).toLocaleString('es-BO', { dateStyle: 'short', timeStyle: 'short' })}</td>
                    <td>{item.tipo}</td>
                    <td>{item.formaPago === 'FIADO' ? 'Fiado' : 'Contado'}</td>
                    <td>{item.cliente ?? '—'}</td>
                    <td className="num">{bs(item.total)}</td>
                    <td>{estados[item.estado] ?? item.estado}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
