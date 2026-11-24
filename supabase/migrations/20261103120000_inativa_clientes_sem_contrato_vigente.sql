-- Correção única: clientes marcados como ativos cujos contratos já estão todos
-- encerrados (concluído, cancelado ou rascunho) passam a inativos.
--
-- Complementa 20261029120000_cliente_ativo_segue_contratos.sql, que só age
-- quando um contrato muda e por isso não corrige quem já estava errado.
--
-- Clientes SEM nenhum contrato na tabela `contratos` não são tocados
-- (podem ser clientes antigos cadastrados antes do módulo de contratos).
-- Idempotente: reaplicar não muda nada.

UPDATE public.clients cl
   SET ativo = false
 WHERE cl.ativo = true
   AND EXISTS (
     SELECT 1 FROM public.contratos c WHERE c.cliente_id = cl.id
   )
   AND NOT EXISTS (
     SELECT 1 FROM public.contratos c
      WHERE c.cliente_id = cl.id
        AND c.status IN ('ativo', 'pausado')
   );
