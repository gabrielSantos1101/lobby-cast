-- Presença de espectadores (contador ao vivo)
-- Execute este arquivo no SQL Editor do seu projeto Supabase.

create table if not exists public.presence (
	stream_id text not null,
	viewer_id text not null,
	last_seen bigint not null,
	primary key (stream_id, viewer_id)
);

create index if not exists presence_stream_seen_idx
	on public.presence (stream_id, last_seen);

alter table public.presence enable row level security;

create policy "presence_insert"
	on public.presence for insert
	to anon
	with check (true);

create policy "presence_update"
	on public.presence for update
	to anon
	using (true)
	with check (true);

create policy "presence_select"
	on public.presence for select
	to anon
	using (true);

create policy "presence_delete"
	on public.presence for delete
	to anon
	using (true);

-- Início das transmissões (tempo de live visível para todos)
create table if not exists public.streams (
	stream_id text primary key,
	started_at bigint not null
);

alter table public.streams enable row level security;

create policy "streams_insert"
	on public.streams for insert
	to anon
	with check (true);

create policy "streams_update"
	on public.streams for update
	to anon
	using (true)
	with check (true);

create policy "streams_select"
	on public.streams for select
	to anon
	using (true);
