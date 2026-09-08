import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, ExternalLink, Minus, Plus, RotateCw, X } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Visualizador de comprovante — abre por cima da tela, não em outra aba.
 *
 * Quem confere uma venda precisa ler o comprovante e o cadastro **ao mesmo
 * tempo**: nome, valor e data de um lado, o print do outro. Abrir em outra aba
 * quebra isso — a pessoa alterna, decora e volta. Aqui a imagem abre sobre a
 * venda, com zoom, e fecha com Esc.
 *
 * O zoom existe porque comprovante é print de celular: o nome do pagador vem em
 * letra pequena, no meio de um monte de informação. Sem lupa, a conferência
 * dependia de baixar o arquivo.
 */

export interface ArquivoComprovante {
  storage_path: string
  nome_original: string
  mime_type?: string | null
  url?: string
}

function ehPdf(nome: string, mime?: string | null): boolean {
  return (mime ?? '').toLowerCase().includes('pdf') || /\.pdf$/i.test(nome ?? '')
}

const ZOOM_MIN = 1
const ZOOM_MAX = 6
const PASSO = 0.5

export function VisualizadorComprovante({
  arquivos,
  indiceInicial = 0,
  onFechar,
}: {
  arquivos: ArquivoComprovante[]
  indiceInicial?: number
  onFechar: () => void
}) {
  const [indice, setIndice] = useState(indiceInicial)
  const [zoom, setZoom] = useState(1)
  const [giro, setGiro] = useState(0)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const arrastando = useRef<{ x: number; y: number } | null>(null)

  const atual = arquivos[indice]

  // Trocar de arquivo reinicia o enquadramento: continuar com o zoom e a posição
  // do anterior faz o próximo abrir num pedaço aleatório da imagem.
  useEffect(() => {
    setZoom(1)
    setGiro(0)
    setPos({ x: 0, y: 0 })
  }, [indice])

  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if (e.key === 'Escape') onFechar()
      if (e.key === 'ArrowRight') setIndice((i) => Math.min(i + 1, arquivos.length - 1))
      if (e.key === 'ArrowLeft') setIndice((i) => Math.max(i - 1, 0))
      if (e.key === '+' || e.key === '=') setZoom((z) => Math.min(z + PASSO, ZOOM_MAX))
      if (e.key === '-') setZoom((z) => Math.max(z - PASSO, ZOOM_MIN))
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [arquivos.length, onFechar])

  if (!atual) return null

  const pdf = ehPdf(atual.nome_original, atual.mime_type)

  function aoRolar(e: React.WheelEvent) {
    e.preventDefault()
    setZoom((z) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z - Math.sign(e.deltaY) * PASSO)))
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-black/85 backdrop-blur-sm"
      onClick={onFechar}
    >
      {/* Barra de ações — para o clique aqui não fechar o visualizador */}
      <div
        className="flex flex-wrap items-center gap-2 border-b border-white/10 px-4 py-2 text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="min-w-0 flex-1 truncate text-sm" title={atual.nome_original}>
          {atual.nome_original}
          {arquivos.length > 1 && (
            <span className="ml-2 text-white/60">{indice + 1} de {arquivos.length}</span>
          )}
        </span>

        {!pdf && (
          <>
            <button
              onClick={() => setZoom((z) => Math.max(ZOOM_MIN, z - PASSO))}
              disabled={zoom <= ZOOM_MIN}
              className="rounded-lg p-1.5 hover:bg-white/15 disabled:opacity-40"
              title="Diminuir (tecla -)"
            >
              <Minus className="h-4 w-4" />
            </button>
            <span className="w-12 text-center text-xs tabular-nums">{Math.round(zoom * 100)}%</span>
            <button
              onClick={() => setZoom((z) => Math.min(ZOOM_MAX, z + PASSO))}
              disabled={zoom >= ZOOM_MAX}
              className="rounded-lg p-1.5 hover:bg-white/15 disabled:opacity-40"
              title="Aumentar (tecla +)"
            >
              <Plus className="h-4 w-4" />
            </button>
            <button
              onClick={() => setGiro((g) => (g + 90) % 360)}
              className="rounded-lg p-1.5 hover:bg-white/15"
              title="Girar — print de celular às vezes vem deitado"
            >
              <RotateCw className="h-4 w-4" />
            </button>
          </>
        )}

        {atual.url && (
          <a
            href={atual.url}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg p-1.5 hover:bg-white/15"
            title="Abrir em outra aba"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        )}
        <button onClick={onFechar} className="rounded-lg p-1.5 hover:bg-white/15" title="Fechar (Esc)">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="relative flex-1 overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {arquivos.length > 1 && (
          <>
            <button
              onClick={() => setIndice((i) => Math.max(0, i - 1))}
              disabled={indice === 0}
              className="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white hover:bg-black/70 disabled:opacity-30"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              onClick={() => setIndice((i) => Math.min(arquivos.length - 1, i + 1))}
              disabled={indice === arquivos.length - 1}
              className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white hover:bg-black/70 disabled:opacity-30"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </>
        )}

        {!atual.url ? (
          <p className="flex h-full items-center justify-center text-sm text-white/70">Carregando…</p>
        ) : pdf ? (
          // PDF não dá zoom por imagem: o próprio leitor do navegador tem o dele.
          <iframe src={atual.url} title={atual.nome_original} className="h-full w-full bg-white" />
        ) : (
          <div
            className={cn(
              'flex h-full w-full items-center justify-center',
              zoom > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-in',
            )}
            onWheel={aoRolar}
            onDoubleClick={() => setZoom((z) => (z > 1 ? 1 : 2))}
            onPointerDown={(e) => {
              if (zoom <= 1) return
              arrastando.current = { x: e.clientX - pos.x, y: e.clientY - pos.y }
              ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
            }}
            onPointerMove={(e) => {
              if (!arrastando.current) return
              setPos({ x: e.clientX - arrastando.current.x, y: e.clientY - arrastando.current.y })
            }}
            onPointerUp={() => { arrastando.current = null }}
          >
            <img
              src={atual.url}
              alt={atual.nome_original}
              draggable={false}
              className="max-h-full max-w-full select-none object-contain transition-transform duration-75"
              style={{ transform: `translate(${pos.x}px, ${pos.y}px) scale(${zoom}) rotate(${giro}deg)` }}
            />
          </div>
        )}
      </div>

      <p className="px-4 py-1.5 text-center text-[11px] text-white/50" onClick={(e) => e.stopPropagation()}>
        Rolar para dar zoom · duplo clique aproxima · arraste para mover · Esc fecha
      </p>
    </div>
  )
}
