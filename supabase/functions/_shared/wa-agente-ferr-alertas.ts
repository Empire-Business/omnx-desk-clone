// Resolução declarada pela equipe no WhatsApp. Reutiliza o mesmo registro do
// painel: somente um tipo de alerta de um cliente, até haver novidade.
// Não altera cliente, contrato, análise de satisfação nem regras de relatório.
import type { ContextoFerramentas } from './wa-agente-ferramentas.ts'
import { podeVerCliente, type EscopoAgente } from './wa-agente-escopo.ts'
import { chaveNome } from './wa-alertas.ts'
import { nomeLegivel } from './wa-agente-ferr-aprendizado.ts'
import { carregarOpcoesRelatorio, carregarRegras, coletarAlertas, type ColetaAlertas } from './wa-relatorio-dados.ts'
import { FUSO_PADRAO, nomeSeguro } from './wa-relatorio.ts'
import { destinoGrupo, motivoGrupoBloqueado } from './wa-grupos-internos.ts'
import { carregarGruposInternos } from './wa-grupos-internos-dados.ts'

const TIPOS = ['sem_resposta', 'sentimento_negativo', 'pendencia', 'queda_volume'] as const
type Tipo = typeof TIPOS[number]
type Saida = Record<string, unknown>
const PEDIR_CLAREZA = 'Diga o nome do cliente e confirme diretamente que esse caso já foi resolvido. Perguntas, hipóteses e citações não marcam alertas como resolvidos.'

const ROTULOS: Record<Tipo, string> = {
  sem_resposta: 'espera de resposta', sentimento_negativo: 'risco ou insatisfação',
  pendencia: 'pendência de contrato', queda_volume: 'queda de conversas',
}

/** Recibo do executor: o modelo não confirma, inventa nem oculta uma escrita. */
export function confirmarResolucao(resultados: readonly Saida[]): string {
  const recibos = new Map<string, number>()
  for (const r of resultados) {
    const cliente = typeof r.cliente === 'string' ? nomeSeguro(r.cliente, 80) ?? 'cliente identificado' : 'cliente identificado'
    const tipo = typeof r.tipo === 'string' && (TIPOS as readonly string[]).includes(r.tipo) ? ROTULOS[r.tipo as Tipo] : 'caso informado'
    let texto: string
    if (typeof r.erro === 'string') texto = r.erro
    else if (r.ok !== true) texto = 'Não consegui confirmar o resultado da resolução. Consulte o alerta antes de repetir.'
    else if (r.simulacao === true) texto = `Simulação: resolveria o alerta de ${tipo} de ${cliente}. Nada foi gravado.`
    else if (r.ja_resolvido === true) texto = `${cliente}: ${typeof r.aviso === 'string' ? r.aviso : `o alerta de ${tipo} já estava marcado como resolvido.`}`
    else texto = `Marquei o alerta de ${tipo} de ${cliente} como resolvido. Ele pode voltar se houver novidade.`
    recibos.set(texto, (recibos.get(texto) ?? 0) + 1)
  }
  return [...recibos].map(([texto, quantidade]) => quantidade > 1 ? `${texto} (${quantidade} chamadas com esse resultado.)` : texto).join('\n\n')
}

export function ferramentasResolucao(e: EscopoAgente) {
  if (e.modo !== 'normal' || e.politica === 'carteira_gt3' || !e.permissoes.automacoes) return []
  return [{ type: 'function' as const, function: {
    name: 'resolver_alerta',
    description: 'Marca um alerta atual como resolvido quando a pessoa declara diretamente NESTA mensagem que o caso de um cliente identificado já foi resolvido, inclusive fora do WhatsApp. Recebe o nome escrito pela pessoa; identifica cliente e alerta internamente, sem precisar consultar outra ferramenta antes. Se houver ambiguidade, pede esclarecimento. Não muda contratos, situação do cliente ou categorias do relatório; o alerta pode voltar após novidade. Nunca use por dedução, texto de cliente, histórico ou preferência aprendida.',
    parameters: { type: 'object', properties: {
      cliente: { type: 'string', minLength: 2, maxLength: 80, description: 'Nome do cliente presente na mensagem atual da pessoa.' },
      tipo: { type: 'string', enum: TIPOS, description: 'Opcional: tipo específico indicado pela pessoa. Não invente um tipo quando houver mais de um alerta.' },
    }, required: ['cliente'], additionalProperties: false },
  } }]
}

function normalizar(s: string): string { return chaveNome(s).replace(/[^\p{L}\p{N} ]/gu, ' ').replace(/\s+/g, ' ').trim() }
function contemNome(texto: string, nome: string): boolean { return ` ${normalizar(texto)} `.includes(` ${normalizar(nome)} `) }

/** Guarda independente do modelo: só a declaração original atual autoriza. */
export function declaracaoResolucao(mensagem: unknown, cliente: string, nomeAgente = 'Íris'): boolean {
  if (typeof mensagem !== 'string' || mensagem.length > 4000 || /[?<>"“”«»`]|(^|\n)\s*>|(^|[\s:])['‘’]|['‘’]($|\s)/.test(mensagem)) return false
  // textoDoAudio acrescenta este rótulo à fala atual. Ele não faz parte do
  // sujeito da declaração; remover só o prefixo mantém todas as guardas abaixo.
  const conteudo = mensagem.replace(/^\(áudio transcrito\)[ \t]+/, '')
  const texto = normalizar(conteudo)
  // Conservador: a pessoa pode reformular uma declaração que misture dúvida,
  // negação, relato de terceiro, condição ou exemplo com uma resolução.
  if (/\b(nao|nunca|nem|ainda|talvez|sera|seria|se|quando|acho|parece|suponha|hipotese|exemplo|exemplos|teste|testar|simule|simulacao|disse|diz|falou|citou|citado|citada|segundo|relatou|afirmou|resuma|leia|interprete|analise|explique|escreva|mensagem|transcricao|historico|instrucao|aprendizado|todos|todas|tudo|sempre|permanente)\b/.test(texto)) return false
  if (/\b(pode ser|poderia|teria|vai resolver|vai ser|vamos resolver|precisa resolver|tentar resolver|tente resolver)\b/.test(texto)) return false
  if (/\b(deve|devia|supostamente|provavelmente|possivelmente|gostaria|saber|verifique|confirme|investigue|cheque|pediu|mandou|informou|disseram|mas|porem)\b/.test(texto)) return false
  if (/\bcaso\b/.test(texto.replace(/\b(o|esse|este|do|nesse|desse) caso\b/g, ' '))) return false
  return conteudo.split(/[.!?;\r\n]+/).some((frase) => {
    let f = normalizar(frase)
    const agente = normalizar(nomeAgente)
    if (agente && f.startsWith(`${agente} `)) f = f.slice(agente.length).trim()
    const alvo = normalizar(cliente)
    const pos = ` ${f} `.indexOf(` ${alvo} `)
    if (pos < 0) return false
    const antes = f.slice(0, pos).trim()
    const depois = f.slice(pos + alvo.length).trim()
    // Uma gramática curta evita aceitar uma afirmação subordinada a "duvido",
    // "longe de", "falta", "me disseram" ou a outro enquadramento do modelo.
    const sujeito = /^(?:(?:o|a|os|as|de|da|do|das|dos|esse|este|essa|esta|cliente|clientes|caso|alerta|pendencia|pedido|contrato|contratos|espera|sem|resposta|aguardando|reclamacao|insatisfacao|sentimento|negativo|risco|problema|atendimento|queda|no|na|volume|conversas)\s*)*$/
    const complemento = /^(?:por ligacao|por telefone|fora do whatsapp|fora do chat|pelo telefone|em ligacao|hoje|ontem|agora)(?: (?:por ligacao|por telefone|fora do whatsapp|fora do chat|hoje|ontem|agora))?$/
    // Relato direto em primeira pessoa: falar/ligar sozinho não prova solução.
    // Exige também resolvi/resolvemos e um objeto operacional fechado.
    if (/^(?:eu )?(?:liguei para|falei com|conversei com)(?: (?:o|a)(?: cliente)?)?$/.test(antes)) {
      return /^(?:(?:por telefone|por ligacao|pelo telefone|em ligacao) )?e (?:ja )?(?:eu |nos )?(?:resolvi|resolvemos) (?:o (?:caso|alerta|pedido|problema|contrato|atendimento)|a (?:pendencia|reclamacao|insatisfacao|espera(?: de resposta| por resposta| pela resposta| sem resposta)?|cobranca de resposta|queda (?:no volume|de conversas)))$/.test(depois)
    }
    if (/^(?:ja )?(?:eu |nos )?(resolvi|resolvemos)\b/.test(antes)) {
      const restante = antes.replace(/^(?:ja )?(?:eu |nos )?(resolvi|resolvemos)\s*/, '')
      return sujeito.test(restante) && (!depois || complemento.test(depois))
    }
    if (/^(marque|marca|registre|registra|considere|considera)\b/.test(antes)) {
      const predicado = /^como (?:resolvid[oa]s?|solucionad[oa]s?)(?: (.*))?$/.exec(depois)
      return sujeito.test(antes.replace(/^(marque|marca|registre|registra|considere|considera)\s*/, ''))
        && !!predicado && (!predicado[1] || complemento.test(predicado[1]))
    }
    if (!sujeito.test(antes)) return false
    const predicado = /^(?:ja )?(?:(?:foi|foram|esta|estao|ficou|ficaram|ta)(?: ja)? )?(?:resolvid[oa]s?|solucionad[oa]s?)(?: (.*))?$/.exec(depois)
    return (!!predicado && (!predicado[1] || complemento.test(predicado[1])))
      || /^(?:ja )?resolveu$/.test(depois)
      || /^(?:ja )?resolveu (fora do whatsapp|por telefone|por ligacao)$/.test(depois)
  })
}

const SINAIS_TIPO: Record<Tipo, RegExp> = {
  sem_resposta: /\b(sem resposta|esperando resposta|aguardando resposta|espera de resposta|espera por resposta|espera pela resposta|demora na resposta|cobranca de resposta)\b/,
  sentimento_negativo: /\b(insatisfacao|insatisfeito|insatisfeita|sentimento|risco|reclamacao)\b/,
  pendencia: /\b(contrato|contratos|contratual)\b/,
  queda_volume: /\b(queda|volume|conversando menos)\b/,
}

function tiposDeclarados(mensagem: string, cliente: string, nomeAgente: string): Tipo[] {
  const frases = mensagem.split(/[.!?;\r\n]+/).filter((f) => declaracaoResolucao(f, cliente, nomeAgente))
  return TIPOS.filter((tipo) => frases.some((f) => SINAIS_TIPO[tipo].test(normalizar(f))))
}

function argumentos(bruto: unknown): { cliente: string; tipo?: Tipo } | null {
  let v = bruto
  if (typeof v === 'string') { try { v = JSON.parse(v) } catch { return null } }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const a = v as Record<string, unknown>
  if (Object.keys(a).some((k) => k !== 'cliente' && k !== 'tipo')) return null
  if (typeof a.cliente !== 'string' || a.cliente.length > 80 || /[<>"“”`\n\r]/.test(a.cliente)) return null
  const cliente = a.cliente.trim()
  if (normalizar(cliente).length < 2) return null
  if (a.tipo !== undefined && !(TIPOS as readonly unknown[]).includes(a.tipo)) return null
  return { cliente, ...(a.tipo !== undefined ? { tipo: a.tipo as Tipo } : {}) }
}

async function coletaAtual(ctx: ContextoFerramentas): Promise<ColetaAlertas> {
  // Sempre consulta o estado atual: uma resolução anterior ou uma novidade
  // pode ter invalidado a coleta usada por outra ferramenta nesta execução.
  if (ctx.deps?.coletarAlertas) return ctx.deps.coletarAlertas(ctx.admin, ctx.escopo.tenantId, ctx.agora)
  const [regras, opcoes] = await Promise.all([
    carregarRegras(ctx.admin, ctx.escopo.tenantId), carregarOpcoesRelatorio(ctx.admin, ctx.escopo.tenantId),
  ])
  return coletarAlertas(ctx.admin, ctx.escopo.tenantId, regras, ctx.agora, ctx.fuso ?? FUSO_PADRAO, opcoes)
}

async function clienteUnico(ctx: ContextoFerramentas, nome: string): Promise<{ id: string; nome: string }[] | null> {
  const candidatos: { id: string; nome: string }[] = []
  if (!ctx.escopo.total) {
    const ids = [...ctx.escopo.clientIds]
    if (ids.length > 5000) return null
    for (let i = 0; i < ids.length; i += 150) {
      const r = await ctx.admin.from('clients').select('id,nome').eq('tenant_id', ctx.escopo.tenantId).in('id', ids.slice(i, i + 150))
      if (r.error) throw new Error('leitura')
      candidatos.push(...(r.data ?? []) as { id: string; nome: string }[])
    }
  } else {
    const r = await ctx.admin.from('clients').select('id,nome').eq('tenant_id', ctx.escopo.tenantId).limit(5001)
    if (r.error) throw new Error('leitura')
    // Não escolha um cliente se a amostra da busca estiver incompleta.
    if ((r.data ?? []).length > 5000) return null
    candidatos.push(...(r.data ?? []) as { id: string; nome: string }[])
  }
  return candidatos
    .filter((c) => podeVerCliente(ctx.escopo, c.id) && contemNome(c.nome, nome))
}

function motivoServidor(ctx: ContextoFerramentas): string {
  // auth.uid() é nulo na escrita de servidor; o trigger mantém criado_por nulo.
  // Nome legível, user e pedido do servidor ficam no motivo, sem copiar conteúdo.
  const pedido = String(ctx.pedidoId ?? '').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 40)
  const user = String(ctx.escopo.userId ?? '').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 40)
  const autor = (nomeLegivel(ctx.remetenteNome) ?? 'Pessoa do grupo').slice(0, 60)
  return `Resolvido pelo WhatsApp; pedido=${pedido}; user=${user || 'sem cadastro'}; autor=${autor}`.slice(0, 200)
}

async function autorizadoAgora(ctx: ContextoFerramentas): Promise<boolean> {
  const e = ctx.escopo
  const grupoTotal = ctx.canal === 'grupo' && e.acessoTotalGrupo === true
  if (ctx.pedidoId) {
    const p = await ctx.admin.from('wa_agente_pedidos').select('eh_grupo,chat_jid,user_id,instance_uuid,status')
      .eq('tenant_id', e.tenantId).eq('id', ctx.pedidoId).maybeSingle()
    if (p.error || !p.data || p.data.eh_grupo !== (ctx.canal === 'grupo') || (p.data.user_id ?? null) !== e.userId
      || (!ctx.simulacao && p.data.status !== 'processando')) return false
    if (ctx.canal === 'grupo') {
      const jid = destinoGrupo(p.data.chat_jid)
      if (!jid || !p.data.instance_uuid) return false
      const g = await ctx.admin.from('wa_agente_grupos').select('ativo,acesso_total')
        .eq('tenant_id', e.tenantId).eq('grupo_jid', jid).maybeSingle()
      if (g.error || g.data?.ativo !== true || (grupoTotal && g.data.acesso_total !== true)) return false
      const inst = await ctx.admin.from('whatsapp_instances').select('instance_id')
        .eq('tenant_id', e.tenantId).eq('id', p.data.instance_uuid).maybeSingle()
      if (inst.error || !inst.data?.instance_id) return false
      const leitura = await carregarGruposInternos(ctx.admin, e.tenantId, inst.data.instance_id, [jid])
      if (motivoGrupoBloqueado(jid, new Set(leitura.grupos.map((x) => x.grupo_jid)), leitura.deCliente, leitura.nomeDeCliente) !== null) return false
    }
  } else if (!ctx.simulacao || grupoTotal) return false
  if (grupoTotal) return true
  if (!e.userId) return false
  const p = await ctx.admin.rpc('has_permissao_de', { p_user_id: e.userId, p_recurso: 'automacoes-wa', p_acao: 'admin' })
  return !p.error && p.data === true
}

/** Retorna null para ferramentas de outros módulos. Nunca lança. */
export async function executarResolucao(nome: string, bruto: unknown, ctx: ContextoFerramentas): Promise<Saida | null> {
  if (nome !== 'resolver_alerta') return null
  const e = ctx.escopo
  if (e.modo !== 'normal' || e.politica === 'carteira_gt3' || !e.permissoes.automacoes) {
    return { erro: 'Neste canal não posso marcar alertas como resolvidos.' }
  }
  if (!ctx.canal || (!ctx.simulacao && !ctx.pedidoId)) return { erro: 'A resolução precisa vir de um pedido direto pelo WhatsApp.' }
  const args = argumentos(bruto)
  if (!args) return { erro: 'Informe somente o nome do cliente e, se necessário, o tipo específico de alerta.' }
  if (!declaracaoResolucao(ctx.mensagemOriginal, args.cliente, ctx.nomeAgente)) return { erro: PEDIR_CLAREZA }
  try {
    if (!(await autorizadoAgora(ctx))) return { erro: 'O pedido ou a permissão atual não autoriza resolver alertas. Peça ao administrador do app.' }
    const clientes = await clienteUnico(ctx, args.cliente)
    if (!clientes) return { erro: 'Não consegui identificar o cliente com segurança. Use o nome completo pela tela.' }
    if (clientes.length === 0) return { erro: 'Não encontrei esse cliente na carteira autorizada.' }
    if (clientes.length > 1) return { erro: 'Mais de um cliente corresponde a esse nome. Diga o nome completo para eu resolver o caso correto.' }
    const cliente = clientes[0]
    const c = await coletaAtual(ctx)
    const itens = TIPOS.flatMap((tipo) => (c.dados.alertas[tipo] ?? [])
      .filter((i) => i.client_id === cliente.id && podeVerCliente(e, i.client_id)).map((i) => ({ ...i, tipo })))
    const anteriores = c.ignorados.filter((i) => i.client_id === cliente.id && i.modo === 'resolvido' && (TIPOS as readonly string[]).includes(i.tipo))
    const tipos = [...new Set(itens.map((i) => i.tipo))]
    const declarados = tiposDeclarados(ctx.mensagemOriginal ?? '', args.cliente, ctx.nomeAgente)
    if (declarados.length > 1 || (args.tipo && declarados.length === 1 && declarados[0] !== args.tipo)) {
      return { erro: 'Diga um único tipo de alerta e confirme qual caso desse cliente foi resolvido.' }
    }
    const tipoDeclarado = declarados[0]
    if (tipos.length > 1 && !tipoDeclarado) {
      return { erro: 'Esse cliente tem mais de um tipo de alerta. Diga qual caso foi resolvido: espera de resposta, risco ou insatisfação, contrato ou queda de conversas.' }
    }
    // Uma repetição genérica não resolve o próximo tipo que ficou visível após
    // a supressão anterior: é preciso indicar explicitamente esse outro caso.
    if (anteriores.length && itens.length && !tipoDeclarado) {
      return { ok: true, ja_resolvido: true, cliente: nomeSeguro(cliente.nome), aviso: 'A resolução anterior continua registrada. Há outro tipo de alerta; diga qual novo caso foi resolvido para atualizar.' }
    }
    const tipo = tipoDeclarado ?? args.tipo ?? (tipos.length === 1 ? tipos[0] : undefined)
    if ((!tipo || !itens.some((i) => i.tipo === tipo)) && anteriores.some((i) => !tipo || i.tipo === tipo)) {
      return { ok: true, ja_resolvido: true, cliente: nomeSeguro(cliente.nome), aviso: 'Esse alerta já está marcado como resolvido e continua sem novidade.' }
    }
    if (!tipo || !itens.some((i) => i.tipo === tipo)) return { erro: 'Não há alerta atual desse caso para resolver. Nada foi alterado.' }
    const chave = `${tipo}:${cliente.id}`
    if (ctx.cache?.resolucoes?.has(chave)) return { ok: true, ja_resolvido: true, cliente: nomeSeguro(cliente.nome), tipo }
    const resultado = { cliente: nomeSeguro(cliente.nome), tipo, volta: 'O alerta pode voltar se houver nova mensagem do cliente ou criação/mudança de status de contrato.' }
    if (ctx.simulacao) return { ok: true, simulacao: true, ...resultado, aviso: 'Simulação: nada foi alterado.' }
    if (!(await autorizadoAgora(ctx))) return { erro: 'A autorização mudou durante a consulta. Nada foi resolvido; peça ao administrador para revisar o acesso.' }
    const r = await ctx.admin.from('wa_auto_alertas_ignorados').insert({
      tenant_id: e.tenantId, client_id: cliente.id, contact_id: null, tipo, modo: 'resolvido', ate: null, motivo: motivoServidor(ctx),
    }).select('id').single()
    if (r.error || !r.data?.id) return { erro: 'Não consegui confirmar o registro da resolução. Consulte o alerta novamente antes de repetir.' }
    ctx.cache ??= {}
    ctx.cache.coleta = null
    ctx.cache.resolucoes ??= new Set()
    ctx.cache.resolucoes.add(chave)
    return { ok: true, ...resultado }
  } catch {
    return { erro: 'Não consegui verificar ou registrar a resolução agora. Nada foi confirmado; tente novamente em instantes.' }
  }
}
