// Mercado Pago avisa acá cuando cambia el estado de un pago.
// No confiamos en lo que llega: consultamos el pago directamente a Mercado Pago.
// Deploy con: supabase functions deploy mp-webhook --no-verify-jwt
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    let id = url.searchParams.get("data.id") || url.searchParams.get("id");
    let type = url.searchParams.get("type") || url.searchParams.get("topic");
    if (!id) {
      try { const b = await req.json(); id = b?.data?.id ?? null; type = type ?? b?.type ?? null; } catch { /* sin body */ }
    }
    if (!id || (type && type !== "payment")) return new Response("ok");

    const r = await fetch(`https://api.mercadopago.com/v1/payments/${id}`, {
      headers: { Authorization: `Bearer ${Deno.env.get("MP_ACCESS_TOKEN")}` },
    });
    if (!r.ok) return new Response("payment not found", { status: 404 });
    const pay = await r.json();

    const orderId = Number(pay.external_reference);
    if (!Number.isInteger(orderId)) return new Response("ok");

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: order } = await sb.from("orders").select("id,total,status").eq("id", orderId).single();
    if (!order) return new Response("ok");

    if (pay.status === "approved" && Number(pay.transaction_amount) >= order.total) {
      await sb.rpc("confirm_order", { p_order: orderId, p_mp: String(id) });
    } else if (pay.status === "rejected" || pay.status === "cancelled") {
      await sb.from("orders").update({ status: "rechazado", mp_payment_id: String(id) })
        .eq("id", orderId).eq("status", "pendiente");
    }
    return new Response("ok");
  } catch (e) {
    console.error(e);
    return new Response("error", { status: 500 });
  }
});
