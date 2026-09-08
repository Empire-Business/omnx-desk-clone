-- Contrato assinado no Clicksign passa a ATIVO sozinho.
--
-- Antes, essa regra existia em três telas do front (detalhe do contrato, painel do
-- Chat e aba de anexos) — e a aba "Anexos", que é o caminho mais natural para colar
-- o link, era justamente a que gravava só o link e deixava o contrato parado em
-- "Não iniciado". Daí o "às vezes funciona": dependia de por onde a pessoa colou.
--
-- Regra copiada em tela é regra que uma hora falha. Aqui no trigger vale para
-- qualquer caminho: tela, chat, aba de anexos, importação ou edge function — do
-- mesmo jeito que a data de assinatura, o aviso ao CRM e o e-mail já funcionam.
--
-- Só promove contrato parado no começo do fluxo. Cancelado, concluído e pausado
-- não são tocados — um link anexado não ressuscita contrato encerrado.
--
-- A `data_fechamento` NÃO é sobrescrita quando já existe: o contrato conta no mês
-- em que foi criado, não no mês em que a assinatura saiu.
create or replace function public.tg_set_data_assinatura()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  sec_normalizado text;
BEGIN
  -- Só age na transição vazio -> preenchido do link do Clicksign.
  IF NEW.link_clicksign IS NOT NULL AND NEW.link_clicksign <> ''
     AND (TG_OP = 'INSERT' OR OLD.link_clicksign IS NULL OR OLD.link_clicksign = '')
  THEN
    IF NEW.data_assinatura IS NULL THEN
      NEW.data_assinatura := CURRENT_DATE;
    END IF;

    -- Contrato que estava sem data real passa a valer a partir da assinatura.
    IF NEW.data_fechamento IS NULL OR NEW.data_fechamento <= DATE '1900-01-01' THEN
      NEW.data_fechamento := NEW.data_assinatura;
    END IF;

    -- Comparação à prova de caixa e de acento: "Não iniciado", "NAO INICIADO" e
    -- "não iniciado" são o mesmo estado. A primeira versão desta migration
    -- comparava só com "NÃO INICIADO" e por isso nunca promovia nada.
    sec_normalizado := upper(translate(
      coalesce(nullif(trim(NEW.status_secundario), ''), 'NAO INICIADO'),
      'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç',
      'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc'
    ));

    IF coalesce(NEW.status, 'rascunho') = 'rascunho'
       AND sec_normalizado = 'NAO INICIADO'
    THEN
      NEW.status := 'ativo';
      NEW.status_secundario := 'ATIVO';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
