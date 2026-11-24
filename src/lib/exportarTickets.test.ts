import { describe, expect, it } from 'vitest'
import { toCSV } from '@/lib/csv'
import type { Demanda } from '@/hooks/useAtendimento'
import { COLUNAS_EXPORTACAO, linhasParaExportar, nomeArquivoTickets, textoSeguro } from './exportarTickets'

const base: Demanda = {
  id: 'd1', codigo: 'DEM-12', cliente_id: 'c1', tipo_id: null, etapa_id: 'e1',
  titulo: 'Trocar senha', descricao: null, prioridade: 'alta', prazo: '2026-11-25',
  responsavel_id: 'u1', aprovacao: 'nao_enviado', aprovacao_obs: null, anexos: [],
  criado_por: null, concluida_em: null, created_at: '2026-11-20T13:00:00Z', updated_at: '2026-11-20T13:00:00Z',
  cliente: { nome: 'Clínica Sol' }, etapa: { nome: 'Fazendo', cor: '#000', is_final: false }, responsavel: { nome: 'Ana' },
}

describe('exportar tickets', () => {
  it('monta uma linha legível por ticket', () => {
    const [l] = linhasParaExportar([{ demanda: base, status: 'aguardando_equipe' }])
    expect(l).toMatchObject({
      'Número': 'DEM-12', 'Cliente': 'Clínica Sol', 'Responsável': 'Ana', 'Status': 'Aguardando equipe',
      'Etapa': 'Fazendo', 'Prioridade': 'Alta', 'Prazo': '25/11/2026', 'Concluído em': '',
    })
    expect(Object.keys(l)).toEqual([...COLUNAS_EXPORTACAO])
  })

  it('não deixa texto do cliente virar fórmula', () => {
    expect(textoSeguro('=HYPERLINK("x")')).toBe(`'=HYPERLINK("x")`)
    expect(textoSeguro('+55 11')).toBe(`'+55 11`)
    expect(textoSeguro('Pedido normal')).toBe('Pedido normal')
    const csv = toCSV(linhasParaExportar([{ demanda: { ...base, titulo: '=1+1', cliente: null }, status: 'resolvido' }]))
    expect(csv.split('\n')[1]).toContain(`'=1+1`)
  })

  it('nomeia o arquivo com a data', () => {
    expect(nomeArquivoTickets(new Date(2026, 0, 5))).toBe('tickets-2026-01-05.csv')
  })
})
