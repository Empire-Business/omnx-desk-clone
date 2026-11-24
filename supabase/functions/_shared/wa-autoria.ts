// Autoria das mensagens do WhatsApp: quem escreveu — cliente, equipe ou IA.
//
// Módulo PURO (sem banco, sem Deno): roda no uazapi-webhook e no Vitest.
// Plano "satisfação e histórico", fase F2. O banco tem o espelho das regras de
// nome/telefone em supabase/migrations/20261027120000_chat_autoria.sql
// (private.autoria_chave_nome / autoria_chave_tel / autoria_chave_tel8 e o
// backfill). Mudou aqui → mude lá (e vice-versa).
//
// Por que existe: nos grupos dos clientes a equipe escreve do celular PESSOAL —
// não é "fromMe" da instância. Sem isto, tudo no grupo vira "Cliente".
//
// Como decide (resolverAutor), nesta ordem:
//   1. fromMe (o próprio número da instância, celular/WhatsApp Web) ⇒ equipe.
//   2. Telefone (sender_pn no grupo; o próprio chat no privado) ou LID do
//      remetente em equipe_identidades ⇒ equipe.
//   3. Só em GRUPO e com telefone do remetente que não é de cliente: nome igual
//      ao de alguém da equipe (casarNomeEquipe) ⇒ equipe, origem
//      'heuristica_nome' (no banco, essa origem não acende nem apaga o
//      "aguardando resposta").
//   Passos 2 e 3 só valem com webhook autenticado por token (confiavel).
//   4. Resto ⇒ cliente; grupo sem telefone, LID nem nome ⇒ desconhecido.
// Mensagens da IA/assistente não passam por aqui: quem grava (wa-agente-responder,
// ia-bot via uazapi-send-message) marca enviado_por_ia e o banco põe 'ia'.

import { chaveTelefone } from './telefone.ts'
import { chaveTelefoneBR, jidParaNumero, jidServidor, jidUsuario } from './wa-telefone.ts'

export type AutorTipo = 'cliente' | 'equipe' | 'ia' | 'sistema' | 'desconhecido'
export type AutorOrigem = 'webhook' | 'plataforma' | 'backfill' | 'heuristica_backfill' | 'heuristica_nome'

export interface Autor {
  tipo: AutorTipo
  user_id: string | null
  /** Telefone canônico (chaveTelefoneBR) ou "lid:<n>"; ≤ 40. */
  chave: string | null
  /** Nome de exibição do WhatsApp (≤ 80). */
  nome: string | null
  origem: AutorOrigem
}

/** Linha ativa de equipe_identidades. user_id null = número da empresa (instância). */
export interface IdentidadeEquipe {
  user_id: string | null
  telefone_norm: string | null
  lid: string | null
}

/** Pessoa da equipe (users com perfil ≠ cliente). */
export interface PessoaEquipe {
  user_id: string
  nome: string | null
  /** Só pessoas ativas podem casar; as inativas contam para "primeiro nome único". */
  ativo: boolean
}

/** Nome "de fora" (cliente ou contato privado do Chat) — trava o casamento por primeiro nome. */
export interface NomeExterno {
  /** Primeiro nome já em chaveNome(). */
  primeiro: string
  /** chaveTelefone (DDD + 8) do contato; null = cliente (bloqueia sempre). */
  chaveTel: string | null
}

export interface ContextoNomes {
  equipe: readonly PessoaEquipe[]
  /** null = ainda não carregado: casamento FRACO (só primeiro nome) não acontece. */
  externos: readonly NomeExterno[] | null
  /** chaveTelefone (DDD + 8) de clientes: esses telefones nunca viram equipe por nome. */
  telefonesClientes: ReadonlySet<string> | null
}

export const MAX_NOME_AUTOR = 80
export const MAX_CHAVE_AUTOR = 40

// ---------------------------------------------------------------------------
// Normalização
// ---------------------------------------------------------------------------

/**
 * Nome comparável: sem acento, minúsculas, só [a-z0-9 ], espaços únicos, ≤ 80.
 * Igual a private.autoria_chave_nome (lower(unaccent(x)) + regexp_replace).
 */
export function chaveNome(bruto: string | null | undefined): string {
  return String(bruto ?? '')
    .slice(0, 400)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NOME_AUTOR)
    .trim()
}

/** Nome de exibição para gravar: sem caracteres de controle, espaços únicos, ≤ 80. Vazio ⇒ null. */
export function limparNomeAutor(bruto: unknown): string | null {
  if (typeof bruto !== 'string') return null
  const s = bruto
    .slice(0, 400)
    // eslint-disable-next-line no-control-regex -- tirar caracteres de controle é o objetivo
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NOME_AUTOR)
    .trim()
  return s || null
}

function primeiroEUltimo(chave: string): string {
  const t = chave.split(' ')
  return t.length >= 2 ? `${t[0]} ${t[t.length - 1]}` : chave
}

function palavras(chave: string): number {
  return chave ? chave.split(' ').length : 0
}

// ---------------------------------------------------------------------------
// Casamento por nome (heurística)
// ---------------------------------------------------------------------------

/**
 * Nome do remetente × nomes da equipe. Devolve o user_id ou null.
 *   FORTE (nome com 2+ palavras): igual ao nome completo de UMA pessoa ativa, ou
 *     1º+último nome igual ao 1º+último de UMA pessoa ativa (cadastro com 2+ palavras).
 *   FRACO (1 palavra): só se esse primeiro nome for de UMA ÚNICA pessoa da equipe
 *     (ativas e inativas) E não for primeiro nome de nenhum cliente nem de contato
 *     privado com OUTRO telefone. Sem a lista de externos carregada ⇒ não casa.
 *   TRAVA: sem telefone do remetente (só LID), sem a lista de telefones de
 *     cliente carregada, ou telefone de cliente ⇒ nunca casa (auditoria F4:
 *     nome de perfil é fácil de imitar; exige ao menos um telefone que não seja
 *     de cliente).
 *   Mais de uma pessoa casando ⇒ null (na dúvida, cliente).
 */
export function casarNomeEquipe(
  nomeBruto: string | null | undefined,
  ctx: ContextoNomes,
  chaveTelRemetente: string | null = null,
): { user_id: string; forca: 'forte' | 'fraco' } | null {
  const k = chaveNome(nomeBruto)
  if (!k) return null
  if (!chaveTelRemetente || !ctx.telefonesClientes) return null
  if (ctx.telefonesClientes.has(chaveTelRemetente)) return null

  const pessoas = ctx.equipe
    .map((p) => ({ ...p, chave: chaveNome(p.nome) }))
    .filter((p) => p.chave)

  const n = palavras(k)
  if (n >= 2) {
    const pu = primeiroEUltimo(k)
    const ids = new Set(
      pessoas
        .filter((p) => p.ativo && palavras(p.chave) >= 2 && (p.chave === k || primeiroEUltimo(p.chave) === pu))
        .map((p) => p.user_id),
    )
    return ids.size === 1 ? { user_id: [...ids][0], forca: 'forte' } : null
  }

  // Uma palavra só: primeiro nome.
  if (!ctx.externos) return null
  const donos = new Set(pessoas.filter((p) => p.chave.split(' ')[0] === k).map((p) => p.user_id))
  if (donos.size !== 1) return null
  const userId = [...donos][0]
  if (!pessoas.some((p) => p.user_id === userId && p.ativo)) return null
  const bloqueado = ctx.externos.some((x) => x.primeiro === k && (x.chaveTel === null || x.chaveTel !== chaveTelRemetente))
  return bloqueado ? null : { user_id: userId, forca: 'fraco' }
}

/**
 * Vale a pena carregar clientes/contatos (externos)? Só quando o nome PODE casar
 * com alguém da equipe (nome completo / 1º+último de uma pessoa ativa, ou uma
 * palavra que é primeiro nome de alguém) — sem eles não há como decidir com
 * segurança. Evita ler a base de clientes a cada mensagem de grupo.
 */
export function precisaDeExternos(nomeBruto: string | null | undefined, equipe: readonly PessoaEquipe[]): boolean {
  const k = chaveNome(nomeBruto)
  if (!k) return false
  const pessoas = equipe.map((p) => ({ ...p, chave: chaveNome(p.nome) })).filter((p) => p.chave)
  if (palavras(k) === 1) return pessoas.some((p) => p.chave.split(' ')[0] === k)
  const pu = primeiroEUltimo(k)
  return pessoas.some((p) => p.ativo && palavras(p.chave) >= 2 && (p.chave === k || primeiroEUltimo(p.chave) === pu))
}

// ---------------------------------------------------------------------------
// Remetente do payload da UAZAPI
// ---------------------------------------------------------------------------

export interface EntradaAutor {
  ehGrupo: boolean
  /** msg.fromMe === true (próprio número da instância). */
  fromMe: boolean
  /** Dígitos do chat (privado). */
  numeroChat: string | null
  /** msg.sender_pn ("<tel>@s.whatsapp.net") — remetente no grupo. */
  senderPn?: unknown
  /** msg.sender_lid ("<n>@lid") ou msg.sender. */
  senderLid?: unknown
  /** msg.senderName (nome de perfil do WhatsApp). */
  senderName?: unknown
  /** body.owner — telefone da instância. */
  owner?: unknown
}

export interface Remetente {
  /** chaveTelefoneBR do remetente, ou null. */
  telefone: string | null
  /** Dígitos do LID, ou null. */
  lid: string | null
  nome: string | null
}

function texto(v: unknown, max = 100): string | null {
  return typeof v === 'string' && v.trim() && v.length <= max ? v.trim() : null
}

/** Telefone, LID e nome de quem mandou (tolerante a campos ausentes/tipos errados). */
export function extrairRemetente(e: EntradaAutor): Remetente {
  const nome = limparNomeAutor(e.senderName)
  if (e.fromMe) {
    const own = texto(e.owner, 40)
    const tel = own ? jidParaNumero(own) : null
    return { telefone: tel ? chaveTelefoneBR(tel) : null, lid: null, nome }
  }
  const lidBruto = texto(e.senderLid)
  const lidUsuario = lidBruto && jidServidor(lidBruto) === 'lid' ? jidUsuario(lidBruto) : ''
  const lid = /^[0-9]{5,30}$/.test(lidUsuario) ? lidUsuario : null
  let tel: string | null = null
  if (e.ehGrupo) {
    tel = jidParaNumero(texto(e.senderPn))
  } else {
    const n = String(e.numeroChat ?? '').replace(/\D/g, '')
    tel = /^[0-9]{8,15}$/.test(n) ? n : null
  }
  const telefone = tel ? chaveTelefoneBR(tel) : null
  return { telefone: telefone && telefone.length >= 10 && telefone.length <= 15 ? telefone : null, lid, nome }
}

/** Chave gravada em autor_chave: telefone, senão "lid:<n>". */
export function chaveAutor(r: Remetente): string | null {
  const c = r.telefone ?? (r.lid ? `lid:${r.lid}` : null)
  return c ? c.slice(0, MAX_CHAVE_AUTOR) : null
}

/** Identidade da equipe por telefone (preferido) ou LID. 2+ pessoas ⇒ user_id null. */
export function acharIdentidade(
  r: Pick<Remetente, 'telefone' | 'lid'>, identidades: readonly IdentidadeEquipe[],
): { achou: boolean; user_id: string | null } {
  const achadas = identidades.filter((i) =>
    (r.telefone && i.telefone_norm && chaveTelefoneBR(i.telefone_norm) === r.telefone)
    || (r.lid && i.lid && i.lid === r.lid))
  if (achadas.length === 0) return { achou: false, user_id: null }
  const pessoas = new Set(achadas.map((i) => i.user_id).filter((u): u is string => !!u))
  return { achou: true, user_id: pessoas.size === 1 ? [...pessoas][0] : null }
}

/**
 * Quem escreveu. `nomes` é opcional: sem ele (ou fora de grupo) não há
 * heurística por nome.
 *
 * `confiavel` = o webhook veio com o token válido da instância. Sem ele
 * (auditoria F3), qualquer um poderia forjar sender_pn/nome de alguém da equipe
 * e apagar o "aguardando resposta": só fromMe conta como equipe; o resto é
 * cliente (ou desconhecido). Padrão: false (falha fechada).
 */
export function resolverAutor(
  e: EntradaAutor,
  identidades: readonly IdentidadeEquipe[],
  nomes: ContextoNomes | null = null,
  confiavel = false,
): Autor {
  const r = extrairRemetente(e)
  const chave = chaveAutor(r)
  if (e.fromMe) {
    return { tipo: 'equipe', user_id: null, chave, nome: r.nome, origem: 'webhook' }
  }
  const desconhecido = e.ehGrupo && !chave && !r.nome
  const naoEquipe: Autor = { tipo: desconhecido ? 'desconhecido' : 'cliente', user_id: null, chave, nome: r.nome, origem: 'webhook' }
  if (!confiavel) return naoEquipe
  const id = acharIdentidade(r, identidades)
  if (id.achou) {
    return { tipo: 'equipe', user_id: id.user_id, chave, nome: r.nome, origem: 'webhook' }
  }
  // Heurística por nome: só em grupo e só com telefone (sender_pn) — LID sozinho não basta.
  if (e.ehGrupo && r.nome && r.telefone && nomes) {
    const tel8 = chaveTelefone(r.telefone) || null
    const m = casarNomeEquipe(r.nome, nomes, tel8)
    if (m) return { tipo: 'equipe', user_id: m.user_id, chave, nome: r.nome, origem: 'heuristica_nome' }
  }
  return naoEquipe
}

/**
 * LID para aprender: grupo, chegou telefone E LID, o telefone é de uma
 * identidade da equipe e o LID ainda não está gravado nela. Devolve o par ou null.
 */
export function lidParaAprender(
  e: EntradaAutor, identidades: readonly IdentidadeEquipe[],
): { telefone_norm: string; lid: string } | null {
  if (!e.ehGrupo || e.fromMe) return null
  const r = extrairRemetente(e)
  if (!r.telefone || !r.lid) return null
  const doTelefone = identidades.filter((i) => i.telefone_norm && chaveTelefoneBR(i.telefone_norm) === r.telefone)
  if (doTelefone.length === 0) return null
  if (doTelefone.every((i) => i.lid === r.lid)) return null
  // O mesmo LID já pertence a OUTRO telefone? Não sobrescreve (falha fechada).
  if (identidades.some((i) => i.lid === r.lid && i.telefone_norm && chaveTelefoneBR(i.telefone_norm) !== r.telefone)) return null
  return { telefone_norm: r.telefone, lid: r.lid }
}

// ---------------------------------------------------------------------------
// Leitura (transcrições para IA, telas)
// ---------------------------------------------------------------------------

export interface MensagemComAutor {
  autor_tipo?: string | null
  autor_nome?: string | null
  enviado_por_agente?: boolean | null
  enviado_por_ia?: boolean | null
}

/** Da equipe (pessoa ou IA)? Usa autor_tipo; sem ele, as flags antigas. */
export function ehDaEquipe(m: MensagemComAutor): boolean {
  if (m.autor_tipo === 'equipe' || m.autor_tipo === 'ia') return true
  if (m.autor_tipo === 'cliente' || m.autor_tipo === 'desconhecido' || m.autor_tipo === 'sistema') return false
  return m.enviado_por_agente === true || m.enviado_por_ia === true
}

/**
 * Rótulo para transcrição: "Equipe (Ana)", "Equipe (assistente)", "Equipe" ou
 * "Cliente". Só o PRIMEIRO nome, só letras/números (o nome vem do perfil do
 * WhatsApp — dado não confiável, não pode virar instrução nem fechar bloco).
 */
export function rotuloAutor(m: MensagemComAutor): string {
  if (m.autor_tipo === 'ia' || (!m.autor_tipo && m.enviado_por_ia === true)) return 'Equipe (assistente)'
  if (!ehDaEquipe(m)) return 'Cliente'
  const primeiro = String(m.autor_nome ?? '')
    .normalize('NFC')
    .split(/\s+/)[0]
    ?.replace(/[^\p{L}\p{N}]/gu, '')
    .slice(0, 20)
  return primeiro ? `Equipe (${primeiro})` : 'Equipe'
}

/** Tira o prefixo "[Nome] " que o webhook põe no texto das mensagens de grupo. */
export function semPrefixoAutor(conteudo: string | null | undefined): string {
  const s = String(conteudo ?? '')
  const m = /^\[([^\]\n]{1,80})\] ([\s\S]*)$/.exec(s)
  return m ? m[2] : s
}
