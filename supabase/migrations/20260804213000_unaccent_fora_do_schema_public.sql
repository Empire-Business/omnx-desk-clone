-- Tira a extensão unaccent do schema public.
--
-- Tudo que mora em `public` vira rota automática do PostgREST. A unaccent não
-- precisa disso: nenhuma função nossa, nenhum índice e nenhuma query do app a
-- utilizam — o único vestígio no código é a assinatura gerada automaticamente em
-- src/integrations/supabase/types.ts, que é reflexo do banco, não uso.
--
-- Não fazemos o mesmo com a pg_net, de propósito: as funções que o sistema usa dela
-- (net.http_post) já vivem no schema `net`, fora do alcance do PostgREST, e quem
-- depende disso são a notificação de contrato assinado e a ponte com o GHL. Mover a
-- extensão mexeria nesses dois fluxos sem ganho real de exposição.

ALTER EXTENSION unaccent SET SCHEMA extensions;
