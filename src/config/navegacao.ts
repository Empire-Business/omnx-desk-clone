/**
 * Navegação do OMNX Desk — FONTE ÚNICA (auditoria 01, risco R9).
 *
 * Antes, cada menu (barra lateral, barra inferior do celular, menu do Chat,
 * ajuda com IA) tinha a sua própria lista de itens e as suas próprias regras de
 * "quem vê". Toda mudança exigia editar 5–6 arquivos, e um item aparecia no
 * computador e sumia no celular. Agora todos consomem daqui.
 *
 * Regras de acesso: são as MESMAS que já existiam espalhadas pelo código
 * (`app_modules` + `usePermissoes().can()` + perfil). Nada aqui concede acesso
 * novo — e esconder do menu não protege: a trava real continua na rota
 * (`RequireApp`), na página e na RLS do banco.
 *
 * Este arquivo não importa nada de runtime do Supabase, para poder ser lido
 * por testes, pela ajuda com IA e pelo manual sem efeitos colaterais.
 */
import type { LucideIcon } from 'lucide-react'
import {
  Activity,
  BarChart3,
  Bell,
  Blocks,
  Bot,
  Building2,
  CalendarClock,
  Clock,
  Columns3,
  Contact,
  FileText,
  GraduationCap,
  History,
  Home,
  KeyRound,
  LifeBuoy,
  Link2,
  ListChecks,
  MessageSquare,
  Network,
  PlugZap,
  Rocket,
  ScrollText,
  Send,
  Settings,
  Settings2,
  ShieldCheck,
  Smartphone,
  Star,
  StickyNote,
  Tags,
  Ticket,
  TriangleAlert,
  UserCircle,
  UserCog,
  Users,
} from 'lucide-react'
import type { AcaoPermissao } from '@/hooks/usePermissoes'
import type { AbaWa } from '@/lib/automacoesWa'

// ─── Regras de acesso ─────────────────────────────────────────────────────────

export type Permissao = { recurso: string; acao?: AcaoPermissao }

/** Todas as condições informadas precisam ser verdadeiras (E). */
export type RegraAcesso = {
  /** Slug do app em `app_modules`. App desligado = item some (fail-open). */
  app?: string
  /** Permissão da matriz exigida. */
  permissao?: Permissao
  /** Basta UMA destas permissões (OU). Ex.: Contratos ou só Vendas novas. */
  algumaPermissao?: Permissao[]
  /** Perfil exato (regra legada que ainda não migrou para a matriz). */
  perfis?: string[]
  /** Só o perfil `admin` (ex.: /admin, que edita a própria matriz). */
  somenteAdmin?: boolean
  /** Só administrador da empresa-mãe (provisionamento de empresas). */
  somenteMaster?: boolean
}

export type ContextoAcesso = {
  can: (recurso: string, acao?: AcaoPermissao) => boolean
  appLigado: (slug?: string) => boolean
  perfil: string | null | undefined
  master: boolean
}

/** Responde "esta pessoa pode ver este item?" — função pura, testável. */
export function podeAcessar(regra: RegraAcesso | undefined, ctx: ContextoAcesso): boolean {
  if (!regra) return true
  if (regra.app && !ctx.appLigado(regra.app)) return false
  if (regra.somenteAdmin && ctx.perfil !== 'admin') return false
  if (regra.somenteMaster && !ctx.master) return false
  if (regra.perfis && regra.perfis.length > 0 && !regra.perfis.includes(ctx.perfil ?? '')) return false
  if (regra.permissao && !ctx.can(regra.permissao.recurso, regra.permissao.acao ?? 'ver')) return false
  if (regra.algumaPermissao && regra.algumaPermissao.length > 0) {
    if (!regra.algumaPermissao.some((p) => ctx.can(p.recurso, p.acao ?? 'ver'))) return false
  }
  return true
}

// Regras reaproveitadas (as mesmas de antes, só com nome).
const R_CONVERSAS: RegraAcesso = { app: 'chat' }
const R_TICKETS: RegraAcesso = { app: 'atendimento', permissao: { recurso: 'atendimento' } }
const R_CONTRATOS: RegraAcesso = {
  app: 'contratos',
  algumaPermissao: [{ recurso: 'contratos' }, { recurso: 'contratos.onboarding' }],
}
const R_IRIS: RegraAcesso = { app: 'automacoes-wa', permissao: { recurso: 'automacoes-wa', acao: 'admin' } }
/** Abas "soGestao" da Íris (Tempo de resposta, Grupos e clientes). */
const R_IRIS_GESTAO: RegraAcesso = { ...R_IRIS, perfis: ['admin', 'gerente'] }
/** Reuniões marcadas: a mesma regra do cartão em Ajustes → WhatsApp. */
const R_AGENDA: RegraAcesso = { app: 'chat' }
/**
 * Aulas da equipe: os perfis que a RLS `team_read_internal_paths` deixa ler as
 * trilhas internas (montar trilha continua só para admin, na própria tela).
 */
const R_AULAS: RegraAcesso = { perfis: ['admin', 'gerente', 'estrategista', 'atendimento'] }
/** Só alcançável pelo cartão de /admin; a documentação já dizia "Só admin". */
const R_RELATORIOS: RegraAcesso = { somenteAdmin: true }
/**
 * Pesquisas NPS: a mesma trava do relatório NPS de /relatorios (só admin), que
 * é também quem a RLS `admin_manage_nps_surveys` deixa criar campanha.
 */
const R_PESQUISAS: RegraAcesso = R_RELATORIOS

// ─── Itens ────────────────────────────────────────────────────────────────────

export type ContadorNav = 'conversas' | 'notificacoes'

export type ItemNav = {
  id: string
  rotulo: string
  rota: string
  icone: LucideIcon
  /** Frase curta, em linguagem simples (cartões, painel "Mais", ajuda). */
  descricao?: string
  acesso?: RegraAcesso
  /** Prefixos de URL que acendem o item. Padrão: a própria rota. */
  ativoEm?: string[]
  /** Prefixos que NÃO acendem o item, mesmo dentro de `ativoEm` (ex.: a Agenda dentro de Conversas). */
  inativoEm?: string[]
  /** Acende só na rota exata (usado pelo Início, que é "/"). */
  exato?: boolean
  contador?: ContadorNav
}

export const ROTAS = {
  inicio: '/',
  conversas: '/conversas',
  tickets: '/tickets',
  clientes: '/clientes',
  gruposClientes: '/clientes/grupos',
  contratos: '/contratos',
  ia: '/ia',
  agenda: '/conversas/reunioes',
  aulas: '/aulas',
  relatorios: '/relatorios',
  pesquisas: '/relatorios/pesquisas',
  ajustes: '/ajustes',
  notificacoes: '/notificacoes',
  meusReportes: '/meus-reportes',
  configuracoes: '/configuracoes',
  manual: '/manual',
  seguranca: '/seguranca',
} as const

/**
 * Barra lateral (computador), em blocos como o menu do OMNX Clients:
 * Início · Clientes · Atendimento (Conversas, Tickets, Íris) · Agenda (Agenda, Aulas) ·
 * Financeiro (Contratos) · Análise (Relatórios, Pesquisas NPS). Nenhuma rota mudou de
 * endereço: Agenda é a tela de Reuniões e Relatórios continua só para admin.
 */
export const ITENS_PRINCIPAIS: ItemNav[] = [
  {
    id: 'inicio', rotulo: 'Início', rota: ROTAS.inicio, icone: Home, exato: true,
    descricao: 'O que precisa de você agora.',
    // Sem trava: a tela inicial existe para todos (HomePage decide o conteúdo).
  },
  {
    id: 'clientes', rotulo: 'Clientes', rota: ROTAS.clientes, icone: UserCircle,
    descricao: 'Ficha de cada cliente, com contratos, conversas e tickets.',
    ativoEm: ['/clientes'],
  },
  {
    id: 'conversas', rotulo: 'Conversas', rota: ROTAS.conversas, icone: MessageSquare,
    descricao: 'Conversas de WhatsApp com os clientes.',
    acesso: R_CONVERSAS, ativoEm: ['/conversas', '/chat'], inativoEm: [ROTAS.agenda], contador: 'conversas',
  },
  {
    id: 'tickets', rotulo: 'Tickets', rota: ROTAS.tickets, icone: Ticket,
    descricao: 'Pedidos dos clientes, do início até resolver.',
    acesso: R_TICKETS, ativoEm: ['/tickets', '/atendimento'],
  },
  {
    id: 'ia', rotulo: 'Íris', rota: ROTAS.ia, icone: Bot,
    descricao: 'A assistente de IA: avisos, pontos de atenção e tempo de resposta.',
    acesso: R_IRIS, ativoEm: ['/ia', '/automacoes-wa'],
  },
  {
    id: 'agenda', rotulo: 'Agenda', rota: ROTAS.agenda, icone: CalendarClock,
    descricao: 'Reuniões marcadas com os clientes.',
    acesso: R_AGENDA, ativoEm: [ROTAS.agenda, '/meet'],
  },
  {
    id: 'aulas', rotulo: 'Aulas', rota: ROTAS.aulas, icone: GraduationCap,
    descricao: 'Trilhas de aulas da equipe e o seu progresso.',
    acesso: R_AULAS, ativoEm: [ROTAS.aulas],
  },
  {
    id: 'contratos', rotulo: 'Contratos', rota: ROTAS.contratos, icone: FileText,
    descricao: 'Contratos, vendas novas e valores a receber.',
    acesso: R_CONTRATOS, ativoEm: ['/contratos'],
  },
  {
    id: 'relatorios', rotulo: 'Relatórios', rota: ROTAS.relatorios, icone: BarChart3,
    descricao: 'Relatórios da operação, com filtros e exportação.',
    acesso: R_RELATORIOS, ativoEm: [ROTAS.relatorios], inativoEm: [ROTAS.pesquisas],
  },
  {
    id: 'pesquisas', rotulo: 'Pesquisas NPS', rota: ROTAS.pesquisas, icone: Star,
    descricao: 'Campanhas de satisfação dos clientes, respostas e placar NPS.',
    acesso: R_PESQUISAS, ativoEm: [ROTAS.pesquisas],
  },
]

/** Rodapé da barra lateral. "Ajuda" não é rota: abre o ponto de ajuda. */
export const ITEM_AJUSTES: ItemNav = {
  id: 'ajustes', rotulo: 'Ajustes', rota: ROTAS.ajustes, icone: Settings,
  descricao: 'Sua conta, equipe, WhatsApp, permissões e suporte técnico.',
  ativoEm: ['/ajustes'],
}

/**
 * Barra inferior do celular: 4 destinos + "Mais". Se a pessoa não pode ver
 * algum deles (ex.: app de tickets desligado), ele some e os demais se
 * redistribuem; nada fica inalcançável, porque o painel "Mais" e o hub
 * Ajustes cobrem o resto.
 */
export const IDS_BARRA_INFERIOR = ['inicio', 'conversas', 'tickets', 'contratos'] as const

export const ITENS_BARRA_INFERIOR: ItemNav[] = IDS_BARRA_INFERIOR.map(
  (id) => ITENS_PRINCIPAIS.find((i) => i.id === id)!,
)

/** Painel "Mais" do celular (as ações Ajuda, tema e Sair ficam no próprio painel). */
export const ITENS_MAIS: ItemNav[] = [
  ITENS_PRINCIPAIS.find((i) => i.id === 'clientes')!,
  ITENS_PRINCIPAIS.find((i) => i.id === 'ia')!,
  ITENS_PRINCIPAIS.find((i) => i.id === 'agenda')!,
  ITENS_PRINCIPAIS.find((i) => i.id === 'aulas')!,
  ITENS_PRINCIPAIS.find((i) => i.id === 'relatorios')!,
  ITENS_PRINCIPAIS.find((i) => i.id === 'pesquisas')!,
  ITEM_AJUSTES,
  {
    id: 'notificacoes', rotulo: 'Notificações', rota: ROTAS.notificacoes, icone: Bell,
    descricao: 'Avisos do sistema para você.', contador: 'notificacoes',
  },
  {
    id: 'meus-reportes', rotulo: 'Meus pedidos de suporte', rota: ROTAS.meusReportes, icone: LifeBuoy,
    descricao: 'Acompanhe os problemas que você relatou.',
  },
  {
    // Substitui o antigo botão "Você" da barra inferior.
    id: 'perfil', rotulo: 'Meu perfil', rota: ROTAS.configuracoes, icone: UserCog,
    descricao: 'Nome, foto, senha, tema e notificações.',
  },
]

// ─── Abas internas ────────────────────────────────────────────────────────────

/** Abas de Conversas. Engrenagem = Números e acessos (mesma regra do menu antigo). */
export const ABAS_CONVERSAS: ItemNav[] = [
  { id: 'caixa', rotulo: 'Caixa de entrada', rota: '/conversas', icone: MessageSquare, exato: true, contador: 'conversas' },
  { id: 'quadro', rotulo: 'Quadro', rota: '/conversas/quadro', icone: Columns3 },
  { id: 'contatos', rotulo: 'Contatos', rota: '/conversas/contatos', icone: Contact },
  { id: 'anotacoes', rotulo: 'Anotações', rota: '/conversas/anotacoes', icone: StickyNote },
  {
    id: 'configurar', rotulo: 'Números e acessos', rota: '/conversas/configurar', icone: Settings2,
    acesso: { perfis: ['admin', 'gerente'] },
  },
]

/**
 * Abas de Tickets — para a reforma de `AtendimentoTabs` (outra frente) consumir.
 * As regras repetem as de hoje: Análise exige o app Chat + `chat.ver`;
 * Configurar exige `atendimento.admin`.
 */
export const ABAS_TICKETS: ItemNav[] = [
  { id: 'inicio', rotulo: 'Painel', rota: '/', icone: Home, exato: true },
  { id: 'lista', rotulo: 'Tickets', rota: '/tickets', icone: ListChecks, exato: true },
  { id: 'quadro', rotulo: 'Quadro de tickets', rota: '/tickets/quadro', icone: Columns3 },
  {
    id: 'analise', rotulo: 'Análise das conversas', rota: '/tickets/analise', icone: BarChart3,
    acesso: { app: 'chat', permissao: { recurso: 'chat' } },
  },
  {
    id: 'configurar', rotulo: 'Configurar', rota: '/tickets/configurar', icone: Settings2,
    acesso: { permissao: { recurso: 'atendimento', acao: 'admin' } },
  },
]

/**
 * Abas da Íris. `aba` é a chave interna (AbaWa) usada pelos componentes de
 * `components/automacoes-wa`; `rota` é o endereço novo. "Grupos e clientes"
 * mora em Clientes, mas segue listado aqui para quem já procura pela Íris.
 */
export const ABAS_IRIS: Array<ItemNav & { aba: AbaWa; segmento: string }> = [
  { id: 'iris', aba: 'assistente', segmento: '', rotulo: 'Íris', rota: '/ia', icone: Bot, exato: true },
  { id: 'alertas', aba: 'alertas', segmento: 'alertas', rotulo: 'Pontos de atenção', rota: '/ia/alertas', icone: TriangleAlert },
  {
    id: 'tempo-resposta', aba: 'tempo-resposta', segmento: 'tempo-resposta', rotulo: 'Tempo de resposta',
    rota: '/ia/tempo-resposta', icone: Clock, acesso: { perfis: ['admin', 'gerente'] },
  },
  { id: 'aviso-diario', aba: 'relatorio', segmento: 'aviso-diario', rotulo: 'Aviso diário', rota: '/ia/aviso-diario', icone: Send },
  { id: 'resumo-semanal', aba: 'resumo', segmento: 'resumo-semanal', rotulo: 'Resumo semanal', rota: '/ia/resumo-semanal', icone: ScrollText },
  { id: 'reunioes', aba: 'reunioes', segmento: 'reunioes', rotulo: 'Reuniões', rota: '/ia/reunioes', icone: CalendarClock },
  { id: 'historico', aba: 'historico', segmento: 'historico', rotulo: 'Histórico', rota: '/ia/historico', icone: History },
  { id: 'conexao', aba: 'conexao', segmento: 'conexao', rotulo: 'Conexão', rota: '/ia/conexao', icone: PlugZap },
  { id: 'comecar', aba: 'inicio', segmento: 'comecar', rotulo: 'Primeiros passos', rota: '/ia/comecar', icone: Rocket },
  {
    id: 'grupos', aba: 'vinculos', segmento: '', rotulo: 'Grupos e clientes', rota: ROTAS.gruposClientes,
    icone: Link2, acesso: { perfis: ['admin', 'gerente'] },
  },
]

/** Endereço novo de uma aba da Íris (substitui `/automacoes-wa/<aba>`). */
export function rotaAbaIris(aba: AbaWa): string {
  return ABAS_IRIS.find((a) => a.aba === aba)?.rota ?? ROTAS.ia
}

/** Segmento da URL (`/ia/<segmento>`) → aba interna. `undefined` = /ia (Íris). */
export function abaIrisDoSegmento(segmento: string | undefined): AbaWa | null {
  const alvo = segmento ?? ''
  const aba = ABAS_IRIS.find((a) => a.aba !== 'vinculos' && a.segmento === alvo)
  return aba ? aba.aba : null
}

// ─── Hub "Ajustes" (§3.3) ─────────────────────────────────────────────────────

export type GrupoAjustes = { id: string; titulo: string; descricao: string; cartoes: ItemNav[] }

export const GRUPOS_AJUSTES: GrupoAjustes[] = [
  {
    id: 'conta', titulo: 'Minha conta', descricao: 'Do seu jeito, só para você.',
    cartoes: [
      {
        id: 'perfil', rotulo: 'Perfil, aparência e notificações', rota: ROTAS.configuracoes, icone: UserCog,
        descricao: 'Seu nome, foto, senha, tema claro ou escuro e avisos.',
      },
    ],
  },
  {
    id: 'empresa', titulo: 'Empresa', descricao: 'Vale para todas as pessoas da empresa.',
    cartoes: [
      {
        id: 'empresa', rotulo: 'Marca, ramo e integrações', rota: `${ROTAS.configuracoes}?secao=marca`, icone: Building2,
        descricao: 'Logo, cores, ramo de atuação e serviços ligados ao Desk.',
        acesso: { permissao: { recurso: 'configuracoes', acao: 'admin' } },
      },
    ],
  },
  {
    id: 'equipe', titulo: 'Equipe', descricao: 'Quem trabalha com você.',
    cartoes: [
      { id: 'colaboradores', rotulo: 'Colaboradores', rota: '/colaboradores', icone: Users, descricao: 'Pessoas da equipe, perfis e carteiras.' },
      { id: 'departamentos', rotulo: 'Departamentos', rota: '/departamentos', icone: Network, descricao: 'Times e áreas da empresa.' },
      { id: 'minha-equipe', rotulo: 'Minha equipe', rota: '/minha-equipe', icone: Users, descricao: 'Como está o seu time hoje.' },
    ],
  },
  {
    id: 'whatsapp', titulo: 'WhatsApp', descricao: 'Números, filas e mensagens automáticas.',
    cartoes: [
      {
        id: 'numeros', rotulo: 'Números e acessos', rota: '/conversas/configurar', icone: Smartphone,
        descricao: 'Números de WhatsApp conectados e quem vê cada um.',
        acesso: { app: 'chat', perfis: ['admin', 'gerente'] },
      },
      {
        id: 'filas', rotulo: 'Filas de atendimento', rota: '/conversas/filas', icone: ListChecks,
        descricao: 'Para qual time vai cada conversa.', acesso: { app: 'chat' },
      },
      {
        id: 'conexao-ia', rotulo: 'Conexão das mensagens automáticas', rota: '/ia/conexao', icone: PlugZap,
        descricao: 'Número usado pela Íris para enviar avisos.', acesso: R_IRIS,
      },
      {
        id: 'grupos', rotulo: 'Grupos e clientes', rota: ROTAS.gruposClientes, icone: Link2,
        descricao: 'Qual grupo ou conversa pertence a qual cliente.', acesso: R_IRIS_GESTAO,
      },
      {
        id: 'reunioes', rotulo: 'Reuniões marcadas', rota: '/conversas/reunioes', icone: CalendarClock,
        descricao: 'Reuniões agendadas pelas conversas.', acesso: { app: 'chat' },
      },
    ],
  },
  {
    id: 'trabalho', titulo: 'Tickets e contratos', descricao: 'Como o trabalho é organizado.',
    cartoes: [
      {
        id: 'tickets-config', rotulo: 'Etapas e tipos de ticket', rota: '/tickets/configurar', icone: Settings2,
        descricao: 'As etapas por onde um ticket passa.',
        acesso: { app: 'atendimento', permissao: { recurso: 'atendimento', acao: 'admin' } },
      },
      {
        id: 'produtos', rotulo: 'Produtos de contrato', rota: '/contratos/produtos', icone: Blocks,
        descricao: 'O que a empresa vende e os modelos de contrato.',
        acesso: { app: 'contratos', permissao: { recurso: 'contratos', acao: 'admin' } },
      },
      {
        id: 'etiquetas', rotulo: 'Etiquetas de contrato', rota: '/contratos/tags', icone: Tags,
        descricao: 'Marcadores para organizar contratos.',
        acesso: { app: 'contratos', permissao: { recurso: 'contratos', acao: 'admin' } },
      },
    ],
  },
  {
    id: 'permissoes', titulo: 'Permissões e módulos', descricao: 'Quem pode o quê e o que está ligado.',
    cartoes: [
      {
        id: 'admin', rotulo: 'Quem pode o quê', rota: '/admin', icone: ShieldCheck,
        descricao: 'Permissões por perfil e configurações gerais.', acesso: { somenteAdmin: true },
      },
      {
        id: 'apps', rotulo: 'Módulos ligados', rota: '/apps', icone: Blocks,
        descricao: 'Ligue ou desligue partes do sistema.', acesso: { permissao: { recurso: 'apps', acao: 'admin' } },
      },
    ],
  },
  {
    id: 'suporte', titulo: 'Suporte técnico', descricao: 'Para quem cuida do sistema.',
    cartoes: [
      {
        id: 'reportes', rotulo: 'Problemas relatados', rota: '/reportes', icone: LifeBuoy,
        descricao: 'Tudo o que a equipe relatou, para resolver.', acesso: { permissao: { recurso: 'reportes', acao: 'admin' } },
      },
      {
        id: 'saude', rotulo: 'Saúde do sistema', rota: '/saude', icone: Activity,
        descricao: 'Falhas registradas automaticamente.', acesso: { permissao: { recurso: 'auditoria', acao: 'admin' } },
      },
      {
        id: 'auditoria', rotulo: 'Registro de ações', rota: '/auditoria', icone: ScrollText,
        descricao: 'Quem fez o quê, e quando.', acesso: { permissao: { recurso: 'auditoria', acao: 'admin' } },
      },
      {
        id: 'api', rotulo: 'Chaves de acesso para outros sistemas', rota: '/api-webhooks', icone: KeyRound,
        descricao: 'Ligue o Desk a outros programas.', acesso: { permissao: { recurso: 'configuracoes', acao: 'admin' } },
      },
      {
        id: 'empresas', rotulo: 'Empresas', rota: '/empresas', icone: Building2,
        descricao: 'Cadastro de empresas na plataforma.', acesso: { somenteMaster: true },
      },
    ],
  },
]

/**
 * Travas de página (R8) para telas que não tinham nenhuma além da RLS e agora
 * aparecem no hub. O App.tsx envolve a rota com estas regras.
 */
export const TRAVAS_DE_PAGINA = {
  admin: { somenteAdmin: true } satisfies RegraAcesso,
  auditoria: { permissao: { recurso: 'auditoria', acao: 'admin' } } satisfies RegraAcesso,
  apiWebhooks: { permissao: { recurso: 'configuracoes', acao: 'admin' } } satisfies RegraAcesso,
  relatorios: R_RELATORIOS,
  aulas: R_AULAS,
  pesquisas: R_PESQUISAS,
} as const

// ─── Ativo / contadores ───────────────────────────────────────────────────────

export function itemAtivo(item: Pick<ItemNav, 'rota' | 'ativoEm' | 'inativoEm' | 'exato'>, pathname: string): boolean {
  if (item.exato) return pathname === item.rota
  const casa = (p: string) => pathname === p || pathname.startsWith(`${p}/`)
  if (item.inativoEm?.some(casa)) return false
  return (item.ativoEm ?? [item.rota]).some(casa)
}

// ─── Destinos (para a ajuda com IA e o manual) ────────────────────────────────

export type Destino = {
  id: string
  nome: string
  rota: string
  descricao: string
  /** Nomes antigos e sinônimos que as pessoas podem usar ao perguntar. */
  sinonimos: string[]
  acesso?: RegraAcesso
}

export const DESTINOS: Destino[] = [
  { id: 'inicio', nome: 'Início', rota: '/', descricao: 'Painel com o que precisa de ação agora.', sinonimos: ['Atendimento', 'painel', 'tela inicial', 'dashboard'] },
  { id: 'conversas', nome: 'Conversas', rota: '/conversas', descricao: 'Caixa de entrada do WhatsApp.', sinonimos: ['OMNXChat', 'Chat', 'Inbox', 'WhatsApp', 'mensagens'], acesso: R_CONVERSAS },
  { id: 'conversas-quadro', nome: 'Quadro de conversas', rota: '/conversas/quadro', descricao: 'Conversas organizadas em colunas por situação.', sinonimos: ['Kanban do Chat', 'Kanban de Atendimento'], acesso: R_CONVERSAS },
  { id: 'conversas-contatos', nome: 'Contatos', rota: '/conversas/contatos', descricao: 'Contatos de WhatsApp.', sinonimos: ['Contatos do Chat'], acesso: R_CONVERSAS },
  { id: 'conversas-anotacoes', nome: 'Anotações', rota: '/conversas/anotacoes', descricao: 'Anotações sobre conversas e clientes.', sinonimos: ['notas'], acesso: R_CONVERSAS },
  { id: 'tickets', nome: 'Tickets', rota: '/tickets', descricao: 'Lista de pedidos dos clientes.', sinonimos: ['Demandas', 'Atendimento', 'chamados', 'pedidos'], acesso: R_TICKETS },
  { id: 'tickets-quadro', nome: 'Quadro de tickets', rota: '/tickets/quadro', descricao: 'Tickets em colunas por etapa.', sinonimos: ['Quadro de atendimento', 'Kanban de demandas'], acesso: R_TICKETS },
  { id: 'tickets-analise', nome: 'Análise das conversas', rota: '/tickets/analise', descricao: 'Como os clientes estão se sentindo nas conversas.', sinonimos: ['Sentimento', 'Relatório semanal do Chat', 'Análise sentimental'], acesso: { ...R_TICKETS, algumaPermissao: [{ recurso: 'chat' }] } },
  { id: 'clientes', nome: 'Clientes', rota: '/clientes', descricao: 'Cadastro e ficha de cada cliente.', sinonimos: ['carteira', 'CRM'] },
  { id: 'grupos-clientes', nome: 'Grupos e clientes', rota: '/clientes/grupos', descricao: 'Liga grupos e conversas de WhatsApp aos clientes.', sinonimos: ['Vínculos', 'vincular grupo'], acesso: R_IRIS_GESTAO },
  { id: 'contratos', nome: 'Contratos', rota: '/contratos', descricao: 'Visão geral dos contratos.', sinonimos: ['Dashboard de contratos'], acesso: R_CONTRATOS },
  { id: 'vendas-novas', nome: 'Vendas novas', rota: '/contratos/onboarding', descricao: 'Vendas que chegaram e precisam virar contrato.', sinonimos: ['Onboarding', 'vendas pendentes'], acesso: R_CONTRATOS },
  { id: 'a-receber', nome: 'A receber', rota: '/contratos/recebiveis', descricao: 'Parcelas e valores previstos.', sinonimos: ['Recebíveis', 'fluxo futuro'], acesso: { app: 'contratos', permissao: { recurso: 'contratos' } } },
  { id: 'produtos-contrato', nome: 'Produtos de contrato', rota: '/contratos/produtos', descricao: 'O que a empresa vende e os modelos de contrato.', sinonimos: ['Produtos', 'catálogo', 'modelos de contrato'], acesso: { app: 'contratos', permissao: { recurso: 'contratos', acao: 'admin' } } },
  { id: 'iris', nome: 'Íris', rota: '/ia', descricao: 'Configuração da assistente de IA.', sinonimos: ['Automações WhatsApp', 'assistente', 'IA'], acesso: R_IRIS },
  { id: 'pontos-atencao', nome: 'Pontos de atenção', rota: '/ia/alertas', descricao: 'Clientes esperando, insatisfeitos ou contratos parados.', sinonimos: ['alertas'], acesso: R_IRIS },
  { id: 'tempo-resposta', nome: 'Tempo de resposta', rota: '/ia/tempo-resposta', descricao: 'Quanto a equipe demora para responder.', sinonimos: ['SLA', 'demora'], acesso: R_IRIS_GESTAO },
  { id: 'aviso-diario', nome: 'Aviso diário', rota: '/ia/aviso-diario', descricao: 'Mensagem diária para os gestores.', sinonimos: ['Relatório diário', 'relatório para gestores'], acesso: R_IRIS },
  { id: 'resumo-semanal', nome: 'Resumo semanal', rota: '/ia/resumo-semanal', descricao: 'Resumo semanal enviado ao cliente.', sinonimos: ['resumo para o cliente'], acesso: R_IRIS },
  { id: 'agenda', nome: 'Agenda', rota: '/conversas/reunioes', descricao: 'Reuniões marcadas com os clientes.', sinonimos: ['Reuniões', 'Reuniões marcadas', 'calendário', 'encontros'], acesso: R_AGENDA },
  { id: 'aulas', nome: 'Aulas da equipe', rota: '/aulas', descricao: 'Trilhas de aulas da equipe, com o seu progresso.', sinonimos: ['Aulas', 'Trilhas', 'treinamento', 'cursos', 'capacitação'], acesso: R_AULAS },
  { id: 'relatorios', nome: 'Relatórios', rota: '/relatorios', descricao: 'Relatórios da operação, com filtros e exportação.', sinonimos: ['Relatórios da operação', 'NPS', 'performance'], acesso: TRAVAS_DE_PAGINA.relatorios },
  { id: 'pesquisas', nome: 'Pesquisas NPS', rota: '/relatorios/pesquisas', descricao: 'Campanhas de NPS: criar a pesquisa de um cliente, copiar o link e ver as respostas.', sinonimos: ['Pesquisas', 'Pesquisa de satisfação', 'Campanha de NPS', 'NPS'], acesso: TRAVAS_DE_PAGINA.pesquisas },
  { id: 'permissoes', nome: 'Quem pode o quê', rota: '/admin', descricao: 'Permissões por perfil e configurações gerais.', sinonimos: ['Admin', 'Permissões', 'acessos'], acesso: TRAVAS_DE_PAGINA.admin },
  { id: 'ajustes', nome: 'Ajustes', rota: '/ajustes', descricao: 'Conta, equipe, WhatsApp, permissões e suporte técnico.', sinonimos: ['Configurações', 'Admin', 'preferências'] },
  { id: 'perfil', nome: 'Meu perfil', rota: '/configuracoes', descricao: 'Nome, foto, senha, tema e notificações.', sinonimos: ['Configurações', 'Você', 'minha conta'] },
  { id: 'colaboradores', nome: 'Colaboradores', rota: '/colaboradores', descricao: 'Pessoas da equipe.', sinonimos: ['usuários', 'Gerenciar colaboradores'] },
  { id: 'numeros-whatsapp', nome: 'Números e acessos', rota: '/conversas/configurar', descricao: 'Números de WhatsApp e quem vê cada um.', sinonimos: ['Instâncias', 'Acessos', 'Aquecimento', 'Configurações do Chat'], acesso: { app: 'chat', perfis: ['admin', 'gerente'] } },
  { id: 'notificacoes', nome: 'Notificações', rota: '/notificacoes', descricao: 'Avisos do sistema.', sinonimos: ['sino', 'alertas'] },
  { id: 'meus-reportes', nome: 'Meus pedidos de suporte', rota: '/meus-reportes', descricao: 'Problemas que você relatou.', sinonimos: ['Meus reportes', 'suporte'] },
  { id: 'reportes', nome: 'Problemas relatados', rota: '/reportes', descricao: 'Triagem dos problemas relatados pela equipe.', sinonimos: ['Reportes'], acesso: { permissao: { recurso: 'reportes', acao: 'admin' } } },
  { id: 'manual', nome: 'Manual de uso', rota: '/manual', descricao: 'Guia completo do Desk.', sinonimos: ['FAQ', 'Tutoriais', 'ajuda'] },
]
