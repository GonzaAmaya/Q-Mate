import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const configured = Boolean(url && key);
export const supabase = createClient(url || "http://localhost", key || "sin-configurar");

export const CATEGORIES = ["Mates", "Termos", "Bombillas", "Yerbas", "Combos", "Canastas" ,"Accesorios"];
export const money = (n) => "$" + Number(n || 0).toLocaleString("es-AR");
