import { contratosDosClientesAtendidos } from './contratos-clientes-atendidos.ts'
// Duas ações fechadas. O modelo informa nomes; identidade, entrada e UUIDs vêm
// do servidor. A confirmação nunca é uma ferramenta exposta ao modelo.
import type { ContextoFerramentas } from './wa-agente-ferramentas.ts'
import { lerEscopoRpc, podeVerCliente, type EscopoAgente } from './wa-agente-escopo.ts'
import { chaveNome } from './wa-alertas.ts'
import { carregarGruposInternos } from './wa-grupos-internos-dados.ts'
import { destinoGrupo, motivoGrupoBloqueado } from './wa-grupos-internos.ts'
import {
  conferirIntegridadeEntradaAcaoChat,
  formatarPreviaAcaoChat, formatarReciboAcaoChat, lerConfirmacaoAcaoChat, prepararSimulacaoAcaoChat,
  validarAcaoChat, type MensagemOriginalAcaoChat, type PreviaAcaoChat, type ReciboAcaoChat,
} from './wa-agente-acoes-core.ts'

type Linha = Record<string, unknown>
type Saida = Record<string, unknown>
type Args = { acao: 'cliente_ativo'; cliente: string; ativo: boolean }
  | { acao: 'vincular_contrato_cliente'; contrato: string; cliente: string; produto?: string }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const INCERTO = 'Não consegui confirmar o resultado da ação. Confira o cadastro antes de repetir.'
const INDISPONIVEL = 'Ações de cadastro indisponíveis neste canal ou para este pedido.'
const FALHAS_CONFIRMACAO: Readonly<Record<string, string>> = {
  proposta_expirada: 'O código expirou. Solicite uma nova proposta antes de confirmar.',
  prazo_encerrado: 'O prazo da confirmação terminou. Solicite uma nova proposta.',
  estado_alterado: 'O cadastro mudou desde a proposta. Solicite uma nova proposta com o estado atual.',
  proposta_concluida: 'Esta proposta já foi concluída por outra mensagem. Consulte o cadastro antes de pedir outra alteração.',
}
const DIRETO = 'Envie um pedido direto, sozinho e sem citação. Exemplos: Íris, inative o cliente Nome Completo; ou Íris, vincule o contrato de Titular ao cliente Nome Completo.'
const ENCERRADOS = new Set(['cancelado', 'concluido', 'encerrado', 'distrato', 'finalizado', 'rescindido'])
const objeto = (v: unknown): Linha | null => v && typeof v === 'object' && !Array.isArray(v) ? v as Linha : null
const nome = (v: unknown): v is string => typeof v === 'string' && v.trim() === v && v.length >= 2 && v.length <= 160
  && !UUID.test(v) && !/[\r\n<>"'“”‘’«»`\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/.test(v)
const normalizar = (v: string) => chaveNome(v).trim()

function argumentos(bruto: unknown): Args | null {
  let v = bruto
  if (typeof v === 'string') { try { v = JSON.parse(v) } catch { return null } }
  const a = objeto(v)
  if (!a || !nome(a.cliente)) return null
  const keys = Object.keys(a).sort().join(',')
  if (a.acao === 'cliente_ativo' && keys === 'acao,ativo,cliente' && typeof a.ativo === 'boolean') {
    return { acao: a.acao, cliente: a.cliente, ativo: a.ativo }
  }
  if (a.acao === 'vincular_contrato_cliente' && ['acao,cliente,contrato', 'acao,cliente,contrato,produto'].includes(keys)
    && nome(a.contrato) && (a.produto === undefined || nome(a.produto))) {
    return { acao: a.acao, cliente: a.cliente, contrato: a.contrato, ...(a.produto ? { produto: a.produto as string } : {}) }
  }
  return null
}

/** Comparação integral: sem remover pontuação dos nomes, sem aceitar outra oração. */
export function pedidoDiretoCadastro(texto: string, a: Args, agente = 'Íris'): boolean {
  if (texto.length > 8000 || /[<>"'“”‘’«»`]|(^|\n)\s*>/.test(texto)) return false
  const enquadramento = normalizar(texto)
  if (/\b(exemplo|hipotese|suponha|simule|simulacao|transcricao|historico|disse|disseram|falou|relatou|afirmou|citou|citacao|segundo|finja)\b/.test(enquadramento)
    || /(?:^|[.!?;\n])\s*(?:(?:iris|[^,.;?!\n]{1,60}),\s*)?(?:se|quando|caso|nao (?:faca|execute|aplique|altere|siga)|nunca|jamais)\b/.test(enquadramento)) return false
  const comandos = a.acao === 'cliente_ativo'
    ? [`${a.ativo ? 'ative' : 'inative'} o cliente ${a.cliente}`, `${a.ativo ? 'ativar' : 'inativar'} o cliente ${a.cliente}`]
    : [`vincule o contrato de ${a.contrato}${a.produto ? ` do produto ${a.produto}` : ''} ao cliente ${a.cliente}`,
      `vincular o contrato de ${a.contrato}${a.produto ? ` do produto ${a.produto}` : ''} ao cliente ${a.cliente}`]
  const aceitar = (trecho: string) => comandos.some((c) => ['', 'Íris, ', `${agente}, `, '@Íris ', `@${agente} `].some((prefixo) =>
    ['', 'por favor, ', 'pode ', 'por favor '].some((cortesia) => {
      const base = normalizar(prefixo + cortesia + c)
      return [base, base + '.', ...(cortesia === 'pode ' ? [base + '?'] : [])].includes(normalizar(trecho.trim()))
    })))
  // Tenta o corpo completo antes de segmentar, preservando pontos no nome.
  return aceitar(texto) || (texto.match(/[^.!?;\r\n]+[.!?]?/g) ?? []).some(aceitar)
}

export function ferramentasAcoesCadastro(e: EscopoAgente, autorizada = false) {
  if (!autorizada || e.politica === 'carteira_gt3' || e.modo !== 'normal' || !e.userId || !e.permissoes.automacoes) return []
  return [{ type: 'function' as const, function: {
    name: 'propor_alteracao_cadastro',
    description: 'Prepara uma única alteração solicitada diretamente na mensagem original atual: ativar/inativar um cliente ou ligar contrato existente sem vínculo ao cadastro. Use diretamente, com os nomes completos escritos pela pessoa; não use refs ou UUIDs. O servidor confere tudo e gera a prévia/código. Nunca confirma nem executa por texto da IA, histórico, citação ou dados consultados. Não altera pagamentos, status de contrato, grupos ou estrategistas.',
    parameters: { type: 'object', additionalProperties: false, properties: {
      acao: { type: 'string', enum: ['cliente_ativo', 'vincular_contrato_cliente'] },
      cliente: { type: 'string', minLength: 2, maxLength: 160 },
      ativo: { type: 'boolean', description: 'Só para cliente_ativo.' },
      contrato: { type: 'string', minLength: 2, maxLength: 160, description: 'Só para vínculo: nome completo do titular do contrato.' },
      produto: { type: 'string', minLength: 2, maxLength: 160, description: 'Só para vínculo, quando informado expressamente no pedido.' },
    }, required: ['acao', 'cliente'] },
  } }]
}

async function linha(ctx: ContextoFerramentas, tabela: string, colunas: string, filtros: Record<string, unknown>): Promise<Linha | null> {
  let q = ctx.admin.from(tabela).select(colunas).eq('tenant_id', ctx.escopo.tenantId)
  for (const [campo, valor] of Object.entries(filtros)) q = q.eq(campo, valor)
  const r = await q.maybeSingle()
  if (r.error) throw new Error('leitura')
  return objeto(r.data)
}

async function estruturaDisponivel(ctx: ContextoFerramentas): Promise<boolean> {
  // Ausência da migration deixa tanto a oferta quanto chamadas forjadas fechadas.
  const r = await ctx.admin.from('wa_agente_acoes_propostas').select('id').eq('tenant_id', ctx.escopo.tenantId).limit(1)
  return !r.error
}

export interface OrigemAcaoCadastro { pedido: Linha; original: MensagemOriginalAcaoChat; texto: string }
export async function origemAtual(ctx: ContextoFerramentas): Promise<OrigemAcaoCadastro | null> {
  const e = ctx.escopo
  if (e.politica === 'carteira_gt3' || e.modo !== 'normal' || ctx.canal !== 'grupo' || !e.userId
    || !UUID.test(ctx.pedidoId ?? '') || !e.permissoes.automacoes) return null
  const p = await linha(ctx, 'wa_agente_pedidos',
    'id,user_id,membro_id,instance_uuid,chat_jid,remetente_chave,eh_grupo,chat_message_id,conversation_id,message_id_wpp,status,lock_ate,gatilho,entrada_texto_sha256,entrada_encaminhada', { id: ctx.pedidoId })
  if (!p || p.user_id !== e.userId || p.eh_grupo !== true || !UUID.test(String(p.membro_id))
    || !UUID.test(String(p.instance_uuid)) || !UUID.test(String(p.chat_message_id)) || !UUID.test(String(p.conversation_id))
    || p.status !== 'processando' || Date.parse(String(p.lock_ate)) <= ctx.agora.getTime()
    || !Number.isFinite(Date.parse(String(p.lock_ate))) || !['nome', 'mencao', 'quote'].includes(String(p.gatilho))
    || !/^[0-9]{10,15}$/.test(String(p.remetente_chave)) || !destinoGrupo(String(p.chat_jid))
    || ![false, null].includes(p.entrada_encaminhada as false | null) || typeof p.entrada_texto_sha256 !== 'string'
    || !/^[a-f0-9]{64}$/.test(p.entrada_texto_sha256)) return null
  const m = await linha(ctx, 'chat_messages',
    'id,conversation_id,conteudo,tipo,reply_to_id,enviado_por_agente,enviado_por_ia,autor_tipo,autor_origem,autor_user_id,autor_chave',
    { id: p.chat_message_id, message_id_wpp: p.message_id_wpp })
  if (!m || typeof m.conteudo !== 'string' || m.tipo !== 'texto' || !(m.reply_to_id === null || typeof m.reply_to_id === 'string') || m.enviado_por_agente === true
    || m.enviado_por_ia === true || m.autor_origem !== 'webhook' || m.autor_chave !== p.remetente_chave) return null
  if (m.conversation_id === p.conversation_id) {
    if (m.autor_tipo !== 'equipe' || m.autor_origem !== 'webhook'
      || m.autor_user_id !== e.userId || m.autor_chave !== p.remetente_chave) return null
  } else {
    // O Chat deduplica o mesmo ID do WhatsApp entre números. A conversa canônica
    // comprova somente o conteúdo; a identidade continua vindo do pedido
    // autenticado, do membro e do digest original do enqueue, conferidos abaixo.
    const fonte = await linha(ctx, 'chat_conversations', 'contact_id,is_group,instance_id', { id: m.conversation_id })
    if (!fonte || fonte.is_group !== true || !UUID.test(String(fonte.instance_id))) return null
    const contato = await linha(ctx, 'chat_contacts', 'numero_whatsapp,bloqueado', { id: fonte.contact_id, instance_id: fonte.instance_id })
    const instancia = await linha(ctx, 'whatsapp_instances', 'id', { id: fonte.instance_id })
    if (!contato || contato.bloqueado === true || !instancia || destinoGrupo(String(contato.numero_whatsapp)) !== p.chat_jid) return null
  }
  const texto = m.conteudo.replace(/^\[[^\]\r\n]{1,100}\] /, '')
  if (texto !== ctx.mensagemOriginal || !await conferirIntegridadeEntradaAcaoChat(texto, p.entrada_texto_sha256)) return null
  const ag = await ctx.admin.from('wa_agente_pedidos').select('id').eq('tenant_id', e.tenantId)
    .eq('chat_jid', p.chat_jid).eq('membro_id', p.membro_id).eq('status', 'agrupado').neq('id', p.id)
    .gte('created_at', new Date(ctx.agora.getTime() - 120_000).toISOString()).limit(1)
  if (ag.error || !Array.isArray(ag.data) || ag.data.length !== 0) return null
  const cv = await linha(ctx, 'chat_conversations', 'contact_id,is_group', { id: p.conversation_id, instance_id: p.instance_uuid })
  if (!cv || cv.is_group !== true) return null
  const ct = await linha(ctx, 'chat_contacts', 'numero_whatsapp,bloqueado', { id: cv.contact_id, instance_id: p.instance_uuid })
  if (!ct || ct.bloqueado === true || destinoGrupo(String(ct.numero_whatsapp)) !== p.chat_jid) return null
  return { pedido: p, texto, original: { fonte: 'pedido_original_servidor', texto: m.conteudo,
    ehGrupo: true, gatilho: String(p.gatilho), tipo: 'texto', replyToId: m.reply_to_id as string | null, agrupada: false,
    quantidadeMensagens: 1, encaminhada: p.entrada_encaminhada as boolean | null, autorConferido: true, integridadeConferida: true } }
}

export async function autorizadoAgora(ctx: ContextoFerramentas, origem: OrigemAcaoCadastro) {
  const p = origem.pedido
  const e = ctx.escopo
  const membro = await linha(ctx, 'wa_agente_membros', 'id', { id: p.membro_id, user_id: e.userId, telefone_chave: p.remetente_chave, ativo: true })
  const user = await linha(ctx, 'users', 'ativo,perfil', { id: e.userId })
  if (!membro || user?.ativo !== true || user.perfil === 'cliente') return null
  const perm = await ctx.admin.rpc('has_permissao_de', { p_user_id: e.userId, p_recurso: 'automacoes-wa', p_acao: 'admin' })
  if (perm.error || perm.data !== true) return null // acesso_total só concede leitura.
  const app = await linha(ctx, 'app_modules', 'slug', { slug: 'automacoes-wa', enabled: true })
  const cfg = await linha(ctx, 'wa_auto_config', 'agente_ativo,agente_grupos,uazapi_instance_id', {})
  const grupo = await linha(ctx, 'wa_agente_grupos', 'id,ativo', { grupo_jid: p.chat_jid })
  const inst = await linha(ctx, 'whatsapp_instances', 'instance_id,ativo,status', { id: p.instance_uuid })
  if (!app || cfg?.agente_ativo !== true || cfg.agente_grupos !== true || grupo?.ativo !== true
    || inst?.ativo !== true || inst.status !== 'conectado') return null
  if (inst.instance_id !== cfg.uazapi_instance_id && !await linha(ctx, 'wa_agente_grupo_numeros', 'grupo_id',
    { grupo_id: grupo.id, instance_uuid: p.instance_uuid })) return null
  const grupos = await carregarGruposInternos(ctx.admin, e.tenantId, String(inst.instance_id), [String(p.chat_jid)])
  if (motivoGrupoBloqueado(String(p.chat_jid), new Set(grupos.grupos.map((g) => g.grupo_jid)), grupos.deCliente, grupos.nomeDeCliente) !== null) return null
  const carteira = await ctx.admin.rpc('wa_agente_escopo', { p_tenant: e.tenantId, p_user: e.userId })
  return carteira.error ? null : lerEscopoRpc(carteira.data)
}

export async function prepararOfertaAcoesCadastro(ctx: ContextoFerramentas): Promise<boolean> {
  if (ctx.escopo.politica === 'carteira_gt3' || ctx.canal !== 'grupo' || !ctx.escopo.userId || ctx.escopo.modo !== 'normal') return false
  try {
    if (!await estruturaDisponivel(ctx)) return false
    const origem = await origemAtual(ctx)
    return !!origem && !!await autorizadoAgora(ctx, origem)
  } catch { return false }
}

export async function registros(ctx: ContextoFerramentas, tabela: string, colunas: string): Promise<Linha[]> {
  const total = await ctx.admin.from(tabela).select('id', { count: 'exact', head: true }).eq('tenant_id', ctx.escopo.tenantId)
  if (total.error || !Number.isSafeInteger(total.count) || total.count! < 0) throw new Error('leitura incompleta')
  const encontrados: Linha[] = []
  let ultimo: string | null = null
  while (encontrados.length < total.count!) {
    let q = ctx.admin.from(tabela).select(colunas).eq('tenant_id', ctx.escopo.tenantId).order('id').limit(500)
    if (ultimo) q = q.gt('id', ultimo)
    const r = await q
    if (r.error || !Array.isArray(r.data) || !r.data.length) throw new Error('leitura incompleta')
    for (const bruto of r.data) {
      const registro = objeto(bruto)
      if (!registro || typeof registro.id !== 'string' || !UUID.test(registro.id)
        || (ultimo !== null && registro.id <= ultimo)) throw new Error('registro inválido')
      ultimo = registro.id
      encontrados.push(registro)
    }
  }
  const final = await ctx.admin.from(tabela).select('id', { count: 'exact', head: true }).eq('tenant_id', ctx.escopo.tenantId)
  if (final.error || final.count !== total.count || encontrados.length !== total.count) throw new Error('leitura incompleta')
  return encontrados
}

async function resolver(ctx: ContextoFerramentas, args: Args, carteira: { total: boolean; clientIds: Set<string> }) {
  const clientes = await registros(ctx, 'clients', 'id,nome,ativo')
  const visivel = (id: unknown) => typeof id === 'string' && podeVerCliente(ctx.escopo, id) && (carteira.total || carteira.clientIds.has(id))
  const candidatos = clientes.filter((c) => visivel(c.id) && normalizar(String(c.nome)) === normalizar(args.cliente))
  if (candidatos.length !== 1) throw new Error('cliente ambíguo ou ausente')
  const c = candidatos[0]
  const contratos = await registros(ctx, 'contratos', 'id,cliente_id,cliente_nome,produto_nome,status,estrategista_id')
  let acao: unknown
  let previa: PreviaAcaoChat
  if (args.acao === 'cliente_ativo') {
    if (typeof c.ativo !== 'boolean') throw new Error('estado inválido')
    if (c.ativo === args.ativo) return { acao: null, previa: null, semAlteracao: `Cliente ${String(c.nome)} já está ${args.ativo ? 'ativo' : 'inativo'}. Nenhuma alteração necessária.` }
    const atendidos = !args.ativo ? await contratosDosClientesAtendidos(ctx.admin, ctx.escopo.tenantId, [String(c.id)]) : []
    if (atendidos.some((k) => !ENCERRADOS.has(normalizar(String(k.status))))) throw new Error('contrato não encerrado')
    if (!args.ativo && contratos.some((k) => (k.cliente_id === c.id || (k.cliente_id === null && normalizar(String(k.cliente_nome)) === normalizar(String(c.nome))))
      && !ENCERRADOS.has(normalizar(String(k.status))))) throw new Error('contrato não encerrado')
    acao = { acao: args.acao, alvo: c.id, novo: { ativo: args.ativo } }
    previa = { acao: args.acao, alvo_nome: String(c.nome), antes: { ativo: c.ativo }, depois: { ativo: args.ativo } }
  } else {
    // Conta também contratos já vinculados antes de conferir a condição NULL.
    const ks = contratos.filter((k) => normalizar(String(k.cliente_nome)) === normalizar(args.contrato)
      && (!args.produto || normalizar(String(k.produto_nome)) === normalizar(args.produto))
      && (carteira.total || k.estrategista_id === ctx.escopo.userId))
    if (ks.length !== 1 || ks[0].cliente_id !== null) throw new Error('contrato ambíguo, ausente ou vinculado')
    const k = ks[0]
    if (c.ativo !== true && !ENCERRADOS.has(normalizar(String(k.status)))) throw new Error('destino inativo')
    acao = { acao: args.acao, alvo: k.id, novo: { cliente_id: c.id } }
    previa = { acao: args.acao, alvo_nome: String(k.cliente_nome), antes: { cliente_id: null }, depois: { cliente_id: String(c.id), cliente_nome: String(c.nome) } }
  }
  const validada = validarAcaoChat(acao)
  if (!validada) throw new Error('ação inválida')
  return { acao: validada, previa }
}

export async function executarAcoesCadastro(nomeFerramenta: string, bruto: unknown, ctx: ContextoFerramentas,
  { agoraAcaoChat = () => new Date() }: { agoraAcaoChat?: () => Date } = {}): Promise<Saida | null> {
  if (nomeFerramenta !== 'propor_alteracao_cadastro') return null
  if (ctx.escopo.politica === 'carteira_gt3' || ctx.escopo.modo !== 'normal' || ctx.canal !== 'grupo' || !ctx.escopo.userId) return { erro: INDISPONIVEL }
  const args = argumentos(bruto)
  if (!args) return { erro: DIRETO }
  try {
    if (!await estruturaDisponivel(ctx)) return { erro: INDISPONIVEL }
    const origem = await origemAtual(ctx)
    if (!origem || !pedidoDiretoCadastro(origem.texto, args, ctx.nomeAgente)) return { erro: DIRETO }
    const carteira = await autorizadoAgora(ctx, origem)
    if (!carteira) return { erro: INDISPONIVEL }
    const perm = await ctx.admin.rpc('has_permissao_de', { p_user_id: ctx.escopo.userId,
      p_recurso: args.acao === 'cliente_ativo' ? 'clientes' : 'contratos', p_acao: 'editar' })
    if (perm.error || perm.data !== true) return { erro: INDISPONIVEL }
    const { acao, previa, semAlteracao } = await resolver(ctx, args, carteira)
    if (!acao || !previa) return { ok: true, sem_alteracao: true, texto_deterministico: semAlteracao }
    if (ctx.simulacao) return { ok: true, simulacao: true, texto_deterministico: prepararSimulacaoAcaoChat(previa) }
    const r = await ctx.admin.rpc('wa_agente_acoes_propor', { p_pedido: ctx.pedidoId, p_acao: acao.acao, p_alvo: acao.alvo, p_novo: acao.novo })
    const data = objeto(r.data)
    const previaPersistida = objeto(data?.previa)
    if (r.error || data?.ok !== true || !UUID.test(String(data.proposta_id)) || !previaPersistida) return { erro: INCERTO }
    // A RPC cria o prazo depois do preflight/IA; ctx.agora é o início do pedido.
    const texto = formatarPreviaAcaoChat({ ...previaPersistida, codigo: data.codigo, expira_em: data.expira_em } as PreviaAcaoChat & { codigo: string; expira_em: string }, agoraAcaoChat())
    return { ok: true, texto_deterministico: texto, codigo_confirmacao: data.codigo }
  } catch { return { erro: 'Não consegui preparar uma proposta inequívoca e autorizada. Confira nomes, contratos e situação do cadastro.' } }
}

/** Executada antes da IA: código vem exclusivamente da mensagem original conferida. */
export async function confirmarAcaoCadastroDoPedido(ctx: ContextoFerramentas): Promise<Saida | null> {
  if (typeof ctx.mensagemOriginal !== 'string' || !/^(?:[ÍI]ris, )?confirmar /i.test(ctx.mensagemOriginal)) return null
  if (ctx.escopo.politica === 'carteira_gt3' || ctx.escopo.modo !== 'normal' || ctx.canal !== 'grupo' || !ctx.escopo.userId) return { erro: INDISPONIVEL }
  try {
    if (!await estruturaDisponivel(ctx)) return { erro: INDISPONIVEL }
    const origem = await origemAtual(ctx)
    if (!origem) return { erro: DIRETO }
    const codigo = lerConfirmacaoAcaoChat(origem.original)
    if (!codigo || !await autorizadoAgora(ctx, origem)) return { erro: INDISPONIVEL }
    if (ctx.simulacao) return { erro: 'Simulação: confirmações não executam alterações nem criam propostas.' }
    const r = await ctx.admin.rpc('wa_agente_acoes_confirmar', { p_pedido: ctx.pedidoId, p_codigo: codigo })
    const data = objeto(r.data)
    if (r.error) return { erro: INCERTO }
    if (data?.ok === false && typeof data.codigo === 'string' && Object.hasOwn(FALHAS_CONFIRMACAO, data.codigo)) {
      return { erro: FALHAS_CONFIRMACAO[data.codigo] }
    }
    if (data?.ok !== true || !objeto(data.recibo)) return { erro: INCERTO }
    return { ok: true, texto_deterministico: formatarReciboAcaoChat(data.recibo as unknown as ReciboAcaoChat), recibo_id: String((data.recibo as Linha).proposta_id) }
  } catch { return { erro: INCERTO } }
}

export function recibosAcoesCadastro(resultados: readonly Saida[]): string | null {
  if (!resultados.length) return null
  return [...new Set(resultados.map((r) => typeof r.texto_deterministico === 'string' ? r.texto_deterministico
    : typeof r.erro === 'string' ? r.erro : INCERTO))].join('\n\n')
}
