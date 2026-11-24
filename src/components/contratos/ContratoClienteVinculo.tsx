import { useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Link as LinkIcon, Loader2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { usePermissoes } from '@/hooks/usePermissoes'
import type { Contrato } from '@/hooks/useComissoes'
import { supabase } from '@/lib/supabase'
import { buscarClientesParaVinculoContrato, comClienteVinculado, vincularClienteAoContrato } from '@/lib/contratoClienteVinculo'

interface Props {
  contratoId: string
  clienteId: string | null
  edicaoPendente: boolean
  onOcupadoChange: (ocupado: boolean) => void
  onVinculado: (clienteId: string) => void
}

export function ContratoClienteVinculo({ contratoId, clienteId, edicaoPendente, onOcupadoChange, onVinculado }: Props) {
  const { user } = useAuth()
  const { can } = usePermissoes()
  const qc = useQueryClient()
  const campoId = useId()
  const [selecionado, setSelecionado] = useState('')
  const podeEditar = can('contratos', 'editar')
  const consulta = useQuery({
    queryKey: ['contrato-cliente-vinculo', user?.id, contratoId],
    enabled: Boolean(user && podeEditar && !clienteId),
    gcTime: 0,
    queryFn: () => buscarClientesParaVinculoContrato(supabase),
  })
  const vinculo = useMutation({
    mutationFn: (input: { clienteId: string; tenantId: string }) =>
      vincularClienteAoContrato(supabase, { contratoId, ...input }),
    onSuccess: (confirmado) => {
      // A escrita já foi confirmada: não depende do próximo refetch para manter a FK.
      onVinculado(confirmado.clienteId)
      qc.setQueryData<Contrato>(['comissoes', 'contrato', contratoId], (atual) =>
        atual ? comClienteVinculado(atual, confirmado.clienteId) : atual)
      return Promise.all([
        qc.invalidateQueries({ queryKey: ['clients'] }),
        qc.invalidateQueries({ queryKey: ['clientes-list-comissoes'] }),
        qc.invalidateQueries({ queryKey: ['automacoes-wa', 'vinculos'] }),
      ])
    },
    // Também atualiza o detalhe em conflito: outro usuário pode ter vinculado.
    onSettled: () => qc.invalidateQueries({ queryKey: ['comissoes'] }),
  })

  async function confirmar() {
    if (!selecionado || !consulta.data || edicaoPendente || vinculo.isPending || clienteId) return
    onOcupadoChange(true)
    try {
      await vinculo.mutateAsync({ clienteId: selecionado, tenantId: consulta.data.tenantId })
    } catch {
      // O erro da mutation permanece visível na própria ação.
    } finally {
      onOcupadoChange(false)
    }
  }

  if (!podeEditar) return null
  const ligado = clienteId || vinculo.data?.clienteId
  if (ligado) {
    return (
      <div className="glass-card p-5 flex flex-wrap items-center gap-2 text-sm" role="status">
        <Check className="h-4 w-4 text-success" aria-hidden />
        <span>{vinculo.data ? `Contrato vinculado a ${vinculo.data.clienteNome}.` : 'Contrato vinculado a um cadastro de cliente.'}</span>
        <Link to={`/clientes/${ligado}`} className="font-medium text-primary hover:underline">Abrir cadastro</Link>
      </div>
    )
  }

  const cliente = consulta.data?.clientes.find((c) => c.id === selecionado)
  const erro = vinculo.error ?? consulta.error
  return (
    <section className="glass-card p-5 space-y-3" aria-labelledby={`${campoId}-titulo`}>
      <div>
        <h2 id={`${campoId}-titulo`} className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <LinkIcon className="h-4 w-4 text-primary" aria-hidden /> Vincular cadastro de cliente
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">Escolha o cadastro que corresponde a este contrato.</p>
      </div>
      {consulta.isLoading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Carregando clientes…
        </p>
      ) : consulta.data && consulta.data.clientes.length > 0 ? (
        <div className="space-y-3">
          <label htmlFor={campoId} className="block text-sm font-medium text-foreground">Cliente cadastrado</label>
          <select id={campoId} value={selecionado} onChange={(e) => { setSelecionado(e.target.value); vinculo.reset() }}
            disabled={edicaoPendente || vinculo.isPending}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground disabled:opacity-50">
            <option value="">Selecione um cliente</option>
            {consulta.data.clientes.map((c) => (
              <option key={c.id} value={c.id}>{c.nome}{c.empresa ? ` · ${c.empresa}` : ''}{!c.ativo ? ' (inativo)' : ''}</option>
            ))}
          </select>
          {cliente && <p className="text-sm text-foreground">Cliente selecionado: <strong>{cliente.nome}</strong>{cliente.empresa ? ` · ${cliente.empresa}` : ''}.</p>}
          <button type="button" onClick={() => void confirmar()} disabled={!cliente || edicaoPendente || vinculo.isPending}
            className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {vinculo.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {vinculo.isPending ? 'Vinculando…' : 'Confirmar vínculo'}
          </button>
        </div>
      ) : !consulta.isError && <p className="text-sm text-muted-foreground">Nenhum cadastro disponível para vincular.</p>}
      {edicaoPendente && <p className="text-sm text-muted-foreground">Conclua a edição do formulário antes de vincular o cliente.</p>}
      {erro && <p role="alert" className="rounded-md bg-danger-light px-3 py-2 text-sm text-danger">{erro instanceof Error ? erro.message : 'Não foi possível vincular o cliente. Tente novamente.'}</p>}
    </section>
  )
}
