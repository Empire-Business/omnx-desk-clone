import { Fragment, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, CircleAlert, ExternalLink, Flag, Info, MessageCircle } from 'lucide-react'
import type { ConversaDoTicket, MensagemDaConversa } from '@/hooks/useAtendimentoTickets'
import { autorDaMensagem, envioFalhou } from '@/lib/ticketStatus'
import { rotuloDoDia } from '@/lib/ticketEspera'
import { cn } from '@/lib/utils'

const ROTULO_MIDIA: Record<string, string> = {
  imagem: 'Imagem', image: 'Imagem', audio: 'Áudio', ptt: 'Áudio', video: 'Vídeo',
  documento: 'Documento', document: 'Documento', sticker: 'Figurinha', localizacao: 'Localização',
  location: 'Localização', contato: 'Contato', contact: 'Contato',
}

/** Texto de uma mensagem para leitura rápida; mídia vira um rótulo. */
export function textoDaMensagem(m: Pick<MensagemDaConversa, 'conteudo' | 'tipo'>): string {
  const midia = m.tipo && m.tipo !== 'texto' && m.tipo !== 'text' ? ROTULO_MIDIA[m.tipo] ?? 'Anexo' : null
  const texto = m.conteudo?.trim()
  if (midia && texto) return `[${midia}] ${texto}`
  if (midia) return `[${midia}]`
  return texto || '(mensagem sem texto)'
}

export function linkDoChat(contatoId: string | null | undefined): string | null {
  return contatoId ? `/conversas?contato=${encodeURIComponent(contatoId)}` : null
}

const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

/** A conversa tem alguma mensagem da equipe que não chegou ao cliente? */
export function conversaTemFalha(dados: ConversaDoTicket | undefined): boolean {
  return Boolean(dados?.situacao === 'ok' && dados.mensagens.some(envioFalhou))
}

/**
 * Conversa do WhatsApp ao lado do ticket, no visual do DS: cliente à
 * esquerda, equipe à direita (azul claro), Íris em verde-água, avisos do
 * sistema no meio. A mensagem que abriu o ticket e as que confirmaram a
 * solução ficam marcadas (ou, sem resolução, as que levaram a Íris a sugerir
 * resolver, em verde-água e com "a confirmar"); mensagem que não chegou ao cliente aparece como
 * "Não enviada", com o caminho para tentar de novo no Chat.
 */
export function ConversaDoTicketPainel({
  dados,
  carregando,
  evidencias,
  evidenciasDaSugestao = false,
  className,
}: {
  dados: ConversaDoTicket | undefined
  carregando: boolean
  evidencias: readonly string[]
  /** As evidências são de uma sugestão da Íris (ainda não confirmada), não de uma resolução. */
  evidenciasDaSugestao?: boolean
  className?: string
}) {
  const link = linkDoChat(dados?.conversa?.contatoId)
  const evid = new Set(evidencias)
  const agora = new Date()

  return (
    <section
      aria-label="Conversa no WhatsApp"
      className={cn('flex min-h-0 flex-col overflow-hidden rounded-lg border border-card-border bg-card', className)}
    >
      <header className="flex min-h-12 items-center justify-between gap-2 border-b border-border px-4 py-2">
        <h2 className="m-0 flex items-center gap-2 text-[14px] font-[650] [font-stretch:100%] text-foreground">
          <MessageCircle className="h-4 w-4 text-success" aria-hidden /> Conversa no WhatsApp
        </h2>
        {link && (
          <Link to={link} className="btn btn-ghost btn-sm text-link">
            Abrir em Conversas <ExternalLink aria-hidden />
          </Link>
        )}
      </header>

      <div
        className={cn(
          'min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-5',
          'bg-[radial-gradient(color-mix(in_srgb,var(--foreground)_6%,transparent)_1px,transparent_1.2px)] bg-[length:18px_18px]',
        )}
      >
        {carregando && (
          <div aria-hidden className="grid gap-2.5">
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className={cn('sk h-12 w-[70%] rounded-xl', i % 2 ? 'justify-self-end' : 'justify-self-start')} />
            ))}
          </div>
        )}

        {!carregando && (!dados || dados.situacao === 'sem_acesso') && (
          <Aviso>Não foi possível abrir esta conversa. Talvez você não tenha acesso a Conversas.</Aviso>
        )}

        {!carregando && dados?.situacao === 'apagada' && (
          <Aviso>A mensagem original não está mais disponível. As mensagens antigas são apagadas depois de um tempo.</Aviso>
        )}

        {!carregando && dados?.situacao === 'ok' && (
          <ol className="m-0 flex list-none flex-col gap-1.5 p-0">
            {dados.mensagens.map((m, i) => {
              const anterior = dados.mensagens[i - 1]
              const dia = rotuloDoDia(m.criado_em, agora)
              const novoDia = !anterior || rotuloDoDia(anterior.criado_em, agora) !== dia
              return (
                <Fragment key={m.id}>
                  {novoDia && dia && (
                    <li aria-hidden className="my-1.5 self-center rounded-full bg-card px-2.5 py-[3px] text-[11.5px] font-semibold text-muted-foreground ring-hairline">
                      {dia}
                    </li>
                  )}
                  <Mensagem
                    m={m}
                    ehOrigem={m.id === dados.origem?.id}
                    ehEvidencia={evid.has(m.id)}
                    evidenciaDaSugestao={evidenciasDaSugestao}
                    contatoNome={dados.conversa?.contatoNome}
                    link={link}
                  />
                  {dados.intervaloApos === i && (
                    <li className="my-3 self-center text-center text-[12px] text-muted-foreground">
                      Parte da conversa não aparece aqui.{' '}
                      {link && <Link to={link} className="font-semibold text-link hover:underline">Ver tudo em Conversas</Link>}
                    </li>
                  )}
                </Fragment>
              )
            })}
          </ol>
        )}
      </div>
    </section>
  )
}

function Aviso({ children }: { children: ReactNode }) {
  return (
    <p className="m-0 flex items-start gap-2 rounded-lg bg-card p-3 text-sm text-muted-foreground ring-hairline">
      <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      {children}
    </p>
  )
}

function Mensagem({
  m, ehOrigem, ehEvidencia, evidenciaDaSugestao = false, contatoNome, link,
}: {
  m: MensagemDaConversa
  ehOrigem: boolean
  ehEvidencia: boolean
  evidenciaDaSugestao?: boolean
  contatoNome: string | null | undefined
  link: string | null
}) {
  const autor = autorDaMensagem(m)

  if (autor === 'sistema') {
    return (
      <li className="self-center px-2 py-1 text-center text-[12px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <Info className="h-[13px] w-[13px] shrink-0" aria-hidden />
          {textoDaMensagem(m)}
        </span>
      </li>
    )
  }

  const daEquipe = autor === 'equipe'
  const daIa = daEquipe && (m.autor_tipo === 'ia' || m.enviado_por_ia === true)
  const falhou = daEquipe && envioFalhou(m)
  const nome = daEquipe
    ? (m.autor_nome?.trim() || (daIa ? 'Assistente' : 'Equipe'))
    : contatoNome?.trim() || 'Cliente'

  return (
    <li
      className={cn(
        'relative max-w-[84%] animate-row-in break-words rounded-xl px-3 pb-1.5 pt-2 text-[14px] leading-[1.45] sm:max-w-[78%]',
        daEquipe ? 'self-end rounded-br-[4px]' : 'self-start rounded-bl-[4px] bg-card shadow-[inset_0_0_0_1px_var(--card-border)]',
        daEquipe && !daIa && !falhou && 'bg-primary-light shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--primary)_14%,transparent)]',
        daIa && !falhou && 'bg-iris-light shadow-[inset_0_0_0_1px_var(--iris-line)]',
        falhou && 'bg-card shadow-[inset_0_0_0_1.5px_color-mix(in_srgb,var(--danger)_65%,transparent)]',
        ehOrigem && 'shadow-[inset_0_0_0_1.5px_var(--warning)]',
        ehEvidencia && (evidenciaDaSugestao ? 'shadow-[inset_0_0_0_1.5px_var(--iris)]' : 'shadow-[inset_0_0_0_1.5px_var(--success)]'),
      )}
    >
      {(ehOrigem || ehEvidencia) && (
        <p
          className={cn(
            'm-0 mb-1 flex items-center gap-1 text-[11.5px] font-[650]',
            ehOrigem ? 'text-warning' : evidenciaDaSugestao ? 'text-iris-fg' : 'text-success',
          )}
        >
          {ehOrigem ? <Flag className="h-3 w-3" aria-hidden /> : <CheckCircle2 className="h-3 w-3" aria-hidden />}
          {ehOrigem ? 'Pedido que abriu o ticket' : evidenciaDaSugestao ? 'Sinal de solução · a confirmar' : 'Confirmou a solução'}
        </p>
      )}
      <p className={cn('m-0 mb-0.5 flex items-center gap-1.5 text-[11.5px] font-[650]', daIa ? 'text-iris-fg' : 'text-fg-2')}>
        {daIa && <span className="iris-mark [--av:14px]" aria-hidden />}
        {daIa ? `${nome} · IA` : nome}
      </p>
      <p className="m-0 whitespace-pre-wrap">{textoDaMensagem(m)}</p>
      <p className="m-0 mt-0.5 text-right font-mono text-[11px] text-muted-foreground">
        <time dateTime={m.criado_em}>{hora(m.criado_em)}</time>
      </p>
      {falhou && (
        <p className="m-0 mt-1.5 flex flex-wrap items-center gap-1.5 border-t border-dashed border-[color-mix(in_srgb,var(--danger)_40%,transparent)] pt-1.5 text-[12.5px] font-semibold text-danger">
          <CircleAlert className="h-3.5 w-3.5" aria-hidden />
          Não enviada
          {link && (
            <Link to={link} className="font-bold text-link underline underline-offset-2">
              Tentar de novo em Conversas
            </Link>
          )}
        </p>
      )}
    </li>
  )
}
