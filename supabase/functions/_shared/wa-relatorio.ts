// Relatório diário ao gestor (etapa 9.3 — docs/prd.md §0.6) — regras PURAS.
//
// Sem banco, sem rede, sem Deno: roda igual na edge function e no Vitest
// (wa-relatorio.test.ts). A coleta dos dados fica em ./wa-relatorio-dados.ts.
//
// Regras de conteúdo (decisão do Bruno + revisão de segurança F4/F5):
//   * todo item cita o NOME do cliente;
//   * nenhum trecho de conversa entra na mensagem; texto livre de IA, só UMA
//     exceção: o motivo curto da análise diária de satisfação (decisão do dono,
//     26/10/2026) — parafraseado, validado na gravação e passado de novo por
//     nomeSeguro() com tamanho limitado (ver ./wa-satisfacao.ts). O resto são
//     nomes, números e frases fixas escritas aqui;
//   * nomes vêm de fora (o nome do contato no WhatsApp é escolhido pelo próprio
//     contato), então passam por nomeSeguro(): sem quebra de linha, sem
//     formatação do WhatsApp, sem link clicável, tamanho limitado;
//   * API oficial (Zernio): o relatório sai SEMPRE por modelo aprovado, com as
//     variáveis em uma linha só (exigência da Meta).
import { paraTemplateOficial, renderizarTexto, type TemplateOficial } from './wa-mensagem.ts'
import {
  cumprimento, saudacoesPara, type Fato, type PedidoHumanizacao, type PeriodoDia,
} from './wa-humanizar.ts'

export type TipoAnomalia = 'sem_resposta' | 'sentimento_negativo' | 'pendencia' | 'queda_volume'

export const TIPOS_ANOMALIA: readonly TipoAnomalia[] = ['sem_resposta', 'sentimento_negativo', 'pendencia', 'queda_volume']

/**
 * Tipos de ALERTA (seções do aviso e do painel): as 4 regras configuráveis +
 * 'grupo_sem_cliente' — grupo de WhatsApp com conversa recente e sem cliente
 * vinculado (cliente_canais). Este não é regra: sai sempre, por último e fora do
 * agrupamento por estrategista (não tem cliente, logo não tem estrategista).
 */
export type TipoAlerta = TipoAnomalia | 'grupo_sem_cliente'
/** A análise contextual vem antes das métricas para preservar o motivo mais útil. */
export const TIPOS_ALERTA: readonly TipoAlerta[] = ['sentimento_negativo', 'sem_resposta', 'pendencia', 'queda_volume', 'grupo_sem_cliente']

/** Mesmos padrões de src/lib/automacoesWa.ts (REGRAS_ANOMALIA.limiarPadrao) e do seed da migration 9.1. */
export const LIMIAR_PADRAO: Record<TipoAnomalia, number> = {
  sem_resposta: 4, // horas
  sentimento_negativo: 0,
  pendencia: 0,
  queda_volume: 50, // % abaixo da média
}

export interface RegraAnomalia {
  tipo: TipoAnomalia
  ativo: boolean
  limiar: number
  /**
   * Só sem_resposta: janela máxima em dias (wa_auto_regras_anomalia.janela_dias).
   * Ausente → JANELA_SEM_RESPOSTA_DIAS (7). Quem espera mais que isto vira só contagem.
   */
  janelaDias?: number
}

/** Tipo de cada item na lista agrupada por estrategista ("Marina — pendência: contrato pausado"). */
export const ROTULO_TIPO: Record<TipoAlerta, string> = {
  sem_resposta: 'sem resposta',
  sentimento_negativo: 'insatisfeito',
  pendencia: 'pendência',
  queda_volume: 'queda de conversas',
  grupo_sem_cliente: 'grupo sem cliente',
}

/** Nível do item de 'sentimento_negativo' (ver ItemAlerta.nivel). */
export type NivelAlertaSatisfacao = 'insatisfeito' | 'atencao' | 'risco'

/** Rótulo do item na lista agrupada: o do tipo, ou "em risco" (risco por regra). */
export function rotuloDoItem(tipo: TipoAlerta, nivel?: NivelAlertaSatisfacao | null): string {
  return tipo === 'sentimento_negativo' && nivel === 'risco' ? 'em risco' : ROTULO_TIPO[tipo]
}

/** Título curto de cada seção (texto) e rótulo de uma linha (modelo oficial). */
const SECOES: Record<TipoAlerta, { titulo: string; curto: string }> = {
  sem_resposta: { titulo: 'Clientes sem resposta', curto: 'Sem resposta' },
  sentimento_negativo: { titulo: 'Clientes insatisfeitos ou em risco', curto: 'Insatisfeitos' },
  pendencia: { titulo: 'Contratos parados', curto: 'Pendências' },
  queda_volume: { titulo: 'Queda no volume de conversas', curto: 'Queda de conversas' },
  grupo_sem_cliente: { titulo: 'Grupos ativos sem cliente vinculado', curto: 'Grupos sem cliente' },
}

/**
 * Subseções de 'sentimento_negativo' quando há itens de risco por regra
 * (nivel 'risco'): "Clientes insatisfeitos" (IA) e "Clientes em risco" (regras).
 * Sem itens de risco, a seção continua com o título de sempre.
 */
const SECAO_INSATISFEITOS = { titulo: 'Clientes insatisfeitos', curto: 'Insatisfeitos' }
const SECAO_RISCO = { titulo: 'Clientes em risco', curto: 'Em risco' }

/** Um alerta = cliente + frase FIXA montada por nós (nunca texto de conversa ou de IA). */
export interface FontePedidoAlerta {
  message_id: string
  criado_em: string
  autor: string
  trecho: string | null
  responsabilidade: 'interna' | 'terceiro' | 'cliente' | 'indeterminada'
}
export interface ItemAlerta {
  cliente: string
  detalhe: string
  // Ids estáveis (preenchidos pela coleta; o texto da mensagem não os usa).
  chave_alerta?: string
  fontes_pedidos?: FontePedidoAlerta[]
  client_id?: string | null
  contact_id?: string | null
  conversation_id?: string | null
  contract_id?: string | null
  desde?: string | null
  prioridade?: number
  /**
   * Só 'sentimento_negativo'. 'insatisfeito'/'atencao' = satisfação pela IA
   * (cliente_relacionamento ou, no fallback, wa_auto_satisfacao); 'risco' = risco
   * médio por REGRA (silêncio, pendência antiga, queda de conversas) — sai na
   * subseção "Clientes em risco".
   */
  nivel?: NivelAlertaSatisfacao
  confianca?: number
  /** Motivo parafraseado pela IA, já seguro (nomeSeguro) — também está no `detalhe`. */
  motivo?: string | null
  /**
   * Estrategista responsável pelo cliente (client_assignments estrategista ativo).
   * Só preenchido com a opção "Separar por estrategista". Nome já seguro (nomeSeguro).
   */
  estrategista_id?: string | null
  estrategista?: string | null
  /** Preservado no painel; o aviso separa histórico e atualidade não confirmada. */
  atualidade?: 'historico' | 'pendente'
}

export interface ReuniaoDoDia {
  /** "14:30" no fuso da empresa. */
  hora: string
  cliente: string
}

export interface DadosRelatorio {
  /** "26/10/2026" no fuso da empresa. */
  data: string
  /** Só as regras LIGADAS aparecem aqui (mesmo que vazias); 'grupo_sem_cliente' sempre. */
  alertas: Partial<Record<TipoAlerta, ItemAlerta[]>>
  reunioes: ReuniaoDoDia[]
  /**
   * Conversas sem resposta que passaram da janela (já sem as tiradas pelas outras
   * regras): contagem administrativa, sem inserir no aviso diário.
   */
  paradas?: { quantidade: number; dias: number }
  /** Link do painel de alertas (https). Ausente/null → a linha do link não sai. */
  linkPainel?: string | null
  /**
   * Link da aba Vínculos (https), no fim da seção "Grupos ativos sem cliente
   * vinculado" (dentro do bloco literal da lista: a IA da humanização não mexe).
   * Ausente/null → a frase aponta para a aba sem link.
   */
  linkVinculos?: string | null
  /**
   * Rodapé "como falar com o assistente" (_shared/wa-agente-como-chamar.ts), LITERAL.
   * Só quando o assistente está ligado e o destino é membro ativo / grupo liberado.
   * Vai como bloco [COMO_FALAR] na humanização: a IA não reescreve. Nunca no resumo
   * semanal nem no link de reunião (outros módulos). Ausente/null → não sai.
   */
  comoFalar?: string | null
  /**
   * Opção "Separar por estrategista" (wa_auto_config.relatorio_agrupar_estrategista):
   * os pontos de atenção saem agrupados pelo estrategista de cada cliente, cada item
   * com o tipo e o motivo. A agenda fica indisponível até haver integração.
   */
  agruparPorEstrategista?: boolean
  /**
   * Opção "Só clientes ativos": quantas ocorrências de contatos sem cadastro de
   * cliente ativo ficaram fora — diagnóstico administrativo, fora do aviso.
   */
  foraSemCadastro?: number
  /** Clientes com diagnóstico superado por mensagens recentes, aguardando reanálise. */
  analises_pendentes?: number
  historicos?: { quantidade: number; dias: number }
  /** Preferências explícitas só para a moldura; nunca alteram os fatos/listas. */
  preferenciasApresentacao?: readonly string[]
}

/** As duas opções do relatório (wa_auto_config). Desligadas = comportamento antigo. */
export interface OpcoesRelatorio {
  agruparPorEstrategista: boolean
  soClientesAtivos: boolean
}

export const OPCOES_RELATORIO_PADRAO: OpcoesRelatorio = Object.freeze({ agruparPorEstrategista: false, soClientesAtivos: false })

/** Linha de wa_auto_config (ou nada) → opções. Só `true` liga (na dúvida, desligada). */
export function normalizarOpcoesRelatorio(cfg: unknown): OpcoesRelatorio {
  const c = (cfg && typeof cfg === 'object' ? cfg : {}) as Record<string, unknown>
  return {
    agruparPorEstrategista: c.relatorio_agrupar_estrategista === true,
    soClientesAtivos: c.relatorio_so_clientes_ativos === true,
  }
}

/** Rodapé "como falar" seguro: uma ou duas linhas, sem chaves/colchetes, até 400 caracteres. */
export function comoFalarSeguro(texto: string | null | undefined): string | null {
  const s = String(texto ?? '').replace(/\r/g, '').trim()
  if (!s || s.length > 400 || /[{}[\]<>]/.test(s) || s.split('\n').length > 2) return null
  return s
}

export type Contagem = Record<TipoAlerta, number> & { reunioes: number }

// ---------------------------------------------------------------------------
// Regras
// ---------------------------------------------------------------------------

function ehTipoAnomalia(v: unknown): v is TipoAnomalia {
  return typeof v === 'string' && (TIPOS_ANOMALIA as readonly string[]).includes(v)
}

/**
 * Linhas de wa_auto_regras_anomalia (ou o que veio do backtest) → as 4 regras,
 * na ordem fixa, com padrão para o que faltar. Limiar fora de 0..10000 ou não
 * numérico volta ao padrão (o banco tem o mesmo CHECK).
 */
export function normalizarRegras(linhas: readonly unknown[] | null | undefined): RegraAnomalia[] {
  const porTipo = new Map<TipoAnomalia, RegraAnomalia>()
  for (const l of linhas ?? []) {
    if (!l || typeof l !== 'object') continue
    const r = l as Record<string, unknown>
    if (!ehTipoAnomalia(r.tipo) || porTipo.has(r.tipo)) continue
    const n = typeof r.limiar === 'number' ? r.limiar : typeof r.limiar === 'string' ? Number(r.limiar) : NaN
    const limiar = Number.isFinite(n) && n >= 0 && n <= 10000 ? n : LIMIAR_PADRAO[r.tipo]
    const regra: RegraAnomalia = { tipo: r.tipo, ativo: r.ativo === true, limiar }
    // Janela de espera/relacionamento: inteiro 1..90, igual ao CHECK do banco.
    const j = typeof r.janela_dias === 'number' ? r.janela_dias : typeof r.janela_dias === 'string' ? Number(r.janela_dias) : NaN
    if ((r.tipo === 'sem_resposta' || r.tipo === 'sentimento_negativo') && Number.isInteger(j) && j >= 1 && j <= 90) regra.janelaDias = j
    porTipo.set(r.tipo, regra)
  }
  return TIPOS_ANOMALIA.map((tipo) => porTipo.get(tipo) ?? { tipo, ativo: false, limiar: LIMIAR_PADRAO[tipo] })
}

// ---------------------------------------------------------------------------
// Nomes vindos de fora
// ---------------------------------------------------------------------------

/**
 * Teto de segurança contra nome anormal. Fica acima do maior nome real do WhatsApp
 * (assunto de grupo: 100) para nunca cortar um nome legítimo com "…".
 */
const MAX_NOME = 120

function ehInvisivelOuControle(code: number): boolean {
  return (
    code <= 0x1f || (code >= 0x7f && code <= 0x9f) || // controle (inclui quebra de linha e tab)
    (code >= 0x200b && code <= 0x200f) || // zero-width e marcas de direção
    (code >= 0x202a && code <= 0x202e) || // embutir/inverter direção do texto
    (code >= 0x2060 && code <= 0x206f) || code === 0xfeff
  )
}

/**
 * Deixa um nome seguro para ir no WhatsApp do gestor. Devolve null se nada sobrar.
 *  - remove quebra de linha, controle, caracteres invisíveis e de inversão de texto
 *    (alguém poderia "desenhar" uma mensagem falsa dentro do nome);
 *  - remove a formatação do WhatsApp (* _ ~ `), chaves, colchetes e @ (menção);
 *  - quebra endereços ("site.com" → "site. com") para não virar link clicável;
 *  - limita a `max` caracteres (teto de segurança, acima dos tamanhos reais).
 */
export function nomeSeguro(bruto: string | null | undefined, max = MAX_NOME): string | null {
  let s = ''
  for (const ch of String(bruto ?? '').normalize('NFC')) {
    s += ehInvisivelOuControle(ch.codePointAt(0) ?? 0) ? ' ' : ch
  }
  s = s
    .replace(/[*_~`{}[\]<>|@\\]/g, '')
    .replace(/:\/\//g, ' ')
    .replace(/([\p{L}\p{N}])\.(?=[\p{L}\p{N}])/gu, '$1. ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!s) return null
  const letras = Array.from(s)
  if (letras.length > max) s = `${letras.slice(0, max - 1).join('').trimEnd()}…`
  return s
}

/**
 * Nome de GRUPO de WhatsApp para o aviso (seção "Grupos ativos sem cliente"): o
 * nome é escolhido por quem criou o grupo e às vezes tem telefone/documento.
 * Qualquer sequência com 6+ dígitos (com ou sem espaço, ponto, traço, barra ou
 * parênteses no meio) vira "•••"; depois, nomeSeguro().
 */
export function nomeGrupoSeguro(bruto: string | null | undefined, max = MAX_NOME): string | null {
  const mascarado = String(bruto ?? '').replace(/\+?\d[\d\s().\/-]*\d/g, (t) => (t.replace(/\D/g, '').length >= 6 ? '•••' : t))
  return nomeSeguro(mascarado, max)
}

/** Últimos 4 dígitos de um telefone ("…8888"), para identificar contato sem nome sem expor o número. */
function finalTelefone(telefone: string | null | undefined): string | null {
  const d = String(telefone ?? '').replace(/\D/g, '')
  return d.length >= 4 ? d.slice(-4) : null
}

/**
 * Nome do cliente para o relatório: cadastro do cliente (digitado pela equipe) >
 * nome do contato no WhatsApp > "Contato sem nome (final 8888)".
 */
export function nomeDoCliente(
  nomeCadastro: string | null | undefined,
  nomeContato?: string | null,
  telefone?: string | null,
): string {
  const n = nomeSeguro(nomeCadastro) ?? nomeSeguro(nomeContato)
  if (n) return n
  const fim = finalTelefone(telefone)
  return fim ? `Contato sem nome (final ${fim})` : 'Contato sem nome'
}

/** Remove repetidos (mesmo cliente + mesma frase), mantendo a ordem. */
export function semRepetidos(itens: readonly ItemAlerta[]): ItemAlerta[] {
  const vistos = new Set<string>()
  const out: ItemAlerta[] = []
  for (const i of itens) {
    const k = `${i.cliente.toLowerCase()}|${i.detalhe.toLowerCase()}`
    if (vistos.has(k)) continue
    vistos.add(k)
    out.push(i)
  }
  return out
}

// ---------------------------------------------------------------------------
// Frases fixas dos alertas
// ---------------------------------------------------------------------------

/** 5 → "5h"; 30 → "1 dia"; 50 → "2 dias". */
export function descreverHoras(horas: number): string {
  const h = Math.max(0, Math.floor(horas))
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  return d === 1 ? '1 dia' : `${d} dias`
}

export function plural(n: number, um: string, varios: string): string {
  return `${n} ${n === 1 ? um : varios}`
}

// ---------------------------------------------------------------------------
// Datas no fuso da empresa
// ---------------------------------------------------------------------------

export const FUSO_PADRAO = 'America/Sao_Paulo'

interface PartesData { ano: number; mes: number; dia: number; hora: number; minuto: number }

export function partesNoFuso(data: Date, fuso = FUSO_PADRAO): PartesData {
  const partes = new Intl.DateTimeFormat('en-GB', {
    timeZone: fuso, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(data)
  const v = (t: string) => Number(partes.find((p) => p.type === t)?.value ?? 0)
  return { ano: v('year'), mes: v('month'), dia: v('day'), hora: v('hour'), minuto: v('minute') }
}

const dois = (n: number) => String(n).padStart(2, '0')

/** "26/10/2026". */
export function dataBR(data: Date, fuso = FUSO_PADRAO): string {
  const p = partesNoFuso(data, fuso)
  return `${dois(p.dia)}/${dois(p.mes)}/${p.ano}`
}

/** "26/10". */
export function diaMesBR(data: Date, fuso = FUSO_PADRAO): string {
  const p = partesNoFuso(data, fuso)
  return `${dois(p.dia)}/${dois(p.mes)}`
}

/** "14:30". */
export function horaBR(data: Date, fuso = FUSO_PADRAO): string {
  const p = partesNoFuso(data, fuso)
  return `${dois(p.hora)}:${dois(p.minuto)}`
}

/** Diferença (ms) entre o relógio do fuso e o UTC naquele instante. */
function deslocamentoMs(data: Date, fuso: string): number {
  const p = partesNoFuso(data, fuso)
  const comoUtc = Date.UTC(p.ano, p.mes - 1, p.dia, p.hora, p.minuto)
  return comoUtc - Math.floor(data.getTime() / 60_000) * 60_000
}

/** Instante UTC da meia-noite de ano/mes/dia no fuso. */
function meiaNoite(ano: number, mes: number, dia: number, fuso: string, referencia: Date): Date {
  const comoUtc = Date.UTC(ano, mes - 1, dia)
  // 1º palpite com o deslocamento de agora; 2º com o deslocamento da própria
  // meia-noite (cobre fuso com horário de verão).
  const palpite = new Date(comoUtc - deslocamentoMs(referencia, fuso))
  return new Date(comoUtc - deslocamentoMs(palpite, fuso))
}

/** Início (00:00) e fim (00:00 do dia seguinte) do dia de `data` no fuso, em UTC. */
export function limitesDoDia(data: Date, fuso = FUSO_PADRAO): { inicio: Date; fim: Date } {
  const p = partesNoFuso(data, fuso)
  return {
    inicio: meiaNoite(p.ano, p.mes, p.dia, fuso, data),
    fim: meiaNoite(p.ano, p.mes, p.dia + 1, fuso, data), // Date.UTC normaliza dia 32 → dia 1
  }
}

/**
 * O relatório deste dia já está na hora? Sim quando o relógio da empresa passou
 * de `horaConfig` ("09:00" ou "09:00:00") e ainda não passou da tolerância
 * (padrão 3h — se o agendador ficou fora do ar, não manda o "bom dia" à noite).
 * A repetição no mesmo dia é barrada pela idempotência, não por aqui.
 */
export function relatorioDevido(agora: Date, horaConfig: string | null | undefined, fuso = FUSO_PADRAO, toleranciaMin = 180): boolean {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(horaConfig ?? ''))
  if (!m) return false
  const alvo = Number(m[1]) * 60 + Number(m[2])
  if (alvo < 0 || alvo >= 24 * 60) return false
  const p = partesNoFuso(agora, fuso)
  const atual = p.hora * 60 + p.minuto
  return atual >= alvo && atual < alvo + toleranciaMin
}

// ---------------------------------------------------------------------------
// Montagem da mensagem
// ---------------------------------------------------------------------------

/**
 * Tamanho de cada mensagem do aviso na não oficial. O aviso SEMPRE sai inteiro:
 * se passar disto, vai em mais de uma mensagem, quebrando entre parágrafos.
 */
export const TAMANHO_PARTE_AVISO = 3_500

/**
 * Divide o aviso em mensagens de até ~`tamanho` caracteres, sem cortar nada:
 * quebra entre parágrafos (linha em branco) e, se um parágrafo sozinho passar do
 * tamanho, entre linhas. Uma linha nunca é partida no meio. Juntar as partes com
 * "\n\n" devolve o texto (com parágrafos normalizados).
 */
export function partesDoAviso(texto: string, tamanho = TAMANHO_PARTE_AVISO): string[] {
  const t = texto.trim()
  if (t.length <= tamanho) return t ? [t] : []
  const partes: string[] = []
  let atual = ''
  const somar = (pedaco: string, sep: string) => {
    const junto = atual ? `${atual}${sep}${pedaco}` : pedaco
    if (junto.length > tamanho && atual) { partes.push(atual); atual = pedaco } else atual = junto
  }
  for (const paragrafo of t.split(/\n{2,}/)) {
    if (paragrafo.length <= tamanho) { somar(paragrafo, '\n\n'); continue }
    // Parágrafo grande: fecha o que havia e segue linha a linha.
    if (atual) { partes.push(atual); atual = '' }
    for (const linha of paragrafo.split('\n')) somar(linha, '\n')
    partes.push(atual); atual = ''
  }
  if (atual) partes.push(atual)
  return partes.filter((p) => p.trim())
}

/** Uma seção da lista de alertas (já com a divisão insatisfeitos × em risco). */
export interface SecaoAlertas {
  tipo: TipoAlerta
  /** Título "oficial" (texto sem humanização). */
  titulo: string
  /** Rótulo de uma linha (modelo oficial). */
  curto: string
  /** Títulos sorteados na humanização (o 1º é o oficial). */
  alternativos: readonly string[]
  itens: ItemAlerta[]
}

/**
 * Seções na ordem fixa (TIPOS_ANOMALIA), só as com itens. 'sentimento_negativo'
 * com itens de risco por regra (nivel 'risco') vira duas: "Clientes insatisfeitos"
 * (análise da IA) e "Clientes em risco" (silêncio, pendência antiga, queda) —
 * ou só "Clientes em risco", se não houver insatisfeito.
 */
export function secoesDosAlertas(
  dados: Pick<DadosRelatorio, 'alertas'>, tipos: readonly TipoAlerta[] = TIPOS_ALERTA,
): SecaoAlertas[] {
  const out: SecaoAlertas[] = []
  for (const tipo of tipos) {
    const itens = dados.alertas[tipo]
    if (!itens || itens.length === 0) continue
    const risco = tipo === 'sentimento_negativo' ? itens.filter((i) => i.nivel === 'risco') : []
    if (risco.length === 0) {
      out.push({ tipo, ...SECOES[tipo], alternativos: TITULOS_ALTERNATIVOS[tipo], itens })
      continue
    }
    const insatisfeitos = itens.filter((i) => i.nivel !== 'risco')
    if (insatisfeitos.length > 0) {
      out.push({ tipo, ...SECAO_INSATISFEITOS, alternativos: TITULOS_INSATISFEITOS, itens: insatisfeitos })
    }
    out.push({ tipo, ...SECAO_RISCO, alternativos: TITULOS_RISCO, itens: risco })
  }
  return out
}

/**
 * Modelo do texto livre (API não oficial). O bloco {{alertas}}
 * é montado aqui; renderizarTexto() garante que um nome com "{{x}}" não seja
 * reinterpretado.
 */
export const MODELO_RELATORIO_TEXTO =
  '*Aviso diário — {{data}}*\nBom dia, {{gestor}}!\n\n{{alertas}}\n\nDetalhes no OMNX Desk.'

/**
 * Base da humanização no GRUPO interno: igual ao de cima, mas a saudação é para o
 * grupo e já vem com o cumprimento do período ({{saudacao}} = "Boa tarde, pessoal!").
 */
const MODELO_RELATORIO_TEXTO_GRUPO =
  '*Aviso diário — {{data}}*\n{{saudacao}}\n\n{{alertas}}\n\nDetalhes no OMNX Desk.'

/**
 * Modelo a cadastrar na Meta/Zernio (categoria "utilidade"). Variáveis numeradas
 * na ordem: {{1}} gestor, {{2}} data, {{3}} alertas.
 * Veja paraTemplateOficial(MODELO_RELATORIO_OFICIAL, …).modeloNumerado.
 */
export const MODELO_RELATORIO_OFICIAL =
  'Bom dia, {{gestor}}! Aviso diário de {{data}}. Alertas: {{alertas}}. Detalhes no OMNX Desk.'

/** Limites de tamanho das variáveis no modelo oficial (o corpo inteiro precisa caber em 1024). */
const ORCAMENTO_OFICIAL = { alertas: 600 }

/**
 * "+ 12 conversas paradas há mais de 7 dias" (ou null). Começa com "+" e não com
 * marcador de lista: não conta como item e não tem nome de cliente.
 */
export function linhaParadas(dados: Pick<DadosRelatorio, 'paradas'>): string | null {
  const q = Math.floor(Number(dados.paradas?.quantidade ?? 0))
  const d = Math.floor(Number(dados.paradas?.dias ?? 0))
  if (!(q > 0) || !(d > 0)) return null
  return `+ ${plural(q, 'conversa parada', 'conversas paradas')} há mais de ${plural(d, 'dia', 'dias')}`
}

/**
 * "+ 39 ocorrências de contatos sem cadastro ficaram fora" (ou null). Opção "só
 * clientes ativos". Começa com "+": não conta como item e não tem nome de ninguém.
 */
export function linhaForaSemCadastro(dados: Pick<DadosRelatorio, 'foraSemCadastro'>): string | null {
  const n = Math.floor(Number(dados.foraSemCadastro ?? 0))
  if (!(n > 0)) return null
  return n === 1
    ? '+ 1 ocorrência de contato sem cadastro ficou fora'
    : `+ ${n} ocorrências de contatos sem cadastro ficaram fora`
}

export function linhaAnalisesPendentes(dados: Pick<DadosRelatorio, 'analises_pendentes'>): string | null {
  const n = Math.floor(Number(dados.analises_pendentes ?? 0))
  if (!Number.isFinite(n) || n < 1) return null
  return n === 1
    ? '1 cliente aguarda reanálise após mensagens recentes ou por cobertura insuficiente; o diagnóstico anterior não foi repetido.'
    : `${n} clientes aguardam reanálise após mensagens recentes ou por cobertura insuficiente; os diagnósticos anteriores não foram repetidos.`
}

export function linhaHistoricos(dados: Pick<DadosRelatorio, 'historicos'>): string | null {
  const q = dados.historicos?.quantidade
  const d = dados.historicos?.dias
  if (!Number.isInteger(q) || !Number.isInteger(d) || !q || !d || q < 1 || d < 1 || d > 90) return null
  return `${plural(q, 'caso histórico permanece registrado', 'casos históricos permanecem registrados')}, sem movimentação do cliente nos últimos ${plural(d, 'dia', 'dias')}. Consulte os detalhes no painel; isso não significa resolução.`
}

/** Filtra apenas a apresentação do aviso; os dados completos continuam no painel/chat. */
function dadosAtuaisDoAviso(dados: DadosRelatorio): DadosRelatorio {
  return { ...dados, alertas: Object.fromEntries(Object.entries(dados.alertas)
    .map(([tipo, itens]) => [tipo, itens?.filter((item) => !item.atualidade)])) }
}

// ---------------------------------------------------------------------------
// Agrupamento por estrategista (opção "Separar por estrategista")
// ---------------------------------------------------------------------------

export const SEM_ESTRATEGISTA = 'Sem estrategista'

export interface ItemDoEstrategista {
  tipo: TipoAnomalia
  cliente: string
  detalhe: string
  /** Só 'sentimento_negativo': 'risco' muda o rótulo para "em risco". */
  nivel?: NivelAlertaSatisfacao
}

export interface GrupoEstrategista {
  /** Nome do estrategista (seguro) ou "Sem estrategista". */
  nome: string
  semEstrategista: boolean
  /** Análise contextual primeiro; depois métricas, na ordem do filtro. */
  itens: ItemDoEstrategista[]
}

/**
 * Pontos de atenção agrupados pelo estrategista de cada cliente. Grupos em ordem
 * alfabética (como a tela de clientes); "Sem estrategista" por último. Sem
 * estrategista = item sem `estrategista_id` nem nome (contato sem cadastro,
 * cliente sem estrategista ativo).
 */
export function agruparPorEstrategista(dados: Pick<DadosRelatorio, 'alertas'>): GrupoEstrategista[] {
  const grupos = new Map<string, GrupoEstrategista>()
  const sem: GrupoEstrategista = { nome: SEM_ESTRATEGISTA, semEstrategista: true, itens: [] }
  for (const tipo of TIPOS_ALERTA) {
    if (tipo === 'grupo_sem_cliente') continue
    for (const i of dados.alertas[tipo] ?? []) {
      const nome = nomeSeguro(i.estrategista)
      const chave = i.estrategista_id ? `id:${i.estrategista_id}` : nome ? `nome:${nome.toLowerCase()}` : null
      const item: ItemDoEstrategista = { tipo, cliente: i.cliente, detalhe: i.detalhe, ...(i.nivel ? { nivel: i.nivel } : {}) }
      if (!chave) { sem.itens.push(item); continue }
      const g = grupos.get(chave) ?? { nome: nome ?? 'Estrategista sem nome', semEstrategista: false, itens: [] }
      g.itens.push(item)
      grupos.set(chave, g)
    }
  }
  const ordenados = [...grupos.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  return sem.itens.length > 0 ? [...ordenados, sem] : ordenados
}

/** Formatos do item agrupado (mesmo índice sorteado do formato do item normal). */
const FORMATOS_ITEM_GRUPO: readonly ((m: string, cl: string, rot: string, d: string) => string)[] = [
  (m, cl, rot, d) => `${m} ${cl} — ${rot}: ${d}`,
  (m, cl, rot, d) => `${m} ${cl}: ${rot}, ${d}`,
  (m, cl, rot, d) => `${m} ${cl} (${rot}: ${d})`,
]

/**
 * Bloco de alertas agrupado por estrategista: cabeçalho com o total, um grupo por
 * estrategista ("Octavio (2):" + TODOS os itens, sem "e mais N") e, no
 * fim, as linhas "+ N paradas" / "+ N ficaram fora". Sem itens → null.
 */
function blocoPorEstrategista(
  grupos: GrupoEstrategista[], marca: string, formato: number, cabecalho: string,
): string | null {
  if (grupos.length === 0) return null
  const fmt = FORMATOS_ITEM_GRUPO[Math.min(FORMATOS_ITEM_GRUPO.length - 1, Math.max(0, formato))]
  const partes = grupos.map((g) => {
    const linhas = g.itens.map((i) => fmt(marca, i.cliente, rotuloDoItem(i.tipo, i.nivel), i.detalhe))
    return `${g.nome} (${g.itens.length}):\n${linhas.join('\n')}`
  })
  return `${cabecalho}\n${partes.join('\n\n')}`
}

/** Pares [cliente, detalhe] que precisam ficar na mesma linha — versão agrupada. */
function juntosPorEstrategista(grupos: GrupoEstrategista[]): string[][] {
  const out: string[][] = []
  for (const g of grupos) {
    for (const i of g.itens) out.push([i.cliente, i.detalhe])
  }
  return out
}

/** Frase antes do link do painel (o link vai sozinho na linha seguinte). */
export const FRASES_LINK_PAINEL: readonly string[] = [
  'Para silenciar ou ajustar algum alerta:',
  'Silenciar ou ajustar alertas:',
  'Para tirar algum alerta da lista:',
]

/** Só https, sem espaço, tamanho razoável. Qualquer outra coisa → sem link. */
export function linkPainelSeguro(link: string | null | undefined): string | null {
  const s = String(link ?? '').trim()
  if (!s || s.length > 300 || /\s/.test(s)) return null
  try {
    const u = new URL(s)
    return u.protocol === 'https:' && !u.username && !u.password ? s : null
  } catch {
    return null
  }
}

/**
 * Junta as seções e a linha das paradas: dentro da seção "sem resposta" quando ela
 * existe; senão no fim (ou, sem nenhuma seção, depois de `semAlertas`).
 */
function juntarAlertas(
  secoes: { tipo: TipoAlerta; titulo: string; linhas: string[] }[], paradas: string | null, semAlertas: string,
  fora: string | null = null,
): string {
  const comFora = (t: string) => (fora ? `${t}\n${fora}` : t)
  if (paradas) {
    const sr = secoes.find((s) => s.tipo === 'sem_resposta')
    if (sr) sr.linhas.push(paradas)
  }
  const texto = secoes.map((s) => `${s.titulo}\n${s.linhas.join('\n')}`)
  if (paradas && !secoes.some((s) => s.tipo === 'sem_resposta')) texto.push(paradas)
  if (secoes.length === 0) return comFora(paradas ? `${semAlertas}\n${paradas}` : semAlertas)
  return comFora(texto.join('\n\n'))
}

/**
 * Versão agrupada: o bloco por estrategista, as linhas "+ N …" e, por último, a
 * seção "Grupos ativos sem cliente vinculado" (não tem estrategista).
 */
function juntarAlertasAgrupados(
  bloco: string | null, paradas: string | null, semAlertas: string, fora: string | null, grupos: string | null = null,
): string {
  const extras = [paradas, fora].filter((x): x is string => Boolean(x))
  let texto: string
  if (!bloco) texto = (grupos ? extras : [semAlertas, ...extras]).filter(Boolean).join('\n')
  // Linha em branco antes: as contagens não são do último grupo.
  else texto = extras.length ? `${bloco}\n\n${extras.join('\n')}` : bloco
  if (!grupos) return texto
  return texto ? `${texto}\n\n${grupos}` : grupos
}

/** Frase FIXA (e o link da aba Vínculos) no fim da seção de grupos sem cliente. */
export function chamadaVinculos(dados: Pick<DadosRelatorio, 'linkVinculos'>): string[] {
  const link = linkPainelSeguro(dados.linkVinculos)
  return link
    ? ['Ligue cada grupo ao cliente certo (ou marque como interno / não é cliente) em:', link]
    : ['Ligue cada grupo ao cliente certo (ou marque como interno / não é cliente) na aba Vínculos do OMNX Desk.']
}

/**
 * Linhas de uma seção: TODOS os itens (a mensagem nunca corta a lista) e, na seção de
 * grupos sem cliente, a chamada para a aba Vínculos.
 */
function linhasDaSecao(
  sec: SecaoAlertas, dados: DadosRelatorio, marca: string, item: (cl: string, d: string) => string,
): string[] {
  const linhas = sec.itens.map((i) => item(i.cliente, i.detalhe))
  if (sec.tipo === 'grupo_sem_cliente') linhas.push(...chamadaVinculos(dados))
  return linhas
}

/** A seção de grupos sem cliente pronta (título + linhas), para o modo agrupado. */
function secaoGruposTexto(
  dados: DadosRelatorio, marca: string, item: (cl: string, d: string) => string, titulo: (sec: SecaoAlertas) => string,
): string | null {
  const sec = secoesDosAlertas(dados, ['grupo_sem_cliente'])[0]
  if (!sec) return null
  return `${titulo(sec)}\n${linhasDaSecao(sec, dados, marca, item).join('\n')}`
}

const CABECALHOS_ESTRATEGISTA: readonly string[] = [
  'Pontos de atenção por estrategista', 'Ocorrências por estrategista', 'Ocorrências do dia por estrategista',
]

function blocoAlertasTexto(dados: DadosRelatorio): string {
  dados = dadosAtuaisDoAviso(dados)
  const vazio = linhaAnalisesPendentes(dados) ? 'Nenhum alerta confirmado nas fontes atuais.' : linhaHistoricos(dados) ? 'Nenhum alerta com movimentação recente.' : 'Nenhum alerta hoje.'
  if (dados.agruparPorEstrategista) {
    const grupos = agruparPorEstrategista(dados)
    const total = grupos.reduce((n, g) => n + g.itens.length, 0)
    const bloco = blocoPorEstrategista(grupos, '•', 0, `*${CABECALHOS_ESTRATEGISTA[0]} (${total})*`)
    const secGrupos = secaoGruposTexto(dados, '•', (cl, d) => `• ${cl} — ${d}`, (sec) => `*${sec.titulo} (${sec.itens.length})*`)
    return juntarAlertasAgrupados(bloco, null, vazio, null, secGrupos)
  }
  const secoes: { tipo: TipoAlerta; titulo: string; linhas: string[] }[] = []
  for (const sec of secoesDosAlertas(dados)) {
    const linhas = linhasDaSecao(sec, dados, '•', (cl, d) => `• ${cl} — ${d}`)
    secoes.push({ tipo: sec.tipo, titulo: `*${sec.titulo} (${sec.itens.length})*`, linhas })
  }
  return juntarAlertas(secoes, null, vazio, null)
}

/** Junta pedaços até o orçamento de caracteres; o que sobrar vira "e mais N". */
function caberEm(pedacos: string[], separador: string, orcamento: number): string {
  return caberEmPartes(pedacos.map((texto) => ({ sep: separador, texto })), orcamento)
}

/** Igual a caberEm, com o separador de cada pedaço (o do 1º é ignorado). */
function caberEmPartes(pedacos: { sep: string; texto: string }[], orcamento: number): string {
  let atual = ''
  for (let i = 0; i < pedacos.length; i++) {
    const candidato = atual ? `${atual}${pedacos[i].sep}${pedacos[i].texto}` : pedacos[i].texto
    const restantes = pedacos.length - i - 1
    // Reserva espaço para o " e mais N" caso ainda venha coisa depois.
    const reserva = restantes > 0 ? ` e mais ${restantes}`.length : 0
    if (!atual && candidato.length + reserva > orcamento) {
      const fim = '… detalhes no painel'
      return `${candidato.slice(0, Math.max(0, orcamento - fim.length)).trimEnd()}${fim}`
    }
    if (atual && candidato.length + reserva > orcamento) return `${atual} e mais ${pedacos.length - i}`
    atual = candidato
  }
  return atual
}

function alertasUmaLinha(dados: DadosRelatorio): string {
  dados = dadosAtuaisDoAviso(dados)
  const orcamento = ORCAMENTO_OFICIAL.alertas
  const vazio = linhaAnalisesPendentes(dados) || linhaHistoricos(dados) ? 'sem alertas confirmados nas fontes atuais' : 'nenhum'
  if (dados.agruparPorEstrategista) {
    // "Octavio: Marina (pendência, contrato pausado), Betânia (…); Luis: …"
    const pedacos: { sep: string; texto: string }[] = []
    for (const g of agruparPorEstrategista(dados)) {
      g.itens.forEach((i, idx) => {
        const base = `${i.cliente} (${rotuloDoItem(i.tipo, i.nivel)}, ${i.detalhe})`
        pedacos.push(idx === 0 ? { sep: '; ', texto: `${g.nome}: ${base}` } : { sep: ', ', texto: base })
      })
    }
    // Grupos sem cliente: no fim, fora do agrupamento.
    for (const sec of secoesDosAlertas(dados, ['grupo_sem_cliente'])) {
      sec.itens.forEach((i, idx) => {
        const base = `${i.cliente} (${i.detalhe})`
        pedacos.push(idx === 0 ? { sep: '; ', texto: `${sec.curto}: ${base}` } : { sep: ', ', texto: base })
      })
    }
    if (pedacos.length === 0) return vazio
    return caberEmPartes(pedacos, orcamento)
  }
  // Cada cliente vira "Seção: Nome (detalhe)"; o nome da seção só aparece no 1º da seção.
  const pedacos: string[] = []
  for (const sec of secoesDosAlertas(dados)) {
    sec.itens.forEach((i, idx) => {
      const base = `${i.cliente} (${i.detalhe})`
      pedacos.push(idx === 0 ? `${sec.curto}: ${base}` : base)
    })
  }
  if (pedacos.length === 0) return vazio
  return caberEm(pedacos, '; ', orcamento)
}

/** Texto pronto para a API não oficial (UAZAPI). */
export function montarTextoRelatorio(nomeGestor: string, dados: DadosRelatorio): string {
  const texto = renderizarTexto(MODELO_RELATORIO_TEXTO, {
    data: dados.data,
    gestor: nomeSeguro(nomeGestor) ?? 'gestor',
    alertas: blocoAlertasTexto(dados),
  })
  const link = linkPainelSeguro(dados.linkPainel)
  const comLink = link ? `${texto}\n${FRASES_LINK_PAINEL[0]}\n${link}` : texto
  const rodape = comoFalarSeguro(dados.comoFalar)
  return rodape ? `${comLink}\n\n${rodape}` : comLink
}

/**
 * Como o grupo interno chamaria a equipe na saudação. O grupo NUNCA recebe nome de
 * pessoa: a mensagem fala com o grupo ("Oi, pessoal!").
 */
export const CHAMADA_GRUPO = 'pessoal'

/** Saudações para o grupo interno (sem nome de pessoa). */
export function saudacoesGrupo(periodo?: PeriodoDia): string[] {
  const c = periodo ? cumprimento(periodo) : null
  return [
    'Oi, pessoal!', 'Olá, pessoal!', 'Oi, equipe!', 'Oi, time!', 'Pessoal, tudo certo?',
    ...(c ? [`${c}, pessoal!`, `${c}, equipe!`, `${c}, time!`, `Oi, pessoal! ${c}.`] : []),
  ]
}

/**
 * Texto (prévia/sem humanização) do aviso no GRUPO interno: mesmas listas, saudação
 * para o grupo. Grupo sai sempre pela não oficial (UAZAPI), mesmo na oficial.
 */
export function montarTextoRelatorioGrupo(dados: DadosRelatorio): string {
  return montarTextoRelatorio(CHAMADA_GRUPO, dados)
}

export interface RelatorioOficial extends TemplateOficial {
  /** Como o gestor vai ler (modelo com as variáveis preenchidas) — para a prévia. */
  textoPrevia: string
}

/** Variáveis do modelo aprovado (Zernio), cada uma em uma linha só. */
export function montarTemplateRelatorio(nomeGestor: string, dados: DadosRelatorio): RelatorioOficial {
  const valores = {
    gestor: nomeSeguro(nomeGestor) ?? 'gestor',
    data: dados.data,
    alertas: alertasUmaLinha(dados),
  }
  const t = paraTemplateOficial(MODELO_RELATORIO_OFICIAL, valores)
  return { ...t, textoPrevia: renderizarTexto(MODELO_RELATORIO_OFICIAL, valores) }
}

export function contarRelatorio(dados: DadosRelatorio): Contagem {
  return {
    sem_resposta: dados.alertas.sem_resposta?.length ?? 0,
    sentimento_negativo: dados.alertas.sentimento_negativo?.length ?? 0,
    pendencia: dados.alertas.pendencia?.length ?? 0,
    queda_volume: dados.alertas.queda_volume?.length ?? 0,
    grupo_sem_cliente: dados.alertas.grupo_sem_cliente?.length ?? 0,
    reunioes: 0, // Campo legado da API; integração de agenda ainda indisponível.
  }
}

// ---------------------------------------------------------------------------
// Humanização (só UAZAPI — ver ./wa-humanizar.ts)
// ---------------------------------------------------------------------------

/** Títulos alternativos de cada seção (sorteado a cada envio em montarListasRelatorio). */
const TITULOS_ALTERNATIVOS: Record<TipoAlerta, readonly string[]> = {
  sem_resposta: [SECOES.sem_resposta.titulo, 'Esperando resposta', 'Aguardando retorno da equipe'],
  sentimento_negativo: [SECOES.sentimento_negativo.titulo, 'Clientes que pedem atenção', 'Insatisfeitos ou em risco de sair'],
  pendencia: [SECOES.pendencia.titulo, 'Pendências', 'Contratos travados'],
  queda_volume: [SECOES.queda_volume.titulo, 'Conversas em queda', 'Menos conversa que o normal'],
  grupo_sem_cliente: [SECOES.grupo_sem_cliente.titulo, 'Grupos sem cliente vinculado', 'Grupos com conversa e sem cliente ligado'],
}
/** Idem, quando 'sentimento_negativo' sai dividido (ver secoesDosAlertas). */
const TITULOS_INSATISFEITOS: readonly string[] = [SECAO_INSATISFEITOS.titulo, 'Insatisfeitos', 'Clientes insatisfeitos agora']
const TITULOS_RISCO: readonly string[] = [SECAO_RISCO.titulo, 'Em risco', 'Clientes que podem estar se afastando']


/**
 * Palavras que a MOLDURA escrita pela IA não pode usar (se o base não as tem fora
 * das listas): ela não pode contradizer as listas ("nenhum alerta", "tudo tranquilo").
 */
const TERMOS_PROIBIDOS_MOLDURA: readonly string[] = [
  'nenhum', 'nenhuma', 'nada', 'sem alerta', 'sem pendenc', 'sem reuni', 'sem problema', 'tranquil', 'calm',
  'resolvid', 'em dia', 'normal', 'ok', 'reuni', 'agenda',
]

export interface ListasRelatorio {
  /** Seções de alerta (título + itens + "e mais N"), ou a frase de "nenhum alerta". */
  alertas: string
  /** Campo legado vazio enquanto não houver integração de agenda. */
  reunioes: string
}

/**
 * A lista de alertas do aviso, já com a variação DETERMINÍSTICA (marcador de lista,
 * formato do item, títulos). Só texto escrito aqui + nomes (nomeSeguro), horas e
 * os detalhes (frases fixas de wa-relatorio-dados). Nada aqui vem da IA.
 */
export function montarListasRelatorio(dados: DadosRelatorio, aleatorio: () => number = Math.random): ListasRelatorio {
  dados = dadosAtuaisDoAviso(dados)
  const s = <T>(l: readonly T[]): T => l[Math.min(l.length - 1, Math.floor(aleatorio() * l.length))]
  const marca = s(['•', '-', '–'])
  const formatos = [
    (cl: string, d: string) => `${marca} ${cl} — ${d}`,
    (cl: string, d: string) => `${marca} ${cl}: ${d}`,
    (cl: string, d: string) => `${marca} ${cl} (${d})`,
  ]
  // Mesmo sorteio de antes (um número), guardando o índice para a versão agrupada.
  const formato = Math.min(formatos.length - 1, Math.floor(aleatorio() * formatos.length))
  const item = formatos[formato]
  const titulo = s([
    (t: string, n: number) => `*${t} (${n})*`,
    (t: string, n: number) => `${t} (${n}):`,
    (t: string, n: number) => `${t}: ${n}`,
  ])

  const paradas = linhaParadas(dados)
  const fora = linhaForaSemCadastro(dados)
  const pendentes = linhaAnalisesPendentes(dados)
  // Com conversas paradas (ou ocorrências deixadas de fora), nada de "tudo tranquilo".
  // (Sorteia só quando precisa: não muda a sequência dos sorteios seguintes.)
  const fraseSemAlertas = () => pendentes ? 'Nenhum alerta confirmado nas fontes atuais.' : linhaHistoricos(dados) ? 'Nenhum alerta com movimentação recente.' : paradas || fora
    ? s(['Nenhum alerta novo hoje.', 'Sem alertas novos hoje.'])
    : s(['Nenhum alerta hoje.', 'Sem alertas hoje.', 'Hoje não tem nenhum alerta.', 'Tudo tranquilo hoje: nenhum alerta.'])

  let alertas: string
  if (dados.agruparPorEstrategista) {
    const grupos = agruparPorEstrategista(dados)
    const total = grupos.reduce((n, g) => n + g.itens.length, 0)
    const bloco = grupos.length > 0
      ? blocoPorEstrategista(grupos, marca, formato, titulo(s(CABECALHOS_ESTRATEGISTA), total))
      : null
    const secGrupos = secaoGruposTexto(dados, marca, item, (sec) => titulo(s(sec.alternativos), sec.itens.length))
    alertas = juntarAlertasAgrupados(bloco, null, bloco || secGrupos ? '' : fraseSemAlertas(), null, secGrupos)
  } else {
    const secoes: { tipo: TipoAlerta; titulo: string; linhas: string[] }[] = []
    for (const sec of secoesDosAlertas(dados)) {
      const linhas = linhasDaSecao(sec, dados, marca, item)
      secoes.push({ tipo: sec.tipo, titulo: titulo(s(sec.alternativos), sec.itens.length), linhas })
    }
    alertas = juntarAlertas(secoes, null, secoes.length > 0 ? '' : fraseSemAlertas(), null)
  }

  // Sem integração de agenda: não afirmar nem mesmo que não há reuniões.
  return { alertas, reunioes: '' }
}

/**
 * Pedido de humanização do aviso diário ao gestor (UAZAPI).
 *
 * Segurança (auditoria A1): as LISTAS não passam pela IA. Cada uma vai como um
 * bloco ([ITENS_ALERTAS]) que volta LITERAL, nas próprias linhas,
 * exatamente uma vez — a IA só escreve saudação, abertura e fecho. Assim ela não
 * consegue trocar/apagar o motivo de um alerta, tirar ou inventar item, mudar a
 * contagem, o "e mais N" nem passar um cliente de uma seção para outra. Defesa em
 * profundidade: cliente + motivo (e hora + cliente) na mesma linha, mesma
 * quantidade de itens de lista do base e moldura sem "nenhum alerta"/"tranquilo".
 * A variação anti-bloqueio vem da moldura (IA) + marcador/formato/títulos sorteados
 * aqui a cada envio (`aleatorio`).
 */
export function pedidoHumanizacaoRelatorio(
  nomeGestor: string, dados: DadosRelatorio, periodo: PeriodoDia, aleatorio: () => number = Math.random,
): PedidoHumanizacao {
  return pedidoRelatorio({ tipo: 'pessoa', nome: nomeGestor }, dados, periodo, aleatorio)
}

/**
 * Mesmo aviso, para um GRUPO INTERNO da equipe (gestor + pessoas da entrega). Mesmas
 * listas e mesmas travas; muda só a moldura: a saudação é para o grupo ("Oi,
 * pessoal!"), sem nome de pessoa, e o prompt diz que é grupo interno (sem cliente).
 */
export function pedidoHumanizacaoRelatorioGrupo(
  dados: DadosRelatorio, periodo: PeriodoDia, aleatorio: () => number = Math.random,
): PedidoHumanizacao {
  return pedidoRelatorio({ tipo: 'grupo' }, dados, periodo, aleatorio)
}

type DestinatarioRelatorio = { tipo: 'pessoa'; nome: string } | { tipo: 'grupo' }

function pedidoRelatorio(
  dest: DestinatarioRelatorio, dados: DadosRelatorio, periodo: PeriodoDia, aleatorio: () => number,
): PedidoHumanizacao {
  dados = dadosAtuaisDoAviso(dados)
  const grupo = dest.tipo === 'grupo'
  const gestor = dest.tipo === 'pessoa' ? nomeSeguro(dest.nome) ?? 'gestor' : CHAMADA_GRUPO
  const listas = montarListasRelatorio(dados, aleatorio)
  // Link do painel: fato LITERAL com marcador ([LINK]) — a IA não vê nem altera o
  // endereço; desmascarar() aceita no máximo as mesmas ocorrências do base e
  // validarTexto() recusa qualquer outro endereço. A linha "+ N paradas" vai DENTRO
  // do bloco [ITENS_ALERTAS] (literal).
  const link = linkPainelSeguro(dados.linkPainel)
  const fraseLink = link
    ? FRASES_LINK_PAINEL[Math.min(FRASES_LINK_PAINEL.length - 1, Math.floor(aleatorio() * FRASES_LINK_PAINEL.length))]
    : ''
  const c = cumprimento(periodo)
  // Grupo: a saudação do base já usa o cumprimento do período (não há nome a proteger).
  const textoSemLink = grupo
    ? renderizarTexto(MODELO_RELATORIO_TEXTO_GRUPO, {
      data: dados.data, saudacao: `${c}, ${CHAMADA_GRUPO}!`, alertas: listas.alertas,
    })
    : renderizarTexto(MODELO_RELATORIO_TEXTO, {
      data: dados.data, gestor, alertas: listas.alertas,
    })
  const rodape = comoFalarSeguro(dados.comoFalar)
  const comLink = link ? `${textoSemLink}\n${fraseLink}\n${link}` : textoSemLink
  // Rodapé "como falar com o assistente": bloco LITERAL na última linha (a IA não reescreve).
  const textoBase = rodape ? `${comLink}\n\n${rodape}` : comLink
  const fatos: Fato[] = [
    ...(grupo ? [] : [{ valor: gestor, marcador: 'GESTOR' }]),
    { valor: dados.data, marcador: 'DATA' },
    { valor: listas.alertas, marcador: 'ITENS_ALERTAS', bloco: true },
    ...(link ? [{ valor: link, marcador: 'LINK' }] : []),
    ...(rodape ? [{ valor: rodape, marcador: 'COMO_FALAR', bloco: true }] : []),
  ]
  const fechosBase = [
    'Detalhes no OMNX Desk.',
    'Os detalhes estão no OMNX Desk.',
    'Mais detalhes lá no OMNX Desk.',
    'Qualquer coisa, está tudo no OMNX Desk.',
  ]
  const fechosComLink = link
    ? fechosBase.flatMap((f) => FRASES_LINK_PAINEL.map((fl) => `${f}\n${fl}\n${link}`))
    : fechosBase
  const fechos = rodape ? fechosComLink.map((f) => `${f}\n\n${rodape}`) : fechosComLink
  const juntos: string[][] = []
  if (dados.agruparPorEstrategista) {
    juntos.push(...juntosPorEstrategista(agruparPorEstrategista(dados)))
    for (const sec of secoesDosAlertas(dados, ['grupo_sem_cliente'])) {
      for (const i of sec.itens) juntos.push([i.cliente, i.detalhe])
    }
  } else {
    for (const sec of secoesDosAlertas(dados)) {
      for (const i of sec.itens) juntos.push([i.cliente, i.detalhe])
    }
  }


  const data = dados.data
  return {
    tipo: grupo ? 'relatorio_diario_grupo' : 'relatorio_diario',
    textoBase,
    fatos,
    fatosNaMesmaLinha: juntos,
    termosProibidos: TERMOS_PROIBIDOS_MOLDURA,
    mesmaQuantidadeDeItens: true,
    tom: 'gestor-interno',
    canal: grupo ? 'grupo' : 'privado',
    periodo,
    preferenciasApresentacao: dados.preferenciasApresentacao,
    contexto: grupo
      ? 'aviso diário no grupo INTERNO de WhatsApp da equipe (só pessoas da empresa, nenhum cliente no grupo); a lista de clientes que pedem atenção já está pronta nos marcadores'
      : 'aviso diário interno para o gestor; a lista de clientes que pedem atenção já está pronta nos marcadores',
    instrucoesExtras: [
      'Pode variar a saudação, a abertura e o fecho. Não resuma nem comente a lista de alertas.',
      'Não cite reuniões, agenda ou agendamento: não há integração de agenda configurada.',
      ...(grupo ? ['Fale com o grupo todo (ex.: "Oi, pessoal!", "Oi, equipe!"). Não cite o nome de nenhuma pessoa na saudação nem no resto da moldura.'] : []),
      ...(link ? ['Termine com uma frase curta dizendo que pelo link dá para silenciar ou ajustar os alertas e, na linha de baixo, [LINK] sozinho, uma vez só.'] : []),
      ...(rodape ? ['A última linha da mensagem é [COMO_FALAR], sozinho, uma vez só, depois de uma linha em branco. Não escreva nada depois dele nem repita o que ele diz.'] : []),
    ],
    variantes: {
      saudacoes: grupo ? saudacoesGrupo(periodo) : saudacoesPara(gestor, periodo).concat([`${c}, ${gestor}!`]),
      aberturas: [
        `Aviso do dia ${data}:`,
        `Aqui vai o resumo de ${data}.`,
        `Os pontos de atenção de ${data}:`,
        `Resumo rápido de ${data}:`,
        `Passando o aviso diário (${data}).`,
      ],
      blocos: [[listas.alertas]],
      fechos,
    },
  }
}
