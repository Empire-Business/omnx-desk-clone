import { describe, expect, it } from 'vitest'
import { contratosDosClientesAtendidos, COLUNAS_CONTRATOS_OPERACIONAIS } from './contratos-clientes-atendidos.ts'
import { criarSupabaseFalso } from './teste-supabase-falso.ts'
const contrato = { id: 'k', tenant_id: 't', cliente_id: 'a', status: 'ativo', valor_total: 9000 }
const vinculo = (cliente_id: string, principal = cliente_id === 'a') => ({ tenant_id: 't', contrato_id: 'k', cliente_id, principal })
describe('contratos operacionais de clientes atendidos', () => {
  it('deduplica pares e conserva principal separado, sem propagar finanças', async () => {
    const f = criarSupabaseFalso({ contratos: [contrato], contrato_clientes_atendidos: [vinculo('a'), vinculo('b'), vinculo('b')] })
    const rows = await contratosDosClientesAtendidos(f.client, 't', ['a', 'b', 'b'])
    expect(rows.map(c => [c.cliente_id,c.cliente_principal_id,c.principal])).toEqual([['a','a',true],['b','a',false]])
    expect(JSON.stringify(rows)).not.toContain('valor_total')
    expect(COLUNAS_CONTRATOS_OPERACIONAIS).not.toMatch(/valor|cpf|whatsapp|cliente_nome|num_parcelas/)
    expect(f.consultas.every(q => q.filtros.includes('eq:tenant_id'))).toBe(true)
  })
  it('preserva principal legado sem adicional e não consulta contrato alheio', async () => {
    const f = criarSupabaseFalso({ contratos: [contrato, { ...contrato,id:'outro',tenant_id:'x' }], contrato_clientes_atendidos: [vinculo('a'), { ...vinculo('a'),tenant_id:'x' }] })
    expect(await contratosDosClientesAtendidos(f.client,'t',['a'])).toMatchObject([{ id:'k',principal:true }])
    expect(f.consultas.find(q => q.tabela==='contratos')?.filtros).toContain('in:id')
  })
  it('recusa lote potencialmente truncado', async () => {
    const f = criarSupabaseFalso({ contrato_clientes_atendidos: Array.from({length:1000},(_,i)=>({...vinculo('a'),contrato_id:`k${i}`})) })
    await expect(contratosDosClientesAtendidos(f.client,'t',['a'])).rejects.toThrow('integralmente')
  })
  it('recusa truncamento do servidor abaixo do limite solicitado', async () => {
    const q = {select(){return this},eq(){return this},in(){return this},limit(){return Promise.resolve({ data:[vinculo('a')],error:null,count:2 })}}
    await expect(contratosDosClientesAtendidos({from:()=>q} as never,'t',['a'])).rejects.toThrow('integralmente')
  })
  it('recusa associação cujo contrato desapareceu, sem inferir ausência de contrato', async () => {
    const f = criarSupabaseFalso({ contrato_clientes_atendidos:[vinculo('b')],contratos:[] })
    await expect(contratosDosClientesAtendidos(f.client,'t',['b'])).rejects.toThrow('indisponível')
  })
  it('recusa troca de principal entre as duas leituras', async () => {
    const f = criarSupabaseFalso({ contrato_clientes_atendidos:[vinculo('a')],contratos:[{...contrato,cliente_id:'b'}] })
    await expect(contratosDosClientesAtendidos(f.client,'t',['a'])).rejects.toThrow('principal mudou')
  })
  it('falha fechada em transporte com erro ou linha de outro tenant', async () => {
    for (const resultado of [{data:null,error:{message:'falha'}},{data:[{...vinculo('a'),tenant_id:'outro'}],error:null}]) {
      const q = {select(){return this},eq(){return this},in(){return this},limit(){return Promise.resolve(resultado)}}
      await expect(contratosDosClientesAtendidos({from:()=>q} as never,'t',['a'])).rejects.toThrow()
    }
  })
})
