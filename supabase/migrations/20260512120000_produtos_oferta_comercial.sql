-- =====================================================================
-- Produtos de oferta comercial (catálogo da empresa)
--
-- 1. Relaxa products.client_id para permitir produtos de catálogo (NULL).
-- 2. Estende produtos_comissao com tipo_comissao (valor_fixo | percentual),
--    valor_comissao_padrao, valor_bonus e bonus_condicional.
-- 3. Seed dos 5 produtos de oferta comercial em uso.
-- 4. Atualiza calcular_comissoes_contrato pra usar valor fixo OU percentual
--    conforme o tipo configurado em produtos_comissao.
-- 5. Faz best-effort match dos contratos legados via produto_nome → produto_id.
-- =====================================================================

BEGIN;

-- 1. products.client_id agora permite NULL para produtos de catálogo
ALTER TABLE public.products
  ALTER COLUMN client_id DROP NOT NULL;

-- Constraint de unicidade para nome de catálogo (client_id NULL)
CREATE UNIQUE INDEX IF NOT EXISTS uq_products_catalogo_nome
  ON public.products (lower(nome))
  WHERE client_id IS NULL;

-- 2. Estende produtos_comissao
ALTER TABLE public.produtos_comissao
  ADD COLUMN IF NOT EXISTS tipo_comissao TEXT
    NOT NULL DEFAULT 'percentual'
    CHECK (tipo_comissao IN ('valor_fixo','percentual')),
  ADD COLUMN IF NOT EXISTS valor_comissao_padrao NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_bonus NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bonus_condicional BOOLEAN NOT NULL DEFAULT false;

-- 3. Seed dos 5 produtos de oferta + suas configs de comissão
WITH ofertas(nome, descricao, tipo, valor_fixo, percentual, parcelas, valor_bonus, bonus_cond, obs) AS (
  VALUES
    ('Acelerador de Marca',                       'Oferta comercial — catálogo', 'valor_fixo',  1000.00,  0.0, 1, 500.00, true,  'Bônus pago apenas se o cliente não cancelar'),
    ('Acelerador de Conteúdo',                    'Oferta comercial — catálogo', 'valor_fixo',   550.00,  0.0, 1,   0.00, false, 'Valor por parcela mensal'),
    ('Acelerador de Conteúdo Individual Advanced','Oferta comercial — catálogo', 'valor_fixo',   900.00,  0.0, 1,   0.00, false, 'Valor por parcela mensal'),
    ('Acelerador de Audiência',                   'Oferta comercial — catálogo', 'percentual',     0.00,  0.0, 1,   0.00, false, 'Percentual a definir'),
    ('BPO de Conteúdo',                           'Oferta comercial — catálogo', 'percentual',     0.00,  0.0, 1,   0.00, false, 'Percentual a definir')
)
INSERT INTO public.products (id, client_id, nome, descricao, ativo)
SELECT gen_random_uuid(), NULL, o.nome, o.descricao, true
FROM ofertas o
WHERE NOT EXISTS (
  SELECT 1 FROM public.products p
  WHERE p.client_id IS NULL AND lower(p.nome) = lower(o.nome)
);

INSERT INTO public.produtos_comissao (
  produto_id, tipo_comissao, valor_comissao_padrao, percentual_padrao,
  parcelas_padrao, valor_bonus, bonus_condicional, observacoes
)
SELECT p.id, o.tipo, o.valor_fixo, o.percentual, o.parcelas, o.valor_bonus, o.bonus_cond, o.obs
FROM (
  VALUES
    ('Acelerador de Marca',                       'valor_fixo'::text,  1000.00::numeric,  0.0::numeric, 1, 500.00::numeric, true,  'Bônus pago apenas se o cliente não cancelar'),
    ('Acelerador de Conteúdo',                    'valor_fixo',         550.00,            0.0,         1,   0.00,           false, 'Valor por parcela mensal'),
    ('Acelerador de Conteúdo Individual Advanced','valor_fixo',         900.00,            0.0,         1,   0.00,           false, 'Valor por parcela mensal'),
    ('Acelerador de Audiência',                   'percentual',           0.00,            0.0,         1,   0.00,           false, 'Percentual a definir'),
    ('BPO de Conteúdo',                           'percentual',           0.00,            0.0,         1,   0.00,           false, 'Percentual a definir')
) AS o(nome, tipo, valor_fixo, percentual, parcelas, valor_bonus, bonus_cond, obs)
JOIN public.products p ON p.client_id IS NULL AND lower(p.nome) = lower(o.nome)
ON CONFLICT (produto_id) DO NOTHING;

-- 4. Best-effort: vincular contratos legados ao produto_id de catálogo pelo nome
UPDATE public.contratos c
   SET produto_id = p.id
  FROM public.products p
 WHERE c.produto_id IS NULL
   AND c.produto_nome IS NOT NULL
   AND p.client_id IS NULL
   AND lower(trim(p.nome)) = lower(trim(c.produto_nome));

-- 5. Recria função de cálculo: usa valor fixo OU percentual conforme produtos_comissao
CREATE OR REPLACE FUNCTION public.calcular_comissoes_contrato(p_contrato_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c RECORD;
  pc RECORD;
  v_offset INT;
  v_primeiro_mes DATE;
  v_valor_parcela NUMERIC(12,2);
  v_valor_comissao NUMERIC(12,2);
  i INT;
BEGIN
  SELECT * INTO c FROM public.contratos WHERE id = p_contrato_id;
  IF NOT FOUND THEN RETURN; END IF;

  -- Não recalcula contratos importados (Notion / legado) — preserva valor_calculado original
  IF c.notion_page_id IS NOT NULL THEN RETURN; END IF;

  DELETE FROM public.comissoes
   WHERE contrato_id = p_contrato_id AND status = 'prevista';

  IF c.status <> 'ativo' THEN RETURN; END IF;
  IF c.num_parcelas IS NULL OR c.num_parcelas < 1 THEN RETURN; END IF;

  v_offset := CASE WHEN EXTRACT(DAY FROM c.data_fechamento) <= 15 THEN 1 ELSE 2 END;
  v_primeiro_mes := date_trunc('month', c.data_fechamento + (v_offset || ' months')::interval)::date;

  v_valor_parcela := round(c.valor_total / c.num_parcelas, 2);

  -- Busca config do produto
  SELECT tipo_comissao, valor_comissao_padrao, percentual_padrao
    INTO pc
    FROM public.produtos_comissao
   WHERE produto_id = c.produto_id;

  IF FOUND AND pc.tipo_comissao = 'valor_fixo' THEN
    v_valor_comissao := pc.valor_comissao_padrao;
  ELSIF FOUND AND pc.tipo_comissao = 'percentual' THEN
    v_valor_comissao := round(v_valor_parcela * (pc.percentual_padrao / 100.0), 2);
  ELSE
    -- Fallback: usa percentual_aplicado do contrato (compatibilidade)
    v_valor_comissao := round(v_valor_parcela * (c.percentual_aplicado / 100.0), 2);
  END IF;

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

-- Garante que o trigger UPDATE também dispare quando produto_id muda
DROP TRIGGER IF EXISTS contratos_calc_comissoes_upd ON public.contratos;
CREATE TRIGGER contratos_calc_comissoes_upd
  AFTER UPDATE OF data_fechamento, valor_total, num_parcelas, percentual_aplicado, status, produto_id
  ON public.contratos
  FOR EACH ROW EXECUTE FUNCTION public.trg_calcular_comissoes();

COMMIT;
