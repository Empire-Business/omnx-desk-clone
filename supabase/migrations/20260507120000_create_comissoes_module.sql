-- =====================================================================
-- Módulo de Comissões — schema completo
-- Doc: docs/comissoes.md
-- =====================================================================

-- ----- 1. Estender users com tipo de consultor --------------------------
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS tipo_consultor TEXT
    CHECK (tipo_consultor IN ('comissao','salario_fixo')),
  ADD COLUMN IF NOT EXISTS salario_fixo_mensal NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS cnpj_cpf TEXT,
  ADD COLUMN IF NOT EXISTS ativo_comissoes BOOLEAN DEFAULT true;

-- ----- 2. produtos_comissao --------------------------------------------
CREATE TABLE IF NOT EXISTS public.produtos_comissao (
  produto_id UUID PRIMARY KEY REFERENCES public.products(id) ON DELETE CASCADE,
  percentual_padrao NUMERIC(6,3) NOT NULL DEFAULT 0,
  parcelas_padrao INT NOT NULL DEFAULT 1 CHECK (parcelas_padrao >= 1),
  observacoes TEXT,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_por UUID REFERENCES public.users(id)
);

ALTER TABLE public.produtos_comissao ENABLE ROW LEVEL SECURITY;

CREATE POLICY "produtos_comissao_select_auth" ON public.produtos_comissao
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "produtos_comissao_admin_write" ON public.produtos_comissao
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND perfil IN ('admin','gerente')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND perfil IN ('admin','gerente')));

-- ----- 3. estrategista_comissao_override -------------------------------
CREATE TABLE IF NOT EXISTS public.estrategista_comissao_override (
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  produto_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  percentual_custom NUMERIC(6,3) NOT NULL,
  PRIMARY KEY (user_id, produto_id)
);

ALTER TABLE public.estrategista_comissao_override ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ov_select_self_or_admin" ON public.estrategista_comissao_override
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND perfil IN ('admin','gerente'))
  );

CREATE POLICY "ov_admin_write" ON public.estrategista_comissao_override
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND perfil IN ('admin','gerente')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND perfil IN ('admin','gerente')));

-- ----- 4. contratos ----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contratos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  cliente_nome TEXT NOT NULL,           -- snapshot, mantém extrato estável
  produto_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  produto_nome TEXT,
  estrategista_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  data_fechamento DATE NOT NULL,
  valor_total NUMERIC(12,2) NOT NULL CHECK (valor_total >= 0),
  num_parcelas INT NOT NULL DEFAULT 1 CHECK (num_parcelas >= 1),
  percentual_aplicado NUMERIC(6,3) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo','cancelado','concluido')),
  observacoes TEXT,
  notion_page_id TEXT UNIQUE,
  criado_por UUID REFERENCES public.users(id),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contratos_estrategista ON public.contratos(estrategista_id);
CREATE INDEX IF NOT EXISTS idx_contratos_data ON public.contratos(data_fechamento);

ALTER TABLE public.contratos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contratos_select" ON public.contratos
  FOR SELECT TO authenticated
  USING (
    estrategista_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND perfil IN ('admin','gerente'))
  );

CREATE POLICY "contratos_admin_write" ON public.contratos
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND perfil IN ('admin','gerente')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND perfil IN ('admin','gerente')));

-- ----- 5. extratos_mensais ---------------------------------------------
CREATE TABLE IF NOT EXISTS public.extratos_mensais (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  estrategista_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  estrategista_nome TEXT NOT NULL,
  estrategista_doc TEXT,
  mes_referencia DATE NOT NULL,           -- sempre dia 01
  total_bruto NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_liquido NUMERIC(12,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho','aprovado','pago')),
  aprovado_por UUID REFERENCES public.users(id),
  aprovado_em TIMESTAMPTZ,
  pago_em TIMESTAMPTZ,
  observacoes TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(estrategista_id, mes_referencia)
);

ALTER TABLE public.extratos_mensais ENABLE ROW LEVEL SECURITY;

-- estrategista vê só os próprios extratos aprovados/pagos
CREATE POLICY "extratos_self_read" ON public.extratos_mensais
  FOR SELECT TO authenticated
  USING (
    (estrategista_id = auth.uid() AND status IN ('aprovado','pago'))
    OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND perfil IN ('admin','gerente'))
  );

CREATE POLICY "extratos_admin_write" ON public.extratos_mensais
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND perfil IN ('admin','gerente')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND perfil IN ('admin','gerente')));

-- ----- 6. comissoes (linha por contrato × mês) ------------------------
CREATE TABLE IF NOT EXISTS public.comissoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id UUID NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  estrategista_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  cliente_nome TEXT NOT NULL,
  parcela_num INT NOT NULL,
  total_parcelas INT NOT NULL,
  mes_referencia DATE NOT NULL,           -- dia 01
  valor_calculado NUMERIC(12,2) NOT NULL,
  valor_final NUMERIC(12,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'prevista'
    CHECK (status IN ('prevista','aprovada','paga','cancelada','postergada')),
  postergada_para DATE,
  extrato_id UUID REFERENCES public.extratos_mensais(id) ON DELETE SET NULL,
  observacoes_gestor TEXT,
  editado_por UUID REFERENCES public.users(id),
  editado_em TIMESTAMPTZ,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comissoes_estrat_mes ON public.comissoes(estrategista_id, mes_referencia);
CREATE INDEX IF NOT EXISTS idx_comissoes_extrato ON public.comissoes(extrato_id);
CREATE INDEX IF NOT EXISTS idx_comissoes_status ON public.comissoes(status);

ALTER TABLE public.comissoes ENABLE ROW LEVEL SECURITY;

-- estrategista só vê comissões aprovadas/pagas que são suas; gestor vê tudo
CREATE POLICY "comissoes_self_read" ON public.comissoes
  FOR SELECT TO authenticated
  USING (
    (estrategista_id = auth.uid() AND status IN ('aprovada','paga'))
    OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND perfil IN ('admin','gerente'))
  );

CREATE POLICY "comissoes_admin_write" ON public.comissoes
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND perfil IN ('admin','gerente')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND perfil IN ('admin','gerente')));

-- ----- 7. salario_fixo_itens (linhas manuais por extrato) -------------
CREATE TABLE IF NOT EXISTS public.salario_fixo_itens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  extrato_id UUID NOT NULL REFERENCES public.extratos_mensais(id) ON DELETE CASCADE,
  cliente_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  cliente_nome TEXT NOT NULL,
  descricao TEXT,
  valor NUMERIC(12,2) NOT NULL,
  ordem INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_salfix_extrato ON public.salario_fixo_itens(extrato_id);

ALTER TABLE public.salario_fixo_itens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "salfix_select" ON public.salario_fixo_itens
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.extratos_mensais e
      WHERE e.id = salario_fixo_itens.extrato_id
        AND (
          (e.estrategista_id = auth.uid() AND e.status IN ('aprovado','pago'))
          OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND perfil IN ('admin','gerente'))
        )
    )
  );

CREATE POLICY "salfix_admin_write" ON public.salario_fixo_itens
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND perfil IN ('admin','gerente')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND perfil IN ('admin','gerente')));

-- =====================================================================
-- 8. Função: calcular_comissoes_contrato
-- Regra do dia 15:
--   data_fechamento dia <= 15  → 1ª parcela = mês seguinte
--   data_fechamento dia >= 16  → 1ª parcela = dois meses depois
-- =====================================================================
CREATE OR REPLACE FUNCTION public.calcular_comissoes_contrato(p_contrato_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c RECORD;
  v_offset INT;
  v_primeiro_mes DATE;
  v_valor_parcela NUMERIC(12,2);
  v_valor_comissao NUMERIC(12,2);
  i INT;
BEGIN
  SELECT * INTO c FROM public.contratos WHERE id = p_contrato_id;
  IF NOT FOUND THEN RETURN; END IF;

  -- limpa linhas previstas para reidempotência
  DELETE FROM public.comissoes
   WHERE contrato_id = p_contrato_id AND status = 'prevista';

  IF c.status <> 'ativo' THEN RETURN; END IF;
  IF c.num_parcelas IS NULL OR c.num_parcelas < 1 THEN RETURN; END IF;

  v_offset := CASE WHEN EXTRACT(DAY FROM c.data_fechamento) <= 15 THEN 1 ELSE 2 END;
  v_primeiro_mes := date_trunc('month', c.data_fechamento + (v_offset || ' months')::interval)::date;

  v_valor_parcela := round(c.valor_total / c.num_parcelas, 2);
  v_valor_comissao := round(v_valor_parcela * (c.percentual_aplicado / 100.0), 2);

  FOR i IN 1..c.num_parcelas LOOP
    INSERT INTO public.comissoes (
      contrato_id, estrategista_id, cliente_nome,
      parcela_num, total_parcelas, mes_referencia,
      valor_calculado, valor_final, status
    ) VALUES (
      c.id, c.estrategista_id, c.cliente_nome,
      i, c.num_parcelas,
      (v_primeiro_mes + ((i - 1) || ' months')::interval)::date,
      v_valor_comissao, v_valor_comissao, 'prevista'
    );
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.calcular_comissoes_contrato(UUID) FROM anon, authenticated;

-- Trigger AFTER INSERT/UPDATE de campos relevantes
CREATE OR REPLACE FUNCTION public.trg_calcular_comissoes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.calcular_comissoes_contrato(NEW.id);
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.trg_calcular_comissoes() FROM anon, authenticated;

DROP TRIGGER IF EXISTS contratos_calc_comissoes_ins ON public.contratos;
CREATE TRIGGER contratos_calc_comissoes_ins
  AFTER INSERT ON public.contratos
  FOR EACH ROW EXECUTE FUNCTION public.trg_calcular_comissoes();

DROP TRIGGER IF EXISTS contratos_calc_comissoes_upd ON public.contratos;
CREATE TRIGGER contratos_calc_comissoes_upd
  AFTER UPDATE OF data_fechamento, valor_total, num_parcelas, percentual_aplicado, status
  ON public.contratos
  FOR EACH ROW EXECUTE FUNCTION public.trg_calcular_comissoes();

-- =====================================================================
-- 9. Função: aprovar_extrato_mes (gestor)
-- Cria/atualiza extratos_mensais e fecha as comissões previstas do mês
-- =====================================================================
CREATE OR REPLACE FUNCTION public.aprovar_extrato_mes(
  p_estrategista_id UUID,
  p_mes DATE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_perfil TEXT;
  v_extrato_id UUID;
  v_total NUMERIC(12,2);
  u RECORD;
BEGIN
  SELECT perfil INTO v_perfil FROM public.users WHERE id = v_uid;
  IF v_perfil NOT IN ('admin','gerente') THEN
    RAISE EXCEPTION 'Apenas admin/gerente podem aprovar extratos';
  END IF;

  SELECT * INTO u FROM public.users WHERE id = p_estrategista_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Estrategista não encontrado'; END IF;

  -- soma das comissões previstas e ainda não vinculadas
  SELECT COALESCE(SUM(valor_final), 0) INTO v_total
    FROM public.comissoes
   WHERE estrategista_id = p_estrategista_id
     AND mes_referencia = date_trunc('month', p_mes)::date
     AND status = 'prevista';

  -- upsert do extrato
  INSERT INTO public.extratos_mensais (
    estrategista_id, estrategista_nome, estrategista_doc,
    mes_referencia, total_bruto, total_liquido,
    status, aprovado_por, aprovado_em
  ) VALUES (
    p_estrategista_id, u.nome, u.cnpj_cpf,
    date_trunc('month', p_mes)::date, v_total, v_total,
    'aprovado', v_uid, now()
  )
  ON CONFLICT (estrategista_id, mes_referencia) DO UPDATE
    SET total_bruto = EXCLUDED.total_bruto,
        total_liquido = EXCLUDED.total_liquido,
        status = 'aprovado',
        aprovado_por = v_uid,
        aprovado_em = now()
  RETURNING id INTO v_extrato_id;

  -- vincula as linhas previstas e marca como aprovadas
  UPDATE public.comissoes
     SET status = 'aprovada',
         extrato_id = v_extrato_id
   WHERE estrategista_id = p_estrategista_id
     AND mes_referencia = date_trunc('month', p_mes)::date
     AND status = 'prevista';

  RETURN v_extrato_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.aprovar_extrato_mes(UUID, DATE) FROM anon;
GRANT EXECUTE ON FUNCTION public.aprovar_extrato_mes(UUID, DATE) TO authenticated;

-- =====================================================================
-- 10. View de alertas para o gestor
-- Conta entregas atrasadas dos clientes do estrategista no mês corrente.
-- (chat_negativo e ranking entram quando os módulos forem fechados)
-- =====================================================================
CREATE OR REPLACE VIEW public.v_alertas_estrategista
WITH (security_invoker = true)
AS
SELECT
  u.id AS estrategista_id,
  u.nome AS estrategista_nome,
  COALESCE((
    SELECT count(*) FROM public.deliveries d
    JOIN public.contratos c ON c.cliente_id = d.client_id AND c.estrategista_id = u.id
    WHERE d.prazo IS NOT NULL
      AND d.prazo < CURRENT_DATE
      AND d.status NOT IN ('publicado','aprovado')
  ), 0) AS entregas_atrasadas,
  0 AS chat_negativo,    -- placeholder até integrar chat
  NULL::INT AS ranking_pos -- placeholder até módulo ranking
FROM public.users u
WHERE u.tipo_consultor IS NOT NULL
  AND COALESCE(u.ativo_comissoes, true) = true;

-- =====================================================================
-- 11. updated_at trigger
-- =====================================================================
CREATE OR REPLACE FUNCTION public.tg_set_atualizado_em()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.atualizado_em := now();
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.tg_set_atualizado_em() FROM anon, authenticated;

DROP TRIGGER IF EXISTS contratos_set_updated ON public.contratos;
CREATE TRIGGER contratos_set_updated
  BEFORE UPDATE ON public.contratos
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_atualizado_em();
