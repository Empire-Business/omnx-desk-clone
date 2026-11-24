import { describe, expect, it } from 'vitest'
import {
  contarDestinosAtivos, filtrarGruposInternos, pendenciasAutomacao, primeirosPassos,
  type ConfigPendencias, type StatusModeloWa, type TipoModeloWa,
} from './automacoesWa'

// Relatório diário também em GRUPO INTERNO (migration 20261026250000).

const base: ConfigPendencias = {
  provider: 'uazapi',
  uazapi_instance_id: 'inst-1',
  relatorio_ativo: false,
  resumo_ativo: false,
  resumo_destino: 'privado',
  agendamento_ativo: false,
  template_relatorio: null,
  template_resumo: null,
}
const modelo = (tipo: TipoModeloWa, status: StatusModeloWa | null) =>
  ({ tipo, status, nome: `omnx_${tipo}_v1`, nome_configurado: null })
const pendente = [modelo('relatorio', 'PENDING'), modelo('resumo', 'APPROVED'), modelo('link', 'APPROVED')]

const pessoa = (ativo = true) => ({ ativo, tipo: 'pessoa' as const })
const grupo = (ativo = true) => ({ ativo, tipo: 'grupo' as const })

describe('contarDestinosAtivos', () => {
  it('soma pessoas e grupos ativos; linha antiga sem tipo conta como pessoa', () => {
    expect(contarDestinosAtivos([pessoa(), grupo(), grupo(false), { ativo: true }], base))
      .toEqual({ pessoas: 2, grupos: 1, total: 3, gruposSemNumero: 0 })
  })
  it('grupo sem o número do Chat escolhido não conta (grupo sai sempre por ele)', () => {
    expect(contarDestinosAtivos([grupo()], { uazapi_instance_id: null }))
      .toEqual({ pessoas: 0, grupos: 0, total: 0, gruposSemNumero: 1 })
  })
  it('lista vazia ou ausente', () => {
    expect(contarDestinosAtivos(null, base).total).toBe(0)
  })
})

describe('pendenciasAutomacao com grupos', () => {
  it('só um grupo ativo já conta como "quem recebe"', () => {
    expect(pendenciasAutomacao(base, [grupo()], { zernioConectado: false }, undefined)).toEqual([])
  })
  it('só grupo pausado: pede para cadastrar quem recebe', () => {
    const p = pendenciasAutomacao(base, [grupo(false)], { zernioConectado: false }, undefined)
    expect(p).toEqual([{ automacao: 'relatorio', texto: 'cadastrar quem recebe o relatório', aba: 'relatorio' }])
  })
  it('oficial só com grupo: não exige o texto aprovado do relatório (grupo vai pela não oficial)', () => {
    const cfg = { ...base, provider: 'zernio' as const }
    const p = pendenciasAutomacao(cfg, [grupo()], { zernioConectado: true }, pendente)
    expect(p.map((x) => x.texto)).not.toContain('aprovar o texto do relatório na Meta')
    // Com uma pessoa também, o texto aprovado volta a ser exigido.
    const q = pendenciasAutomacao(cfg, [grupo(), pessoa()], { zernioConectado: true }, pendente)
    expect(q.map((x) => x.texto)).toContain('aprovar o texto do relatório na Meta')
  })
  it('oficial só com grupo e sem número do Chat: pede o número para grupos', () => {
    const cfg = { ...base, provider: 'zernio' as const, uazapi_instance_id: null }
    const p = pendenciasAutomacao(cfg, [grupo()], { zernioConectado: true }, pendente)
    expect(p).toContainEqual({ automacao: 'relatorio', texto: 'escolher o número para grupos', aba: 'conexao' })
    expect(p.map((x) => x.texto)).not.toContain('cadastrar quem recebe o relatório')
  })
  it('não oficial sem número: só a pendência de conexão (sem repetir)', () => {
    const p = pendenciasAutomacao({ ...base, uazapi_instance_id: null }, [grupo()], { zernioConectado: false }, undefined)
    const rel = p.filter((x) => x.automacao === 'relatorio').map((x) => x.texto)
    expect(rel).toEqual(['escolher o número que envia'])
  })
})

describe('primeirosPassos com grupos', () => {
  const entrada = {
    provider: 'uazapi' as const, conectado: true, textosAprovados: false, testeEnviado: true,
    gestoresAtivos: 0, relatorioAtivo: false,
  }
  it('"quem recebe" fica feito com só um grupo', () => {
    expect(primeirosPassos({ ...entrada, gruposAtivos: 1 }).find((p) => p.chave === 'gestores')?.feito).toBe(true)
    expect(primeirosPassos(entrada).find((p) => p.chave === 'gestores')?.feito).toBe(false)
  })
})

describe('filtrarGruposInternos', () => {
  const grupos = [
    { grupo_jid: '120363012345678901@g.us', nome: 'Equipe Entrega', participa: true },
    { grupo_jid: '120363098765432109@g.us', nome: 'Gestão Ágil', participa: true },
    { grupo_jid: '120363011111111111@g.us', nome: 'Comercial', participa: true },
  ]
  it('tira os que já estão na lista', () => {
    const r = filtrarGruposInternos(grupos, '', ['120363012345678901@G.US', null])
    expect(r.map((g) => g.nome)).toEqual(['Gestão Ágil', 'Comercial'])
  })
  it('busca sem acento e sem diferenciar maiúscula', () => {
    expect(filtrarGruposInternos(grupos, 'agil', []).map((g) => g.nome)).toEqual(['Gestão Ágil'])
    expect(filtrarGruposInternos(grupos, '  ENTREGA ', []).map((g) => g.nome)).toEqual(['Equipe Entrega'])
  })
  it('limite e lista ausente', () => {
    expect(filtrarGruposInternos(grupos, '', [], 2)).toHaveLength(2)
    expect(filtrarGruposInternos(undefined, 'x', [])).toEqual([])
  })
})
