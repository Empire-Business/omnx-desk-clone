import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

// O manual é uma entrada pública independente. Visitá-lo não monta providers
// privados nem instala a captura de console/rede usada pelos tickets do app.
const manualPublico = /^\/manual\/?$/.test(window.location.pathname)
const PaginaInicial = lazy(async () => {
  if (manualPublico) {
    const pagina = await import('./pages/ManualPage')
    return { default: pagina.ManualPage }
  }
  const [{ applyBrand }, { instalarCapturaDeContexto }] = await Promise.all([
    import('./config/brand'), import('./lib/reporte-buffers'),
  ])
  // Antes de carregar o app: erros desse carregamento já entram no reporte.
  instalarCapturaDeContexto()
  applyBrand()
  return import('./App')
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={<p role="status" className="p-6 text-sm text-muted-foreground">Abrindo {manualPublico ? 'o manual' : 'a plataforma'}…</p>}>
      <PaginaInicial />
    </Suspense>
  </StrictMode>,
)
