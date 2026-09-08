-- Expande a tabela `contratos` para acomodar todos os campos da database
-- "Contratos - Acelerador de Audiência" do Notion. Também relaxa
-- `estrategista_id` (102/361 contratos não têm especialista atribuído).

BEGIN;

-- 1. estrategista_id agora pode ser nulo (contrato sem especialista atribuído)
ALTER TABLE public.contratos
  ALTER COLUMN estrategista_id DROP NOT NULL;

-- 2. Campos do cliente (snapshot — não vira FK pra clients agora pra evitar
-- bagunça com dedup; o gestor pode linkar manualmente depois pelo cliente_id)
ALTER TABLE public.contratos
  ADD COLUMN IF NOT EXISTS whatsapp                TEXT,
  ADD COLUMN IF NOT EXISTS email                   TEXT,
  ADD COLUMN IF NOT EXISTS cpf_cnpj                TEXT,
  ADD COLUMN IF NOT EXISTS empresa                 TEXT,
  ADD COLUMN IF NOT EXISTS endereco                TEXT,
  ADD COLUMN IF NOT EXISTS instagram               TEXT,
  ADD COLUMN IF NOT EXISTS nicho                   TEXT,
  ADD COLUMN IF NOT EXISTS posicionamento          TEXT,
  ADD COLUMN IF NOT EXISTS resumo                  TEXT,
  ADD COLUMN IF NOT EXISTS faturamento             TEXT,         -- vem como faixa textual (ex: "3.5M")
  -- 3. Financeiro
  ADD COLUMN IF NOT EXISTS valor_parcela           NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS entrada                 NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS pg_entrada              TEXT,         -- texto livre / data textual no Notion
  ADD COLUMN IF NOT EXISTS fat_bruto               NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS forma_pagamento         TEXT,
  ADD COLUMN IF NOT EXISTS link_clicksign          TEXT,
  -- 4. Datas / planos
  ADD COLUMN IF NOT EXISTS vencimento              DATE,         -- 1ª parcela
  ADD COLUMN IF NOT EXISTS plano_dias              INT,
  ADD COLUMN IF NOT EXISTS semanas                 INT,
  ADD COLUMN IF NOT EXISTS renovacao               TEXT,
  -- 5. Pessoas envolvidas
  ADD COLUMN IF NOT EXISTS vendedor                TEXT,
  ADD COLUMN IF NOT EXISTS treinador               TEXT,
  ADD COLUMN IF NOT EXISTS estrategista_nome_raw   TEXT,         -- nome cru do Notion quando não bate com users
  -- 6. Métricas / acompanhamento
  ADD COLUMN IF NOT EXISTS seguidores_inicio       NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS seguidores_fim          NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS crescimento_seguidores  NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS videos_postados         INT,
  ADD COLUMN IF NOT EXISTS entregas_no_prazo       INT,
  ADD COLUMN IF NOT EXISTS entregas_totais         INT,
  ADD COLUMN IF NOT EXISTS nps_vip                 TEXT,
  -- 7. Status secundário e flags
  ADD COLUMN IF NOT EXISTS status_secundario       TEXT,         -- valor original do Notion (INADIMPLENTE, PAUSADO, etc)
  ADD COLUMN IF NOT EXISTS bonus                   TEXT,
  ADD COLUMN IF NOT EXISTS venda_interna           BOOLEAN,
  ADD COLUMN IF NOT EXISTS venda_diretoria         BOOLEAN,
  -- 8. Identificação no Notion / auditoria
  ADD COLUMN IF NOT EXISTS notion_numero           TEXT,
  ADD COLUMN IF NOT EXISTS notion_ultima_edicao    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS notion_raw              JSONB,        -- snapshot completo
  ADD COLUMN IF NOT EXISTS importado_em            TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_contratos_status_sec ON public.contratos(status_secundario);
CREATE INDEX IF NOT EXISTS idx_contratos_email ON public.contratos(email);

COMMIT;
