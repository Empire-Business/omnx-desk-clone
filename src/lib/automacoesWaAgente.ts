// Espelho de supabase/functions/_shared/wa-agente-como-chamar.ts (textos LITERAIS
// do assistente da equipe: como chamar, ajuda, boas-vindas e validação do nome).
//
// O código abaixo da linha "INÍCIO DO ESPELHO" precisa ser IDÊNTICO ao do servidor —
// o teste automacoesWaAgente.test.ts compara os dois arquivos. Mudou lá → copie aqui.

// ===== INÍCIO DO ESPELHO =====

/** Uma linha só, sem controle/invisíveis/formatação do WhatsApp, sem @ e sem link. */
function limparNome(bruto: string | null | undefined, max = 30): string {
  let s = ''
  for (const ch of String(bruto ?? '').normalize('NFC')) {
    const c = ch.codePointAt(0) ?? 0
    const invisivel = c <= 0x1f || (c >= 0x7f && c <= 0x9f) || (c >= 0x200b && c <= 0x200f) ||
      (c >= 0x2028 && c <= 0x202e) || (c >= 0x2060 && c <= 0x206f) || c === 0xfeff
    s += invisivel ? ' ' : ch
  }
  s = s.replace(/[*_~`{}[\]<>|@\\"]/g, '').replace(/:\/\//g, ' ').replace(/\s+/g, ' ').trim()
  const letras = Array.from(s)
  return letras.length > max ? letras.slice(0, max).join('').trimEnd() : s
}

/** Nome padrão sugerido na tela. */
export const NOME_AGENTE_PADRAO = 'Ana'

/** Só os 4 últimos dígitos de um telefone (ou null). */
export function finalDoNumero(telefone: string | null | undefined): string | null {
  const d = String(telefone ?? '').replace(/\D/g, '')
  return d.length >= 8 ? d.slice(-4) : null
}

export interface DadosComoChamar {
  /** Nome do assistente ("Ana"). */
  nome: string
  /** Nome do contato/perfil do número que responde (o que aparece ao digitar @). Vazio → nome. */
  nomeContato?: string | null
  /** Telefone do número que responde (só os 4 últimos dígitos aparecem). */
  telefoneNumero?: string | null
}

function partes(d: DadosComoChamar): { nome: string; contato: string; final: string | null } {
  const nome = limparNome(d.nome) || NOME_AGENTE_PADRAO
  const contato = limparNome(d.nomeContato) || nome
  return { nome, contato, final: finalDoNumero(d.telefoneNumero) }
}

/** Rodapé no PRIVADO (3 variações; a 1ª é a pedida pelo dono). */
export function rodapesPrivado(): string[] {
  return [
    'Dúvidas? É só me responder aqui.',
    'Qualquer dúvida, é só me responder aqui.',
    'Se quiser saber mais de algum cliente, é só me perguntar aqui.',
  ]
}

/** Rodapé no GRUPO interno (3 variações; a 1ª é a pedida pelo dono). */
export function rodapesGrupo(d: DadosComoChamar): string[] {
  const { nome, contato, final } = partes(d)
  const escolha = final ? `digite @ e escolha o contato final ${final}` : `digite @ e escolha o contato ${contato}`
  const curto = final ? `o contato final ${final}` : `o contato ${contato}`
  return [
    `Para falar comigo aqui, marque @${contato} (${escolha}) ou responda a esta mensagem. Também funciona começar com "${nome},"`,
    `Quer perguntar algo? Marque @${contato} (${escolha}), responda a esta mensagem ou comece com "${nome},".`,
    `Para me chamar no grupo: marque @${contato} (${curto}), responda a uma mensagem minha ou comece com "${nome},".`,
  ]
}

/** Sorteia um rodapé (aleatorio em [0,1)). */
export function rodapeComoChamar(
  canal: 'privado' | 'grupo', d: DadosComoChamar, aleatorio: () => number = Math.random,
): string {
  const lista = canal === 'grupo' ? rodapesGrupo(d) : rodapesPrivado()
  return lista[Math.min(lista.length - 1, Math.floor(aleatorio() * lista.length))]
}

/** O que o assistente sabe fazer (lista fixa, igual na ajuda e nas boas-vindas). */
export const O_QUE_FACO: readonly string[] = [
  'pontos de atenção de hoje (sem resposta, insatisfeitos, pendências)',
  'situação, satisfação e contratos de um cliente',
  'histórico completo de um cliente: todos os grupos e conversas privadas dele, em todos os números, com pendências e satisfação',
  'resumo da conversa recente com um contato ou grupo',
  'quem está satisfeito, insatisfeito ou em risco, com o motivo',
  'desempenho de atendimento e carteira de cada pessoa da equipe',
  'panorama de contratos, inadimplência, clientes, recebíveis, comissões, onboarding e demandas',
  'aprende com o feedback da equipe e ajusta o aviso diário',
]

/** Exemplos de pergunta das boas-vindas. */
export const EXEMPLOS_PERGUNTA: readonly string[] = [
  'Quais clientes estão sem resposta hoje?',
  'Quais clientes precisam de atenção hoje?',
  'Como está a satisfação do cliente Fulano?',
]

/** Resposta da "ajuda" ("ajuda", "menu", "o que você faz?") — 3 aberturas, mesmo conteúdo. */
export function textosAjuda(canal: 'privado' | 'grupo', d: DadosComoChamar): string[] {
  const { nome } = partes(d)
  const lista = O_QUE_FACO.map((i) => `• ${i}`).join('\n')
  const fim = canal === 'grupo' ? rodapesGrupo(d)[0] : 'É só me mandar a pergunta aqui.'
  const regras = 'Mostro só os clientes da carteira de quem pergunta. Leio, respondo e aprendo com o feedback de vocês: não mando nada para clientes.'
  return [
    `Oi! Eu sou a ${nome}, assistente da equipe aqui no WhatsApp. Posso te ajudar com:\n${lista}\n${regras}\n\n${fim}`,
    `Sou a ${nome}, a assistente da equipe. Dá para me perguntar sobre:\n${lista}\n${regras}\n\n${fim}`,
    `Aqui é a ${nome}! Eu consigo te ajudar com:\n${lista}\n${regras}\n\n${fim}`,
  ]
}

/** Boas-vindas (uma única vez por pessoa/grupo): o que faz, 3 exemplos e como chamar. */
export function textoBoasVindas(canal: 'privado' | 'grupo', d: DadosComoChamar): string {
  const { nome } = partes(d)
  const exemplos = EXEMPLOS_PERGUNTA.map((e) => `• "${e}"`).join('\n')
  const quem = canal === 'grupo' ? 'Oi, pessoal!' : 'Oi!'
  const como = canal === 'grupo' ? rodapesGrupo(d)[0] : 'É só me mandar a pergunta aqui no privado.'
  return `${quem} Eu sou a ${nome}, a assistente da equipe no WhatsApp. Respondo sobre os clientes da carteira de cada um: alertas, satisfação e contratos.\nAlguns exemplos:\n${exemplos}\n\n${como}`
}

// ---------------------------------------------------------------------------
// Validação do nome do assistente
// ---------------------------------------------------------------------------

/** Minúsculo, sem acento, espaços simples. */
export function chaveNomeAgente(s: string | null | undefined): string {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

export type ResultadoNomeAgente = { ok: true; nome: string } | { ok: false; erro: string }

/** Tamanho máximo do nome (igual ao CHECK de wa_auto_config.agente_nome). */
export const MAX_NOME_AGENTE = 24

/**
 * Nome do assistente — mesma regra do CHECK do banco (migration 20261027090000):
 * só letras (com acento) e espaço, começa com letra, 3 a 24 caracteres. E não pode
 * colidir com o nome (ou 1º nome) de alguém da equipe nem com o nome de um cliente
 * — senão "Ana, …" no grupo acionaria por engano.
 */
export function validarNomeAgente(
  bruto: string, nomesEquipe: readonly (string | null)[] = [], nomesClientes: readonly (string | null)[] = [],
): ResultadoNomeAgente {
  const nome = String(bruto ?? '').replace(/\s+/g, ' ').trim()
  if (Array.from(nome).length < 3) return { ok: false, erro: 'Use pelo menos 3 letras.' }
  if (Array.from(nome).length > MAX_NOME_AGENTE) return { ok: false, erro: `Use no máximo ${MAX_NOME_AGENTE} caracteres.` }
  if (!/^\p{L}[\p{L} ]*$/u.test(nome)) return { ok: false, erro: 'Use só letras e espaço (sem números, hífen ou símbolos).' }
  const k = chaveNomeAgente(nome)
  for (const n of nomesEquipe) {
    const c = chaveNomeAgente(n)
    if (c && (c === k || c.split(' ')[0] === k)) {
      return { ok: false, erro: 'Já existe alguém da equipe com esse nome. Escolha outro para não confundir.' }
    }
  }
  for (const n of nomesClientes) {
    if (chaveNomeAgente(n) === k) return { ok: false, erro: 'Já existe um cliente com esse nome. Escolha outro.' }
  }
  return { ok: true, nome }
}
