import { useState, useEffect, useCallback } from "react";
import { supabase, configured, CATEGORIES, money } from "./lib";
import "./App.css";

const BLANK = { name: "", category: CATEGORIES[0], price: "", stock: "", description: "", featured: false, active: true, image_url: "" };

// Achica la foto (máx. 1000px) para que la tienda cargue rápido aunque se suban fotos del celular
async function shrink(file, max = 1000) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((res) => c.toBlob(res, "image/jpeg", 0.85));
}

function Login() {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  async function enter(e) {
    e.preventDefault();
    const { error } = await supabase.auth.signInWithPassword({ email, password: pass });
    if (error) setErr("Email o contraseña incorrectos.");
  }
  return (
    <div className="qa">
      <form className="qa-login" onSubmit={enter}>
        <h1>Panel de Q' Mate</h1>
        {!configured && <div className="qa-msg err">Falta configurar el archivo .env</div>}
        <input type="email" required placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
        <input type="password" required placeholder="Contraseña" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="current-password" />
        {err && <div className="qa-msg err">{err}</div>}
        <button className="qa-btn">Entrar</button>
      </form>
    </div>
  );
}

function Products() {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(null);
  const [file, setFile] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from("products").select("*").order("id", { ascending: false });
    setRows(data || []);
  }, []);
  useEffect(() => { load(); }, [load]);

  const flash = (t, m) => { setMsg({ t, m }); setTimeout(() => setMsg(null), 4000); };
  const edit = (p) => { setForm({ ...p, price: String(p.price), stock: String(p.stock) }); setFile(null); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    let image_url = form.image_url || null;
    if (file) {
      const blob = await shrink(file);
      const path = `${Date.now()}.jpg`;
      const up = await supabase.storage.from("products").upload(path, blob, { contentType: "image/jpeg" });
      if (up.error) { setBusy(false); return flash("err", "No se pudo subir la foto: " + up.error.message); }
      image_url = supabase.storage.from("products").getPublicUrl(path).data.publicUrl;
    }
    const row = {
      name: form.name.trim(), category: form.category, description: form.description,
      price: parseInt(form.price, 10) || 0, stock: parseInt(form.stock, 10) || 0,
      featured: form.featured, active: form.active, image_url,
    };
    const { error } = form.id
      ? await supabase.from("products").update(row).eq("id", form.id)
      : await supabase.from("products").insert(row);
    setBusy(false);
    if (error) return flash("err", error.message);
    flash("ok", form.id ? "Producto actualizado." : "Producto creado.");
    setForm(null); setFile(null); load();
  }

  async function toggle(p) {
    await supabase.from("products").update({ active: !p.active }).eq("id", p.id);
    load();
  }
  async function remove(p) {
    if (!confirm(`¿Eliminar "${p.name}"? Esta acción no se puede deshacer.`)) return;
    const { error } = await supabase.from("products").delete().eq("id", p.id);
    if (error) return flash("err", error.message);
    flash("ok", "Producto eliminado."); load();
  }

  return (
    <>
      {msg && <div className={`qa-msg ${msg.t === "err" ? "err" : ""}`}>{msg.m}</div>}
      {!form && <p><button className="qa-btn" onClick={() => setForm({ ...BLANK })}>+ Agregar producto</button></p>}

      {form && (
        <form className="qa-form" onSubmit={save}>
          <label className="full">Nombre<input required value={form.name} onChange={set("name")} /></label>
          <label>Categoría
            <select value={form.category} onChange={set("category")}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
          </label>
          <label>Precio (pesos)<input required type="number" min="0" value={form.price} onChange={set("price")} /></label>
          <label>Stock (unidades)<input required type="number" min="0" value={form.stock} onChange={set("stock")} /></label>
          <label>Foto<input type="file" accept="image/*" onChange={(e) => setFile(e.target.files[0] || null)} /></label>
          <label className="full">Descripción<textarea rows={2} value={form.description} onChange={set("description")} /></label>
          <label className="qa-row"><input type="checkbox" checked={form.featured} onChange={set("featured")} /> Destacado (aparece primero)</label>
          <label className="qa-row"><input type="checkbox" checked={form.active} onChange={set("active")} /> Visible en la tienda</label>
          <div className="full qa-row">
            <button className="qa-btn" disabled={busy}>{busy ? "Guardando..." : "Guardar"}</button>
            <button type="button" className="qa-btn ghost" onClick={() => { setForm(null); setFile(null); }}>Cancelar</button>
            {form.image_url && !file && <small>Ya tiene foto. Elegí otra para reemplazarla.</small>}
          </div>
        </form>
      )}

      {rows.length === 0 && <p>Todavía no hay productos.</p>}
      {rows.map((p) => (
        <div className="qa-card" key={p.id}>
          {p.image_url ? <img src={p.image_url} alt="" /> : <div className="qa-ph" />}
          <div>
            <b>{p.name}</b> <span className={`qa-pill ${p.active ? "ok" : "off"}`}>{p.active ? "Visible" : "Oculto"}</span>
            {p.stock <= 0 && <> <span className="qa-pill off">Sin stock</span></>}
            <div>{p.category} · {money(p.price)} · Stock: {p.stock}</div>
          </div>
          <div className="qa-row">
            <button className="qa-btn ghost" onClick={() => edit(p)}>Editar</button>
            <button className="qa-btn ghost" onClick={() => toggle(p)}>{p.active ? "Ocultar" : "Mostrar"}</button>
            <button className="qa-btn danger" onClick={() => remove(p)}>Eliminar</button>
          </div>
        </div>
      ))}
    </>
  );
}

function Orders() {
  const [rows, setRows] = useState([]);
  const load = useCallback(async () => {
    const { data } = await supabase.from("orders").select("*").order("id", { ascending: false }).limit(100);
    setRows(data || []);
  }, []);
  useEffect(() => { load(); }, [load]);

  const markPaid = async (o) => { await supabase.rpc("confirm_order", { p_order: o.id }); load(); };
  const setStatus = async (o, status) => { await supabase.from("orders").update({ status }).eq("id", o.id); load(); };

  return (
    <>
      <p><button className="qa-btn ghost" onClick={load}>Actualizar</button></p>
      {rows.length === 0 && <p>Todavía no hay pedidos.</p>}
      {rows.map((o) => (
        <div className="qa-order" key={o.id}>
          <div className="qa-row">
            <b>Pedido #{o.id}</b>
            <span className={`qa-pill ${["pagado", "entregado"].includes(o.status) ? "ok" : ["rechazado", "cancelado"].includes(o.status) ? "off" : ""}`}>{o.status}</span>
            <small>{new Date(o.created_at).toLocaleString("es-AR")}</small>
          </div>
          <div>
            {o.customer_name} · <a href={`https://wa.me/${o.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer">{o.phone}</a>
            {o.email && <> · {o.email}</>}
          </div>
          <div>{o.delivery === "envio" ? `Envío a: ${o.address}` : "Retira en el local"}{o.notes && <> · Nota: {o.notes}</>}</div>
          <ul style={{ margin: 0, paddingLeft: "1.2rem" }}>
            {o.items.map((i) => <li key={i.id}>{i.qty} x {i.name} ({money(i.price * i.qty)})</li>)}
          </ul>
          <div><b>Total {money(o.total)}</b> · {o.payment_method === "mercadopago" ? "Mercado Pago" : "Transferencia"}</div>
          <div className="qa-row">
            {o.status === "pendiente" && o.payment_method === "transferencia" && <button className="qa-btn" onClick={() => markPaid(o)}>Confirmar pago recibido</button>}
            {o.status === "pagado" && <button className="qa-btn" onClick={() => setStatus(o, "entregado")}>Marcar entregado</button>}
            {["pendiente", "rechazado"].includes(o.status) && <button className="qa-btn ghost" onClick={() => setStatus(o, "cancelado")}>Cancelar</button>}
          </div>
        </div>
      ))}
    </>
  );
}

const FIELDS = [
  ["shipping_price", "Precio del envío en Córdoba (pesos)", "number"],
  ["transfer_discount", "Descuento por transferencia (%)", "number"],
  ["whatsapp", "WhatsApp (solo números, ej: 5493515551234)", "text"],
  ["bank_info", "Datos para transferencia (titular, CBU, alias)", "area"],
];

function Settings() {
  const [vals, setVals] = useState({});
  const [msg, setMsg] = useState("");
  useEffect(() => {
    supabase.from("settings").select("*").then(({ data }) =>
      setVals(Object.fromEntries((data || []).map((r) => [r.key, r.value]))));
  }, []);
  async function save(e) {
    e.preventDefault();
    const rows = FIELDS.map(([k]) => ({ key: k, value: String(vals[k] ?? "") }));
    const { error } = await supabase.from("settings").upsert(rows);
    setMsg(error ? error.message : "Ajustes guardados.");
  }
  return (
    <form className="qa-form" onSubmit={save}>
      {FIELDS.map(([k, label, type]) => (
        <label className="full" key={k}>{label}
          {type === "area"
            ? <textarea rows={4} value={vals[k] ?? ""} onChange={(e) => setVals({ ...vals, [k]: e.target.value })} />
            : <input type={type} value={vals[k] ?? ""} onChange={(e) => setVals({ ...vals, [k]: e.target.value })} />}
        </label>
      ))}
      <div className="full qa-row"><button className="qa-btn">Guardar ajustes</button>{msg && <small>{msg}</small>}</div>
    </form>
  );
}

export default function Admin() {
  const [session, setSession] = useState(undefined);
  const [tab, setTab] = useState("productos");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  if (session === undefined) return <div className="qa">Cargando...</div>;
  if (!session) return <Login />;

  return (
    <div className="qa">
      <div className="qa-top">
        <h1>Panel de Q' Mate</h1>
        <div className="qa-row">
          <a className="qa-btn ghost" href="#/" style={{ textDecoration: "none" }}>Ver tienda</a>
          <button className="qa-btn" onClick={() => supabase.auth.signOut()}>Salir</button>
        </div>
      </div>
      <div className="qa-tabs">
        {[["productos", "Productos"], ["pedidos", "Pedidos"], ["ajustes", "Ajustes"]].map(([k, l]) => (
          <button key={k} className="qa-btn ghost" aria-pressed={tab === k} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      {tab === "productos" && <Products />}
      {tab === "pedidos" && <Orders />}
      {tab === "ajustes" && <Settings />}
    </div>
  );
}
