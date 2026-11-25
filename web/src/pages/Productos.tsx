import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, bs, errorMessage, type Me, type Producto } from '../api';

export function Productos({ me }: { me: Me }) {
  const isOwner = me.role === 'owner';
  const [items, setItems] = useState<Producto[]>([]);
  const [filter, setFilter] = useState('');
  const [editing, setEditing] = useState<Producto | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try { setItems((await api<{ items: Producto[] }>('/products?limit=100')).items); }
    catch (caught) { setError(errorMessage(caught)); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(''); setMessage('');
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const body = {
      name: String(form.get('name') ?? '').trim(),
      unit: String(form.get('unit') ?? '').trim(),
      salePrice: Number(String(form.get('salePrice') ?? '0').replace(',', '.')).toFixed(2)
    };
    try {
      if (editing) {
        await api(`/products/${editing.id}`, { method: 'PUT', body });
        setMessage(`Producto "${body.name}" actualizado.`);
        setEditing(null);
      } else {
        await api('/products', { method: 'POST', body });
        setMessage(`Producto "${body.name}" agregado.`);
      }
      formElement.reset();
      await load();
    } catch (caught) { setError(errorMessage(caught)); }
  }

  async function remove(product: Producto) {
    if (!window.confirm(`¿Eliminar "${product.name}"? Esta acción no se puede deshacer.`)) return;
    setError(''); setMessage('');
    try { await api(`/products/${product.id}`, { method: 'DELETE' }); setMessage(`Producto "${product.name}" eliminado.`); await load(); }
    catch (caught) { setError(errorMessage(caught)); }
  }

  const visible = items.filter((item) => item.name.toLowerCase().includes(filter.trim().toLowerCase()));

  return (
    <>
      <h1>Productos</h1>
      <p className="muted">Catálogo del negocio. Se sincroniza con la app del celular.{!isOwner && ' Como empleado puedes agregar productos; editar y eliminar es solo para el propietario.'}</p>
      <section className="card" aria-labelledby="form-title">
        <h2 id="form-title">{editing ? `Editar: ${editing.name}` : 'Agregar producto'}</h2>
        <form className="inline-form" onSubmit={save} key={editing?.id ?? 'nuevo'}>
          <label>Nombre<input name="name" required maxLength={160} defaultValue={editing?.name} /></label>
          <label>Unidad<input name="unit" required maxLength={40} defaultValue={editing?.unit ?? 'unidad'} /></label>
          <label>Precio (Bs)<input name="salePrice" required inputMode="decimal" pattern="^\d{1,10}([.,]\d{1,2})?$" defaultValue={editing?.salePrice} /></label>
          <div className="actions">
            <button type="submit">{editing ? 'Guardar cambios' : 'Agregar'}</button>
            {editing && <button type="button" className="ghost" onClick={() => setEditing(null)}>Cancelar</button>}
          </div>
        </form>
        <p className="ok" role="status" aria-live="polite">{message}</p>
        <p className="error" role="alert">{error}</p>
      </section>
      <section aria-labelledby="lista">
        <div className="row-between">
          <h2 id="lista">Lista ({visible.length})</h2>
          <label className="search">Buscar<input type="search" value={filter} onChange={(event) => setFilter(event.target.value)} /></label>
        </div>
        {visible.length === 0 ? <p className="empty">No hay productos que mostrar.</p> : (
          <div className="table-wrap">
            <table>
              <caption className="sr-only">Productos del negocio</caption>
              <thead><tr><th scope="col">Producto</th><th scope="col">Unidad</th><th scope="col" className="num">Precio</th>{isOwner && <th scope="col">Acciones</th>}</tr></thead>
              <tbody>
                {visible.map((item) => (
                  <tr key={item.id}>
                    <td>{item.name}</td>
                    <td>{item.unit}</td>
                    <td className="num">{bs(item.salePrice)}</td>
                    {isOwner && (
                      <td className="row-actions">
                        <button type="button" className="ghost" onClick={() => { setEditing(item); window.scrollTo({ top: 0, behavior: 'smooth' }); }} aria-label={`Editar ${item.name}`}>Editar</button>
                        <button type="button" className="danger" onClick={() => void remove(item)} aria-label={`Eliminar ${item.name}`}>Eliminar</button>
                      </td>
                    )}
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
