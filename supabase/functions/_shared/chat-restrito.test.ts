import { describe, expect, it } from 'vitest'
import { baseDoChat, chatEhRestrito, filtrarPerfisRestrito, podeVerRestritoOuPerfil, type UsuarioPerfil } from './chat-restrito.ts'

const T1 = '00000000-0000-0000-0000-000000000001'
const T2 = '00000000-0000-0000-0000-000000000002'
const u = (id: string, perfil: string | null, tenant_id: string | null = T1, ativo: boolean | null = true): UsuarioPerfil =>
  ({ id, perfil, tenant_id, ativo })

describe('filtrarPerfisRestrito (push de grupo interno)', () => {
  const usuarios = [
    u('admin', 'admin'),
    u('gerente', 'gerente'),
    u('atend', 'atendimento'),
    u('agente', 'agente_chat'),
    u('estrat', 'estrategista'),
    u('admin-inativo', 'admin', T1, false),
    u('admin-outra', 'admin', T2),
    u('sem-perfil', null),
  ]
  const todos = usuarios.map((x) => x.id)

  it('só admin e gerente ativos da mesma empresa', () => {
    expect(filtrarPerfisRestrito(todos, usuarios, T1)).toEqual(['admin', 'gerente'])
  })

  it('ninguém de outra empresa, mesmo admin', () => {
    expect(filtrarPerfisRestrito(['admin-outra'], usuarios, T1)).toEqual([])
  })

  it('id desconhecido (sem linha em users) não recebe', () => {
    expect(filtrarPerfisRestrito(['fantasma', 'admin'], usuarios, T1)).toEqual(['admin'])
  })

  it('sem repetir e na ordem original', () => {
    expect(filtrarPerfisRestrito(['gerente', 'admin', 'gerente'], usuarios, T1)).toEqual(['gerente', 'admin'])
  })

  it('atribuído a atendimento: ninguém recebe', () => {
    expect(filtrarPerfisRestrito(['atend'], usuarios, T1)).toEqual([])
  })
})

describe('baseDoChat', () => {
  it('tira sufixos e normaliza', () => {
    expect(baseDoChat(' 120363012345678901@G.US ')).toBe('120363012345678901')
    expect(baseDoChat('5511999998888@s.whatsapp.net')).toBe('5511999998888')
    expect(baseDoChat('5511999998888@c.us')).toBe('5511999998888')
    expect(baseDoChat('120363012345678901')).toBe('120363012345678901')
  })

  it('valor que não é texto vira vazio', () => {
    expect(baseDoChat(undefined)).toBe('')
    expect(baseDoChat(123)).toBe('')
    expect(baseDoChat(null)).toBe('')
  })
})

// Cliente falso: cada .from(tabela) devolve o resultado configurado e guarda os filtros.
type Res = { data: unknown[] | null; error: { code?: string } | null }
function fakeDb(porTabela: Record<string, Res>, rpc?: Res & { data: unknown }) {
  const filtros: Record<string, [string, unknown][]> = {}
  const db = {
    from(tabela: string) {
      filtros[tabela] = []
      const q = {
        select: () => q,
        eq: (c: string, v: unknown) => { filtros[tabela].push([c, v]); return q },
        in: (c: string, v: unknown) => { filtros[tabela].push([c, v]); return q },
        limit: () => Promise.resolve(porTabela[tabela] ?? { data: [], error: null }),
      }
      return q
    },
    rpc: () => Promise.resolve(rpc ?? { data: false, error: null }),
  }
  return { db: db as unknown as Parameters<typeof chatEhRestrito>[0], filtros }
}

describe('chatEhRestrito (marca no contato OU registro da empresa)', () => {
  it('contato marcado = restrito', async () => {
    const { db } = fakeDb({ chat_contacts: { data: [{ id: 'c' }], error: null } })
    expect(await chatEhRestrito(db, '120363012345678901@g.us', T1)).toBe(true)
  })

  it('só no registro chat_grupos_restritos (contato ainda não marcado) = restrito, filtrando a empresa', async () => {
    const { db, filtros } = fakeDb({
      chat_contacts: { data: [], error: null },
      chat_grupos_restritos: { data: [{ grupo_base: '120363012345678901' }], error: null },
    })
    expect(await chatEhRestrito(db, '120363012345678901@g.us', T1)).toBe(true)
    expect(filtros.chat_grupos_restritos).toContainEqual(['tenant_id', T1])
    expect(filtros.chat_grupos_restritos).toContainEqual(['grupo_base', '120363012345678901'])
  })

  it('migration não aplicada (coluna/tabela inexistente) = não restrito', async () => {
    const { db } = fakeDb({
      chat_contacts: { data: null, error: { code: '42703' } },
      chat_grupos_restritos: { data: null, error: { code: 'PGRST205' } },
    })
    expect(await chatEhRestrito(db, '120363012345678901', T1)).toBe(false)
  })

  it('outro erro = restrito (falha fechada)', async () => {
    const a = fakeDb({ chat_contacts: { data: null, error: { code: '57014' } } })
    expect(await chatEhRestrito(a.db, '120363012345678901', T1)).toBe(true)
    const b = fakeDb({ chat_grupos_restritos: { data: null, error: { code: '57014' } } })
    expect(await chatEhRestrito(b.db, '120363012345678901', T1)).toBe(true)
  })

  it('número vazio = não consulta nada', async () => {
    const { db, filtros } = fakeDb({})
    expect(await chatEhRestrito(db, '', T1)).toBe(false)
    expect(filtros).toEqual({})
  })
})

describe('podeVerRestritoOuPerfil', () => {
  it('usa a resposta do banco quando a função existe', async () => {
    expect(await podeVerRestritoOuPerfil(fakeDb({}, { data: true, error: null }).db, 'atendimento')).toBe(true)
    expect(await podeVerRestritoOuPerfil(fakeDb({}, { data: false, error: null }).db, 'admin')).toBe(false)
  })
  it('função ainda não existe: decide pelo perfil', async () => {
    const semFn = { data: null, error: { code: 'PGRST202' } }
    expect(await podeVerRestritoOuPerfil(fakeDb({}, semFn).db, 'gerente')).toBe(true)
    expect(await podeVerRestritoOuPerfil(fakeDb({}, semFn).db, 'atendimento')).toBe(false)
  })
  it('outro erro = não', async () => {
    expect(await podeVerRestritoOuPerfil(fakeDb({}, { data: null, error: { code: '500' } }).db, 'admin')).toBe(false)
  })
})
