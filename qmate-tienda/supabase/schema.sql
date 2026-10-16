-- Q' Mate: ejecutar completo en Supabase > SQL Editor

create table products (
  id bigint generated always as identity primary key,
  name text not null,
  category text not null,
  price integer not null check (price >= 0),
  description text not null default '',
  image_url text,
  stock integer not null default 0 check (stock >= 0),
  featured boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table orders (
  id bigint generated always as identity primary key,
  customer_name text not null,
  phone text not null,
  email text,
  delivery text not null check (delivery in ('retiro', 'envio')),
  address text,
  notes text,
  payment_method text not null check (payment_method in ('mercadopago', 'transferencia')),
  items jsonb not null,
  subtotal integer not null,
  discount integer not null default 0,
  shipping integer not null default 0,
  total integer not null,
  status text not null default 'pendiente'
    check (status in ('pendiente', 'pagado', 'entregado', 'rechazado', 'cancelado')),
  mp_payment_id text,
  created_at timestamptz not null default now()
);

create table settings (key text primary key, value text not null);
insert into settings (key, value) values
  ('shipping_price', '3000'),
  ('transfer_discount', '15'),
  ('whatsapp', '5493510000000'),
  ('bank_info', 'Titular: Q'' Mate' || E'\n' || 'CBU: 0000000000000000000000' || E'\n' || 'Alias: qmate.mates');

-- Seguridad: el público solo lee productos activos y ajustes.
-- Todo lo demás lo puede hacer únicamente el dueño (usuario logueado).
alter table products enable row level security;
alter table orders enable row level security;
alter table settings enable row level security;

create policy "publico ve productos activos" on products for select using (active = true);
create policy "dueno ve todos los productos" on products for select to authenticated using (true);
create policy "dueno crea productos" on products for insert to authenticated with check (true);
create policy "dueno edita productos" on products for update to authenticated using (true) with check (true);
create policy "dueno borra productos" on products for delete to authenticated using (true);

create policy "dueno ve pedidos" on orders for select to authenticated using (true);
create policy "dueno edita pedidos" on orders for update to authenticated using (true) with check (true);

create policy "publico ve ajustes" on settings for select using (true);
create policy "dueno crea ajustes" on settings for insert to authenticated with check (true);
create policy "dueno edita ajustes" on settings for update to authenticated using (true) with check (true);

-- Confirmar un pedido pagado y descontar stock (lo usa el webhook y el panel)
create or replace function confirm_order(p_order bigint, p_mp text default null)
returns void language plpgsql security definer set search_path = public as $$
declare o orders; it jsonb;
begin
  select * into o from orders where id = p_order for update;
  if not found or o.status in ('pagado', 'entregado') then return; end if;
  update orders set status = 'pagado', mp_payment_id = coalesce(p_mp, mp_payment_id) where id = p_order;
  for it in select jsonb_array_elements(o.items) loop
    update products set stock = greatest(stock - (it->>'qty')::int, 0) where id = (it->>'id')::bigint;
  end loop;
end $$;
revoke all on function confirm_order(bigint, text) from public, anon;
grant execute on function confirm_order(bigint, text) to authenticated, service_role;

-- Fotos de productos
insert into storage.buckets (id, name, public) values ('products', 'products', true) on conflict do nothing;
create policy "fotos publicas" on storage.objects for select using (bucket_id = 'products');
create policy "dueno sube fotos" on storage.objects for insert to authenticated with check (bucket_id = 'products');
create policy "dueno edita fotos" on storage.objects for update to authenticated using (bucket_id = 'products');
create policy "dueno borra fotos" on storage.objects for delete to authenticated using (bucket_id = 'products');

-- Productos de ejemplo (el dueño puede borrarlos desde el panel)
insert into products (name, category, price, description, stock, featured) values
  ('Mate imperial de calabaza', 'Mates', 42000, 'Calabaza seleccionada con virola de acero. Viene curado.', 10, true),
  ('Termo de acero 1 litro', 'Termos', 58000, 'Mantiene el agua caliente más de 24 horas.', 5, false),
  ('Bombilla de alpaca', 'Bombillas', 19500, 'Alpaca trabajada a mano con filtro fino.', 12, false);
