// Relatório diário ao gestor no WhatsApp (etapa 9.3 — docs/prd.md §0.6).
//
// Cron pelo agendador; modo manual admin envia somente um grupo cadastrado.
// Chamada agendada (pg_cron, a cada 15 min — migration 20261026160000).
// Em cada chamada:
//   1. confere o segredo do agendador (cabeçalho x-cron-secret contra o Vault);
//   2. lista as empresas com o relatório LIGADO e cujo horário (relatorio_hora,
//      fuso de Brasília) já chegou — até 3h depois, para não mandar "bom dia" à noite;
//   3. para cada empresa: lê os pontos de atenção, monta a mensagem e envia
//      a cada gestor ativo, um por vez.
//
// Segurança (revisão design, F1–F7):
//   * F1: cron autentica pelo segredo do Vault. Manual autentica JWT real, admin
//     ativo e tenant no servidor. verify_jwt=false no gateway preserva o cron.
//   * F2: client service_role, então TODA consulta tem `.eq('tenant_id', …)`. A
//     única exceção é a descoberta de quem está ligado (wa_auto_config), que só
//     devolve tenant_id + hora.
//   * F4: o destino é SEMPRE o cadastrado em wa_auto_gestores: telefone (CHECK
//     E.164 no banco, conferido de novo aqui) ou GRUPO INTERNO (…@g.us, formato real
//     de grupo). Nenhum texto de IA decide destino.
//   * Grupo interno (migration 20261026250000): sai SEMPRE pela UAZAPI do número
//     configurado — inclusive com a empresa na oficial (mesmo caminho do link de
//     reunião em wa-auto-agendar; a Zernio não abre conversa de grupo). A cada envio
//     confere de novo: grupo do número que envia e SEM vínculo com cliente
//     (chat_contacts.client_id / chat_contact_clients) — o relatório tem dado interno.
//     Reprovado → linha 'falhou' do dia com o motivo (grupo_de_cliente,
//     grupo_nome_de_cliente, grupo_fora_da_instancia, oficial_sem_grupo…). Saudação para o grupo, sem nome.
//   * UAZAPI (não oficial): o texto de cada gestor é reescrito pela IA a cada envio
//     (_shared/wa-humanizar.ts) — nomes, data e horários vão à IA como marcadores
//     ([CLIENTE_1]…), a saída é validada (fatos, números, links, termos) e, se
//     reprovar 2x ou a IA falhar, sai um fallback variado. Pausa aleatória (3–6 s)
//     entre gestores e "digitando…" proporcional ao tamanho. Zernio: nada muda.
//   * F5: wa_auto_envios guarda só contagens (+ humanizado: 'ia'|'fallback') — sem
//     nomes de cliente, sem texto.
//   * F6: idempotência por (tenant, 'relatorio_diario', gestor, dia) — a linha é
//     reservada ANTES do envio (UNIQUE no banco). Disjuntor por empresa.
//   * F7: API oficial (Zernio) envia SÓ por modelo aprovado (template_relatorio).
//   * Toda mensagem cita o nome do cliente; nenhum trecho de conversa.
//   * Resposta e log: só contagens e códigos, nunca nomes, telefones ou tokens.
//   * Assistente da equipe (26/10/2026): com o assistente ligado, o texto pela UAZAPI
//     para membro ativo / grupo liberado termina com o rodapé LITERAL "como falar
//     comigo" (_shared/wa-agente-rodape.ts → bloco [COMO_FALAR], a IA não reescreve).
//     Oficial (modelo aprovado) não tem rodapé.
//   * Opções (27/10/2026 — wa_auto_config.relatorio_agrupar_estrategista /
//     relatorio_so_clientes_ativos): a lista agrupada por estrategista continua um
//     bloco LITERAL ([ITENS_ALERTAS]) — nome de estrategista, cliente e motivo não
//     passam pela IA. Na oficial, tudo numa linha ("Octavio: Marina (…); Luis: …").
import { servirComLicenca } from '../_shared/htai-licenca.ts'
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  resolveWaProvider, resolveUazapiParaGrupos, disjuntorAberto, WaProviderError, type ResultadoEnvio, type WaProvider,
} from '../_shared/wa-provider.ts'
import { E164, chaveIdempotencia, janelaDia } from '../_shared/wa-mensagem.ts'
import {
  FUSO_PADRAO, linkPainelSeguro, montarTemplateRelatorio, relatorioDevido,
} from '../_shared/wa-relatorio.ts'
import { ERRO_GRUPO, destinoGrupo, motivoGrupoBloqueado } from '../_shared/wa-grupos-internos.ts'
import { GruposError, carregarGruposInternos } from '../_shared/wa-grupos-internos-dados.ts'
import {
  criarChamadaOpenRouter, pausaEntreEnviosMs,
  type ChamadaIa, type OrigemHumanizacao,
} from '../_shared/wa-humanizar.ts'
import { ColetaError } from '../_shared/wa-relatorio-dados.ts'
import { enviarAvisoCompleto, prepararRelatorio, redigirRelatorio } from './preparar.ts'
import { executarManual, corsHeaders, resposta as json } from './manual.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
/**
 * Link do painel de alertas no fim da mensagem (UAZAPI): o gestor marca ali o que
 * não deve continuar. Sem APP_URL configurado, a linha não sai. Na oficial (Zernio)
 * o modelo aprovado não tem link.
 */
const APP_URL = (Deno.env.get('APP_URL') ?? '').trim().replace(/\/+$/, '')
const LINK_PAINEL = linkPainelSeguro(APP_URL ? `${APP_URL}/ia/alertas` : null)
/** Aba Vínculos (seção "Grupos ativos sem cliente vinculado"); sem APP_URL, a frase sai sem link. */
const LINK_VINCULOS = linkPainelSeguro(APP_URL ? `${APP_URL}/clientes/grupos` : null)

/** Depois do horário configurado, ainda tenta por até 3h (se o agendador falhou numa rodada). */
const TOLERANCIA_MIN = 180
/** Para de pegar empresa nova perto do limite de tempo da função; o resto vai na próxima rodada. */
const ORCAMENTO_MS = 70_000
/** Pausa entre um gestor e outro na oficial (na não oficial: pausaEntreEnviosMs, 3–6 s aleatórios). */
const PAUSA_ENTRE_ENVIOS_MS = 1_500
/**
 * Não começa um gestor novo depois disto (desde o início da execução). Pior caso de
 * um gestor pela UAZAPI depois daqui: IA até 85 s desde o início (prazo abaixo) +
 * envio (12 s + até 7 s de "digitando…") + 1 repetição só em 429 (~1,2 s + 19 s)
 * ≈ 125 s + gravações, dentro do limite de 150 s da edge function. Quem não couber
 * fica para a próxima rodada do agendador (nada é reservado), dentro da tolerância.
 */
const LIMITE_INICIO_ENVIO_MS = 75_000
const PRAZO_IA_MS = 15_000
const MAX_EMPRESAS_POR_RODADA = 500

function espera(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * Um destino do relatório: pessoa (privado, telefone E.164) ou grupo INTERNO
 * (…@g.us). `destino` vem SEMPRE do cadastro (wa_auto_gestores), nunca de IA (F4).
 */
interface Destino { id: string; nome: string; tipo: 'pessoa' | 'grupo'; destino: string }

interface LinhaGestor {
  id: string
  nome: string
  telefone: string | null
  tipo: string | null
  grupo_jid: string | null
  grupo_nome: string | null
}

type ResultadoEmpresa =
  | 'enviado' // pelo menos um destino recebeu nesta rodada
  | 'ja_enviado' // todos os destinos já tinham o aviso de hoje
  | 'sem_gestor'
  | 'app_desligado'
  | 'pausado' // disjuntor aberto: tenta na próxima rodada
  | 'adiado' // acabou o tempo desta execução: os destinos restantes vão na próxima rodada
  | 'falhou'

interface Placar { enviados: number; falhas: number; duplicados: number }

/** Grava (com a chave do dia) uma falha para cada destino pendente — não tenta de novo hoje. */
async function registrarFalhaParaTodos(
  admin: SupabaseClient, tenantId: string, provider: 'uazapi' | 'zernio', destinos: Destino[],
  chaves: Map<string, string>, erro: string, placar: Placar, motivo = 'nao_configurado',
) {
  for (const d of destinos) {
    const { error } = await admin.from('wa_auto_envios').insert({
      tenant_id: tenantId,
      tipo: 'relatorio_diario',
      provider,
      destino: d.destino,
      destino_nome: d.nome,
      status: 'falhou',
      erro,
      chave_idempotencia: chaves.get(d.id),
      payload: { motivo, destino_tipo: d.tipo },
    })
    if (error && (error as { code?: string }).code === '23505') placar.duplicados++
    else placar.falhas++
  }
}

/** Cadastro → destinos válidos (pessoa: E.164; grupo: formato real de grupo). */
function destinosDoCadastro(linhas: LinhaGestor[]): Destino[] {
  const out: Destino[] = []
  for (const l of linhas) {
    if (l.tipo === 'grupo') {
      const jid = destinoGrupo(l.grupo_jid)
      if (jid) out.push({ id: l.id, nome: l.grupo_nome || l.nome || 'Grupo interno', tipo: 'grupo', destino: jid })
    } else if (l.telefone && E164.test(l.telefone)) {
      out.push({ id: l.id, nome: l.nome, tipo: 'pessoa', destino: l.telefone })
    }
  }
  return out
}

/** Quem vai sair nesta rodada e por qual provedor. */
interface Lote {
  destinos: Destino[]
  provider: WaProvider
  fonteSegredo: string
  /** Pessoas na oficial: só por modelo aprovado (F7). */
  template: string | null
  idioma: string
}

async function processarEmpresa(
  admin: SupabaseClient, tenantId: string, agora: Date, placar: Placar, inicio: number, chamarIa: ChamadaIa | null,
): Promise<ResultadoEmpresa> {
  // ---- App ligado nesta empresa ----
  // Só segue com enabled === true. Erro de leitura → ColetaError (conta como 'falhou',
  // nada foi reservado e a próxima rodada tenta de novo); linha ausente ou
  // enabled nulo/false → app desligado.
  const { data: app, error: errApp } = await admin
    .from('app_modules')
    .select('enabled')
    .eq('tenant_id', tenantId)
    .eq('slug', 'automacoes-wa')
    .maybeSingle()
  if (errApp) throw new ColetaError('app_modules')
  if ((app as { enabled?: boolean | null } | null)?.enabled !== true) return 'app_desligado'

  // ---- Destinos ativos: pessoas e grupos internos (o banco limita a 10 por empresa) ----
  const { data: gs, error: errG } = await admin
    .from('wa_auto_gestores')
    .select('id, nome, telefone, tipo, grupo_jid, grupo_nome')
    .eq('tenant_id', tenantId)
    .eq('ativo', true)
    .order('created_at', { ascending: true })
    .limit(10)
  if (errG) return 'falhou'
  // Destino só do cadastro: pessoa E.164, grupo com formato real de grupo (F4).
  const destinos = destinosDoCadastro((gs ?? []) as LinhaGestor[])
  if (destinos.length === 0) return 'sem_gestor'

  // ---- Quem ainda não recebeu hoje (evita recalcular tudo a cada 15 min) ----
  // Grupo: a chave usa o id do grupo (…@g.us) como destino — (tenant, tipo, grupo, dia).
  const janela = janelaDia(agora, FUSO_PADRAO)
  const chaves = new Map(destinos.map((d) => [d.id, chaveIdempotencia('relatorio_diario', d.destino, janela)]))
  const { data: jaFeitos, error: errJ } = await admin
    .from('wa_auto_envios')
    .select('chave_idempotencia')
    .eq('tenant_id', tenantId)
    .eq('tipo', 'relatorio_diario')
    .in('chave_idempotencia', [...chaves.values()])
  if (errJ) return 'falhou'
  const feitas = new Set((jaFeitos ?? []).map((r) => (r as { chave_idempotencia: string }).chave_idempotencia))
  const pendentes = destinos.filter((d) => !feitas.has(chaves.get(d.id) as string))
  if (pendentes.length === 0) return 'ja_enviado'
  const pessoas = pendentes.filter((d) => d.tipo === 'pessoa')
  const grupos = pendentes.filter((d) => d.tipo === 'grupo')

  const { data: cfgBruta, error: errCfg } = await admin
    .from('wa_auto_config').select('provider, uazapi_instance_id').eq('tenant_id', tenantId).maybeSingle()
  if (errCfg) throw new ColetaError('wa_auto_config')
  const cfg = (cfgBruta ?? { provider: 'uazapi', uazapi_instance_id: null }) as {
    provider: string | null; uazapi_instance_id: string | null
  }
  const provEmpresa: 'uazapi' | 'zernio' = cfg.provider === 'zernio' ? 'zernio' : 'uazapi'

  const lotes: Lote[] = []
  let pausado = false

  // ---- Pessoas: provedor da empresa (segredo do Vault) ----
  if (pessoas.length > 0) {
    let resolvido
    try {
      resolvido = await resolveWaProvider(admin, tenantId)
    } catch (e) {
      const msg = e instanceof WaProviderError ? e.message : 'Não foi possível preparar o envio.'
      await registrarFalhaParaTodos(admin, tenantId, provEmpresa, pessoas, chaves, msg, placar)
    }
    if (resolvido) {
      const { provider, config } = resolvido
      if (provider.nome === 'zernio' && config.template_relatorio !== 'omnx_aviso_diario_v2') {
        // F7: oficial só com modelo aprovado.
        await registrarFalhaParaTodos(admin, tenantId, 'zernio', pessoas, chaves,
          'O modelo oficial do aviso diário precisa da versão sem agenda (omnx_aviso_diario_v2), aprovada pela Meta. Veja em Conexão → Textos aprovados pela Meta.', placar)
      } else if (await disjuntorAberto(admin, tenantId, provider.nome)) {
        pausado = true // não reserva nada: tenta na próxima rodada
      } else {
        lotes.push({
          destinos: pessoas, provider, fonteSegredo: resolvido.fonteSegredo,
          template: config.template_relatorio, idioma: config.template_idioma,
        })
      }
    }
  }

  // ---- Grupos internos: SEMPRE pela UAZAPI (a oficial não abre conversa de grupo) ----
  // Mesmo caminho do link de reunião (wa-auto-agendar): na oficial, sai pela UAZAPI do
  // número configurado (uazapi_instance_id). Conferido de novo AGORA: o grupo continua
  // sendo do número que envia e continua sem vínculo com cliente.
  if (grupos.length > 0) {
    let leitura
    try {
      leitura = await carregarGruposInternos(admin, tenantId, cfg.uazapi_instance_id, grupos.map((g) => g.destino))
    } catch (e) {
      throw new ColetaError(e instanceof GruposError ? e.message : 'grupos') // nada reservado: próxima rodada
    }
    if (!leitura.instanciaUuid) {
      const motivo = provEmpresa === 'zernio' ? 'oficial_sem_grupo' : 'sem_numero_grupo'
      await registrarFalhaParaTodos(admin, tenantId, 'uazapi', grupos, chaves, ERRO_GRUPO[motivo], placar, motivo)
    } else {
      const permitidos = new Set(leitura.grupos.map((g) => g.grupo_jid))
      const liberados: Destino[] = []
      for (const g of grupos) {
        const motivo = motivoGrupoBloqueado(g.destino, permitidos, leitura.deCliente, leitura.nomeDeCliente)
        if (motivo) {
          // Grupo de cliente / fora do número: não envia hoje e fica registrado.
          await registrarFalhaParaTodos(admin, tenantId, 'uazapi', [g], chaves, ERRO_GRUPO[motivo], placar, motivo)
        } else liberados.push(g)
      }
      if (liberados.length > 0) {
        let uaz
        try {
          uaz = await resolveUazapiParaGrupos(admin, tenantId)
        } catch (e) {
          const motivo = provEmpresa === 'zernio' ? 'oficial_sem_grupo' : 'nao_configurado'
          const msg = provEmpresa === 'zernio'
            ? ERRO_GRUPO.oficial_sem_grupo
            : e instanceof WaProviderError ? e.message : 'Não foi possível preparar o envio.'
          await registrarFalhaParaTodos(admin, tenantId, 'uazapi', liberados, chaves, msg, placar, motivo)
        }
        if (uaz) {
          if (await disjuntorAberto(admin, tenantId, 'uazapi')) pausado = true
          else lotes.push({ destinos: liberados, provider: uaz.provider, fonteSegredo: uaz.fonteSegredo, template: null, idioma: 'pt_BR' })
        }
      }
    }
  }

  if (lotes.length === 0) return pausado ? 'pausado' : 'falhou'

  // ---- Dados do relatório (uma vez por empresa; iguais para todos os destinos) ----
  const preparado = await prepararRelatorio(admin, tenantId, agora, { painel: LINK_PAINEL, vinculos: LINK_VINCULOS })
  const { dados, contagem } = preparado

  let algumEnviado = false
  let adiado = false
  const fila = lotes.flatMap((l) => l.destinos.map((d) => ({ d, l })))
  for (let i = 0; i < fila.length; i++) {
    const { d: g, l: lote } = fila[i]
    const provider = lote.provider
    const chave = chaves.get(g.id) as string
    if (i > 0) await espera(provider.nome === 'uazapi' ? pausaEntreEnviosMs() : PAUSA_ENTRE_ENVIOS_MS)
    if (Date.now() - inicio > LIMITE_INICIO_ENVIO_MS) { adiado = true; break }

    // Reserva idempotente ANTES de enviar (UNIQUE (tenant_id, chave_idempotencia)).
    const { data: linha, error: errIns } = await admin
      .from('wa_auto_envios')
      .insert({
        tenant_id: tenantId, // explícito: service_role não tem sessão para o carimbo (F2)
        tipo: 'relatorio_diario',
        provider: provider.nome,
        destino: g.destino,
        destino_nome: g.nome,
        status: 'pendente',
        chave_idempotencia: chave,
        payload: { contagem, destino_tipo: g.tipo }, // só números (F5)
      })
      .select('id')
      .single()
    if (errIns) {
      if ((errIns as { code?: string }).code === '23505') { placar.duplicados++; continue }
      console.error('wa-auto-relatorio-diario: falha ao reservar envio', errIns.code)
      placar.falhas++
      continue
    }

    let status: 'enviado' | 'falhou' = 'falhou'
    let erro: string | null = null
    let messageId: string | null = null
    let humanizado: OrigemHumanizacao | undefined
    let incerto = false
    try {
      const opcoes = { chaveIdempotencia: `${tenantId}:${chave}`, idioma: lote.idioma }
      let r: ResultadoEnvio
      if (provider.nome === 'zernio') {
        // Só pessoas chegam aqui (grupo vai sempre no lote UAZAPI).
        if (g.tipo !== 'pessoa' || !lote.template) throw new WaProviderError('destino_invalido', 'Destino inválido para a API oficial.')
        r = await provider.sendTemplate(g.destino, lote.template,
          montarTemplateRelatorio(g.nome, dados).variaveis, opcoes)
      } else {
        // Um texto diferente para cada destino (a mesma mensagem para vários números é padrão de disparo).
        // Grupo: saudação para o grupo ("Oi, pessoal!"), sem nome de pessoa.
        const prazo = Math.max(0, Math.min(PRAZO_IA_MS, LIMITE_INICIO_ENVIO_MS + 10_000 - (Date.now() - inicio)))
        const h = await redigirRelatorio(preparado, g, chamarIa, prazo)
        humanizado = h.origem
        if (h.origem === 'fallback') console.log('wa-auto-relatorio-diario: fallback da humanização', h.motivos.join(','))
        // O aviso sai inteiro: se for longo, em mais de uma mensagem (nunca cortado).
        r = await enviarAvisoCompleto(provider, g.destino, h.texto, { ...opcoes, humanizado }, espera)
      }
      status = 'enviado'
      messageId = r.messageId
    } catch (e) {
      erro = e instanceof WaProviderError ? e.message : 'Falha inesperada no envio.'
      // Pode ter saído (rede/timeout/5xx): a linha fica 'falhou' com a chave do dia (não repete) e marcada.
      incerto = e instanceof WaProviderError ? e.incerto : true
      if (!(e instanceof WaProviderError)) console.error('wa-auto-relatorio-diario: erro inesperado', (e as Error)?.name)
    }

    await admin
      .from('wa_auto_envios')
      .update({
        status,
        erro,
        payload: {
          contagem, destino_tipo: g.tipo, message_id: messageId, fonte_segredo: lote.fonteSegredo,
          ...(humanizado ? { humanizado } : {}), // só a origem, nunca o texto (F5)
          ...(incerto ? { incerto: true } : {}),
        },
      })
      .eq('id', linha.id)
      .eq('tenant_id', tenantId)

    if (status === 'enviado') { placar.enviados++; algumEnviado = true } else placar.falhas++
  }
  if (algumEnviado) return 'enviado'
  return adiado ? 'adiado' : 'falhou'
}

servirComLicenca(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405)

  // A presença do cabeçalho escolhe exclusivamente o cron; segredo inválido nunca cai no modo manual.
  if (!req.headers.has('x-cron-secret')) {
    const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      auth: { persistSession: false }, global: { headers: { Authorization: req.headers.get('authorization') ?? '' } },
    })
    return executarManual(req, createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } }), userClient,
      criarChamadaOpenRouter(Deno.env.get('OPENROUTER_API_KEY'), { titulo: 'OMNX Desk Aviso Diario WhatsApp' }),
      { painel: LINK_PAINEL, vinculos: LINK_VINCULOS })
  }

  // ---- F1: segredo do agendador (falha fechada) ----
  const segredo = req.headers.get('x-cron-secret') ?? ''
  if (segredo.length < 32 || segredo.length > 256) return json({ ok: false, error: 'unauthorized' }, 401)
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
  const { data: confere, error: errSeg } = await admin.rpc('wa_auto_cron_secret_confere', { p_segredo: segredo })
  if (errSeg || confere !== true) return json({ ok: false, error: 'unauthorized' }, 401)

  const inicio = Date.now()
  const agora = new Date()
  const chamarIa = criarChamadaOpenRouter(Deno.env.get('OPENROUTER_API_KEY'), { titulo: 'OMNX Desk Aviso Diario WhatsApp' })

  // ---- Descoberta: única leitura sem filtro de tenant (só id + hora) ----
  const { data: cfgs, error: errCfg } = await admin
    .from('wa_auto_config')
    .select('tenant_id, relatorio_hora')
    .eq('relatorio_ativo', true)
    .limit(MAX_EMPRESAS_POR_RODADA)
  if (errCfg) {
    console.error('wa-auto-relatorio-diario: falha ao listar empresas', errCfg.code)
    return json({ ok: false, error: 'Falha ao listar empresas.' }, 500)
  }
  const devidas = (cfgs ?? [])
    .map((c) => c as { tenant_id: string; relatorio_hora: string })
    .filter((c) => relatorioDevido(agora, c.relatorio_hora, FUSO_PADRAO, TOLERANCIA_MIN))

  const resultados: Record<ResultadoEmpresa | 'adiado', number> = {
    enviado: 0, ja_enviado: 0, sem_gestor: 0, app_desligado: 0, pausado: 0, falhou: 0, adiado: 0,
  }
  const placar: Placar = { enviados: 0, falhas: 0, duplicados: 0 }

  for (const c of devidas) {
    if (Date.now() - inicio > ORCAMENTO_MS) { resultados.adiado++; continue }
    try {
      resultados[await processarEmpresa(admin, c.tenant_id, agora, placar, inicio, chamarIa)]++
    } catch (e) {
      // Leitura falhou: nada foi reservado, então a próxima rodada tenta de novo.
      resultados.falhou++
      console.error('wa-auto-relatorio-diario: erro na empresa',
        e instanceof ColetaError ? e.message : (e as Error)?.name)
    }
  }

  return json({
    ok: true,
    empresas_ligadas: cfgs?.length ?? 0,
    empresas_na_hora: devidas.length,
    resultados,
    mensagens: placar,
  })
})
