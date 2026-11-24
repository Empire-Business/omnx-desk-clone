import { SECOES_MANUAL } from './manualPlataforma'
import { DESTINOS, podeAcessar, type ContextoAcesso, type RegraAcesso } from '@/config/navegacao'
export { respostaLocalAjuda, fontesAjudaValidas, LIMITE_PERGUNTA_AJUDA } from '../../supabase/functions/_shared/iris-ajuda-conhecimento'

export type RespostaAjuda = { modo: 'ia' | 'manual'; texto: string; fontes: string[] }
type DestinoAjuda = { caminho: string; rotulo: string }

/**
 * Seção do manual → destino em `DESTINOS` (src/config/navegacao.ts, fonte única).
 * Rota, nome e regra de acesso vêm de lá; `extra` só mantém exigências que a
 * ajuda já tinha além da regra do menu. Nenhum destino é obtido do texto da IA,
 * da pergunta ou da resposta HTTP: só os ids desta tabela existem.
 */
const SECAO_PARA_DESTINO: Record<string, { destino: string; extra?: RegraAcesso }> = {
  clientes: { destino: 'clientes', extra: { permissao: { recurso: 'clientes' } } },
  responsaveis: { destino: 'clientes', extra: { permissao: { recurso: 'clientes' } } },
  contratos: { destino: 'contratos' },
  financeiro: { destino: 'a-receber' },
  produtos: { destino: 'produtos-contrato' },
  chat: { destino: 'conversas', extra: { permissao: { recurso: 'chat' } } },
  atendimento: { destino: 'tickets' },
  colaboradores: { destino: 'colaboradores', extra: { permissao: { recurso: 'colaboradores' } } },
  configuracoes: { destino: 'perfil', extra: { permissao: { recurso: 'configuracoes' } } },
  relatorios: { destino: 'relatorios' },
  aulas: { destino: 'aulas' },
  pesquisas: { destino: 'pesquisas' },
  acessos: { destino: 'permissoes' },
  iris: { destino: 'iris' },
  whatsapp: { destino: 'aviso-diario' },
  'tempo-resposta': { destino: 'tempo-resposta' },
  suporte: { destino: 'meus-reportes' },
}

/** Ids de seção que têm atalho (para testes). */
export const SECOES_COM_DESTINO: readonly string[] = Object.keys(SECAO_PARA_DESTINO)

export function destinoAjuda(
  id: string,
  can: ContextoAcesso['can'],
  appEnabled: (slug?: string) => boolean,
  perfil?: { perfil?: string | null; master?: boolean },
): DestinoAjuda | null {
  const m = Object.hasOwn(SECAO_PARA_DESTINO, id) ? SECAO_PARA_DESTINO[id] : undefined
  const d = m && DESTINOS.find((x) => x.id === m.destino)
  if (!m || !d) return null
  const ctx: ContextoAcesso = { can, appLigado: appEnabled, perfil: perfil?.perfil, master: perfil?.master ?? false }
  if (!podeAcessar(d.acesso, ctx) || !podeAcessar(m.extra, ctx)) return null
  return { caminho: d.rota, rotulo: `Abrir ${d.nome === 'Íris' ? 'a Íris' : d.nome}` }
}
export function secaoAjuda(id: string) { return SECOES_MANUAL.find(s => s.id === id) }
/**
 * Tema do manual conforme a tela aberta. Endereços novos e antigos (os antigos
 * só aparecem no instante do redirecionamento).
 */
export function temaAjuda(path: string) {
  if (path === '/') return 'atendimento'
  if (path === '/clientes/grupos' || path.startsWith('/clientes/grupos/')) return 'iris'
  const prefixos: Record<string, string> = {
    tickets: 'atendimento', atendimento: 'atendimento',
    conversas: 'chat', chat: 'chat',
    ia: 'iris', 'automacoes-wa': 'iris',
    clientes: 'clientes', contratos: 'contratos', colaboradores: 'colaboradores',
    configuracoes: 'configuracoes', ajustes: 'configuracoes',
    relatorios: 'relatorios', produtos: 'produtos', 'meus-reportes': 'suporte',
    aulas: 'aulas',
  }
  const segmento = path.split('/')[1]
  if (path.startsWith('/ia/tempo-resposta')) return 'tempo-resposta'
  if (path === '/relatorios/pesquisas' || path.startsWith('/relatorios/pesquisas/')) return 'pesquisas'
  return Object.hasOwn(prefixos, segmento) ? prefixos[segmento] : 'comecar'
}
