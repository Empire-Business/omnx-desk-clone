import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { tenantDaSessao } from '@/lib/authTenant'

export interface ResultadoRelatorioManual {
  ok: boolean
  status: 'previa' | 'pendente' | 'enviado' | 'falhou'
  request_id?: string
  destinatario_id?: string
  destino_nome?: string
  grupo_jid?: string
  instancia_uuid?: string
  instancia?: string
  gerado_em?: string
  mensagem?: string
  accepted?: boolean
  persisted?: boolean
  incerto?: boolean
  message_id?: string | null
  error?: string
}
export type PedidoRelatorioManual = { destinatario_id: string } & (
  { acao: 'prever_manual' } | { request_id: string; confirmacao: { grupo: string; instancia: string } }
)
const mensagens: Record<string, string> = {
  sessao_invalida: 'Sua sessão mudou ou expirou. Entre novamente antes de continuar.',
  acesso_negado: 'Este envio exige um administrador ativo da empresa.',
  relatorio_desligado: 'Ligue o app e o relatório antes de enviar.',
  destinatario_invalido: 'Selecione um grupo ativo cadastrado para receber o relatório.',
  grupo_bloqueado: 'O grupo não está liberado no número que envia ou está vinculado a um cliente.',
  destinatario_alterado: 'O grupo ou número mudou durante a preparação. Confira o cadastro.',
  instancia_indisponivel: 'O número do envio mudou ou está desconectado. Confira a conexão e prepare uma nova prévia.',
  envios_pausados: 'Os envios estão pausados por falhas recentes. Confira a conexão.',
  pedido_conflitante: 'Este pedido já foi usado em outra operação. Confira o histórico.',
}

/** Identidade capturada na tela e confirmada no servidor; não extrai nem substitui o JWT. */
export function useRelatorioManual() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    retry: false,
    mutationFn: async (body: PedidoRelatorioManual): Promise<ResultadoRelatorioManual> => {
      if (!user || user.perfil !== 'admin') throw new Error(mensagens.acesso_negado)
      const tenant = await tenantDaSessao()
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      if (sessionError || session?.user.id !== user.id || tenant !== user.tenant_id) throw new Error(mensagens.sessao_invalida)
      const payload = 'request_id' in body ? { destinatario_id: body.destinatario_id, request_id: body.request_id } : body
      const headers: Record<string, string> = { 'x-actor-id': user.id }
      if ('request_id' in body) {
        headers['x-relatorio-grupo'] = body.confirmacao.grupo
        headers['x-relatorio-instancia'] = body.confirmacao.instancia
      }
      const { data, error } = await supabase.functions.invoke<ResultadoRelatorioManual>('wa-auto-relatorio-diario', {
        body: payload, headers,
      })
      let result = data
      if (error) {
        const context = (error as { context?: Response }).context
        try { result = context instanceof Response ? await context.clone().json() : null } catch { result = null }
      }
      if (!result?.ok) {
        const code = result?.error ?? ''
        throw new Error(Object.hasOwn(mensagens, code) ? mensagens[code] : 'Não foi possível confirmar o resultado. Confira novamente usando o mesmo pedido; não solicite outro envio.')
      }
      return result
    },
    onSuccess: (_data, body) => {
      if ('request_id' in body) void qc.invalidateQueries({ queryKey: ['wa-auto', 'envios'] })
    },
  })
}
