import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  ABAS_CONVERSAS,
  ABAS_IRIS,
  DESTINOS,
  GRUPOS_AJUSTES,
  ITENS_BARRA_INFERIOR,
  ITENS_MAIS,
  ITENS_PRINCIPAIS,
  TRAVAS_DE_PAGINA,
  abaIrisDoSegmento,
  itemAtivo,
  podeAcessar,
  rotaAbaIris,
  type ContextoAcesso,
} from './navegacao'
import type { AcaoPermissao } from '@/hooks/usePermissoes'

const ordem: AcaoPermissao[] = ['ver', 'editar', 'admin']
function ctx(opcoes: {
  perfil?: string
  regras?: Record<string, AcaoPermissao>
  appsDesligados?: string[]
  master?: boolean
}): ContextoAcesso {
  const regras = opcoes.regras ?? {}
  return {
    perfil: opcoes.perfil ?? 'atendimento',
    master: opcoes.master ?? false,
    appLigado: (slug) => !slug || !(opcoes.appsDesligados ?? []).includes(slug),
    // Imita usePermissoes: admin sempre pode; escada ver < editar < admin.
    can: (recurso, acao = 'ver') => {
      if (opcoes.perfil === 'admin') return true
      const tem = regras[recurso]
      return Boolean(tem && ordem.indexOf(tem) >= ordem.indexOf(acao))
    },
  }
}

const visiveis = (itens: { id: string; acesso?: Parameters<typeof podeAcessar>[0] }[], c: ContextoAcesso) =>
  itens.filter((i) => podeAcessar(i.acesso, c)).map((i) => i.id)

describe('fonte única da navegação', () => {
  it('barra lateral em blocos como o Clients; os endereços novos são /aulas e /relatorios/pesquisas', () => {
    expect(ITENS_PRINCIPAIS.map((i) => i.rotulo)).toEqual(['Início', 'Clientes', 'Conversas', 'Tickets', 'Íris', 'Agenda', 'Aulas', 'Contratos', 'Relatórios', 'Pesquisas NPS'])
    expect(ITENS_PRINCIPAIS.find((i) => i.id === 'agenda')?.rota).toBe('/conversas/reunioes')
  })

  it('barra inferior tem Início, Conversas, Tickets e Contratos (e o "Mais" fica no componente)', () => {
    expect(ITENS_BARRA_INFERIOR.map((i) => i.id)).toEqual(['inicio', 'conversas', 'tickets', 'contratos'])
  })

  it('tudo o que está na barra lateral é alcançável no celular (barra inferior + Mais)', () => {
    const noCelular = new Set([...ITENS_BARRA_INFERIOR, ...ITENS_MAIS].map((i) => i.rota))
    for (const item of ITENS_PRINCIPAIS) expect(noCelular).toContain(item.rota)
    expect(noCelular).toContain('/ajustes')
  })

  it('sem nomes antigos ou técnicos nos rótulos', () => {
    const rotulos = [
      ...ITENS_PRINCIPAIS, ...ITENS_MAIS, ...ABAS_CONVERSAS, ...ABAS_IRIS,
      ...GRUPOS_AJUSTES.flatMap((g) => g.cartoes),
    ].map((i) => i.rotulo)
    for (const r of rotulos) expect(r).not.toMatch(/OMNXChat|Automações WhatsApp|Inbox|Kanban|Webhook|Instância|Onboarding|Tags\b/)
  })

  it('mantém as regras de acesso de antes (atendente sem permissões extras)', () => {
    const atendente = ctx({ perfil: 'atendimento', regras: { atendimento: 'ver', 'contratos.onboarding': 'ver' } })
    expect(visiveis(ITENS_PRINCIPAIS, atendente)).toEqual(['inicio', 'clientes', 'conversas', 'tickets', 'agenda', 'aulas', 'contratos'])
    expect(visiveis(ABAS_CONVERSAS, atendente)).not.toContain('configurar')
  })

  it('Íris só para quem administra o módulo; app desligado some', () => {
    expect(visiveis(ITENS_PRINCIPAIS, ctx({ regras: { 'automacoes-wa': 'editar' } }))).not.toContain('ia')
    expect(visiveis(ITENS_PRINCIPAIS, ctx({ regras: { 'automacoes-wa': 'admin' } }))).toContain('ia')
    const admin = ctx({ perfil: 'admin', appsDesligados: ['chat', 'atendimento'] })
    expect(visiveis(ITENS_PRINCIPAIS, admin)).toEqual(['inicio', 'clientes', 'ia', 'aulas', 'contratos', 'relatorios', 'pesquisas'])
  })

  it('Relatórios só para admin (mesma trava da página); Agenda some com o Chat desligado', () => {
    expect(visiveis(ITENS_PRINCIPAIS, ctx({ perfil: 'gerente', regras: { relatorios: 'admin' } }))).not.toContain('relatorios')
    expect(visiveis(ITENS_PRINCIPAIS, ctx({ perfil: 'admin' }))).toContain('relatorios')
    expect(visiveis(ITENS_PRINCIPAIS, ctx({ perfil: 'admin', appsDesligados: ['chat'] }))).not.toContain('agenda')
  })

  it('Aulas logo depois de Agenda, no mesmo bloco do menu', () => {
    const ids = ITENS_PRINCIPAIS.map((i) => i.id)
    expect(ids.indexOf('aulas')).toBe(ids.indexOf('agenda') + 1)
    const aulas = ITENS_PRINCIPAIS.find((i) => i.id === 'aulas')!
    expect(aulas.rota).toBe('/aulas')
    expect(itemAtivo(aulas, '/aulas/abc')).toBe(true)
    expect(itemAtivo(aulas, '/portal/trilhas')).toBe(false)
    // O bloco (linha fina entre grupos) é só aparência e mora na barra lateral.
    const barra = readFileSync(resolve(__dirname, '../components/layout/AppSidebar.tsx'), 'utf-8')
    expect(barra).toMatch(/\bagenda: 'agenda', aulas: 'agenda'/)
    // No celular, fica no "Mais", também logo depois de Agenda.
    const mais = ITENS_MAIS.map((i) => i.id)
    expect(mais.indexOf('aulas')).toBe(mais.indexOf('agenda') + 1)
  })

  it('Aulas para os perfis que a RLS deixa ler as trilhas internas (a mesma trava da página)', () => {
    const aulas = ITENS_PRINCIPAIS.find((i) => i.id === 'aulas')!
    expect(aulas.acesso).toBe(TRAVAS_DE_PAGINA.aulas)
    for (const perfil of ['admin', 'gerente', 'estrategista', 'atendimento']) {
      expect(visiveis(ITENS_PRINCIPAIS, ctx({ perfil, regras: {} })), perfil).toContain('aulas')
    }
    expect(visiveis(ITENS_PRINCIPAIS, ctx({ perfil: 'cliente', regras: {} }))).not.toContain('aulas')
    expect(podeAcessar(TRAVAS_DE_PAGINA.aulas, ctx({ perfil: 'cliente' }))).toBe(false)
    // Não depende de app ligado: some o Chat e as Aulas continuam.
    expect(visiveis(ITENS_PRINCIPAIS, ctx({ perfil: 'gerente', appsDesligados: ['chat', 'atendimento'] }))).toContain('aulas')
  })

  it('Pesquisas NPS logo depois de Relatórios, no bloco Análise, e só um dos dois acende', () => {
    const ids = ITENS_PRINCIPAIS.map((i) => i.id)
    expect(ids.indexOf('pesquisas')).toBe(ids.indexOf('relatorios') + 1)
    const pesquisas = ITENS_PRINCIPAIS.find((i) => i.id === 'pesquisas')!
    const relatorios = ITENS_PRINCIPAIS.find((i) => i.id === 'relatorios')!
    expect(pesquisas.rota).toBe('/relatorios/pesquisas')
    expect(itemAtivo(pesquisas, '/relatorios/pesquisas/abc')).toBe(true)
    expect(itemAtivo(relatorios, '/relatorios/pesquisas/abc')).toBe(false)
    expect(itemAtivo(relatorios, '/relatorios')).toBe(true)
    expect(itemAtivo(pesquisas, '/relatorios')).toBe(false)
    expect(itemAtivo(pesquisas, '/portal/nps/abc')).toBe(false)
    const barra = readFileSync(resolve(__dirname, '../components/layout/AppSidebar.tsx'), 'utf-8')
    expect(barra).toMatch(/\brelatorios: 'analise', pesquisas: 'analise'/)
    const mais = ITENS_MAIS.map((i) => i.id)
    expect(mais.indexOf('pesquisas')).toBe(mais.indexOf('relatorios') + 1)
  })

  it('Pesquisas NPS com a mesma trava do relatório NPS (só admin), no menu e na página', () => {
    const pesquisas = ITENS_PRINCIPAIS.find((i) => i.id === 'pesquisas')!
    expect(pesquisas.acesso).toBe(TRAVAS_DE_PAGINA.pesquisas)
    expect(TRAVAS_DE_PAGINA.pesquisas).toBe(TRAVAS_DE_PAGINA.relatorios)
    expect(podeAcessar(TRAVAS_DE_PAGINA.pesquisas, ctx({ perfil: 'admin' }))).toBe(true)
    for (const perfil of ['gerente', 'estrategista', 'atendimento', 'cliente']) {
      expect(podeAcessar(TRAVAS_DE_PAGINA.pesquisas, ctx({ perfil, regras: { relatorios: 'admin' } })), perfil).toBe(false)
    }
    // Não depende de app: nem do portal, onde o cliente responde.
    expect(visiveis(ITENS_PRINCIPAIS, ctx({ perfil: 'admin', appsDesligados: ['portal', 'chat'] }))).toContain('pesquisas')
    const destino = DESTINOS.find((d) => d.id === 'pesquisas')!
    expect(destino.rota).toBe(pesquisas.rota)
    expect(destino.acesso).toBe(TRAVAS_DE_PAGINA.pesquisas)
  })

  it('a rota da equipe é protegida no App.tsx e a do portal não mudou', () => {
    const app = readFileSync(resolve(__dirname, '../App.tsx'), 'utf-8')
    expect(app).toContain('<Route path="/relatorios/pesquisas" element={<ExigeAcesso regra={TRAVAS_DE_PAGINA.pesquisas}>')
    expect(app).toContain('<Route path="/relatorios/pesquisas/:id" element={<ExigeAcesso regra={TRAVAS_DE_PAGINA.pesquisas}>')
    expect(app).toContain('<Route path="nps/:surveyId" element={<PortalNpsPage />} />')
    expect(app).toContain('<Route path="/relatorios" element={<ExigeAcesso regra={TRAVAS_DE_PAGINA.relatorios}><RelatoriosPage /></ExigeAcesso>} />')
  })

  it('Contratos aparece para quem só tem Vendas novas', () => {
    expect(visiveis(ITENS_PRINCIPAIS, ctx({ regras: { 'contratos.onboarding': 'ver' } }))).toContain('contratos')
    expect(visiveis(ITENS_PRINCIPAIS, ctx({ regras: {} }))).not.toContain('contratos')
  })

  it('hub Ajustes: cartões de administração só com permissão; admin e master são exceções explícitas', () => {
    const cartoes = GRUPOS_AJUSTES.flatMap((g) => g.cartoes)
    const atendente = visiveis(cartoes, ctx({ regras: {} }))
    expect(atendente).toEqual(expect.arrayContaining(['perfil', 'colaboradores', 'departamentos', 'minha-equipe']))
    for (const id of ['admin', 'apps', 'reportes', 'saude', 'auditoria', 'api', 'empresas', 'numeros', 'grupos']) {
      expect(atendente).not.toContain(id)
    }
    const admin = visiveis(cartoes, ctx({ perfil: 'admin' }))
    expect(admin).toContain('admin')
    expect(admin).not.toContain('empresas')
    expect(visiveis(cartoes, ctx({ perfil: 'admin', master: true }))).toContain('empresas')
    expect(visiveis(cartoes, ctx({ perfil: 'gerente', regras: { auditoria: 'admin' } }))).toEqual(
      expect.arrayContaining(['saude', 'auditoria', 'numeros']),
    )
  })

  it('item ativo por prefixo de segmento, com os endereços antigos', () => {
    const conversas = ITENS_PRINCIPAIS.find((i) => i.id === 'conversas')!
    const inicio = ITENS_PRINCIPAIS.find((i) => i.id === 'inicio')!
    expect(itemAtivo(conversas, '/conversas/quadro')).toBe(true)
    expect(itemAtivo(conversas, '/chat')).toBe(true)
    expect(itemAtivo(conversas, '/conversasx')).toBe(false)
    const agenda = ITENS_PRINCIPAIS.find((i) => i.id === 'agenda')!
    expect(itemAtivo(conversas, '/conversas/reunioes')).toBe(false)
    expect(itemAtivo(agenda, '/conversas/reunioes')).toBe(true)
    expect(itemAtivo(agenda, '/meet/abc')).toBe(true)
    expect(itemAtivo(agenda, '/conversas')).toBe(false)
    expect(itemAtivo(inicio, '/')).toBe(true)
    expect(itemAtivo(inicio, '/tickets')).toBe(false)
  })

  it('abas da Íris: endereço ↔ aba interna', () => {
    expect(rotaAbaIris('assistente')).toBe('/ia')
    expect(rotaAbaIris('relatorio')).toBe('/ia/aviso-diario')
    expect(rotaAbaIris('vinculos')).toBe('/clientes/grupos')
    expect(abaIrisDoSegmento(undefined)).toBe('assistente')
    expect(abaIrisDoSegmento('comecar')).toBe('inicio')
    expect(abaIrisDoSegmento('resumo-semanal')).toBe('resumo')
    expect(abaIrisDoSegmento('vinculos')).toBeNull()
    expect(abaIrisDoSegmento('xyz')).toBeNull()
  })

  it('destinos para a ajuda: ids únicos, rota interna e nomes antigos como sinônimos', () => {
    const ids = DESTINOS.map((d) => d.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const d of DESTINOS) expect(d.rota.startsWith('/')).toBe(true)
    expect(DESTINOS.find((d) => d.id === 'conversas')?.sinonimos).toContain('OMNXChat')
    expect(DESTINOS.find((d) => d.id === 'iris')?.sinonimos).toContain('Automações WhatsApp')
  })
})
