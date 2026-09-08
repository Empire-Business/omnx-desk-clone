import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { applyBrand } from './config/brand'
import { instalarCapturaDeContexto } from './lib/reporte-buffers'

// Antes de qualquer render: o JS não recupera o que já foi impresso no console,
// então captura que começa depois do erro chega vazia no ticket.
instalarCapturaDeContexto()

applyBrand()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
