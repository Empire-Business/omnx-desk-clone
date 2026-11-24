// Proposta de responsáveis operacionais. Identidade, alvos, revisão e execução
// vêm do servidor; o modelo fornece somente os nomes escritos no pedido atual.
import type { ContextoFerramentas } from './wa-agente-ferramentas.ts'
import { podeVerCliente, type EscopoAgente } from './wa-agente-escopo.ts'
import { chaveNome } from './wa-alertas.ts'
import { origemAtual, autorizadoAgora, prepararOfertaAcoesCadastro, registros } from './wa-agente-ferr-acoes-cadastro.ts'
import { formatarPreviaAcaoChat, prepararSimulacaoAcaoChat, validarAcaoChat, type PreviaAcaoChat } from './wa-agente-acoes-core.ts'

type Linha = Record<string, unknown>
export interface PedidoAtribuicao { cliente: string; estrategista: string }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const objeto = (v: unknown): Linha | null => v && typeof v === 'object' && !Array.isArray(v) ? v as Linha : null
const normalizar = (s: string) => chaveNome(s).replace(/\s+/g, ' ').trim()
const nome = (s: unknown): s is string => typeof s === 'string' && s.trim() === s && s.length >= 2 && s.length <= 160
  && !UUID.test(s) && !/[\r\n<>"“”«»`|;\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/.test(s)
const ORIENTACAO = 'Envie uma mensagem direta: Íris, trocar estrategistas: seguida de uma linha por cliente, no formato Nome completo do cliente | Nome do estrategista. A lista inteira precisa estar no pedido; nenhuma atribuição é feita antes da prévia e confirmação.'

/** Candidatos não concedem identidade: precisam cobrir exatamente a lista da
 * cláusula, sem sobra e com uma única segmentação; depois são resolvidos no banco.
 * Isso preserva o "e" que faz parte de um nome, sem inventar um delimitador. */
function separarNomesAtuais(lista: string, candidatos: readonly string[]): string[] | null {
  const nomes = [...new Set(candidatos.map(normalizar))]
  const solucoes: string[][] = []
  const visitar = (resto: string, usados: string[]) => {
    if (solucoes.length > 1 || usados.length > 10) return
    if (!resto) { solucoes.push(usados); return }
    for (const n of nomes) {
      if (usados.includes(n) || !resto.startsWith(n)) continue
      const fim = resto.slice(n.length)
      if (!fim) visitar('', [...usados, n])
      else {
        const separador = /^(?:,\s*(?:e\s+)?|\s+e\s+)/.exec(fim)
        if (separador && fim.slice(separador[0].length)) visitar(fim.slice(separador[0].length), [...usados, n])
      }
    }
  }
  visitar(lista.trim(), [])
  return solucoes.length === 1 ? solucoes[0] : null
}

/** Lê somente o corpo atual. Conteúdo citado, condição e futuro não são pedidos. */
export function lerPedidosAtribuicoes(texto: unknown, agente = 'Íris', candidatos?: readonly string[]): PedidoAtribuicao[] | null {
  if (typeof texto !== 'string' || texto.length > 8000 || /[<>`]|(^|\n)\s*>/.test(texto)) return null
  let s = texto.trim().replace(/^@(?:\d{5,30}|[ÍI]ris)\b[ \t]*(?:\r?\n)?\s*/i, '')
  for (const prefixo of [agente, 'Íris']) {
    if (normalizar(s).startsWith(`${normalizar(prefixo)}, `)) { s = s.slice(prefixo.length + 1).trim(); break }
  }
  // Um enquadramento de relato/hipótese pode se estender à próxima frase.
  // Trechos entre aspas nunca fornecem nomes ou comandos.
  if (/\b(exemplo|hipotese|suponha|simule|simulacao|transcricao|historico|disse|disseram|falou|relatou|afirmou|pediu|mandou|citou|citacao|segundo|finja)\b/.test(normalizar(s))) return null
  if (/(?:^|[.!?;\n])\s*(?:se|quando|caso|nao (?:faca|execute)|nunca|jamais)\b/.test(normalizar(s))) return null
  s = s.replace(/"[^"\n]*"|“[^”\n]*”|‘[^’\n]*’|'[^'\n]*'/g, ' [conteudo citado] ')
  const out: PedidoAtribuicao[] = []
  const norm = normalizar(s)
  if (norm.startsWith('trocar estrategistas:')) {
    for (const linha of s.slice(s.indexOf(':') + 1).split(/\r?\n|;/).map(l => l.trim()).filter(Boolean)) {
      const partes = linha.split('|').map(p => p.trim())
      if (partes.length !== 2 || !nome(partes[0]) || !nome(partes[1])) return null
      out.push({ cliente: partes[0], estrategista: partes[1] })
    }
  } else {
    for (const trecho of s.match(/[^.!?;\r\n]+[.!?;]?/g) ?? []) {
      if (trecho.trim().endsWith('?') || trecho.includes('[conteudo citado]')) continue
      let linha = normalizar(trecho.replace(/[.!;]$/, '').trim())
      // Observação de cadastro/onboarding não vira nome do responsável.
      linha = linha.replace(/\s*\(esse estrategista ainda nao foi registrado\)$/, '')
      const direta = /^(?:atribua|passe|transfira) o cliente (.+) (?:ao|para o) estrategista (.+)$/.exec(linha)
      const declarada = /^(.+?) est(?:a|ao) com (?:o estrategista|a estrategista) (.+)$/.exec(linha)
      const match = direta ?? declarada
      if (!match) continue
      if (/\b(nao|nunca|nem|jamais|talvez|se|quando|caso|poderia|seria|deveria)\b/.test(linha)) continue
      const clientes = direta ? [match[1]] : candidatos ? separarNomesAtuais(match[1], candidatos) : match[1].split(/,|\s+e\s+/)
      if (!clientes) return null
      for (const bruto of clientes) {
        const cliente = bruto.trim()
        if (!nome(cliente) || !nome(match[2]) || /[():]/.test(cliente + match[2])) return null
        out.push({ cliente, estrategista: match[2] })
      }
    }
  }
  if (out.length < 1 || out.length > 10 || new Set(out.map(a => normalizar(a.cliente))).size !== out.length) return null
  return out
}

function argumentos(v: unknown): PedidoAtribuicao[] | null {
  if (typeof v === 'string') { try { v = JSON.parse(v) } catch { return null } }
  const a = objeto(v)
  if (!a || Object.keys(a).join(',') !== 'atribuicoes' || !Array.isArray(a.atribuicoes)
    || a.atribuicoes.length < 1 || a.atribuicoes.length > 10) return null
  const out: PedidoAtribuicao[] = []
  for (const item of a.atribuicoes) {
    const p = objeto(item)
    if (!p || Object.keys(p).sort().join(',') !== 'cliente,estrategista' || !nome(p.cliente) || !nome(p.estrategista)) return null
    out.push({ cliente: p.cliente, estrategista: p.estrategista })
  }
  return new Set(out.map(p => normalizar(p.cliente))).size === out.length ? out : null
}

export async function atribuicoesDisponiveis(ctx: ContextoFerramentas): Promise<boolean> {
  if (!await prepararOfertaAcoesCadastro(ctx)) return false
  try {
    const r = await ctx.admin.rpc('wa_agente_acoes_capacidades')
    return !r.error && objeto(r.data)?.cliente_estrategista === true
  } catch { return false }
}

export function ferramentasAtribuicoes(e: EscopoAgente, autorizada = false) {
  if (!autorizada || e.politica === 'carteira_gt3' || e.modo !== 'normal' || !e.userId || !e.permissoes.automacoes) return []
  return [{ type: 'function' as const, function: {
    name: 'propor_atribuicoes_estrategistas',
    description: 'Prepara a lista completa e explícita de responsáveis operacionais do pedido atual (até 10 clientes). Use nomes escritos pela pessoa. O servidor identifica clientes, responsáveis e revisão, gera prévia persistida e código para confirmação no mesmo chat. Não altera estrategista do contrato, pagamentos ou comissões. Confere a lista inteira e apresenta explicitamente itens já corretos e pendentes fora da prévia; nunca escolhe entre nomes/vínculos ambíguos. Destinatário futuro/em onboarding sem cadastro não pode ser atribuído. Nunca confirma pela IA.',
    parameters: { type: 'object', additionalProperties: false, properties: { atribuicoes: {
      type: 'array', minItems: 1, maxItems: 10, items: { type: 'object', additionalProperties: false,
        properties: { cliente: { type: 'string', minLength: 2, maxLength: 160 }, estrategista: { type: 'string', minLength: 2, maxLength: 160 } }, required: ['cliente', 'estrategista'] },
    } }, required: ['atribuicoes'] },
  } }]
}

export async function executarAtribuicoes(ferramenta: string, bruto: unknown, ctx: ContextoFerramentas,
  agora = () => new Date()): Promise<Linha | null> {
  if (ferramenta !== 'propor_atribuicoes_estrategistas') return null
  if (ctx.escopo.politica === 'carteira_gt3' || ctx.escopo.modo !== 'normal' || ctx.canal !== 'grupo' || !ctx.escopo.userId) {
    return { erro: 'Atribuições exigem pessoa da equipe identificada e autorizada neste grupo. O administrador precisa conferir o vínculo do WhatsApp antes de um novo pedido.' }
  }
  const args = argumentos(bruto)
  if (!args) return { erro: ORIENTACAO }
  try {
    const origem = await origemAtual(ctx)
    const pedidos = origem && lerPedidosAtribuicoes(origem.texto, ctx.nomeAgente, args.map(a => a.cliente))
    if (!origem || !pedidos || pedidos.length !== args.length || pedidos.some(p => !args.some(a =>
      normalizar(a.cliente) === normalizar(p.cliente) && normalizar(a.estrategista) === normalizar(p.estrategista)))) return { erro: ORIENTACAO }
    const carteira = await autorizadoAgora(ctx, origem)
    if (!carteira || !await atribuicoesDisponiveis(ctx)) return { erro: 'A atualização ou a autorização de atribuições ainda não está disponível neste pedido. Nada foi alterado.' }
    const perm = await ctx.admin.rpc('has_permissao_de', { p_user_id: ctx.escopo.userId, p_recurso: 'clientes.atribuir', p_acao: 'editar' })
    if (perm.error || perm.data !== true) return { erro: 'Falta permissão atual para atribuir responsáveis. Nada foi alterado.' }
    const [clientes, pessoas, vinculos] = await Promise.all([
      registros(ctx, 'clients', 'id,nome,ativo'), registros(ctx, 'users', 'id,nome,ativo,perfil'),
      registros(ctx, 'client_assignments', 'id,client_id,user_id,tipo,ativo'),
    ])
    const pendentes: string[] = []
    const corretos: string[] = []
    const resolvidos = args.flatMap(a => {
      const pendente = (motivo: string) => { pendentes.push(`${a.cliente} → ${a.estrategista}: ${motivo}`); return [] }
      const cs = clientes.filter(c => normalizar(String(c.nome)) === normalizar(a.cliente)
        && podeVerCliente(ctx.escopo, String(c.id)) && (carteira.total || carteira.clientIds.has(String(c.id))))
      if (cs.length !== 1 || cs[0].ativo !== true) return pendente('cliente ausente, inativo ou ambíguo; informe o cadastro correto.')
      const elegiveis = pessoas.filter(u => u.ativo === true && u.perfil !== 'cliente'
        && (['admin', 'gerente', 'estrategista'].includes(String(u.perfil)) || vinculos.some(v => v.user_id === u.id && v.tipo === 'estrategista' && v.ativo === true)))
      const exatos = elegiveis.filter(u => normalizar(String(u.nome)) === normalizar(a.estrategista))
      const us = exatos.length ? exatos : elegiveis.filter(u => normalizar(String(u.nome)).startsWith(`${normalizar(a.estrategista)} `))
      if (us.length !== 1) return pendente('responsável ausente, inelegível ou ambíguo; confira o nome completo e o cadastro.')
      const atuais = vinculos.filter(v => v.client_id === cs[0].id && v.tipo === 'estrategista' && v.ativo === true)
      if (atuais.length > 1) return pendente('há mais de um estrategista operacional; indique o vínculo correto antes da troca.')
      if (atuais[0]?.user_id === us[0].id) { corretos.push(`${a.cliente}: já está com ${String(us[0].nome)}.`); return [] }
      return [{ c: cs[0], u: us[0], atual: atuais[0] ?? null }]
    }).sort((a, b) => String(a.c.id).localeCompare(String(b.c.id)))
    const cobertura = [corretos.length ? `Já corretos (sem alteração):\n${corretos.map(x => `• ${x}`).join('\n')}` : '',
      pendentes.length ? `Pendentes (fora da proposta):\n${pendentes.map(x => `• ${x}`).join('\n')}` : ''].filter(Boolean).join('\n\n')
    if (!resolvidos.length) {
      if (pendentes.length) return { erro: `${cobertura}\n\nNenhuma alteração foi proposta.` }
      return { ok: true, texto_deterministico: `${cobertura}\n\nNenhuma alteração necessária.`, sem_alteracao: true }
    }
    const complementar = (texto: string) => cobertura ? `${cobertura}\n\nA confirmação abaixo aplica somente os ${resolvidos.length} itens da prévia.\n\n${texto}` : texto
    const rs = await ctx.admin.from('client_assignment_state').select('client_id,revisao').eq('tenant_id', ctx.escopo.tenantId)
      .in('client_id', resolvidos.map(r => r.c.id)).limit(11)
    if (rs.error || !Array.isArray(rs.data) || rs.data.length > resolvidos.length) throw new Error('Não consegui conferir a revisão dos responsáveis. Nada foi proposto.')
    const revisoes = new Map<string, number>()
    for (const r of rs.data) {
      if (revisoes.has(r.client_id) || !Number.isSafeInteger(r.revisao) || r.revisao < 0) throw new Error('Revisão inválida. Nada foi proposto.')
      revisoes.set(r.client_id, r.revisao)
    }
    const acao = validarAcaoChat({ acao: 'cliente_estrategista', alvo: resolvidos[0].c.id, novo: { itens: resolvidos.map(r => ({
      cliente_id: r.c.id, user_id: r.u.id, assignment_id: r.atual?.id ?? null, expected_revision: revisoes.get(String(r.c.id)) ?? 0,
    })) } })
    if (!acao) throw new Error('Proposta inválida. Nada foi alterado.')
    const previa: PreviaAcaoChat = { acao: 'cliente_estrategista', alvo_nome: 'Responsáveis operacionais',
      antes: { itens: resolvidos.map(r => ({ cliente_id: String(r.c.id), cliente_nome: String(r.c.nome), assignment_id: r.atual ? String(r.atual.id) : null,
        estrategista_id: r.atual ? String(r.atual.user_id) : null, estrategista_nome: r.atual ? String(pessoas.find(u => u.id === r.atual.user_id)?.nome ?? 'Responsável atual') : null,
        revisao: revisoes.get(String(r.c.id)) ?? 0 })) },
      depois: { itens: resolvidos.map(r => ({ cliente_id: String(r.c.id), cliente_nome: String(r.c.nome), user_id: String(r.u.id), estrategista_nome: String(r.u.nome) })) } }
    if (ctx.simulacao) return { ok: true, simulacao: true, texto_deterministico: complementar(prepararSimulacaoAcaoChat(previa)) }
    if (!await autorizadoAgora(ctx, origem)) return { erro: 'A autorização mudou. Nada foi proposto.' }
    const r = await ctx.admin.rpc('wa_agente_acoes_propor', { p_pedido: ctx.pedidoId, p_acao: acao.acao, p_alvo: acao.alvo, p_novo: acao.novo })
    const data = objeto(r.data), persistida = objeto(data?.previa)
    if (r.error || data?.ok !== true || !UUID.test(String(data.proposta_id)) || persistida?.acao !== 'cliente_estrategista') {
      return { erro: 'Não consegui confirmar a criação da proposta. Confira o resultado antes de repetir.' }
    }
    return { ok: true, codigo_confirmacao: data.codigo, texto_deterministico: complementar(formatarPreviaAcaoChat({ ...persistida, codigo: data.codigo, expira_em: data.expira_em } as unknown as PreviaAcaoChat & { codigo: string; expira_em: string }, agora())) }
  } catch (e) {
    return { erro: e instanceof Error && /^(Cliente |Responsável |Há mais de |Não consegui conferir |Revisão |Proposta )/.test(e.message)
      ? e.message : 'Não consegui preparar uma lista completa, inequívoca e autorizada de responsáveis. Nada foi confirmado.' }
  }
}
