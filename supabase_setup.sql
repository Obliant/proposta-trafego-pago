-- Tabela que guarda o texto editado da proposta de trafego pago.
-- Rodar uma vez no SQL Editor do Supabase (projeto Obliant-Prod).

create table if not exists proposta_conteudo (
  id          text primary key,
  html        text,
  updated_by  text,
  updated_at  timestamptz default now()
);

alter table proposta_conteudo enable row level security;

drop policy if exists "leitura publica"    on proposta_conteudo;
drop policy if exists "insercao publica"   on proposta_conteudo;
drop policy if exists "atualizacao publica" on proposta_conteudo;

create policy "leitura publica"     on proposta_conteudo for select using (true);
create policy "insercao publica"    on proposta_conteudo for insert with check (true);
create policy "atualizacao publica" on proposta_conteudo for update using (true);
