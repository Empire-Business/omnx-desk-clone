import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { carregarRegras, carregarOpcoesRelatorio, coletarDadosRelatorio } from '../_shared/wa-relatorio-dados.ts'
import { FUSO_PADRAO, contarRelatorio, partesDoAviso, pedidoHumanizacaoRelatorio, pedidoHumanizacaoRelatorioGrupo } from '../_shared/wa-relatorio.ts'
import type { OpcoesEnvio, ResultadoEnvio, WaProvider } from '../_shared/wa-provider.ts'
import { carregarInfoComoFalar, comoFalarPara } from '../_shared/wa-agente-rodape.ts'
import { carregarAprendizados, preferenciasParaRelatorio } from '../_shared/wa-agente-ferr-aprendizado.ts'
import { humanizarTexto, periodoDoDia, type ChamadaIa } from '../_shared/wa-humanizar.ts'

/** Mesmo coletor, preferências publicadas e rodapé para cron, prévia e envio pontual. */
export async function prepararRelatorio(admin: SupabaseClient, tenantId: string, agora: Date, links: { painel: string | null; vinculos: string | null }) {
  const regras = await carregarRegras(admin, tenantId)
  const opcoes = await carregarOpcoesRelatorio(admin, tenantId)
  const dados = await coletarDadosRelatorio(admin, tenantId, regras, agora, FUSO_PADRAO, opcoes)
  dados.linkPainel = links.painel
  dados.linkVinculos = links.vinculos
  dados.preferenciasApresentacao = preferenciasParaRelatorio(await carregarAprendizados(admin, tenantId))
  return { dados, contagem: contarRelatorio(dados), infoComoFalar: await carregarInfoComoFalar(admin, tenantId), periodo: periodoDoDia(agora, FUSO_PADRAO) }
}

export async function redigirRelatorio(
  preparado: Awaited<ReturnType<typeof prepararRelatorio>>,
  destino: { tipo: 'grupo' | 'pessoa'; destino: string; nome: string },
  chamarIa: ChamadaIa | null, prazoMs: number,
) {
  const dados = { ...preparado.dados, comoFalar: comoFalarPara(preparado.infoComoFalar, destino) }
  const pedido = destino.tipo === 'grupo'
    ? pedidoHumanizacaoRelatorioGrupo(dados, preparado.periodo)
    : pedidoHumanizacaoRelatorio(destino.nome, dados, preparado.periodo)
  return humanizarTexto(pedido, { chamarIa, prazoMs })
}

/** Pausa entre as mensagens de um mesmo aviso (curta: é a continuação do texto). */
const PAUSA_ENTRE_PARTES_MS: readonly [number, number] = [1_500, 3_000]

/**
 * Envia o aviso INTEIRO pela não oficial: se for longo, em várias mensagens
 * (partesDoAviso), na ordem. Nada é cortado. A 1ª parte leva a chave de
 * idempotência original; as seguintes, a mesma chave com ":pN".
 * Falha numa parte depois da 1ª lança o erro como incerto (parte já saiu).
 */
export async function enviarAvisoCompleto(
  provider: Pick<WaProvider, 'sendText'>, destino: string, texto: string, opcoes: OpcoesEnvio,
  esperar: (ms: number) => Promise<unknown> = (ms) => new Promise((r) => setTimeout(r, ms)),
  aleatorio: () => number = Math.random,
): Promise<ResultadoEnvio & { messageIds: (string | null)[]; partes: number }> {
  const partes = partesDoAviso(texto)
  const ids: (string | null)[] = []
  let primeiro: ResultadoEnvio | null = null
  for (let k = 0; k < partes.length; k++) {
    if (k > 0) {
      const [min, max] = PAUSA_ENTRE_PARTES_MS
      await esperar(min + Math.floor(aleatorio() * (max - min)))
    }
    const chave = opcoes.chaveIdempotencia ? (k === 0 ? opcoes.chaveIdempotencia : `${opcoes.chaveIdempotencia}:p${k + 1}`) : undefined
    try {
      const r = await provider.sendText(destino, partes[k], { ...opcoes, ...(chave ? { chaveIdempotencia: chave } : {}) })
      if (k === 0) primeiro = r
      ids.push(r.messageId)
    } catch (e) {
      // Já saiu parte do aviso: o resultado é incerto (não repetir às cegas).
      if (k > 0 && e && typeof e === 'object' && 'incerto' in e) (e as { incerto: boolean }).incerto = true
      throw e
    }
  }
  if (!primeiro) throw new Error('aviso_vazio')
  return { ...primeiro, messageIds: ids, partes: partes.length }
}
