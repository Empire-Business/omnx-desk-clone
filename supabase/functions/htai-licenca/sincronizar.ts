// Sincroniza a licença da instalação com a central do HTAI (pull assinado) e
// guarda o último envelope válido. Puro: o banco e a rede são injetados (testável).
import {
  puxarLicenca,
  type CredenciaisHtai,
  type HtaiAppUpdate,
  type HtaiEnvelope,
  type HtaiMode,
} from '../_shared/htai-licenca-core.ts'

export interface EstadoLinha {
  versao: number | null
  renew_after: string | null
  ultima_tentativa_em: string | null
}

export interface SincronizarDeps {
  modo: HtaiMode
  credenciais: CredenciaisHtai | null
  versaoApp: string | null
  fetch: typeof fetch
  nowMs(): number
  uuid(): string
  lerEstado(): Promise<EstadoLinha | null>
  /** Grava campos na linha única de htai_licenca_estado (upsert). */
  gravar(campos: Record<string, unknown>): Promise<void>
  registerSignature(hash: string): Promise<boolean>
}

export type ResultadoSync =
  | { feito: 'desligado' }
  | { feito: 'nao_ativado' }
  | { feito: 'em_dia' }
  | { feito: 'aguardando' }
  | { feito: 'aplicado'; status: string; versao: number; atualizacao: HtaiAppUpdate | null }
  | { feito: 'ignorado_versao_antiga'; versao: number }
  | { feito: 'rejeitado'; codigo: string }
  | { feito: 'central_fora'; motivo: string }

/**
 * `forcar`: puxa mesmo antes de renew_after (pedido da tela), respeitando um
 * intervalo mínimo de `intervaloMinimoMs` entre tentativas.
 */
export async function sincronizarLicenca(
  deps: SincronizarDeps,
  opcoes: { forcar?: boolean; intervaloMinimoMs?: number } = {},
): Promise<ResultadoSync> {
  if (deps.modo === 'off') return { feito: 'desligado' }
  const agora = deps.nowMs()
  const iso = new Date(agora).toISOString()
  if (!deps.credenciais) {
    await deps.gravar({ ultima_tentativa_em: iso, ultimo_erro: 'nao_ativado' })
    return { feito: 'nao_ativado' }
  }
  const estado = await deps.lerEstado()
  const renovar = estado?.renew_after ? Date.parse(estado.renew_after) : 0
  if (!opcoes.forcar && estado?.versao && Number.isFinite(renovar) && agora < renovar) return { feito: 'em_dia' }
  const ultima = estado?.ultima_tentativa_em ? Date.parse(estado.ultima_tentativa_em) : 0
  if (opcoes.forcar && Number.isFinite(ultima) && agora - ultima < (opcoes.intervaloMinimoMs ?? 60_000)) {
    return { feito: 'aguardando' }
  }
  await deps.gravar({ ultima_tentativa_em: iso })

  const r = await puxarLicenca({
    credenciais: deps.credenciais,
    versaoApp: deps.versaoApp,
    fetch: deps.fetch,
    nowMs: deps.nowMs,
    uuid: deps.uuid,
    registerSignature: deps.registerSignature,
  })
  if (r.kind === 'unreachable') {
    await deps.gravar({ ultimo_erro: r.reason })
    return { feito: 'central_fora', motivo: r.reason }
  }
  if (r.kind === 'rejected') {
    // 401/403 sem assinatura (chave desconhecida, app_mismatch...): não aplica
    // nada e não estende a validade; o último envelope válido continua valendo
    // até valid_until + folga. Instalação revogada vem como 200 assinado.
    await deps.gravar({ ultimo_erro: `rejeitado:${r.code}` })
    return { feito: 'rejeitado', codigo: r.code }
  }
  const env: HtaiEnvelope = r.envelope
  if (estado?.versao && env.version < estado.versao) {
    await deps.gravar({ ultimo_erro: 'versao_antiga', verificado_em: iso })
    return { feito: 'ignorado_versao_antiga', versao: env.version }
  }
  await deps.gravar({
    instalacao_id: deps.credenciais.instalacaoId,
    status: env.status,
    valid_until: env.valid_until,
    renew_after: env.renew_after,
    offline_grace_seconds: env.offline_grace_seconds,
    versao: env.version,
    envelope: env,
    envelope_hash: r.bodyHash,
    verificado_em: iso,
    ultimo_erro: null,
  })
  return { feito: 'aplicado', status: env.status, versao: env.version, atualizacao: r.update }
}
