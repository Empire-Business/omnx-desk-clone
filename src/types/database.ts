export type UserProfile = 'admin' | 'gerente' | 'atendimento' | 'estrategista' | 'cliente'
export type InstanceCategoria = 'suporte' | 'financeiro' | 'entrega'
export type DeliveryStatus = 'rascunho' | 'aguardando_aprovacao' | 'em_revisao' | 'aprovado' | 'reprovado' | 'publicado'
export type DeliverableType = 'post_feed' | 'stories' | 'reels' | 'video' | 'copy' | 'arte' | 'relatorio' | 'outro'
export type ContentType = 'imagem' | 'video' | 'documento' | 'link' | 'texto'

export interface User {
  id: string; nome: string; email: string; perfil: UserProfile; ativo: boolean; criado_em: string
  department_id: string | null; foto_url: string | null
  last_seen_at: string | null
  inativacao_motivo: string | null; inativacao_em: string | null; inativacao_por: string | null
  /** Liberação individual do módulo Contratos, independente do perfil. */
  acesso_contratos: boolean
}
export interface Client {
  id: string; nome: string; razao_social: string | null; cnpj: string | null; email: string | null
  telefone: string | null; segmento: string | null; logo_url: string | null; ativo: boolean
  endereco: string | null; instagram: string | null; faturamento: string | null
  posicionamento: string | null; notas: string | null; whatsapp: string | null
  nicho: string | null; empresa: string | null
  nota: number | null
  criado_em: string; atualizado_em: string
}
export interface ClientContract {
  id: string; client_id: string
  produto: string | null; status: string | null; especialista: string | null
  vendedor: string | null; treinador: string | null; funil: string | null
  valor_entrada: string | null; num_parcelas: number | null; valor_parcela: string | null
  faturamento_bruto: string | null; forma_pagamento: string | null
  data_assinatura: string | null; data_pg_entrada: string | null; plano_dias: number | null
  data_vencimento: string | null; data_renovacao: string | null
  link_clicksign: string | null
  bonus: string | null; upgrade: string | null; cancelamento: string | null
  seguidores_inicio: number | null; seguidores_fim: number | null; crescimento_seguidores: number | null
  videos_postados: number | null; entregas_prazo: number | null; entregas_totais: number | null
  nps: string | null; semanas: number | null
  venda_interna: boolean; venda_diretoria: boolean; financeiro_ok: boolean; email_enviado: boolean
  comprovante_entrada: string | null; notas: string | null
  criado_em: string; atualizado_em: string
}
export interface ClientAssignment {
  id: string; client_id: string; user_id: string; tipo: 'estrategista' | 'atendimento'; ativo: boolean; criado_em: string
}
export interface UserInstanceAssignment {
  id: string; user_id: string; instance_id: string; criado_em: string
}
export interface Product {
  id: string; client_id: string; nome: string; descricao: string | null; ativo: boolean; criado_em: string; atualizado_em: string
}
export interface Deliverable {
  id: string; product_id: string; nome: string; tipo: DeliverableType; descricao: string | null; quantidade: number; criado_em: string; atualizado_em: string
}
export interface Delivery {
  id: string; deliverable_id: string; client_id: string; titulo: string; status: DeliveryStatus
  responsavel_id: string | null; prazo: string | null; criado_em: string; atualizado_em: string
}
export interface DeliveryVersion {
  id: string; delivery_id: string; versao: number; notas: string | null; criado_por: string | null; criado_em: string
}
export interface DeliveryContentItem {
  id: string; version_id: string; tipo: ContentType; url: string | null; texto: string | null; nome: string | null; tamanho: number | null; criado_em: string
}
export interface DeliveryApproval {
  id: string; delivery_id: string; version_id: string; aprovado_por: string | null; aprovado: boolean; notas: string | null; criado_em: string
}
export interface DeliveryComment {
  id: string; delivery_id: string; version_id: string | null; autor_id: string | null; texto: string; criado_em: string
}

// Chat
export interface WaInstanceRow {
  id: string; nome: string; numero_whatsapp: string | null; instance_id: string
  status: 'conectado' | 'desconectado' | 'aguardando_qr' | 'banido'; categoria: InstanceCategoria | null; ativo: boolean; criado_em: string; ocultar_grupos: boolean; cor: string | null
}
export interface ChatDepartmentRow {
  id: string; nome: string; instance_id: string | null; distribuicao: string
  sla_primeira_resposta_minutos: number; sla_resolucao_horas: number
  mensagem_boas_vindas: string | null; ativo: boolean
  gerente_id: string | null
}
export interface DepartmentInstanceAssignment {
  id: string; department_id: string; instance_id: string; criado_em: string
}
export interface ChatContactRow {
  id: string; instance_id: string; numero_whatsapp: string; nome: string | null; foto_url: string | null; client_id: string | null
}
export interface ChatConversationRow {
  id: string; instance_id: string; contact_id: string; department_id: string | null
  agente_id: string | null; status: 'aberta' | 'em_atendimento' | 'aguardando' | 'encerrada'
  protocolo: string; criado_em: string; atualizado_em: string
  sla_primeira_resposta_violado: boolean; sla_resolucao_violado: boolean
  primeira_resposta_em: string | null; encerrada_em: string | null
}
export interface ChatMessageRow {
  id: string; conversation_id: string; tipo: string; conteudo: string | null; media_url: string | null
  enviado_por_agente: boolean; enviado_por_ia: boolean; agente_id: string | null; lida: boolean; criado_em: string
}

// Cobrança
export interface CobrancaInstanceRow {
  id: string; nome: string; instance_id: string; numero_whatsapp: string | null; status: string
  envios_hora_max: number; intervalo_min_segundos: number; intervalo_max_segundos: number
  horario_inicio: string; horario_fim: string; ativo: boolean
}
export interface CobrancaReguaRow {
  id: string; nome: string; descricao: string | null; ativo: boolean; criado_em: string
}
export interface CobrancaReguaPassoRow {
  id: string; regua_id: string; ordem: number; dias_apos_anterior: number
  mensagem_template: string; usar_ia_variacao: boolean
}
export interface CobrancaDevedorRow {
  id: string; instance_id: string; regua_id: string | null; nome: string; numero_whatsapp: string
  valor_divida: number | null; descricao_divida: string | null; data_vencimento: string | null
  status: 'ativa' | 'pausada' | 'encerrada' | 'pago'; passo_atual: number
  proximo_envio_em: string | null; criado_em: string
}
export interface CobrancaSendRow {
  id: string; devedor_id: string; passo: number; mensagem_enviada: string; status_envio: string; enviado_em: string
}

// NPS
export interface NpsSurveyRow {
  id: string; client_id: string; delivery_id: string | null; enviado_em: string; respondido_em: string | null; criado_em: string
}
export interface NpsResponseRow {
  id: string; survey_id: string; respondido_por: string | null; nota: number; comentario: string | null; criado_em: string
}

// Trilhas
export interface LearningPathRow {
  id: string; titulo: string; descricao: string | null; tipo: 'interno' | 'cliente'
  thumbnail_url: string | null; ativo: boolean; ordem: number; criado_em: string; atualizado_em: string
}
export interface LearningModuleRow {
  id: string; path_id: string; titulo: string; descricao: string | null; ordem: number; criado_em: string
}
export interface LearningLessonRow {
  id: string; module_id: string; titulo: string; descricao: string | null
  tipo: 'video' | 'texto' | 'pdf' | 'link'; conteudo_url: string | null; conteudo_texto: string | null
  duracao_minutos: number | null; ordem: number; criado_em: string
}
export interface LearningProgressRow {
  id: string; user_id: string; lesson_id: string; concluido: boolean; concluido_em: string | null; criado_em: string
}

// IA Bot
export interface IaBotRow {
  id: string; nome: string; descricao: string | null; instance_id: string | null; department_id: string | null
  modelo_openrouter: string; system_prompt: string | null; temperatura: number; ativo: boolean; criado_em: string; atualizado_em: string
}
export interface IaBotDocumentRow {
  id: string; bot_id: string; nome: string; tipo: 'texto' | 'pdf' | 'url'; conteudo: string | null; url: string | null; criado_em: string
}
export interface IaBotActivationRuleRow {
  id: string; bot_id: string; tipo: 'fora_horario' | 'palavra_chave' | 'sempre' | 'novo_contato'; valor: string | null; criado_em: string
}
export interface IaBotExecutionLogRow {
  id: string; bot_id: string; conversation_id: string; tokens_input: number | null
  tokens_output: number | null; escalada: boolean; erro: string | null; criado_em: string
}

// Sales pipelines
export interface SalesPipeline {
  id: string; nome: string; descricao: string | null; ordem: number; ativo: boolean
  criado_por: string | null; criado_em: string; atualizado_em: string
}
export interface SalesStage {
  id: string; pipeline_id: string; nome: string; ordem: number; cor: string | null
  status_final: 'ganho' | 'perdido' | null
  criado_em: string; atualizado_em: string
}
export interface SalesStageChecklistItem {
  id: string; stage_id: string; label: string; ordem: number; criado_em: string
}
export interface SalesOpportunity {
  id: string; pipeline_id: string; stage_id: string; client_id: string
  titulo: string; produto: string | null; product_id: string | null
  valor: number | null; responsavel_id: string | null
  status: 'aberta' | 'ganha' | 'perdida'
  notas: string | null; fechada_em: string | null
  criado_por: string | null; criado_em: string; atualizado_em: string
}
export interface SalesOpportunityChecklist {
  id: string; opportunity_id: string; item_id: string
  marcada: boolean; marcada_em: string | null; marcada_por: string | null
}
export type SalesEventTipo =
  | 'criada' | 'moveu_etapa' | 'checkbox_marcada' | 'checkbox_desmarcada'
  | 'nota' | 'ganha' | 'perdida' | 'reaberta' | 'editada'
export interface SalesOpportunityEvent {
  id: string; opportunity_id: string; client_id: string
  tipo: SalesEventTipo
  payload: Record<string, unknown> | null
  autor_id: string | null; autor_nome: string | null
  criado_em: string
}

// Notifications
export interface NotificationRow {
  id: string; user_id: string; tipo: string; titulo: string; mensagem: string | null
  lida: boolean; link: string | null; metadata: Record<string, unknown> | null; criado_em: string
}

// Joined types
export interface ClientWithProducts extends Client { products: Product[]; client_contracts?: ClientContract[] }
export interface ProductWithDeliverables extends Product { deliverables: Deliverable[]; clients?: Pick<Client, 'id' | 'nome'> | null }
export interface DeliveryWithDetails extends Delivery {
  clients: Pick<Client, 'id' | 'nome'>
  deliverables: Pick<Deliverable, 'id' | 'nome' | 'tipo'> & { products: Pick<Product, 'id' | 'nome'> }
  users: Pick<User, 'id' | 'nome'> | null
}
export interface DeliveryWithVersions extends DeliveryWithDetails {
  delivery_versions: Array<DeliveryVersion & { delivery_content_items: DeliveryContentItem[] }>
}

export interface Database {
  public: {
    Tables: {
      users: { Row: User; Insert: Omit<User,'id'|'criado_em'>; Update: Partial<Omit<User,'id'>> }
      clients: { Row: Client; Insert: Omit<Client,'id'|'criado_em'|'atualizado_em'>; Update: Partial<Omit<Client,'id'|'criado_em'>> }
      client_assignments: { Row: ClientAssignment; Insert: Omit<ClientAssignment,'id'|'criado_em'>; Update: Partial<Omit<ClientAssignment,'id'|'criado_em'>> }
      client_contracts: { Row: ClientContract; Insert: Omit<ClientContract,'id'|'criado_em'|'atualizado_em'>; Update: Partial<Omit<ClientContract,'id'|'criado_em'>> }
      products: { Row: Product; Insert: Omit<Product,'id'|'criado_em'|'atualizado_em'>; Update: Partial<Omit<Product,'id'|'criado_em'>> }
      deliverables: { Row: Deliverable; Insert: Omit<Deliverable,'id'|'criado_em'|'atualizado_em'>; Update: Partial<Omit<Deliverable,'id'|'criado_em'>> }
      deliveries: { Row: Delivery; Insert: Omit<Delivery,'id'|'criado_em'|'atualizado_em'>; Update: Partial<Omit<Delivery,'id'|'criado_em'>> }
      delivery_versions: { Row: DeliveryVersion; Insert: Omit<DeliveryVersion,'id'|'criado_em'>; Update: Partial<Omit<DeliveryVersion,'id'|'criado_em'>> }
      delivery_content_items: { Row: DeliveryContentItem; Insert: Omit<DeliveryContentItem,'id'|'criado_em'>; Update: Partial<Omit<DeliveryContentItem,'id'|'criado_em'>> }
      delivery_approvals: { Row: DeliveryApproval; Insert: Omit<DeliveryApproval,'id'|'criado_em'>; Update: Partial<Omit<DeliveryApproval,'id'|'criado_em'>> }
      delivery_comments: { Row: DeliveryComment; Insert: Omit<DeliveryComment,'id'|'criado_em'>; Update: Partial<Omit<DeliveryComment,'id'|'criado_em'>> }
      whatsapp_instances: { Row: WaInstanceRow; Insert: Omit<WaInstanceRow,'id'|'criado_em'>; Update: Partial<Omit<WaInstanceRow,'id'|'criado_em'>> }
      chat_departments: { Row: ChatDepartmentRow; Insert: Omit<ChatDepartmentRow,'id'>; Update: Partial<Omit<ChatDepartmentRow,'id'>> }
      chat_contacts: { Row: ChatContactRow; Insert: Omit<ChatContactRow,'id'>; Update: Partial<Omit<ChatContactRow,'id'>> }
      chat_conversations: { Row: ChatConversationRow; Insert: Omit<ChatConversationRow,'id'|'criado_em'|'atualizado_em'>; Update: Partial<Omit<ChatConversationRow,'id'|'criado_em'>> }
      chat_messages: { Row: ChatMessageRow; Insert: Omit<ChatMessageRow,'id'|'criado_em'>; Update: Partial<Omit<ChatMessageRow,'id'|'criado_em'>> }
      cobranca_instances: { Row: CobrancaInstanceRow; Insert: Omit<CobrancaInstanceRow,'id'>; Update: Partial<Omit<CobrancaInstanceRow,'id'>> }
      cobranca_reguas: { Row: CobrancaReguaRow; Insert: Omit<CobrancaReguaRow,'id'|'criado_em'>; Update: Partial<Omit<CobrancaReguaRow,'id'|'criado_em'>> }
      cobranca_regua_passos: { Row: CobrancaReguaPassoRow; Insert: Omit<CobrancaReguaPassoRow,'id'>; Update: Partial<Omit<CobrancaReguaPassoRow,'id'>> }
      cobranca_devedores: { Row: CobrancaDevedorRow; Insert: Omit<CobrancaDevedorRow,'id'|'criado_em'>; Update: Partial<Omit<CobrancaDevedorRow,'id'|'criado_em'>> }
      cobranca_sends: { Row: CobrancaSendRow; Insert: Omit<CobrancaSendRow,'id'>; Update: Partial<Omit<CobrancaSendRow,'id'>> }
      nps_surveys: { Row: NpsSurveyRow; Insert: Omit<NpsSurveyRow,'id'|'criado_em'>; Update: Partial<Omit<NpsSurveyRow,'id'|'criado_em'>> }
      nps_responses: { Row: NpsResponseRow; Insert: Omit<NpsResponseRow,'id'|'criado_em'>; Update: Partial<Omit<NpsResponseRow,'id'|'criado_em'>> }
      learning_paths: { Row: LearningPathRow; Insert: Omit<LearningPathRow,'id'|'criado_em'|'atualizado_em'>; Update: Partial<Omit<LearningPathRow,'id'|'criado_em'>> }
      learning_modules: { Row: LearningModuleRow; Insert: Omit<LearningModuleRow,'id'|'criado_em'>; Update: Partial<Omit<LearningModuleRow,'id'|'criado_em'>> }
      learning_lessons: { Row: LearningLessonRow; Insert: Omit<LearningLessonRow,'id'|'criado_em'>; Update: Partial<Omit<LearningLessonRow,'id'|'criado_em'>> }
      learning_progress: { Row: LearningProgressRow; Insert: Omit<LearningProgressRow,'id'|'criado_em'>; Update: Partial<Omit<LearningProgressRow,'id'|'criado_em'>>; Relationships: [] }
      ia_bots: { Row: IaBotRow; Insert: Omit<IaBotRow,'id'|'criado_em'|'atualizado_em'>; Update: Partial<Omit<IaBotRow,'id'|'criado_em'>> }
      ia_bot_documents: { Row: IaBotDocumentRow; Insert: Omit<IaBotDocumentRow,'id'|'criado_em'>; Update: Partial<Omit<IaBotDocumentRow,'id'|'criado_em'>> }
      ia_bot_activation_rules: { Row: IaBotActivationRuleRow; Insert: Omit<IaBotActivationRuleRow,'id'|'criado_em'>; Update: Partial<Omit<IaBotActivationRuleRow,'id'|'criado_em'>> }
      ia_bot_execution_logs: { Row: IaBotExecutionLogRow; Insert: Omit<IaBotExecutionLogRow,'id'|'criado_em'>; Update: Partial<Omit<IaBotExecutionLogRow,'id'|'criado_em'>> }
      notifications: { Row: NotificationRow; Insert: Omit<NotificationRow,'id'|'criado_em'>; Update: Partial<Omit<NotificationRow,'id'|'criado_em'>> }
      sales_pipelines: { Row: SalesPipeline; Insert: Omit<SalesPipeline,'id'|'criado_em'|'atualizado_em'>; Update: Partial<Omit<SalesPipeline,'id'|'criado_em'>> }
      sales_stages: { Row: SalesStage; Insert: Omit<SalesStage,'id'|'criado_em'|'atualizado_em'>; Update: Partial<Omit<SalesStage,'id'|'criado_em'>> }
      sales_stage_checklist_items: { Row: SalesStageChecklistItem; Insert: Omit<SalesStageChecklistItem,'id'|'criado_em'>; Update: Partial<Omit<SalesStageChecklistItem,'id'|'criado_em'>> }
      sales_opportunities: { Row: SalesOpportunity; Insert: Omit<SalesOpportunity,'id'|'criado_em'|'atualizado_em'>; Update: Partial<Omit<SalesOpportunity,'id'|'criado_em'>> }
      sales_opportunity_checklist: { Row: SalesOpportunityChecklist; Insert: Omit<SalesOpportunityChecklist,'id'>; Update: Partial<Omit<SalesOpportunityChecklist,'id'>> }
      sales_opportunity_events: { Row: SalesOpportunityEvent; Insert: Omit<SalesOpportunityEvent,'id'|'criado_em'>; Update: Partial<Omit<SalesOpportunityEvent,'id'|'criado_em'>> }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
  }
}
