// Ferramentas de APRENDIZADO do assistente da equipe no WhatsApp (pedido do dono,
// 27/10/2026: "um sistema de aprendizado que muda seu comportamento conforme o
// feedback que dermos no WhatsApp").
//
//   * registrar_aprendizado — guarda uma preferência de estilo/conteúdo dita pela equipe
//     ("responda mais curto", "não use emoji"). Entra no prompt das próximas respostas
//     (seção PREFERÊNCIAS APRENDIDAS DA EQUIPE), SEMPRE abaixo das regras de segurança;
//   * listar_aprendizados / esquecer_aprendizado — ver e desligar;
//   * ajustar_relatorio — muda o AVISO DIÁRIO (horário, agrupar por estrategista, só
//     clientes ativos, tipos de alerta e horas de "sem resposta"). Nunca destinos,
//     provedor, grupos, membros ou privado.
//
// Segurança:
//   * só em modo normal (grupo com gente de fora → nenhuma ferramenta daqui);
//   * a IA escolhe só o TEXTO e a categoria. Empresa, autor e pedido vêm do servidor
//     (ctx.escopo / ctx.remetenteNome / ctx.pedidoId);
//   * validação DETERMINÍSTICA da instrução (motivoRecusa): recusa o que tente mexer em
//     regras, segurança, permissões, privacidade, destinos, envio a clientes, dados
//     sensíveis, prompt/sistema, links ou "finja ser…". O banco ainda limita tamanho e
//     50 ativos por empresa (migration 20261027101000);
//   * quem pode: membro cadastrado (privado ou grupo interno). Decisão do dono (27/10/2026):
//     no grupo "Todos no grupo veem tudo" (acesso_total) QUALQUER pessoa do grupo pode
//     registrar/esquecer e usar ajustar_relatorio, sem cadastro nem permissão 'editar' —
//     o autor fica com o nome legível do remetente (pushName, nunca telefone);
//   * fora disso, ajustar_relatorio exige has_permissao_de(user,'automacoes-wa','editar');
//     só os campos da lista branca. A validação da instrução vale para TODOS;
//   * service_role: TODA consulta/escrita filtra tenant_id (F2);
//   * simulação (tela): valida tudo, mas NÃO grava.
// Os executores nunca lançam: devolvem { erro } (texto curto em pt-BR).
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import type { EscopoAgente } from './wa-agente-escopo.ts'
import type { ContextoFerramentas } from './wa-agente-ferramentas.ts'
import { autorizadoAgora, origemAtual } from './wa-agente-ferr-acoes-cadastro.ts'
import { validarTrechoFato } from './wa-agente-ferr-memoria.ts'

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

export const CATEGORIAS_APRENDIZADO = ['estilo', 'conteudo', 'relatorio', 'outro'] as const
export type CategoriaAprendizado = typeof CATEGORIAS_APRENDIZADO[number]

export const MIN_INSTRUCAO = 5
export const MAX_INSTRUCAO = 400
/** Igual ao trigger do banco. */
export const LIMITE_ATIVOS = 50
/** Jaccard a partir do qual duas instruções são "a mesma". */
export const LIMIAR_DUPLICADO = 0.75
/** Jaccard a partir do qual duas instruções são "parecidas" (talvez contraditórias). */
export const LIMIAR_PARECIDO = 0.4
const MARCADOR_FATO_GRUPO = '[fato do grupo]'
const COLUNAS_APRENDIZADO = 'id, instrucao, categoria, origem, criado_por_nome, created_at'

function fatoDoGrupo(instrucao: string): boolean {
  return limparInstrucao(instrucao).toLowerCase().includes(MARCADOR_FATO_GRUPO)
}

const TIPOS_REGRA = ['sem_resposta', 'sentimento_negativo', 'pendencia', 'queda_volume'] as const
type TipoRegra = typeof TIPOS_REGRA[number]
const ROTULO_REGRA: Record<TipoRegra, string> = {
  sem_resposta: 'cliente sem resposta',
  sentimento_negativo: 'cliente insatisfeito ou em risco',
  pendencia: 'contrato parado',
  queda_volume: 'queda no volume de conversas',
}
/** Limiar padrão de cada tipo quando a linha ainda não existe (igual a src/lib/automacoesWa.ts). */
const LIMIAR_PADRAO: Record<TipoRegra, number> = { sem_resposta: 4, sentimento_negativo: 0, pendencia: 0, queda_volume: 50 }

// ---------------------------------------------------------------------------
// Regras PURAS (exportadas para o Vitest)
// ---------------------------------------------------------------------------

function semAcento(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/** Uma linha só, sem controle/invisíveis, sem "<" ">" e espaços simples. */
export function limparInstrucao(bruto: unknown): string {
  let s = ''
  for (const ch of String(bruto ?? '').normalize('NFC')) {
    const c = ch.codePointAt(0) ?? 0
    const invisivel = c <= 0x1f || (c >= 0x7f && c <= 0x9f) || (c >= 0x200b && c <= 0x200f) ||
      (c >= 0x2028 && c <= 0x202e) || (c >= 0x2060 && c <= 0x206f) || c === 0xfeff
    s += invisivel ? ' ' : ch
  }
  return s.replace(/[<>]/g, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * Padrões que uma preferência NUNCA pode ter (texto sem acento, minúsculo). Lista
 * conservadora de propósito: na dúvida, recusa — a pessoa pode reescrever.
 */
const PADROES_PERIGOSOS: readonly (readonly [RegExp, string])[] = [
  [/(ignor|desconsider)\w*.{0,40}(regra|instruc|anterior|seguranc|mandaram)|deixe de seguir|pare de seguir|esquec\w* (as|suas|essas|todas|tudo)/, 'deixar de seguir as minhas regras'],
  [/\bregras?\s+(?:\d|anterior|interna|do assistente|de seguranc)/, 'as minhas regras'],
  [/seguranc/, 'segurança'],
  [/permiss|\bacesso|\blibera|\badmin|carteira (de|da) (todos|toda|outr)|outra empresa|\btenant/, 'permissões e acesso'],
  [/privad|confidenc|sigil|secret/, 'privacidade'],
  [/cliente.{0,60}(mand|envi|dispar|encaminh)|(mand|envi|dispar|encaminh)\w*.{0,40}\b(para|pra|pro|pros|aos?|as?) (o |os |a |as )?client/, 'enviar algo para clientes'],
  [/(mand|envi|dispar|encaminh|repass)\w*.{0,60}(grupo|numero|contato|pessoa|telefone|whatsapp|e-?mail)/, 'para onde as mensagens vão'],
  [/telefone|celular|whatsapp d[aoe]|numero d[aoe]|\bcpf|\bcnpj|e-?mail|document|endereco/, 'dados pessoais'],
  [/senha|token|\bchave|\bapi\b|credencia/, 'senhas e chaves'],
  [/prompt|(?:seu|do|o) sistema(?: interno)?|instruc\w* (interna|secreta|original|do sistema)|\bcodigo\b|canario/, 'as minhas instruções internas'],
  [/revel|vaz[ae]/, 'revelar informação'],
  [/finj|aja como|agir como|voce agora e|modo (desenvolvedor|dev|deus|admin)|jailbreak|sem (filtro|restric|limite)/, 'mudar quem eu sou'],
  [/https?:|www\.|\.com\b|\.br\b/, 'links'],
  [/(apag|delet|exclu|remov)\w*.{0,30}(dados|clientes?|contratos?|registros?|banco)/, 'apagar dados'],
]

/** Motivo (curto) para recusar a instrução, ou null quando ela pode ser aprendida. */
export function motivoRecusa(instrucao: string): string | null {
  const s = semAcento(instrucao)
  for (const [re, motivo] of PADROES_PERIGOSOS) if (re.test(s)) return motivo
  return null
}

/** Novas preferências são apresentação delimitada; fatos não têm fallback aqui.
 * O vocabulário fechado não tenta compreender fatos operacionais: eles pertencem
 * à ferramenta própria, que preserva a declaração literal e sua proveniência. */
export function assinaturaApresentacao(texto: string): string | null {
  const s = semAcento(limparInstrucao(texto)).replace(/[.!]+$/, '').replace(/^iris\s*[,;:]\s*/, '')
    .replace(/^(?:sempre |no grupo,? )/, '').replace(/\b(?:responda|escreva|escrever)\b/g, 'responder')
    .replace(/\buse\b/g, 'usar').replace(/\bchame\b/g, 'chamar').replace(/\bcomece\b/g, 'comecar')
    .replace(/\bexplique\b/g, 'explicar').replace(/\bignore\b/g, 'ignorar')
  if (/^(?:nao )?usar (?:emojis?|negrito|listas|topicos|tabelas)$/.test(s)
    || /^responder (?:(?:mais )?(?:curto|objetivo|detalhado|formal|informal)|em (?:no maximo )?\d{1,3} (?:linhas|palavras)|em (?:topicos|listas|portugues))$/.test(s)
    || /^chamar os clientes pelo (?:primeiro )?nome$/.test(s)
    || /^(?:comecar|destacar|priorizar) (?:pelos?|os?) (?:clientes )?(?:insatisfeitos|ativos|sem resposta|em risco|atrasados)$/.test(s)
    || /^explicar (?:as )?regras comerciais em topicos$/.test(s)
    || /^ignorar saudacoes repetidas$/.test(s)) return s
  return null
}

/** Subconjunto explícito de ajustes que pode ser comprovado após uma consulta. */
export function ajusteRelatorioDoTrecho(texto: string): Record<string, unknown> | null {
  const s = semAcento(limparInstrucao(texto)).replace(/[.!]+$/, '').replace(/^iris\s*[,;:]\s*/, '')
  let m: RegExpExecArray | null
  if ((m = /^(?:mude|altere|ajuste) (?:o )?horario (?:do aviso|do relatorio)(?: diario)? para ([0-2]\d:[0-5]\d)$/.exec(s))) return { horario: m[1] }
  if (/^(?:agrupe|agrupar) (?:o aviso|o relatorio|os clientes)(?: diario)? por estrategista$/.test(s)) return { agrupar_por_estrategista: true }
  if (/^(?:mostre|mostrar) (?:so|somente|apenas) clientes ativos (?:no aviso|no relatorio)$/.test(s)) return { so_clientes_ativos: true }
  if ((m = /^(?:mostre|mostrar|considere|considerar) (?:so |somente |apenas )?(?:as )?movimentacoes (?:dos )?ultimos (\d{1,2}) dias(?: no aviso| no relatorio)?$/.exec(s))) return { janela_movimentacao_dias: Number(m[1]) }
  return null
}

async function pedidoLiteralAprendizado(nome: string, args: Args, ctx: ContextoFerramentas): Promise<boolean> {
  if (typeof args.trecho !== 'string') return false
  const origem = await origemAtual({ ...ctx, agora: new Date() })
  if (!origem || !await autorizadoAgora(ctx, origem) || !validarTrechoFato(origem.texto, args.trecho).ok) return false
  if (nome === 'registrar_aprendizado') {
    const assinatura = assinaturaApresentacao(args.trecho)
    return !!assinatura && assinatura === assinaturaApresentacao(String(args.instrucao ?? ''))
  }
  if (nome === 'ajustar_relatorio') {
    const plano = ajusteRelatorioDoTrecho(args.trecho)
    const campos = Object.keys(args).filter(k => k !== 'trecho')
    return !!plano && campos.length === Object.keys(plano).length && campos.every(k => args[k] === plano[k])
  }
  if (nome === 'esquecer_aprendizado') {
    const cod = typeof args.id_curto === 'string' ? args.id_curto.toLowerCase() : ''
    const frase = semAcento(limparInstrucao(args.trecho)).replace(/[.!]+$/, '').replace(/^iris\s*[,;:]\s*/, '')
    return /^[a-f0-9]{6}$/.test(cod) && new RegExp(`^(?:esqueca|esquecer|remova|desative) (?:(?:o )?aprendizado|(?:a )?preferencia) ${cod}$`).test(frase)
  }
  return false
}

export type ResultadoValidacao =
  | { ok: true; instrucao: string; categoria: CategoriaAprendizado }
  | { ok: false; erro: string }

/** Validação completa do que a IA mandou registrar. */
export function validarAprendizado(instrucaoBruta: unknown, categoriaBruta: unknown): ResultadoValidacao {
  const instrucao = limparInstrucao(instrucaoBruta)
  if (fatoDoGrupo(instrucao)) {
    return { ok: false, erro: 'Fatos operacionais usam registrar_fato_equipe, com origem e grupo verificados.' }
  }
  const tamanho = Array.from(instrucao).length
  if (tamanho < MIN_INSTRUCAO) return { ok: false, erro: 'Instrução curta demais.' }
  if (tamanho > MAX_INSTRUCAO) return { ok: false, erro: `Instrução longa demais (máximo ${MAX_INSTRUCAO} caracteres). Resuma.` }
  const categoria = typeof categoriaBruta === 'string' && (CATEGORIAS_APRENDIZADO as readonly string[]).includes(categoriaBruta)
    ? categoriaBruta as CategoriaAprendizado : 'outro'
  const motivo = motivoRecusa(instrucao)
  if (motivo) {
    return {
      ok: false,
      erro: `Não posso aprender isso: mexe com ${motivo}. Preferências só mudam o meu jeito de responder (tom, tamanho, ordem, o que destacar) — nunca regras de segurança, permissões, destinos ou envios.`,
    }
  }
  return { ok: true, instrucao, categoria }
}

const PARADAS = new Set([
  'a', 'o', 'e', 'de', 'da', 'do', 'das', 'dos', 'em', 'no', 'na', 'nos', 'nas', 'um', 'uma', 'os', 'as', 'que',
  'para', 'pra', 'pro', 'por', 'com', 'se', 'sempre', 'ao', 'aos', 'me', 'voce', 'mais', 'bem',
])

/** Palavras significativas (sem acento, sem pontuação, sem "de/para/sempre"…). "não" CONTA. */
export function palavrasDe(s: string): Set<string> {
  return new Set(semAcento(s).replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((p) => p.length >= 2 && !PARADAS.has(p)))
}

/** Semelhança de Jaccard (0..1) entre duas instruções. */
export function similaridade(a: string, b: string): number {
  const x = palavrasDe(a)
  const y = palavrasDe(b)
  if (x.size === 0 && y.size === 0) return 1
  let comum = 0
  for (const p of x) if (y.has(p)) comum++
  return comum / (x.size + y.size - comum)
}

/**
 * Nome legível do remetente para "quem ensinou": sem telefone (sequências de 6+
 * dígitos somem), uma linha, até 80 caracteres. Sem letras → null.
 */
export function nomeLegivel(bruto: string | null | undefined): string | null {
  const s = limparInstrucao(String(bruto ?? '').replace(/@\S*/g, ' ').replace(/\+?\d[\d\s().-]{5,}\d/g, ' '))
    .replace(/[*_~`{}[\]|\\"]/g, '').replace(/\s+/g, ' ').trim()
  if (!/\p{L}/u.test(s)) return null
  return Array.from(s).slice(0, 80).join('').trim()
}

/** Id curto mostrado à equipe/IA: 6 primeiros caracteres hexadecimais do uuid. */
export function idCurto(id: string): string {
  return String(id ?? '').replace(/[^0-9a-f]/gi, '').slice(0, 6).toLowerCase()
}

export interface LinhaAprendizado {
  id: string
  instrucao: string
  categoria: string
  origem?: string | null
  criado_por_nome?: string | null
  created_at?: string | null
}

/** Já existe uma igual (duplicada) e quais são parecidas (talvez contraditórias). */
export function compararComExistentes(
  instrucao: string, existentes: readonly LinhaAprendizado[],
): { duplicada: LinhaAprendizado | null; parecidas: LinhaAprendizado[] } {
  let duplicada: LinhaAprendizado | null = null
  const parecidas: LinhaAprendizado[] = []
  for (const e of existentes) {
    const s = similaridade(instrucao, e.instrucao)
    if (s >= LIMIAR_DUPLICADO) { duplicada ??= e; continue }
    if (s >= LIMIAR_PARECIDO) parecidas.push(e)
  }
  return { duplicada, parecidas: parecidas.slice(0, 5) }
}

export interface PlanoRelatorio {
  /** Colunas de wa_auto_config. */
  config: Record<string, unknown>
  regras: { tipo: TipoRegra; ativo?: boolean; limiar?: number; janela_dias?: number }[]
  /** Frases do que muda (pt-BR). */
  mudancas: string[]
}

const CAMPOS_RELATORIO = ['agrupar_por_estrategista', 'so_clientes_ativos', 'horario', 'regras', 'limite_sem_resposta_horas', 'janela_movimentacao_dias'] as const
const RE_HORARIO = /^([01][0-9]|2[0-3]):([0-5][0-9])$/

/** Argumentos de ajustar_relatorio → o que gravar. Só a lista branca; nada de destino. */
export function planoAjusteRelatorio(args: Record<string, unknown>): PlanoRelatorio | { erro: string } {
  const LISTA = 'só consigo mudar no aviso: horário, agrupar por estrategista, só clientes ativos, tipos de alerta, horas de "sem resposta" e janela de movimentação recente'
  for (const k of Object.keys(args)) {
    if (!(CAMPOS_RELATORIO as readonly string[]).includes(k)) {
      return { erro: `Não posso mudar "${k.replace(/[^a-z_]/gi, '').slice(0, 30)}": ${LISTA}. Destinos, grupos e quem recebe só pela tela.` }
    }
  }
  const config: Record<string, unknown> = {}
  const mudancas: string[] = []
  const regras = new Map<TipoRegra, PlanoRelatorio['regras'][number]>()
  const sn = (v: boolean) => (v ? 'sim' : 'não')

  if (args.agrupar_por_estrategista !== undefined) {
    if (typeof args.agrupar_por_estrategista !== 'boolean') return { erro: 'agrupar_por_estrategista precisa ser sim/não.' }
    config.relatorio_agrupar_estrategista = args.agrupar_por_estrategista
    mudancas.push(`agrupar por estrategista: ${sn(args.agrupar_por_estrategista)}`)
  }
  if (args.so_clientes_ativos !== undefined) {
    if (typeof args.so_clientes_ativos !== 'boolean') return { erro: 'so_clientes_ativos precisa ser sim/não.' }
    config.relatorio_so_clientes_ativos = args.so_clientes_ativos
    mudancas.push(`só clientes ativos: ${sn(args.so_clientes_ativos)}`)
  }
  if (args.horario !== undefined) {
    const m = typeof args.horario === 'string' ? RE_HORARIO.exec(args.horario.trim()) : null
    if (!m) return { erro: 'Horário inválido: use HH:MM (ex.: 08:30).' }
    config.relatorio_hora = `${m[1]}:${m[2]}`
    mudancas.push(`horário do aviso: ${m[1]}:${m[2]}`)
  }
  if (args.regras !== undefined) {
    const r = args.regras
    if (!r || typeof r !== 'object' || Array.isArray(r)) return { erro: 'regras inválidas.' }
    for (const [tipo, v] of Object.entries(r as Record<string, unknown>)) {
      if (!(TIPOS_REGRA as readonly string[]).includes(tipo)) return { erro: `Tipo de alerta desconhecido: ${tipo.replace(/[^a-z_]/gi, '').slice(0, 30)}.` }
      if (typeof v !== 'boolean') return { erro: 'Cada tipo de alerta precisa ser ligado (true) ou desligado (false).' }
      const t = tipo as TipoRegra
      regras.set(t, { ...(regras.get(t) ?? { tipo: t }), ativo: v })
      mudancas.push(`alerta "${ROTULO_REGRA[t]}": ${v ? 'ligado' : 'desligado'}`)
    }
  }
  if (args.limite_sem_resposta_horas !== undefined) {
    const n = args.limite_sem_resposta_horas
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > 168) return { erro: 'Horas de "sem resposta" devem ser um número inteiro de 1 a 168.' }
    regras.set('sem_resposta', { ...(regras.get('sem_resposta') ?? { tipo: 'sem_resposta' }), limiar: n })
    mudancas.push(`"sem resposta" a partir de ${n}h`)
  }
  if (args.janela_movimentacao_dias !== undefined) {
    const n = args.janela_movimentacao_dias
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > 90) return { erro: 'A janela de movimentação deve ser um número inteiro de 1 a 90 dias.' }
    for (const tipo of ['sem_resposta', 'sentimento_negativo'] as const) {
      regras.set(tipo, { ...(regras.get(tipo) ?? { tipo }), janela_dias: n })
    }
    mudancas.push(`movimentações dos últimos ${n} dias; casos históricos continuam registrados e aparecem separados no aviso`)
  }
  if (mudancas.length === 0) return { erro: `Diga o que mudar: ${LISTA}.` }
  return { config, regras: [...regras.values()], mudancas }
}

/** Texto do aprendizado que acompanha um ajuste do aviso (sem palavras proibidas). */
export function descricaoAjuste(mudancas: readonly string[]): string {
  return limparInstrucao(`Aviso diário ajustado a pedido da equipe: ${mudancas.join('; ')}.`).slice(0, MAX_INSTRUCAO)
}

/** Linhas para o prompt (neutralizadas, uma linha cada, até 50). */
export function linhasParaPrompt(lista: readonly Pick<LinhaAprendizado, 'instrucao' | 'categoria'>[]): string[] {
  return lista.slice(0, LIMITE_ATIVOS)
    .map((a) => {
      const t = limparInstrucao(a.instrucao).slice(0, MAX_INSTRUCAO)
      const c = (CATEGORIAS_APRENDIZADO as readonly string[]).includes(a.categoria) ? a.categoria : 'outro'
      return t ? `[${c}] ${t}` : ''
    })
    .filter(Boolean)
}

// ---------------------------------------------------------------------------
// Definições (formato OpenAI / OpenRouter)
// ---------------------------------------------------------------------------

export type NomeAprendizado = 'registrar_aprendizado' | 'listar_aprendizados' | 'esquecer_aprendizado' | 'ajustar_relatorio'

export interface DefinicaoAprendizado {
  type: 'function'
  function: { name: NomeAprendizado; description: string; parameters: Record<string, unknown> }
}

function def(name: NomeAprendizado, description: string, properties: Record<string, unknown>, required: string[] = []): DefinicaoAprendizado {
  return { type: 'function', function: { name, description, parameters: { type: 'object', properties, required, additionalProperties: false } } }
}

export const DEFINICOES_APRENDIZADO: Record<NomeAprendizado, DefinicaoAprendizado> = {
  registrar_aprendizado: def('registrar_aprendizado',
    'Guarda apenas preferência de apresentação: responder curto/objetivo/detalhado/formal/informal, em N linhas/palavras/tópicos/listas/português; usar ou não emoji/negrito/listas/tópicos/tabelas; chamar clientes pelo primeiro nome; começar pelos clientes insatisfeitos/ativos/sem resposta/em risco/atrasados; explicar regras comerciais em tópicos; ignorar saudações repetidas. Fatos sobre pessoas/clientes usam registrar_fato_equipe, nunca esta ferramenta. Depois de consultar dados, inclua trecho literal completo da mensagem atual e mantenha a mesma preferência; o servidor confere. Para opções do aviso use ajustar_relatorio.', {
      instrucao: { type: 'string', minLength: MIN_INSTRUCAO, maxLength: MAX_INSTRUCAO, description: 'A preferência, em uma frase.' },
      categoria: { type: 'string', enum: CATEGORIAS_APRENDIZADO, description: 'estilo, conteudo (somente ordem/apresentação), relatorio ou outro. Nunca fato operacional.' },
      trecho: { type: 'string', maxLength: 600, description: 'Frase literal completa da mensagem atual que pede esta preferência. Obrigatória depois de consultar dados.' },
    }, ['instrucao', 'categoria']),
  listar_aprendizados: def('listar_aprendizados', 'Lista as preferências que a equipe já te ensinou (com o código curto de cada uma, quem ensinou e quando).', {}),
  esquecer_aprendizado: def('esquecer_aprendizado', 'Desliga (esquece) uma preferência aprendida, pelo código curto que aparece em listar_aprendizados ou registrar_aprendizado. Use também quando a equipe pedir o contrário de algo já aprendido.', {
    id_curto: { type: 'string', pattern: '^[0-9a-fA-F]{6}$', description: 'Código curto (6 caracteres) da preferência.' },
    trecho: { type: 'string', maxLength: 600, description: 'Após consultar dados, copie a frase literal completa atual: “Íris, esqueça o aprendizado CÓDIGO” ou “Íris, esqueça a preferência CÓDIGO”. O código precisa estar na própria mensagem, não apenas na lista consultada.' },
  }, ['id_curto']),
  ajustar_relatorio: def('ajustar_relatorio', 'Muda o AVISO DIÁRIO da empresa: agrupamento, clientes ativos, horário, tipos de alerta, horas sem resposta e janela de movimentações recentes. Para pedidos de apenas movimentações atuais use janela_movimentacao_dias (padrão 7 quando a pessoa não indicar outro período). Casos antigos continuam registrados, em resumo separado; isso não resolve casos nem altera contratos. Mande só o que a pessoa pediu para mudar. Não muda quem recebe nem onde é enviado.', {
    trecho: { type: 'string', maxLength: 600, description: 'Depois de consultar dados, copie a frase literal com UM ajuste explícito: “Íris, mostre apenas movimentações dos últimos 7 dias no aviso”, “Íris, mude o horário do aviso para 08:30”, “Íris, agrupe o aviso por estrategista” ou “Íris, mostre somente clientes ativos no aviso”. Não acrescente campos que não estejam no trecho.' },
    janela_movimentacao_dias: { type: 'integer', minimum: 1, maximum: 90, description: 'Últimos N dias de movimentação real do cliente para detalhar relacionamento e espera no aviso. Casos anteriores ficam separados, sem serem resolvidos ou apagados. Padrão 7 dias.' },
    agrupar_por_estrategista: { type: 'boolean', description: 'Agrupar os clientes do aviso por estrategista.' },
    so_clientes_ativos: { type: 'boolean', description: 'Mostrar só clientes ativos no aviso.' },
    horario: { type: 'string', pattern: '^([01][0-9]|2[0-3]):[0-5][0-9]$', description: 'Horário do aviso (HH:MM, horário de Brasília).' },
    regras: {
      type: 'object',
      description: 'Ligar (true) ou desligar (false) tipos de alerta do aviso.',
      properties: {
        sem_resposta: { type: 'boolean' }, sentimento_negativo: { type: 'boolean' }, pendencia: { type: 'boolean' }, queda_volume: { type: 'boolean' },
      },
      additionalProperties: false,
    },
    limite_sem_resposta_horas: { type: 'integer', minimum: 1, maximum: 168, description: 'Horas sem resposta para virar alerta.' },
  }),
}

/** Ferramentas deste módulo oferecidas à IA. Restrito → nenhuma. */
export function ferramentasAprendizado(e: EscopoAgente): DefinicaoAprendizado[] {
  if (e.modo !== 'normal') return []
  return (Object.keys(DEFINICOES_APRENDIZADO) as NomeAprendizado[]).map((n) => DEFINICOES_APRENDIZADO[n])
}

export function ehFerramentaAprendizado(nome: string): nome is NomeAprendizado {
  return Object.prototype.hasOwnProperty.call(DEFINICOES_APRENDIZADO, nome)
}

// ---------------------------------------------------------------------------
// Leitura para o prompt (responder / simular)
// ---------------------------------------------------------------------------

/** Preferências da empresa e, se fornecido, fatos com origem verificada no grupo atual. */
export async function carregarAprendizados(admin: SupabaseClient, tenantId: string, _chatJid?: string): Promise<LinhaAprendizado[]> {
  if (!tenantId) return []
  try {
    const { data, error } = await admin.from('wa_agente_aprendizados')
      .select(COLUNAS_APRENDIZADO)
      .eq('tenant_id', tenantId).eq('ativo', true).order('created_at', { ascending: true }).limit(LIMITE_ATIVOS)
    if (error) return []
    const lista = (data ?? []) as LinhaAprendizado[]
    // Memórias legadas com marcador não viram preferências globais.
    return lista.filter(a => !fatoDoGrupo(a.instrucao))
  } catch {
    return []
  }
}

/** Só apresentação explícita; fatos corrigidos não podem alterar o conteúdo do relatório. */
export function preferenciasParaRelatorio(lista: readonly Pick<LinhaAprendizado, 'instrucao' | 'categoria'>[]): string[] {
  return lista.filter((a) => a.categoria === 'estilo' || a.categoria === 'relatorio')
    .flatMap((a) => {
      const v = validarAprendizado(a.instrucao, a.categoria)
      return v.ok ? [v.instrucao] : []
    }).slice(0, LIMITE_ATIVOS)
}

// ---------------------------------------------------------------------------
// Executor
// ---------------------------------------------------------------------------

type Saida = Record<string, unknown>
type Args = Record<string, unknown>

function erro(texto: string): Saida { return { erro: texto } }

function lerArgs(bruto: unknown): Args | null {
  if (bruto === undefined || bruto === null || bruto === '') return {}
  let v: unknown = bruto
  if (typeof bruto === 'string') {
    try { v = JSON.parse(bruto) } catch { return null }
  }
  return v && typeof v === 'object' && !Array.isArray(v) ? v as Args : null
}

function ausente(r: { error: unknown }): boolean {
  const code = (r.error as { code?: string } | null)?.code
  return code === 'PGRST205' || code === '42P01'
}

function colunaAusente(r: { error: unknown }): boolean {
  const code = (r.error as { code?: string } | null)?.code
  return code === 'PGRST204' || code === '42703'
}

const TABELA_AUSENTE = 'O aprendizado ainda não está ligado nesta empresa (falta uma atualização do banco).'

function dataCurta(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' }).format(d)
}

function resumo(a: LinhaAprendizado): Saida {
  return {
    id_curto: idCurto(a.id), instrucao: limparInstrucao(a.instrucao), categoria: a.categoria,
    ...(a.criado_por_nome ? { quem: limparInstrucao(a.criado_por_nome).slice(0, 80) } : {}),
    ...(dataCurta(a.created_at) ? { quando: dataCurta(a.created_at) } : {}),
    ...(a.origem ? { origem: a.origem === 'tela' ? 'tela' : 'whatsapp' } : {}),
  }
}

async function ativos(ctx: ContextoFerramentas): Promise<LinhaAprendizado[] | null> {
  const r = await ctx.admin.from('wa_agente_aprendizados')
    .select('id, instrucao, categoria, origem, criado_por_nome, created_at')
    .eq('tenant_id', ctx.escopo.tenantId).eq('ativo', true).order('created_at', { ascending: true }).limit(LIMITE_ATIVOS + 10)
  if (r.error) {
    if (ausente(r)) return null
    throw new Error('leitura')
  }
  return ((r.data ?? []) as LinhaAprendizado[]).filter((a) => !fatoDoGrupo(a.instrucao))
}

/** Grava um aprendizado (já validado). Devolve a linha ou um erro. */
async function inserir(
  ctx: ContextoFerramentas, instrucao: string, categoria: CategoriaAprendizado,
): Promise<{ linha: LinhaAprendizado } | { erro: string }> {
  const r = await ctx.admin.from('wa_agente_aprendizados').insert({
    tenant_id: ctx.escopo.tenantId,
    instrucao,
    categoria,
    origem: 'whatsapp',
    criado_por_user: ctx.escopo.userId ?? null,
    criado_por_nome: nomeLegivel(ctx.remetenteNome) ?? (ctx.escopo.acessoTotalGrupo ? 'Alguém do grupo' : null),
    pedido_id: ctx.pedidoId ?? null,
    ativo: true,
  }).select('id, instrucao, categoria, origem, criado_por_nome, created_at').single()
  if (r.error) {
    if (ausente(r)) return { erro: TABELA_AUSENTE }
    const code = (r.error as { code?: string }).code
    if (code === '23514' || code === 'P0001') return { erro: `Já tenho ${LIMITE_ATIVOS} preferências guardadas. Peça para esquecer alguma antes.` }
    throw new Error('escrita')
  }
  return { linha: r.data as LinhaAprendizado }
}

/**
 * Executa UMA ferramenta deste módulo. Devolve null quando o nome não é daqui (o
 * chamador tenta os outros módulos). Nunca lança.
 */
export async function executarAprendizado(nome: string, argsBrutos: unknown, ctx: ContextoFerramentas): Promise<Saida | null> {
  if (!ehFerramentaAprendizado(nome)) return null
  if (ctx.escopo.modo !== 'normal') return erro('Neste grupo há pessoas de fora da equipe: aqui não guardo preferências nem mudo o aviso.')
  const args = lerArgs(argsBrutos)
  if (!args) return erro('Argumentos inválidos.')
  try {
    if (nome !== 'listar_aprendizados' && (ctx.leuDados || args.trecho !== undefined)) {
      if (!await pedidoLiteralAprendizado(nome, args, ctx)) return erro('Para guardar uma preferência ou mudar o aviso, me peça numa mensagem só com o ajuste, sem pedir dados junto, ou informe o trecho literal com um ajuste que eu consiga conferir.')
    }
    const { trecho: _trecho, ...campos } = args
    switch (nome) {
      case 'registrar_aprendizado': return await registrar(campos, ctx)
      case 'listar_aprendizados': return await listar(ctx)
      case 'esquecer_aprendizado': return await esquecer(args, ctx)
      case 'ajustar_relatorio': return await ajustarRelatorio(campos, ctx)
    }
  } catch (e) {
    console.error('wa-agente-ferr-aprendizado: falha', nome, (e as Error)?.name)
    return erro('Não consegui guardar isso agora. Tente de novo em instantes.')
  }
  return erro('Ferramenta desconhecida.')
}

// ---- registrar_aprendizado --------------------------------------------------

async function registrar(args: Args, ctx: ContextoFerramentas): Promise<Saida> {
  const v = validarAprendizado(args.instrucao, args.categoria)
  if (!v.ok) return erro(v.erro)
  if (!assinaturaApresentacao(v.instrucao)) return erro('Essa ferramenta guarda apenas preferências de apresentação. Informações sobre pessoas e clientes usam registrar_fato_equipe, com origem e grupo verificados.')
  const lista = await ativos(ctx)
  if (lista === null) return erro(TABELA_AUSENTE)
  const { duplicada, parecidas } = compararComExistentes(v.instrucao, lista)
  if (duplicada) return { ok: true, ja_existia: true, aprendizado: resumo(duplicada), aviso: 'Eu já tinha guardado algo igual: nada novo foi gravado.' }
  if (lista.length >= LIMITE_ATIVOS) return erro(`Já tenho ${LIMITE_ATIVOS} preferências guardadas. Peça para esquecer alguma antes.`)
  const extra = parecidas.length > 0
    ? { parecidas: parecidas.map(resumo), dica: 'Se alguma parecida diz o contrário da nova, esqueça a antiga com esquecer_aprendizado.' }
    : {}
  if (ctx.simulacao) return { ok: true, simulacao: true, instrucao: v.instrucao, categoria: v.categoria, aviso: 'Simulação: nada foi gravado.', ...extra }
  const r = await inserir(ctx, v.instrucao, v.categoria)
  if ('erro' in r) return erro(r.erro)
  return { ok: true, aprendizado: resumo(r.linha), ...extra }
}

// ---- listar_aprendizados ----------------------------------------------------

async function listar(ctx: ContextoFerramentas): Promise<Saida> {
  const lista = await ativos(ctx)
  if (lista === null) return erro(TABELA_AUSENTE)
  if (lista.length === 0) return { aprendizados: [], aviso: 'Ainda não aprendi nenhuma preferência da equipe.' }
  return { aprendizados: lista.slice(0, LIMITE_ATIVOS).map(resumo), quantidade: lista.length, limite: LIMITE_ATIVOS }
}

// ---- esquecer_aprendizado ---------------------------------------------------

async function esquecer(args: Args, ctx: ContextoFerramentas): Promise<Saida> {
  const alvo = typeof args.id_curto === 'string' ? args.id_curto.trim().toLowerCase() : ''
  if (!/^[0-9a-f]{6}$/.test(alvo)) return erro('Código inválido: use o código de 6 caracteres de listar_aprendizados.')
  const lista = await ativos(ctx)
  if (lista === null) return erro(TABELA_AUSENTE)
  const achados = lista.filter((a) => idCurto(a.id) === alvo)
  if (achados.length === 0) return erro('Não achei preferência ativa com esse código. Use listar_aprendizados.')
  if (achados.length > 1) return erro('Mais de uma preferência com esse código: peça para desligar pela tela.')
  const a = achados[0]
  if (ctx.simulacao) return { ok: true, simulacao: true, esqueceria: resumo(a), aviso: 'Simulação: nada foi alterado.' }
  const r = await ctx.admin.from('wa_agente_aprendizados')
    .update({ ativo: false, desativado_em: ctx.agora.toISOString() })
    .eq('tenant_id', ctx.escopo.tenantId).eq('id', a.id)
  if (r.error) throw new Error('escrita')
  return { ok: true, esquecido: resumo(a) }
}

// ---- ajustar_relatorio ------------------------------------------------------

/** Membro com automacoes-wa · editar, ou grupo "Todos no grupo veem tudo". */
export async function podeAjustarRelatorio(admin: SupabaseClient, e: EscopoAgente): Promise<boolean> {
  if (e.modo !== 'normal') return false
  if (e.acessoTotalGrupo === true) return true
  if (!e.userId) return false
  const { data, error } = await admin.rpc('has_permissao_de', { p_user_id: e.userId, p_recurso: 'automacoes-wa', p_acao: 'editar' })
  return !error && data === true
}

async function ajustarRelatorio(args: Args, ctx: ContextoFerramentas): Promise<Saida> {
  const plano = planoAjusteRelatorio(args)
  if ('erro' in plano) return erro(plano.erro)
  if (!(await podeAjustarRelatorio(ctx.admin, ctx.escopo))) {
    return erro('Quem pediu não tem permissão para mudar as Automações do WhatsApp. Peça para alguém com acesso de edição (ou mude na tela).')
  }
  const t = ctx.escopo.tenantId
  const cfg = await ctx.admin.from('wa_auto_config').select('id').eq('tenant_id', t).maybeSingle()
  if (cfg.error) throw new Error('leitura')
  if (!cfg.data) return erro('O aviso diário ainda não foi configurado: ligue-o primeiro na tela de Automações.')
  if (ctx.simulacao) return { ok: true, simulacao: true, mudaria: plano.mudancas, aviso: 'Simulação: nada foi alterado.' }

  if (Object.keys(plano.config).length > 0) {
    const r = await ctx.admin.from('wa_auto_config').update(plano.config).eq('tenant_id', t)
    if (r.error) {
      if (colunaAusente(r)) return erro('Essa opção do aviso ainda não está disponível (falta uma atualização do banco). Nada foi mudado.')
      throw new Error('escrita')
    }
  }
  for (const regra of plano.regras) {
    const ex = await ctx.admin.from('wa_auto_regras_anomalia').select('id').eq('tenant_id', t).eq('tipo', regra.tipo).maybeSingle()
    if (ex.error) throw new Error('leitura')
    const campos: Record<string, unknown> = { updated_at: ctx.agora.toISOString() }
    if (regra.ativo !== undefined) campos.ativo = regra.ativo
    if (regra.limiar !== undefined) campos.limiar = regra.limiar
    if (regra.janela_dias !== undefined) campos.janela_dias = regra.janela_dias
    const r = ex.data
      ? await ctx.admin.from('wa_auto_regras_anomalia').update(campos).eq('tenant_id', t).eq('id', (ex.data as { id: string }).id)
      : await ctx.admin.from('wa_auto_regras_anomalia').insert({
        tenant_id: t, tipo: regra.tipo, ativo: regra.ativo ?? false, limiar: regra.limiar ?? LIMIAR_PADRAO[regra.tipo],
        ...(regra.janela_dias !== undefined ? { janela_dias: regra.janela_dias } : {}),
      })
    if (r.error) throw new Error('escrita')
  }

  // Memória do ajuste (melhor esforço: o ajuste já valeu mesmo se isto falhar).
  let registrado = false
  try {
    const r = await inserir(ctx, descricaoAjuste(plano.mudancas), 'relatorio')
    registrado = 'linha' in r
  } catch { registrado = false }
  return { ok: true, mudou: plano.mudancas, vale_a_partir: 'do próximo aviso diário', ...(registrado ? {} : { aviso: 'O ajuste valeu, mas não consegui anotar nas preferências.' }) }
}
