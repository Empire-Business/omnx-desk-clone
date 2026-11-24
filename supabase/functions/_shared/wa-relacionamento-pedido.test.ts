import { describe, expect, it } from 'vitest'
import { lerPedidoRelacionamento } from './wa-relacionamento-pedido.ts'
const T = '00000000-0000-0000-0000-000000000001'
const A = '00000000-0000-0000-0000-000000000002'
const B = '00000000-0000-0000-0000-000000000003'
const body = (extra: object) => JSON.stringify({ tenant_id: T, client_ids: [A,B], dry_run: false, ...extra })
describe('seleção de análises por operação autenticada', () => {
  it('mantém chamada normal do agendador sem filtro e prévia do painel', () => {
    expect(lerPedidoRelacionamento('')).toEqual({ dryRun:false, tenantId:null, clientIds:null })
    expect(lerPedidoRelacionamento(body({ dry_run:true }))).toEqual({ dryRun:true,tenantId:T,clientIds:[A,B] })
  })
  it('o corpo não concede a capacidade de execução persistente', () => {
    expect(lerPedidoRelacionamento(body({ execucaoDirecionadaAutorizada:true }))).toMatchObject({ status:400 })
    expect(lerPedidoRelacionamento(body({}))).toMatchObject({ status:400 })
  })
  it('permite somente a seleção explícita após autenticação pelo servidor', () => {
    expect(lerPedidoRelacionamento(body({}),true)).toEqual({ dryRun:false,tenantId:T,clientIds:[A,B] })
    expect(lerPedidoRelacionamento(JSON.stringify({ client_ids:[A],dry_run:false }),true)).toMatchObject({ status:400 })
  })
  it('seleção vazia, duplicada ou inválida não vira execução global', () => {
    for (const client_ids of [[],[A,A],['invalido'],Array(6).fill(A)]) {
      expect(lerPedidoRelacionamento(body({ client_ids }),true)).toMatchObject({ status:400 })
    }
  })
  it('preserva deduplicação nas prévias e recusa corpo inválido/grande', () => {
    expect(lerPedidoRelacionamento(body({ dry_run:true,client_ids:[A,A] }))).toMatchObject({ clientIds:[A] })
    for (const raw of ['null','[]','{']) expect(lerPedidoRelacionamento(raw,true)).toMatchObject({ status:400 })
    expect(lerPedidoRelacionamento(' '.repeat(4097),true)).toMatchObject({ status:413 })
  })
})
