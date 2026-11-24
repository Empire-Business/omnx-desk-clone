import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { BookOpen, Loader2, Send, X } from 'lucide-react'
import type { IdentidadeAjuda } from '@/hooks/useAjudaIrisDisponivel'
import { useAuth } from '@/contexts/AuthContext'
import { usePermissoes } from '@/hooks/usePermissoes'
import { useIsAppEnabled } from '@/hooks/useAppModules'
import { supabase } from '@/lib/supabase'
import { destinoAjuda, fontesAjudaValidas, LIMITE_PERGUNTA_AJUDA, respostaLocalAjuda, secaoAjuda, temaAjuda, type RespostaAjuda } from '@/lib/ajudaIris'

/**
 * Janela de conversa da ajuda. Quem abre é o ponto de ajuda único
 * (`PontoDeAjuda`) — este componente não tem mais botão flutuante próprio.
 */
export function AjudaIris({ aberto, onFechar, identidade }: { aberto: boolean; onFechar: () => void; identidade: IdentidadeAjuda }) {
  const { disponivel, usuarioId, tenantId, sessao } = identidade
  if (!disponivel || !usuarioId || !tenantId) return null
  return <ConversaAjuda key={`${usuarioId}:${tenantId}:${sessao}`} usuarioId={usuarioId} tenantId={tenantId} aberto={aberto} onFechar={onFechar} />
}

type Mensagem = { papel: 'user' | 'assistant'; texto: string; modo?: 'ia' | 'manual'; fontes?: string[]; aviso?: string }
function ConversaAjuda({ usuarioId, tenantId, aberto, onFechar }: { usuarioId: string; tenantId: string; aberto: boolean; onFechar: () => void }) {
  const { pathname } = useLocation()
  const { can, carregando } = usePermissoes()
  const { isAppEnabled } = useIsAppEnabled()
  const { user } = useAuth()
  const perfil = user?.perfil
  const [pergunta, setPergunta] = useState('')
  const [mensagens, setMensagens] = useState<Mensagem[]>([])
  const [ocupado, setOcupado] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)
  const campo = useRef<HTMLTextAreaElement>(null)
  const fim = useRef<HTMLDivElement>(null)
  const requisicao = useRef<AbortController | null>(null)
  const geracao = useRef(0)
  const tema = temaAjuda(pathname)
  const fechar = useCallback(() => { onFechar() }, [onFechar])
  useEffect(() => {
    if (aberto) { if (!dialog.current?.open) dialog.current?.showModal(); campo.current?.focus() }
    else if (dialog.current?.open) dialog.current.close()
  }, [aberto])
  useEffect(() => { if (aberto) fim.current?.scrollIntoView({ block: 'nearest' }) }, [mensagens, ocupado, aberto])
  useEffect(() => () => { geracao.current++; requisicao.current?.abort() }, [])

  async function enviar(e: FormEvent) {
    e.preventDefault()
    const texto = pergunta.trim()
    if (!texto || ocupado || texto.length > LIMITE_PERGUNTA_AJUDA) return
    const versao = geracao.current
    const ctrl = new AbortController(); requisicao.current = ctrl
    const timer = window.setTimeout(() => ctrl.abort(), 40_000)
    setMensagens(m => [...m, { papel: 'user', texto }]); setPergunta(''); setOcupado(true)
    const anteriores = mensagens.filter(m => m.papel === 'user').map(m => m.texto).slice(-2)
    let resposta: RespostaAjuda = respostaLocalAjuda(texto, tema, anteriores)
    let aviso = 'Consulta local do manual. A conversa com IA não está disponível agora.'
    try {
      const { data, error } = await supabase.functions.invoke('iris-ajuda', {
        body: { pergunta: texto, tema, contexto: { usuario: usuarioId, empresa: tenantId }, historico: mensagens.slice(-6).map(m => ({ role: m.papel, content: m.texto.slice(0, 1500) })) },
        signal: ctrl.signal,
      })
      if (!error && data && (data.modo === 'ia' || data.modo === 'manual') && typeof data.texto === 'string' && data.texto.length <= 6000) {
        resposta = { modo: data.modo, texto: data.texto, fontes: fontesAjudaValidas(data.fontes) }
        aviso = resposta.modo === 'manual' ? 'Consulta local do manual. Esta resposta não foi gerada por IA.' : ''
      }
    } catch { /* O manual continua disponível, com origem explicitamente indicada. */ }
    finally { window.clearTimeout(timer) }
    if (versao !== geracao.current) return
    setMensagens(m => [...m, { papel: 'assistant', ...resposta, aviso }]); setOcupado(false); requisicao.current = null
    campo.current?.focus()
  }

  function limpar() { geracao.current++; requisicao.current?.abort(); setMensagens([]); setPergunta(''); setOcupado(false); campo.current?.focus() }
  const sugestoes = tema === 'chat' ? ['Como encontrar uma conversa?', 'Como transferir um atendimento?']
    : tema === 'contratos' ? ['Como cadastrar um contrato?', 'O que significa cada situação do contrato?']
    : tema === 'clientes' ? ['Como cadastrar um cliente?', 'Como trocar o responsável pelo cliente?']
    : ['Como começar a usar o Desk?', 'Como conferir meus acessos?', 'Como reportar um problema?']
  return <>
    <dialog ref={dialog} aria-labelledby="ajuda-iris-titulo" aria-describedby="ajuda-iris-descricao" onCancel={(e) => { e.preventDefault(); fechar() }} onClose={() => { if (aberto) fechar() }}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-xl overflow-hidden rounded-2xl border border-border bg-card p-0 text-foreground shadow-2xl backdrop:bg-black/50">
      <div className="flex max-h-[calc(100dvh-2rem)] flex-col">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-border p-5">
          <div><h2 id="ajuda-iris-titulo" className="text-lg font-semibold">Ajuda com a Íris</h2><p id="ajuda-iris-descricao" className="mt-1 text-sm text-muted-foreground">Aprenda a usar os recursos do Desk, com base no manual.</p></div>
          <button type="button" onClick={fechar} aria-label="Fechar ajuda" className="rounded-lg p-2 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"><X className="h-5 w-5" aria-hidden /></button>
        </header>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          <p className="text-xs leading-relaxed text-muted-foreground">A pergunta e o histórico desta conversa podem ser enviados à IA configurada pela empresa. Não inclua dados de clientes, senhas ou informações pessoais. A ajuda orienta o uso; não consulta cadastros nem executa ações. A conversa fica somente nesta sessão.</p>
          {!mensagens.length && <div className="space-y-2"><p className="text-sm font-medium">O que você quer fazer?</p>{sugestoes.map(s => <button key={s} type="button" onClick={() => { setPergunta(s); campo.current?.focus() }} className="block w-full rounded-xl border border-border p-3 text-left text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring">{s}</button>)}</div>}
          <div role="log" aria-live="polite" aria-relevant="additions" className="space-y-4">{mensagens.map((m, index) => <article key={index} className={`rounded-xl p-3 ${m.papel === 'user' ? 'ml-6 bg-primary/10' : 'mr-2 border border-border'}`}>
            <p className="mb-1 text-xs font-semibold text-muted-foreground">{m.papel === 'user' ? 'Você' : m.modo === 'ia' ? 'Íris · resposta com IA' : 'Manual · consulta local'}</p>
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{m.texto}</p>
            {m.aviso && <p className="mt-2 text-xs text-muted-foreground">{m.aviso}</p>}
            {!!m.fontes?.length && <ul className="mt-3 space-y-2">{m.fontes.map(id => { const secao = secaoAjuda(id); const destino = carregando ? null : destinoAjuda(id, can, isAppEnabled, { perfil }); return secao && <li key={id} className="space-y-1 text-sm">
              <a href={`/manual#${id}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-primary underline underline-offset-4"><BookOpen className="h-3.5 w-3.5" aria-hidden />{secao.titulo}<span className="sr-only"> (abre em outra aba)</span></a>
              {destino && <Link to={destino.caminho} onClick={fechar} className="inline-block text-xs underline underline-offset-4">{destino.rotulo}</Link>}
            </li> })}</ul>}
          </article>)}</div>
          {ocupado && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" aria-hidden />Consultando o manual com a Íris…</p>}
          <div ref={fim} />
        </div>
        <form onSubmit={enviar} className="shrink-0 space-y-2 border-t border-border p-4">
          <label htmlFor="ajuda-iris-pergunta" className="text-sm font-medium">Sua pergunta sobre o Desk</label>
          <textarea ref={campo} id="ajuda-iris-pergunta" rows={2} value={pergunta} onChange={e => setPergunta(e.target.value)} maxLength={LIMITE_PERGUNTA_AJUDA} placeholder="Ex.: como trocar o responsável de um cliente?" className="w-full resize-none rounded-lg border border-border bg-background p-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-3 text-xs"><button type="button" onClick={limpar} className="underline underline-offset-4">Limpar conversa</button><a href="/manual" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">Manual completo<span className="sr-only"> (abre em outra aba)</span></a></div>
            <button type="submit" disabled={ocupado || !pergunta.trim()} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"><Send className="h-4 w-4" aria-hidden />Perguntar</button>
          </div>
        </form>
      </div>
    </dialog>
  </>
}
