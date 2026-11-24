import { contratosDosClientesAtendidos } from './contratos-clientes-atendidos.ts'
// Consulta cadastral em lote. Somente leitura; nomes não concedem carteira.
// A contagem completa impede tratar uma página truncada como busca inequívoca.
import type { ContextoFerramentas } from './wa-agente-ferramentas.ts'
import { podeVerCliente, podeVerSemCliente, type EscopoAgente } from './wa-agente-escopo.ts'
import { registros } from './wa-agente-ferr-acoes-cadastro.ts'
import { chaveNome } from './wa-alertas.ts'
import { nomeSeguro } from './wa-relatorio.ts'

type Linha = Record<string, unknown>
const FERRAMENTA = 'consultar_situacao_clientes'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const normalizar = (v: unknown) => typeof v === 'string' ? chaveNome(v).trim() : ''
const texto = (v: unknown, max = 160) => typeof v === 'string' ? nomeSeguro(v, max) : null
const data = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null
const permitido = (e: EscopoAgente) => e.modo === 'normal' && e.politica !== 'carteira_gt3'

function argumentos(v: unknown): string[] | null {
  if (typeof v === 'string') { try { v = JSON.parse(v) } catch { return null } }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const a = v as Linha
  if (Object.keys(a).join(',') !== 'clientes' || !Array.isArray(a.clientes)
    || a.clientes.length < 1 || a.clientes.length > 20) return null
  const nomes: string[] = []
  for (const nome of a.clientes) {
    if (typeof nome !== 'string' || nome.trim().length < 2 || nome.trim().length > 160 || UUID.test(nome.trim())
      || /[\r\n<>\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/.test(nome)) return null
    nomes.push(nome.trim())
  }
  return new Set(nomes.map(normalizar)).size === nomes.length ? nomes : null
}

export function ferramentasSituacaoLote(e: EscopoAgente) {
  if (!permitido(e)) return []
  return [{ type: 'function' as const, function: {
    name: FERRAMENTA,
    description: 'Confere até 20 nomes completos de clientes em uma chamada: cadastro ativo/inativo, contratos por vínculo ou possível legado por nome e responsáveis operacionais. Busca exata, sem escolher entre duplicados. Mostra divergências para conferência; não altera dados, não mostra valores e não presume contrato encerrado pela data. Cliente ativo não comprova vigência contratual.',
    parameters: { type: 'object', additionalProperties: false, required: ['clientes'], properties: {
      clientes: { type: 'array', minItems: 1, maxItems: 20, uniqueItems: true,
        items: { type: 'string', minLength: 2, maxLength: 160 }, description: 'Nomes completos dos clientes, sem IDs.' },
    } },
  } }]
}

async function ler(ctx: ContextoFerramentas, tabela: string, colunas: string): Promise<Linha[]> {
  const linhas = await registros(ctx, tabela, `tenant_id,${colunas}`)
  if (linhas.some(l => l.tenant_id !== ctx.escopo.tenantId)) throw new Error('tenant inválido')
  return linhas
}

function projetarContrato(k: Linha, cliente: Linha, operacionais: Linha[], pessoas: Map<string, Linha>) {
  const legado = k.cliente_id === null
  const adicional = k.cliente_adicional === true
  const estrategista = typeof k.estrategista_id === 'string' ? pessoas.get(k.estrategista_id) : undefined
  const motivos: string[] = []
  if (legado) motivos.push('contrato_sem_vinculo_confirmado')
  if (!legado && !adicional && normalizar(k.cliente_nome) && normalizar(k.cliente_nome) !== normalizar(cliente.nome)) {
    motivos.push('nome_do_contrato_difere_do_cadastro')
  }
  if (cliente.ativo === false && ['ativo', 'vigente'].includes(normalizar(k.status))) {
    motivos.push('cliente_inativo_com_status_contratual_ativo')
  }
  if (!legado && typeof k.estrategista_id === 'string'
    && !operacionais.some(a => a.tipo === 'estrategista' && a.user_id === k.estrategista_id)) {
    motivos.push('responsavel_contratual_sem_vinculo_operacional_ativo')
  }
  return {
    fonte: adicional ? 'cliente_adicional' : legado ? 'nome_legado_sem_vinculo' : 'vinculo_cliente',
    ...(adicional ? { aviso: 'Cliente atendido por contrato compartilhado; dados do titular e financeiros não exibidos.' } : {}),
    vinculo_confirmado: !legado,
    cliente_nome_registrado: adicional ? null : texto(k.cliente_nome),
    produto: texto(k.produto_nome), status: texto(k.status, 80), status_secundario: texto(k.status_secundario, 80),
    data_assinatura: data(k.data_assinatura), data_fechamento: data(k.data_fechamento),
    plano_dias: Number.isSafeInteger(k.plano_dias) && Number(k.plano_dias) >= 0 ? k.plano_dias : null,
    estrategista_nome: texto(estrategista?.nome) ?? texto(k.estrategista_nome_raw),
    estrategista_nome_origem: estrategista ? 'usuario_vinculado' : texto(k.estrategista_nome_raw) ? 'texto_legado' : 'nao_informado',
    cadastros_divergentes: motivos.length > 0,
    motivos_divergencia: motivos,
  }
}

export async function executarSituacaoLote(nome: string, bruto: unknown, ctx: ContextoFerramentas): Promise<Linha | null> {
  if (nome !== FERRAMENTA) return null
  if (!permitido(ctx.escopo)) return { erro: 'Consulta em lote indisponível neste canal ou escopo.' }
  const nomes = argumentos(bruto)
  if (!nomes) return { erro: 'Informe de 1 a 20 nomes completos diferentes em clientes, sem outros campos.' }
  try {
    const clientes = (await ler(ctx, 'clients', 'id,nome,ativo'))
      .filter(c => podeVerCliente(ctx.escopo, String(c.id)))
    const selecoes = nomes.map(nomePedido => ({ nomePedido,
      candidatos: clientes.filter(c => normalizar(c.nome) === normalizar(nomePedido)) }))
    const unicos = new Set(selecoes.filter(s => s.candidatos.length === 1).map(s => String(s.candidatos[0].id)))
    // Só há projeção de contratos/pessoas depois de resolver a carteira.
    const [contratosLidos, atribuicoesLidas, atendidos] = unicos.size ? await Promise.all([
      ler(ctx, 'contratos', 'id,cliente_id,cliente_nome,produto_nome,status,status_secundario,data_assinatura,data_fechamento,plano_dias,estrategista_id,estrategista_nome_raw'),
      ler(ctx, 'client_assignments', 'id,client_id,user_id,tipo,ativo'),
      contratosDosClientesAtendidos(ctx.admin, ctx.escopo.tenantId, [...unicos]),
    ]) : [[], [], []]
    const contratos = contratosLidos.filter(k => typeof k.cliente_id === 'string'
      ? unicos.has(k.cliente_id) && podeVerCliente(ctx.escopo, k.cliente_id)
      : k.cliente_id === null && podeVerSemCliente(ctx.escopo)
        && selecoes.some(s => s.candidatos.length === 1 && normalizar(k.cliente_nome) === normalizar(s.candidatos[0].nome)))
    // Somente campos operacionais. Não copiar nome, documentos ou responsáveis
    // do titular para o cadastro do beneficiário adicional.
    contratos.push(...atendidos.filter(k => !k.principal).map(k => ({
      id: k.id, cliente_id: k.cliente_id, cliente_adicional: true,
      produto_nome: k.produto_nome, status: k.status, status_secundario: k.status_secundario,
      data_assinatura: k.data_assinatura, data_fechamento: k.data_fechamento, plano_dias: k.plano_dias,
    })))
    const atribuicoes = atribuicoesLidas.filter(a => typeof a.client_id === 'string' && unicos.has(a.client_id)
      && podeVerCliente(ctx.escopo, a.client_id) && a.ativo === true && ['estrategista', 'atendimento'].includes(String(a.tipo)))
    const idsPessoas = new Set([...contratos.map(k => k.estrategista_id), ...atribuicoes.map(a => a.user_id)]
      .filter((id): id is string => typeof id === 'string'))
    const pessoas = new Map((idsPessoas.size ? await ler(ctx, 'users', 'id,nome,ativo') : [])
      .filter(u => idsPessoas.has(String(u.id))).map(u => [String(u.id), u]))
    const resultados = selecoes.map(({ nomePedido, candidatos }) => {
      const pedido_nome = texto(nomePedido)
      if (!candidatos.length) return { pedido_nome, resultado: 'nao_encontrado',
        aviso: 'Não encontrei esse nome exato na carteira autorizada.' }
      if (candidatos.length > 1) return { pedido_nome, resultado: 'ambiguo', quantidade_cadastros: candidatos.length,
        candidatos: candidatos.slice(0, 10).map(c => ({ ref: ctx.refs.ref(String(c.id)), nome: texto(c.nome), ativo: typeof c.ativo === 'boolean' ? c.ativo : null })),
        candidatos_exibidos_completos: candidatos.length <= 10,
        aviso: 'Há cadastros duplicados. Nenhum foi escolhido e nenhum contrato foi associado por nome.' }
      const c = candidatos[0]
      const atuais = atribuicoes.filter(a => a.client_id === c.id)
      const ks = contratos.filter(k => k.cliente_id === c.id || (k.cliente_id === null && normalizar(k.cliente_nome) === normalizar(c.nome)))
      return { pedido_nome, resultado: 'encontrado', ref: ctx.refs.ref(String(c.id)),
        cliente: { nome: texto(c.nome), ativo: typeof c.ativo === 'boolean' ? c.ativo : null },
        responsaveis_operacionais: atuais.slice(0, 20).map(a => ({ tipo: a.tipo,
          nome: texto(pessoas.get(String(a.user_id))?.nome),
          usuario_ativo: typeof pessoas.get(String(a.user_id))?.ativo === 'boolean' ? pessoas.get(String(a.user_id))?.ativo : null })),
        responsaveis_encontrados: atuais.length, responsaveis_exibidos_completos: atuais.length <= 20,
        mais_de_um_estrategista_operacional: atuais.filter(a => a.tipo === 'estrategista').length > 1,
        contratos: ks.slice(0, 20).map(k => projetarContrato(k, c, atuais, pessoas)),
        contratos_encontrados: ks.length, contratos_exibidos_completos: ks.length <= 20,
      }
    })
    return { resultados, aviso: 'Cliente ativo é situação cadastral, não comprovação de contrato vigente. Os status e as datas são os registros atuais; data antiga ou prazo do plano não prova encerramento. Responsável operacional e responsável contratual são cadastros separados; divergências precisam de conferência.',
      contratos_legados_por_nome: podeVerSemCliente(ctx.escopo)
        ? 'Possíveis associações por nome, sem vínculo confirmado; não são contratos canônicos do cliente.'
        : 'Contratos sem vínculo de cliente não são exibidos para carteira parcial.' }
  } catch {
    return { erro: 'Não consegui conferir os cadastros completos. A consulta pode estar incompleta ou indisponível; não foi concluída nenhuma avaliação dos clientes.' }
  }
}
