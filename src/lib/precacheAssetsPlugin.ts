import type { WorkboxPlugin } from 'workbox-core'

// Tipos de JavaScript reconhecidos pelo navegador, incluindo aliases legados.
const JAVASCRIPT_MIMES = new Set([
  'application/ecmascript', 'application/javascript',
  'application/x-ecmascript', 'application/x-javascript',
  'text/ecmascript', 'text/javascript',
  'text/javascript1.0', 'text/javascript1.1', 'text/javascript1.2',
  'text/javascript1.3', 'text/javascript1.4', 'text/javascript1.5',
  'text/jscript', 'text/livescript', 'text/x-ecmascript', 'text/x-javascript',
])

function respostaValida(request: Request, response: Response): boolean {
  // Um cacheWillUpdate próprio substitui a validação padrão do precache.
  if (response.status >= 400) return false

  const caminho = new URL(request.url).pathname.toLowerCase()
  if (!/\.(?:m?js|css)$/.test(caminho)) return true

  const mime = (response.headers.get('Content-Type') ?? '').split(';')[0].trim().toLowerCase()
  return caminho.endsWith('.css') ? mime === 'text/css' : JAVASCRIPT_MIMES.has(mime)
}

/** Impede que o fallback HTML de um deploy vire JavaScript/CSS no precache. */
export const precacheAssetsPlugin = {
  async cachedResponseWillBeUsed({ request, cachedResponse }: { request: Request; cachedResponse?: Response }) {
    // null vira cache miss: na instalação, Workbox busca e substitui a entrada;
    // durante o uso, permite o fallback de rede da própria PrecacheStrategy.
    return cachedResponse && respostaValida(request, cachedResponse) ? cachedResponse : null
  },
  async cacheWillUpdate({ request, response }: { request: Request; response: Response }) {
    return respostaValida(request, response) ? response : null
  },
} satisfies WorkboxPlugin
