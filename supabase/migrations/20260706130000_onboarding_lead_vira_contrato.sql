-- Fase 2 do kanban de Contratos: coluna "Onboarding".
--
-- Leads do formulário público caem em `vendas_pendentes` e hoje NÃO viram
-- contrato automaticamente. Esta migration faz cada lead novo virar um
-- contrato com status 'rascunho' / status_secundario 'Não iniciado' — que é
-- exatamente o que a coluna "Onboarding" do kanban mostra. Quando o Clicksign
-- é adicionado, a regra já existente no ContratoDetailPage vira o status pra ATIVO.

BEGIN;

-- Vínculo contrato ↔ lead do formulário (evita duplicar)
ALTER TABLE public.contratos
  ADD COLUMN IF NOT EXISTS venda_pendente_id UUID REFERENCES public.vendas_pendentes(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_contratos_venda_pendente_id
  ON public.contratos(venda_pendente_id);

-- Função: cria um contrato "Não iniciado" a partir de um lead do formulário
CREATE OR REPLACE FUNCTION public.criar_contrato_de_venda_pendente()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM 'descartada' THEN
    INSERT INTO public.contratos (
      cliente_nome, cpf_cnpj, email, whatsapp, empresa, instagram, endereco,
      produto_id, produto_nome, valor_total, data_fechamento,
      status, status_secundario, pagamentos, vendedor, venda_pendente_id
    )
    VALUES (
      NEW.cliente_nome,
      NULLIF(NEW.cliente_cpf_cnpj, ''),
      NULLIF(NEW.cliente_email, ''),
      NULLIF(NEW.cliente_whatsapp, ''),
      NULLIF(NEW.cliente_razao_social, ''),
      NULLIF(NEW.cliente_instagram, ''),
      NULLIF(NEW.cliente_endereco, ''),
      NEW.produto_id,
      NEW.produto_nome,
      COALESCE(NEW.valor_total_venda, 0),
      COALESCE(NEW.criado_em::date, CURRENT_DATE),
      'rascunho',
      'Não iniciado',
      COALESCE(NEW.pagamentos, '[]'::jsonb),
      NULLIF(NEW.closer_nome, ''),
      NEW.id
    )
    ON CONFLICT (venda_pendente_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_venda_pendente_cria_contrato ON public.vendas_pendentes;
CREATE TRIGGER trg_venda_pendente_cria_contrato
  AFTER INSERT ON public.vendas_pendentes
  FOR EACH ROW EXECUTE FUNCTION public.criar_contrato_de_venda_pendente();

-- Coluna "Onboarding" no kanban (primeira posição), só se ainda não existir
INSERT INTO public.contratos_kanban_colunas (titulo, status_chave, cor, ordem, is_onboarding)
SELECT 'Onboarding', 'NÃO INICIADO', 'bg-purple-500', 0, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.contratos_kanban_colunas WHERE upper(status_chave) = 'NÃO INICIADO'
);

-- Backfill: leads pendentes/em atendimento que ainda não têm contrato
-- (nem por vínculo, nem por WhatsApp/e-mail/CPF) viram contrato "Não iniciado".
INSERT INTO public.contratos (
  cliente_nome, cpf_cnpj, email, whatsapp, empresa, instagram, endereco,
  produto_id, produto_nome, valor_total, data_fechamento,
  status, status_secundario, pagamentos, vendedor, venda_pendente_id
)
SELECT
  vp.cliente_nome,
  NULLIF(vp.cliente_cpf_cnpj, ''),
  NULLIF(vp.cliente_email, ''),
  NULLIF(vp.cliente_whatsapp, ''),
  NULLIF(vp.cliente_razao_social, ''),
  NULLIF(vp.cliente_instagram, ''),
  NULLIF(vp.cliente_endereco, ''),
  vp.produto_id,
  vp.produto_nome,
  COALESCE(vp.valor_total_venda, 0),
  COALESCE(vp.criado_em::date, CURRENT_DATE),
  'rascunho',
  'Não iniciado',
  COALESCE(vp.pagamentos, '[]'::jsonb),
  NULLIF(vp.closer_nome, ''),
  vp.id
FROM public.vendas_pendentes vp
WHERE vp.status IN ('pendente', 'em_atendimento')
  AND NOT EXISTS (SELECT 1 FROM public.contratos c WHERE c.venda_pendente_id = vp.id)
  AND NOT EXISTS (
    SELECT 1 FROM public.contratos c
    WHERE (NULLIF(vp.cliente_whatsapp, '') IS NOT NULL AND c.whatsapp = vp.cliente_whatsapp)
       OR (NULLIF(vp.cliente_email, '') IS NOT NULL AND lower(c.email) = lower(vp.cliente_email))
       OR (NULLIF(vp.cliente_cpf_cnpj, '') IS NOT NULL AND c.cpf_cnpj = vp.cliente_cpf_cnpj)
  )
ON CONFLICT (venda_pendente_id) DO NOTHING;

COMMIT;
