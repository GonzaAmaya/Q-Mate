import { useState, useMemo, useEffect } from "react";
import { supabase, configured, money, CATEGORIES } from "./lib";
import "./App.css";

function Mate({ size = 120, tone = "none", line = "#EFE6D4" }) {
  return (
    <svg viewBox="0 0 120 130" width={size} height={(size * 130) / 120} aria-hidden="true"
      fill="none" stroke={line} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M34 52 C18 72 22 108 60 108 C98 108 102 72 86 52 Z" fill={tone} />
      <rect x="30" y="40" width="60" height="12" rx="6" />
      <rect x="46" y="108" width="28" height="7" rx="3" />
      <path d="M68 44 C80 30 92 22 106 14" />
      <circle cx="86" cy="28" r="3" />
    </svg>
  );
}

const loadCart = () => { try { return JSON.parse(localStorage.getItem("qm-cart")) || {}; } catch { return {}; } };
const BLANK = { name: "", phone: "", email: "", delivery: "retiro", address: "", notes: "", payment: "mercadopago" };

export default function App() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cfg, setCfg] = useState({ shipping_price: 0, transfer_discount: 0, whatsapp: "", bank_info: "" });
  const [cat, setCat] = useState("Todo");
  const [cart, setCart] = useState(loadCart);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState("cart"); // cart | checkout | done
  const [form, setForm] = useState(BLANK);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(null);
  const [banner, setBanner] = useState(null);

  // Carga de productos y ajustes
  useEffect(() => {
    if (!configured) { setLoading(false); return; }
    (async () => {
      const [p, s] = await Promise.all([
        supabase.from("products").select("*").eq("active", true)
          .order("featured", { ascending: false }).order("id", { ascending: false }),
        supabase.from("settings").select("*"),
      ]);
      setProducts(p.data || []);
      const o = Object.fromEntries((s.data || []).map((r) => [r.key, r.value]));
      setCfg({
        shipping_price: Number(o.shipping_price || 0),
        transfer_discount: Number(o.transfer_discount || 0),
        whatsapp: (o.whatsapp || "").replace(/\D/g, ""),
        bank_info: o.bank_info || "",
      });
      setLoading(false);
    })();
  }, []);

  // Vuelta desde Mercado Pago (?pago=ok | pendiente | error)
  useEffect(() => {
    const pago = new URLSearchParams(location.search).get("pago");
    if (!pago) return;
    if (pago === "ok") { setCart({}); setBanner({ t: "ok", m: "¡Pago recibido! Gracias por tu compra, te contactamos para coordinar la entrega." }); }
    if (pago === "pendiente") setBanner({ t: "ok", m: "Tu pago está pendiente de acreditación. Te avisamos cuando se confirme." });
    if (pago === "error") setBanner({ t: "err", m: "No se pudo completar el pago. Podés intentarlo de nuevo." });
    history.replaceState(null, "", location.pathname + location.hash);
  }, []);

  useEffect(() => {
    try { localStorage.setItem("qm-cart", JSON.stringify(cart)); } catch { /* ignorar */ }
  }, [cart]);

  const cats = useMemo(() => ["Todo", ...CATEGORIES.filter((c) => products.some((p) => p.category === c))], [products]);
  const list = useMemo(() => products.filter((p) => cat === "Todo" || p.category === cat), [products, cat]);

  const lines = products
    .filter((p) => cart[p.id])
    .map((p) => ({ ...p, qty: Math.min(cart[p.id], p.stock) }))
    .filter((l) => l.qty > 0);
  const count = lines.reduce((a, l) => a + l.qty, 0);
  const subtotal = lines.reduce((a, l) => a + l.qty * l.price, 0);
  const shipping = form.delivery === "envio" ? cfg.shipping_price : 0;
  const discount = form.payment === "transferencia" ? Math.round((subtotal * cfg.transfer_discount) / 100) : 0;
  const total = subtotal - discount + shipping;

  const add = (id, d = 1) => {
    const p = products.find((x) => x.id === id);
    if (!p) return;
    setCart((c) => {
      const q = Math.max(0, Math.min((c[id] || 0) + d, p.stock));
      const n = { ...c };
      if (q === 0) delete n[id]; else n[id] = q;
      return n;
    });
  };

  const go = (id) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const openCart = () => { setStep(done ? "done" : "cart"); setOpen(true); };
  const close = () => { setOpen(false); if (step === "done") { setDone(null); setStep("cart"); setForm(BLANK); } };

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError("");
    const { data, error: err } = await supabase.functions.invoke("create-order", {
      body: {
        items: lines.map((l) => ({ id: l.id, qty: l.qty })),
        customer: { name: form.name, phone: form.phone, email: form.email, address: form.address, notes: form.notes },
        delivery: form.delivery,
        payment: form.payment,
      },
    });
    setBusy(false);
    if (err || !data || data.error) { setError(data?.error || "No pudimos crear el pedido. Probá de nuevo."); return; }
    if (data.init_point) { window.location.href = data.init_point; return; }
    setDone(data); setCart({}); setStep("done");
  }

  const wa = cfg.whatsapp;

  return (
    <div className="qm">
      {banner && <div className={`qm-banner ${banner.t}`}>{banner.m}</div>}
      <div className="qm-promo">
        {cfg.transfer_discount > 0 ? `${cfg.transfer_discount}% off pagando por transferencia. ` : ""}Entregas en Córdoba capital.
      </div>

      <header className="qm-head">
        <div>
          <div className="qm-brand"><Mate size={30} />Q' Mate</div>
          <nav className="qm-nav" aria-label="Principal">
            <button onClick={() => go("tienda")}>Tienda</button>
            <button onClick={() => go("nosotros")}>Nosotros</button>
            <button onClick={() => go("contacto")}>Contacto</button>
          </nav>
          <button className="qm-cartbtn" onClick={openCart}>Carrito ({count})</button>
        </div>
      </header>

      <section className="qm-hero">
        <div>
          <div>
            <h1>El mate de todos los días, bien elegido.</h1>
            <p>Mates, bombillas, termos y yerbas seleccionados para acompañarte en la mañana, en el estudio y en la ruta.</p>
            <button className="qm-cta" onClick={() => go("tienda")}>Ver la tienda</button>
          </div>
          <div className="art"><Mate size={280} /></div>
        </div>
      </section>

      <section className="qm-sec" id="tienda">
        <h2>Lo que más se lleva</h2>
        {!configured && <p className="qm-err">Falta conectar la base de datos. Revisá el archivo .env (ver README).</p>}
        {loading && configured && <p>Cargando productos...</p>}
        {!loading && configured && products.length === 0 && <p>Pronto vamos a cargar productos nuevos.</p>}
        <div className="qm-chips" role="group" aria-label="Categorías">
          {cats.map((c) => (
            <button key={c} className="qm-chip" aria-pressed={cat === c} onClick={() => setCat(c)}>{c}</button>
          ))}
        </div>
        <div className="qm-grid">
          {list.map((p) => (
            <article className="qm-card" key={p.id}>
              <div className={`pic ${p.image_url ? "has" : ""}`}>
                {p.image_url ? <img src={p.image_url} alt={p.name} loading="lazy" /> : <Mate size={110} />}
                {p.stock <= 0 && <span className="qm-soldout">Sin stock</span>}
              </div>
              <div className="body">
                <span className="cat">{p.category}</span>
                <h3 style={{ fontWeight: 400, fontSize: "1.05rem" }}>{p.name}</h3>
                {p.description && <span className="cat">{p.description}</span>}
                <span className="price">{money(p.price)}</span>
                {cfg.transfer_discount > 0 && (
                  <span className="sub">{money(Math.round(p.price * (1 - cfg.transfer_discount / 100)))} por transferencia</span>
                )}
                <button className="qm-add" disabled={p.stock <= 0} onClick={() => { add(p.id); setStep("cart"); setOpen(true); }}>
                  {p.stock <= 0 ? "Sin stock" : "Agregar al carrito"}
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="qm-about" id="nosotros">
        <div>
          <div>
            <h2>Una casa matera hecha para quedarse.</h2>
          </div>
          <p>Nacimos con una idea simple: que el mate que elegís te dure años y se parezca a vos. Trabajamos con calabazas curadas, cerámica y acero de buena terminación, y te ayudamos a curar y cuidar cada pieza.</p>
        </div>
      </section>

      <section className="qm-sec">
        <div className="qm-perks">
          <div><b style={{ fontWeight: 400, fontSize: "1.1rem" }}>Pagá como quieras</b><br />Mercado Pago, tarjetas o transferencia.</div>
          <div><b style={{ fontWeight: 400, fontSize: "1.1rem" }}>Entrega en Córdoba</b><br />Retirá en el local o recibilo en tu casa.</div>
          <div><b style={{ fontWeight: 400, fontSize: "1.1rem" }}>Atención personalizada</b><br />Te ayudamos a elegir y a curar tu mate.</div>
        </div>
      </section>

      <section className="qm-sec" style={{ paddingTop: 0 }} id="contacto">
        <h2>Contacto</h2>
        <p>¿Dudas o querés un mate personalizado? Escribinos{wa ? " por WhatsApp" : ""} y te respondemos enseguida.</p>
        {wa && <p style={{ marginTop: "1rem" }}><a className="qm-cta" style={{ display: "inline-block", textDecoration: "none", background: "var(--ink)", color: "var(--cream)" }} href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer">Abrir WhatsApp</a></p>}
      </section>

      <footer className="qm-foot">
        <div>
          <div><b>Q' Mate</b><br />Mates, bombillas y más.<br />Córdoba, Argentina.</div>
          <div><b>Defensa del consumidor</b><br />
            <a className="qm-link" href="https://www.argentina.gob.ar/produccion/defensadelconsumidor/formulario" target="_blank" rel="noreferrer">Para reclamos ingresá acá</a><br />
            {wa && <a className="qm-link" href={`https://wa.me/${wa}?text=${encodeURIComponent("Hola, quiero usar el botón de arrepentimiento. Mi pedido es: ")}`} target="_blank" rel="noreferrer">Botón de arrepentimiento</a>}
          </div>
        </div>
      </footer>

      {wa && <a className="qm-wa" href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer">WhatsApp</a>}

      {open && (
        <>
          <div className="qm-scrim" onClick={close} />
          <aside className="qm-drawer" aria-label="Carrito">
            <header>
              {step === "checkout" ? "Tus datos" : step === "done" ? "Pedido recibido" : "Tu carrito"}
              <button onClick={close} aria-label="Cerrar">Cerrar</button>
            </header>

            {step === "cart" && (
              <>
                <div className="qm-items">
                  {lines.length === 0 && <p>Todavía no agregaste productos.</p>}
                  {lines.map((l) => (
                    <div className="qm-item" key={l.id}>
                      <div className="t">{l.image_url ? <img src={l.image_url} alt="" style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 8 }} /> : <Mate size={34} />}</div>
                      <div>
                        <div style={{ fontSize: ".92rem" }}>{l.name}</div>
                        <div className="qm-qty">
                          <button onClick={() => add(l.id, -1)} aria-label="Quitar uno">-</button>
                          {l.qty}
                          <button onClick={() => add(l.id, 1)} aria-label="Agregar uno" disabled={l.qty >= l.stock}>+</button>
                        </div>
                      </div>
                      <div>{money(l.price * l.qty)}</div>
                    </div>
                  ))}
                </div>
                <div className="qm-tot"><span>Subtotal</span><span>{money(subtotal)}</span></div>
                {lines.length > 0 && (
                  <button className="qm-cta" style={{ marginTop: "1rem", background: "var(--ink)", color: "var(--cream)" }} onClick={() => setStep("checkout")}>
                    Continuar con la compra
                  </button>
                )}
              </>
            )}

            {step === "checkout" && (
              <form className="qm-form" onSubmit={submit}>
                <label>Nombre y apellido<input required value={form.name} onChange={set("name")} autoComplete="name" /></label>
                <label>Teléfono<input required type="tel" value={form.phone} onChange={set("phone")} autoComplete="tel" /></label>
                <label>Email (opcional)<input type="email" value={form.email} onChange={set("email")} autoComplete="email" /></label>

                <label className="qm-radio"><input type="radio" name="d" checked={form.delivery === "retiro"} onChange={() => setForm({ ...form, delivery: "retiro" })} />Retiro en el local (gratis)</label>
                <label className="qm-radio"><input type="radio" name="d" checked={form.delivery === "envio"} onChange={() => setForm({ ...form, delivery: "envio" })} />Envío en Córdoba capital ({money(cfg.shipping_price)})</label>
                {form.delivery === "envio" && (
                  <label>Dirección y barrio<input required value={form.address} onChange={set("address")} autoComplete="street-address" /></label>
                )}
                <span className="qm-note">Por ahora solo hacemos envíos dentro de Córdoba capital.</span>

                <label className="qm-radio"><input type="radio" name="p" checked={form.payment === "mercadopago"} onChange={() => setForm({ ...form, payment: "mercadopago" })} />Mercado Pago (tarjetas y cuotas)</label>
                <label className="qm-radio"><input type="radio" name="p" checked={form.payment === "transferencia"} onChange={() => setForm({ ...form, payment: "transferencia" })} />Transferencia{cfg.transfer_discount > 0 ? ` (${cfg.transfer_discount}% off)` : ""}</label>

                <label>Notas (opcional)<textarea rows={2} value={form.notes} onChange={set("notes")} /></label>

                <div className="qm-sum">
                  <div><span>Subtotal</span><span>{money(subtotal)}</span></div>
                  {discount > 0 && <div><span>Descuento transferencia</span><span>-{money(discount)}</span></div>}
                  {shipping > 0 && <div><span>Envío</span><span>{money(shipping)}</span></div>}
                  <div className="big"><span>Total</span><span>{money(total)}</span></div>
                </div>
                {error && <div className="qm-err" role="alert">{error}</div>}
                <button className="qm-cta" disabled={busy} style={{ background: "var(--ink)", color: "var(--cream)" }}>
                  {busy ? "Procesando..." : form.payment === "mercadopago" ? "Pagar con Mercado Pago" : "Confirmar pedido"}
                </button>
                <button type="button" className="qm-link" onClick={() => setStep("cart")}>Volver al carrito</button>
              </form>
            )}

            {step === "done" && done && (
              <div className="qm-form">
                <p>Tu pedido <b>#{done.orderId}</b> quedó registrado.</p>
                <p>Transferí <b>{money(done.total)}</b> a:</p>
                <div className="qm-radio" style={{ whiteSpace: "pre-line" }}>{done.bank_info}</div>
                <p className="qm-note">Cuando acredite el pago, lo confirmamos y coordinamos la entrega. Enviá el comprobante por WhatsApp para agilizarlo.</p>
                {done.whatsapp && (
                  <a className="qm-cta" style={{ textAlign: "center", textDecoration: "none", background: "var(--ink)", color: "var(--cream)" }}
                    href={`https://wa.me/${done.whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(`Hola! Hice el pedido #${done.orderId} y pagué por transferencia. Te paso el comprobante.`)}`}
                    target="_blank" rel="noreferrer">Enviar comprobante</a>
                )}
              </div>
            )}
          </aside>
        </>
      )}
    </div>
  );
}
