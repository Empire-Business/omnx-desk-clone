-- Fecha as tabelas de backup que estavam abertas na API pública.
--
-- O que havia: as tabelas `_backup_*` (snapshots de 05/08) nasceram de um
-- `create table as select`, que NÃO herda RLS nem os grants da tabela de origem.
-- Ficaram sem RLS e com SELECT/INSERT/UPDATE/DELETE/TRUNCATE concedidos a `anon`
-- e `authenticated`. Como a chave `anon` é pública por definição (vai no bundle do
-- frontend), qualquer pessoa na internet lia — e podia APAGAR — o conteúdo delas,
-- sem login. Havia ali nome, CPF/CNPJ, e-mail, WhatsApp e valores de contrato de
-- clientes reais.
--
-- Nada no app lê essas tabelas: elas aparecem apenas no types.ts gerado. Por isso
-- revogar não quebra tela nenhuma.
--
-- A escolha foi preservar os dados (podem ser necessários para conferência) e
-- tirar só o acesso. Com RLS ligada e nenhuma policy, a tabela fica invisível
-- para anon e authenticated; a service_role continua enxergando, por definição.
-- Quando não forem mais necessárias, o certo é dar DROP.
--
-- Vale como regra geral: toda tabela criada por `create table as select` neste
-- banco precisa de `enable row level security` explícito no mesmo commit.

do $$
declare
  t text;
begin
  for t in
    select tablename from pg_tables
    where schemaname = 'public' and left(tablename, 7) = '_backup'
  loop
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;
