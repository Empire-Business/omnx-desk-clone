import { useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { usePermissoes } from '@/hooks/usePermissoes'
import type { Contrato } from '@/hooks/useComissoes'
import { supabase } from '@/lib/supabase'
import { buscarClientesParaVinculoContrato } from '@/lib/contratoClienteVinculo'
import { definirClientesContrato } from '@/lib/contratoClientes'
import { invalidarClientesAposContrato } from '@/lib/clienteContratoCache'

export function ContratoClientes({ contrato, edicaoPendente, onOcupadoChange }: {
  contrato: Contrato; edicaoPendente: boolean; onOcupadoChange: (ocupado: boolean) => void
}) {
  const { user } = useAuth()
  const { can } = usePermissoes()
  const qc = useQueryClient()
  const campo = useId()
  const [editando, setEditando] = useState(false)
  const [ids, setIds] = useState<string[]>([])
  const [esperados, setEsperados] = useState<string[]>([])
  const [motivo, setMotivo] = useState('')
  const [actorSnapshot, setActorSnapshot] = useState<string | null>(null)
  const clientes = contrato.clientes ?? []
  const podeEditar = can('contratos', 'editar') && Boolean(contrato.cliente_id)
  const consulta = useQuery({
    queryKey: ['contrato-cliente-vinculo', user?.id, contrato.id, 'associados'],
    queryFn: () => buscarClientesParaVinculoContrato(supabase), enabled: Boolean(user && podeEditar && editando), gcTime: 0,
  })
  const salvar = useMutation({
    mutationFn: async () => {
      if (!user || !actorSnapshot || user.id !== actorSnapshot || !contrato.cliente_id) throw new Error('Reabra a ficha para confirmar a sessão.')
      await definirClientesContrato(supabase, { contratoId: contrato.id, actorId: actorSnapshot, principalId: contrato.cliente_id, ids, esperados, motivo })
    },
    onSuccess: () => { setEditando(false); setMotivo('') },
    onSettled: async () => {
      await Promise.all([qc.invalidateQueries({ queryKey: ['comissoes'] }), invalidarClientesAposContrato(qc)])
    },
  })
  async function confirmar() {
    if (edicaoPendente || salvar.isPending) return
    onOcupadoChange(true)
    try { await salvar.mutateAsync() } catch { /* Erro visível abaixo. */ } finally { onOcupadoChange(false) }
  }
  if (!contrato.cliente_id) return null
  const mudou = ids.length !== esperados.length || ids.some(id => !esperados.includes(id))
  return <section className="glass-card p-5 space-y-3" aria-labelledby={`${campo}-titulo`}>
    <h2 id={`${campo}-titulo`} className="text-sm font-semibold">Clientes atendidos neste contrato</h2>
    <p className="text-sm text-muted-foreground">Um único contrato financeiro atende estes cadastros. Atendimento, responsáveis e análises da Íris continuam separados por cliente.</p>
    <ul className="space-y-1 text-sm">{clientes.map(c => <li key={c.id}><Link className="text-primary hover:underline" to={`/clientes/${c.id}`}>{c.nome}</Link>{c.principal ? ' · Principal' : ' · Associado'}</li>)}</ul>
    {podeEditar && !editando && <button type="button" className="text-sm font-medium text-primary" disabled={edicaoPendente} onClick={() => {
      const atuais = clientes.map(c => c.id)
      setIds(atuais); setEsperados(atuais); setActorSnapshot(user?.id ?? null); setEditando(true); salvar.reset()
    }}>Gerenciar clientes associados</button>}
    {editando && <div className="space-y-3">
      {consulta.isLoading && <p role="status">Carregando clientes…</p>}
      {consulta.data && <fieldset className="max-h-60 overflow-y-auto space-y-2" disabled={edicaoPendente || salvar.isPending}>
        <legend className="text-sm font-medium mb-2">Selecione os cadastros atendidos</legend>
        {consulta.data.clientes.map(c => <label key={c.id} className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={ids.includes(c.id)} disabled={c.id === contrato.cliente_id} onChange={e => setIds(atual => e.target.checked ? [...atual, c.id] : atual.filter(id => id !== c.id))} />
          {c.nome}{c.empresa ? ` · ${c.empresa}` : ''}{c.id === contrato.cliente_id ? ' · Principal (mantido)' : ''}
        </label>)}
      </fieldset>}
      <label className="block text-sm" htmlFor={campo}>Motivo da alteração</label>
      <textarea id={campo} value={motivo} onChange={e => setMotivo(e.target.value)} maxLength={2000} disabled={edicaoPendente || salvar.isPending} className="w-full rounded-md border border-border bg-background p-2 text-sm" />
      <div className="flex gap-3">
        <button type="button" onClick={() => void confirmar()} disabled={!consulta.data || !mudou || motivo.trim().length < 8 || edicaoPendente || salvar.isPending} className="rounded-full bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50">{salvar.isPending ? 'Salvando…' : 'Salvar clientes'}</button>
        <button type="button" disabled={salvar.isPending} onClick={() => setEditando(false)} className="text-sm">Cancelar</button>
      </div>
    </div>}
    {edicaoPendente && <p className="text-sm text-muted-foreground">Conclua a edição da ficha antes de alterar os clientes associados.</p>}
    {(salvar.error || consulta.error) && <p role="alert" className="text-sm text-danger">{(salvar.error || consulta.error)?.message}</p>}
  </section>
}
