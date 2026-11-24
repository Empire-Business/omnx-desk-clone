import { useEffect, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Copy, KeyRound, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { mensagemErroWa } from '@/hooks/useAutomacoesWa'
import { formataDataCurta } from '@/lib/automacoesWa'
import { Dica, MensagemErro, MensagemSucesso, Secao } from './comum'
import { botaoPrimario, botaoSecundario, campo } from './estilos'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
interface CodigoGt3 { codigo: string; expires_at: string; workspace_id: string }

/** Código de uso único: fica apenas no estado desta tela, nunca na URL. */
export function IrisGt3Autorizacao() {
  const [params] = useSearchParams()
  const sugerido = params.get('workspace') ?? ''
  const [workspace, setWorkspace] = useState(sugerido)
  const [codigo, setCodigo] = useState<CodigoGt3 | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [copiado, setCopiado] = useState(false)
  const [agora, setAgora] = useState(Date.now)
  useEffect(() => { setWorkspace(sugerido); setCodigo(null); setCopiado(false) }, [sugerido])
  useEffect(() => {
    if (!codigo) return
    setAgora(Date.now())
    const id = window.setInterval(() => setAgora(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [codigo])
  const expirado = codigo !== null && new Date(codigo.expires_at).getTime() <= agora
  const emitir = async (e: FormEvent) => {
    e.preventDefault()
    const id = workspace.trim()
    if (!UUID.test(id) || carregando) return
    setErro(null); setCodigo(null); setCopiado(false); setCarregando(true)
    try {
      const { data, error } = await supabase.functions.invoke('iris-gt3', { body: { acao: 'emitir_codigo', workspace_id: id } })
      if (error) {
        const resposta = (error as { context?: unknown }).context
        const falha = resposta instanceof Response ? await resposta.clone().json().catch(() => null) as { error?: string } | null : null
        throw new Error(falha?.error || 'Não foi possível gerar o código. Confira se a integração está disponível e tente novamente.')
      }
      const r = data as Partial<CodigoGt3> & { ok?: boolean; error?: string }
      if (!r?.ok || typeof r.codigo !== 'string' || typeof r.workspace_id !== 'string' || r.workspace_id.toLowerCase() !== id.toLowerCase() || typeof r.expires_at !== 'string'
        || !Number.isFinite(new Date(r.expires_at).getTime())) throw new Error(r?.error || 'O servidor não retornou um código de autorização válido.')
      setCodigo({ codigo: r.codigo, expires_at: r.expires_at, workspace_id: r.workspace_id })
    } catch (err) { setErro(mensagemErroWa(err, 'Não foi possível gerar o código.')) }
    finally { setCarregando(false) }
  }
  return (
    <Secao titulo="Integração com o GT3" descricao="Autorize um workspace do GT3 a conectar a Íris. O cadastro de destinatários e a ativação são feitos depois, no GT3.">
      <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">
        <li>Abra Configurações → Integrações → Íris no GT3 e confira o ID do workspace.</li>
        <li>Gere o código abaixo e cole no GT3 em até 10 minutos. Ele só pode ser usado uma vez.</li>
        <li>No GT3, associe cada pessoa ao estrategista do Desk, confira os clientes autorizados e ative a integração.</li>
      </ol>
      <form onSubmit={(e) => void emitir(e)} className="space-y-3">
        <label className="block space-y-1.5 text-sm" htmlFor="iris-gt3-workspace">
          <span className="font-medium text-foreground">ID do workspace do GT3</span>
          <input id="iris-gt3-workspace" className={`${campo} block w-full font-mono text-xs`} value={workspace} required autoComplete="off"
            disabled={carregando} placeholder="Cole o ID exibido no GT3"
            onChange={(e) => { setWorkspace(e.target.value); setCodigo(null); setCopiado(false); setErro(null) }} />
        </label>
        <button type="submit" className={botaoPrimario} disabled={carregando || !UUID.test(workspace.trim())}>
          {carregando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <KeyRound className="h-4 w-4" aria-hidden />} Gerar código de autorização
        </button>
      </form>
      {codigo && <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
        <p className="text-sm font-medium text-foreground">{expirado ? 'Código expirado. Gere outro para continuar.' : 'Código de uso único'}</p>
        {!expirado && <>
          <label className="block space-y-1.5 text-xs text-muted-foreground" htmlFor="iris-gt3-codigo">Copie e cole na integração do GT3
            <input id="iris-gt3-codigo" readOnly autoComplete="off" value={codigo.codigo} className={`${campo} block w-full font-mono`} onFocus={(e) => e.target.select()} />
          </label>
          <p className="text-xs text-muted-foreground">Válido até {formataDataCurta(codigo.expires_at)} · workspace <span className="break-all font-mono">{codigo.workspace_id}</span></p>
          <button type="button" className={botaoSecundario} onClick={() => {
            if (!navigator.clipboard) { setErro('Selecione o código acima e copie manualmente.'); return }
            void navigator.clipboard.writeText(codigo.codigo).then(() => setCopiado(true)).catch(() => setErro('Selecione o código acima e copie manualmente.'))
          }}><Copy className="h-3.5 w-3.5" aria-hidden /> Copiar código</button>
          {copiado && <MensagemSucesso texto="Código copiado. Volte ao GT3 para concluir a conexão." />}
        </>}
      </div>}
      <Dica>O código autoriza apenas o workspace indicado. Ele não substitui o cadastro das pessoas e não liga os envios. Cada destinatário ficará limitado aos clientes autorizados da sua associação com um estrategista.</Dica>
      <MensagemErro texto={erro} />
    </Secao>
  )
}
