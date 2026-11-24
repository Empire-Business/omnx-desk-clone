import { useCallback, useEffect, useState } from 'react'
import { Loader2, ShieldCheck } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { BRAND } from '@/config/brand'
import { codigoTotpValido } from '@/lib/mfa'

type Etapa =
  | { tipo: 'carregando' }
  | { tipo: 'sem_fator' }
  | { tipo: 'cadastrando'; fatorId: string; qr: string; segredo: string }
  | { tipo: 'confirmar'; fatorId: string }
  | { tipo: 'ativa' }

/**
 * Verificação em duas etapas por aplicativo autenticador (Google Authenticator,
 * Microsoft Authenticator, 1Password...). Cadastra o fator e confirma a sessão
 * (aal2). Obrigatória para o superadmin no app instalado; opcional para os demais.
 */
export function VerificacaoDuasEtapas({ obrigatoria = false, onConfirmada }: { obrigatoria?: boolean; onConfirmada?: () => void }) {
  const [etapa, setEtapa] = useState<Etapa>({ tipo: 'carregando' })
  const [codigo, setCodigo] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const carregar = useCallback(async () => {
    setErro(null)
    const [{ data: fatores }, { data: nivel }] = await Promise.all([
      supabase.auth.mfa.listFactors(),
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    ])
    const verificado = fatores?.totp?.[0]
    if (!verificado) return setEtapa({ tipo: 'sem_fator' })
    if (nivel?.currentLevel === 'aal2') return setEtapa({ tipo: 'ativa' })
    setEtapa({ tipo: 'confirmar', fatorId: verificado.id })
  }, [])

  useEffect(() => {
    carregar().catch(() => setEtapa({ tipo: 'sem_fator' }))
  }, [carregar])

  async function comecarCadastro() {
    setErro(null)
    setEnviando(true)
    try {
      // Cadastro anterior que não foi confirmado atrapalha um novo: remove antes.
      const { data: fatores } = await supabase.auth.mfa.listFactors()
      for (const f of fatores?.all ?? []) {
        if (f.factor_type === 'totp' && f.status !== 'verified') await supabase.auth.mfa.unenroll({ factorId: f.id })
      }
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `${BRAND.appName} ${new Date().toISOString().slice(0, 10)}` })
      if (error || !data) throw error ?? new Error('sem dados')
      setEtapa({ tipo: 'cadastrando', fatorId: data.id, qr: data.totp.qr_code, segredo: data.totp.secret })
    } catch {
      setErro('Não foi possível começar o cadastro. Confira se a verificação em duas etapas (TOTP) está ligada no Supabase Auth do projeto.')
    } finally {
      setEnviando(false)
    }
  }

  async function confirmar(fatorId: string) {
    if (!codigoTotpValido(codigo)) {
      setErro('Digite os 6 números que aparecem no aplicativo autenticador.')
      return
    }
    setErro(null)
    setEnviando(true)
    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: fatorId, code: codigo.trim() })
      if (error) throw error
      setCodigo('')
      setEtapa({ tipo: 'ativa' })
      onConfirmada?.()
    } catch {
      setErro('Código não aceito. Confira a hora do celular e digite o código atual.')
    } finally {
      setEnviando(false)
    }
  }

  const campoCodigo = (fatorId: string) => (
    <form
      className="flex flex-col gap-2 sm:flex-row"
      onSubmit={(e) => { e.preventDefault(); void confirmar(fatorId) }}
    >
      <label className="sr-only" htmlFor="codigo-totp">Código de 6 números</label>
      <input
        id="codigo-totp"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        value={codigo}
        onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))}
        placeholder="000000"
        className="min-h-11 rounded-lg border border-input bg-background px-3 text-center font-mono text-lg tracking-widest"
      />
      <button type="submit" className="btn btn-primary min-h-11" disabled={enviando}>
        {enviando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        Confirmar
      </button>
    </form>
  )

  return (
    <div className="glass-card space-y-4 p-3 sm:p-4 lg:p-6">
      <div className="flex items-center gap-3">
        <ShieldCheck className="h-5 w-5 text-primary" aria-hidden />
        <h2 className="t-h3 text-foreground">Verificação em duas etapas</h2>
      </div>
      {obrigatoria && etapa.tipo !== 'ativa' && (
        <p className="text-sm text-foreground">
          Para administrar as empresas desta instalação, confirme o acesso com um código do aplicativo autenticador.
        </p>
      )}

      {etapa.tipo === 'carregando' && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Carregando" />}

      {etapa.tipo === 'sem_fator' && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Além da senha, as áreas que exigem mais proteção pedem um código de 6 números do aplicativo autenticador do seu celular.
          </p>
          <button type="button" className="btn btn-primary min-h-11" onClick={comecarCadastro} disabled={enviando}>
            {enviando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Ativar verificação em duas etapas
          </button>
        </div>
      )}

      {etapa.tipo === 'cadastrando' && (
        <div className="space-y-3">
          <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Abra o aplicativo autenticador no celular e escolha adicionar uma conta.</li>
            <li>Aponte a câmera para o código abaixo (ou digite a chave).</li>
            <li>Digite aqui os 6 números que aparecerem.</li>
          </ol>
          <img src={etapa.qr} alt="Código para o aplicativo autenticador" className="h-44 w-44 rounded-lg bg-white p-2" />
          <p className="break-all font-mono text-xs text-muted-foreground">Chave: {etapa.segredo}</p>
          {campoCodigo(etapa.fatorId)}
        </div>
      )}

      {etapa.tipo === 'confirmar' && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Digite o código atual do aplicativo autenticador para confirmar este acesso.</p>
          {campoCodigo(etapa.fatorId)}
        </div>
      )}

      {etapa.tipo === 'ativa' && (
        <p role="status" className="text-sm text-success">Verificação em duas etapas ativa e confirmada neste acesso.</p>
      )}

      {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
    </div>
  )
}
