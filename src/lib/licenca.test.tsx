import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

const estado = vi.hoisted(() => ({
  rpc: { data: null as unknown, error: null as unknown },
  invocacoes: 0,
  situacao: { modo: 'off', nega: false, motivo: null, mensagem: null, valido_ate: null } as import('./licenca').SituacaoLicenca,
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: async () => estado.rpc,
    functions: { invoke: async () => { estado.invocacoes += 1; return { data: null, error: null } } },
  },
}))
vi.mock('@/hooks/useLicenca', () => ({ useLicenca: () => estado.situacao }))

import { readFileSync } from 'node:fs'
import { buscarSituacaoLicenca, MENSAGENS_LICENCA, normalizarSituacao, rotaAbertaSemLicenca } from './licenca'
import { mensagemDaLicenca as mensagemDasFuncoes } from '../../supabase/functions/_shared/htai-licenca-core'
import { TravaDeLicenca } from '@/components/licenca/AvisoLicenca'

afterEach(() => {
  estado.rpc = { data: null, error: null }
  estado.invocacoes = 0
  estado.situacao = { modo: 'off', nega: false, motivo: null, mensagem: null, valido_ate: null }
})

function renderEm(rota: string) {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[rota]}>
      <TravaDeLicenca><p>TELA-DE-USO</p></TravaDeLicenca>
    </MemoryRouter>,
  )
}

describe('licença na tela', () => {
  it('rotas abertas com a licença negada: só login, Configurações da conta (com a exportação) e Ajuda', () => {
    for (const r of ['/login', '/trocar-senha', '/configuracoes', '/ajustes', '/seguranca', '/manual', '/reportes', '/meus-reportes', '/configuracoes/']) {
      expect(rotaAbertaSemLicenca(r)).toBe(true)
    }
    // Leitura de dados fechada (decisão do dono, 09/11/2026): nem relatórios nem listas.
    for (const r of ['/', '/conversas', '/tickets', '/contratos', '/contratos/kanban', '/clientes/123', '/ia', '/disparo', '/cobranca',
      '/relatorios', '/clientes', '/contratos/lista', '/conversas/contatos', '/admin', '/empresas', '/api-webhooks']) {
      expect(rotaAbertaSemLicenca(r)).toBe(false)
    }
  })

  it('modo off (produção da empresa): não muda nada e não chama a função', async () => {
    expect(renderEm('/tickets')).toContain('TELA-DE-USO')
    estado.rpc = { data: { modo: 'off', nega: false }, error: null }
    expect(await buscarSituacaoLicenca()).toMatchObject({ modo: 'off', nega: false })
    expect(estado.invocacoes).toBe(0)
  })

  it('RPC ausente (banco sem a migração) = desligada', async () => {
    estado.rpc = { data: null, error: { code: 'PGRST202' } }
    expect(await buscarSituacaoLicenca()).toMatchObject({ modo: 'off', nega: false })
    expect(estado.invocacoes).toBe(0)
  })

  it('negada: tela de uso bloqueada com o aviso; Configurações continua abrindo', () => {
    estado.situacao = normalizarSituacao({ modo: 'enforce', nega: true, motivo: 'expired', mensagem: null })
    const bloqueada = renderEm('/tickets')
    expect(bloqueada).not.toContain('TELA-DE-USO')
    expect(bloqueada).toContain('A licença deste app venceu')
    expect(bloqueada).toContain('href="/configuracoes"')
    expect(bloqueada).toContain('href="/configuracoes?secao=dados"')
    expect(bloqueada).not.toContain('href="/relatorios"')
    const aberta = renderEm('/configuracoes')
    expect(aberta).toContain('TELA-DE-USO')
    expect(aberta).toContain('role="alert"')
  })

  it('negada: pede uma conferência na central e relê', async () => {
    estado.rpc = { data: { modo: 'enforce', nega: true, motivo: 'nao_ativado', mensagem: 'Ative a licença deste app.' }, error: null }
    const s = await buscarSituacaoLicenca()
    expect(estado.invocacoes).toBe(1)
    expect(s).toMatchObject({ nega: true, motivo: 'nao_ativado', mensagem: MENSAGENS_LICENCA.nao_ativado })
  })

  it('aviso pelo motivo real: revogada e suspensa não mandam renovar (ensaio de 19/11/2026)', () => {
    // Banco ainda sem 20261119180200 manda "venceu" para tudo: a tela usa o motivo.
    const antigo = 'A licença deste app venceu. Renove na sua conta HTAI para voltar a usar.'
    for (const motivo of ['revoked', 'suspended', 'vencida']) {
      estado.situacao = normalizarSituacao({ modo: 'enforce', nega: true, motivo, mensagem: antigo })
      const html = renderEm('/tickets')
      expect(html).not.toContain('venceu')
      expect(html).not.toContain('Renove')
      expect(html).toContain('Exportar dados')
    }
    expect(normalizarSituacao({ modo: 'enforce', nega: true, motivo: 'revoked' }).mensagem).toContain('desativada pela HTAI')
    expect(normalizarSituacao({ modo: 'enforce', nega: true, motivo: 'suspended' }).mensagem).toContain('suspensa')
    expect(normalizarSituacao({ modo: 'enforce', nega: true, motivo: 'vencida' }).mensagem).toContain('Não foi possível confirmar')
    expect(normalizarSituacao({ modo: 'enforce', nega: true, motivo: 'expired' }).mensagem).toContain('venceu. Renove')
    // Motivo desconhecido: usa o texto do banco; sem texto, o padrão.
    expect(normalizarSituacao({ modo: 'enforce', nega: true, motivo: 'outro', mensagem: 'Texto do banco.' }).mensagem).toBe('Texto do banco.')
    expect(normalizarSituacao({ modo: 'enforce', nega: true, motivo: 'toString' }).mensagem).toContain('venceu')
  })

  it('os mesmos textos na tela, nas funções e no banco', () => {
    const sql = readFileSync(new URL('../../supabase/migrations/20261119180200_licenca_aviso_por_motivo.sql', import.meta.url), 'utf8')
    for (const [motivo, texto] of Object.entries(MENSAGENS_LICENCA)) {
      expect(mensagemDasFuncoes(motivo as Parameters<typeof mensagemDasFuncoes>[0])).toBe(texto)
      expect(sql).toContain(`'${texto}'`)
    }
  })
})
