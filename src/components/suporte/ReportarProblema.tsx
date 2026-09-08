import { useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { LifeBuoy, Bug, CheckCircle2, Loader2, Paperclip, X, Camera } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'
import { capturarContexto } from '@/lib/reporte-contexto'
import { capturarTela } from '@/lib/reporte-captura'
import { lerBufferConsole, lerBufferRede } from '@/lib/reporte-buffers'
import {
  useCriarReporte,
  useAnexarAoReporte,
  type ReporteImpacto,
  type ReporteCategoria,
} from '@/hooks/useReportes'

/** Print de tela costuma passar de 1 MB; 5 MB é o teto do bucket. */
const MAX_ANEXO_BYTES = 5 * 1024 * 1024
const MAX_ANEXOS = 3

const IMPACTOS: { value: ReporteImpacto; label: string }[] = [
  { value: 'baixo', label: 'Baixo — incomoda, mas dá pra usar' },
  { value: 'medio', label: 'Médio — atrapalha o trabalho' },
  { value: 'alto', label: 'Alto — trava uma tarefa importante' },
  { value: 'critico', label: 'Crítico — não consigo usar o sistema' },
]

const CATEGORIAS: { value: ReporteCategoria; label: string }[] = [
  { value: 'bug', label: 'Erro / bug' },
  { value: 'duvida', label: 'Dúvida' },
  { value: 'sugestao', label: 'Sugestão' },
  { value: 'outro', label: 'Outro' },
]

const inputCls =
  'w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30'

/** Botão flutuante + modal para reportar um problema de qualquer tela. */
export function ReportarProblema() {
  const [open, setOpen] = useState(false)
  const [capturando, setCapturando] = useState(false)
  const [print, setPrint] = useState<File | null>(null)
  const botaoRef = useRef<HTMLButtonElement>(null)

  /**
   * A foto é tirada ANTES de abrir o modal — depois, a tela com o problema
   * estaria coberta pelo formulário e o print sairia inútil. O próprio botão
   * fica de fora da imagem.
   */
  const abrir = async () => {
    setCapturando(true)
    try {
      setPrint(await capturarTela([botaoRef.current]))
    } finally {
      setCapturando(false)
      setOpen(true)
    }
  }

  const fechar = () => {
    setOpen(false)
    setPrint(null)
  }

  return (
    <>
      <button
        ref={botaoRef}
        type="button"
        onClick={abrir}
        disabled={capturando}
        title="Reportar um problema"
        aria-label="Reportar um problema"
        className={cn(
          'group fixed z-40 bottom-[calc(7rem+env(safe-area-inset-bottom))] right-4 sm:bottom-28 sm:right-5',
          'inline-flex h-12 items-center rounded-full pl-[13px] pr-[13px]',
          'bg-blue-600 text-white shadow-lg shadow-blue-600/30',
          'hover:bg-blue-700 hover:pr-5 transition-all duration-300 ease-out',
        )}
      >
        {capturando ? (
          <Loader2 className="h-[22px] w-[22px] shrink-0 animate-spin" />
        ) : (
          <LifeBuoy className="h-[22px] w-[22px] shrink-0" />
        )}
        {/* O nome cresce do container ao passar o mouse (desktop) */}
        <span
          className={cn(
            'hidden sm:block max-w-0 overflow-hidden whitespace-nowrap text-sm font-medium',
            'transition-all duration-300 ease-out group-hover:max-w-[170px] group-hover:ml-2',
          )}
        >
          Reportar problema
        </span>
      </button>

      {open && <ReportarModal onClose={fechar} printInicial={print} />}
    </>
  )
}

function ReportarModal({
  onClose,
  printInicial,
}: {
  onClose: () => void
  printInicial: File | null
}) {
  const { user } = useAuth()
  const location = useLocation()
  const criar = useCriarReporte()
  const anexar = useAnexarAoReporte()

  const [protocolo, setProtocolo] = useState<string | null>(null)
  // O print entra já anexado: vem marcado por padrão porque a maioria dos
  // reportes só é diagnosticável com a imagem, e pedir para a pessoa "lembrar"
  // de anexar é o mesmo que não ter print nenhum.
  const [arquivos, setArquivos] = useState<File[]>(printInicial ? [printInicial] : [])
  const [erroAnexo, setErroAnexo] = useState<string | null>(null)
  const [previaPrint] = useState<string | null>(
    printInicial ? URL.createObjectURL(printInicial) : null,
  )
  const [form, setForm] = useState({
    titulo: '',
    descricao: '',
    passos: '',
    resultado_esperado: '',
    resultado_ocorrido: '',
    impacto: 'medio' as ReporteImpacto,
    categoria: 'bug' as ReporteCategoria,
  })

  const set = (campo: keyof typeof form, valor: string) =>
    setForm((f) => ({ ...f, [campo]: valor }))

  /** Valida antes de aceitar: o bucket rejeita acima de 5 MB e fora de imagem/PDF. */
  function escolherArquivos(lista: FileList | null) {
    setErroAnexo(null)
    if (!lista) return
    const novos = Array.from(lista)
    const grande = novos.find((f) => f.size > MAX_ANEXO_BYTES)
    if (grande) {
      setErroAnexo(`"${grande.name}" tem mais de 5 MB. Envie uma imagem menor.`)
      return
    }
    const total = arquivos.length + novos.length
    if (total > MAX_ANEXOS) {
      setErroAnexo(`No máximo ${MAX_ANEXOS} arquivos por reporte.`)
      return
    }
    setArquivos((a) => [...a, ...novos])
  }

  const enviar = () => {
    if (!form.titulo.trim()) return
    const contexto = capturarContexto(location.pathname)
    criar.mutate(
      {
        ...form,
        modulo: contexto.rota.split('/')[1] || 'geral',
        rota: contexto.rota,
        contexto,
        // Capturados desde o boot do app (lib/reporte-buffers), com senha,
        // token e Authorization já mascarados.
        console_logs: lerBufferConsole(),
        network_logs: lerBufferRede(),
        reportado_nome: user?.nome,
        reportado_email: user?.email,
      },
      {
        onSuccess: async (rep) => {
          // Anexo depois da criação: o caminho no storage precisa do id do reporte,
          // que é de onde a RLS deriva o dono do arquivo. Falha no anexo não
          // invalida o reporte — ele já está registrado com protocolo.
          if (arquivos.length > 0) {
            try {
              await anexar.mutateAsync({ reporteId: rep.id, arquivos })
            } catch {
              setErroAnexo('O reporte foi registrado, mas os anexos não subiram.')
            }
          }
          setProtocolo(rep.protocolo)
        },
      },
    )
  }

  // Estado de sucesso — confirma com o protocolo.
  if (protocolo) {
    return (
      <Modal open onClose={onClose} title="Reporte registrado" size="sm">
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          <CheckCircle2 className="h-10 w-10 text-emerald-500" />
          <p className="text-sm text-muted-foreground">
            Obrigado! Seu reporte foi registrado e a equipe já pode vê-lo.
          </p>
          <div className="rounded-lg border border-border bg-muted/40 px-4 py-2">
            <span className="text-xs text-muted-foreground">Protocolo</span>
            <div className="font-mono text-lg font-semibold text-foreground">{protocolo}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="mt-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:brightness-110"
          >
            Fechar
          </button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Reportar um problema"
      description="Descreva o que aconteceu. Alguns dados técnicos (navegador, tela) são anexados automaticamente para ajudar a equipe."
      size="md"
    >
      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-foreground">
            O que aconteceu? <span className="text-destructive">*</span>
          </label>
          <input
            className={inputCls}
            placeholder="Ex: o botão de salvar contrato não funciona"
            value={form.titulo}
            onChange={(e) => set('titulo', e.target.value)}
            autoFocus
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">Tipo</label>
            <select
              className={inputCls}
              value={form.categoria}
              onChange={(e) => set('categoria', e.target.value)}
            >
              {CATEGORIAS.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">Impacto</label>
            <select
              className={inputCls}
              value={form.impacto}
              onChange={(e) => set('impacto', e.target.value)}
            >
              {IMPACTOS.map((i) => (
                <option key={i.value} value={i.value}>{i.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-foreground">
            Detalhes (opcional)
          </label>
          <textarea
            className={cn(inputCls, 'min-h-[72px] resize-y')}
            placeholder="Conte mais sobre o problema"
            value={form.descricao}
            onChange={(e) => set('descricao', e.target.value)}
          />
        </div>

        <details className="rounded-lg border border-border bg-muted/20 px-3 py-2">
          <summary className="cursor-pointer text-sm font-medium text-foreground">
            Adicionar passos e resultado esperado (opcional)
          </summary>
          <div className="mt-3 space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Passos para reproduzir
              </label>
              <textarea
                className={cn(inputCls, 'min-h-[56px] resize-y')}
                placeholder={'1. Abri a tela X\n2. Cliquei em Y\n3. ...'}
                value={form.passos}
                onChange={(e) => set('passos', e.target.value)}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  O que eu esperava
                </label>
                <textarea
                  className={cn(inputCls, 'min-h-[48px] resize-y')}
                  value={form.resultado_esperado}
                  onChange={(e) => set('resultado_esperado', e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  O que aconteceu
                </label>
                <textarea
                  className={cn(inputCls, 'min-h-[48px] resize-y')}
                  value={form.resultado_ocorrido}
                  onChange={(e) => set('resultado_ocorrido', e.target.value)}
                />
              </div>
            </div>
          </div>
        </details>

        {/* Print automático: tirado no clique do botão, antes deste modal abrir.
            Fica visível para a pessoa saber exatamente o que está enviando —
            captura silenciosa numa tela que pode ter dado de cliente seria
            desconfortável, e ela pode remover. */}
        {previaPrint && (
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground">
                <Camera className="h-3.5 w-3.5" />
                Foto da tela anexada automaticamente
              </span>
              {arquivos.includes(printInicial as File) && (
                <button
                  type="button"
                  onClick={() => setArquivos((a) => a.filter((f) => f !== printInicial))}
                  className="text-xs text-muted-foreground underline-offset-2 hover:text-destructive hover:underline"
                >
                  Não enviar a foto
                </button>
              )}
            </div>
            <img
              src={previaPrint}
              alt="Prévia da foto da tela que será enviada"
              className={cn(
                'max-h-40 w-full rounded border border-border object-contain object-top',
                !arquivos.includes(printInicial as File) && 'opacity-30 grayscale',
              )}
            />
          </div>
        )}

        {/* Anexos manuais — para quando a pessoa quer mostrar outra tela. */}
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Outros anexos (opcional)
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground hover:bg-muted">
              <Paperclip className="h-4 w-4" />
              Escolher imagem
              <input
                type="file"
                accept="image/*,application/pdf"
                multiple
                className="hidden"
                onChange={(e) => { escolherArquivos(e.target.files); e.target.value = '' }}
              />
            </label>
            {/* O print automático já aparece com prévia acima — listá-lo aqui
                também faria a pessoa achar que anexou a mesma imagem duas vezes. */}
            {arquivos.filter((f) => f !== printInicial).map((f, i) => (
              <span
                key={`${f.name}-${i}`}
                className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs text-foreground"
              >
                <span className="max-w-[160px] truncate">{f.name}</span>
                <button
                  type="button"
                  onClick={() => setArquivos((a) => a.filter((x) => x !== f))}
                  className="text-muted-foreground hover:text-danger"
                  aria-label={`Remover ${f.name}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
          {erroAnexo && <p className="mt-1 text-xs text-destructive">{erroAnexo}</p>}
        </div>

        {criar.isError && (
          <p className="text-sm text-destructive">
            Não foi possível enviar. Verifique sua conexão e tente novamente.
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={criar.isPending}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={enviar}
            disabled={criar.isPending || !form.titulo.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:brightness-110 disabled:opacity-50"
          >
            {criar.isPending ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Enviando…</>
            ) : (
              <><Bug className="h-4 w-4" /> Enviar reporte</>
            )}
          </button>
        </div>
      </div>
    </Modal>
  )
}
