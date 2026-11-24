import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CobrancaConversasPage } from './CobrancaConversasPage'

const state = vi.hoisted(() => ({ accessError: false, instanceError: false, pending: false, enabled: true,
  instances: [] as { id: string; nome: string; categoria: string; numero_whatsapp: string | null }[],
  allowed: ['financeiro-a'] as string[] | null | undefined }))
const useInstances = vi.hoisted(() => vi.fn())
vi.mock('@/hooks/useChat', () => ({ useInstances }))
vi.mock('@/hooks/useUsers', () => ({ useMyProfile: () => ({ isPending: false, isError: false, refetch: vi.fn() }), useMyInstanceIds: () => ({ data: state.allowed, isError: state.accessError, isPending: state.pending, refetch: vi.fn() }) }))
vi.mock('@/hooks/useAppModules', () => ({ useIsAppEnabled: () => ({ isAppEnabled: () => state.enabled }) }))
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn(), Link: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a> }))
beforeEach(() => {
  Object.assign(state, { accessError: false, instanceError: false, pending: false, enabled: true, instances: [], allowed: ['financeiro-a'] })
  useInstances.mockReset().mockImplementation(() => ({ data: state.instances, isError: state.instanceError, isPending: false, refetch: vi.fn() }))
})

describe('conversas financeiras consolidadas no Chat', () => {
  it('abre a instância financeira real sem oferecer envio paralelo', () => {
    state.instances = [{ id: 'financeiro-a', nome: 'Financeiro', categoria: 'financeiro', numero_whatsapp: null }, { id: 'suporte-a', nome: 'Suporte', categoria: 'suporte', numero_whatsapp: null }]
    const html = renderToStaticMarkup(<CobrancaConversasPage />)
    expect(useInstances).toHaveBeenCalledWith(['financeiro-a'])
    expect(html).toContain('href="/conversas?instancia=financeiro-a"')
    expect(html).not.toContain('instancia=suporte-a')
    expect(html).not.toContain('textarea')
  })
  it('mostra vazio e configuração quando não há instância', () => {
    const html = renderToStaticMarkup(<CobrancaConversasPage />)
    expect(html).toContain('Nenhum número do financeiro disponível')
    expect(html).toContain('href="/conversas/configurar?aba=instancias"')
  })
  it.each(['accessError', 'instanceError'] as const)('separa falha de %s de lista vazia', campo => {
    state[campo] = true
    const html = renderToStaticMarkup(<CobrancaConversasPage />)
    expect(html).toContain('role="alert"')
    expect(html).toContain('Tentar novamente')
    expect(html).not.toContain('Nenhum número do financeiro')
  })
  it('aguarda acesso sem consultar todas as instâncias', () => {
    state.allowed = undefined; state.pending = true
    expect(renderToStaticMarkup(<CobrancaConversasPage />)).toContain('Carregando números do financeiro')
    expect(useInstances).toHaveBeenCalledWith([])
  })
  it('explica módulo desativado sem oferecer links que redirecionam', () => {
    state.enabled = false
    const html = renderToStaticMarkup(<CobrancaConversasPage />)
    expect(html).toContain('módulo Conversas está desligado')
    expect(html).not.toContain('href="/chat')
    expect(html).not.toContain('href="/conversas')
  })
})
