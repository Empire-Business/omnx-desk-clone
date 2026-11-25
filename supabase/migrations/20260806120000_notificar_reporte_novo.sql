-- ============================================================================
-- Reporte de erro novo → e-mail para quem tria (§14 do brief de reestruturação)
-- ============================================================================
-- Problema que resolve: a captura do reporte ficou completa em 04/08/2026 (print
-- da tela, console, rede), mas ninguém é AVISADO quando um reporte entra. A
-- triagem depende de alguém lembrar de abrir /reportes — ou seja, um erro
-- crítico pode ficar parado dias sem que a equipe saiba que existe.
--
-- Como funciona: AFTER INSERT em reportes_erro monta o resumo e chama a edge
-- function send-email (a mesma do aviso de contrato assinado), uma vez por
-- admin do tenant. Assíncrono via pg_net: enfileira e envia depois do commit,
-- então falha de e-mail NUNCA impede o reporte de ser gravado — o que seria o
-- pior dos mundos, perder o relato do usuário por causa do aviso.
--
-- Privacidade: o e-mail leva só o que o usuário escreveu e o contexto de tela
-- (rota, navegador). O JSONB `contexto` completo — que carrega console e rede —
-- NÃO vai por e-mail; fica no painel, atrás da RLS. E-mail é canal que se
-- encaminha e se arquiva fora do sistema.
--
-- Reversível:
--   drop trigger if exists trg_notificar_reporte_novo on public.reportes_erro;
--   drop function if exists public.tg_notificar_reporte_novo();
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.tg_notificar_reporte_novo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'vault', 'net'
AS $function$
declare
  v_secret     text;
  v_admin      record;
  v_html       text;
  v_assunto    text;
  v_impacto    text;
  v_url_painel text := 'https://desk.omnx.pro/reportes';
begin
  -- Disjuntor para import/backfill em massa:
  --   SET LOCAL app.skip_reporte_email = 'on';
  if coalesce(current_setting('app.skip_reporte_email', true), '') = 'on' then
    return new;
  end if;

  -- Dúvida e sugestão não acordam ninguém: o aviso existe para o que quebrou.
  -- Sem este recorte, o canal vira ruído e a equipe passa a ignorar o alerta —
  -- que é exatamente o problema que ele veio resolver.
  if new.categoria <> 'bug' then
    return new;
  end if;

  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name = 'notify_webhook_secret';

  if v_secret is null then
    return new;  -- sem secret configurado não há como chamar; o reporte segue gravado
  end if;

  v_impacto := case new.impacto
    when 'critico' then 'CRÍTICO'
    when 'alto'    then 'Alto'
    when 'medio'   then 'Médio'
    else 'Baixo'
  end;

  v_assunto := '[' || new.protocolo || '] ' ||
               case when new.impacto in ('critico','alto') then 'Erro ' || v_impacto || ': ' else 'Novo reporte: ' end ||
               new.titulo;

  -- HTML simples de propósito: é aviso operacional, não peça de marketing.
  -- Cliente de e-mail corporativo corta CSS elaborado e o que sobra fica pior.
  v_html :=
    '<h2>' || coalesce(new.titulo, 'Reporte sem título') || '</h2>' ||
    '<p><strong>Protocolo:</strong> ' || new.protocolo ||
    '<br><strong>Impacto:</strong> ' || v_impacto ||
    '<br><strong>Quem reportou:</strong> ' || coalesce(new.reportado_nome, 'não informado') ||
      ' (' || coalesce(new.reportado_email, 'sem e-mail') || ')' ||
    '<br><strong>Módulo:</strong> ' || coalesce(new.modulo, '—') ||
    '<br><strong>Tela:</strong> ' || coalesce(new.rota, '—') || '</p>' ||
    case when coalesce(new.descricao, '') <> ''
      then '<p><strong>O que aconteceu</strong><br>' || replace(new.descricao, chr(10), '<br>') || '</p>'
      else '' end ||
    case when coalesce(new.passos, '') <> ''
      then '<p><strong>Passos para reproduzir</strong><br>' || replace(new.passos, chr(10), '<br>') || '</p>'
      else '' end ||
    '<p><a href="' || v_url_painel || '">Abrir a triagem no painel</a></p>' ||
    '<p style="color:#666;font-size:12px">Print da tela, console e rede ficam no painel — ' ||
    'não são enviados por e-mail.</p>';

  -- Um e-mail por admin ATIVO do MESMO tenant do reporte. Sem isso, o admin de
  -- uma empresa receberia o erro de outra — vazamento entre tenants por e-mail,
  -- que a RLS do painel impediria mas o aviso não.
  for v_admin in
    select u.email, u.nome
    from public.users u
    where u.tenant_id = new.tenant_id
      and u.perfil = 'admin'
      and coalesce(u.ativo, true) = true
      and coalesce(u.email, '') <> ''
  loop
    perform net.http_post(
      url := 'https://seu-projeto-supabase.supabase.co/functions/v1/send-email',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind1em1ja2F0Ym1scGtkeHRmaHFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNjUxNzEsImV4cCI6MjA4ODc0MTE3MX0.dL8LHbCJv69zJtt-aA3iAEO6PMcJBHlDC1HAEu9O9Ho',
        'x-notify-secret', v_secret
      ),
      body := jsonb_build_object(
        'to', v_admin.email,
        'to_name', v_admin.nome,
        'subject', v_assunto,
        'html', v_html,
        'type', 'transacional',
        'ref_type', 'reporte_erro',
        'ref_id', new.id
      ),
      timeout_milliseconds := 30000
    );
  end loop;

  return new;
end $function$;

COMMENT ON FUNCTION public.tg_notificar_reporte_novo() IS
  'Avisa por e-mail os admins do tenant quando entra um reporte de categoria bug. Disjuntor: app.skip_reporte_email=on.';

-- REVOKE explícito: função nova nasce executável por PUBLIC no Postgres, e foi
-- exatamente isso que virou o P0 da auditoria de 27/07/2026. Só o trigger chama.
REVOKE ALL ON FUNCTION public.tg_notificar_reporte_novo() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tg_notificar_reporte_novo() FROM anon, authenticated;

DROP TRIGGER IF EXISTS trg_notificar_reporte_novo ON public.reportes_erro;
CREATE TRIGGER trg_notificar_reporte_novo
  AFTER INSERT ON public.reportes_erro
  FOR EACH ROW EXECUTE FUNCTION public.tg_notificar_reporte_novo();

COMMIT;
