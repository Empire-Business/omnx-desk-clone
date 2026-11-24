import { useEffect, useId, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { usePermissoes } from '@/hooks/usePermissoes'
import type { Contrato } from '@/hooks/useComissoes'
import { supabase } from '@/lib/supabase'
import { confirmarVigencia, erroVigencia, formatarDataCivil, hojeSaoPaulo } from '@/lib/contratoVigencia'
import { invalidarClientesAposContrato } from '@/lib/clienteContratoCache'

export function ContratoVigencia({ contrato, edicaoPendente, onOcupadoChange }: {
  contrato: Contrato; edicaoPendente: boolean; onOcupadoChange: (ocupado: boolean) => void
}) {
  const { user } = useAuth()
  const { can } = usePermissoes()
  const qc = useQueryClient()
  const campo = useId()
  const [data, setData] = useState('')
  const [motivo, setMotivo] = useState('')
  const [reativar, setReativar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const trava = useRef(false)
  const vivo = useRef(true)
  useEffect(() => {
    vivo.current = true
    return () => {
      vivo.current = false
      if (trava.current) onOcupadoChange(false)
    }
  }, [onOcupadoChange])
  const podeEditar = can('contratos', 'editar') && ['ativo', 'pausado', 'concluido'].includes(contrato.status)
  const hoje = hojeSaoPaulo()
  const fim = contrato.vigencia_fim ?? null
  const pendencia = erroVigencia({ novaData: data, motivo, fimEsperado: fim }, hoje)

  async function confirmar() {
    if (trava.current || edicaoPendente || !user || !podeEditar) return
    if (pendencia) { setErro(pendencia); return }
    trava.current = true; setOcupado(true); onOcupadoChange(true); setErro(null); setSucesso(false)
    try {
      const confirmado = await confirmarVigencia(supabase, { contratoId: contrato.id, actorId: user.id, novaData: data, motivo, fimEsperado: fim, statusEsperado: contrato.status, reativar })
      if (!vivo.current) return
      qc.setQueryData<Contrato>(['comissoes', 'contrato', contrato.id], atual => atual ? { ...atual, ...confirmado } : atual)
      setSucesso(true); setData(''); setMotivo(''); setReativar(false)
      await Promise.all([qc.invalidateQueries({ queryKey: ['comissoes'] }), invalidarClientesAposContrato(qc)])
    } catch (e) {
      if (vivo.current) setErro(e instanceof Error ? e.message : 'Não foi possível confirmar a vigência.')
    } finally {
      trava.current = false
      if (vivo.current) { setOcupado(false); onOcupadoChange(false) }
    }
  }
  return <section className="glass-card p-5 space-y-3" aria-labelledby={`${campo}-titulo`}>
    <h2 id={`${campo}-titulo`} className="text-sm font-bold">Vigência e prorrogação</h2>
    <p className="text-sm">{fim ? <>Válido até <strong>{formatarDataCivil(fim)}</strong>, incluindo esse dia.</> : 'Vigência ainda não confirmada. O prazo legado não encerra este contrato automaticamente.'}</p>
    {contrato.vigencia_motivo && <p className="text-sm text-muted-foreground whitespace-pre-wrap">Último acordo: {contrato.vigencia_motivo}</p>}
    {contrato.status === 'pausado' && <p className="text-sm text-muted-foreground">O contrato continuará pausado. A prorrogação não retoma o atendimento automaticamente.</p>}
    {podeEditar && <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Confirme o último dia de serviço acordado com o cliente. Parcelas, valores e comissões permanecem iguais; data e motivo ficam no histórico.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm" htmlFor={`${campo}-data`}>Novo fim da vigência
          <input id={`${campo}-data`} type="date" min={fim && fim > hoje ? fim : hoje} value={data} onChange={e => { setData(e.target.value); setSucesso(false) }} disabled={ocupado || edicaoPendente} className="mt-1 block w-full rounded-md border border-border bg-background p-2" />
        </label>
        <label className="text-sm" htmlFor={`${campo}-motivo`}>Motivo / acordo
          <textarea id={`${campo}-motivo`} maxLength={2000} rows={2} value={motivo} onChange={e => { setMotivo(e.target.value); setSucesso(false) }} disabled={ocupado || edicaoPendente} placeholder="Ex.: pausa acordada e retomada com novo prazo…" className="mt-1 block w-full rounded-md border border-border bg-background p-2" />
        </label>
      </div>
      {contrato.status === 'concluido' && <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={reativar} onChange={e => setReativar(e.target.checked)} disabled={ocupado || edicaoPendente} />Reativar este contrato pelo novo acordo e atualizar o acesso do cliente vinculado.</label>}
      <button type="button" onClick={() => void confirmar()} disabled={ocupado || edicaoPendente || !data || !motivo.trim()} className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">{ocupado ? 'Confirmando…' : fim ? 'Confirmar prorrogação' : 'Confirmar vigência'}</button>
      {edicaoPendente && <p className="text-sm text-muted-foreground">Salve a edição do formulário antes de alterar a vigência.</p>}
    </div>}
    {erro && <p role="alert" className="text-sm text-danger">{erro}</p>}
    {sucesso && <p role="status" className="text-sm text-success">Vigência confirmada e registrada no histórico.</p>}
  </section>
}
