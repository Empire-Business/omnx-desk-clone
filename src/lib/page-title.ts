// Mapa de rota -> nome exibido (título do TopBar e da aba do navegador).
// A aba fica no formato "<nome da rota> | OMNX Desk".
const ROUTE_TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/clientes': 'Clientes',
  '/produtos': 'Produtos',
  '/notificacoes': 'Notificações',
  '/relatorios': 'Relatórios',
  '/configuracoes': 'Configurações',
  '/admin': 'Admin',
  '/api-webhooks': 'API & Webhooks',
  '/auditoria': 'Auditoria',
  '/departamentos': 'Departamentos',
  '/minha-equipe': 'Minha Equipe',
  '/colaboradores': 'Colaboradores',
  '/contratos': 'Contratos',
  '/chat': 'OMNXChat',
  '/cobranca': 'Cobrança',
  '/reunioes': 'Reuniões',
  '/vendas': 'Vendas',
}

/**
 * Resolve o nome da rota atual pelo pathname.
 * Tenta o match exato e depois o primeiro segmento (ex.: /clientes/123 -> Clientes).
 * Retorna `null` quando a rota não está mapeada (aí a aba mostra só "OMNX Desk").
 */
export function resolvePageTitle(pathname: string): string | null {
  if (ROUTE_TITLES[pathname]) return ROUTE_TITLES[pathname]
  const base = `/${pathname.split('/')[1]}`
  if (ROUTE_TITLES[base]) return ROUTE_TITLES[base]
  return null
}
