// Exclusões explícitas dos alertas. Reutiliza todos/sempre do painel;
// não altera clients, contratos, responsáveis ou preferências aprendidas.
import type { ContextoFerramentas } from './wa-agente-ferramentas.ts'
import { podeVerCliente, type EscopoAgente } from './wa-agente-escopo.ts'
import { chaveNome } from './wa-alertas.ts'
import { nomeSeguro } from './wa-relatorio.ts'
import { origemAtual, autorizadoAgora, registros } from './wa-agente-ferr-acoes-cadastro.ts'

type Acao = 'excluir' | 'reincluir' | 'consultar'
type Linha = Record<string, unknown>
type Saida = Record<string, unknown>
const FERRAMENTA = 'gerenciar_exclusoes_relatorio'
const LIMITE = 20
const IDENTIDADE = 'Peça ao administrador para vincular seu número a um membro com permissão de administrar as Automações do WhatsApp.'
const DIRETO = 'Peça diretamente para excluir ou reincluir os clientes pelo nome; citações, hipóteses, histórico e pedidos de checagem não alteram o relatório.'
const normalizar = (v: string) => chaveNome(v).replace(/\s+/g, ' ').trim()
const nomeValido = (v: unknown): v is string => typeof v === 'string' && v.trim().length >= 2 && v.length <= 160
  && !/[<>"“”«»`\r\n\u0000-\u001f\u007f-\u009f]/.test(v)

export function ferramentasExclusoesRelatorio(e: EscopoAgente) {
  if (e.modo !== 'normal' || e.politica === 'carteira_gt3' || !e.userId || !e.permissoes.automacoes) return []
  return [{ type: 'function' as const, function: {
    name: FERRAMENTA,
    description: 'Exclui ou reinclui clientes explicitamente indicados na mensagem atual nos avisos e alertas ativos, sem mudar cadastro ou contrato; também consulta essas exclusões. Recebe até 20 nomes escritos pela pessoa e identifica cada cliente internamente. Excluir é permanente até reincluir. Use somente para pedido direto de exclusão/reinclusão, nunca para clientes que a pessoa quer checar, trocar responsável ou mencionou no histórico. Não consulte outras ferramentas antes de pedir a alteração. Exige membro identificado e administrador atual; acesso total do grupo sozinho não basta.',
    parameters: { type: 'object', additionalProperties: false, properties: {
      acao: { type: 'string', enum: ['excluir', 'reincluir', 'consultar'] },
      clientes: { type: 'array', minItems: 1, maxItems: LIMITE, items: { type: 'string', minLength: 2, maxLength: 160 } },
    }, required: ['acao', 'clientes'] },
  } }]
}

/** Só uma cláusula direta da mensagem atual pode nomear os alvos da escrita. */
export function nomesDiretosExclusao(mensagem: unknown, acao: Acao, agente = 'Íris'): string[] {
  if (typeof mensagem !== 'string' || mensagem.length > 8000 || /[<>"“”«»`]|(^|\n)\s*>/.test(mensagem)) return []
  const texto = mensagem.replace(/^\(áudio transcrito\)[ \t]+/, '').replace(/^\s*@(?:[0-9]{5,30}|[ÍI]ris)\b\s*/i, '')
  // Não perder o enquadramento de uma frase anterior ao separar as cláusulas.
  // A única forma negativa autorizada é a declaração explícita suportada abaixo.
  const semDeclaracaoInativos = normalizar(texto).replace(/nao faz sentido enviar relatorios? (?:da|do|de|das|dos) [^.!?]+\.\s*esses clientes estao inativos(?:\.|$)/g, '')
  const semDuvidas = semDeclaracaoInativos.replace(/(?:^|[.!?;\n])\s*(?:(?:iris|[^,.;?!\n]{1,60}),\s*)?nao entendi [^.!?;\n]*(?:[.!?;\n]|$)/g, ' ')
  if (/\b(nao|nunca|nem|jamais|evite|proibido|proibida)\b/.test(semDuvidas)) return []
  // Recusa enquadramentos de conteúdo citado, exemplo ou hipótese, inclusive
  // quando uma segunda frase parece imperativa fora do enquadramento.
  if (/\b(exemplo|hipotese|suponha|simule|simulacao|transcricao|historico|disse|disseram|falou|relatou|afirmou|pediu|mandou|citou|citacao|segundo|talvez|leia|interprete|repita|copie|finja)\b/.test(normalizar(texto))) return []
  const agenteNormal = normalizar(agente)
  const trechos = (texto.match(/[^.!?;\r\n]+[.!?]?/g) ?? []).filter(f => normalizar(f.replace(/[.!?]$/, '')))
  const frases = trechos.map((f) => normalizar(f.replace(/[.!?]$/, ''))).filter(Boolean)
  // Uma condição iniciando outra cláusula continua enquadrando a ordem seguinte.
  // O "se" interno de "preciso checar se..." não tem esse papel.
  if (frases.some((f) => /^(?:(?:iris|[^,]{1,60}),\s*)?(?:se|quando|caso)\b/.test(f))) return []
  const nomes: string[] = []
  for (let i = 0; i < frases.length; i++) {
    let frase = frases[i]
    const pergunta = trechos[i]?.trim().endsWith('?') === true
    if (frase.startsWith(`${agenteNormal}, `)) frase = frase.slice(agenteNormal.length + 2)
    if (frase.startsWith('iris, ')) frase = frase.slice(6)
    const cortesia = /^(?:pode|poderia) (?:excluir|retirar|remover|reincluir) /.test(frase)
    if (pergunta && !cortesia) continue
    frase = frase.replace(/^(?:pode|poderia) (excluir|retirar|remover|reincluir) /, (_, verbo: string) => ({ excluir: 'exclua', retirar: 'retire', remover: 'remova', reincluir: 'reinclua' })[verbo] + ' ')
      .replace(/^por favor,? /, '')
    let lista: string | undefined
    if (acao === 'excluir') {
      lista = /^(?:exclua|excluir|retire|remova|tire) (?:dos? (?:avisos? e (?:dos? )?alertas? ativos?|relatorios?|avisos?)|do relatorio):? (.+)$/.exec(frase)?.[1]
        ?? /^(?:exclua|retire|remova|tire) (.+) (?:do relatorio|dos relatorios|dos avisos e alertas ativos)$/.exec(frase)?.[1]
      const inativos = /^nao faz sentido enviar relatorios? (?:da|do|de|das|dos) (.+)$/.exec(frase)
      if (inativos && frases[i + 1] === 'esses clientes estao inativos') lista = inativos[1]
    } else if (acao === 'reincluir') {
      lista = /^(?:reinclua|reincluir|inclua novamente|volte a incluir|restaure) (?:no relatorio|nos relatorios|nos avisos e alertas ativos):? (.+)$/.exec(frase)?.[1]
        ?? /^(?:reinclua|inclua novamente|volte a incluir|restaure) (.+) (?:no relatorio|nos relatorios|nos avisos e alertas ativos)$/.exec(frase)?.[1]
    }
    if (!lista || /\b(nao|nem|se|quando|confira|checar|cheque|verifique|talvez|poderia|pode|mas|porem|porque|disse|seria|deveria)\b/.test(lista)) continue
    // A pergunta de outra cláusula não altera a intenção desta lista.
    for (const nome of lista.replace(/^(?:(?:os|as) clientes|clientes:|(?:o|a) cliente) /, '').split(/[,;]|\s+e\s+/)) {
      const limpo = nome.trim()
      if (nomeValido(limpo)) nomes.push(limpo)
    }
  }
  return [...new Set(nomes)]
}

function argumentos(bruto: unknown): { acao: Acao; clientes: string[] } | null {
  let v = bruto
  if (typeof v === 'string') { try { v = JSON.parse(v) } catch { return null } }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const a = v as Linha
  if (Object.keys(a).sort().join(',') !== 'acao,clientes' || !['excluir', 'reincluir', 'consultar'].includes(String(a.acao))
    || !Array.isArray(a.clientes) || a.clientes.length < 1 || a.clientes.length > LIMITE || !a.clientes.every(nomeValido)) return null
  return { acao: a.acao as Acao, clientes: [...new Map(a.clientes.map((n: string) => [normalizar(n), n.trim()])).values()] }
}

async function linha(ctx: ContextoFerramentas, tabela: string, filtros: Linha): Promise<Linha | null> {
  let q = ctx.admin.from(tabela).select('*').eq('tenant_id', ctx.escopo.tenantId)
  for (const [k, v] of Object.entries(filtros)) q = q.eq(k, v)
  const r = await q.maybeSingle()
  if (r.error) throw new Error('leitura')
  return r.data as Linha | null
}

/** Leitura atual em cada escrita; acesso_total não substitui membro/admin. */
async function autorizar(ctx: ContextoFerramentas, agora: Date): Promise<{ total: boolean; clientIds: Set<string>; pedido: Linha } | null> {
  if (!Number.isFinite(agora.getTime())) return null
  const atual = { ...ctx, agora }
  const origem = await origemAtual(atual)
  if (!origem) return null
  const carteira = await autorizadoAgora(atual, origem)
  return carteira ? { ...carteira, pedido: origem.pedido } : null
}

async function exclusoes(ctx: ContextoFerramentas, clientId: string): Promise<Linha[]> {
  const r = await ctx.admin.from('wa_auto_alertas_ignorados').select('id')
    .eq('tenant_id', ctx.escopo.tenantId).eq('client_id', clientId).eq('tipo', 'todos').eq('modo', 'sempre').limit(1001)
  if (r.error || !Array.isArray(r.data) || r.data.length > 1000) throw new Error('leitura')
  return r.data as Linha[]
}

async function idExclusao(ctx: ContextoFerramentas, cliente: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${ctx.escopo.tenantId}:${ctx.pedidoId}:${cliente}:excluir-relatorio`))
  const h = [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`
}

function motivo(ctx: ContextoFerramentas, p: Linha): string {
  const seguro = (v: unknown, max: number) => String(v ?? '').replace(/[^a-zA-Z0-9-]/g, '').slice(0, max)
  return `Exclusão explícita pelo WhatsApp; pedido=${seguro(ctx.pedidoId, 36)}; user=${seguro(ctx.escopo.userId, 36)}; telefone=${seguro(p.remetente_chave, 15)}`.slice(0, 200)
}

export async function executarExclusoesRelatorio(nome: string, bruto: unknown, ctx: ContextoFerramentas,
  { agora = () => new Date() }: { agora?: () => Date } = {}): Promise<Saida | null> {
  if (nome !== FERRAMENTA) return null
  const args = argumentos(bruto)
  if (!args) return { erro: 'Informe a ação e de 1 a 20 nomes de clientes, sem outros campos.' }
  if (!ctx.escopo.userId) return { erro: IDENTIDADE }
  const diretos = nomesDiretosExclusao(ctx.mensagemOriginal, args.acao, ctx.nomeAgente)
  ctx.cache ??= {}
  ctx.cache.exclusoesRelatorio ??= new Set<string>()
  const anteriores = ctx.cache.exclusoesRelatorio
  if (new Set([...anteriores, ...args.clientes.map(normalizar)]).size > LIMITE) return { erro: 'Posso tratar no máximo 20 clientes por pedido; envie os demais em outra mensagem.' }
  for (const n of args.clientes) anteriores.add(normalizar(n))
  const resultados: Saida[] = []
  try {
    const inicial = await autorizar(ctx, agora())
    if (!inicial) return { erro: IDENTIDADE }
    // A contagem exata impede tratar como única uma amostra truncada pela API.
    const clientes = await registros(ctx, 'clients', 'id,nome')
    for (const pedido of args.clientes) {
      const base = { cliente: nomeSeguro(pedido, 160), acao: args.acao }
      try {
        if (args.acao !== 'consultar' && !diretos.includes(normalizar(pedido))) { resultados.push({ ...base, erro: DIRETO }); continue }
        const achados = clientes.filter((c) => podeVerCliente(ctx.escopo, String(c.id)) && (inicial.total || inicial.clientIds.has(String(c.id)))
          && normalizar(String(c.nome ?? '')) === normalizar(pedido))
        if (achados.length !== 1) {
          resultados.push({ ...base, erro: achados.length ? 'Há mais de um cadastro com esse nome; peça ao administrador para identificar o cadastro correto.' : 'Não encontrei esse nome completo na carteira autorizada.' }); continue
        }
        const cliente = achados[0]
        const id = String(cliente.id)
        const atuais = await exclusoes(ctx, id)
        if (args.acao === 'consultar') { resultados.push({ ...base, ok: true, resultado: 'consultado', excluido: atuais.length > 0 }); continue }
        const atual = await autorizar(ctx, agora())
        if (!atual || !podeVerCliente(ctx.escopo, id) || (!atual.total && !atual.clientIds.has(id))) { resultados.push({ ...base, erro: 'A autorização mudou; esse cliente não foi alterado.' }); continue }
        const clienteAtual = await linha(ctx, 'clients', { id })
        if (!clienteAtual || normalizar(String(clienteAtual.nome ?? '')) !== normalizar(pedido)) { resultados.push({ ...base, erro: 'O cadastro mudou durante a consulta; envie um novo pedido.' }); continue }
        if (ctx.simulacao) { resultados.push({ ...base, ok: true, simulacao: true }); continue }
        const prazoValido = () => {
          const instante = agora().getTime()
          return Number.isFinite(instante) && Date.parse(String(atual.pedido.lock_ate)) > instante
        }
        if (args.acao === 'excluir') {
          if (atuais.length) { resultados.push({ ...base, ok: true, resultado: 'ja_excluido' }); continue }
          const registroId = await idExclusao(ctx, id)
          if (!prazoValido()) { resultados.push({ ...base, erro: 'O prazo do pedido terminou; envie novamente o ajuste.' }); continue }
          const gravacao = await ctx.admin.from('wa_auto_alertas_ignorados').insert({
            id: registroId, tenant_id: ctx.escopo.tenantId, client_id: id, contact_id: null,
            tipo: 'todos', modo: 'sempre', ate: null, motivo: motivo(ctx, atual.pedido),
          }).select('id').single()
          if (gravacao.error && gravacao.error.code !== '23505') throw new Error('escrita')
          if (!(await exclusoes(ctx, id)).length) throw new Error('escrita')
          resultados.push({ ...base, ok: true, resultado: gravacao.error ? 'ja_excluido' : 'excluido' })
        } else {
          if (!atuais.length) { resultados.push({ ...base, ok: true, resultado: 'ja_incluido' }); continue }
          if (!prazoValido()) { resultados.push({ ...base, erro: 'O prazo do pedido terminou; envie novamente o ajuste.' }); continue }
          const apagada = await ctx.admin.from('wa_auto_alertas_ignorados').delete()
            .eq('tenant_id', ctx.escopo.tenantId).eq('client_id', id).eq('tipo', 'todos').eq('modo', 'sempre').in('id', atuais.map((i) => i.id))
          if (apagada.error || (await exclusoes(ctx, id)).length) throw new Error('escrita')
          resultados.push({ ...base, ok: true, resultado: 'reincluido' })
        }
        ctx.cache.coleta = null
      } catch { resultados.push({ ...base, erro: 'Não consegui confirmar essa alteração; consulte a exclusão antes de repetir.' }) }
    }
    return { resultados }
  } catch { return { erro: 'Não consegui conferir as exclusões agora; nenhuma alteração foi confirmada.' } }
}

/** O modelo não cria, omite ou reescreve resultados de escrita. */
export function recibosExclusoesRelatorio(saidas: readonly Saida[]): string | null {
  const linhas: string[] = []
  for (const s of saidas) {
    if (typeof s.erro === 'string') { linhas.push(s.erro); continue }
    if (!Array.isArray(s.resultados)) { linhas.push('Não consegui confirmar o resultado das exclusões.'); continue }
    for (const r of s.resultados as Saida[]) {
      const cliente = nomeSeguro(String(r.cliente ?? ''), 160) ?? 'Cliente informado'
      const inicio = `${cliente}: `
      if (typeof r.erro === 'string') linhas.push(inicio + r.erro)
      else if (r.ok !== true) linhas.push(inicio + 'resultado não confirmado.')
      else if (r.simulacao === true) linhas.push(inicio + `simulação de ${r.acao === 'excluir' ? 'exclusão' : 'reinclusão'}; nada foi alterado.`)
      else if (r.resultado === 'consultado') linhas.push(inicio + (r.excluido ? 'há exclusão permanente dos avisos e alertas ativos.' : 'não há exclusão permanente geral; os demais filtros continuam valendo.'))
      else if (r.resultado === 'excluido' || r.resultado === 'ja_excluido') linhas.push(inicio + (r.resultado === 'ja_excluido' ? 'já estava excluído' : 'excluído') + ' dos avisos e alertas ativos. Cadastro e contratos preservados. Pode reincluir depois.')
      else if (r.resultado === 'reincluido' || r.resultado === 'ja_incluido') linhas.push(inicio + (r.resultado === 'reincluido' ? 'exclusão permanente retirada' : 'já estava sem exclusão permanente geral') + '; os demais filtros e silenciamentos continuam valendo.')
      else linhas.push(inicio + 'resultado não confirmado.')
    }
  }
  return [...new Set(linhas)].join('\n\n') || null
}
