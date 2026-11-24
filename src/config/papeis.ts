/**
 * Papéis do Desk em linguagem de gente, com o equivalente no OMNX Clients.
 *
 * Só descrição: NENHUMA regra de acesso nasce daqui. Quem decide o que cada
 * perfil enxerga continua sendo `users.perfil` + `permissoes_app` + RLS
 * (ver docs/reestruturacao/NIVEIS-DE-ACESSO.md). Este arquivo alimenta a
 * leitura de "Papéis" em Admin → Permissões e a documentação de continuidade
 * (docs/reestruturacao/PAPEIS-E-PERMISSOES-CLIENTS.md).
 */
export interface PapelDescrito {
  /** Valor cru de `users.perfil`. */
  perfil: string
  rotulo: string
  /** O que a pessoa faz, em uma frase. */
  descricao: string
  /** Papel parecido no OMNX Clients (aproximação, não é igual). */
  equivalenteClients: string
  /** Existe usuário ativo com esse perfil hoje (documentação de 27/10/2026). */
  emUso: boolean
}

export const PAPEIS: PapelDescrito[] = [
  { perfil: 'admin', rotulo: 'Administrador', descricao: 'Acesso total à empresa; tem curinga permanente e não aparece na matriz.', equivalenteClients: 'Proprietário', emUso: true },
  { perfil: 'gerente', rotulo: 'Gestor', descricao: 'Gestão: contratos, equipe e a carteira inteira de clientes.', equivalenteClients: 'Gestor', emUso: true },
  { perfil: 'estrategista', rotulo: 'Estrategista', descricao: 'Atende os clientes que lhe foram designados.', equivalenteClients: 'CS', emUso: true },
  { perfil: 'atendimento', rotulo: 'Atendimento', descricao: 'Atende conversas e tickets; em Contratos vê só Vendas novas.', equivalenteClients: 'Técnico', emUso: true },
  { perfil: 'admin_cobranca', rotulo: 'Gestor de cobrança', descricao: 'Gestão do app de Cobrança.', equivalenteClients: 'Gestor (só financeiro)', emUso: false },
  { perfil: 'agente_chat', rotulo: 'Atendente de conversas', descricao: 'Opera a caixa de entrada de conversas.', equivalenteClients: 'Técnico', emUso: false },
  { perfil: 'agente_cobranca', rotulo: 'Agente de cobrança', descricao: 'Opera a fila de cobrança.', equivalenteClients: 'Técnico (só financeiro)', emUso: false },
  { perfil: 'cliente', rotulo: 'Cliente (portal)', descricao: 'Área externa: o cliente da empresa acompanha o que é dele.', equivalenteClients: 'Cliente final (portal)', emUso: true },
]
