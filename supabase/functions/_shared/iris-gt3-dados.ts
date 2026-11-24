import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { carregarEscopo, type EscopoAgente } from './wa-agente-escopo.ts'
import { fingerprintCarteiraGt3, podeConsultarAlertasCarteiraGt3, sanitizarTextoCarteiraGt3 } from './iris-gt3-politica.ts'
import { carregarOpcoesRelatorio, carregarRegras, coletarAlertas } from './wa-relatorio-dados.ts'
import { coletarAlertasCarteiraGt3, coletarAlertasPessoaisGt3 } from './iris-gt3-alertas.ts'
import { FUSO_PADRAO, nomeSeguro, ROTULO_TIPO, type TipoAnomalia, type DadosRelatorio } from './wa-relatorio.ts'

export class ErroIrisGt3 extends Error {
  status: number; codigo: string
  constructor(status: number, codigo: string, texto: string) { super(texto); this.status = status; this.codigo = codigo }
}
export interface ConexaoIrisGt3 { id: string; tenant_id: string; workspace_id: string; ativo: boolean; revisao: number; expires_at: string; revoked_at: string | null }
export interface VinculoIrisGt3 { id: string; tenant_id: string; connection_id: string; gt3_user_id: string; desk_user_id: string; ativo: boolean; modo_teste: boolean; revisao: number }
export const UUID_GT3 = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
export function exigirUuid(v: unknown): string {
  if (typeof v !== 'string' || !UUID_GT3.test(v)) throw new ErroIrisGt3(400, 'parametros_invalidos', 'Identificador inválido.')
  return v
}
export function exigirLeitura<T>(r: { data: T | null; error: unknown }): T {
  if (r.error) throw new ErroIrisGt3(503, 'dados_indisponiveis', 'Não foi possível conferir os acessos da Íris. Tente novamente.')
  return r.data as T
}
export function primeiraLinha<T>(data: T | T[] | null): T | null { return Array.isArray(data) ? data[0] ?? null : data }
export async function sha256Iris(v: string): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v))
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
export function segredoIris(prefixo: 'iris_' | 'gt3c_'): string {
  return prefixo + btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function listaCompletaEstrategistas(
  leitura: { data: unknown; error: unknown }, total: { count: number | null; error: unknown }, limite: number,
): Record<string, unknown>[] {
  const indisponivel = () => new ErroIrisGt3(503, 'dados_indisponiveis', 'Não foi possível conferir a lista completa de estrategistas. Tente novamente.')
  if (leitura.error || total.error || typeof total.count !== 'number' || !Number.isInteger(total.count) || total.count < 0) throw indisponivel()
  if (total.count > limite) throw new ErroIrisGt3(422, 'lista_limite', 'A lista de estrategistas precisa ser revisada pela administração.')
  if (!Array.isArray(leitura.data) || leitura.data.length !== total.count) throw indisponivel()
  return leitura.data.map((linha: unknown) => {
    if (!linha || typeof linha !== 'object' || Array.isArray(linha)) throw indisponivel()
    return linha as Record<string, unknown>
  })
}

/** Candidatos administrativos; não concede carteira nem altera o escopo GT3. */
export async function carregarEstrategistasGt3(admin: SupabaseClient, tenantId: string): Promise<{ id: string; nome: string }[]> {
  const atribuicoes = (head = false) => admin.from('client_assignments').select('user_id', head ? { count: 'exact', head: true } : undefined)
    .eq('tenant_id', tenantId).eq('tipo', 'estrategista').eq('ativo', true)
  const [totalAtribuicoes, leituraAtribuicoes] = await Promise.all([atribuicoes(true), atribuicoes().limit(5001)])
  const ids = new Set<string>()
  for (const a of listaCompletaEstrategistas(leituraAtribuicoes, totalAtribuicoes, 5000)) {
    if (typeof a.user_id !== 'string' || !UUID_GT3.test(a.user_id)) throw new ErroIrisGt3(503, 'dados_indisponiveis', 'Não foi possível conferir os estrategistas atribuídos.')
    ids.add(a.user_id)
  }
  const candidatos = new Map<string, { id: string; nome: string }>()
  const carregarUsuarios = async (atribuidos?: string[]) => {
    const usuarios = (head = false) => {
      const q = admin.from('users').select('id,nome', head ? { count: 'exact', head: true } : undefined)
        .eq('tenant_id', tenantId).eq('ativo', true).neq('perfil', 'cliente')
      return atribuidos ? q.in('id', atribuidos) : q.in('perfil', ['admin', 'gerente', 'estrategista'])
    }
    const limite = atribuidos ? atribuidos.length : 200
    const [total, leitura] = await Promise.all([usuarios(true), usuarios().limit(limite + 1)])
    for (const u of listaCompletaEstrategistas(leitura, total, limite)) {
      if (typeof u.id !== 'string' || !UUID_GT3.test(u.id) || typeof u.nome !== 'string') throw new ErroIrisGt3(503, 'dados_indisponiveis', 'Não foi possível conferir os nomes dos estrategistas.')
      candidatos.set(u.id, { id: u.id, nome: nomeSeguro(u.nome, 80) ?? 'Estrategista' })
    }
    if (candidatos.size > 200) throw new ErroIrisGt3(422, 'lista_limite', 'A lista de estrategistas precisa ser revisada pela administração.')
  }
  await carregarUsuarios()
  const legados = [...ids].filter((id) => !candidatos.has(id))
  for (let i = 0; i < legados.length; i += 80) await carregarUsuarios(legados.slice(i, i + 80))
  return [...candidatos.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR') || a.id.localeCompare(b.id))
}

export function carteiraLimitadaGt3(base: EscopoAgente, atribuicoes: readonly string[], alertasPessoais = false): EscopoAgente {
  if (base.modo !== 'normal') throw new ErroIrisGt3(403, 'escopo_indisponivel', 'Não foi possível confirmar a carteira autorizada.')
  const clientIds = new Set(atribuicoes.filter((id) => base.total || base.clientIds.has(id)))
  return {
    tenantId: base.tenantId, userId: base.userId, modo: 'normal', politica: 'carteira_gt3', total: false, clientIds,
    permissoes: { contratos: false, chat: base.permissoes.chat === true, automacoes: base.permissoes.automacoes === true,
      alertasCarteiraGt3: alertasPessoais, agregadosRestritos: base.permissoes.agregadosRestritos === true,
      onboarding: false, atendimento: false, comissoes: false },
    instancias: base.instancias,
  }
}
export async function carregarCarteiraGt3(admin: SupabaseClient, c: ConexaoIrisGt3, v: VinculoIrisGt3) {
  const user = exigirLeitura(await admin.from('users').select('id,nome,ativo,perfil').eq('tenant_id', c.tenant_id).eq('id', v.desk_user_id).maybeSingle()) as { id: string; nome: string; ativo: boolean; perfil: string } | null
  if (!user?.ativo || !v.ativo || v.tenant_id !== c.tenant_id || v.connection_id !== c.id) throw new ErroIrisGt3(403, 'vinculo_inativo', 'Seu acesso à Íris está pausado ou não foi cadastrado.')
  const atribuicoes = exigirLeitura(await admin.from('client_assignments').select('client_id').eq('tenant_id', c.tenant_id).eq('user_id', v.desk_user_id).eq('tipo', 'estrategista').eq('ativo', true).limit(1001)) as { client_id: string }[]
  if (atribuicoes.length > 1000) throw new ErroIrisGt3(422, 'carteira_limite', 'A carteira precisa ser revisada pela administração.')
  const base = await carregarEscopo(admin, c.tenant_id, v.desk_user_id)
  // Espelha a condição de pode_ver_restrito (perfil, ativo e tenant) E a RLS
  // de cliente_relacionamento. Carteira/ver e instâncias=null não bastam.
  const perfilPrivilegiado = ['admin', 'gerente'].includes(user.perfil)
  const profile = perfilPrivilegiado ? exigirLeitura(await admin.from('profiles').select('user_id').eq('user_id', v.desk_user_id).eq('tenant_id', c.tenant_id).maybeSingle()) : null
  const podeRestrito = perfilPrivilegiado && !!profile
  const adminAlertas = podeRestrito ? exigirLeitura(await admin.rpc('has_permissao_de', { p_user_id: v.desk_user_id, p_recurso: 'automacoes-wa', p_acao: 'admin' })) === true : false
  base.permissoes = { ...base.permissoes, agregadosRestritos: podeRestrito && adminAlertas }
  // Capacidade própria deste canal, concedida pelo vínculo atual validado. Não
  // altera grants de painel, perfil ou fontes administrativas do estrategista.
  const alertasPessoais = c.ativo && !c.revoked_at && Date.parse(c.expires_at) > Date.now()
  const escopo = carteiraLimitadaGt3(base, atribuicoes.map((a) => a.client_id), alertasPessoais)
  const ids = [...escopo.clientIds]
  const clientes: { id: string; nome: string }[] = []
  for (let i = 0; i < ids.length; i += 80) {
    clientes.push(...exigirLeitura(await admin.from('clients').select('id,nome').eq('tenant_id', c.tenant_id).in('id', ids.slice(i, i + 80)).limit(80)) as { id: string; nome: string }[])
  }
  // Registro removido não fica na carteira/fingerprint nem abre referência.
  escopo.clientIds = new Set(clientes.map((x) => x.id))
  const revisoesCarteira = [] as { clientId: string; revisao: number }[]
  const idsAtuais = [...escopo.clientIds]
  for (let i = 0; i < idsAtuais.length; i += 80) {
    const lote = idsAtuais.slice(i, i + 80)
    const r = await admin.from('client_assignment_state').select('client_id,revisao', { count: 'exact' })
      .eq('tenant_id', c.tenant_id).in('client_id', lote).limit(lote.length)
    const linhas = exigirLeitura(r) as { client_id: string; revisao: number }[]
    if (!Array.isArray(linhas) || r.count == null || linhas.length !== r.count) throw new ErroIrisGt3(503, 'dados_indisponiveis', 'Não foi possível conferir a revisão completa da carteira.')
    const versoes = new Map<string, number>()
    for (const linha of linhas) {
      if (!lote.includes(linha.client_id) || !Number.isSafeInteger(linha.revisao) || linha.revisao < 0 || versoes.has(linha.client_id)) throw new ErroIrisGt3(503, 'dados_indisponiveis', 'Não foi possível conferir a revisão da carteira.')
      versoes.set(linha.client_id, linha.revisao)
    }
    // Um cliente legado pode ainda não ter estado. Erro/truncamento jamais vira0.
    for (const clientId of lote) revisoesCarteira.push({ clientId, revisao: versoes.get(clientId) ?? 0 })
  }
  const scope_hash = await fingerprintCarteiraGt3({ conexaoId: c.id, conexaoRevisao: Number(c.revisao), vinculoId: v.id, vinculoRevisao: Number(v.revisao), clientes: [...escopo.clientIds], revisoesCarteira, permissoes: { ...escopo.permissoes }, instancias: escopo.instancias ? [...escopo.instancias] : null })
  return { escopo, scope_hash, desk_user_nome: nomeSeguro(user.nome, 80) ?? 'Estrategista', clientes: clientes.map((x) => ({ id: x.id, nome: nomeSeguro(x.nome, 100) ?? 'Cliente' })) }
}

export async function resumoCarteiraGt3(admin: SupabaseClient, escopo: EscopoAgente, tipos: readonly TipoAnomalia[], agora = new Date()) {
  if (!podeConsultarAlertasCarteiraGt3(escopo)) throw new ErroIrisGt3(403, 'sem_permissao_alertas', 'Não foi possível confirmar o acesso aos alertas da sua carteira.')
  if (!escopo.clientIds.size) return { texto: 'Não há clientes na sua carteira autorizada.', tem_alertas: false }
  if (!escopo.permissoes.automacoes) {
    const coleta = await coletarAlertasPessoaisGt3(admin, escopo, agora, FUSO_PADRAO, tipos)
    return formatarResumoCarteiraGt3(coleta.dados, escopo.clientIds, tipos, coleta.avisos)
  }
  const [regras, opcoes] = await Promise.all([carregarRegras(admin, escopo.tenantId), carregarOpcoesRelatorio(admin, escopo.tenantId)])
  const filtradas = regras.filter((r) => tipos.includes(r.tipo))
  const config = { ...opcoes, agruparPorEstrategista: false }
  const coleta = escopo.permissoes.agregadosRestritos === true
    ? await coletarAlertas(admin, escopo.tenantId, filtradas, agora, FUSO_PADRAO, config)
    : await coletarAlertasCarteiraGt3(admin, escopo, filtradas, agora, FUSO_PADRAO, config)
  const avisos = 'avisos' in coleta && Array.isArray(coleta.avisos) ? coleta.avisos as string[] : []
  return formatarResumoCarteiraGt3(coleta.dados, escopo.clientIds, tipos, avisos)
}

export function formatarResumoCarteiraGt3(dados: Pick<DadosRelatorio, 'data' | 'alertas'>, clientIds: ReadonlySet<string>, tipos: readonly TipoAnomalia[], avisos: readonly string[] = []) {
  const itens = (['sentimento_negativo', 'sem_resposta', 'pendencia', 'queda_volume'] as const).flatMap((tipo) => {
    if (!tipos.includes(tipo)) return []
    return (dados.alertas[tipo] ?? []).filter((i) => !!i.client_id && clientIds.has(i.client_id)).map((i) => ({ tipo, item: i }))
  })
  const cobertura = avisos.length ? `\n\nLimites da consulta:\n${avisos.map((a) => `• ${sanitizarTextoCarteiraGt3(a)}`).join('\n')}` : ''
  // Uma limitação não equivale a "está tudo bem". O aviso é entregue mesmo
  // sem itens, com contagem e natureza explicitamente separadas no texto.
  if (!itens.length) return { texto: `Aviso da sua carteira — ${dados.data}\nNenhum alerta encontrado nas fontes consultadas.${cobertura}`, tem_alertas: avisos.length > 0, cobertura_parcial: avisos.length > 0 }
  const seguro = (valor: string | null | undefined, max: number, padrao: string) => nomeSeguro(sanitizarTextoCarteiraGt3(valor ?? ''), max) ?? padrao
  const linhas = itens.slice(0, 40).map(({ tipo, item }) => `• ${seguro(item.cliente, 100, 'Cliente')} — ${tipo === 'sentimento_negativo' && item.nivel === 'risco' ? 'em risco' : ROTULO_TIPO[tipo]}: ${seguro(item.detalhe, 220, 'precisa de acompanhamento')}`)
  return { texto: `Aviso da sua carteira — ${dados.data}\nBom dia! ${itens.length} ponto(s) de atenção nos seus clientes:\n\n${linhas.join('\n')}${itens.length > 40 ? '\nHá mais alertas na sua carteira.' : ''}${cobertura}\n\nPode me perguntar sobre esses clientes aqui.`, tem_alertas: true, cobertura_parcial: avisos.length > 0 }
}
