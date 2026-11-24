import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { TablesInsert } from '@/integrations/supabase/types'
import { alertaCobertoPor, mensagemErroPrevia, pendenciasAutomacao } from '@/lib/automacoesWa'
import type {
  AlertaHoje, ContagemRelatorio, GrupoOpcao, IgnoradoWa, ModeloWa, NovoIgnorado, Provedor, RespostaEnviarLink,
  TipoDestinoRelatorio, TipoModeloWa, TipoRegra,
} from '@/lib/automacoesWa'

/**
 * App Automações WhatsApp — configuração, gestores, regras de alerta e histórico.
 *
 * Multi-tenant: o front nunca envia `tenant_id` (a RLS filtra e o trigger
 * `set_tenant_id` carimba). Por isso os payloads de insert/upsert são
 * afirmados como `TablesInsert<...>`: nos tipos gerados `tenant_id` é
 * obrigatório (não há DEFAULT na coluna), mas quem preenche é o trigger.
 *
 * Migration: 20261026120000_app_automacoes_wa_fundacao.sql
 */

export interface WaAutoConfig {
  id: string
  provider: Provedor
  uazapi_instance_id: string | null
  relatorio_ativo: boolean
  relatorio_hora: string
  resumo_ativo: boolean
  resumo_dia: number
  resumo_hora: string
  resumo_destino: 'privado' | 'grupo'
  agendamento_ativo: boolean
  template_relatorio: string | null
  template_resumo: string | null
  template_link: string | null
  /** Idioma do modelo aprovado na API oficial (ex.: pt_BR). Migration 20261026140000. */
  template_idioma: string
  // Assistente da equipe (migration 20261027090000 — opcionais até ser aplicada).
  agente_ativo?: boolean
  agente_nome?: string
  agente_nome_contato?: string | null
  agente_privado?: boolean
  agente_grupos?: boolean
  agente_limite_hora?: number
  // Relatório diário: opções de organização (migration 20261027100000 — opcionais até ser aplicada).
  /** Agrupa os pontos de atenção pelo estrategista do cliente. */
  relatorio_agrupar_estrategista?: boolean
  /** Só clientes cadastrados e ativos; contatos sem cadastro viram só contagem. */
  relatorio_so_clientes_ativos?: boolean
}

/**
 * Quem recebe o relatório diário: pessoa (privado, `telefone`) ou grupo INTERNO
 * (`grupo_jid`). Migration 20261026250000 — o banco recusa grupo de cliente.
 */
export interface WaAutoGestor {
  id: string
  nome: string
  /** null quando tipo = 'grupo'. */
  telefone: string | null
  tipo: TipoDestinoRelatorio
  grupo_jid: string | null
  grupo_nome: string | null
  ativo: boolean
  created_at: string
}

export interface WaAutoRegra {
  id: string
  tipo: TipoRegra
  ativo: boolean
  limiar: number
  updated_at: string
}

export interface WaAutoEnvio {
  id: string
  tipo: 'relatorio_diario' | 'resumo_semanal' | 'agendamento_link' | 'teste'
  provider: Provedor
  destino: string
  destino_nome: string | null
  status: 'pendente' | 'enviado' | 'falhou' | 'simulado'
  erro: string | null
  created_at: string
}

const keys = {
  config: ['wa-auto', 'config'] as const,
  gestores: ['wa-auto', 'gestores'] as const,
  regras: ['wa-auto', 'regras'] as const,
  envios: ['wa-auto', 'envios'] as const,
  integracao: (p: Provedor) => ['wa-auto', 'integracao', p] as const,
  reunioes: ['wa-auto', 'reunioes'] as const,
  modelos: ['wa-auto', 'modelos'] as const,
  alertas: ['wa-auto', 'alertas'] as const,
}

/** Mensagem legível para o toast/estado de erro (inclui o limite de 10 gestores do banco). */
export function mensagemErroWa(err: unknown, padrao: string): string {
  if (err && typeof err === 'object' && 'message' in err) {
    const msg = String((err as { message: unknown }).message)
    if (msg) return msg
  }
  return padrao
}

export function useWaAutoConfig() {
  return useQuery({
    queryKey: keys.config,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wa_auto_config')
        .select('*')
        .maybeSingle()
      if (error) throw error
      return (data ?? null) as WaAutoConfig | null
    },
  })
}

/**
 * Atualiza a linha única da empresa. Se ainda não existe, cria (o trigger
 * carimba o tenant; a UNIQUE(tenant_id) impede duplicar).
 */
export function useSalvarWaAutoConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (campos: Partial<Omit<WaAutoConfig, 'id'>>) => {
      const { data: atual, error: errSel } = await supabase
        .from('wa_auto_config')
        .select('id')
        .maybeSingle()
      if (errSel) throw errSel
      if (atual?.id) {
        const { error } = await supabase
          .from('wa_auto_config')
          .update(campos)
          .eq('id', atual.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('wa_auto_config').insert(campos as TablesInsert<'wa_auto_config'>)
        if (error) throw error
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.config }),
  })
}

export function useWaAutoGestores() {
  return useQuery({
    queryKey: keys.gestores,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wa_auto_gestores')
        .select('id, nome, telefone, tipo, grupo_jid, grupo_nome, ativo, created_at')
        .order('created_at', { ascending: true })
      if (error) throw error
      type Linha = Omit<WaAutoGestor, 'tipo'> & { tipo: string | null }
      return ((data ?? []) as Linha[]).map((g): WaAutoGestor => ({
        ...g,
        tipo: g.tipo === 'grupo' ? 'grupo' : 'pessoa',
      }))
    },
  })
}

export function useSalvarGestor() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { nome: string; telefone: string }) => {
      const { error } = await supabase
        .from('wa_auto_gestores')
        .insert({ ...input, tipo: 'pessoa' } as TablesInsert<'wa_auto_gestores'>)
      if (error) {
        // UNIQUE (tenant_id, telefone)
        if ((error as { code?: string }).code === '23505') {
          throw new Error('Este telefone já está na lista de gestores.')
        }
        throw error
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.gestores }),
  })
}

/**
 * Adiciona um grupo INTERNO à lista do relatório. O banco (trigger
 * wa_auto_confere_grupo_gestor) confere: grupo do número que envia e sem vínculo
 * com cliente; o nome do grupo vem do Chat. O limite de 10 conta pessoas e grupos.
 */
export function useSalvarGrupoInterno() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { grupo_jid: string; nome: string }) => {
      const nome = input.nome.trim() || 'Grupo interno'
      const { error } = await supabase.from('wa_auto_gestores').insert({
        tipo: 'grupo',
        grupo_jid: input.grupo_jid,
        nome: nome.slice(0, 80),
        grupo_nome: nome.slice(0, 120),
      } as TablesInsert<'wa_auto_gestores'>)
      if (error) {
        // UNIQUE (tenant_id, grupo_jid)
        if ((error as { code?: string }).code === '23505') throw new Error('Este grupo já está na lista.')
        throw error
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.gestores }),
  })
}

export function useAlternarGestor() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { error } = await supabase
        .from('wa_auto_gestores')
        .update({ ativo })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.gestores }),
  })
}

export function useExcluirGestor() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('wa_auto_gestores').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.gestores }),
  })
}

export function useWaAutoRegras() {
  return useQuery({
    queryKey: keys.regras,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wa_auto_regras_anomalia')
        .select('id, tipo, ativo, limiar, updated_at')
      if (error) throw error
      return (data ?? []) as WaAutoRegra[]
    },
  })
}

/** Liga/desliga ou ajusta o limiar de uma regra; cria a linha se for a primeira vez. */
export function useSalvarRegra() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { tipo: TipoRegra; ativo: boolean; limiar: number }) => {
      const { error } = await supabase
        .from('wa_auto_regras_anomalia')
        .upsert(input as TablesInsert<'wa_auto_regras_anomalia'>, { onConflict: 'tenant_id,tipo' })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.regras }),
  })
}

// ---------------------------------------------------------------------------
// Segredo do provedor (Vault) — etapa 9.2
// O valor nunca volta ao navegador: o front só grava e lê "configurado em".
// Mesmas RPCs da ponte Empire (useEmpireIntegracao), com provider 'uazapi'/'zernio'.
// ---------------------------------------------------------------------------

export interface WaIntegracaoStatus {
  provider: Provedor
  base_url: string | null
  rotation_version: number
  is_active: boolean
  connected: boolean
  updated_at: string | null
}

/** Status do token salvo (sem o valor). null = nada salvo ou sem permissão. */
export function useWaIntegracaoStatus(provider: Provedor) {
  return useQuery({
    queryKey: keys.integracao(provider),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_omnx_integracao_status', { p_provider: provider })
      if (error) throw error
      const row = Array.isArray(data) ? data[0] : data
      return (row as WaIntegracaoStatus | undefined) ?? null
    },
    retry: false,
  })
}

export interface SalvarTokenWaInput {
  provider: Provedor
  token: string
  /** Opcional; o banco só aceita *.uazapi.com / *.zernio.com. */
  baseUrl?: string
  /** Zernio: id da conta WhatsApp conectada (accountId). */
  accountId?: string
}

export function useSalvarTokenWa() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ provider, token, baseUrl, accountId }: SalvarTokenWaInput) => {
      const metadata = provider === 'zernio' ? { account_id: (accountId ?? '').trim() } : {}
      const { error } = await supabase.rpc('save_omnx_integracao_secret', {
        p_provider: provider,
        p_secret: token.trim(),
        // Omitido = DEFAULT NULL no banco (mesmo efeito de mandar null).
        p_base_url: baseUrl?.trim() || undefined,
        p_metadata: metadata,
      })
      if (error) throw error
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: keys.integracao(v.provider) }),
  })
}

export interface TesteEnvioResultado {
  ok: boolean
  status?: 'enviado' | 'falhou' | 'nao_enviado' | 'limite' | 'duplicado' | 'pausado'
  provider?: Provedor
  error?: string
}

/** Dispara UMA mensagem de teste pelo provedor ativo (edge function wa-auto-testar-envio). */
export function useTestarEnvioWa() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { telefone: string; variaveis?: string[] }): Promise<TesteEnvioResultado> => {
      const { data, error } = await supabase.functions.invoke('wa-auto-testar-envio', { body: input })
      if (error) {
        // Respostas 4xx/5xx trazem { error } no corpo; mostramos essa mensagem amigável.
        const ctx = (error as { context?: Response }).context
        if (ctx && typeof ctx.json === 'function') {
          try {
            const corpo = (await ctx.json()) as TesteEnvioResultado
            if (corpo?.error) return { ...corpo, ok: false }
          } catch {
            // cai no erro genérico abaixo
          }
        }
        return { ok: false, error: 'Não foi possível falar com o servidor. Tente de novo.' }
      }
      return data as TesteEnvioResultado
    },
    onSettled: () => qc.invalidateQueries({ queryKey: keys.envios }),
  })
}

/** Histórico só leitura: os 50 envios mais recentes. */
export function useWaAutoEnvios() {
  return useQuery({
    queryKey: keys.envios,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wa_auto_envios')
        .select('id, tipo, provider, destino, destino_nome, status, erro, created_at')
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return (data ?? []) as WaAutoEnvio[]
    },
  })
}

/**
 * Último envio de um tipo (para os cartões do Início). Ignora as prévias
 * ("simulado"). Com `status`, só conta envios nessa situação (ex.: teste enviado).
 */
export function useUltimoEnvio(tipo: WaAutoEnvio['tipo'], status?: WaAutoEnvio['status']) {
  return useQuery({
    queryKey: [...keys.envios, 'ultimo', tipo, status ?? 'qualquer'],
    queryFn: async () => {
      let q = supabase
        .from('wa_auto_envios')
        .select('id, tipo, provider, destino, destino_nome, status, erro, created_at')
        .eq('tipo', tipo)
        .neq('status', 'simulado')
      if (status) q = q.eq('status', status)
      const { data, error } = await q.order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (error) throw error
      return (data ?? null) as WaAutoEnvio | null
    },
  })
}

// ---------------------------------------------------------------------------
// Chamada às edge functions wa-auto-* (prévia e agendamento)
// Respostas 4xx/5xx trazem { ok:false, error, status? } no corpo: devolvemos
// esse corpo para a tela decidir (ex.: escolher grupo, confirmar reenvio).
// ---------------------------------------------------------------------------

const ERRO_SERVIDOR = 'Não foi possível falar com o servidor. Tente de novo.'

async function invocarWa<T extends { ok?: boolean; error?: string }>(funcao: string, body: unknown): Promise<T> {
  const { data, error } = await supabase.functions.invoke(funcao, { body: body as Record<string, unknown> })
  if (error) {
    const ctx = (error as { context?: Response }).context
    if (ctx && typeof ctx.json === 'function') {
      try {
        const corpo = (await ctx.json()) as T
        if (corpo && typeof corpo === 'object') return { ...corpo, ok: false }
      } catch {
        // cai no erro genérico abaixo
      }
    }
    return { ok: false, error: ERRO_SERVIDOR } as T
  }
  return (data ?? { ok: false, error: ERRO_SERVIDOR }) as T
}

/** Resposta de wa-auto-backtest: a mensagem que o gestor receberia agora (nada é enviado). */
export interface PreviaRelatorio {
  ok: boolean
  error?: string
  status?: string
  provider?: Provedor
  data_referencia?: string
  relatorio_ativo?: boolean
  relatorio_hora?: string | null
  gestores?: string[]
  /** Nomes dos grupos internos ativos (o id do grupo não volta). */
  grupos?: string[]
  contagem?: ContagemRelatorio
  /** Opções salvas usadas nesta prévia. */
  opcoes?: { agrupar_estrategista: boolean; so_clientes_ativos: boolean }
  /** "Só clientes ativos": ocorrências de contatos sem cadastro que ficaram fora. */
  fora_sem_cadastro?: number
  mensagem?: string
  /** Como chega no grupo interno (saudação para o grupo; sempre pela não oficial). */
  mensagem_grupo?: string
  oficial?: {
    template: string | null
    idioma: string
    modelo_para_cadastrar: string
    variaveis: string[]
    texto: string
  }
  avisos?: string[]
}

/** Gera a prévia do aviso diário com as regras salvas (ou as passadas, só para esta prévia). */
export function usePreviaRelatorio() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (regras?: { tipo: TipoRegra; ativo: boolean; limiar: number }[]) =>
      invocarWa<PreviaRelatorio>('wa-auto-backtest', regras ? { regras } : {}),
    // A prévia fica registrada no histórico como "Simulado".
    onSettled: () => qc.invalidateQueries({ queryKey: keys.envios }),
  })
}

/** Grupo interno que pode receber o relatório (wa-auto-backtest 'listar_grupos_internos'). */
export interface GrupoInternoOpcao { grupo_jid: string; nome: string; participa: boolean }

export interface RespostaGruposInternos {
  ok: boolean
  error?: string
  provider?: Provedor
  /** false = sem número do Chat escolhido: grupos indisponíveis (ver `aviso`). */
  numero_configurado?: boolean
  grupos?: GrupoInternoOpcao[]
  aviso?: string
}

/** Grupos do número que envia que NÃO são de cliente (só leitura; só admin). */
export function useGruposInternos(habilitado: boolean) {
  return useQuery({
    queryKey: [...keys.gestores, 'grupos-internos'],
    enabled: habilitado,
    staleTime: 60_000,
    queryFn: async () => {
      const r = await invocarWa<RespostaGruposInternos>('wa-auto-backtest', { acao: 'listar_grupos_internos' })
      if (!r.ok) throw new Error(r.error || 'Não foi possível carregar os grupos.')
      return r
    },
  })
}

export interface RespostaGrupos { ok: boolean; error?: string; cliente?: string; grupos?: GrupoOpcao[]; aviso?: string }

/** Grupos de WhatsApp vinculados ao cliente (só leitura). */
export function useGruposCliente(clientId: string | null) {
  return useQuery({
    queryKey: ['wa-auto', 'grupos', clientId],
    enabled: !!clientId,
    retry: false,
    staleTime: 60_000,
    queryFn: () => invocarWa<RespostaGrupos>('wa-auto-agendar', { acao: 'grupos', client_id: clientId }),
  })
}

export interface RespostaMarcar {
  ok: boolean
  error?: string
  status?: 'marcada' | 'ja_marcada'
  meeting_id?: string
  cliente?: string
  grupos?: GrupoOpcao[]
  aviso?: string
}

/** ETAPA 1: grava a reunião na agenda, sem link e sem mensagem a ninguém. */
export function useMarcarReuniao() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { client_id: string; scheduled_at: string; duracao_min: number; titulo?: string }) =>
      invocarWa<RespostaMarcar>('wa-auto-agendar', { acao: 'marcar', ...input }),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.reunioes }),
  })
}

/** ETAPA 2: envia o link no grupo do cliente (uma única vez). */
export function useEnviarLinkReuniao() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: {
      meeting_id: string
      meeting_link?: string
      grupo_contact_id?: string
      confirmar_reenvio?: boolean
    }) => invocarWa<RespostaEnviarLink>('wa-auto-agendar', { acao: 'enviar_link', ...input }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: keys.reunioes })
      qc.invalidateQueries({ queryKey: keys.envios })
    },
  })
}

export interface ReuniaoAgendada {
  id: string
  title: string | null
  client_id: string | null
  scheduled_at: string | null
  scheduled_duration_min: number | null
  /** Preenchido quando o link já saiu no grupo. */
  link_enviado_em: string | null
}

/** Próximas reuniões marcadas por este app (as que já passaram há mais de 2h somem). */
export function useReunioesAgendadas() {
  return useQuery({
    queryKey: keys.reunioes,
    queryFn: async () => {
      const desde = new Date(Date.now() - 2 * 60 * 60_000).toISOString()
      const { data, error } = await supabase
        .from('meetings')
        .select('id, title, client_id, scheduled_at, scheduled_duration_min, metadata')
        .eq('metadata->>origem', 'automacoes-wa')
        .eq('status', 'scheduled')
        .gte('scheduled_at', desde)
        .order('scheduled_at', { ascending: true })
        .limit(50)
      if (error) throw error
      return (data ?? []).map((m): ReuniaoAgendada => {
        const meta = (m.metadata && typeof m.metadata === 'object' && !Array.isArray(m.metadata)
          ? m.metadata : {}) as Record<string, unknown>
        return {
          id: m.id,
          title: m.title,
          client_id: m.client_id,
          scheduled_at: m.scheduled_at,
          scheduled_duration_min: m.scheduled_duration_min,
          link_enviado_em: typeof meta.link_enviado_em === 'string' ? meta.link_enviado_em : null,
        }
      })
    },
  })
}

/** Reuniões marcadas por este app nos últimos 60 dias que já passaram (só leitura). */
export function useReunioesAnteriores(habilitado = true) {
  return useQuery({
    queryKey: [...keys.reunioes, 'anteriores'],
    enabled: habilitado,
    queryFn: async () => {
      const ate = new Date(Date.now() - 2 * 60 * 60_000).toISOString()
      const desde = new Date(Date.now() - 60 * 24 * 60 * 60_000).toISOString()
      const { data, error } = await supabase
        .from('meetings')
        .select('id, title, client_id, scheduled_at, scheduled_duration_min, metadata')
        .eq('metadata->>origem', 'automacoes-wa')
        .in('status', ['scheduled', 'completed'])
        .lt('scheduled_at', ate)
        .gte('scheduled_at', desde)
        .order('scheduled_at', { ascending: false })
        .limit(30)
      if (error) throw error
      return (data ?? []).map((m): ReuniaoAgendada => {
        const meta = (m.metadata && typeof m.metadata === 'object' && !Array.isArray(m.metadata)
          ? m.metadata : {}) as Record<string, unknown>
        return {
          id: m.id,
          title: m.title,
          client_id: m.client_id,
          scheduled_at: m.scheduled_at,
          scheduled_duration_min: m.scheduled_duration_min,
          link_enviado_em: typeof meta.link_enviado_em === 'string' ? meta.link_enviado_em : null,
        }
      })
    },
  })
}

// ---------------------------------------------------------------------------
// Modelos do WhatsApp oficial (edge function wa-auto-templates)
// O texto dos modelos vem do catálogo fixo do servidor; o front só escolhe QUAL
// criar. Nada atualiza sozinho em loop: a consulta à Zernio é sempre por clique.
// ---------------------------------------------------------------------------

export interface RespostaModelos {
  ok: boolean
  error?: string
  /** 'criado' | 'ja_existia' | 'limite' | 'nao_configurado' | código do erro. */
  status?: string
  modelos?: ModeloWa[]
  avisos?: string[]
}

/** Os 3 modelos + último status salvo. Não chama a Zernio (ação 'catalogo'). */
export function useWaModelos(habilitado = true) {
  return useQuery({
    queryKey: keys.modelos,
    enabled: habilitado,
    retry: false,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    queryFn: () => invocarWa<RespostaModelos>('wa-auto-templates', { acao: 'catalogo' }),
  })
}

/** Atualizar status (todos ou um) / listar / criar UM modelo do catálogo. */
export function useAcaoModelosWa() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { acao: 'listar' | 'status' | 'criar'; tipo?: TipoModeloWa }) =>
      invocarWa<RespostaModelos>('wa-auto-templates', input),
    onSuccess: (r) => {
      if (r.modelos) qc.setQueryData<RespostaModelos>(keys.modelos, { ok: true, modelos: r.modelos })
      // A função pode ter gravado o nome/idioma do modelo em wa_auto_config.
      qc.invalidateQueries({ queryKey: keys.config })
    },
  })
}

// ---------------------------------------------------------------------------
// Visão geral (cabeçalho, abas e Início): tudo o que as regras de pendência usam
// ---------------------------------------------------------------------------

/** Junta configuração, gestores, conexão oficial e textos aprovados num só lugar. */
export function usePainelWa() {
  const config = useWaAutoConfig()
  const gestores = useWaAutoGestores()
  const oficial = config.data?.provider === 'zernio'
  const zernio = useWaIntegracaoStatus('zernio')
  const modelos = useWaModelos(oficial)
  const cfg = config.data ?? null
  const conexao = { zernioConectado: Boolean(zernio.data?.connected) }
  const listaModelos = oficial ? modelos.data?.modelos : undefined
  return {
    carregando: config.isLoading || gestores.isLoading || (oficial && zernio.isLoading),
    config: cfg,
    gestores: gestores.data ?? [],
    conexao,
    zernioStatus: zernio.data ?? null,
    modelos: listaModelos,
    pendencias: pendenciasAutomacao(cfg, gestores.data, conexao, listaModelos),
  }
}

// ---------------------------------------------------------------------------
// Pontos de atenção de hoje + "não alertar mais"
// Lista: wa-auto-backtest { acao: 'listar_alertas' } (nada é enviado).
// Pedidos do gestor: tabela wa_auto_alertas_ignorados (RLS; tenant_id e
// criado_por vêm do banco). Sem update: desfazer = apagar a linha.
// ---------------------------------------------------------------------------

export interface RespostaAlertas {
  ok?: boolean
  error?: string
  alertas?: AlertaHoje[]
  /** contrato_encerrado, cliente_inativo, fora_da_janela, ignorados_pelo_gestor… (contagens). */
  ocultos_por_regra?: Record<string, number>
  ignorados?: IgnoradoWa[]
}

/**
 * A tabela ainda não está nos tipos gerados (migration em paralelo). Cliente sem
 * tipos só para ela; trocar por `supabase.from(...)` depois de regerar types.ts.
 */
const tabelaIgnorados = () =>
  (supabase as unknown as SupabaseClient).from('wa_auto_alertas_ignorados')

/** Os alertas que entrariam no relatório de hoje, os já tirados e os silenciados. */
export function useAlertasHoje(habilitado = true) {
  return useQuery({
    queryKey: keys.alertas,
    enabled: habilitado,
    staleTime: 30_000,
    retry: false,
    queryFn: async () => {
      const r = await invocarWa<RespostaAlertas>('wa-auto-backtest', { acao: 'listar_alertas' })
      if (r.ok === false || !Array.isArray(r.alertas)) throw new Error(mensagemErroAlertas(r.error))
      return { alertas: r.alertas, ocultos_por_regra: r.ocultos_por_regra ?? {}, ignorados: r.ignorados ?? [] }
    },
  })
}

function mensagemErroAlertas(erro: string | undefined): string {
  if (erro === 'forbidden') return 'Só o administrador da empresa pode ver os pontos de atenção.'
  if (!erro || erro === 'method_not_allowed') return 'Não foi possível carregar os pontos de atenção. Tente de novo.'
  return mensagemErroPrevia(erro)
}

type DadosAlertas = { alertas: AlertaHoje[]; ocultos_por_regra: Record<string, number>; ignorados: IgnoradoWa[] }

/**
 * Grava "resolvido / silenciar / não alertar mais". Otimista: o alerta (e os
 * outros do mesmo cliente que o pedido cobre) some da lista na hora; se falhar,
 * volta. Devolve o id da linha para o "Desfazer".
 */
export function useIgnorarAlerta() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ novo }: { novo: NovoIgnorado; chave: string }) => {
      const { data, error } = await tabelaIgnorados().insert(novo).select('id').single()
      if (error) throw error
      return (data as { id: string }).id
    },
    onMutate: async ({ novo, chave }) => {
      await qc.cancelQueries({ queryKey: keys.alertas })
      const antes = qc.getQueryData<DadosAlertas>(keys.alertas)
      if (antes) {
        qc.setQueryData<DadosAlertas>(keys.alertas, {
          ...antes,
          alertas: antes.alertas.filter((a) => a.chave_alerta !== chave && !alertaCobertoPor(a, novo)),
        })
      }
      return { antes }
    },
    onError: (_e, _v, ctx) => { if (ctx?.antes) qc.setQueryData(keys.alertas, ctx.antes) },
    onSettled: () => qc.invalidateQueries({ queryKey: keys.alertas }),
  })
}

/** "Desfazer" e "Voltar a alertar": apaga o pedido; o alerta volta na próxima leitura. */
export function useDesfazerIgnorar() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await tabelaIgnorados().delete().eq('id', id)
      if (error) throw error
    },
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: keys.alertas })
      const antes = qc.getQueryData<DadosAlertas>(keys.alertas)
      if (antes) qc.setQueryData<DadosAlertas>(keys.alertas, { ...antes, ignorados: antes.ignorados.filter((i) => i.id !== id) })
      return { antes }
    },
    onError: (_e, _v, ctx) => { if (ctx?.antes) qc.setQueryData(keys.alertas, ctx.antes) },
    onSettled: () => qc.invalidateQueries({ queryKey: keys.alertas }),
  })
}

// ---------------------------------------------------------------------------
// Assistente da equipe no WhatsApp (aba "Assistente")
// Tabelas novas (migration 20261027090000) ainda fora dos tipos gerados: cliente
// sem tipos só para elas. O front grava só as colunas liberadas por GRANT:
//   membros   INSERT (user_id, telefone, ativo) · UPDATE (telefone, ativo)
//   grupos    INSERT (grupo_jid, ativo, acesso_total) · UPDATE (ativo, acesso_total)
//   números   INSERT (grupo_id, instance_uuid, ordem) · UPDATE (ordem)
// tenant_id vem do trigger. Ações de servidor: edge function wa-agente-admin.
// ---------------------------------------------------------------------------

const semTipos = () => supabase as unknown as SupabaseClient

const keysAgente = {
  membros: ['wa-agente', 'membros'] as const,
  grupos: ['wa-agente', 'grupos'] as const,
  execucoes: ['wa-agente', 'execucoes'] as const,
  candidatos: ['wa-agente', 'candidatos'] as const,
  status: ['wa-agente', 'status'] as const,
}

export interface MembroAgente {
  id: string
  user_id: string
  telefone: string
  ativo: boolean
  boas_vindas_em: string | null
  created_at: string
}

export interface NumeroGrupoAgente { id: string; instance_uuid: string; ordem: number }

export interface GrupoAgente {
  id: string
  grupo_jid: string
  nome: string | null
  ativo: boolean
  acesso_total: boolean
  boas_vindas_em: string | null
  participantes_externos: number | null
  numeros: NumeroGrupoAgente[]
}

export interface ExecucaoAgente {
  id: string
  user_id: string | null
  canal: string | null
  gatilho: string | null
  modelo: string | null
  passos: number | null
  ferramentas: string[]
  tokens_entrada: number | null
  tokens_saida: number | null
  custo_usd: number | string | null
  duracao_ms: number | null
  resultado: string
  created_at: string
}

export interface CandidatoAgente {
  user_id: string
  nome: string
  perfil: string
  ja_membro: boolean
  ve_tudo: boolean
  clientes: number
  escopo_ok: boolean
}

/** Erro de tabela que ainda não existe (migration não aplicada). */
function tabelaAusente(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code
  return code === 'PGRST205' || code === '42P01'
}

export function useMembrosAgente() {
  return useQuery({
    queryKey: keysAgente.membros,
    queryFn: async () => {
      const { data, error } = await semTipos().from('wa_agente_membros')
        .select('id, user_id, telefone, ativo, boas_vindas_em, created_at').order('created_at', { ascending: true })
      if (error) { if (tabelaAusente(error)) return [] as MembroAgente[]; throw error }
      return (data ?? []) as MembroAgente[]
    },
  })
}

export function useSalvarMembroAgente() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { user_id: string; telefone: string }) => {
      const { error } = await semTipos().from('wa_agente_membros').insert({ ...input, ativo: true })
      if (error) {
        if ((error as { code?: string }).code === '23505') throw new Error('Essa pessoa ou esse WhatsApp já está na lista.')
        throw error
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keysAgente.membros }),
  })
}

export function useAlterarMembroAgente() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...campos }: { id: string; ativo?: boolean; telefone?: string }) => {
      const { error } = await semTipos().from('wa_agente_membros').update(campos).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keysAgente.membros }),
  })
}

export function useExcluirMembroAgente() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await semTipos().from('wa_agente_membros').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keysAgente.membros }),
  })
}

export function useGruposAgente() {
  return useQuery({
    queryKey: keysAgente.grupos,
    queryFn: async () => {
      const { data, error } = await semTipos().from('wa_agente_grupos')
        .select('id, grupo_jid, nome, ativo, acesso_total, boas_vindas_em, participantes_externos, created_at')
        .order('created_at', { ascending: true })
      if (error) { if (tabelaAusente(error)) return [] as GrupoAgente[]; throw error }
      const grupos = (data ?? []) as Omit<GrupoAgente, 'numeros'>[]
      if (grupos.length === 0) return [] as GrupoAgente[]
      const { data: ns, error: e2 } = await semTipos().from('wa_agente_grupo_numeros')
        .select('id, grupo_id, instance_uuid, ordem').in('grupo_id', grupos.map((g) => g.id)).order('ordem', { ascending: true })
      if (e2) throw e2
      const numeros = (ns ?? []) as (NumeroGrupoAgente & { grupo_id: string })[]
      return grupos.map((g): GrupoAgente => ({ ...g, numeros: numeros.filter((n) => n.grupo_id === g.id) }))
    },
  })
}

/** Libera um grupo interno para o assistente e grava o número principal + reservas. */
export function useSalvarGrupoAgente() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { grupo_jid: string; acesso_total: boolean; numeros: { instance_uuid: string; ordem: number }[] }) => {
      const { data, error } = await semTipos().from('wa_agente_grupos')
        .insert({ grupo_jid: input.grupo_jid, ativo: true, acesso_total: input.acesso_total }).select('id').single()
      if (error) {
        if ((error as { code?: string }).code === '23505') throw new Error('Esse grupo já está liberado.')
        throw error
      }
      const grupoId = (data as { id: string }).id
      if (input.numeros.length > 0) {
        const { error: e2 } = await semTipos().from('wa_agente_grupo_numeros')
          .insert(input.numeros.map((n) => ({ ...n, grupo_id: grupoId })))
        if (e2) {
          await semTipos().from('wa_agente_grupos').delete().eq('id', grupoId)
          throw e2
        }
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keysAgente.grupos }),
  })
}

export function useAlterarGrupoAgente() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...campos }: { id: string; ativo?: boolean; acesso_total?: boolean }) => {
      const { error } = await semTipos().from('wa_agente_grupos').update(campos).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keysAgente.grupos }),
  })
}

/** Troca principal/reservas: apaga as linhas do grupo e grava de novo (UNIQUE de ordem). */
export function useTrocarNumerosGrupoAgente() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ grupoId, numeros }: { grupoId: string; numeros: { instance_uuid: string; ordem: number }[] }) => {
      const { error } = await semTipos().from('wa_agente_grupo_numeros').delete().eq('grupo_id', grupoId)
      if (error) throw error
      if (numeros.length === 0) return
      const { error: e2 } = await semTipos().from('wa_agente_grupo_numeros')
        .insert(numeros.map((n) => ({ ...n, grupo_id: grupoId })))
      if (e2) throw e2
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keysAgente.grupos }),
  })
}

export function useExcluirGrupoAgente() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await semTipos().from('wa_agente_grupos').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keysAgente.grupos }),
  })
}

/** Últimas execuções (sem conteúdo: só resultado, ferramentas, tokens e custo). */
export function useExecucoesAgente(habilitado = true) {
  return useQuery({
    queryKey: keysAgente.execucoes,
    enabled: habilitado,
    queryFn: async () => {
      const { data, error } = await semTipos().from('wa_agente_execucoes')
        .select('id, user_id, canal, gatilho, modelo, passos, ferramentas, tokens_entrada, tokens_saida, custo_usd, duracao_ms, resultado, created_at')
        .order('created_at', { ascending: false }).limit(30)
      if (error) { if (tabelaAusente(error)) return [] as ExecucaoAgente[]; throw error }
      return (data ?? []) as ExecucaoAgente[]
    },
  })
}

export interface RespostaAgenteAdmin { ok: boolean; error?: string; status?: string }

export interface RespostaCandidatos extends RespostaAgenteAdmin { candidatos?: CandidatoAgente[]; mais?: number }

/** Pessoas da equipe que podem falar com o assistente (com o que cada uma vê). */
export function useCandidatosAgente(habilitado = true) {
  return useQuery({
    queryKey: keysAgente.candidatos,
    enabled: habilitado,
    staleTime: 60_000,
    retry: false,
    queryFn: async () => {
      const r = await invocarWa<RespostaCandidatos>('wa-agente-admin', { acao: 'candidatos' })
      if (!r.ok) throw new Error(r.error || 'Não foi possível carregar a equipe.')
      return r.candidatos ?? []
    },
  })
}

export interface NumeroStatusAgente {
  instance_uuid: string
  instance_id: string
  nome: string | null
  protegida: boolean
  rotacionado_em: string | null
  ultimo_uso_em: string | null
  lid_conhecido: boolean
  token_configurado: boolean
}

export interface RespostaStatusAgente extends RespostaAgenteAdmin { instancias?: NumeroStatusAgente[] }

/** Números da empresa e se o webhook de cada um está protegido (wa-agente-admin 'status'). */
export function useStatusConexaoAgente(habilitado = true) {
  return useQuery({
    queryKey: keysAgente.status,
    enabled: habilitado,
    retry: false,
    staleTime: 60_000,
    queryFn: () => invocarWa<RespostaStatusAgente>('wa-agente-admin', { acao: 'status' }),
  })
}

export function useProtegerConexaoAgente() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (instance_uuid: string) =>
      invocarWa<RespostaAgenteAdmin & { protegida?: boolean; rotacao?: boolean }>('wa-agente-admin', { acao: 'proteger_webhook', instance_uuid }),
    onSettled: () => qc.invalidateQueries({ queryKey: keysAgente.status }),
  })
}

export interface RespostaSimulacao extends RespostaAgenteAdmin {
  resposta?: string | null
  falha?: string | null
  ferramentas?: string[]
  passos?: number
  tokens?: { entrada: number; saida: number; cache: number }
  custo_usd?: number
  duracao_ms?: number
  escopo?: { total: boolean; clientes: number; restrito: boolean }
}

/** Roda o assistente como se a pessoa perguntasse no privado. Nada é enviado. */
export function useSimularAgente() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { pergunta: string; user_id: string }) =>
      invocarWa<RespostaSimulacao>('wa-agente-admin', { acao: 'simular', ...input }),
    onSettled: () => qc.invalidateQueries({ queryKey: keysAgente.execucoes }),
  })
}

/** Boas-vindas (uma única vez) para uma pessoa ou um grupo. */
export function useBoasVindasAgente() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { membro_id: string } | { grupo_id: string }) =>
      invocarWa<RespostaAgenteAdmin>('wa-agente-admin', { acao: 'boas_vindas', ...input }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: keysAgente.membros })
      qc.invalidateQueries({ queryKey: keysAgente.grupos })
      qc.invalidateQueries({ queryKey: keys.envios })
    },
  })
}

// ---------------------------------------------------------------------------
// O que o assistente aprendeu (wa_agente_aprendizados — migration 20261027101000)
// Front (só admin do app, pela RLS): lê tudo, cria (instrucao, categoria, ativo),
// liga/desliga (ativo) e apaga. Autor/origem/pedido o banco carimba.
// ---------------------------------------------------------------------------

const keyAprendizados = ['wa-agente', 'aprendizados'] as const

export interface AprendizadoAgente {
  id: string
  instrucao: string
  categoria: string
  origem: 'whatsapp' | 'tela'
  criado_por_nome: string | null
  ativo: boolean
  created_at: string
  desativado_em: string | null
}

export function useAprendizadosAgente(habilitado = true) {
  return useQuery({
    queryKey: keyAprendizados,
    enabled: habilitado,
    queryFn: async () => {
      const { data, error } = await semTipos().from('wa_agente_aprendizados')
        .select('id, instrucao, categoria, origem, criado_por_nome, ativo, created_at, desativado_em')
        .order('created_at', { ascending: false }).limit(200)
      if (error) { if (tabelaAusente(error)) return null; throw error }
      return (data ?? []) as AprendizadoAgente[]
    },
  })
}

export function useSalvarAprendizadoAgente() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { instrucao: string; categoria: string }) => {
      const { error } = await semTipos().from('wa_agente_aprendizados').insert({ ...input, ativo: true })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keyAprendizados }),
  })
}

export function useAlterarAprendizadoAgente() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { error } = await semTipos().from('wa_agente_aprendizados').update({ ativo }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keyAprendizados }),
  })
}

export function useExcluirAprendizadoAgente() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await semTipos().from('wa_agente_aprendizados').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keyAprendizados }),
  })
}

/**
 * Nome do assistente para o Chat (mensagens com fonte_envio = 'assistente').
 * Quem não pode ler a configuração (RLS) ou antes da migration → null.
 */
export function useNomeAssistente(): string | null {
  const q = useQuery({
    queryKey: ['wa-agente', 'nome'],
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: async () => {
      const { data, error } = await semTipos().from('wa_auto_config').select('agente_nome').maybeSingle()
      if (error) return null
      const n = (data as { agente_nome?: unknown } | null)?.agente_nome
      return typeof n === 'string' && n.trim() ? n.trim() : null
    },
  })
  return q.data ?? null
}
