-- Migration única: prepara a tabela contratos pra substituir 100% o Notion.
--   1. estrategista_aliases — mapa textual no DB (substitui hardcode na edge function)
--   2. contratos_audit_log + trigger — registro de quem editou o quê
--   3. contrato_anexos + bucket privado — arquivos vinculados a contratos
--   4. cliente_id agora obrigatório para criação nativa (mas permanece nullable
--      pra contratos legados importados do Notion)

BEGIN;

-- =========================================================================
-- 1. ALIASES DE ESTRATEGISTAS
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.estrategista_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alias_normalizado TEXT NOT NULL UNIQUE,  -- normalizado lowercase/sem acento
  alias_original TEXT NOT NULL,            -- como vem do Notion
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  criado_por UUID REFERENCES public.users(id),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_estrategista_aliases_user ON public.estrategista_aliases(user_id);

ALTER TABLE public.estrategista_aliases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "aliases_admin_all" ON public.estrategista_aliases
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND perfil IN ('admin','gerente')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND perfil IN ('admin','gerente')));

-- Seed com os aliases conhecidos hoje
INSERT INTO public.estrategista_aliases (alias_normalizado, alias_original, user_id)
SELECT 'rodrigo diez perez', 'Rodrigo Diez Pérez', u.id FROM public.users u WHERE u.nome = 'Rodrigo DiPerez'
ON CONFLICT (alias_normalizado) DO NOTHING;

INSERT INTO public.estrategista_aliases (alias_normalizado, alias_original, user_id)
SELECT 'virendra prem', 'Virendra Prem', u.id FROM public.users u WHERE u.nome = 'Virendra'
ON CONFLICT (alias_normalizado) DO NOTHING;


-- =========================================================================
-- 2. AUDIT LOG DE CONTRATOS
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.contratos_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id UUID NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  operacao TEXT NOT NULL CHECK (operacao IN ('INSERT', 'UPDATE', 'DELETE')),
  campo TEXT,            -- NULL quando insert/delete
  valor_antigo TEXT,
  valor_novo TEXT,
  alterado_por UUID REFERENCES public.users(id),
  alterado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_contrato ON public.contratos_audit_log(contrato_id, alterado_em DESC);

ALTER TABLE public.contratos_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_admin_read" ON public.contratos_audit_log
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND perfil IN ('admin','gerente')));

-- Campos auditados (lista fechada pra não inflar com notion_raw etc.)
CREATE OR REPLACE FUNCTION public.audit_contratos()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID;
  v_campos TEXT[] := ARRAY[
    'cliente_nome','produto_nome','estrategista_id','data_fechamento','vencimento',
    'valor_total','valor_parcela','num_parcelas','percentual_aplicado',
    'status','status_secundario','observacoes','whatsapp','email','cpf_cnpj',
    'empresa','endereco','instagram','nicho','vendedor','treinador',
    'entrada','pg_entrada','forma_pagamento','link_clicksign','bonus',
    'venda_interna','venda_diretoria'
  ];
  v_campo TEXT;
  v_old TEXT;
  v_new TEXT;
BEGIN
  v_user := COALESCE(auth.uid(), NULL);

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.contratos_audit_log (contrato_id, operacao, alterado_por)
    VALUES (NEW.id, 'INSERT', v_user);
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    INSERT INTO public.contratos_audit_log (contrato_id, operacao, alterado_por)
    VALUES (OLD.id, 'DELETE', v_user);
    RETURN OLD;
  END IF;

  -- UPDATE: registra apenas os campos que mudaram
  FOREACH v_campo IN ARRAY v_campos LOOP
    EXECUTE format('SELECT ($1).%I::text, ($2).%I::text', v_campo, v_campo)
      INTO v_old, v_new USING OLD, NEW;
    IF v_old IS DISTINCT FROM v_new THEN
      INSERT INTO public.contratos_audit_log (contrato_id, operacao, campo, valor_antigo, valor_novo, alterado_por)
      VALUES (NEW.id, 'UPDATE', v_campo, v_old, v_new, v_user);
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS contratos_audit_trg ON public.contratos;
CREATE TRIGGER contratos_audit_trg
  AFTER INSERT OR UPDATE OR DELETE ON public.contratos
  FOR EACH ROW EXECUTE FUNCTION public.audit_contratos();


-- =========================================================================
-- 3. ANEXOS
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.contrato_anexos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id UUID NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  nome_original TEXT NOT NULL,
  storage_path TEXT NOT NULL,          -- caminho dentro do bucket
  mime_type TEXT,
  tamanho_bytes BIGINT,
  categoria TEXT NOT NULL DEFAULT 'outro'
    CHECK (categoria IN ('contrato','comprovante_entrada','nota_fiscal','outro')),
  enviado_por UUID REFERENCES public.users(id),
  enviado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_anexos_contrato ON public.contrato_anexos(contrato_id);

ALTER TABLE public.contrato_anexos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anexos_admin_all" ON public.contrato_anexos
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND perfil IN ('admin','gerente')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND perfil IN ('admin','gerente')));

CREATE POLICY "anexos_estrategista_read" ON public.contrato_anexos
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.contratos c
    WHERE c.id = contrato_anexos.contrato_id AND c.estrategista_id = auth.uid()
  ));

-- Bucket privado (idempotente)
INSERT INTO storage.buckets (id, name, public)
VALUES ('contratos-anexos', 'contratos-anexos', false)
ON CONFLICT (id) DO NOTHING;

-- Policies do bucket: admin/gerente faz tudo; estrategista lê os seus
DROP POLICY IF EXISTS "anexos_storage_admin" ON storage.objects;
CREATE POLICY "anexos_storage_admin" ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id = 'contratos-anexos'
    AND EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND perfil IN ('admin','gerente'))
  )
  WITH CHECK (
    bucket_id = 'contratos-anexos'
    AND EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND perfil IN ('admin','gerente'))
  );

DROP POLICY IF EXISTS "anexos_storage_estrategista_read" ON storage.objects;
CREATE POLICY "anexos_storage_estrategista_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'contratos-anexos'
    AND EXISTS (
      SELECT 1 FROM public.contrato_anexos a
      JOIN public.contratos c ON c.id = a.contrato_id
      WHERE a.storage_path = storage.objects.name AND c.estrategista_id = auth.uid()
    )
  );


-- =========================================================================
-- 4. NOTIFICAÇÕES — view para o cron processar
-- =========================================================================
CREATE OR REPLACE VIEW public.v_contratos_alertas AS
SELECT
  c.id AS contrato_id,
  c.cliente_nome,
  c.estrategista_id,
  c.status_secundario,
  c.vencimento,
  c.num_parcelas,
  -- "última parcela" estimada: vencimento + (num_parcelas-1) meses
  CASE WHEN c.vencimento IS NOT NULL
       THEN (c.vencimento + ((c.num_parcelas - 1) || ' months')::interval)::date
       ELSE NULL END AS ultimo_vencimento,
  c.atualizado_em
FROM public.contratos c
WHERE c.status = 'ativo';

COMMIT;
