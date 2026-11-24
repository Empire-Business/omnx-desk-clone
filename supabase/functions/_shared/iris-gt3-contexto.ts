// Contexto efêmero da carteira GT3: somente conversas que o usuário pode ler.
// Não consulta relacionamentos/agregados administrativos, não chama IA e não grava.
import type { ContextoFerramentas } from './wa-agente-ferramentas.ts'
import { podeVerCliente } from './wa-agente-escopo.ts'
import { lerLinhaDoTempo } from './wa-agente-ferr-historico.ts'
import {
  corpoDaMensagem, metricasLinhaDoTempo, montarTranscricaoCliente,
  type LinhaTimeline, type MetricasLinhaDoTempo,
} from './cliente-timeline.ts'
import { sanitizarTextoCarteiraGt3 } from './iris-gt3-politica.ts'

const DIA = 86_400_000
const MAX_CLIENTES = 100
const MAX_LEITURA = 400
const MAX_AMOSTRA = 12
const MAX_TRANSCRICAO = 3_500
const MAX_SAIDA = 120_000
const CONCORRENCIA = 4
const AUTORIAS = new Set(['cliente', 'equipe', 'ia', 'sistema'])

export interface ContextoClienteGt3 extends Record<string, unknown> {
  fonte: 'conversas_autorizadas'
  periodo_dias: number
  metricas: MetricasLinhaDoTempo | null
  transcricao: string
  satisfacao: 'sem_dados' | 'avaliar_contexto'
  risco: null
  avaliacao_pendente: boolean
  falha_leitura?: true
  cobertura: {
    consultado: boolean
    parcial: boolean
    mensagens_lidas: number
    mensagens_na_amostra: number
    avisos: string[]
  }
}

function vazio(dias: number, aviso: string, consultado = false, falha = false): ContextoClienteGt3 {
  return {
    fonte: 'conversas_autorizadas', periodo_dias: dias, metricas: null, transcricao: '',
    satisfacao: 'sem_dados', risco: null, avaliacao_pendente: false,
    ...(falha ? { falha_leitura: true as const } : {}),
    cobertura: { consultado, parcial: true, mensagens_lidas: 0, mensagens_na_amostra: 0, avisos: [aviso] },
  }
}

function avisar(c: ContextoClienteGt3, aviso: string): void {
  c.cobertura.parcial = true
  if (!c.cobertura.avisos.includes(aviso)) c.cobertura.avisos.push(aviso)
}

// Mantém mensagens inteiras, sempre as mais recentes, também depois da máscara.
function ultimasLinhas(texto: string, max: number): string {
  const linhas = texto.split('\n').filter((l) => l.startsWith('['))
  const saida: string[] = []
  let tamanho = 0
  for (let i = linhas.length - 1; i >= 0; i--) {
    const custo = linhas[i].length + (saida.length ? 1 : 0)
    if (tamanho + custo > max) break
    saida.unshift(linhas[i])
    tamanho += custo
  }
  return saida.join('\n')
}

function atualizarAmostra(c: ContextoClienteGt3): void {
  const linhas = c.transcricao ? c.transcricao.split('\n') : []
  c.cobertura.mensagens_na_amostra = linhas.length
  // Só rótulos produzidos pelo formatter contam; o corpo neutraliza rótulos falsos.
  const temCliente = linhas.some((l) => /^\[\d{2}\/\d{2} \d{2}:\d{2}\] \[(?:[GP][1-9]\d{0,2}|\?)\] Cliente(?: \(Pessoa \d+\))?:/.test(l))
  c.avaliacao_pendente = temCliente
  c.satisfacao = temCliente ? 'avaliar_contexto' : 'sem_dados'
  if (!temCliente) avisar(c, 'Sem fala legível do cliente na amostra; satisfação e risco não podem ser determinados por este contexto.')
}

/** Teto da saída serializada inteira, com divisão do espaço entre os clientes com texto. */
function limitarSaida(resultados: [string, ContextoClienteGt3][]): void {
  const tamanho = () => JSON.stringify(Object.fromEntries(resultados)).length
  if (tamanho() <= MAX_SAIDA) return
  const comTexto = resultados.map(([, c]) => c).filter((c) => c.transcricao)
  for (const c of comTexto) avisar(c, 'Transcrição reduzida pelo limite total de contexto desta página.')
  const base = JSON.stringify(Object.fromEntries(resultados.map(([ref, c]) => [ref, { ...c, transcricao: '' }]))).length
  if (base > MAX_SAIDA) throw new Error('O contexto da carteira excedeu o limite seguro de saída.')
  const porTexto = Math.floor((MAX_SAIDA - base) / Math.max(1, comTexto.length))
  for (const c of comTexto) {
    let texto = c.transcricao
    while (JSON.stringify(texto).length - 2 > porTexto) {
      const quebra = texto.indexOf('\n')
      texto = quebra < 0 ? '' : texto.slice(quebra + 1)
    }
    c.transcricao = texto
    atualizarAmostra(c)
  }
  // Avisos de ausência de fala podem acrescentar bytes depois do corte.
  if (tamanho() > MAX_SAIDA) {
    for (const c of comTexto) {
      if (tamanho() <= MAX_SAIDA) break
      c.transcricao = ''
      atualizarAmostra(c)
    }
  }
  if (tamanho() > MAX_SAIDA) throw new Error('O contexto da carteira excedeu o limite seguro de saída.')
}

export async function contextosCarteiraGt3(
  ctx: ContextoFerramentas,
  clientes: readonly { ref: string }[],
  op: { dias?: number } = {},
): Promise<Map<string, ContextoClienteGt3>> {
  const dias = op.dias ?? 30
  if (ctx.escopo.politica !== 'carteira_gt3' || ctx.escopo.modo !== 'normal' || !ctx.escopo.tenantId
    || !Number.isFinite(ctx.agora.getTime()) || !Number.isInteger(dias) || dias < 1 || dias > 90
    || !Array.isArray(clientes) || clientes.length > MAX_CLIENTES) {
    throw new Error('Escopo ou limites inválidos para o contexto da carteira.')
  }
  // Valida a página inteira antes de qualquer I/O; total nunca amplia a carteira GT3.
  const pagina = new Map<string, string>()
  for (const c of clientes) {
    const id = ctx.refs.resolver(c?.ref)
    if (!id || !podeVerCliente(ctx.escopo, id)) throw new Error('Cliente fora da carteira autorizada.')
    pagina.set(c.ref, id)
  }
  const ctxSeguro: ContextoFerramentas = {
    ...ctx,
    escopo: { ...ctx.escopo, total: false, permissoes: { ...ctx.escopo.permissoes, agregadosRestritos: false } },
  }
  const entradas = [...pagina]
  const resultados = new Array<[string, ContextoClienteGt3]>(entradas.length)
  const desde = new Date(ctx.agora.getTime() - dias * DIA)
  let cursor = 0
  async function ler(): Promise<void> {
    for (;;) {
      const indice = cursor++
      if (indice >= entradas.length) return
      const [ref, id] = entradas[indice]
      if (!ctxSeguro.escopo.permissoes.chat || ctxSeguro.escopo.instancias?.size === 0) {
        resultados[indice] = [ref, vazio(dias, 'Conversas não consultadas: este acesso não permite ler o Chat ou suas instâncias.')]
        continue
      }
      let contexto: ContextoClienteGt3
      try {
        const leitura = await lerLinhaDoTempo(ctxSeguro, id, desde, MAX_LEITURA)
        if (leitura.fonte !== 'timeline') {
          resultados[indice] = [ref, vazio(dias, 'A fonte de conversas autorizadas está indisponível; não foi possível avaliar este cliente.', true, true)]
          continue
        }
        const validas = leitura.linhas.filter((l) => {
          const tempo = new Date(l.criado_em).getTime()
          return tempo >= desde.getTime() && tempo <= ctx.agora.getTime()
        }).sort((a, b) => a.criado_em.localeCompare(b.criado_em)).slice(-MAX_LEITURA)
        // Autoria ausente/indeterminada não é evidência de fala do cliente.
        const conhecidas = validas.filter((l) => AUTORIAS.has(l.autor_tipo ?? ''))
        const legiveis: LinhaTimeline[] = conhecidas.filter((l) => {
          if (l.autor_tipo !== 'cliente') return true
          const tipo = l.tipo.toLowerCase()
          return ['texto', 'text', 'chat', ''].includes(tipo)
            ? !!corpoDaMensagem(l).trim() : !!l.midia_texto?.trim()
        })
        const amostra = legiveis.slice(-MAX_AMOSTRA)
        const metricas = metricasLinhaDoTempo(conhecidas, ctx.agora)
        contexto = {
          fonte: 'conversas_autorizadas', periodo_dias: dias, metricas,
          transcricao: ultimasLinhas(sanitizarTextoCarteiraGt3(montarTranscricaoCliente(amostra, {
            maxChars: MAX_TRANSCRICAO, pseudonimizar: true, fuso: ctx.fuso,
          })), MAX_TRANSCRICAO),
          satisfacao: 'sem_dados', risco: null, avaliacao_pendente: false,
          cobertura: { consultado: true, parcial: false, mensagens_lidas: validas.length, mensagens_na_amostra: 0, avisos: [] },
        }
        if (leitura.linhas.length >= MAX_LEITURA) avisar(contexto, 'Leitura limitada às 400 mensagens mais recentes do período; as métricas podem ser parciais.')
        if (leitura.linhas.length !== validas.length) avisar(contexto, 'Linhas fora do período ou inválidas foram omitidas.')
        if (conhecidas.length !== validas.length) avisar(contexto, 'Mensagens sem autoria identificada foram omitidas; não são evidência de satisfação do cliente.')
        if (metricas.audios_sem_transcricao || legiveis.length !== conhecidas.length) avisar(contexto, 'Há mídia sem texto legível; seu conteúdo não foi avaliado.')
        if (validas.length > amostra.length) avisar(contexto, 'A transcrição é uma amostra das últimas 12 mensagens legíveis; não representa todo o histórico.')
        if (contexto.transcricao.split('\n').filter(Boolean).length < amostra.filter((l) => corpoDaMensagem(l)).length) avisar(contexto, 'Mensagens mais antigas da amostra foram omitidas pelo limite de 3.500 caracteres.')
        if (metricas.sem_resposta_agora.length > 10) {
          metricas.sem_resposta_agora = metricas.sem_resposta_agora.slice(0, 10)
          avisar(contexto, 'A lista de canais sem resposta foi limitada aos 10 com maior espera.')
        }
        atualizarAmostra(contexto)
      } catch {
        contexto = vazio(dias, 'Falha técnica ao ler as conversas autorizadas; satisfação e risco deste cliente ficaram indisponíveis.', true, true)
      }
      resultados[indice] = [ref, contexto]
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCORRENCIA, entradas.length) }, () => ler()))
  limitarSaida(resultados)
  // Rechecagem da saída: nenhuma ref pode escapar da carteira vigente da execução.
  for (const [ref] of resultados) {
    if (!podeVerCliente(ctxSeguro.escopo, ctx.refs.resolver(ref))) throw new Error('Cliente fora da carteira autorizada.')
  }
  return new Map(resultados)
}
