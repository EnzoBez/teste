-- =====================================================================
-- Ourosaf Gestão — esquema do banco (Supabase / PostgreSQL)
-- Cole este arquivo inteiro no "SQL Editor" do Supabase e clique em "Run".
-- Pode ser executado mais de uma vez sem perder dados.
-- =====================================================================

create extension if not exists pgcrypto;

-- Atualiza updated_at automaticamente em toda alteração
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- Empresas representadas (Rebeka e futuras)
create table if not exists public.empresas (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users(id),
  nome text not null,
  cnpj text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- Produtos de cada empresa
create table if not exists public.produtos (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users(id),
  empresa_id uuid not null references public.empresas(id),
  nome text not null,
  descricao text,
  codigo_nf text,
  palavra_chave text,
  unidades_caixa numeric not null default 1,
  ordem int not null default 0,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- Clientes (compartilhados entre empresas)
create table if not exists public.clientes (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users(id),
  cnpj text not null,
  razao_social text not null,
  nome_fantasia text,
  ie text,
  vendedor text,
  produto text,
  cep text,
  endereco text,
  numero text,
  complemento text,
  bairro text,
  cidade text,
  uf text,
  telefone text,
  email text,
  contato text,
  observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- Pedidos
create table if not exists public.pedidos (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users(id),
  numero int,
  empresa_id uuid references public.empresas(id),
  cliente_id uuid references public.clientes(id),
  cnpj text,
  cliente_nome text,
  cliente_email text,
  cidade text,
  bairro text,
  uf text,
  vendedor text,
  data_pedido date,
  data_faturamento date,
  prazo text,
  tipo text not null default 'venda',          -- venda | bonificacao | troca
  pedido_cliente text,
  transporte text,
  anotacao_canhoto text,
  observacao text,
  itens jsonb not null default '[]'::jsonb,    -- [{produto_id, caixas, valor_unitario}]
  total numeric not null default 0,
  nota text,
  canhoto boolean not null default false,
  canhoto_data date,
  destaque text,
  status text not null default 'ativo',        -- ativo | cancelado
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- Entradas de mercadoria no estoque
create table if not exists public.entradas (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users(id),
  empresa_id uuid references public.empresas(id),
  produto_id uuid references public.produtos(id),
  data date not null,
  caixas numeric not null default 0,
  nota_fornecedor text,
  fornecedor text,
  lote text,
  validade date,
  custo_unitario numeric,
  observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- Acertos de inventário (contagem física)
create table if not exists public.acertos (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users(id),
  empresa_id uuid references public.empresas(id),
  produto_id uuid references public.produtos(id),
  data date not null,
  sistema numeric not null default 0,
  contado numeric not null default 0,
  diferenca numeric not null default 0,
  motivo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- Ocorrências: cancelamentos, devoluções e trocas
create table if not exists public.ocorrencias (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users(id),
  numero int,
  empresa_id uuid references public.empresas(id),
  tipo text not null,                          -- cancelamento | devolucao | troca
  data date not null,
  pedido_id uuid references public.pedidos(id),
  cliente_id uuid references public.clientes(id),
  cnpj text,
  cliente_nome text,
  nota text,
  motivo text,
  itens jsonb not null default '[]'::jsonb,     -- [{produto_id, caixas, volta_estoque}]
  reposicao jsonb not null default '[]'::jsonb, -- [{produto_id, caixas}] (trocas)
  nota_devolucao text,
  observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- Configurações (data-base do estoque, estoque inicial etc.)
create table if not exists public.config (
  id text not null,
  owner uuid not null default auth.uid() references auth.users(id),
  valor jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (owner, id)
);

-- Atualizações de versões anteriores (seguro rodar de novo)
alter table public.pedidos add column if not exists canhoto_data date;

-- ---------------------------------------------------------------------
-- Índices, gatilhos e segurança (cada usuário só enxerga os próprios dados)
do $$
declare t text;
begin
  foreach t in array array['empresas','produtos','clientes','pedidos','entradas','acertos','ocorrencias','config'] loop
    execute format('create index if not exists %I on public.%I (owner, updated_at)', t || '_owner_upd', t);
    execute format('drop trigger if exists trg_%s_upd on public.%I', t, t);
    execute format('create trigger trg_%s_upd before update on public.%I for each row execute function public.set_updated_at()', t, t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "dono_%s" on public.%I', t, t);
    execute format('create policy "dono_%s" on public.%I for all to authenticated using (owner = auth.uid()) with check (owner = auth.uid())', t, t);
  end loop;
end $$;

create index if not exists pedidos_cnpj on public.pedidos (cnpj);
create index if not exists pedidos_nota on public.pedidos (nota);
create index if not exists clientes_cnpj on public.clientes (cnpj);
