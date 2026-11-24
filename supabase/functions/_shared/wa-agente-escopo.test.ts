import { describe, expect, it } from 'vitest'
import {
  type EscopoAgente, carregarEscopo, chaveParticipante, classificarParticipantes, escopoAcessoTotal, escopoDoGrupo,
  escopoRestrito, intersecaoCarteiras, lerEscopoRpc, participantesDoGrupoInfo, permissoesMinimas, podeVerCliente,
  podeVerSemCliente, intersecaoInstancias, podeVerInstancia, instanciasParaRpc,
} from './wa-agente-escopo.ts'
import { chaveTelefone } from './telefone.ts'
import { criarSupabaseFalso } from './teste-supabase-falso.ts'

const T = 'tenant-1'
const GRUPO = '120363000000000001@g.us'

function normal(p: Partial<EscopoAgente> = {}): EscopoAgente {
  return {
    tenantId: T, userId: 'u1', modo: 'normal', total: false, clientIds: new Set(['c1', 'c2']),
    permissoes: { contratos: true, chat: true, automacoes: true }, ...p,
  }
}

describe('podeVerCliente / podeVerSemCliente', () => {
  it('carteira parcial: só os clientes dela', () => {
    const e = normal()
    expect(podeVerCliente(e, 'c1')).toBe(true)
    expect(podeVerCliente(e, 'c9')).toBe(false)
    expect(podeVerCliente(e, null)).toBe(false)
    expect(podeVerSemCliente(e)).toBe(false)
  })
  it('carteira total vê todos, inclusive itens sem cliente', () => {
    const e = normal({ total: true, clientIds: new Set() })
    expect(podeVerCliente(e, 'qualquer')).toBe(true)
    expect(podeVerSemCliente(e)).toBe(true)
  })
  it('restrito não vê nada', () => {
    const e = escopoRestrito(T, 'u1', 'participante_externo')
    expect(podeVerCliente(e, 'c1')).toBe(false)
    expect(podeVerSemCliente(e)).toBe(false)
    expect(e.permissoes).toMatchObject({ contratos: false, chat: false, automacoes: false })
  })
})

describe('lerEscopoRpc', () => {
  it('aceita linha única ou lista com uma linha', () => {
    expect(lerEscopoRpc([{ total: false, client_ids: ['a', 'b'] }])).toEqual({ total: false, clientIds: new Set(['a', 'b']) })
    expect(lerEscopoRpc({ total: true, client_ids: [] })?.total).toBe(true)
  })
  it('formato estranho → null (falha fechada)', () => {
    expect(lerEscopoRpc(null)).toBeNull()
    expect(lerEscopoRpc([{ total: 'sim' }])).toBeNull()
    expect(lerEscopoRpc('x')).toBeNull()
  })
})

describe('intersecaoCarteiras / permissoesMinimas', () => {
  it('total ∩ parcial = parcial; parcial ∩ parcial = comum', () => {
    const r = intersecaoCarteiras([
      { total: true, clientIds: new Set() },
      { total: false, clientIds: new Set(['a', 'b', 'c']) },
      { total: false, clientIds: new Set(['b', 'c', 'd']) },
    ])
    expect(r).toEqual({ total: false, clientIds: new Set(['b', 'c']) })
  })
  it('todos total → total; lista vazia → nada', () => {
    expect(intersecaoCarteiras([{ total: true, clientIds: new Set() }]).total).toBe(true)
    expect(intersecaoCarteiras([])).toEqual({ total: false, clientIds: new Set() })
  })
  it('permissão do grupo = o que todos têm', () => {
    expect(permissoesMinimas([
      { contratos: true, chat: true, automacoes: true },
      { contratos: false, chat: true, automacoes: true },
    ])).toMatchObject({ contratos: false, chat: true, automacoes: true })
    expect(permissoesMinimas([])).toMatchObject({ contratos: false, chat: false, automacoes: false })
  })
})

describe('participantes', () => {
  it('LID e grupo não são telefone', () => {
    expect(chaveParticipante('123456789012345@lid')).toBe('')
    expect(chaveParticipante(GRUPO)).toBe('')
    expect(chaveParticipante('5511988887777@s.whatsapp.net')).toBe(chaveTelefone('+5511988887777'))
    expect(chaveParticipante('5511988887777:12@s.whatsapp.net')).toBe(chaveTelefone('+5511988887777'))
  })
  it('classifica membros, números da empresa e externos (sem telefone = externo)', () => {
    const membros = new Map([[chaveTelefone('+5511911112222'), 'u1'], [chaveTelefone('+5511933334444'), 'u2']])
    const proprios = new Set([chaveTelefone('+5511951979967')])
    const r = classificarParticipantes([
      '5511911112222@s.whatsapp.net', '551133334444@s.whatsapp.net', // u2 sem o 9º dígito
      '5511951979967@s.whatsapp.net', '999@lid', '5521977776666@s.whatsapp.net',
    ], membros, proprios)
    expect(r.membros.sort()).toEqual(['u1', 'u2'])
    expect(r.externos).toBe(2)
  })
  it('lê telefone de /group/info em qualquer campo; só LID → ""', () => {
    const r = participantesDoGrupoInfo({
      Participants: [
        { JID: '111@lid', PhoneNumber: '5511911112222@s.whatsapp.net' },
        { JID: '5511933334444@s.whatsapp.net', LID: '222@lid' },
        { JID: '333@lid' },
        { phoneNumber: '+5511955556666' },
      ],
    })
    expect(r).toEqual(['5511911112222@s.whatsapp.net', '5511933334444@s.whatsapp.net', '', '+5511955556666'])
    expect(participantesDoGrupoInfo({})).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Leitura com banco falso
// ---------------------------------------------------------------------------

function banco(extra: { participantes?: string[] } = {}) {
  const tabelas = {
    wa_agente_membros: [
      { tenant_id: T, user_id: 'u1', telefone: '+5511911112222', ativo: true },
      { tenant_id: T, user_id: 'u2', telefone: '+5511933334444', ativo: true },
      { tenant_id: 'outro', user_id: 'x9', telefone: '+5521977776666', ativo: true },
    ],
    whatsapp_instances: [{ tenant_id: T, numero_whatsapp: '+5511951979967' }],
    chat_contacts: [{ id: 'g1', tenant_id: T, numero_whatsapp: GRUPO }],
    chat_group_members: (extra.participantes ?? ['5511911112222@s.whatsapp.net', '5511933334444@s.whatsapp.net', '5511951979967@s.whatsapp.net'])
      .map((n) => ({ tenant_id: T, contact_id: 'g1', numero_whatsapp: n })),
  }
  const escopos: Record<string, { total: boolean; client_ids: string[] }> = {
    u1: { total: false, client_ids: ['c1', 'c2', 'c3'] },
    u2: { total: false, client_ids: ['c2', 'c3', 'c4'] },
  }
  const perms: Record<string, Record<string, boolean>> = {
    u1: { contratos: true, chat: true, 'automacoes-wa': true },
    u2: { contratos: false, chat: true, 'automacoes-wa': true },
  }
  return criarSupabaseFalso(tabelas, {
    wa_agente_escopo: (a) => {
      expect(a.p_tenant).toBe(T)
      return [escopos[a.p_user as string] ?? { total: false, client_ids: [] }]
    },
    has_permissao_de: (a) => perms[a.p_user_id as string]?.[a.p_recurso as string] ?? false,
  })
}

describe('carregarEscopo', () => {
  it('carteira + permissões da pessoa', async () => {
    const f = banco()
    const e = await carregarEscopo(f.client, T, 'u2')
    expect(e.modo).toBe('normal')
    expect([...e.clientIds].sort()).toEqual(['c2', 'c3', 'c4'])
    expect(e.permissoes).toMatchObject({ contratos: false, chat: true, automacoes: true })
  })
  it('RPC falha → restrito', async () => {
    const f = criarSupabaseFalso({}, {})
    const e = await carregarEscopo(f.client, T, 'u1')
    expect(e.modo).toBe('restrito')
    expect(e.motivoRestrito).toBe('falha_escopo')
  })
})

describe('escopoDoGrupo — modo normal (interseção)', () => {
  it('só equipe no grupo: interseção das carteiras e permissões mínimas', async () => {
    const f = banco()
    const e = await escopoDoGrupo(f.client, T, 'u1', GRUPO)
    expect(e.modo).toBe('normal')
    expect([...e.clientIds].sort()).toEqual(['c2', 'c3'])
    expect(e.permissoes.contratos).toBe(false) // u2 não tem
    expect(e.participantesMembros).toBe(2)
    // toda leitura de tabela filtrou o tenant
    for (const c of f.consultas) expect(c.filtros).toContain('eq:tenant_id')
  })
  it('alguém de fora da equipe no grupo → restrito', async () => {
    const f = banco({ participantes: ['5511911112222@s.whatsapp.net', '5521900001111@s.whatsapp.net'] })
    const e = await escopoDoGrupo(f.client, T, 'u1', GRUPO)
    expect(e.modo).toBe('restrito')
    expect(e.motivoRestrito).toBe('participante_externo')
    expect(podeVerCliente(e, 'c1')).toBe(false)
  })
  it('participante só com LID conta como de fora → restrito', async () => {
    const f = banco({ participantes: ['5511911112222@s.whatsapp.net', '1234@lid'] })
    expect((await escopoDoGrupo(f.client, T, 'u1', GRUPO)).modo).toBe('restrito')
  })
  it('membro de OUTRA empresa com o mesmo telefone não conta como membro', async () => {
    const f = banco({ participantes: ['5511911112222@s.whatsapp.net', '5521977776666@s.whatsapp.net'] })
    expect((await escopoDoGrupo(f.client, T, 'u1', GRUPO)).motivoRestrito).toBe('participante_externo')
  })
  it('lista vazia, quem perguntou fora do grupo ou sem remetente → restrito', async () => {
    expect((await escopoDoGrupo(banco({ participantes: [] }).client, T, 'u1', GRUPO)).modo).toBe('restrito')
    expect((await escopoDoGrupo(banco({ participantes: ['5511933334444@s.whatsapp.net'] }).client, T, 'u1', GRUPO)).motivoRestrito)
      .toBe('perguntante_fora')
    expect((await escopoDoGrupo(banco().client, T, null, GRUPO)).modo).toBe('restrito')
  })
  it('usa os participantes lidos agora do WhatsApp quando houver', async () => {
    const f = banco()
    const e = await escopoDoGrupo(f.client, T, 'u1', GRUPO, {
      lerParticipantes: async () => ['5511911112222@s.whatsapp.net', '5599900001111@s.whatsapp.net'],
    })
    expect(e.motivoRestrito).toBe('participante_externo')
  })
  it('leitura dos participantes falhou → cai no Chat; se tudo falhar → restrito', async () => {
    const f = banco()
    const e = await escopoDoGrupo(f.client, T, 'u1', GRUPO, { lerParticipantes: async () => null })
    expect(e.modo).toBe('normal')
    const vazio = criarSupabaseFalso({}, {})
    expect((await escopoDoGrupo(vazio.client, T, 'u1', GRUPO)).modo).toBe('restrito')
  })
})

describe('escopoDoGrupo — "Todos no grupo veem tudo"', () => {
  it('acesso total: carteira inteira e leitura completa, mesmo com gente de fora e sem remetente cadastrado', async () => {
    const f = banco({ participantes: ['5521900001111@s.whatsapp.net', '1234@lid'] })
    const e = await escopoDoGrupo(f.client, T, null, GRUPO, { acessoTotal: true })
    expect(e.modo).toBe('normal')
    expect(e.total).toBe(true)
    expect(e.acessoTotalGrupo).toBe(true)
    expect(e.permissoes).toMatchObject({ contratos: true, chat: true, automacoes: true })
    expect(podeVerCliente(e, 'qualquer')).toBe(true)
    expect(f.consultas).toHaveLength(0) // nem lê participantes
  })
  it('escopoAcessoTotal guarda quem perguntou (ou null)', () => {
    expect(escopoAcessoTotal(T, 'u1').userId).toBe('u1')
    expect(escopoAcessoTotal(T, null).userId).toBeNull()
  })
})

describe('instâncias (= user_can_access_instance)', () => {
  function bancoInst(perfis: Record<string, string>) {
    const f = banco()
    const t = f.client
    const extra = criarSupabaseFalso({
      users: Object.entries(perfis).map(([id, perfil]) => ({ id, tenant_id: T, perfil })),
      user_instance_assignments: [
        { tenant_id: T, user_id: 'u1', instance_id: 'i1' }, { tenant_id: T, user_id: 'u1', instance_id: 'i2' },
        { tenant_id: T, user_id: 'u2', instance_id: 'i2' }, { tenant_id: 'outro', user_id: 'u2', instance_id: 'ix' },
      ],
    })
    const from = t.from
    t.from = (tab: string) => (tab === 'users' || tab === 'user_instance_assignments' ? extra.client.from(tab) : from(tab))
    return f
  }
  it('admin/gerente → todas (null); demais → as atribuídas, só desta empresa', async () => {
    expect((await carregarEscopo(bancoInst({ u1: 'gerente' }).client, T, 'u1')).instancias).toBeNull()
    expect([...(await carregarEscopo(bancoInst({ u2: 'atendimento' }).client, T, 'u2')).instancias ?? []]).toEqual(['i2'])
  })
  it('grupo: interseção das instâncias dos participantes; "veem tudo" → todas', async () => {
    const e = await escopoDoGrupo(bancoInst({ u1: 'estrategista', u2: 'atendimento' }).client, T, 'u1', GRUPO)
    expect([...(e.instancias ?? [])]).toEqual(['i2'])
    const e2 = await escopoDoGrupo(bancoInst({ u1: 'admin', u2: 'atendimento' }).client, T, 'u1', GRUPO)
    expect([...(e2.instancias ?? [])]).toEqual(['i2'])
    expect(escopoAcessoTotal(T, null).instancias ?? null).toBeNull()
  })
  it('regras puras', () => {
    expect(intersecaoInstancias([null, new Set(['a', 'b']), new Set(['b'])])).toEqual(new Set(['b']))
    expect(intersecaoInstancias([null, undefined])).toBeNull()
    const e = escopoAcessoTotal(T, null)
    expect(podeVerInstancia(e, null)).toBe(true)
    expect(podeVerInstancia({ ...e, instancias: new Set(['a']) }, null)).toBe(false)
    expect(instanciasParaRpc({ ...e, instancias: new Set(['a']) })).toEqual(['a'])
  })
})
