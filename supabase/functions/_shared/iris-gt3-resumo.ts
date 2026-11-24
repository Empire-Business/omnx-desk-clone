// Diário contextual do GT3: mesmo cérebro da conversa, somente fontes privadas
// da carteira atual. O handler mantém suas rechecagens de acesso antes/depois.
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import type { EscopoAgente } from './wa-agente-escopo.ts'
import type { Esforco } from './wa-agente-llm.ts'
import { pensar, TEXTO_BLOQUEADO, TEXTO_FALHA_CONSULTA_GT3, TEXTO_FALHA_IA } from './wa-agente-cerebro.ts'
import { coletarAlertasPessoaisGt3, type ColetaAlertasCarteiraGt3 } from './iris-gt3-alertas.ts'
import { ErroIrisGt3 } from './iris-gt3-dados.ts'
import { AJUDA_CARTEIRA_GT3, podeConsultarAlertasCarteiraGt3, sanitizarTextoCarteiraGt3 } from './iris-gt3-politica.ts'
import { FUSO_PADRAO, TIPOS_ANOMALIA, type TipoAnomalia } from './wa-relatorio.ts'

export interface EntradaResumoContextualGt3 {
  admin: SupabaseClient
  escopo: EscopoAgente
  nomePessoa: string | null
  apiKey: string | null | undefined
  modelo?: string | null
  esforco?: Esforco | null
  agora?: Date
  fetchFn?: typeof fetch
}
export interface ResumoContextualGt3 { texto: string; tem_alertas: boolean; avaliacao_contextual: boolean }

function indisponivel(): ErroIrisGt3 {
  return new ErroIrisGt3(503, 'resumo_indisponivel', 'Não foi possível preparar o relatório da sua carteira agora. Tente novamente em instantes.')
}

export async function resumoContextualCarteiraGt3(
  e: EntradaResumoContextualGt3, tipos: readonly TipoAnomalia[],
): Promise<ResumoContextualGt3> {
  if (!podeConsultarAlertasCarteiraGt3(e.escopo)) {
    throw new ErroIrisGt3(403, 'sem_permissao_alertas', 'Não foi possível confirmar o acesso aos alertas da sua carteira.')
  }
  if (!e.escopo.clientIds.size) {
    return { texto: 'Não há clientes na sua carteira autorizada.', tem_alertas: false, avaliacao_contextual: false }
  }
  const agora = e.agora ?? new Date()
  const tiposPermitidos = TIPOS_ANOMALIA.filter((tipo) => tipos.includes(tipo))
  let consultaPessoal: Promise<ColetaAlertasCarteiraGt3> | undefined
  const pergunta = [
    'Prepare meu relatório da manhã usando relatorio_carteira e somente os clientes da minha carteira autorizada.',
    'Apresente os nomes, um resumo do cadastro e da situação contratual sem valores, os pontos de atenção e os pedidos pendentes nas fontes permitidas.',
    'Considere apenas estes tipos de alerta configurados pelo servidor: ' + (tiposPermitidos.join(', ') || 'nenhum tipo de alerta selecionado') + '.',
    tiposPermitidos.includes('sentimento_negativo')
      ? 'Avalie a satisfação a partir das conversas autorizadas disponíveis, separando gravidade operacional de humor. Sem mensagens suficientes, indique indeterminado/sem dados; não invente risco ou satisfação.'
      : 'A avaliação de satisfação não foi selecionada para este diário; não a acrescente como alerta.',
    'Diferencie fatos atuais e pedidos resolvidos. Alertas vazios não confirmam que todos estão saudáveis.',
    'Informe limites de cobertura e dados indisponíveis. Se houver mais páginas, consulte-as para cobrir a carteira.',
    'Responda diretamente com o relatório, sem introdução de ajuda e sem agenda, reunião, agendamento ou promessas de envio a clientes.',
  ].join('\n')
  let r: Awaited<ReturnType<typeof pensar>>
  try {
    r = await pensar({
      admin: e.admin, escopo: e.escopo, nomeAgente: 'Íris', canal: 'privado', quemPergunta: e.nomePessoa,
      pergunta, agora, apiKey: e.apiKey, modelo: e.modelo, esforco: e.esforco, fetchFn: e.fetchFn, prazoMs: 45_000,
      deps: {
        // Os argumentos escolhidos pelo modelo nunca trocam tenant, carteira,
        // instâncias, data ou tipos configurados desta execução.
        coletarAlertas: () => consultaPessoal ??= coletarAlertasPessoaisGt3(e.admin, e.escopo, agora, FUSO_PADRAO, tiposPermitidos),
      },
    })
  } catch { throw indisponivel() }
  const texto = r.texto?.trim() ?? ''
  if (!r.ok || !texto || !consultaPessoal || r.carteiraConsultada !== true
    || [AJUDA_CARTEIRA_GT3, TEXTO_FALHA_CONSULTA_GT3, TEXTO_FALHA_IA, TEXTO_BLOQUEADO].includes(texto)) {
    throw indisponivel()
  }
  // Defesa igual à saída da conversa: não publicar valores/identificadores
  // pessoais completos eventualmente inventados no texto final pelo modelo.
  const seguro = sanitizarTextoCarteiraGt3(texto).trim()
  if (!seguro) throw indisponivel()
  return { texto: seguro, tem_alertas: true, avaliacao_contextual: true }
}
