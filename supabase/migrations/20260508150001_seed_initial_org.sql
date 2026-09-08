-- =====================================================================
-- Fase 1.2 — Seed inicial: tenant default + áreas/subáreas/cargos
-- =====================================================================
-- Idempotente (ON CONFLICT DO NOTHING). Pode rodar novamente sem efeito.
--
-- ⚠ TENANT DEFAULT: usa UUID placeholder fixo. Quando a fusão com
-- empire-manager acontecer, basta atualizar `tenants.id` (ou criar nova
-- migration de UPDATE) pra alinhar com o tenant correspondente do empire.
-- Todos os FKs em cascata seguem.
-- =====================================================================

DO $$
DECLARE
  v_tenant_id   UUID := '00000000-0000-0000-0000-000000000001';

  -- areas
  v_area_atend  UUID := '00000000-0000-0000-0001-000000000001';
  v_area_cob    UUID := '00000000-0000-0000-0001-000000000002';
  v_area_gestao UUID := '00000000-0000-0000-0001-000000000003';

  -- subareas
  v_sub_suporte UUID := '00000000-0000-0000-0002-000000000001';
  v_sub_estrat  UUID := '00000000-0000-0000-0002-000000000002';
  v_sub_cob     UUID := '00000000-0000-0000-0002-000000000003';
  v_sub_admin   UUID := '00000000-0000-0000-0002-000000000004';

  -- positions
  v_pos_admin       UUID := '00000000-0000-0000-0003-000000000001';
  v_pos_gerente     UUID := '00000000-0000-0000-0003-000000000002';
  v_pos_estrat      UUID := '00000000-0000-0000-0003-000000000003';
  v_pos_atendente   UUID := '00000000-0000-0000-0003-000000000004';
  v_pos_agente_chat UUID := '00000000-0000-0000-0003-000000000005';
  v_pos_agente_cob  UUID := '00000000-0000-0000-0003-000000000006';
  v_pos_gerente_cob UUID := '00000000-0000-0000-0003-000000000007';
BEGIN
  -- ── tenant default ────────────────────────────────────────────
  INSERT INTO public.tenants (id, name, slug)
  VALUES (v_tenant_id, 'Aliança de Alto Valor', 'aliancadealtovalor')
  ON CONFLICT (id) DO NOTHING;

  -- ── áreas ─────────────────────────────────────────────────────
  -- Empire-manager exige type ∈ (acquisition, delivery, operation) com UNIQUE(tenant_id, type).
  -- Mapeamento semântico para o omnx-desk:
  --   Atendimento → acquisition (área que atende quem chega)
  --   Cobrança    → operation   (operação financeira)
  --   Gestão      → delivery    (entrega de gestão/estratégia)
  INSERT INTO public.company_areas (id, tenant_id, name, type, position, color, sort_order) VALUES
    (v_area_atend,  v_tenant_id, 'Atendimento', 'acquisition', 'left',   '#3b82f6', 1),
    (v_area_cob,    v_tenant_id, 'Cobrança',    'operation',   'right',  '#f59e0b', 2),
    (v_area_gestao, v_tenant_id, 'Gestão',      'delivery',    'bottom', '#8b5cf6', 3)
  ON CONFLICT (tenant_id, type) DO NOTHING;

  -- ── subáreas ──────────────────────────────────────────────────
  INSERT INTO public.subareas (id, tenant_id, area_id, name, color, sort_order) VALUES
    (v_sub_suporte, v_tenant_id, v_area_atend,  'Suporte',       '#3b82f6', 1),
    (v_sub_estrat,  v_tenant_id, v_area_atend,  'Estratégia',    '#06b6d4', 2),
    (v_sub_cob,     v_tenant_id, v_area_cob,    'Cobrança',      '#f59e0b', 1),
    (v_sub_admin,   v_tenant_id, v_area_gestao, 'Administração', '#8b5cf6', 1)
  ON CONFLICT (id) DO NOTHING;

  -- ── positions (cargos) ────────────────────────────────────────
  -- level: 0=topo (admin), 1=gerência, 2=operacional
  -- reports_to_id: gerentes reportam ao admin; operacionais ao gerente da área
  INSERT INTO public.positions
    (id, tenant_id, subarea_id, area_id, title, description, level, sort_order)
  VALUES
    (v_pos_admin,       v_tenant_id, v_sub_admin,   v_area_gestao,
     'Administrador do Sistema', 'Acesso total à plataforma e configurações', 0, 1),

    (v_pos_gerente,     v_tenant_id, v_sub_admin,   v_area_gestao,
     'Gerente Geral',    'Gestão operacional e supervisão de equipes',         1, 2),

    (v_pos_estrat,      v_tenant_id, v_sub_estrat,  v_area_atend,
     'Estrategista',     'Define estratégia e acompanha contas estratégicas',  2, 1),

    (v_pos_atendente,   v_tenant_id, v_sub_suporte, v_area_atend,
     'Atendente',        'Atendimento geral aos clientes',                     2, 2),

    (v_pos_agente_chat, v_tenant_id, v_sub_suporte, v_area_atend,
     'Agente de Chat',   'Atendimento via WhatsApp e canais de chat',          2, 3),

    (v_pos_agente_cob,  v_tenant_id, v_sub_cob,     v_area_cob,
     'Agente de Cobrança', 'Operação de cobrança e contato com clientes',      2, 1),

    (v_pos_gerente_cob, v_tenant_id, v_sub_cob,     v_area_cob,
     'Gerente de Cobrança', 'Gestão da equipe de cobrança',                    1, 2)
  ON CONFLICT (id) DO NOTHING;

  -- ── hierarquia (reports_to_id em UPDATE separado pra respeitar trigger anti-ciclo) ──
  UPDATE public.positions SET reports_to_id = v_pos_admin
    WHERE id IN (v_pos_gerente, v_pos_gerente_cob) AND reports_to_id IS NULL;

  UPDATE public.positions SET reports_to_id = v_pos_gerente
    WHERE id IN (v_pos_estrat, v_pos_atendente, v_pos_agente_chat) AND reports_to_id IS NULL;

  UPDATE public.positions SET reports_to_id = v_pos_gerente_cob
    WHERE id = v_pos_agente_cob AND reports_to_id IS NULL;
END $$;
