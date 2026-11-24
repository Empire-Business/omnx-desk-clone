import { describe, expect, it } from 'vitest'
import {
  carregarPerfilAgente, carregarPerfilRuntime, chavePerfilAgente, salvarPerfilAgente, validarPerfilAgente,
} from './wa-agente-perfil.ts'
import { PERFIL_AGENTE_PADRAO, VERSAO_PERFIL_PADRAO } from './wa-agente-perfil-padrao.ts'

const T = '11111111-1111-4111-8111-111111111111'
const U = '22222222-2222-4222-8222-222222222222'
const perfil = { personalidade: 'Atenta.\n\nSem inventar.', contexto: 'Equipe interna.\nContexto real.' }
const linha = (p = perfil, timestamp = '2026-10-27T12:00:00.000Z') => ({
  id: 'registro', atualizado_em: timestamp,
  valor: JSON.stringify({ schema: 1, ...p, atualizado_em: timestamp, atualizado_por: 'Bruno', autor_id: U }),
})
type Resultado = { data: ReturnType<typeof linha> | null; error: { code: string } | null }
interface Consulta {
  tabela: string; operacao: 'select' | 'insert' | 'update'
  filtros: [string, unknown][]; payload?: Record<string, unknown>
}
interface Query {
  select: (colunas: string) => Query
  eq: (campo: string, valor: unknown) => Query
  is: (campo: string, valor: unknown) => Query
  insert: (payload: Record<string, unknown>) => Query
  update: (payload: Record<string, unknown>) => Query
  maybeSingle: () => Promise<Resultado>
  single: () => Promise<Resultado>
}
/** Respostas de PostgREST controladas; sem rede, banco ou upsert disponível. */
function banco(resultados: Resultado[]) {
  const consultas: Consulta[] = []
  const client = {
    from(tabela: string): Query {
      const c: Consulta = { tabela, operacao: 'select', filtros: [] }
      consultas.push(c)
      const terminar = async () => {
        const r = resultados.shift()
        if (!r) throw new Error('Consulta inesperada')
        return r
      }
      const q: Query = {
        select: () => q,
        eq: (campo, valor) => { c.filtros.push([campo, valor]); return q },
        is: (campo, valor) => { c.filtros.push([campo, valor]); return q },
        insert: (p) => { c.operacao = 'insert'; c.payload = p; return q },
        update: (p) => { c.operacao = 'update'; c.payload = p; return q },
        maybeSingle: terminar, single: terminar,
      }
      return q
    },
  }
  return { client: client as unknown as Parameters<typeof carregarPerfilAgente>[0], consultas }
}
const ok = (data: ReturnType<typeof linha> | null): Resultado => ({ data, error: null })

describe('perfil longo da Íris', () => {
  it('aceita 32k em cada campo sem perder parágrafos, espaços ou fim do texto', () => {
    const personalidade = 'A\n\n'.padEnd(31_996, 'p') + 'FIM!'
    const contexto = 'C\r\n\t'.padEnd(31_996, 'c') + 'FIM!'
    expect(personalidade).toHaveLength(32_000)
    expect(validarPerfilAgente({ personalidade, contexto })).toEqual({ personalidade, contexto })
  })
  it('recusa campo excedente, controles e formas inválidas em vez de truncar', () => {
    for (const invalido of [null, [], {}, { ...perfil, contexto: 123 }, { ...perfil, contexto: ' \n\t ' }, { ...perfil, personalidade: '' }, { ...perfil, personalidade: 'x'.repeat(32_001) }, { ...perfil, contexto: 'x\u0000y' }]) {
      expect(() => validarPerfilAgente(invalido)).toThrow()
    }
    expect(() => chavePerfilAgente('tenant-injetado')).toThrow()
  })
  it('ausência legítima usa os dois padrões efetivos e não grava registro', async () => {
    const b = banco([ok(null)])
    const p = await carregarPerfilAgente(b.client, T)
    expect(p).toMatchObject({ ...PERFIL_AGENTE_PADRAO, origem: 'padrao', revisao: null, versao_padrao: VERSAO_PERFIL_PADRAO })
    expect(p.limites).toEqual({ personalidade: 32_000, contexto: 32_000, total: 64_000 })
    expect(b.consultas).toEqual([{ tabela: 'app_settings', operacao: 'select', filtros: [['tenant_id', T], ['chave', chavePerfilAgente(T)]] }])
  })
  it('modo restrito não consulta nem carrega o perfil interno', async () => {
    const b = banco([])
    expect(await carregarPerfilRuntime(b.client, T, 'restrito')).toBeNull()
    expect(b.consultas).toEqual([])
  })
  it('falha de leitura e registro inválido não se passam por perfil padrão', async () => {
    const erro = banco([{ data: null, error: { code: 'XX000' } }])
    await expect(carregarPerfilRuntime(erro.client, T, 'normal')).rejects.toMatchObject({ codigo: 'perfil_leitura', status: 503 })
    const invalido = banco([ok({ ...linha(), valor: '{"schema":2}' })])
    await expect(carregarPerfilAgente(invalido.client, T)).rejects.toMatchObject({ codigo: 'perfil_salvo_invalido' })
  })
  it('GET salvo devolve autoria legível, revisão e loader usa o mesmo conteúdo', async () => {
    const b = banco([ok(linha()), ok(linha())])
    const p = await carregarPerfilAgente(b.client, T)
    expect(p).toMatchObject({ ...perfil, origem: 'salvo', atualizado_por: 'Bruno' })
    expect(p.revisao).toMatch(/^[a-f0-9]{64}$/)
    expect(await carregarPerfilRuntime(b.client, T, 'normal')).toEqual(perfil)
  })
  it('primeiro save insere só na empresa do servidor e retorna a versão persistida', async () => {
    const b = banco([ok(null), ok(linha())])
    const p = await salvarPerfilAgente(b.client, T, U, 'Bruno', { ...perfil, revisao: null, tenant_id: 'outro' })
    expect(p).toMatchObject({ ...perfil, origem: 'salvo', atualizado_por: 'Bruno' })
    expect(b.consultas[1].payload).toMatchObject({ tenant_id: T, chave: chavePerfilAgente(T) })
    expect(JSON.parse(String(b.consultas[1].payload?.valor))).toMatchObject({ schema: 1, ...perfil, autor_id: U, atualizado_por: 'Bruno' })
  })
  it('editor desatualizado e revisão ausente não sobrescrevem perfil', async () => {
    const antigo = await carregarPerfilAgente(banco([ok(linha())]).client, T)
    const atual = linha({ ...perfil, contexto: 'Já mudou em outra tela' }, '2026-10-27T12:01:00.000Z')
    const b = banco([ok(atual)])
    await expect(salvarPerfilAgente(b.client, T, U, 'Bruno', { ...perfil, revisao: antigo.revisao })).rejects.toMatchObject({ status: 409, codigo: 'perfil_conflito' })
    expect(b.consultas.every((c) => c.operacao === 'select')).toBe(true)
    const sem = banco([])
    await expect(salvarPerfilAgente(sem.client, T, U, 'Bruno', perfil)).rejects.toMatchObject({ codigo: 'perfil_revisao' })
    expect(sem.consultas).toEqual([])
  })
  it('save usa CAS pequeno por id + timestamp + tenant, sem TEXT longo na URL', async () => {
    const snapshot = await carregarPerfilAgente(banco([ok(linha())]).client, T)
    const b = banco([ok(linha()), ok(linha({ ...perfil, contexto: 'Novo contexto' }))])
    await salvarPerfilAgente(b.client, T, U, 'Bruno', { ...perfil, contexto: 'Novo contexto', revisao: snapshot.revisao })
    expect(b.consultas[1].filtros).toEqual([
      ['tenant_id', T], ['chave', chavePerfilAgente(T)], ['id', 'registro'], ['atualizado_em', linha().atualizado_em],
    ])
    expect(b.consultas[1].operacao).toBe('update')
    expect(b.consultas[1].filtros.some(([campo]) => campo === 'valor')).toBe(false)
  })
  it('corrida depois da leitura e colisão global de chave falham sem upsert', async () => {
    const snapshot = await carregarPerfilAgente(banco([ok(linha())]).client, T)
    const corrida = banco([ok(linha()), ok(null)])
    await expect(salvarPerfilAgente(corrida.client, T, U, 'Bruno', { ...perfil, revisao: snapshot.revisao })).rejects.toMatchObject({ status: 409, codigo: 'perfil_conflito' })
    const colisao = banco([ok(null), { data: null, error: { code: '23505' } }])
    await expect(salvarPerfilAgente(colisao.client, T, U, 'Bruno', { ...perfil, revisao: null })).rejects.toMatchObject({ status: 409, codigo: 'perfil_conflito' })
    expect(colisao.consultas.map((c) => c.operacao)).toEqual(['select', 'insert'])
    expect(colisao.consultas[1].payload?.tenant_id).toBe(T)
  })
})
