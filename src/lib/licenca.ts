// Licença HTAI desta instalação, vista pela tela. A regra e a trava de verdade
// ficam no servidor e no banco (docs/LICENCA-HTAI.md); aqui só se mostra o aviso
// e se evita levar a pessoa a telas que não vão funcionar.
import { supabase } from '@/lib/supabase'

export type ModoLicenca = 'off' | 'shadow' | 'enforce'

export interface SituacaoLicenca {
  modo: ModoLicenca
  nega: boolean
  motivo: string | null
  mensagem: string | null
  valido_ate: string | null
}

export const LICENCA_DESLIGADA: SituacaoLicenca = { modo: 'off', nega: false, motivo: null, mensagem: null, valido_ate: null }

const DADOS_GUARDADOS = 'Seus dados estão guardados e você pode exportá-los.'

export const MENSAGEM_LICENCA_VENCIDA =
  `A licença deste app venceu. Renove na sua conta HTAI para voltar a usar. ${DADOS_GUARDADOS}`

/**
 * Texto do aviso por motivo da negação. Cada um pede uma ação diferente: vencida
 * se renova; suspensa ou revogada só a HTAI desfaz (renovar não resolve); sem
 * confirmação o app volta sozinho quando a conexão com a HTAI voltar. `vencida`
 * é o motivo calculado no app (passou da folga sem confirmar na central);
 * `expired` é a licença vencida na central. Mesmos textos do banco
 * (20261119180200) e das funções (_shared/htai-licenca-core.ts).
 */
export const MENSAGENS_LICENCA: Readonly<Record<string, string>> = {
  nao_ativado: `Ative a licença deste app. ${DADOS_GUARDADOS}`,
  expired: MENSAGEM_LICENCA_VENCIDA,
  suspended: `A licença deste app está suspensa: o uso foi pausado pela HTAI. Fale com o suporte da HTAI para voltar a usar. ${DADOS_GUARDADOS}`,
  revoked: `A licença deste app foi desativada pela HTAI. Fale com o suporte da HTAI para saber o motivo. ${DADOS_GUARDADOS}`,
  vencida: 'Não foi possível confirmar a licença deste app: ele ficou mais tempo que o permitido sem falar com a HTAI. '
    + `Ele volta a funcionar sozinho quando a conexão voltar; se continuar assim, fale com o suporte da HTAI. ${DADOS_GUARDADOS}`,
}

export function normalizarSituacao(data: unknown): SituacaoLicenca {
  if (!data || typeof data !== 'object') return LICENCA_DESLIGADA
  const d = data as Record<string, unknown>
  const modo: ModoLicenca = d.modo === 'enforce' || d.modo === 'shadow' ? d.modo : 'off'
  if (modo === 'off') return LICENCA_DESLIGADA
  const motivo = typeof d.motivo === 'string' ? d.motivo : null
  // O texto sai do motivo (certo mesmo com um banco ainda sem 20261119180200);
  // motivo desconhecido usa o texto do banco.
  const porMotivo = motivo && Object.hasOwn(MENSAGENS_LICENCA, motivo) ? MENSAGENS_LICENCA[motivo] : null
  return {
    modo,
    nega: d.nega === true,
    motivo,
    mensagem: porMotivo ?? (typeof d.mensagem === 'string' ? d.mensagem : d.nega === true ? MENSAGEM_LICENCA_VENCIDA : null),
    valido_ate: typeof d.valido_ate === 'string' ? d.valido_ate : null,
  }
}

type RpcSemTipo = { rpc: (fn: string) => Promise<{ data: unknown; error: unknown }> }

async function lerDoBanco(): Promise<SituacaoLicenca> {
  // A RPC não está nos tipos gerados; sem a migração (ou com erro) = desligada.
  const { data, error } = await (supabase as unknown as RpcSemTipo).rpc('htai_licenca_situacao')
  return error ? LICENCA_DESLIGADA : normalizarSituacao(data)
}

/**
 * Uma RPC barata (em modo off o banco responde "desligada" sem ler mais nada).
 * Só quando está negada a tela pede à função htai-licenca uma conferência na
 * central agora (ex.: logo depois de ativar ou de renovar) e relê.
 */
export async function buscarSituacaoLicenca(): Promise<SituacaoLicenca> {
  const s = await lerDoBanco()
  if (!s.nega) return s
  try {
    await supabase.functions.invoke('htai-licenca', { body: { acao: 'atualizar' } })
  } catch {
    return s
  }
  return lerDoBanco()
}

/**
 * Telas que continuam abertas com a licença negada (contrato §4, decisão do dono
 * de 09/11/2026): login e senha; Configurações da CONTA (perfil, aparência, marca
 * e dados da empresa, verificação em duas etapas e "Exportar dados", em
 * /configuracoes?secao=dados; Ajustes é só o índice); Ajuda (manual, Segurança e
 * reportes). Administração da equipe, integrações e as telas de dados ficam
 * fechadas; a exportação completa sai pela função htai-exportar.
 */
export const ROTAS_ABERTAS_SEM_LICENCA: readonly string[] = [
  '/login', '/reset-password', '/trocar-senha', '/manual',
  '/configuracoes', '/ajustes', '/seguranca',
  '/reportes', '/meus-reportes',
]

/** Endereço da seção de exportação (sempre aberta). */
export const ROTA_EXPORTAR_DADOS = '/configuracoes?secao=dados'

export function rotaAbertaSemLicenca(pathname: string): boolean {
  const p = pathname.replace(/\/+$/, '') || '/'
  return ROTAS_ABERTAS_SEM_LICENCA.some((r) => p === r)
}

/** Nome do arquivo da exportação (mesmo padrão da função htai-exportar). */
export function nomeArquivoExportacao(hoje = new Date()): string {
  return `dados-desk-${hoje.toISOString().slice(0, 10)}.json`
}
