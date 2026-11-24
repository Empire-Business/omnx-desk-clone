import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { BookOpen, Bot, Bug, LifeBuoy, Loader2, PlayCircle, ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { capturarTela } from '@/lib/reporte-captura'
import { ROTAS } from '@/config/navegacao'
import { PainelInferior, LinhaPainel } from '@/components/ui/PainelInferior'
import { AjudaIris } from './AjudaIris'
import { useAjudaIrisDisponivel } from '@/hooks/useAjudaIrisDisponivel'
import { ContextoAjuda, SEM_CAPTURA, useAjuda, type AjudaCtx } from './ajudaContexto'
import { ReportarModal } from '@/components/suporte/ReportarProblema'

/**
 * Ponto de ajuda ÚNICO (auditoria 03, G3/G4).
 *
 * Antes havia dois botões flutuantes empilhados ("Reportar problema" e "Ajuda
 * com a Íris") cobrindo listas, botões de salvar e, no Chat, o campo de
 * mensagem. Agora existe um só ponto: ele abre um painel com "Perguntar à
 * Íris", "Reportar um problema", o manual e os pedidos de suporte.
 *
 * O provedor guarda o estado; qualquer gatilho (botão flutuante, item "Ajuda"
 * da barra lateral, painel "Mais" do celular, botão no topo de Conversas) abre
 * o mesmo painel.
 */

const esperarQuadro = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))

export function AjudaProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const identidade = useAjudaIrisDisponivel()
  const irisDisponivel = identidade.disponivel
  const [menuAberto, setMenuAberto] = useState(false)
  const [irisAberta, setIrisAberta] = useState(false)
  const [capturando, setCapturando] = useState(false)
  const [reporte, setReporte] = useState<{ print: File | null } | null>(null)
  const gatilho = useRef<HTMLElement | null>(null)

  const lembrarGatilho = () => {
    gatilho.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
  }
  const devolverFoco = () => {
    const el = gatilho.current
    if (el && document.contains(el)) requestAnimationFrame(() => el.focus())
  }

  const abrirMenu = useCallback(() => { lembrarGatilho(); setMenuAberto(true) }, [])
  const abrirIris = useCallback(() => { setMenuAberto(false); setIrisAberta(true) }, [])
  const abrirReporte = useCallback(async () => {
    setMenuAberto(false)
    setCapturando(true)
    try {
      // Espera o painel fechar para a foto mostrar a tela de verdade.
      await esperarQuadro()
      const ignorar = Array.from(document.querySelectorAll<HTMLElement>(`[${SEM_CAPTURA}]`))
      setReporte({ print: await capturarTela(ignorar) })
    } catch {
      setReporte({ print: null })
    } finally {
      setCapturando(false)
    }
  }, [])

  const valor = useMemo<AjudaCtx>(
    () => ({ abrirMenu, abrirIris, abrirReporte: () => { void abrirReporte() }, capturando }),
    [abrirMenu, abrirIris, abrirReporte, capturando],
  )

  const irPara = (rota: string) => { setMenuAberto(false); navigate(rota) }

  return (
    <ContextoAjuda.Provider value={valor}>
      {children}

      <PainelInferior
        aberto={menuAberto}
        onFechar={() => { setMenuAberto(false); devolverFoco() }}
        titulo="Como podemos ajudar?"
        descricao="Tire uma dúvida ou conte o que não funcionou."
      >
        <div className="space-y-0.5">
          {irisDisponivel && (
            <LinhaPainel icone={Bot} rotulo="Perguntar à Íris" descricao="Tire dúvidas sobre como usar o Desk." onClick={abrirIris} />
          )}
          <LinhaPainel
            icone={capturando ? Loader2 : Bug}
            rotulo="Reportar um problema"
            descricao="Algo não funcionou? Uma foto da tela vai junto, e você pode tirar."
            onClick={() => { void abrirReporte() }}
            disabled={capturando}
          />
          <LinhaPainel
            icone={BookOpen}
            rotulo="Abrir o manual"
            descricao="Guia completo, abre em outra aba."
            onClick={() => { setMenuAberto(false); window.open(ROTAS.manual, '_blank', 'noopener,noreferrer') }}
          />
          <LinhaPainel
            icone={PlayCircle}
            rotulo="Vídeos tutoriais"
            descricao="Sete vídeos curtos, de 1 a 2 minutos. Abrem em outra aba."
            onClick={() => { setMenuAberto(false); window.open(`${ROTAS.manual}#tutoriais`, '_blank', 'noopener,noreferrer') }}
          />
          <LinhaPainel icone={LifeBuoy} rotulo="Meus pedidos de suporte" descricao="Acompanhe o que você já relatou." onClick={() => irPara(ROTAS.meusReportes)} />
          <LinhaPainel icone={ShieldCheck} rotulo="Segurança, privacidade e IA" onClick={() => irPara(ROTAS.seguranca)} />
        </div>
      </PainelInferior>

      <AjudaIris identidade={identidade} aberto={irisAberta} onFechar={() => { setIrisAberta(false); devolverFoco() }} />
      {reporte && (
        <ReportarModal printInicial={reporte.print} onClose={() => { setReporte(null); devolverFoco() }} />
      )}
    </ContextoAjuda.Provider>
  )
}

/**
 * Botão flutuante único (DS `.fab`): círculo na cor da Íris, com a marca de
 * abertura dentro — fica claro que é ajuda e não compete com o azul de ação.
 * No celular fica ACIMA da barra inferior (64 px + área segura) e tem 52 px;
 * no computador, 48 px no canto inferior direito, com dica ao passar o mouse.
 * Fica fora da foto do reporte. Não aparece em Conversas (lá a ajuda fica no
 * topo, para não cobrir o campo de mensagem).
 */
export function BotaoAjudaFlutuante() {
  const { abrirMenu, capturando } = useAjuda()
  return (
    <button
      type="button"
      onClick={abrirMenu}
      {...{ [SEM_CAPTURA]: '' }}
      aria-haspopup="dialog"
      aria-label="Ajuda"
      className={cn(
        'group fixed right-4 z-40 bottom-[calc(var(--bnav-h)+var(--safe-b)+16px)] md:bottom-6 md:right-6',
        'grid h-[52px] w-[52px] place-items-center rounded-full md:h-12 md:w-12',
        'bg-iris text-iris-on shadow-[0_6px_16px_-4px_rgb(16_24_40/.35),inset_0_0_0_1px_rgb(255_255_255/.06)]',
        'transition-[transform,box-shadow] duration-base ease-out hover:-translate-y-0.5 active:scale-95 focus-ds',
      )}
    >
      {capturando ? (
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
      ) : (
        <span className="iris-mark on-iris [--av:26px]" aria-hidden />
      )}
      <span
        className={cn(
          'pointer-events-none absolute right-[58px] top-1/2 hidden -translate-y-1/2 translate-x-1 whitespace-nowrap rounded-md bg-foreground px-2.5 py-1.5',
          'text-[12.5px] font-semibold text-background opacity-0 transition-[opacity,transform] duration-base ease-out md:block',
          'group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100',
        )}
        aria-hidden
      >
        Ajuda e Íris
      </span>
    </button>
  )
}

/** Mesmo ponto de ajuda, em forma de botão comum (usado no topo de Conversas). */
export function BotaoAjudaEmbutido({ className }: { className?: string }) {
  const { abrirMenu, capturando } = useAjuda()
  return (
    <button
      type="button"
      onClick={abrirMenu}
      {...{ [SEM_CAPTURA]: '' }}
      aria-haspopup="dialog"
      aria-label="Ajuda"
      title="Ajuda e Íris"
      className={cn('btn btn-iris btn-icon shrink-0 rounded-full', className)}
    >
      {capturando ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <span className="iris-mark sm" aria-hidden />}
    </button>
  )
}
