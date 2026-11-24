import { contratosDosClientesAtendidos } from './contratos-clientes-atendidos.ts'
// Relatório pessoal do GT3. Recebe os alertas já coletados pelo executor; não
// consulta equipe, conversas, agregados administrativos nem fontes de envio.
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import type { EscopoAgente } from './wa-agente-escopo.ts'
import type { MapaRefs } from './wa-agente-ferramentas.ts'
import type { ColetaAlertas } from './wa-relatorio-dados.ts'
import { situacaoContratual, type SituacaoContratual } from './wa-alertas.ts'
import { nomeSeguro, TIPOS_ANOMALIA, type TipoAnomalia } from './wa-relatorio.ts'
import { podeConsultarAlertasCarteiraGt3, sanitizarTextoCarteiraGt3 } from './iris-gt3-politica.ts'

interface ClienteLido { id: string; tenant_id: string; nome: string | null; ativo: boolean | null }
export interface RelatorioPessoalGt3 {
  total_clientes: number
  pagina: number
  por_pagina: number
  tem_mais: boolean
  clientes: {
    ref: string
    nome: string
    ativo: boolean
    situacao: SituacaoContratual
    alertas: { tipo: TipoAnomalia; detalhe: string; desde?: string }[]
  }[]
  cobertura: { tipos_consultados: TipoAnomalia[]; avisos: string[] }
  aviso: string
}

const TAMANHO_LOTE = 80
const AVISO_COBERTURA = 'Alertas vazios indicam somente que nenhum item foi devolvido pelas fontes consultadas. Não confirmam ausência de risco nem cobertura completa das conversas ou da satisfação.'

function seguro(texto: string | null | undefined, max: number, padrao: string): string {
  return nomeSeguro(sanitizarTextoCarteiraGt3(texto ?? ''), max) ?? padrao
}
function lerLinhas<T>(r: { data: T[] | null; error: unknown }): T[] {
  if (r.error || !Array.isArray(r.data)) throw new Error('Não foi possível conferir os dados do relatório da carteira.')
  return r.data
}

/** IDs e tenant são exclusivamente do escopo do servidor; argumentos só paginam. */
export async function relatorioCarteiraGt3(
  admin: SupabaseClient,
  escopo: EscopoAgente,
  refs: Pick<MapaRefs, 'ref'>,
  coleta: ColetaAlertas | null,
  args: unknown = {},
): Promise<RelatorioPessoalGt3 | { erro: string }> {
  if (escopo.politica !== 'carteira_gt3' || escopo.modo !== 'normal' || !escopo.tenantId) {
    return { erro: 'Não foi possível confirmar o acesso ao relatório da sua carteira.' }
  }
  if (!args || typeof args !== 'object' || Array.isArray(args)
    || Object.keys(args).some((k) => k !== 'pagina' && k !== 'por_pagina')) {
    return { erro: 'Use apenas página e quantidade por página para consultar a sua carteira.' }
  }
  const a = args as Record<string, unknown>
  const pagina = a.pagina ?? 1
  const porPagina = a.por_pagina ?? 50
  if (!Number.isSafeInteger(pagina) || Number(pagina) < 1
    || !Number.isSafeInteger(porPagina) || Number(porPagina) < 1 || Number(porPagina) > 100) {
    return { erro: 'Informe uma página a partir de 1 e de 1 a 100 clientes por página.' }
  }
  const paginaNumero = Number(pagina)
  const tamanho = Number(porPagina)
  const ids = [...escopo.clientIds]
  const autorizados = new Set(ids)
  const clientes = new Map<string, ClienteLido>()
  for (let i = 0; i < ids.length; i += TAMANHO_LOTE) {
    const lote = ids.slice(i, i + TAMANHO_LOTE)
    const linhas = lerLinhas<ClienteLido>(await admin.from('clients').select('id,tenant_id,nome,ativo')
      .eq('tenant_id', escopo.tenantId).in('id', lote).limit(lote.length))
    for (const c of linhas) if (c.tenant_id === escopo.tenantId && autorizados.has(c.id)) clientes.set(c.id, c)
  }
  const lista = [...clientes.values()].map((c) => ({ ...c, nomeSeguro: seguro(c.nome, 100, 'Cliente sem nome') }))
    .sort((x, y) => x.nomeSeguro.localeCompare(y.nomeSeguro, 'pt-BR', { sensitivity: 'base' }) || x.id.localeCompare(y.id))
  const inicio = (paginaNumero - 1) * tamanho
  const daPagina = lista.slice(inicio, inicio + tamanho)
  const idsPagina = new Set(daPagina.map((c) => c.id))
  const statusPorCliente = new Map<string, (string | null)[]>()
  const paginaIds = [...idsPagina]
  const contratos = await contratosDosClientesAtendidos(admin, escopo.tenantId, paginaIds)
  for (const c of contratos) {
    const statuses = statusPorCliente.get(c.cliente_id) ?? []
    statuses.push(c.status)
    statusPorCliente.set(c.cliente_id, statuses)
  }
  const podeAlertas = podeConsultarAlertasCarteiraGt3(escopo)
  const coletaPermitida = podeAlertas ? coleta : null
  const tiposConsultados = TIPOS_ANOMALIA.filter((tipo) => Array.isArray(coletaPermitida?.dados.alertas[tipo]))
  const avisosRecebidos = coletaPermitida && 'avisos' in coletaPermitida && Array.isArray(coletaPermitida.avisos) ? coletaPermitida.avisos : []
  const avisos = avisosRecebidos.filter((x): x is string => typeof x === 'string')
    .map((x) => seguro(x, 500, 'Fonte com cobertura parcial.'))
  if (ids.length > clientes.size) avisos.push('Alguns clientes autorizados não estavam disponíveis no cadastro e ficaram fora desta consulta.')
  if (!podeAlertas) avisos.push('Alertas não consultados: este acesso não possui permissão para consultar alertas.')
  else if (!coletaPermitida) avisos.push('Alertas não consultados: a coleta não foi fornecida nesta execução.')
  else if (!tiposConsultados.length) avisos.push('Nenhum tipo de alerta foi consultado pelas regras disponíveis nesta execução.')
  return {
    total_clientes: lista.length,
    pagina: paginaNumero,
    por_pagina: tamanho,
    tem_mais: inicio + daPagina.length < lista.length,
    clientes: daPagina.filter((c) => autorizados.has(c.id) && c.tenant_id === escopo.tenantId).map((c) => ({
      ref: refs.ref(c.id), nome: c.nomeSeguro, ativo: c.ativo !== false,
      situacao: situacaoContratual(statusPorCliente.get(c.id) ?? []),
      alertas: tiposConsultados.flatMap((tipo) => (coletaPermitida?.dados.alertas[tipo] ?? [])
        .filter((item) => item.client_id === c.id && autorizados.has(item.client_id))
        .map((item) => ({ tipo, detalhe: seguro(item.detalhe, 300, 'Ponto de atenção na fonte consultada.'),
          ...(typeof item.desde === 'string' ? { desde: item.desde } : {}) }))),
    })),
    cobertura: { tipos_consultados: [...tiposConsultados], avisos: [...new Set(avisos)] },
    aviso: lista.length ? AVISO_COBERTURA : `Nenhum cliente autorizado disponível para este relatório. ${AVISO_COBERTURA}`,
  }
}
