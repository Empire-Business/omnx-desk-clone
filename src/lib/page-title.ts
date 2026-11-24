// Mapa de rota -> nome exibido na aba do navegador ("<nome da rota> | OMNX Desk").
// Os nomes seguem a navegação de config/navegacao.ts (linguagem simples).
// Endereços antigos (/chat, /atendimento, /automacoes-wa) não aparecem aqui:
// eles são redirecionados para os novos antes de qualquer tela abrir.
const ROUTE_TITLES: Record<string, string> = {
  '/': 'Início',
  '/dashboard-legado': 'Painel antigo',
  '/tickets': 'Tickets',
  '/tickets/quadro': 'Quadro de tickets',
  '/tickets/prazos': 'Prazos',
  '/tickets/analise': 'Análise das conversas',
  '/tickets/configurar': 'Configurar tickets',
  '/clientes': 'Clientes',
  '/clientes/grupos': 'Grupos e clientes',
  '/produtos': 'Produtos',
  '/notificacoes': 'Notificações',
  '/relatorios': 'Relatórios',
  '/relatorios/pesquisas': 'Pesquisas NPS',
  '/aulas': 'Aulas da equipe',
  '/ajustes': 'Ajustes',
  '/configuracoes': 'Meu perfil',
  '/seguranca': 'Segurança, privacidade e IA',
  '/admin': 'Quem pode o quê',
  '/apps': 'Módulos ligados',
  '/empresas': 'Empresas',
  '/reportes': 'Problemas relatados',
  '/meus-reportes': 'Meus pedidos de suporte',
  '/saude': 'Saúde do sistema',
  '/disparo': 'Disparos',
  '/api-webhooks': 'Chaves de acesso',
  '/auditoria': 'Registro de ações',
  '/departamentos': 'Departamentos',
  '/minha-equipe': 'Minha equipe',
  '/colaboradores': 'Colaboradores',
  '/contratos': 'Contratos',
  '/contratos/lista': 'Lista de contratos',
  '/contratos/kanban': 'Quadro de contratos',
  '/contratos/onboarding': 'Vendas novas',
  '/contratos/produtos': 'Produtos de contratos',
  '/contratos/tags': 'Etiquetas de contratos',
  '/contratos/recebiveis': 'A receber',
  '/conversas': 'Conversas',
  '/conversas/quadro': 'Quadro de conversas',
  '/conversas/contatos': 'Contatos',
  '/conversas/anotacoes': 'Anotações',
  '/conversas/configurar': 'Números e acessos',
  '/conversas/filas': 'Filas de atendimento',
  '/conversas/reunioes': 'Reuniões',
  '/cobranca': 'Cobrança',
  '/ia': 'Íris',
  '/ia/alertas': 'Pontos de atenção',
  '/ia/tempo-resposta': 'Tempo de resposta',
  '/ia/aviso-diario': 'Aviso diário',
  '/ia/resumo-semanal': 'Resumo semanal',
  '/ia/reunioes': 'Reuniões',
  '/ia/historico': 'Histórico da Íris',
  '/ia/conexao': 'Conexão da Íris',
  '/ia/comecar': 'Primeiros passos',
  '/vendas': 'Vendas',
  '/portal': 'Portal do cliente',
}

/**
 * Resolve o nome da rota atual pelo pathname.
 * Tenta o match exato e depois o primeiro segmento (ex.: /clientes/123 -> Clientes).
 * Retorna `null` quando a rota não está mapeada (aí a aba mostra só "OMNX Desk").
 */
export function resolvePageTitle(pathname: string): string | null {
  if (Object.hasOwn(ROUTE_TITLES, pathname)) return ROUTE_TITLES[pathname]
  const base = `/${pathname.split('/')[1]}`
  if (Object.hasOwn(ROUTE_TITLES, base)) return ROUTE_TITLES[base]
  return null
}
