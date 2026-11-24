import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  ABAS_CONVERSAS, ABAS_IRIS, ABAS_TICKETS, DESTINOS, GRUPOS_AJUSTES, ITEM_AJUSTES, ITENS_MAIS, ITENS_PRINCIPAIS,
} from './navegacao'
import { SECOES_COM_DESTINO } from '@/lib/ajudaIris'
import { SECOES_MANUAL, normalizarBuscaManual, type SecaoManual } from '../../supabase/functions/_shared/manual-plataforma'

/**
 * Contrato entre a navegação (fonte única), o App.tsx e o manual/ajuda:
 * - nenhum atalho aponta para uma tela que não existe;
 * - todo item de menu tem explicação no manual;
 * - o manual não volta a usar nomes retirados.
 */

/** Rotas declaradas no App.tsx. Caminhos relativos herdam o último caminho absoluto (layout pai). */
function rotasDoApp(): string[] {
  const codigo = readFileSync(resolve(__dirname, '../App.tsx'), 'utf-8')
  const rotas: string[] = []
  let pai = ''
  for (const m of codigo.matchAll(/<Route\b[^>]*?\bpath="([^"]+)"/g)) {
    const caminho = m[1]
    if (caminho === '*') continue
    if (caminho.startsWith('/')) { rotas.push(caminho); pai = caminho } else rotas.push(`${pai}/${caminho}`)
  }
  // /manual é uma entrada pública independente, montada em main.tsx (fora do App.tsx).
  rotas.push('/manual')
  return rotas
}

function existeRota(rota: string, rotas: string[]): boolean {
  const limpa = rota.split('?')[0].split('#')[0]
  return rotas.some((r) => new RegExp(`^${r.replace(/:[^/]+/g, '[^/]+')}$`).test(limpa))
}

function textoDaSecao(s: SecaoManual): string {
  return [
    s.titulo, s.resumo, s.publico,
    ...s.blocos.flatMap((b) => [b.titulo, ...(b.textos ?? []), ...(b.passos ?? []), ...(b.itens ?? []), b.exemplo ?? '', b.nota ?? '']),
    ...(s.perguntas ?? []).flatMap((p) => [p.pergunta, p.resposta]),
    ...(s.termos ?? []).flatMap((t) => [t.termo, t.definicao]),
  ].join('\n')
}

const TEXTO_MANUAL = SECOES_MANUAL.map(textoDaSecao).join('\n')
const NORMALIZADO = normalizarBuscaManual(TEXTO_MANUAL)
const contem = (secao: string, rotulo: string) => normalizarBuscaManual(secao).includes(normalizarBuscaManual(rotulo))

describe('destinos da navegação', () => {
  const rotas = rotasDoApp()

  it('o parser enxerga as rotas do App.tsx', () => {
    expect(rotas).toEqual(expect.arrayContaining(['/', '/tickets', '/conversas', '/conversas/quadro', '/ia', '/ia/:aba', '/contratos/recebiveis']))
  })

  it('todo destino aponta para uma rota que existe', () => {
    const quebrados = DESTINOS.filter((d) => !existeRota(d.rota, rotas)).map((d) => `${d.id} → ${d.rota}`)
    expect(quebrados).toEqual([])
  })

  it('menus, abas e cartões de Ajustes apontam para rotas que existem', () => {
    const itens = [
      ...ITENS_PRINCIPAIS, ITEM_AJUSTES, ...ITENS_MAIS, ...ABAS_CONVERSAS, ...ABAS_TICKETS, ...ABAS_IRIS,
      ...GRUPOS_AJUSTES.flatMap((g) => g.cartoes),
    ]
    expect(itens.filter((i) => !existeRota(i.rota, rotas)).map((i) => `${i.id} → ${i.rota}`)).toEqual([])
  })

  it('os atalhos da ajuda saem de DESTINOS e as seções existem no manual', () => {
    const ids = new Set(SECOES_MANUAL.map((s) => s.id))
    for (const id of SECOES_COM_DESTINO) expect(ids.has(id), `seção ${id}`).toBe(true)
    // A02: "Onde fica A receber?" precisa de atalho.
    expect(SECOES_COM_DESTINO).toContain('financeiro')
  })
})

describe('manual × navegação', () => {
  it('cada item de menu tem a sua seção, que o explica pelo nome', () => {
    const secaoDe: Record<string, string> = {
      inicio: 'comecar', conversas: 'chat', tickets: 'atendimento', clientes: 'clientes', contratos: 'contratos',
      ia: 'iris', agenda: 'chat', aulas: 'aulas', relatorios: 'relatorios', pesquisas: 'pesquisas', ajustes: 'configuracoes', notificacoes: 'comecar', 'meus-reportes': 'suporte', perfil: 'configuracoes',
    }
    const itens = [...ITENS_PRINCIPAIS, ITEM_AJUSTES, ...ITENS_MAIS]
    for (const item of itens) {
      const id = secaoDe[item.id]
      expect(id, `item "${item.id}" sem seção mapeada no teste`).toBeTruthy()
      const secao = SECOES_MANUAL.find((s) => s.id === id)
      expect(secao, `seção ${id}`).toBeTruthy()
      expect(contem(textoDaSecao(secao!), item.rotulo), `"${item.rotulo}" não aparece na seção ${id}`).toBe(true)
    }
  })

  it('cada aba de Conversas, Tickets e Íris é citada no manual', () => {
    const abas = [...ABAS_CONVERSAS, ...ABAS_TICKETS, ...ABAS_IRIS]
    const faltando = abas.filter((a) => !NORMALIZADO.includes(normalizarBuscaManual(a.rotulo))).map((a) => a.rotulo)
    expect(faltando).toEqual([])
  })

  it('os destinos principais (A receber, Vendas novas, Etiquetas) são citados', () => {
    for (const nome of ['A receber', 'Vendas novas', 'Etiquetas', 'Números e acessos', 'Meus pedidos de suporte', 'Perguntar à Íris']) {
      expect(NORMALIZADO, nome).toContain(normalizarBuscaManual(nome))
    }
  })

  it('descreve a tickeria nova', () => {
    for (const termo of ['Aguardando equipe', 'Aguardando cliente', 'Resolvido', 'Reaberto', 'Resolver', 'Reabrir', 'Assumir', 'Não resolveu', 'Atrasados', 'Abrir no Chat', 'Tickets deste cliente']) {
      expect(NORMALIZADO, termo).toContain(normalizarBuscaManual(termo))
    }
  })

  it('não usa nomes retirados nem assuntos de marketing', () => {
    // Nome antigo só é aceito entre parênteses começando por "antes", para quem já usava o sistema.
    const visivel = TEXTO_MANUAL.replace(/\(antes[^)]*\)/gi, '')
    const proibidos: Array<[string, RegExp]> = [
      ['OMNXChat', /OMNXChat/],
      ['Automações WhatsApp', /Automações WhatsApp/],
      ['Onboarding', /\bOnboarding\b/],
      ['Recebíveis', /\bRecebíveis\b/],
      ['Demandas', /\bDemandas\b/],
      ['Kanban', /\bKanban\b/],
      ['Instâncias WhatsApp', /Instâncias WhatsApp/],
      ['Quadro de atendimento', /Quadro de atendimento/],
      ['reels', /\breels?\b/i],
      ['carrossel', /carross[ée]is|carrossel/i],
      ['stories', /\bstories\b/i],
      ['social media', /social media/i],
    ]
    const achados = proibidos.filter(([, re]) => re.test(visivel)).map(([nome]) => nome)
    expect(achados).toEqual([])
  })
})
