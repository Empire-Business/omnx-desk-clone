// "Cérebro" do assistente da equipe: monta o prompt, roda o loop de ferramentas
// (Claude via OpenRouter) e valida a saída. Usado pelo wa-agente-responder (envio
// real) e pela ação admin 'simular' (sem envio/escrita). O cérebro não envia;
// escritas limitadas passam pelos executores de ferramentas e suas guardas.
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import type { EscopoAgente } from './wa-agente-escopo.ts'
import { type DependenciasDados, MapaRefs, executarFerramenta, ferramentasDisponiveis, type ContextoFerramentas } from './wa-agente-ferramentas.ts'
import { agoraPorExtenso, blocoFerramenta, blocoMensagem, gerarCanario, montarSistema } from './wa-agente-prompt.ts'
import { type Esforco, type MensagemChat, type Uso, esforcoDaEnv, modeloDaEnv, rodarLoop } from './wa-agente-llm.ts'
import { type MotivoBloqueio, prepararSaida } from './wa-agente-saida.ts'
import { FUSO_PADRAO } from './wa-relatorio.ts'
import type { PerfilAgente } from './wa-agente-perfil.ts'
import { AJUDA_CARTEIRA_GT3, ferramentaCarteiraGt3, montarPromptCarteiraGt3 } from './iris-gt3-politica.ts'
import { confirmarResolucao } from './wa-agente-ferr-alertas.ts'
import { recibosExclusoesRelatorio } from './wa-agente-ferr-exclusoes-relatorio.ts'
import { confirmarAcaoCadastroDoPedido, prepararOfertaAcoesCadastro, recibosAcoesCadastro } from './wa-agente-ferr-acoes-cadastro.ts'
import { atribuicoesDisponiveis } from './wa-agente-ferr-atribuicoes.ts'
import { carregarFatosEquipe, fatosEquipeParaPrompt, recibosMemoria } from './wa-agente-ferr-memoria.ts'

/** Uma mensagem anterior do histórico curto (texto já lido do Chat). */
export interface MensagemHistorico {
  de: 'equipe' | 'assistente'
  texto: string
  autor?: string | null
}

export interface EntradaCerebro {
  admin: SupabaseClient
  escopo: EscopoAgente
  nomeAgente: string
  canal: 'privado' | 'grupo'
  quemPergunta: string | null
  pergunta: string
  historico?: MensagemHistorico[]
  /** Contexto escrito pelo servidor (ex.: aviso diário enviado hoje / pergunta citando mensagem). */
  contexto?: string[]
  agora?: Date
  apiKey: string | null | undefined
  /** Padrão: env WA_AGENTE_MODELO / WA_AGENTE_ESFORCO (já lidos por quem chama). */
  modelo?: string | null
  esforco?: Esforco | null
  prazoMs?: number
  fetchFn?: typeof fetch
  deps?: DependenciasDados
  /** Preferências aprendidas da empresa (linhasParaPrompt de carregarAprendizados). */
  aprendizados?: readonly string[]
  /** Perfil longo lido com tenant e apenas fora do modo restrito. */
  perfil?: PerfilAgente | null
  /** Nome de quem mandou (autor de aprendizados; sem telefone). */
  remetenteNome?: string | null
  /** Pedido do WhatsApp (rastreio de aprendizados). */
  pedidoId?: string | null
  /** Simulação na tela: ferramentas que gravam não gravam. */
  simulacao?: boolean
}

export interface SaidaCerebro {
  ok: boolean
  /** Partes prontas para enviar (ok=true). */
  partes: string[]
  texto: string | null
  /** erro_ia (IA falhou/sem chave/prazo/passos/recusa) | bloqueado (saída reprovada). */
  falha?: 'erro_ia' | 'bloqueado'
  motivo?: string
  ferramentas: string[]
  passos: number
  uso: Uso
  modelo: string
  duracaoMs: number
  ajustes: string[]
  /** GT3: relatório não vazio concluído pelo executor, sem depender do texto da IA. */
  carteiraConsultada?: boolean
}

/** Texto fixo quando a IA falha (o envio sai como 'fallback'). */
export const TEXTO_FALHA_IA = 'Tive um problema para responder agora. Pode tentar de novo daqui a pouco?'
/** Texto fixo quando a saída foi bloqueada (canário, vazamento). */
export const TEXTO_BLOQUEADO = 'Não consigo responder isso. Posso ajudar com alertas, satisfação ou contratos dos clientes da sua carteira.'
export const TEXTO_FALHA_CONSULTA_GT3 = 'Não consegui consultar os dados da sua carteira agora. Tente novamente em instantes.'

function historicoParaChat(h: readonly MensagemHistorico[]): MensagemChat[] {
  return h.slice(-8).map((m) => (m.de === 'assistente'
    ? { role: 'assistant', content: m.texto.slice(0, 2_000) }
    : { role: 'user', content: blocoMensagem(m.texto, m.autor ?? null) }))
}

/** Roda a pergunta. Nunca lança. */
export async function pensar(e: EntradaCerebro): Promise<SaidaCerebro> {
  const agora = e.agora ?? new Date()
  const canario = gerarCanario()
  const escopo = e.escopo
  const ctx: ContextoFerramentas = {
    admin: e.admin, escopo, agora, fuso: FUSO_PADRAO, refs: new MapaRefs(), urlsVistas: new Set<string>(),
    nomeAgente: e.nomeAgente, deps: e.deps, cache: {},
    remetenteNome: e.remetenteNome ?? null, pedidoId: e.pedidoId ?? null, simulacao: e.simulacao === true,
    mensagemOriginal: e.pergunta, canal: e.canal,
  }
  // Confirmação usa somente a entrada original conferida no servidor, antes do modelo.
  const confirmacao = await confirmarAcaoCadastroDoPedido(ctx)
  if (confirmacao) {
    const texto = recibosAcoesCadastro([confirmacao]) ?? ''
    // O recibo de um lote precisa chegar inteiro, inclusive os últimos itens
    // e seu identificador. As guardas da saída continuam aplicadas.
    const s = prepararSaida(texto, { canario, urlsPermitidas: ctx.urlsVistas, maxCaracteres: 40_000, maxPartes: 40,
      recibosPermitidos: confirmacao.ok === true && typeof confirmacao.recibo_id === 'string' ? new Set([confirmacao.recibo_id]) : undefined })
    const base = { ferramentas: ['confirmacao_cadastro'], passos: 0, uso: { entrada: 0, saida: 0, cache: 0, custoUsd: 0 },
      modelo: modeloDaEnv(e.modelo), duracaoMs: 0, ajustes: [] }
    return s.ok ? { ok: true, partes: s.partes, texto: s.texto, ...base, ajustes: s.ajustes }
      : { ok: false, partes: [], texto: null, falha: 'bloqueado', motivo: s.motivo, ...base }
  }
  const acoesCadastroAutorizadas = await prepararOfertaAcoesCadastro(ctx)
  const atribuicoesAutorizadas = acoesCadastroAutorizadas && await atribuicoesDisponiveis(ctx)
  const fatos = acoesCadastroAutorizadas ? await carregarFatosEquipe(ctx) : []
  if (fatos.length) ctx.leuDados = true
  const sistema = escopo.politica === 'carteira_gt3' ? montarPromptCarteiraGt3({
    canario, agora: agoraPorExtenso(agora), pessoa: e.quemPergunta, clientes: escopo.clientIds.size,
  }) : montarSistema({
    nome: e.nomeAgente,
    canal: e.canal,
    restrito: escopo.modo !== 'normal',
    quemPergunta: e.quemPergunta,
    carteira: escopo.total ? 'a carteira de todos os clientes da empresa' : `uma carteira com ${escopo.clientIds.size} clientes`,
    podeContratos: escopo.permissoes.contratos,
    podeChat: escopo.permissoes.chat,
    agoraTexto: agoraPorExtenso(agora),
    canario,
    contexto: e.contexto,
    fatosEquipe: fatosEquipeParaPrompt(fatos),
    aprendizados: e.aprendizados,
    perfil: e.perfil,
    podeProporCadastro: acoesCadastroAutorizadas,
    podeProporAtribuicoes: atribuicoesAutorizadas,
  })
  const mensagens: MensagemChat[] = [
    ...historicoParaChat(e.historico ?? []),
    { role: 'user', content: blocoMensagem(e.pergunta, e.quemPergunta) },
  ]
  // Resolver altera um alerta e já tem recibo do executor; não libera narrativa de consulta da IA.
  const SEM_DADOS = new Set(['ajuda', 'resolver_alerta', 'registrar_aprendizado', 'esquecer_aprendizado', 'listar_aprendizados', 'ajustar_relatorio', 'propor_alteracao_cadastro', 'gerenciar_exclusoes_relatorio', 'propor_atribuicoes_estrategistas', 'registrar_fato_equipe', 'esquecer_fato_equipe'])
  let falhaConsultaGt3 = false
  let leuDadosClienteGt3 = false
  let respostaVaziaGt3: string | null = null
  let carteiraConsultadaGt3 = false
  const resultadosResolucao: Record<string, unknown>[] = []
  const resultadosCadastro: Record<string, unknown>[] = []
  const resultadosExclusoes: Record<string, unknown>[] = []
  const resultadosMemoria: Record<string, unknown>[] = []
  let temRespostaConsulta = false
  const r = await rodarLoop({
    apiKey: e.apiKey,
    sistema,
    mensagens,
    ferramentas: ferramentasDisponiveis(escopo, acoesCadastroAutorizadas, atribuicoesAutorizadas),
    executar: async (nome, args) => {
      const saida = await executarFerramenta(nome, args, ctx)
      if (nome === 'resolver_alerta' && escopo.politica !== 'carteira_gt3') resultadosResolucao.push(saida)
      if (['propor_alteracao_cadastro', 'propor_atribuicoes_estrategistas'].includes(nome) && escopo.politica !== 'carteira_gt3') resultadosCadastro.push(saida)
      if (nome === 'gerenciar_exclusoes_relatorio' && escopo.politica !== 'carteira_gt3') resultadosExclusoes.push(saida)
      if (['registrar_fato_equipe', 'esquecer_fato_equipe'].includes(nome) && escopo.politica !== 'carteira_gt3') resultadosMemoria.push(saida)
      if (!SEM_DADOS.has(nome) && !Object.hasOwn(saida, 'erro')) temRespostaConsulta = true
      if (escopo.politica === 'carteira_gt3') {
        const ref = ctx.refs.resolver(saida.ref)
        const refsDaCarteira = (lista: unknown): boolean => Array.isArray(lista) && lista.every((item) => {
          const id = item && typeof item === 'object' ? ctx.refs.resolver(item.ref) : null
          return !!id && escopo.clientIds.has(id)
        })
        const listaAlertasValida = nome === 'listar_alertas' && typeof saida.data === 'string'
          && Number.isInteger(saida.total) && Number(saida.total) >= 0
          && !!saida.alertas && typeof saida.alertas === 'object' && !Array.isArray(saida.alertas)
          && Object.values(saida.alertas).every((bloco) => !!bloco && typeof bloco === 'object'
            && 'quantidade' in bloco && Number.isInteger(bloco.quantidade) && Number(bloco.quantidade) >= 0
            && 'itens' in bloco && refsDaCarteira(bloco.itens))
          && (Object.keys(saida.alertas).length > 0 || typeof saida.aviso === 'string')
        const relatorioValido = nome === 'relatorio_carteira' && Number.isInteger(saida.total_clientes)
          && Number(saida.total_clientes) >= 0 && Number(saida.total_clientes) <= escopo.clientIds.size
          && Number.isInteger(saida.pagina) && Number(saida.pagina) >= 1
          && Number.isInteger(saida.por_pagina) && Number(saida.por_pagina) >= 1 && Number(saida.por_pagina) <= 100
          && typeof saida.tem_mais === 'boolean' && refsDaCarteira(saida.clientes)
        const temDados = nome === 'buscar_cliente' ? refsDaCarteira(saida.clientes) && (saida.clientes as unknown[]).length > 0
          : nome === 'listar_alertas' ? listaAlertasValida
          : nome === 'relatorio_carteira' ? relatorioValido
          : !!ref && escopo.clientIds.has(ref)
        if (ferramentaCarteiraGt3(nome) && saida.falha_leitura === true) falhaConsultaGt3 = true
        if (ferramentaCarteiraGt3(nome) && !Object.hasOwn(saida, 'erro') && temDados) {
          ctx.leuDados = true
          if (relatorioValido && (saida.clientes as unknown[]).length > 0) carteiraConsultadaGt3 = true
          if (listaAlertasValida && saida.total === 0) {
            // Uma leitura vazia só fundamenta a ausência de alertas nas fontes
            // consultadas. Não libera uma narrativa inventada sobre a carteira.
            respostaVaziaGt3 = `Nenhum alerta encontrado nas fontes consultadas.${typeof saida.aviso === 'string' ? `\n\nLimites da consulta: ${saida.aviso}` : ''}`
          } else if (relatorioValido && (saida.clientes as unknown[]).length === 0) {
            const cobertura = saida.cobertura && typeof saida.cobertura === 'object'
              && 'avisos' in saida.cobertura && Array.isArray(saida.cobertura.avisos)
              ? saida.cobertura.avisos.filter((v): v is string => typeof v === 'string').join(' ') : ''
            respostaVaziaGt3 = Number(saida.total_clientes) === 0
              ? 'Nenhum cliente autorizado disponível para este relatório.'
              : `Não há clientes nesta página. A carteira autorizada possui ${saida.total_clientes} cliente(s); consulte uma página anterior.`
            if (cobertura) respostaVaziaGt3 += `\n\nLimites da consulta: ${cobertura}`
          } else leuDadosClienteGt3 = true
        }
      } else if (!SEM_DADOS.has(nome) && !Object.hasOwn(saida, 'erro')) ctx.leuDados = true
      return blocoFerramenta(nome, saida)
    },
    modelo: modeloDaEnv(e.modelo),
    esforco: e.esforco ?? esforcoDaEnv(null),
    prazoMs: e.prazoMs,
    fetchFn: e.fetchFn,
  })
  const base = { ferramentas: r.ferramentas, passos: r.passos, uso: r.uso, modelo: r.modelo, duracaoMs: r.duracaoMs,
    ...(escopo.politica === 'carteira_gt3' ? { carteiraConsultada: carteiraConsultadaGt3 } : {}) }
  const reciboResolucao = resultadosResolucao.length ? confirmarResolucao(resultadosResolucao) : null
  const reciboCadastro = recibosAcoesCadastro(resultadosCadastro)
  const recibos = [reciboResolucao, reciboCadastro, recibosExclusoesRelatorio(resultadosExclusoes), recibosMemoria(resultadosMemoria)].filter(Boolean).join('\n\n') || null
  if ((!r.ok || !r.texto) && !recibos) {
    return { ok: false, partes: [], texto: null, falha: 'erro_ia', motivo: r.motivo, ajustes: [], ...base }
  }
  if (escopo.politica === 'carteira_gt3' && falhaConsultaGt3) {
    return { ok: true, partes: [TEXTO_FALHA_CONSULTA_GT3], texto: TEXTO_FALHA_CONSULTA_GT3, ajustes: [], ...base }
  }
  if (escopo.politica === 'carteira_gt3' && !ctx.leuDados) {
    return { ok: true, partes: [AJUDA_CARTEIRA_GT3], texto: AJUDA_CARTEIRA_GT3, ajustes: [], ...base }
  }
  const resposta = escopo.politica === 'carteira_gt3' && respostaVaziaGt3 && !leuDadosClienteGt3
    ? respostaVaziaGt3 : r.ok ? r.texto : null
  const texto = [recibos, !recibos || temRespostaConsulta ? resposta : null].filter(Boolean).join('\n\n')
  const s = prepararSaida(texto, { canario, urlsPermitidas: ctx.urlsVistas,
    // O loop aceita até 40 ações: não truncar recibos e esconder um resultado.
    // Guardas de canário, vazamento e dados pessoais continuam as mesmas.
    ...(recibos ? { maxCaracteres: 40_000, maxPartes: 40 } : {}),
    codigosConfirmacaoPermitidos: new Set(resultadosCadastro.filter(r => r.ok === true && typeof r.codigo_confirmacao === 'string').map(r => String(r.codigo_confirmacao))),
    ...(escopo.politica === 'carteira_gt3' ? { formato: 'markdown' as const, maxCaracteres: 8_000, maxBytes: 16_000, maxPartes: 1 } : {}) })
  if (!s.ok) {
    if (recibos) {
      const comprovante = prepararSaida(recibos, { canario, urlsPermitidas: ctx.urlsVistas, maxCaracteres: 40_000, maxPartes: 40,
        codigosConfirmacaoPermitidos: new Set(resultadosCadastro.filter(r => r.ok === true && typeof r.codigo_confirmacao === 'string').map(r => String(r.codigo_confirmacao))) })
      if (comprovante.ok) return { ok: true, partes: comprovante.partes, texto: comprovante.texto, ajustes: [...comprovante.ajustes, 'consulta_bloqueada_recibo_preservado'], ...base }
    }
    const m: MotivoBloqueio = s.motivo
    return { ok: false, partes: [], texto: null, falha: m === 'vazio' ? 'erro_ia' : 'bloqueado', motivo: m, ajustes: [], ...base }
  }
  return { ok: true, partes: s.partes, texto: s.texto, ajustes: s.ajustes, ...base }
}
