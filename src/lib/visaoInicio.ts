/**
 * Visão do Início por papel — o equivalente ao seletor Gestão / CS / Técnico
 * do Dashboard do OMNX Clients.
 *
 * Só apresentação: a visão escolhe a ordem e o recorte do que o painel já
 * mostra. Nenhum dado novo é buscado e nenhum acesso muda — o que a pessoa
 * enxerga continua decidido por `users.perfil`, `permissoes_app` e RLS.
 */
export type VisaoInicio = 'gestao' | 'cs' | 'tecnico'

export const ROTULO_VISAO: Record<VisaoInicio, string> = {
  gestao: 'Gestão',
  cs: 'CS',
  tecnico: 'Técnico',
}

export const DESCRICAO_VISAO: Record<VisaoInicio, string> = {
  gestao: 'A operação inteira: filas, prazos e a carga de cada responsável.',
  cs: 'Quem está esperando: clientes aguardando a equipe, atrasos e reaberturas.',
  tecnico: 'Só os seus tickets: o que está com você e o que venceu.',
}

const PERFIS_GESTAO = new Set(['admin', 'gerente', 'admin_cobranca'])
const PERFIS_CS = new Set(['estrategista'])

/** Visões que o perfil pode escolher. Gestão só para quem gere a operação. */
export function visoesDoPerfil(perfil: string | null | undefined): VisaoInicio[] {
  if (perfil && PERFIS_GESTAO.has(perfil)) return ['gestao', 'cs', 'tecnico']
  return ['cs', 'tecnico']
}

/** Visão sugerida quando a pessoa ainda não escolheu (como o `defaultLens` do Clients). */
export function visaoSugerida(perfil: string | null | undefined): VisaoInicio {
  if (perfil && PERFIS_GESTAO.has(perfil)) return 'gestao'
  if (perfil && PERFIS_CS.has(perfil)) return 'cs'
  return 'tecnico'
}

/** A escolha salva só vale se ainda for uma visão permitida ao perfil. */
export function visaoEfetiva(perfil: string | null | undefined, escolhida: string | null | undefined): VisaoInicio {
  const permitidas = visoesDoPerfil(perfil)
  return permitidas.includes(escolhida as VisaoInicio) ? (escolhida as VisaoInicio) : visaoSugerida(perfil)
}

export const CHAVE_VISAO_INICIO = 'desk:inicio:visao'

export function lerVisaoSalva(): string | null {
  try {
    return window.localStorage.getItem(CHAVE_VISAO_INICIO)
  } catch {
    return null
  }
}

export function salvarVisao(visao: VisaoInicio): void {
  try {
    window.localStorage.setItem(CHAVE_VISAO_INICIO, visao)
  } catch {
    // Navegador sem armazenamento (aba anônima restrita): a escolha vale só nesta tela.
  }
}
