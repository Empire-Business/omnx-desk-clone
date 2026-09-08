-- ============================================================================
-- Permissões: "ver a carteira inteira" vira regra editável (§15 do brief)
-- ============================================================================
-- Contexto: a Fase 2 migrou 19 telas para a matriz `permissoes_app`, mas 16
-- pontos ficaram no gate legado `perfil === 'admin' || perfil === 'gerente'`.
-- Eles não são gate de administração — decidem QUEM ENXERGA A CARTEIRA INTEIRA
-- (todos os clientes, todas as conversas) em vez de só o que é seu, e quem pode
-- atribuir estrategista a um cliente.
--
-- Por que não migrar direto para `clientes · editar`: esse recurso já existe e
-- vale também para estrategista e atendimento. Reaproveitá-lo ampliaria acesso
-- de verdade — o estrategista passaria a ver a carteira toda. São perguntas
-- diferentes ("pode editar cliente?" ≠ "vê os clientes de todo mundo?") e
-- precisam de linhas diferentes.
--
-- O que esta migration faz: cria dois recursos novos e os concede a admin e
-- gerente — exatamente quem já tinha. **Ninguém ganha nem perde acesso hoje.**
-- O ganho é que a regra sai do código e passa a ser editável em /admin: dar
-- visão total da carteira a um estrategista sênior deixa de exigir deploy.
--
--   clientes.carteira — ver todos os clientes / conversas, não só os atribuídos
--   clientes.atribuir — atribuir estrategista/atendimento a um cliente
--
-- Reversível: DELETE das linhas abaixo devolve o estado anterior (o front cai
-- no fallback legado quando a permissão não existe — ver usePermissoes).
-- ============================================================================

BEGIN;

-- Concede aos perfis que JÁ tinham o acesso pelo gate no código.
INSERT INTO public.permissoes_app (tenant_id, perfil, recurso, acao)
SELECT t.id, v.perfil, v.recurso, v.acao
  FROM public.tenants t
 CROSS JOIN (VALUES
    ('gerente',     'clientes.carteira', 'ver'),
    ('gerente',     'clientes.atribuir', 'editar'),
    -- `atendimento` também já enxergava a lista inteira de clientes
    -- (useClientes fazia `admin || gerente || atendimento`). Sem esta linha, a
    -- migração TIRARIA acesso de quem trabalha na fila — e o objetivo aqui é
    -- não mexer em quem vê o quê.
    ('atendimento', 'clientes.carteira', 'ver'),
    -- Conversas são um recurso SEPARADO da lista de clientes de propósito:
    -- `atendimento` via todos os clientes, mas NÃO todas as conversas (o inbox
    -- dele é filtrado). Um recurso só para os dois casos ampliaria o acesso
    -- dele ao Chat sem ninguém ter pedido.
    ('gerente',     'chat.carteira',     'ver')
 ) AS v(perfil, recurso, acao)
ON CONFLICT (tenant_id, perfil, recurso, acao) DO NOTHING;
-- admin não precisa de linha: o curinga ('*','admin') já cobre.

-- Tenant novo nasce com os mesmos dois recursos. Reescreve a função de seed
-- inteira (não dá para "acrescentar" a um corpo de função) mantendo tudo o que
-- já havia — as duas últimas linhas são a novidade.
CREATE OR REPLACE FUNCTION public.seed_permissoes_on_tenant_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  INSERT INTO public.permissoes_app (tenant_id, perfil, recurso, acao)
  SELECT NEW.id, v.perfil, v.recurso, v.acao
    FROM (VALUES
      ('admin',        '*',                    'admin'),
      ('gerente',      'dashboard',            'ver'),
      ('gerente',      'contratos',            'editar'),
      ('gerente',      'contratos.onboarding', 'editar'),
      ('gerente',      'chat',                 'editar'),
      ('gerente',      'clientes',             'editar'),
      ('gerente',      'colaboradores',        'ver'),
      ('gerente',      'cobranca',             'ver'),
      ('estrategista', 'dashboard',            'ver'),
      ('estrategista', 'clientes',             'editar'),
      ('estrategista', 'chat',                 'editar'),
      ('atendimento',  'dashboard',            'ver'),
      ('atendimento',  'clientes',             'ver'),
      ('atendimento',  'chat',                 'editar'),
      ('atendimento',  'contratos.onboarding', 'editar'),
      ('cliente',      'portal',               'ver'),
      ('admin_cobranca',  'cobranca',          'admin'),
      ('admin_cobranca',  'dashboard',         'ver'),
      ('agente_cobranca', 'cobranca',          'editar'),
      ('agente_chat',     'chat',              'editar'),
      -- Novos (06/08/2026): visão da carteira inteira e atribuição de time.
      ('gerente',      'clientes.carteira',    'ver'),
      ('gerente',      'clientes.atribuir',    'editar'),
      ('atendimento',  'clientes.carteira',    'ver'),
      ('gerente',      'chat.carteira',        'ver')
    ) AS v(perfil, recurso, acao)
  ON CONFLICT (tenant_id, perfil, recurso, acao) DO NOTHING;
  RETURN NEW;
END;
$$;

COMMIT;
