import { contratosDosClientesAtendidos } from './contratos-clientes-atendidos.ts'
// Projeção operacional para a carteira privada do GT3. Não reutiliza agregados
// administrativos: a proveniência de cada conversa vem de cliente_timeline,
// que aplica canais confirmados/vínculo do Chat, exclusões internas e instâncias.
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import type { EscopoAgente } from './wa-agente-escopo.ts'
import { instanciasParaRpc, podeVerInstancia } from './wa-agente-escopo.ts'
import type { ColetaAlertas, IgnoradoLido } from './wa-relatorio-dados.ts'
import {
  type AlertaCandidato, type Ignorado, filtrarAlertas, ignoradoValendo, situacaoContratual,
  prioridadePorVinculo, contratoNoPrazo, statusEncerrado, JANELA_SEM_RESPOSTA_DIAS,
} from './wa-alertas.ts'
import {
  type OpcoesRelatorio, type RegraAnomalia, type TipoAlerta, dataBR, descreverHoras,
  nomeSeguro, plural, FUSO_PADRAO, OPCOES_RELATORIO_PADRAO,
  LIMIAR_PADRAO, TIPOS_ANOMALIA, type TipoAnomalia,
} from './wa-relatorio.ts'
import { podeConsultarAlertasCarteiraGt3 } from './iris-gt3-politica.ts'

const DIA = 86_400_000
// Não depender de a Data API devolver lotes maiores que 1000 linhas.
const MAX_TIMELINE = 1000
const MAX_LINHAS = 999
const STATUS_ABERTOS = ['aberta', 'em_atendimento', 'aguardando']
export interface ColetaAlertasCarteiraGt3 extends ColetaAlertas { avisos: string[] }
interface Cliente { id: string; nome: string | null; ativo: boolean | null }
interface Conversa {
  id: string; contact_id: string; ultima_msg_cliente_em: string | null
  aguardando_resposta: boolean | null; silenciado: boolean | null; sentimento: string | null
  arquivada: boolean | null; status: string | null
}
interface Contato { id: string; instance_id: string | null; bloqueado: boolean | null }
interface Mensagem { id: string; conversation_id: string }

function ler<T>(r: { data: T | null; error: unknown }): T {
  if (r.error || r.data === null) throw new Error('Não foi possível conferir os alertas da carteira.')
  return r.data
}
function limitada<T>(r: { data: T[] | null; error: unknown }): T[] {
  const rows = ler(r)
  if (rows.length > MAX_LINHAS) throw new Error('A coleta da carteira excedeu o limite seguro.')
  return rows
}
async function lotes<T>(ids: readonly string[], buscar: (ids: string[]) => Promise<T[]>): Promise<T[]> {
  const out: T[] = []
  for (let i = 0; i < ids.length; i += 80) out.push(...await buscar(ids.slice(i, i + 80)))
  return out
}
function recente(a: string | null | undefined, b: string | null | undefined): string | null {
  if (!a) return b ?? null
  if (!b) return a
  return Date.parse(a) >= Date.parse(b) ? a : b
}
function funcaoAusente(error: unknown): boolean {
  return ['PGRST202', '42883'].includes(String((error as { code?: string } | null)?.code))
}

/** Alertas pessoais do GT3: regras operacionais conhecidas, sem ler configuração
 * ou análises do painel administrativo. Carteira e instâncias vêm do servidor. */
export function coletarAlertasPessoaisGt3(
  admin: SupabaseClient, escopo: EscopoAgente, agora = new Date(), fuso = FUSO_PADRAO,
  tipos: readonly TipoAnomalia[] = TIPOS_ANOMALIA,
): Promise<ColetaAlertasCarteiraGt3> {
  const regras = TIPOS_ANOMALIA.filter((tipo) => tipos.includes(tipo))
    .map((tipo) => ({ tipo, ativo: true, limiar: LIMIAR_PADRAO[tipo], ...(tipo === 'sem_resposta' ? { janelaDias: 7 } : {}) }))
  return coletarAlertasCarteiraGt3(admin, escopo, regras, agora, fuso)
}

export async function coletarAlertasCarteiraGt3(
  admin: SupabaseClient, escopo: EscopoAgente, regras: readonly RegraAnomalia[],
  agora = new Date(), fuso = FUSO_PADRAO, opcoes: OpcoesRelatorio = OPCOES_RELATORIO_PADRAO,
): Promise<ColetaAlertasCarteiraGt3> {
  if (!escopo.tenantId || !podeConsultarAlertasCarteiraGt3(escopo)) {
    throw new Error('Não foi possível confirmar a carteira autorizada.')
  }
  const candidatos: Partial<Record<TipoAlerta, AlertaCandidato[]>> = {}
  const avisos = new Set<string>()
  const ativas = regras.filter((r) => r.ativo)
  for (const regra of ativas) candidatos[regra.tipo] = []
  const ids = [...escopo.clientIds]
  const clientes = await lotes<Cliente>(ids, async (lote) => ler(await admin.from('clients')
    .select('id,nome,ativo').eq('tenant_id', escopo.tenantId).in('id', lote).limit(lote.length)))
  const porCliente = new Map(clientes.filter((c) => escopo.clientIds.has(c.id)).map((c) => [c.id, c]))
  // Associação explícita, com status/datas operacionais; sem dados financeiros do principal.
  const contratos = await contratosDosClientesAtendidos(admin, escopo.tenantId, [...porCliente.keys()])
  const nome = (id: string) => nomeSeguro(porCliente.get(id)?.nome, 100) ?? 'Cliente'
  const sinais = (id: string) => ({
    clienteAtivo: porCliente.get(id)?.ativo ?? null,
    situacao: situacaoContratual(contratos.filter((c) => c.cliente_id === id).map((c) => c.status)),
  })
  const colunasIgnorado = 'id,tipo,client_id,contact_id,modo,ate,created_at'
  const ignoradosCliente = escopo.permissoes.automacoes ? await lotes<Ignorado>([...porCliente.keys()], async (lote) => limitada(await admin.from('wa_auto_alertas_ignorados')
    .select(colunasIgnorado).eq('tenant_id', escopo.tenantId).in('client_id', lote).limit(MAX_LINHAS + 1))) : []
  const dinamicos = ignoradosCliente.filter((i) => i.modo === 'resolvido' || i.modo === 'ate_novidade')
  if (ativas.some((r) => r.tipo === 'queda_volume') && porCliente.size) {
    avisos.add('Queda de volume não consultada: ainda não há contagem completa limitada às suas conversas autorizadas.')
  }
  const regraSemResposta = ativas.find((r) => r.tipo === 'sem_resposta')
  const querSentimento = ativas.some((r) => r.tipo === 'sentimento_negativo')
  const precisaChat = !!regraSemResposta || querSentimento || dinamicos.length > 0
  const janela = Math.max(1, Math.min(90, regraSemResposta?.janelaDias ?? JANELA_SEM_RESPOSTA_DIAS))
  const conversasPorCliente = new Map<string, Conversa[]>()
  const contatos = new Map<string, Contato>()
  const novidadeCliente = new Map<string, string | null>()
  const novidadeContato = new Map<string, string | null>()
  if (precisaChat && porCliente.size) {
    if (!escopo.permissoes.chat || escopo.instancias?.size === 0) {
      avisos.add('Alertas de conversa não consultados: não há acesso ao Chat ou a uma instância autorizada.')
    } else {
      if (querSentimento) avisos.add('Satisfação com cobertura limitada: somente a categoria das conversas visíveis foi consultada; análises administrativas agregadas não foram usadas.')
      for (const id of porCliente.keys()) {
        // Uma decisão antiga de ignorar só continua valendo se não houve
        // novidade desde sua criação, mesmo quando apenas pendências estão ligadas.
        const inicio = dinamicos.filter((i) => i.client_id === id).reduce((menor, i) => {
          const t = Date.parse(i.created_at)
          return Number.isFinite(t) ? Math.min(menor, t) : menor
        }, agora.getTime() - janela * DIA)
        const desde = new Date(inicio).toISOString()
        // A RPC retorna também texto, que é descartado imediatamente. Somente os
        // IDs comprovados por essa fronteira podem originar consultas posteriores.
        const timeline = await admin.rpc('cliente_timeline', {
          p_tenant: escopo.tenantId, p_client: id, p_desde: desde, p_ate: agora.toISOString(),
          p_limite: MAX_TIMELINE, p_instancias: instanciasParaRpc(escopo),
        })
        if (timeline.error && funcaoAusente(timeline.error)) {
          avisos.add('Alertas de conversa não consultados: a fonte de canais autorizados está indisponível.')
          break
        }
        const linhas = ler<unknown[]>(timeline)
        if (!Array.isArray(linhas)) throw new Error('Fonte de conversa inválida.')
        if (linhas.length >= MAX_TIMELINE) avisos.add('Cobertura parcial das conversas: o limite de mensagens visíveis foi atingido; a ausência de alerta não confirma ausência de pendências.')
        const messageIds = [...new Set(linhas.flatMap((x) => {
          const v = x && typeof x === 'object' ? (x as Record<string, unknown>).message_id : null
          return typeof v === 'string' && v ? [v] : []
        }))]
        const mensagens = await lotes<Mensagem>(messageIds, async (lote) => ler(await admin.from('chat_messages')
          .select('id,conversation_id').eq('tenant_id', escopo.tenantId).in('id', lote).limit(lote.length)))
        const permitidos = new Set(messageIds)
        const convIds = [...new Set(mensagens.filter((m) => permitidos.has(m.id)).map((m) => m.conversation_id))]
        const convs = await lotes<Conversa>(convIds, async (lote) => ler(await admin.from('chat_conversations')
          .select('id,contact_id,ultima_msg_cliente_em,aguardando_resposta,silenciado,sentimento,arquivada,status')
          .eq('tenant_id', escopo.tenantId).in('id', lote).limit(lote.length)))
        const contactIds = [...new Set(convs.map((c) => c.contact_id))]
        const visiveis = await lotes<Contato>(contactIds, async (lote) => {
          let q = admin.from('chat_contacts').select('id,instance_id,bloqueado')
            .eq('tenant_id', escopo.tenantId).in('id', lote).eq('restrito_admin', false)
          if (escopo.instancias) q = q.in('instance_id', [...escopo.instancias])
          return ler(await q.limit(lote.length))
        })
        for (const c of visiveis) if (podeVerInstancia(escopo, c.instance_id)) contatos.set(c.id, c)
        const validas = convs.filter((c) => contatos.has(c.contact_id))
        conversasPorCliente.set(id, validas.filter((c) => c.arquivada === false && STATUS_ABERTOS.includes(c.status ?? '')))
        for (const c of validas) {
          novidadeCliente.set(id, recente(novidadeCliente.get(id), c.ultima_msg_cliente_em))
          novidadeContato.set(c.contact_id, recente(novidadeContato.get(c.contact_id), c.ultima_msg_cliente_em))
        }
      }
    }
  }
  for (const [clientId, conversas] of conversasPorCliente) {
    const s = sinais(clientId)
    for (const c of conversas) {
      const desde = c.ultima_msg_cliente_em
      const espera = agora.getTime() - Date.parse(desde ?? '')
      const base = {
        cliente: nome(clientId), client_id: clientId, contact_id: c.contact_id,
        conversation_id: c.id, contract_id: null, desde,
        prioridade: prioridadePorVinculo(clientId, s.situacao), ...s,
        contatoBloqueado: contatos.get(c.contact_id)?.bloqueado === true, silenciada: c.silenciado === true,
      }
      if (regraSemResposta && c.aguardando_resposta === true && Number.isFinite(espera) && espera >= Math.max(0, regraSemResposta.limiar) * 3_600_000 && espera <= janela * DIA) {
        candidatos.sem_resposta!.push({ ...base, tipo: 'sem_resposta', detalhe: `esperando há ${descreverHoras(espera / 3_600_000)}` })
      }
      if (querSentimento && c.sentimento === 'negativo' && Number.isFinite(espera) && espera >= 0 && espera <= DIA) {
        candidatos.sentimento_negativo!.push({ ...base, tipo: 'sentimento_negativo', detalhe: 'conversa com tom negativo' })
      }
    }
  }
  if (ativas.some((r) => r.tipo === 'pendencia')) for (const c of contratos) {
    if (!porCliente.has(c.cliente_id)) continue
    const secundario = c.status_secundario
    const dias = Math.floor((agora.getTime() - Date.parse(`${c.data_fechamento?.slice(0, 10)}T12:00:00Z`)) / DIA)
    const parado = secundario === 'INADIMPLENTE' || secundario === 'PAUSADO'
    if (!parado && !(secundario === 'Não iniciado' && dias >= 7)) continue
    candidatos.pendencia!.push({
      tipo: 'pendencia', cliente: nome(c.cliente_id), client_id: c.cliente_id,
      contact_id: null, conversation_id: null, contract_id: c.id,
      detalhe: secundario === 'INADIMPLENTE' ? 'contrato inadimplente' : secundario === 'PAUSADO' ? 'contrato pausado' : `contrato não iniciado há ${plural(dias, 'dia', 'dias')}`,
      desde: parado ? c.atualizado_em : `${c.data_fechamento?.slice(0, 10)}T12:00:00Z`,
      prioridade: secundario === 'INADIMPLENTE' ? 3 : secundario === 'PAUSADO' ? 1 : 2,
      ...sinais(c.cliente_id), contratoPausado: secundario === 'PAUSADO',
      contratoForaDoPrazo: statusEncerrado(c.status) || (secundario === 'INADIMPLENTE' && !contratoNoPrazo(c, agora)),
    })
  }
  // Ignorados só da carteira ou dos contatos cuja visibilidade foi demonstrada.
  // Não lemos autoria/motivo livres. Novidades vêm só das mesmas fontes visíveis.
  const ignoradosContato = escopo.permissoes.automacoes ? await lotes<Ignorado>([...contatos.keys()], async (lote) => limitada(await admin.from('wa_auto_alertas_ignorados')
    .select(colunasIgnorado).eq('tenant_id', escopo.tenantId).is('client_id', null).in('contact_id', lote).limit(MAX_LINHAS + 1))) : []
  const mudancas = dinamicos.length ? await lotes<{ contrato_id: string; alterado_em: string }>([...new Set(contratos.map((c) => c.id))], async (lote) => limitada(await admin.from('contratos_audit_log')
    .select('contrato_id,alterado_em').eq('tenant_id', escopo.tenantId).in('contrato_id', lote)
    .or('operacao.eq.INSERT,campo.in.(status,status_secundario)').limit(MAX_LINHAS + 1))) : []
  for (const m of mudancas) {
    for (const c of contratos.filter((c) => c.id === m.contrato_id)) {
      novidadeCliente.set(c.cliente_id, recente(novidadeCliente.get(c.cliente_id), m.alterado_em))
    }
  }
  const ignorados: IgnoradoLido[] = [...new Map([...ignoradosCliente, ...ignoradosContato].map((i) => [i.id, i])).values()].map((i) => ({
    ...i, motivo: null, criado_por: null, cliente: i.client_id ? nome(i.client_id) : 'Cliente',
    novidade_em: i.client_id ? novidadeCliente.get(i.client_id) ?? null : novidadeContato.get(i.contact_id ?? '') ?? null,
  }))
  const r = filtrarAlertas(candidatos, ignorados, agora, { soClientesAtivos: opcoes.soClientesAtivos })
  return {
    dados: { data: dataBR(agora, fuso), alertas: r.alertas, reunioes: [] },
    ocultos: r.ocultos, ignorados: ignorados.filter((i) => ignoradoValendo(i, agora)), avisos: [...avisos],
  }
}
