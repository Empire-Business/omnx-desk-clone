import { describe, expect, it } from 'vitest'
import { colunaSecreta, gerarExportacao, nomeDoArquivo, streamDaExportacao, TAMANHO_PAGINA, type TabelaExportavel } from './exportar'

async function exportar(tabelas: TabelaExportavel[], linhas: Record<string, Record<string, unknown>[]>, falha?: string) {
  const pedidos: [string, number, number][] = []
  const gerador = gerarExportacao({
    empresaId: 'empresa-1',
    agora: () => new Date('2026-11-09T12:00:00Z'),
    tabelas: async () => tabelas,
    pagina: async (t, de, ate) => {
      pedidos.push([t.tabela, de, ate])
      if (t.tabela === falha) throw new Error('x')
      return (linhas[t.tabela] ?? []).slice(de, ate + 1)
    },
  })
  const texto = await new Response(streamDaExportacao(gerador)).text()
  return { json: JSON.parse(texto), pedidos }
}

describe('exportação de dados (sempre aberta)', () => {
  it('gera um JSON válido com todas as tabelas da empresa', async () => {
    const { json } = await exportar(
      [{ tabela: 'clients', ordem: 'id' }, { tabela: 'contratos', ordem: 'id' }, { tabela: 'vazia', ordem: null }],
      { clients: [{ id: 1, nome: 'A', tenant_id: 'empresa-1' }], contratos: [{ id: 2 }, { id: 3 }] },
    )
    expect(json).toMatchObject({ formato: 'htai-exportacao-v1', app: 'omnx-desk', empresa_id: 'empresa-1', gerado_em: '2026-11-09T12:00:00.000Z' })
    expect(json.tabelas.clients).toEqual([{ id: 1, nome: 'A', tenant_id: 'empresa-1' }])
    expect(json.tabelas.contratos).toHaveLength(2)
    expect(json.tabelas.vazia).toEqual([])
    expect(json.avisos.some((a: string) => a.includes('Storage'))).toBe(true)
  })

  it('pagina de mil em mil até a última página', async () => {
    const muitas = Array.from({ length: TAMANHO_PAGINA * 2 + 5 }, (_, i) => ({ id: i }))
    const { json, pedidos } = await exportar([{ tabela: 'chat_messages', ordem: 'id' }], { chat_messages: muitas })
    expect(json.tabelas.chat_messages).toHaveLength(muitas.length)
    expect(pedidos.map((p) => p[1])).toEqual([0, 1000, 2000])
  })

  it('nunca exporta colunas de segredo', async () => {
    for (const c of ['token', 'uazapi_token', 'webhook_secret', 'senha', 'password_hash', 'api_key', 'apikey', 'chave_privada']) expect(colunaSecreta(c)).toBe(true)
    for (const c of ['nome', 'telefone', 'email', 'valor']) expect(colunaSecreta(c)).toBe(false)
    const { json } = await exportar([{ tabela: 'whatsapp_instances', ordem: 'id' }], { whatsapp_instances: [{ id: 1, nome: 'n', token: 'x', api_key: 'y' }] })
    expect(json.tabelas.whatsapp_instances).toEqual([{ id: 1, nome: 'n' }])
  })

  it('tabela que falha vira aviso e as outras seguem; nome inválido é ignorado', async () => {
    const { json } = await exportar(
      [{ tabela: 'quebrada', ordem: 'id' }, { tabela: 'clients', ordem: 'id' }, { tabela: 'x; drop table y', ordem: null }],
      { clients: [{ id: 1 }] }, 'quebrada',
    )
    expect(json.tabelas.quebrada).toEqual([])
    expect(json.tabelas.clients).toEqual([{ id: 1 }])
    expect(Object.keys(json.tabelas)).toEqual(['quebrada', 'clients'])
    expect(json.avisos.some((a: string) => a.includes('quebrada'))).toBe(true)
  })

  it('nome do arquivo com a data', () => {
    expect(nomeDoArquivo(new Date('2026-11-09T12:00:00Z'))).toBe('dados-desk-2026-11-09.json')
  })
})
