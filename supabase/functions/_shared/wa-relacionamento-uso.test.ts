import { describe,expect,it,vi } from 'vitest'
import { confirmarUsoIa,reservarUsoIa } from './wa-relacionamento-uso.ts'

const entrada={id:'tentativa-estavel',tenant:'empresa',cliente:'cliente',dia:'2026-11-06',limite:150,teto:10,reserva:0.25}

describe('reserva e confirmação de custo por tentativa',()=>{
  it('repetição após resposta perdida usa a mesma identidade e reserva somente uma vez',async()=>{
    const ids=new Set<string>(); let cobradas=0
    const rpc=vi.fn(async(_nome:string,args:Record<string,unknown>)=>{
      const id=String(args.p_id)
      if(!ids.has(id)){ids.add(id);cobradas++;throw new Error('resposta perdida após commit')}
      return {data:true,error:null}
    })
    expect(await reservarUsoIa({rpc},entrada)).toEqual({modo:'reservado',id:entrada.id,custoReserva:0.25})
    expect(cobradas).toBe(1);expect(rpc.mock.calls[0][1]).toEqual(rpc.mock.calls[1][1])
  })
  it('teto negado não vira reserva nem fallback legado',async()=>{
    const rpc=vi.fn().mockResolvedValue({data:false,error:null})
    expect(await reservarUsoIa({rpc},entrada)).toEqual({modo:'bloqueado'})
    expect(rpc).toHaveBeenCalledTimes(1)
  })
  it('falha de rede não libera chamada sem reserva confirmada',async()=>{
    const rpc=vi.fn().mockRejectedValue(new Error('rede'))
    expect(await reservarUsoIa({rpc},entrada)).toEqual({modo:'erro'})
    expect(rpc).toHaveBeenCalledTimes(2)
  })
  it('migration ausente preserva somente o modo legado conhecido',async()=>{
    const rpc=vi.fn().mockResolvedValue({data:null,error:{code:'PGRST202'}})
    expect(await reservarUsoIa({rpc},entrada)).toEqual({modo:'legado'})
  })
  it('timeout ou custo desconhecido não confirma custo zero nem devolve a reserva',async()=>{
    const rpc=vi.fn()
    expect(await confirmarUsoIa({rpc},{modo:'reservado',id:entrada.id,custoReserva:0.25},null)).toBe(false)
    expect(rpc).not.toHaveBeenCalled()
  })
  it('ajuste usa mesma tentativa no retry e não adiciona outra chamada',async()=>{
    const rpc=vi.fn().mockRejectedValueOnce(new Error('resposta perdida')).mockResolvedValueOnce({data:true,error:null})
    expect(await confirmarUsoIa({rpc},{modo:'reservado',id:entrada.id,custoReserva:0.25},0.1)).toBe(true)
    expect(rpc.mock.calls[0]).toEqual(rpc.mock.calls[1])
    expect(rpc.mock.calls[0]).toEqual(['cliente_relacionamento_ia_confirmar',{p_id:entrada.id,p_custo:0.1}])
  })
})
