// Preferências que a equipe ensinou ao assistente do WhatsApp (aba Assistente →
// "O que a <nome> aprendeu"). Regras PURAS da tela.
//
// A validação de instruções perigosas é a MESMA do servidor
// (supabase/functions/_shared/wa-agente-ferr-aprendizado.ts → validarAprendizado):
// o teste automacoesWaAprendizado.test.ts roda as duas sobre as mesmas frases e
// exige o mesmo resultado. Mudou lá → copie aqui.

export const CATEGORIAS_APRENDIZADO = ['estilo', 'conteudo', 'relatorio', 'outro'] as const
export type CategoriaAprendizado = typeof CATEGORIAS_APRENDIZADO[number]

export const ROTULO_CATEGORIA: Record<CategoriaAprendizado, string> = {
  estilo: 'Jeito de escrever',
  conteudo: 'Conteúdo',
  relatorio: 'Aviso diário',
  outro: 'Outro',
}

export const MIN_INSTRUCAO = 5
export const MAX_INSTRUCAO = 400
export const LIMITE_APRENDIZADOS_ATIVOS = 50

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

const PADROES_PERIGOSOS: readonly (readonly [RegExp, string])[] = [
  [/ignor|desconsider|deixe de seguir|pare de seguir|esquec\w* (as|suas|essas|todas|tudo)/, 'deixar de seguir as minhas regras'],
  [/\bregra/, 'as minhas regras'],
  [/seguranc/, 'segurança'],
  [/permiss|\bacesso|\blibera|\badmin|carteira (de|da) (todos|toda|outr)|outra empresa|\btenant/, 'permissões e acesso'],
  [/privad|confidenc|sigil|secret/, 'privacidade'],
  [/cliente.{0,60}(mand|envi|dispar|encaminh)|(mand|envi|dispar|encaminh)\w*.{0,40}\b(para|pra|pro|pros|aos?|as?) (o |os |a |as )?client/, 'enviar algo para clientes'],
  [/(mand|envi|dispar|encaminh|repass)\w*.{0,60}(grupo|numero|contato|pessoa|telefone|whatsapp|e-?mail)/, 'para onde as mensagens vão'],
  [/telefone|celular|whatsapp d[aoe]|numero d[aoe]|\bcpf|\bcnpj|e-?mail|document|endereco/, 'dados pessoais'],
  [/senha|token|\bchave|\bapi\b|credencia/, 'senhas e chaves'],
  [/prompt|sistema|instruc\w* (interna|secreta|original|do sistema)|\bcodigo\b|canario/, 'as minhas instruções internas'],
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

export type ResultadoValidacao =
  | { ok: true; instrucao: string; categoria: CategoriaAprendizado }
  | { ok: false; erro: string }

/** Mesma regra do servidor (tamanho + padrões perigosos). */
export function validarAprendizado(instrucaoBruta: unknown, categoriaBruta: unknown): ResultadoValidacao {
  const instrucao = limparInstrucao(instrucaoBruta)
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

/** Rótulo da categoria (desconhecida → "Outro"). */
export function rotuloCategoria(c: string | null | undefined): string {
  return ROTULO_CATEGORIA[(c ?? 'outro') as CategoriaAprendizado] ?? ROTULO_CATEGORIA.outro
}
