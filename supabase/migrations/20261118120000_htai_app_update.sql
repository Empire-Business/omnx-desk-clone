-- Aviso de versão nova do app instalado (18/11/2026), igual ao GT3 (20261116130000).
--
-- A central do HTAI manda {versao_mais_nova, novidades} junto do envelope da licença, no corpo assinado.
-- A função htai-licenca grava aqui pelas RPCs abaixo (só service_role). Configurações mostra a faixa
-- "versão nova" para a administração. Não é segredo e não muda a licença nem o acesso.
-- Tabela sem tenant_id: a trava da licença não ganha política nela; com a licença negada a
-- pré-requisição da API (htai_licenca_pre_request) recusa a leitura e a faixa simplesmente não aparece.
-- Na produção da empresa (licença em modo off) ninguém grava: a tabela fica vazia e não há faixa.
-- Idempotente: pode rodar de novo sem erro.

CREATE TABLE IF NOT EXISTS public.htai_app_update (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  installed_version text NOT NULL CHECK (installed_version ~ '^[A-Za-z0-9._+-]{1,40}$'),
  latest_version text CHECK (latest_version IS NULL OR latest_version ~ '^[A-Za-z0-9._+-]{1,40}$'),
  notes jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(notes) = 'array' AND jsonb_array_length(notes) <= 5),
  checked_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.htai_app_update ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.htai_app_update FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.htai_app_update TO service_role;
GRANT SELECT ON public.htai_app_update TO authenticated;
DROP POLICY IF EXISTS htai_app_update_read ON public.htai_app_update;
CREATE POLICY htai_app_update_read ON public.htai_app_update FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.htai_installation_set_update(p_installed_version text, p_latest_version text, p_notes jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.htai_app_update (id, installed_version, latest_version, notes, checked_at)
  VALUES (true, p_installed_version, p_latest_version,
          CASE WHEN jsonb_typeof(p_notes) = 'array' THEN p_notes ELSE '[]'::jsonb END, now())
  ON CONFLICT (id) DO UPDATE
     SET installed_version = excluded.installed_version, latest_version = excluded.latest_version,
         notes = excluded.notes, checked_at = now();
END $$;
REVOKE ALL ON FUNCTION public.htai_installation_set_update(text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.htai_installation_set_update(text, text, jsonb) TO service_role;

-- Toda rodada do heartbeat grava só a versão instalada: logo depois de atualizar, a faixa some sem esperar o pull.
CREATE OR REPLACE FUNCTION public.htai_installation_set_installed_version(p_installed_version text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.htai_app_update (id, installed_version, latest_version, notes, checked_at)
  VALUES (true, p_installed_version, NULL, '[]'::jsonb, now())
  ON CONFLICT (id) DO UPDATE SET installed_version = excluded.installed_version;
END $$;
REVOKE ALL ON FUNCTION public.htai_installation_set_installed_version(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.htai_installation_set_installed_version(text) TO service_role;
