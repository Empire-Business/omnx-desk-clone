/**
 * Captura de contexto técnico para o Reporte de Erros.
 *
 * PRIVACIDADE: coletamos apenas metadados do ambiente (navegador, SO, tela,
 * rota). NUNCA senhas, tokens, cookies, localStorage ou conteúdo de tela.
 */

export interface ContextoReporte {
  url: string
  rota: string
  navegador: string
  sistema: string
  dispositivo: string
  viewport: string
  idioma: string
  user_agent: string
  app: string
  capturado_em: string
}

function detectarNavegador(ua: string): string {
  if (/Edg\//.test(ua)) return 'Edge'
  if (/OPR\/|Opera/.test(ua)) return 'Opera'
  if (/Chrome\//.test(ua)) return 'Chrome'
  if (/Firefox\//.test(ua)) return 'Firefox'
  if (/Safari\//.test(ua)) return 'Safari'
  return 'Desconhecido'
}

function detectarSistema(ua: string): string {
  if (/Windows NT 10/.test(ua)) return 'Windows'
  if (/Windows/.test(ua)) return 'Windows'
  if (/Android/.test(ua)) return 'Android'
  if (/iPhone|iPad|iPod/.test(ua)) return 'iOS'
  if (/Mac OS X/.test(ua)) return 'macOS'
  if (/Linux/.test(ua)) return 'Linux'
  return 'Desconhecido'
}

function detectarDispositivo(ua: string): string {
  if (/iPad|Tablet/.test(ua)) return 'Tablet'
  if (/Mobi|Android|iPhone/.test(ua)) return 'Celular'
  return 'Desktop'
}

/** Monta o contexto técnico atual. `rota` é o pathname da tela ativa. */
export function capturarContexto(rota: string): ContextoReporte {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  const appName = (import.meta.env.VITE_APP_NAME as string) || 'OMNX Desk'
  return {
    url: typeof window !== 'undefined' ? window.location.href : '',
    rota,
    navegador: detectarNavegador(ua),
    sistema: detectarSistema(ua),
    dispositivo: detectarDispositivo(ua),
    viewport:
      typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}` : '',
    idioma: typeof navigator !== 'undefined' ? navigator.language : '',
    user_agent: ua,
    app: appName,
    capturado_em: new Date().toISOString(),
  }
}
