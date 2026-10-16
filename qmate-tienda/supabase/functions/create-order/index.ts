// Crea el pedido y, si paga con Mercado Pago, la preferencia de pago.
// Los precios se leen SIEMPRE de la base de datos, nunca del navegador.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown) =>
  new Response(JSON.stringify(b), { headers: { ...cors, "Content-Type": "application/json" } });
// Los errores de validación van con status 200 y { error } para mostrarlos fácil en la tienda.

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { items, customer, delivery, payment } = await req.json();

    if (!Array.isArray(items) || items.length === 0 || items.length > 50) return json({ error: "El carrito está vacío." });
    if (!["retiro", "envio"].includes(delivery)) return json({ error: "Elegí cómo recibir tu pedido." });
    if (!["mercadopago", "transferencia"].includes(payment)) return json({ error: "Elegí un medio de pago." });
    const name = String(customer?.name ?? "").trim();
    const phone = String(customer?.phone ?? "").trim();
    const address = String(customer?.address ?? "").trim();
    if (name.length < 2 || phone.length < 6) return json({ error: "Completá tu nombre y teléfono." });
    if (delivery === "envio" && address.length < 5) return json({ error: "Completá la dirección de entrega." });

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const qtyById = new Map<number, number>();
    for (const it of items) {
      const id = Number(it.id), qty = Math.floor(Number(it.qty));
      if (!Number.isInteger(id) || !(qty >= 1 && qty <= 50)) return json({ error: "Carrito inválido." });
      qtyById.set(id, (qtyById.get(id) ?? 0) + qty);
    }

    const { data: prods, error: pe } = await sb
      .from("products").select("id,name,price,stock").in("id", [...qtyById.keys()]).eq("active", true);
    if (pe) throw pe;
    if (!prods || prods.length !== qtyById.size) return json({ error: "Algún producto ya no está disponible." });

    const lines = prods.map((p) => ({ id: p.id, name: p.name, price: p.price, qty: qtyById.get(p.id)! }));
    for (const p of prods) {
      if (p.stock < qtyById.get(p.id)!) return json({ error: `No hay stock suficiente de "${p.name}".` });
    }

    const { data: st } = await sb.from("settings").select("key,value");
    const cfg: Record<string, string> = Object.fromEntries((st ?? []).map((r) => [r.key, r.value]));
    const subtotal = lines.reduce((a, l) => a + l.price * l.qty, 0);
    const shipping = delivery === "envio" ? Number(cfg.shipping_price ?? 0) : 0;
    const discount = payment === "transferencia"
      ? Math.round(subtotal * (Number(cfg.transfer_discount ?? 0) / 100)) : 0;
    const total = subtotal - discount + shipping;

    const { data: order, error: oe } = await sb.from("orders").insert({
      customer_name: name, phone, email: customer?.email || null,
      delivery, address: address || null, notes: customer?.notes || null,
      payment_method: payment, items: lines, subtotal, discount, shipping, total,
    }).select("id").single();
    if (oe) throw oe;

    if (payment === "transferencia") {
      return json({ orderId: order.id, total, bank_info: cfg.bank_info ?? "", whatsapp: cfg.whatsapp ?? "" });
    }

    const site = Deno.env.get("SITE_URL") ?? "";
    const mpItems = lines.map((l) => ({
      id: String(l.id), title: l.name, quantity: l.qty, unit_price: l.price, currency_id: "ARS",
    }));
    if (shipping > 0) mpItems.push({ id: "envio", title: "Envío en Córdoba", quantity: 1, unit_price: shipping, currency_id: "ARS" });

    const pref: Record<string, unknown> = {
      items: mpItems,
      external_reference: String(order.id),
      notification_url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/mp-webhook`,
      payer: { name, ...(customer?.email ? { email: customer.email } : {}) },
    };
    if (site.startsWith("https://")) {
      pref.back_urls = { success: `${site}/?pago=ok`, pending: `${site}/?pago=pendiente`, failure: `${site}/?pago=error` };
      pref.auto_return = "approved";
    }

    const r = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: { Authorization: `Bearer ${Deno.env.get("MP_ACCESS_TOKEN")}`, "Content-Type": "application/json" },
      body: JSON.stringify(pref),
    });
    const mp = await r.json();
    if (!r.ok || !mp.init_point) { console.error("MP error", mp); return json({ error: "No pudimos iniciar el pago. Probá de nuevo." }); }

    return json({ orderId: order.id, init_point: mp.init_point });
  } catch (e) {
    console.error(e);
    return json({ error: "Ocurrió un error. Probá de nuevo en unos minutos." });
  }
});
