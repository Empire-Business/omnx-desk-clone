import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

const estado = vi.hoisted(() => ({ rpc: { data: null as unknown, error: null as unknown }, chamadas: [] as string[] }))
vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: async (nome: string) => { estado.chamadas.push(nome); return estado.rpc },
    auth: { mfa: {} },
  },
}))

import { buscarSituacaoMfa, codigoTotpValido, MFA_NADA_EXIGIDO, normalizarSituacaoMfa } from './mfa'
import { VerificacaoDuasEtapas } from '@/components/seguranca/VerificacaoDuasEtapas'
import { nomeArquivoExportacao } from '@/lib/licenca'

afterEach(() => { estado.rpc = { data: null, error: null }; estado.chamadas = [] })

describe('verificação em duas etapas do superadmin', () => {
  it('produção / banco sem a migração: nada exigido', async () => {
    estado.rpc = { data: null, error: { code: 'PGRST202' } }
    expect(await buscarSituacaoMfa()).toEqual(MFA_NADA_EXIGIDO)
    expect(estado.chamadas).toEqual(['desk_mfa_situacao'])
  })

  it('app instalado, superadmin sem aal2: pendente', async () => {
    estado.rpc = { data: { superadmin: true, exigida: true, aal: 'aal1', pendente: true }, error: null }
    expect(await buscarSituacaoMfa()).toEqual({ superadmin: true, exigida: true, aal: 'aal1', pendente: true })
  })

  it('normaliza resposta estranha sem inventar exigência', () => {
    expect(normalizarSituacaoMfa('x')).toEqual(MFA_NADA_EXIGIDO)
    expect(normalizarSituacaoMfa({ pendente: 'sim' }).pendente).toBe(false)
  })

  it('código do autenticador: exatamente 6 números', () => {
    expect(codigoTotpValido('123456')).toBe(true)
    expect(codigoTotpValido(' 123456 ')).toBe(true)
    for (const c of ['12345', '1234567', 'abcdef', '']) expect(codigoTotpValido(c)).toBe(false)
  })

  it('tela obrigatória explica o motivo', () => {
    const html = renderToStaticMarkup(<VerificacaoDuasEtapas obrigatoria />)
    expect(html).toContain('Verificação em duas etapas')
    expect(html).toContain('administrar as empresas desta instalação')
  })
})

describe('exportar dados', () => {
  it('nome do arquivo com a data', () => {
    expect(nomeArquivoExportacao(new Date('2026-11-09T10:00:00Z'))).toBe('dados-desk-2026-11-09.json')
  })
})
