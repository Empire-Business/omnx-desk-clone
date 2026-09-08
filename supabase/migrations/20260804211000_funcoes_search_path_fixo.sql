-- Fixa o search_path das 8 funções que ainda o herdavam de quem chama.
--
-- Sem search_path fixo, quem chama a função pode colocar um schema próprio na
-- frente do public e fazer a função resolver `comissoes` (ou a sequence dos
-- contratos) para uma tabela falsa. Todas as 8 são SECURITY INVOKER, então o
-- estrago possível é menor do que seria numa SECURITY DEFINER — mas o custo de
-- fechar é zero e o advisor do Supabase aponta as 8.
--
-- Usamos `public, pg_temp` em vez de `''` de propósito: duas delas referenciam
-- objetos sem qualificar o schema (set_contrato_numero usa contratos_numero_seq),
-- e o path vazio quebraria a resolução. Assim o comportamento é idêntico ao de
-- hoje, só deixa de depender do chamador.

ALTER FUNCTION public.set_contrato_numero()                      SET search_path TO public, pg_temp;
ALTER FUNCTION public.set_updated_at()                           SET search_path TO public, pg_temp;
ALTER FUNCTION public.trigger_set_updated_at()                   SET search_path TO public, pg_temp;
ALTER FUNCTION public.check_employee_self_management()           SET search_path TO public, pg_temp;
ALTER FUNCTION public.tg_vendas_pendentes_updated()              SET search_path TO public, pg_temp;
ALTER FUNCTION public.tg_reportes_erro_touch()                   SET search_path TO public, pg_temp;
ALTER FUNCTION public.impedir_delete_contrato_com_comissao_paga() SET search_path TO public, pg_temp;
ALTER FUNCTION public.comissoes_papel_do_perfil(text)            SET search_path TO public, pg_temp;
