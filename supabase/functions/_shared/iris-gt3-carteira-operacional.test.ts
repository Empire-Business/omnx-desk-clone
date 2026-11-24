// Capacidade privada do vínculo GT3: banco falso e qualquer fetch real negado.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  executarFerramenta, ferramentasDisponiveis, MapaRefs, type ContextoFerramentas,
} from './wa-agente-ferramentas.ts'
import type { EscopoAgente } from './wa-agente-escopo.ts'
import type { ColetaAlertas } from './wa-relatorio-dados.ts'
import { coletarAlertasCarteiraGt3 } from './iris-gt3-alertas.ts'
import { fingerprintCarteiraGt3 } from './iris-gt3-politica.ts'
import { criarSupabaseFalso } from './teste-supabase-falso.ts'

const AGORA = new Date('2026-10-27T12:00:00Z')
const T = 'empresa-ficticia'
function escopo(capacidade = true): EscopoAgente {
  return {
    politica: 'carteira_gt3', tenantId: T, userId: 'estrategista-ficticio', modo: 'normal', total: false,
    clientIds: new Set(['meu']), instancias: new Set(['permitida']),
    permissoes: { contratos: false, chat: true, automacoes: false, agregadosRestritos: false, alertasCarteiraGt3: capacidade },
  }
}
function dados() {
  return {
    clients: [
      { tenant_id: T, id: 'meu', nome: 'Cliente Próprio', ativo: true },
      { tenant_id: T, id: 'alheio', nome: 'Cliente de Outra Carteira', ativo: true },
      { tenant_id: 'outra-empresa', id: 'externo', nome: 'Cliente Externo', ativo: true },
    ],
    contratos: [{ tenant_id: T, id: 'contrato', cliente_id: 'meu', status: 'Em andamento', valor_total: 987654, valor_parcela: 123456 }],
  }
}
function coleta(): ColetaAlertas & { avisos: string[] } {
  return {
    dados: { data: '27/10/2026', reunioes: [], alertas: { sem_resposta: [
      { client_id: 'meu', cliente: 'Cliente Próprio', detalhe: 'esperando há 6h' },
      { client_id: 'alheio', cliente: 'Cliente de Outra Carteira', detalhe: 'dado fora da carteira' },
    ] } },
    ocultos: {} as ColetaAlertas['ocultos'], ignorados: [], avisos: ['Cobertura limitada às conversas autorizadas.'],
  }
}
function contexto(e = escopo(), coletarAlertas?: () => Promise<ColetaAlertas>) {
  const falso = criarSupabaseFalso(dados(), { cliente_timeline: () => [], cliente_canais_resumo: () => [] })
  const ctx: ContextoFerramentas = {
    admin: falso.client, escopo: e, agora: AGORA, nomeAgente: 'Íris', refs: new MapaRefs(), urlsVistas: new Set(),
    ...(coletarAlertas ? { deps: { coletarAlertas } } : {}),
  }
  return { ctx, falso }
}

beforeEach(() => { vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('Rede negada neste teste.') })) })
afterEach(() => { vi.unstubAllGlobals() })

describe('capacidade operacional privada do GT3 sem grant geral de automações', () => {
  it('capacidade do vínculo oferece alertas e relatório sem conceder automações gerais', () => {
    const e = escopo()
    const nomes = ferramentasDisponiveis(e).map((d) => d.function.name)
    expect(nomes).toContain('listar_alertas')
    expect(nomes).toContain('relatorio_carteira')
    expect(nomes).not.toContain('financeiro_resumo')
    expect(nomes).not.toContain('carteira_equipe')
    expect(nomes).not.toContain('equipe_resumo')
    expect(nomes).not.toContain('ajustar_relatorio')
    expect(e.permissoes.automacoes).toBe(false)
    expect(e.permissoes.contratos).toBe(false)
    expect(e.permissoes.agregadosRestritos).toBe(false)
  })

  it('capacidade permite executar alertas somente da carteira', async () => {
    const coletar = vi.fn(async () => coleta())
    const { ctx, falso } = contexto(escopo(), coletar)
    const r = await executarFerramenta('listar_alertas', {}, ctx)
    expect(coletar).toHaveBeenCalledOnce()
    expect(r.total).toBe(1)
    expect(JSON.stringify(r)).toContain('Cliente Próprio')
    expect(JSON.stringify(r)).not.toMatch(/Outra Carteira|fora da carteira|987654|123456/)
    expect(ctx.escopo.permissoes.automacoes).toBe(false)
    expect(falso.inseridos).toEqual([])
    expect(falso.atualizados).toEqual([])
    expect(fetch).not.toHaveBeenCalled()
  })

  it('relatório consulta a coleta privada mesmo com automações gerais desligadas', async () => {
    const coletar = vi.fn(async () => coleta())
    const { ctx, falso } = contexto(escopo(), coletar)
    const r = await executarFerramenta('relatorio_carteira', {}, ctx)
    expect(coletar).toHaveBeenCalledOnce()
    expect(r.total_clientes).toBe(1)
    expect(JSON.stringify(r)).toContain('esperando há 6h')
    expect(JSON.stringify(r)).not.toMatch(/Outra Carteira|Cliente Externo|987654|123456/)
    expect(ctx.escopo.permissoes.automacoes).toBe(false)
    expect(falso.consultas.every((q) => q.filtros.includes('eq:tenant_id'))).toBe(true)
    expect(falso.inseridos).toEqual([])
    expect(falso.atualizados).toEqual([])
    expect(fetch).not.toHaveBeenCalled()
  })

  it('sem capacidade nem permissão geral, alertas não são oferecidos nem executados', async () => {
    const coletar = vi.fn(async () => coleta())
    const { ctx, falso } = contexto(escopo(false), coletar)
    const nomes = ferramentasDisponiveis(ctx.escopo).map((d) => d.function.name)
    expect(nomes).not.toContain('listar_alertas')
    const r = await executarFerramenta('listar_alertas', {}, ctx)
    expect(r.erro).toBeTruthy()
    expect(coletar).not.toHaveBeenCalled()
    expect(falso.consultas).toEqual([])
  })

  it('sem capacidade, relatório básico não consulta nem inclui alertas', async () => {
    const coletar = vi.fn(async () => coleta())
    const { ctx } = contexto(escopo(false), coletar)
    const r = await executarFerramenta('relatorio_carteira', {}, ctx)
    expect(r.total_clientes).toBe(1)
    expect(coletar).not.toHaveBeenCalled()
    expect(JSON.stringify(r)).toContain('Cliente Próprio')
    expect(JSON.stringify(r)).not.toContain('esperando há 6h')
    expect(JSON.stringify(r)).toMatch(/Alertas não consultados/)
  })

  it.each(['listar_alertas', 'relatorio_carteira'])('argumentos forjados em %s não ligam capacidade ou permissão', async (nome) => {
    const coletar = vi.fn(async () => coleta())
    const { ctx } = contexto(escopo(false), coletar)
    const permissoesAntes = { ...ctx.escopo.permissoes }
    const r = await executarFerramenta(nome, {
      alertasCarteiraGt3: true, automacoes: true, agregadosRestritos: true,
      tenant_id: 'outra-empresa', client_ids: ['alheio'],
      escopo: { politica: 'carteira_gt3', permissoes: { alertasCarteiraGt3: true } },
    }, ctx)
    expect(r.erro).toBeTruthy()
    expect(coletar).not.toHaveBeenCalled()
    expect(ctx.escopo.permissoes).toEqual(permissoesAntes)
    expect([...ctx.escopo.clientIds]).toEqual(['meu'])
    expect(ctx.escopo.tenantId).toBe(T)
  })

  it('capacidade GT3 não libera alertas nem relatório no WhatsApp normal', async () => {
    const coletar = vi.fn(async () => coleta())
    const e: EscopoAgente = { ...escopo(), politica: undefined }
    const { ctx, falso } = contexto(e, coletar)
    const nomes = ferramentasDisponiveis(e).map((d) => d.function.name)
    expect(nomes).not.toContain('listar_alertas')
    expect(nomes).not.toContain('relatorio_carteira')
    for (const nome of ['listar_alertas', 'relatorio_carteira']) {
      expect((await executarFerramenta(nome, {}, ctx)).erro).toBeTruthy()
    }
    expect(coletar).not.toHaveBeenCalled()
    expect(falso.consultas).toEqual([])
  })

  it('modo restrito continua só ajuda, mesmo com capacidade GT3', async () => {
    const coletar = vi.fn(async () => coleta())
    const { ctx, falso } = contexto({ ...escopo(), modo: 'restrito' }, coletar)
    expect(ferramentasDisponiveis(ctx.escopo).map((d) => d.function.name)).toEqual(['ajuda'])
    expect((await executarFerramenta('relatorio_carteira', {}, ctx)).erro).toBeTruthy()
    expect((await executarFerramenta('listar_alertas', {}, ctx)).erro).toBeTruthy()
    expect(coletar).not.toHaveBeenCalled()
    expect(falso.consultas).toEqual([])
  })

  it('ferramentas de empresa continuam recusadas mesmo forçadas pelo modelo', async () => {
    const coletar = vi.fn(async () => coleta())
    const { ctx, falso } = contexto(escopo(), coletar)
    for (const nome of ['financeiro_resumo', 'carteira_equipe', 'equipe_resumo', 'ajustar_relatorio', 'registrar_aprendizado']) {
      expect((await executarFerramenta(nome, {}, ctx)).erro).toBeTruthy()
    }
    expect(coletar).not.toHaveBeenCalled()
    expect(falso.consultas).toEqual([])
    expect(falso.inseridos).toEqual([])
    expect(falso.atualizados).toEqual([])
  })

  it('mudança da capacidade altera o fingerprint sem modificar automações gerais', async () => {
    const base = {
      conexaoId: 'conexao-ficticia', conexaoRevisao: 1, vinculoId: 'vinculo-ficticio', vinculoRevisao: 1,
      clientes: ['meu'], instancias: ['permitida'],
    }
    const sem = await fingerprintCarteiraGt3({ ...base, permissoes: { ...escopo(false).permissoes } })
    const com = await fingerprintCarteiraGt3({ ...base, permissoes: { ...escopo().permissoes } })
    expect(sem).not.toBe(com)
    expect(escopo(false).permissoes.automacoes).toBe(false)
    expect(escopo().permissoes.automacoes).toBe(false)
  })
})

describe('coleta privada por proveniência com capacidade do vínculo', () => {
  it('só lê a conversa autorizada, mantendo instâncias, restritos, tenant e agregados fechados', async () => {
    const chamadas: Record<string, unknown>[] = []
    const e = escopo()
    const f = criarSupabaseFalso({
      ...dados(),
      chat_messages: [
        { tenant_id: T, id: 'm', conversation_id: 'visivel' },
        { tenant_id: T, id: 'mp', conversation_id: 'proibida' },
        { tenant_id: T, id: 'mr', conversation_id: 'restrita' },
        { tenant_id: 'outra-empresa', id: 'me', conversation_id: 'externa' },
      ],
      chat_conversations: ['visivel', 'proibida', 'restrita', 'externa'].map((id) => ({
        tenant_id: id === 'externa' ? 'outra-empresa' : T, id, contact_id: id,
        ultima_msg_cliente_em: '2026-10-27T06:00:00Z', aguardando_resposta: true,
        arquivada: false, status: 'aberta', silenciado: false, sentimento: 'neutro',
      })),
      chat_contacts: ['visivel', 'proibida', 'restrita', 'externa'].map((id) => ({
        tenant_id: id === 'externa' ? 'outra-empresa' : T, id,
        instance_id: id === 'proibida' ? 'nao-permitida' : 'permitida', restrito_admin: id === 'restrita', bloqueado: false,
      })),
      wa_auto_alertas_ignorados: [], contratos_audit_log: [],
    }, { cliente_timeline: (args) => {
      chamadas.push(args)
      // Simula IDs antigos/indevidos para verificar também o recheck defensivo.
      return ['m', 'mp', 'mr', 'me'].map((message_id) => ({ message_id }))
    } })
    const r = await coletarAlertasCarteiraGt3(f.client, e, [{ tipo: 'sem_resposta', ativo: true, limiar: 4 }], AGORA)
    expect(chamadas).toEqual([expect.objectContaining({ p_tenant: T, p_client: 'meu', p_instancias: ['permitida'] })])
    expect(r.dados.alertas.sem_resposta?.map((a) => a.conversation_id)).toEqual(['visivel'])
    expect(f.consultas.every((q) => q.filtros.includes('eq:tenant_id'))).toBe(true)
    expect(f.consultas.some((q) => ['cliente_relacionamento', 'wa_auto_satisfacao', 'chat_weekly_reports', 'meetings', 'users'].includes(q.tabela))).toBe(false)
    expect(e.permissoes.automacoes).toBe(false)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('a mesma coleta falha fechada fora da política GT3 apesar da capacidade no objeto', async () => {
    const f = criarSupabaseFalso(dados())
    await expect(coletarAlertasCarteiraGt3(f.client, { ...escopo(), politica: undefined }, [], AGORA)).rejects.toThrow()
    expect(f.consultas).toEqual([])
  })
})
