import { normalizaTelefoneBR } from '@/lib/telefone'

/**
 * App Automações WhatsApp — regras puras (sem React, sem banco).
 * Os padrões e rótulos moram aqui para a tela e os testes usarem a mesma fonte.
 */

export type TipoRegra = 'sem_resposta' | 'sentimento_negativo' | 'pendencia' | 'queda_volume'
export type Provedor = 'uazapi' | 'zernio'

export interface RegraInfo {
  tipo: TipoRegra
  rotulo: string
  descricao: string
  /** Unidade do limiar; ausente = a regra não tem número para ajustar. */
  unidade?: 'horas' | '%'
  limiarPadrao: number
  /** Frase com o limite no meio: [antes do número, depois do número]. */
  frase?: [string, string]
  /** Opções fixas do limite (select); ausente = campo numérico livre. */
  opcoes?: number[]
  /** Máximo do campo numérico. */
  maximo?: number
}

export const REGRAS_ANOMALIA: RegraInfo[] = [
  {
    tipo: 'sem_resposta',
    rotulo: 'Cliente sem resposta',
    descricao: 'Avisa quando um cliente escreveu e ninguém respondeu dentro do prazo.',
    unidade: 'horas',
    limiarPadrao: 4,
    frase: ['Cliente sem resposta há mais de', 'horas'],
    opcoes: [2, 4, 8, 12, 24, 48],
  },
  {
    tipo: 'sentimento_negativo',
    rotulo: 'Cliente insatisfeito ou com risco de sair',
    descricao: 'Avisa quem provavelmente está insatisfeito ou pode cancelar. Analisado todo dia de manhã pela IA lendo as conversas.',
    limiarPadrao: 0,
  },
  {
    tipo: 'pendencia',
    rotulo: 'Contrato parado',
    descricao: 'Avisa quando um contrato ficou sem andamento.',
    limiarPadrao: 0,
  },
  {
    tipo: 'queda_volume',
    rotulo: 'Queda no volume de conversas',
    descricao: 'Avisa quando um cliente conversa bem menos do que costuma.',
    unidade: '%',
    limiarPadrao: 50,
    frase: ['Cliente conversando', '% menos que o normal'],
    maximo: 100,
  },
]

export const PROVEDORES: Record<Provedor, string> = {
  uazapi: 'Não oficial (UAZAPI)',
  zernio: 'Oficial (Zernio)',
}

/** Nome do provedor como a tela mostra (o nome técnico vai só em letra pequena). */
export const PROVEDOR_AMIGAVEL: Record<Provedor, { nome: string; via: string; resumo: string }> = {
  uazapi: {
    nome: 'WhatsApp do Chat (QR Code)',
    via: 'via UAZAPI',
    resumo: 'Usa um número já conectado no Chat. Liga na hora, mas pode ser bloqueado se enviar demais.',
  },
  zernio: {
    nome: 'WhatsApp Oficial (Meta)',
    via: 'via Zernio',
    resumo: 'Menor risco de bloqueio. Cada texto precisa ser aprovado pela Meta (até 24h).',
  },
}

/** Quem enviou, no Histórico. */
export const ENVIADO_POR: Record<Provedor, string> = {
  uazapi: 'WhatsApp do Chat',
  zernio: 'WhatsApp Oficial',
}

/** Dias da semana no padrão ISO (1 = segunda … 7 = domingo), como no banco. */
export const DIAS_SEMANA: { valor: number; rotulo: string }[] = [
  { valor: 1, rotulo: 'Segunda-feira' },
  { valor: 2, rotulo: 'Terça-feira' },
  { valor: 3, rotulo: 'Quarta-feira' },
  { valor: 4, rotulo: 'Quinta-feira' },
  { valor: 5, rotulo: 'Sexta-feira' },
  { valor: 6, rotulo: 'Sábado' },
  { valor: 7, rotulo: 'Domingo' },
]

/** Rótulo curto (minúsculo) do dia — "Enviar toda segunda às 09:00". */
export const DIAS_CURTOS: Record<number, string> = {
  1: 'segunda', 2: 'terça', 3: 'quarta', 4: 'quinta', 5: 'sexta', 6: 'sábado', 7: 'domingo',
}

/** "toda segunda" / "todo sábado". */
export function prefixoDia(dia: number): 'toda' | 'todo' {
  return dia === 6 || dia === 7 ? 'todo' : 'toda'
}

export const LIMITE_GESTORES = 10

export function regraInfo(tipo: string): RegraInfo | undefined {
  return REGRAS_ANOMALIA.find((r) => r.tipo === tipo)
}

export interface GestorValidado {
  ok: boolean
  nome: string
  /** E.164; vazio quando inválido. */
  telefone: string
  erro: string
}

const E164 = /^\+[1-9][0-9]{9,14}$/

/** Valida nome e telefone de um gestor antes de gravar (o banco repete a checagem). */
export function validarGestor(nome: string, telefoneBruto: string): GestorValidado {
  const nomeLimpo = (nome ?? '').trim()
  if (!nomeLimpo) return { ok: false, nome: '', telefone: '', erro: 'Informe o nome do gestor.' }
  if (nomeLimpo.length > 80) {
    return { ok: false, nome: nomeLimpo, telefone: '', erro: 'O nome pode ter no máximo 80 letras.' }
  }
  const { telefone, aviso } = normalizaTelefoneBR(telefoneBruto)
  if (!telefone || aviso || !E164.test(telefone)) {
    return {
      ok: false,
      nome: nomeLimpo,
      telefone: '',
      erro: 'Telefone inválido. Use o DDD e o número, por exemplo (11) 99999-8888.',
    }
  }
  return { ok: true, nome: nomeLimpo, telefone, erro: '' }
}

/**
 * Máscara do campo de telefone enquanto a pessoa digita: "11999998888" ->
 * "(11) 99999-8888". Aceita o 55 do país na frente (é descartado) e corta em 11 dígitos.
 */
export function mascaraTelefone(bruto: string): string {
  let d = (bruto ?? '').replace(/\D/g, '')
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2)
  d = d.slice(0, 11)
  if (d.length === 0) return ''
  if (d.length <= 2) return `(${d}`
  const ddd = d.slice(0, 2)
  const resto = d.slice(2)
  if (resto.length <= 4) return `(${ddd}) ${resto}`
  const meio = resto.length === 9 ? 5 : 4
  return `(${ddd}) ${resto.slice(0, meio)}-${resto.slice(meio)}`
}

/** +5511999998888 -> +55 (11) 99999-8888. Fora do padrão BR, devolve como veio. */
export function formataTelefoneExibicao(e164: string | null | undefined): string {
  if (!e164) return ''
  const m = /^\+55(\d{2})(\d{4,5})(\d{4})$/.exec(e164)
  if (!m) return e164
  return `+55 (${m[1]}) ${m[2]}-${m[3]}`
}

// ---------------------------------------------------------------------------
// Prévia do relatório diário (edge function wa-auto-backtest)
// ---------------------------------------------------------------------------

export interface ContagemRelatorio {
  /** Grupos ativos sem cliente vinculado (não é regra; pode faltar em prévias antigas). */
  grupo_sem_cliente?: number
  sem_resposta: number
  sentimento_negativo: number
  pendencia: number
  queda_volume: number
  reunioes: number
}

/** Resumo dos pontos de atenção, sem agenda até haver integração. */
export function resumoContagem(c: Partial<ContagemRelatorio> | null | undefined): string {
  if (!c) return ''
  const partes: string[] = []
  for (const info of REGRAS_ANOMALIA) {
    const n = Number(c[info.tipo] ?? 0)
    if (n > 0) partes.push(`${n} × ${info.rotulo.toLowerCase()}`)
  }
  const g = Number(c.grupo_sem_cliente ?? 0)
  if (g > 0) partes.push(g === 1 ? '1 grupo sem cliente vinculado' : `${g} grupos sem cliente vinculado`)
  if (partes.length === 0) return 'nenhum ponto de atenção'
  return partes.join(' · ')
}

/** Erros "técnicos" que a função devolve, traduzidos para quem usa a tela. */
export function mensagemErroPrevia(erro: string | null | undefined): string {
  if (erro === 'forbidden') return 'Só o administrador da empresa pode ver a prévia.'
  if (erro === 'method_not_allowed' || !erro) return 'Não foi possível gerar a prévia. Tente de novo.'
  return erro
}

// ---------------------------------------------------------------------------
// Agendamento em duas etapas (edge function wa-auto-agendar)
// ---------------------------------------------------------------------------

/** Fuso das reuniões: Brasília (sem horário de verão desde 2019). */
const OFFSET_BRASILIA = '-03:00'
const DATA_HORA_LOCAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/

/**
 * Valor do campo "data e hora" (AAAA-MM-DDTHH:mm, sem fuso) lido como horário
 * de Brasília, mesmo que o computador esteja em outro fuso. null = inválido.
 */
export function dataHoraBrasiliaParaIso(valor: string): string | null {
  const m = DATA_HORA_LOCAL.exec((valor ?? '').trim())
  if (!m) return null
  const [, a, me, d, h, mi] = m.map(Number)
  if (me < 1 || me > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null
  const data = new Date(`${valor.trim()}:00${OFFSET_BRASILIA}`)
  if (Number.isNaN(data.getTime())) return null
  // Rejeita datas que "transbordam" (ex.: 31/02 vira 03/03).
  const conferida = new Date(data.getTime() - 3 * 60 * 60_000)
  if (conferida.getUTCFullYear() !== a || conferida.getUTCMonth() + 1 !== me || conferida.getUTCDate() !== d) return null
  return data.toISOString()
}

/** ISO -> "26/10/2026 às 14:30" no horário de Brasília. */
export function formataDataHoraBrasilia(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const fuso = { timeZone: 'America/Sao_Paulo' } as const
  const data = d.toLocaleDateString('pt-BR', { ...fuso, day: '2-digit', month: '2-digit', year: 'numeric' })
  const hora = d.toLocaleTimeString('pt-BR', { ...fuso, hour: '2-digit', minute: '2-digit', hour12: false })
  return `${data} às ${hora}`
}

export type ResultadoValidacao<T> = { ok: true; valor: T } | { ok: false; erro: string }

/** Mesmas regras da Etapa 1 no servidor: cliente escolhido, futuro, até 12 meses, 15–480 min. */
export function validarMarcacao(
  input: { clientId: string; dataHora: string; duracaoMin: number },
  agora: Date = new Date(),
): ResultadoValidacao<{ client_id: string; scheduled_at: string; duracao_min: number }> {
  if (!input.clientId) return { ok: false, erro: 'Escolha o cliente da reunião.' }
  const iso = dataHoraBrasiliaParaIso(input.dataHora)
  if (!iso) return { ok: false, erro: 'Informe a data e a hora da reunião.' }
  const t = new Date(iso).getTime()
  if (t < agora.getTime()) return { ok: false, erro: 'A reunião precisa ser no futuro.' }
  if (t > agora.getTime() + 366 * 24 * 60 * 60_000) return { ok: false, erro: 'A reunião precisa ser nos próximos 12 meses.' }
  const dur = input.duracaoMin
  if (!Number.isInteger(dur) || dur < 15 || dur > 480) return { ok: false, erro: 'A duração vai de 15 a 480 minutos.' }
  return { ok: true, valor: { client_id: input.clientId, scheduled_at: iso, duracao_min: dur } }
}

/**
 * Link opcional da reunião (vazio = usa o já salvo ou a sala da própria plataforma).
 * Mesmas regras do servidor: só https, sem espaços, sem usuário/senha, sem IP, até 500.
 */
export function validarLinkReuniao(bruto: string): ResultadoValidacao<string | null> {
  const s = (bruto ?? '').trim()
  if (!s) return { ok: true, valor: null }
  if (s.length > 500 || /\s/.test(s)) return { ok: false, erro: 'Link inválido.' }
  let url: URL
  try { url = new URL(s) } catch { return { ok: false, erro: 'Link inválido.' } }
  if (url.protocol !== 'https:') return { ok: false, erro: 'O link precisa começar com https://' }
  if (url.username || url.password) return { ok: false, erro: 'O link não pode conter usuário ou senha.' }
  const host = url.hostname.toLowerCase()
  if (!host.includes('.') || /^[0-9.]+$/.test(host) || host.startsWith('[')) {
    return { ok: false, erro: 'Use um link com endereço de site (não um IP).' }
  }
  return { ok: true, valor: s }
}

export interface GrupoOpcao { contact_id: string; nome: string }

/** Resposta crua de wa-auto-agendar (acao 'enviar_link'), venha com 2xx ou 4xx/5xx. */
export interface RespostaEnviarLink {
  ok?: boolean
  status?: string
  error?: string
  mensagem?: string
  grupos?: GrupoOpcao[]
  grupo?: GrupoOpcao
}

export type DesfechoEnvioLink =
  | { tipo: 'enviado'; texto: string }
  | { tipo: 'ja_enviado'; texto: string }
  | { tipo: 'escolher_grupo'; texto: string; grupos: GrupoOpcao[] }
  | { tipo: 'confirmar_reenvio'; texto: string }
  | { tipo: 'erro'; texto: string }

/** Traduz a resposta do envio do link no que a tela precisa fazer a seguir. */
export function interpretarEnvioLink(r: RespostaEnviarLink | null | undefined): DesfechoEnvioLink {
  if (!r) return { tipo: 'erro', texto: 'Não foi possível falar com o servidor. Tente de novo.' }
  if (r.status === 'enviado' && r.ok !== false) {
    const onde = r.grupo?.nome ? ` no grupo "${r.grupo.nome}"` : ' no grupo do cliente'
    return { tipo: 'enviado', texto: `Link enviado${onde}.` }
  }
  if (r.status === 'ja_enviado') {
    return { tipo: 'ja_enviado', texto: r.mensagem ?? 'O link desta reunião já foi enviado no grupo.' }
  }
  if (r.status === 'escolher_grupo' && Array.isArray(r.grupos) && r.grupos.length > 0) {
    return { tipo: 'escolher_grupo', texto: r.error ?? 'Este cliente tem mais de um grupo. Escolha em qual enviar o link.', grupos: r.grupos }
  }
  if (r.status === 'confirmar_reenvio') {
    return {
      tipo: 'confirmar_reenvio',
      texto: r.error ?? 'A última tentativa não teve confirmação do WhatsApp. Confira o grupo antes de enviar de novo.',
    }
  }
  return { tipo: 'erro', texto: r.error || r.mensagem || 'O envio não deu certo.' }
}

// ---------------------------------------------------------------------------
// Resumo semanal (vai para o CLIENTE): quando pedir confirmação antes de salvar
// ---------------------------------------------------------------------------

export interface EstadoResumo { ativo: boolean; destino: 'privado' | 'grupo' }

/**
 * true quando a mudança faz o resumo automático passar a sair para os clientes
 * (ligar o resumo) ou muda para onde ele vai com o resumo ligado.
 */
export function precisaConfirmarResumo(atual: EstadoResumo, novo: EstadoResumo): boolean {
  if (!novo.ativo) return false
  return !atual.ativo || atual.destino !== novo.destino
}

// ---------------------------------------------------------------------------
// Modelos do WhatsApp oficial (catálogo fixo no servidor — wa-auto-templates)
// ---------------------------------------------------------------------------

export type TipoModeloWa = 'relatorio' | 'resumo' | 'link'

export type StatusModeloWa =
  | 'APPROVED' | 'PENDING' | 'REJECTED' | 'IN_APPEAL' | 'PAUSED' | 'DISABLED' | 'PENDING_DELETION'
  | 'NAO_CRIADO' | 'DESCONHECIDO'

/** Um dos 3 modelos, como a função wa-auto-templates devolve (texto vem do servidor). */
export interface ModeloWa {
  tipo: TipoModeloWa
  nome: string
  titulo: string
  para_quem: string
  idioma: string
  categoria: string
  corpo: string
  /** Texto com os exemplos preenchidos — "é assim que vai chegar". */
  previa: string
  observacao: string | null
  /** null = ainda não consultado na Zernio. */
  status: StatusModeloWa | null
  motivo: string | null
  qualidade: string | null
  texto_diferente: boolean
  consultado_em: string | null
  nome_configurado: string | null
  em_uso: boolean
}

export type TomStatusModelo = 'ok' | 'espera' | 'erro' | 'neutro'

export interface InfoStatusModelo {
  rotulo: string
  explicacao: string
  tom: TomStatusModelo
  /** Pode pedir a criação (o modelo ainda não existe na conta). */
  podeCriar: boolean
}

/** Status → selo e frase simples para a tela. */
export function infoStatusModelo(status: StatusModeloWa | null | undefined): InfoStatusModelo {
  switch (status) {
    case 'APPROVED':
      return { rotulo: 'Aprovado', tom: 'ok', podeCriar: false,
        explicacao: 'Pronto: os envios automáticos já podem usar este texto.' }
    case 'PENDING':
      return { rotulo: 'Em análise', tom: 'espera', podeCriar: false,
        explicacao: 'A Meta está analisando o texto. Costuma levar minutos, mas pode levar até 24 horas. Clique em "Verificar aprovação" mais tarde.' }
    case 'IN_APPEAL':
      return { rotulo: 'Recurso em análise', tom: 'espera', podeCriar: false,
        explicacao: 'Foi pedida uma nova análise à Meta. Aguarde a resposta.' }
    case 'REJECTED':
      return { rotulo: 'Reprovado', tom: 'erro', podeCriar: false,
        explicacao: 'A Meta não aprovou este texto. Fale com o suporte para ajustarmos o texto numa nova versão.' }
    case 'PAUSED':
      return { rotulo: 'Pausado', tom: 'erro', podeCriar: false,
        explicacao: 'A Meta pausou este texto por reclamações de quem recebe. Os envios com ele ficam parados até a liberação.' }
    case 'DISABLED':
      return { rotulo: 'Desativado', tom: 'erro', podeCriar: false,
        explicacao: 'A Meta desativou este texto. Fale com o suporte para criarmos uma nova versão.' }
    case 'PENDING_DELETION':
      return { rotulo: 'Sendo apagado', tom: 'neutro', podeCriar: false,
        explicacao: 'Alguém pediu para apagar este texto no painel da Zernio. O nome fica bloqueado por 30 dias.' }
    case 'NAO_CRIADO':
      return { rotulo: 'Não enviado', tom: 'neutro', podeCriar: true,
        explicacao: 'Este texto ainda não foi mandado para a Meta. Clique em "Pedir aprovação".' }
    case 'DESCONHECIDO':
      return { rotulo: 'Situação desconhecida', tom: 'neutro', podeCriar: false,
        explicacao: 'A Zernio devolveu uma situação que não reconhecemos. Clique em "Verificar aprovação" mais tarde.' }
    default:
      return { rotulo: 'Não verificado', tom: 'neutro', podeCriar: true,
        explicacao: 'Clique em "Verificar aprovação" para ver se este texto já foi aprovado, ou em "Pedir aprovação".' }
  }
}

/** Quem recebe cada texto aprovado — dito na tela (sem citar nome de aba). */
export const QUEM_RECEBE_MODELO: Record<TipoModeloWa, string> = {
  relatorio: 'os gestores da lista do Relatório diário (também é o texto do envio de teste)',
  resumo: 'cada cliente, no privado',
  link: 'o cliente, quando o link da reunião sair pelo WhatsApp Oficial',
}

/** Idiomas aceitos para os textos aprovados (o banco guarda o código). */
export const IDIOMAS_MODELO: { valor: string; rotulo: string }[] = [
  { valor: 'pt_BR', rotulo: 'Português (Brasil)' },
  { valor: 'en_US', rotulo: 'Inglês' },
  { valor: 'es_ES', rotulo: 'Espanhol' },
]

/**
 * Exemplo do resumo semanal ("é assim que o cliente recebe"). É o texto do
 * catálogo oficial (supabase/functions/_shared/wa-modelos-oficiais.ts) preenchido
 * com os exemplos — o teste automacoesWa.test.ts trava os dois iguais.
 */
export const EXEMPLO_RESUMO_SEMANAL =
  'Olá, Padaria Pão Quente! Segue o resumo da semana (19/10 a 26/10).\n' +
  'Assuntos tratados: cardápio de Natal; aprovação das fotos novas\n' +
  'Próximos passos: Equipe vai enviar o material da apresentação; Cliente vai revisar o cronograma de conteúdo\n' +
  'Resumo automático das nossas conversas no WhatsApp. Se algo não estiver certo, é só nos avisar.'

// ---------------------------------------------------------------------------
// Painel "Início": o que falta para cada automação sair, e quando ela sai
// ---------------------------------------------------------------------------

export type Automacao = 'relatorio' | 'resumo' | 'link'
export type AbaWa = 'inicio' | 'conexao' | 'relatorio' | 'alertas' | 'tempo-resposta' | 'assistente' | 'resumo' | 'reunioes' | 'historico' | 'vinculos'

/** Só os campos de wa_auto_config que as regras usam. */
export interface ConfigPendencias {
  provider: Provedor
  uazapi_instance_id: string | null
  relatorio_ativo: boolean
  resumo_ativo: boolean
  resumo_destino: 'privado' | 'grupo'
  agendamento_ativo: boolean
  template_relatorio?: string | null
  template_resumo?: string | null
}

export interface StatusConexao {
  /** WhatsApp Oficial: chave e código da conta salvos. */
  zernioConectado: boolean
}

export interface Pendencia {
  automacao: Automacao
  /** Frase curta: o que falta. */
  texto: string
  /** Onde resolver. */
  aba: AbaWa
}

type ModeloStatusMin = Pick<ModeloWa, 'tipo' | 'status' | 'nome' | 'nome_configurado'>

/**
 * O texto aprovado deste tipo está pronto para uso na oficial?
 *   * catálogo APROVADO → sim;
 *   * a empresa configurou um texto próprio (nome diferente do catálogo) → confiamos;
 *   * catálogo ainda não carregado → vale o nome gravado em wa_auto_config.
 */
export function modeloPronto(
  modelos: ModeloStatusMin[] | null | undefined, tipo: TipoModeloWa, nomeConfigurado?: string | null,
): boolean {
  const m = modelos?.find((x) => x.tipo === tipo)
  if (!m) return !modelos && Boolean(nomeConfigurado)
  if (m.status === 'APPROVED') return true
  return Boolean(m.nome_configurado && m.nome_configurado !== m.nome)
}

/**
 * Lista o que impede cada automação de sair (vazia = tudo pronto).
 * Independe de a automação estar ligada: a tela decide se é "Falta configurar"
 * (desligada) ou "Ligado, mas não vai sair" (ligada).
 */
/** Linha mínima de "quem recebe" (pessoa no privado ou grupo interno). */
export interface DestinoMin {
  ativo: boolean
  /** Ausente/null = pessoa (linhas de antes da migration 20261026250000). */
  tipo?: TipoDestinoRelatorio | string | null
}

export type TipoDestinoRelatorio = 'pessoa' | 'grupo'

/**
 * Quantos destinos ativos do relatório diário conseguem receber: pessoas ativas +
 * grupos ativos — grupo só conta com o número do Chat escolhido (grupo sai sempre
 * pela não oficial, inclusive quando a empresa usa a oficial).
 */
export function contarDestinosAtivos(
  destinos: DestinoMin[] | null | undefined,
  config: Pick<ConfigPendencias, 'uazapi_instance_id'> | null | undefined,
): { pessoas: number; grupos: number; total: number; gruposSemNumero: number } {
  const temNumero = Boolean(config?.uazapi_instance_id)
  let pessoas = 0
  let grupos = 0
  let gruposSemNumero = 0
  for (const d of destinos ?? []) {
    if (!d.ativo) continue
    if (d.tipo === 'grupo') {
      if (temNumero) grupos++
      else gruposSemNumero++
    } else pessoas++
  }
  return { pessoas, grupos, total: pessoas + grupos, gruposSemNumero }
}

/** Grupo interno como vem de wa-auto-backtest { acao: 'listar_grupos_internos' }. */
export interface GrupoInternoMin { grupo_jid: string; nome: string }

const semAcento = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()

/**
 * Opções do "+ Grupo interno": tira os que já estão na lista e filtra pelo nome
 * (sem diferenciar acento e maiúscula). No máximo `max` opções.
 */
export function filtrarGruposInternos<T extends GrupoInternoMin>(
  grupos: readonly T[] | null | undefined,
  busca: string,
  jaNaLista: readonly (string | null | undefined)[],
  max = 200,
): T[] {
  const ja = new Set(jaNaLista.filter((x): x is string => Boolean(x)).map((x) => x.toLowerCase()))
  const termo = semAcento(busca ?? '')
  return (grupos ?? [])
    .filter((g) => !ja.has(g.grupo_jid.toLowerCase()))
    .filter((g) => !termo || semAcento(g.nome).includes(termo))
    .slice(0, max)
}

export function pendenciasAutomacao(
  config: ConfigPendencias | null | undefined,
  gestores: DestinoMin[] | null | undefined,
  conexao: StatusConexao,
  modelos: ModeloStatusMin[] | null | undefined,
): Pendencia[] {
  const p: Pendencia[] = []
  const provider: Provedor = config?.provider ?? 'uazapi'
  const oficial = provider === 'zernio'
  const temNumero = Boolean(config?.uazapi_instance_id)

  // Conexão (relatório e resumo saem pelo provedor escolhido).
  const semConexao = oficial ? !conexao.zernioConectado : !temNumero
  const textoConexao = oficial ? 'conectar o WhatsApp Oficial' : 'escolher o número que envia'
  if (semConexao) {
    p.push({ automacao: 'relatorio', texto: textoConexao, aba: 'conexao' })
    p.push({ automacao: 'resumo', texto: textoConexao, aba: 'conexao' })
  }

  // Relatório diário: "quem recebe" = pelo menos 1 pessoa ou grupo interno ativo.
  const destinos = contarDestinosAtivos(gestores, config)
  if (destinos.total === 0) {
    if (destinos.gruposSemNumero > 0) {
      // Só grupos na lista e nenhum número do Chat escolhido (na oficial, o grupo sai por ele).
      if (oficial || !semConexao) p.push({ automacao: 'relatorio', texto: 'escolher o número para grupos', aba: 'conexao' })
    } else {
      p.push({ automacao: 'relatorio', texto: 'cadastrar quem recebe o relatório', aba: 'relatorio' })
    }
  }
  // Só grupos na lista: o modelo aprovado da Meta não é usado (grupo sai pela não oficial).
  const soGrupos = destinos.pessoas === 0 && destinos.grupos > 0
  if (oficial && !soGrupos && !modeloPronto(modelos, 'relatorio', config?.template_relatorio)) {
    p.push({ automacao: 'relatorio', texto: 'aprovar o texto do relatório na Meta', aba: 'conexao' })
  }

  // Resumo semanal.
  if (oficial && config?.resumo_destino === 'grupo') {
    p.push({ automacao: 'resumo', texto: 'no WhatsApp Oficial o resumo só sai no privado', aba: 'resumo' })
  }
  if (oficial && !modeloPronto(modelos, 'resumo', config?.template_resumo)) {
    p.push({ automacao: 'resumo', texto: 'aprovar o texto do resumo na Meta', aba: 'conexao' })
  }

  // Link da reunião: sai SEMPRE pelo WhatsApp do Chat, mesmo com a oficial.
  if (!temNumero) {
    p.push({
      automacao: 'link',
      texto: oficial ? 'escolher o número para grupos' : 'escolher o número que envia',
      aba: 'conexao',
    })
  }
  return p
}

export type EstadoAutomacao =
  | { tipo: 'ligado' }
  | { tipo: 'desligado' }
  | { tipo: 'ligado_sem_envio'; motivo: string }
  | { tipo: 'falta_configurar'; motivo: string }

/** Selo do cartão: Ligado / Desligado / Ligado, mas não vai sair / Falta configurar. */
export function estadoAutomacao(ativo: boolean, pendencias: Pendencia[]): EstadoAutomacao {
  const primeira = pendencias[0]?.texto
  if (ativo) return primeira ? { tipo: 'ligado_sem_envio', motivo: primeira } : { tipo: 'ligado' }
  return primeira ? { tipo: 'falta_configurar', motivo: primeira } : { tipo: 'desligado' }
}

/** "falta A e B" / "falta A, B e C" — junta as pendências numa frase. */
export function juntarPendencias(pendencias: Pendencia[]): string {
  const t = [...new Set(pendencias.map((x) => x.texto))]
  if (t.length <= 1) return t[0] ?? ''
  return `${t.slice(0, -1).join(', ')} e ${t[t.length - 1]}`
}

// Brasília não tem horário de verão desde 2019: UTC-3 fixo (como no resto do app).
const OFFSET_H = 3
const HORA = /^(\d{1,2}):(\d{2})/

function horaMinuto(hora: string | null | undefined): [number, number] {
  const m = HORA.exec(hora ?? '')
  const h = m ? Math.min(23, Number(m[1])) : 9
  const mi = m ? Math.min(59, Number(m[2])) : 0
  return [h, mi]
}

/** Data de hoje em Brasília (ano, mês 0-11, dia) e o dia da semana ISO (1 = segunda). */
function hojeBrasilia(agora: Date) {
  const local = new Date(agora.getTime() - OFFSET_H * 3_600_000)
  return {
    a: local.getUTCFullYear(), m: local.getUTCMonth(), d: local.getUTCDate(),
    diaIso: ((local.getUTCDay() + 6) % 7) + 1,
  }
}

/** Próximo envio do relatório diário (todo dia às `hora`, horário de Brasília). */
export function proximoEnvioDiario(hora: string | null | undefined, agora: Date = new Date()): Date {
  const [h, mi] = horaMinuto(hora)
  const { a, m, d } = hojeBrasilia(agora)
  let t = Date.UTC(a, m, d, h + OFFSET_H, mi)
  if (t <= agora.getTime()) t += 24 * 3_600_000
  return new Date(t)
}

/** Próximo envio do resumo semanal (dia ISO 1–7 às `hora`, horário de Brasília). */
export function proximoEnvioSemanal(dia: number, hora: string | null | undefined, agora: Date = new Date()): Date {
  const [h, mi] = horaMinuto(hora)
  const { a, m, d, diaIso } = hojeBrasilia(agora)
  const alvo = dia >= 1 && dia <= 7 ? dia : 1
  let t = Date.UTC(a, m, d + ((alvo - diaIso + 7) % 7), h + OFFSET_H, mi)
  if (t <= agora.getTime()) t += 7 * 24 * 3_600_000
  return new Date(t)
}

const DIAS_ABREV = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']

/** "hoje às 09:00" / "amanhã às 09:00" / "segunda, 02/11 às 09:00" (Brasília). */
export function formataQuando(data: Date, agora: Date = new Date()): string {
  const local = new Date(data.getTime() - OFFSET_H * 3_600_000)
  const hoje = hojeBrasilia(agora)
  const hh = String(local.getUTCHours()).padStart(2, '0')
  const mm = String(local.getUTCMinutes()).padStart(2, '0')
  const diaData = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate())
  const diaHoje = Date.UTC(hoje.a, hoje.m, hoje.d)
  const dif = Math.round((diaData - diaHoje) / 86_400_000)
  if (dif === 0) return `hoje às ${hh}:${mm}`
  if (dif === 1) return `amanhã às ${hh}:${mm}`
  if (dif === -1) return `ontem às ${hh}:${mm}`
  const dd = String(local.getUTCDate()).padStart(2, '0')
  const me = String(local.getUTCMonth() + 1).padStart(2, '0')
  if (dif > 1 && dif < 7) return `${DIAS_ABREV[local.getUTCDay()]}, ${dd}/${me} às ${hh}:${mm}`
  return `${dd}/${me} às ${hh}:${mm}`
}

/** "26/10 às 10:00" (Brasília) — data curta do Histórico. */
export function formataDataCurta(iso: string | null | undefined): string {
  if (!iso) return ''
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return ''
  const local = new Date(t - OFFSET_H * 3_600_000)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(local.getUTCDate())}/${p(local.getUTCMonth() + 1)} às ${p(local.getUTCHours())}:${p(local.getUTCMinutes())}`
}

// ---------------------------------------------------------------------------
// "Primeiros passos" (aba Início)
// ---------------------------------------------------------------------------

export interface PassoInicial {
  chave: 'conexao' | 'textos' | 'teste' | 'gestores' | 'relatorio'
  titulo: string
  feito: boolean
  aba: AbaWa
}

export function primeirosPassos(input: {
  provider: Provedor
  conectado: boolean
  textosAprovados: boolean
  testeEnviado: boolean
  /** Pessoas ativas na lista do relatório. */
  gestoresAtivos: number
  /** Grupos internos ativos que conseguem receber (contarDestinosAtivos). */
  gruposAtivos?: number
  relatorioAtivo: boolean
}): PassoInicial[] {
  const quemRecebe = input.gestoresAtivos + (input.gruposAtivos ?? 0)
  const passos: PassoInicial[] = [
    { chave: 'conexao', titulo: 'Conectar o WhatsApp que envia', feito: input.conectado, aba: 'conexao' },
  ]
  if (input.provider === 'zernio') {
    passos.push({ chave: 'textos', titulo: 'Aprovar os textos na Meta', feito: input.textosAprovados, aba: 'conexao' })
  }
  passos.push(
    { chave: 'teste', titulo: 'Enviar uma mensagem de teste', feito: input.testeEnviado, aba: 'conexao' },
    { chave: 'gestores', titulo: 'Dizer quem recebe o relatório', feito: quemRecebe > 0, aba: 'relatorio' },
    { chave: 'relatorio', titulo: 'Ligar o relatório diário', feito: input.relatorioAtivo, aba: 'relatorio' },
  )
  return passos
}

// ---------------------------------------------------------------------------
// Histórico: erro do envio em linguagem simples
// ---------------------------------------------------------------------------

/** Erros técnicos comuns → frase simples; nomes de aba antigos → nomes atuais. */
export function traduzErroEnvio(erro: string | null | undefined): string {
  const s = (erro ?? '').trim()
  if (!s) return ''
  const baixo = s.toLowerCase()
  if (/timeout|timed out|aborterror/.test(baixo)) return 'O WhatsApp demorou demais para responder. Tente de novo mais tarde.'
  if (/fetch failed|network|econn|dns/.test(baixo)) return 'Não foi possível falar com o WhatsApp naquele momento.'
  if (/\b401\b|unauthorized/.test(baixo)) return 'A chave de acesso foi recusada. Confira a conexão.'
  if (/\b429\b|rate.?limit|too many/.test(baixo)) return 'Muitos envios em pouco tempo. O WhatsApp pediu para esperar.'
  if (/^(http )?5\d\d\b|internal server error|bad gateway/.test(baixo)) return 'O serviço do WhatsApp estava fora do ar.'
  return s
    .replace(/na aba Agendamento/g, 'na aba Reuniões')
    .replace(/"Agendamento em duas etapas"/g, '"Permitir enviar o link no grupo pelo WhatsApp"')
    .replace(/da aba Gestores/g, 'do Relatório diário')
    .replace(/"Modelos aprovados"/g, '"Textos aprovados pela Meta"')
    .replace(/o nome do modelo do aviso diário/g, 'o texto do relatório diário')
}

// ---------------------------------------------------------------------------
// Pontos de atenção de hoje (wa-auto-backtest { acao: 'listar_alertas' }) e o
// que o gestor pediu para não alertar (tabela wa_auto_alertas_ignorados).
// ---------------------------------------------------------------------------

/**
 * Tipo de alerta do painel: as 4 regras + 'grupo_sem_cliente' (grupo de WhatsApp
 * com conversa recente e sem cliente vinculado — não é regra configurável).
 */
export type TipoAlertaPainel = TipoRegra | 'grupo_sem_cliente'
/** 'todos' = qualquer alerta daquele cliente. */
export type TipoIgnorado = TipoAlertaPainel | 'todos'
/**
 * resolvido   = some este alerta; volta se acontecer de novo depois;
 * ate_data    = silenciado até `ate`;
 * ate_novidade = silenciado até o cliente escrever de novo;
 * sempre      = nunca mais.
 */
export type ModoIgnorado = 'resolvido' | 'ate_data' | 'ate_novidade' | 'sempre'

export interface AlertaHoje {
  fontes_pedidos?: { message_id: string; criado_em: string; autor: string; trecho: string | null; responsabilidade: 'interna' | 'terceiro' | 'cliente' | 'indeterminada' }[]
  /** Identifica o alerta na lista (estável entre recargas). */
  chave_alerta: string
  /** Vem do servidor: pode chegar um tipo novo que a tela ainda não conhece. */
  tipo: string
  cliente: string | null
  client_id: string | null
  contact_id: string | null
  conversation_id: string | null
  detalhe: string | null
  desde: string | null
  prioridade?: number | string | null
  /**
   * Só nos alertas de satisfação: 'insatisfeito'/'atencao' vêm da análise diária
   * da IA; 'risco' vem de regra (silêncio, pedido antigo em aberto, queda).
   */
  nivel?: 'insatisfeito' | 'atencao' | 'risco' | null
  /** 0–1: quanto a IA tem certeza do nível. */
  confianca?: number | null
  /** Motivo curto escrito pela IA (sem trecho da conversa). */
  motivo?: string | null
}

export interface IgnoradoWa {
  id: string
  tipo: string
  cliente: string | null
  modo: ModoIgnorado
  ate: string | null
  motivo: string | null
  created_at: string
  /** Opcional: nome de quem silenciou, se o servidor mandar. */
  criado_por_nome?: string | null
}

/** Linha a gravar em wa_auto_alertas_ignorados (tenant_id e criado_por vêm do banco). */
export interface NovoIgnorado {
  tipo: TipoIgnorado
  client_id: string | null
  contact_id: string | null
  modo: ModoIgnorado
  ate: string | null
  motivo: string | null
}

/** O que o gestor escolheu na linha do alerta. */
export type EscolhaIgnorar =
  | { acao: 'resolvido' }
  | { acao: 'silenciar'; dias: 7 | 30 }
  | { acao: 'ate_novidade' }
  | { acao: 'nunca'; escopo: 'tipo' | 'cliente'; motivo?: string }

export const LIMITE_MOTIVO_IGNORAR = 200

/** Ordem e títulos dos grupos na tela. */
export const GRUPOS_ALERTA: { tipo: TipoAlertaPainel; titulo: string }[] = [
  { tipo: 'sem_resposta', titulo: 'Clientes esperando resposta' },
  { tipo: 'sentimento_negativo', titulo: 'Clientes insatisfeitos ou em risco' },
  { tipo: 'pendencia', titulo: 'Contratos parados' },
  { tipo: 'queda_volume', titulo: 'Clientes conversando menos que o normal' },
  { tipo: 'grupo_sem_cliente', titulo: 'Grupos ativos sem cliente vinculado' },
]

/**
 * Link de "Grupos e clientes" (antes aba Vínculos) já filtrado no grupo do alerta (contato + nome do grupo).
 * null quando o alerta não é de grupo sem cliente ou não tem contato.
 */
export function linkVincularGrupo(a: Pick<AlertaHoje, 'tipo' | 'contact_id' | 'cliente'>): string | null {
  if (a.tipo !== 'grupo_sem_cliente' || !a.contact_id) return null
  const q = new URLSearchParams({ contato: a.contact_id })
  const nome = (a.cliente ?? '').trim()
  if (nome) q.set('nome', nome.slice(0, 80))
  return `/clientes/grupos?${q.toString()}`
}

/** Nome curto do tipo, para frases como "Silenciado: clientes esperando resposta". */
export function rotuloTipoAlerta(tipo: string): string {
  if (tipo === 'todos') return 'Todos os alertas'
  return GRUPOS_ALERTA.find((g) => g.tipo === tipo)?.titulo ?? 'Outros alertas'
}

/** "até 02/11" / "até o cliente escrever" / "nunca mais" / "resolvido". */
export function rotuloModoIgnorado(
  modo: string, ate: string | null | undefined, agora: Date = new Date(),
): string {
  switch (modo) {
    case 'resolvido': return 'resolvido'
    case 'ate_novidade': return 'até o cliente escrever'
    case 'sempre': return 'nunca mais'
    case 'ate_data': {
      const t = ate ? new Date(ate).getTime() : NaN
      if (Number.isNaN(t)) return 'por um tempo'
      const local = new Date(t - OFFSET_H * 3_600_000)
      const p = (n: number) => String(n).padStart(2, '0')
      const ano = local.getUTCFullYear() !== hojeBrasilia(agora).a ? `/${local.getUTCFullYear()}` : ''
      return `até ${p(local.getUTCDate())}/${p(local.getUTCMonth() + 1)}${ano}`
    }
    default: return 'silenciado'
  }
}

/**
 * Fim do dia (23:59:59.999, horário de Brasília) daqui a `dias` dias.
 * Ex.: hoje 26/10 + 7 → até o fim de 02/11; o alerta volta no relatório de 03/11.
 */
export function ateDaquiDias(dias: number, agora: Date = new Date()): string {
  const { a, m, d } = hojeBrasilia(agora)
  return new Date(Date.UTC(a, m, d + dias + 1, OFFSET_H) - 1).toISOString()
}

/**
 * Quem o pedido cobre: o cliente (se o alerta tem um) ou, sem cliente, o contato.
 * Assim "a Full Sales cancelou" vale para todas as conversas da Full Sales.
 */
export function alvoDoAlerta(a: Pick<AlertaHoje, 'client_id' | 'contact_id'>): { client_id: string | null; contact_id: string | null } {
  if (a.client_id) return { client_id: a.client_id, contact_id: null }
  return { client_id: null, contact_id: a.contact_id ?? null }
}

/** Monta a linha a gravar. null = o alerta não tem cliente nem contato (não dá para silenciar). */
export function montarIgnorado(
  alerta: AlertaHoje, escolha: EscolhaIgnorar, agora: Date = new Date(),
): NovoIgnorado | null {
  const alvo = alvoDoAlerta(alerta)
  if (!alvo.client_id && !alvo.contact_id) return null
  const tipoConhecido = GRUPOS_ALERTA.find((g) => g.tipo === alerta.tipo)?.tipo
  const clienteTodo = escolha.acao === 'nunca' && escolha.escopo === 'cliente'
  // Tipo que a tela não conhece: o banco recusaria; só "nenhum alerta deste cliente" funciona.
  if (!tipoConhecido && !clienteTodo) return null
  const tipoAlerta: TipoIgnorado = tipoConhecido ?? 'todos'
  const base = { ...alvo, tipo: tipoAlerta, ate: null, motivo: null }
  switch (escolha.acao) {
    case 'resolvido': return { ...base, modo: 'resolvido' }
    case 'silenciar': return { ...base, modo: 'ate_data', ate: ateDaquiDias(escolha.dias, agora) }
    case 'ate_novidade': return { ...base, modo: 'ate_novidade' }
    case 'nunca': {
      const motivo = (escolha.motivo ?? '').trim().slice(0, LIMITE_MOTIVO_IGNORAR)
      return {
        ...base,
        tipo: escolha.escopo === 'cliente' ? 'todos' : tipoAlerta,
        modo: 'sempre',
        motivo: motivo || null,
      }
    }
  }
}

/** Este alerta some com o pedido `ig`? (mesmo tipo — ou 'todos' — e mesmo cliente/contato). */
export function alertaCobertoPor(alerta: AlertaHoje, ig: Pick<NovoIgnorado, 'tipo' | 'client_id' | 'contact_id'>): boolean {
  if (ig.tipo !== 'todos' && ig.tipo !== alerta.tipo) return false
  if (ig.client_id) return alerta.client_id === ig.client_id
  if (ig.contact_id) return alerta.contact_id === ig.contact_id
  return false
}

function pesoPrioridade(p: AlertaHoje['prioridade']): number {
  if (typeof p === 'number' && Number.isFinite(p)) return p
  const s = String(p ?? '').toLowerCase()
  if (s === 'alta' || s === 'high') return 3
  if (s === 'media' || s === 'média' || s === 'medium') return 2
  if (s === 'baixa' || s === 'low') return 1
  const n = Number(s)
  return s && Number.isFinite(n) ? n : 0
}

export interface GrupoAlertas {
  tipo: string
  titulo: string
  alertas: AlertaHoje[]
}

/**
 * Agrupa por tipo (na ordem de GRUPOS_ALERTA; tipos desconhecidos em "Outros
 * alertas", no fim). Dentro do grupo: maior prioridade, depois quem espera há
 * mais tempo, depois nome do cliente. Grupos vazios não aparecem.
 */
export function agruparAlertas(alertas: AlertaHoje[] | null | undefined): GrupoAlertas[] {
  const lista = [...(alertas ?? [])]
  const tempo = (iso: string | null) => {
    const t = iso ? new Date(iso).getTime() : NaN
    return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t
  }
  lista.sort((x, y) =>
    pesoPrioridade(y.prioridade) - pesoPrioridade(x.prioridade)
    || tempo(x.desde) - tempo(y.desde)
    || (x.cliente ?? '').localeCompare(y.cliente ?? '', 'pt-BR'))
  const grupos: GrupoAlertas[] = GRUPOS_ALERTA.map((g) => ({
    tipo: g.tipo, titulo: g.titulo, alertas: lista.filter((a) => a.tipo === g.tipo),
  }))
  const outros = lista.filter((a) => !GRUPOS_ALERTA.some((g) => g.tipo === a.tipo))
  grupos.push({ tipo: 'outros', titulo: 'Outros alertas', alertas: outros })
  return grupos.filter((g) => g.alertas.length > 0)
}

/** "há poucos minutos" / "há 5 h" / "há 3 dias" / "desde 12/10" (Brasília). */
export function formataDesde(iso: string | null | undefined, agora: Date = new Date()): string {
  if (!iso) return ''
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return ''
  const horas = Math.floor((agora.getTime() - t) / 3_600_000)
  if (horas < 1) return 'há poucos minutos'
  if (horas < 24) return `há ${horas} h`
  const dias = Math.floor(horas / 24)
  if (dias < 7) return dias === 1 ? 'há 1 dia' : `há ${dias} dias`
  const local = new Date(t - OFFSET_H * 3_600_000)
  const p = (n: number) => String(n).padStart(2, '0')
  return `desde ${p(local.getUTCDate())}/${p(local.getUTCMonth() + 1)}`
}

const TEXTO_OCULTO: Record<string, (n: number) => string> = {
  contrato_encerrado: (n) => `${n} com contrato encerrado`,
  cliente_inativo: (n) => (n === 1 ? '1 cliente inativo' : `${n} clientes inativos`),
  fora_da_janela: (n) => (n === 1 ? '1 parada há mais de 7 dias' : `${n} paradas há mais de 7 dias`),
  sem_cadastro: (n) => (n === 1 ? '1 de contato sem cadastro' : `${n} de contatos sem cadastro`),
}

function juntarFrase(partes: string[]): string {
  if (partes.length <= 1) return partes[0] ?? ''
  return `${partes.slice(0, -1).join(', ')} e ${partes[partes.length - 1]}`
}

/**
 * O que o servidor tirou da lista antes de mostrar.
 *   automaticos: "3 com contrato encerrado, 2 clientes inativos e 1 por outros motivos" (ou null);
 *   pelo_gestor: quantos ficaram de fora porque alguém da equipe silenciou.
 */
export function textoOcultos(
  ocultos: Record<string, unknown> | null | undefined,
): { automaticos: string | null; pelo_gestor: number } {
  const partes: string[] = []
  let outros = 0
  let pelo_gestor = 0
  for (const [chave, valor] of Object.entries(ocultos ?? {})) {
    const n = typeof valor === 'number' && Number.isFinite(valor) ? Math.floor(valor) : 0
    if (n <= 0) continue
    if (chave === 'ignorados_pelo_gestor') pelo_gestor += n
    else if (TEXTO_OCULTO[chave]) partes.push(TEXTO_OCULTO[chave](n))
    else outros += n
  }
  if (outros > 0) partes.push(`${outros} por outros motivos`)
  return { automaticos: partes.length ? juntarFrase(partes) : null, pelo_gestor }
}

// ---------------------------------------------------------------------------
// Assistente da equipe no WhatsApp (aba "Assistente")
// Tabelas: wa_agente_membros, wa_agente_grupos, wa_agente_grupo_numeros,
// wa_agente_execucoes (migration 20261027090000). Textos literais de "como
// chamar" em ./automacoesWaAgente.ts (espelho do servidor).
// ---------------------------------------------------------------------------

/** Iguais aos limites do banco (triggers da migration 20261027090000). */
export const LIMITE_MEMBROS_AGENTE = 100
export const LIMITE_GRUPOS_AGENTE = 10
export const MAX_NUMEROS_GRUPO = 5

/** Aviso do "Todos no grupo veem tudo" (decisão do dono, 26/10/2026). */
export const AVISO_ACESSO_TOTAL =
  'O assistente vai responder sobre todos os clientes da empresa para qualquer pessoa deste grupo.'

/** Aviso fixo de grupo interno no Chat. */
export const AVISO_GRUPO_INVISIVEL =
  'Este grupo fica invisível no Chat para quem não é admin ou gerente.'

export type ResultadoExecucaoAgente =
  | 'respondido' | 'sem_escopo' | 'limite' | 'teto' | 'erro_ia' | 'recusado' | 'humano_assumiu' | 'simulado' | 'restrito'
  | 'audio_ignorado'

export const RESULTADO_EXECUCAO: Record<ResultadoExecucaoAgente, { rotulo: string; tom: 'ok' | 'atencao' | 'erro' | 'neutro' }> = {
  respondido: { rotulo: 'Respondeu', tom: 'ok' },
  restrito: { rotulo: 'Respondeu só o básico (grupo com gente de fora)', tom: 'atencao' },
  sem_escopo: { rotulo: 'Sem acesso aos clientes', tom: 'atencao' },
  limite: { rotulo: 'Limite de perguntas atingido', tom: 'atencao' },
  teto: { rotulo: 'Limite de gasto do dia atingido', tom: 'erro' },
  erro_ia: { rotulo: 'A IA falhou', tom: 'erro' },
  recusado: { rotulo: 'Resposta bloqueada pela segurança', tom: 'erro' },
  humano_assumiu: { rotulo: 'Ficou quieto (alguém da equipe já respondeu)', tom: 'neutro' },
  simulado: { rotulo: 'Simulação (nada enviado)', tom: 'neutro' },
  audio_ignorado: { rotulo: 'Ouviu um áudio que não era com ela (nada enviado)', tom: 'neutro' },
}

export function rotuloResultadoExecucao(r: string | null | undefined): { rotulo: string; tom: 'ok' | 'atencao' | 'erro' | 'neutro' } {
  return RESULTADO_EXECUCAO[r as ResultadoExecucaoAgente] ?? { rotulo: r || '—', tom: 'neutro' }
}

/** "vê toda a carteira" / "vê 12 clientes" / "não vê nenhum cliente". */
export function textoEscopo(c: { ve_tudo: boolean; clientes: number; escopo_ok?: boolean }): string {
  if (c.escopo_ok === false) return 'não foi possível ver a carteira'
  if (c.ve_tudo) return 'vê toda a carteira'
  if (c.clientes <= 0) return 'não vê nenhum cliente'
  return c.clientes === 1 ? 'vê 1 cliente' : `vê ${c.clientes} clientes`
}

/** US$ com 2 casas (4 se for menos de 1 centavo). */
export function formatarCustoUsd(v: number | string | null | undefined): string {
  const n = Number(v ?? 0)
  if (!Number.isFinite(n) || n <= 0) return 'US$ 0,00'
  const casas = n < 0.01 ? 4 : 2
  return `US$ ${n.toFixed(casas).replace('.', ',')}`
}

export interface MembroAgenteMin { user_id: string; telefone: string }

/** Valida a pessoa + WhatsApp antes de gravar (o banco repete: ativo, não-cliente, mesma empresa). */
export function validarMembroAgente(
  userId: string | null | undefined, telefoneBruto: string, existentes: readonly MembroAgenteMin[] = [],
): { ok: true; telefone: string } | { ok: false; erro: string } {
  if (!userId) return { ok: false, erro: 'Escolha a pessoa da equipe.' }
  if (existentes.some((m) => m.user_id === userId)) return { ok: false, erro: 'Essa pessoa já está na lista.' }
  if (existentes.length >= LIMITE_MEMBROS_AGENTE) return { ok: false, erro: `A lista tem no máximo ${LIMITE_MEMBROS_AGENTE} pessoas.` }
  const { telefone, aviso } = normalizaTelefoneBR(telefoneBruto)
  if (!telefone || aviso || !E164.test(telefone)) {
    return { ok: false, erro: 'WhatsApp inválido. Use o DDD e o número, por exemplo (11) 99999-8888.' }
  }
  const chave = (t: string) => { const d = t.replace(/\D/g, ''); return d.slice(0, 4) + d.slice(-8) }
  if (existentes.some((m) => chave(m.telefone) === chave(telefone))) return { ok: false, erro: 'Esse WhatsApp já está na lista.' }
  return { ok: true, telefone }
}

/** Principal + reservas → linhas de wa_agente_grupo_numeros (ordem 1..5, sem repetir). */
export function montarNumerosGrupo(
  principal: string | null | undefined, reservas: readonly (string | null | undefined)[] = [],
): { ok: true; linhas: { instance_uuid: string; ordem: number }[] } | { ok: false; erro: string } {
  if (!principal) return { ok: false, erro: 'Escolha o número principal do grupo.' }
  const todos = [principal, ...reservas.filter((r): r is string => !!r)]
  if (new Set(todos).size !== todos.length) return { ok: false, erro: 'O mesmo número não pode aparecer duas vezes.' }
  if (todos.length > MAX_NUMEROS_GRUPO) return { ok: false, erro: `No máximo ${MAX_NUMEROS_GRUPO} números por grupo.` }
  return { ok: true, linhas: todos.map((instance_uuid, i) => ({ instance_uuid, ordem: i + 1 })) }
}

export type EstadoAssistente =
  | { tipo: 'desligado' }
  | { tipo: 'ligado'; resumo: string }
  | { tipo: 'falta'; motivo: string }

/** Situação do assistente para o cartão do Início e o topo da aba. */
export function estadoAssistente(input: {
  ativo: boolean
  privado: boolean
  grupos: boolean
  membrosAtivos: number
  gruposAtivos: number
}): EstadoAssistente {
  if (!input.ativo) return { tipo: 'desligado' }
  if (!input.privado && !input.grupos) return { tipo: 'falta', motivo: 'escolher onde ele responde (privado ou grupos)' }
  const temPrivado = input.privado && input.membrosAtivos > 0
  const temGrupo = input.grupos && input.gruposAtivos > 0
  if (!temPrivado && !temGrupo) {
    return { tipo: 'falta', motivo: input.grupos && !input.privado ? 'liberar um grupo interno' : 'cadastrar quem pode falar com ele' }
  }
  const partes: string[] = []
  if (temPrivado) partes.push(input.membrosAtivos === 1 ? '1 pessoa no privado' : `${input.membrosAtivos} pessoas no privado`)
  if (temGrupo) partes.push(input.gruposAtivos === 1 ? '1 grupo' : `${input.gruposAtivos} grupos`)
  return { tipo: 'ligado', resumo: `Responde ${partes.join(' e ')}` }
}
