-- Lola: todos los datos de la app en una sola tabla (colección + id + datos)
create table if not exists public.docs (
  col text not null,
  id text not null,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (col, id)
);
alter table public.docs replica identity full;
alter table public.docs enable row level security;
drop policy if exists "solo usuarios con sesión" on public.docs;
create policy "solo usuarios con sesión" on public.docs for all to authenticated using (true) with check (true);
alter publication supabase_realtime add table public.docs;

-- Fotos de las comidas
insert into storage.buckets (id, name, public) values ('fotos', 'fotos', false) on conflict do nothing;
drop policy if exists "fotos con sesión" on storage.objects;
create policy "fotos con sesión" on storage.objects for all to authenticated using (bucket_id = 'fotos') with check (bucket_id = 'fotos');
