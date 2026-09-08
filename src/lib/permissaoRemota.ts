import { supabase } from '@/lib/supabase'

/**
 * Pergunta a permissão direto ao banco, dentro de um `queryFn`.
 *
 * O hook `usePermissoes` resolve o caso comum (componente React). Alguns hooks
 * de dados, porém, precisam decidir o escopo da consulta **dentro** do próprio
 * `queryFn` — antes de qualquer render — e ali não dá para chamar outro hook.
 * Esta função cobre esse caso usando `has_permissao()`, a MESMA função que a
 * RLS usa. Front e banco respondendo pela mesma fonte é o que evita a tela
 * mostrar uma coisa e a API devolver outra.
 *
 * `fallback` vale quando a chamada falha (rede, função ausente): passamos o
 * comportamento legado, para uma falha de rede nunca ampliar acesso.
 */
export async function podeNoBanco(
  recurso: string,
  acao: 'ver' | 'editar' | 'admin',
  fallback: boolean,
): Promise<boolean> {
  const { data, error } = await supabase.rpc('has_permissao', {
    p_recurso: recurso,
    p_acao: acao,
  })
  if (error) return fallback
  // OR com o gate legado enquanto a migration `20260806130000` não estiver
  // aplicada em todos os tenants: sem isso, subir o front antes do banco tiraria
  // a carteira do gerente em silêncio. Mesma janela de transição do
  // `RECURSOS_EM_TRANSICAO` em usePermissoes — e a mesma limitação: até este OR
  // sair, revogar o acesso pela matriz não tem efeito para quem o legado já
  // liberava.
  return data === true || fallback
}
