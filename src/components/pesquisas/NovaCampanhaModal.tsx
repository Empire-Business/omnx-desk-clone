import { useMemo, useState, type FormEvent } from 'react'
import { AlertCircle } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { useClientes } from '@/hooks/useClientes'
import { useCreateSurvey } from '@/hooks/useNps'
import { mensagemErro } from '@/lib/mensagemErro'
import { clientesParaCampanha, validarCampanha } from '@/lib/pesquisasNps'

/**
 * Criar campanha de NPS: uma pesquisa (`nps_surveys`) para um cliente, pelo
 * `useCreateSurvey`. Só aparece para admin (`podeCriarCampanha`), a mesma
 * regra da RLS; quem chegar aqui sem ela recebe o erro do banco, sem gravar.
 * Não envia nada ao cliente: a equipe copia o link e manda pelo canal dela.
 */
export function NovaCampanhaModal({ open, onClose, onCriada }: {
  open: boolean
  onClose: () => void
  onCriada: (id: string) => void
}) {
  const criar = useCreateSurvey()
  const { data: clientes = [], isLoading, isError } = useClientes()
  const [busca, setBusca] = useState('')
  const [clienteId, setClienteId] = useState('')
  const [erro, setErro] = useState<string>()

  const opcoes = useMemo(() => clientesParaCampanha(clientes, busca), [clientes, busca])

  const fechar = () => { setBusca(''); setClienteId(''); setErro(undefined); criar.reset(); onClose() }

  const salvar = (e: FormEvent) => {
    e.preventDefault()
    const problema = validarCampanha(clienteId, clientes)
    if (problema) { setErro(problema); return }
    criar.mutate({ client_id: clienteId }, { onSuccess: (pesquisa) => { fechar(); onCriada(pesquisa.id) } })
  }

  return (
    <Modal
      open={open}
      onClose={fechar}
      title="Criar campanha de NPS"
      description="A campanha é uma pesquisa para um cliente. Depois de criar, copie o link e envie pelo canal de sempre."
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={fechar} disabled={criar.isPending}>Cancelar</button>
          <button type="submit" form="form-nova-campanha" className="btn btn-primary" disabled={criar.isPending || isLoading}>
            {criar.isPending ? 'Criando…' : 'Criar campanha'}
          </button>
        </>
      }
    >
      <form id="form-nova-campanha" onSubmit={salvar} className="grid gap-4" noValidate>
        <div className="field">
          <label htmlFor="campanha-busca">Buscar cliente</label>
          <input id="campanha-busca" className="input" type="search" value={busca} autoFocus
            onChange={(e) => {
              setBusca(e.target.value)
              // O cliente escolhido que sair da lista filtrada deixa de valer.
              if (clienteId && !clientesParaCampanha(clientes, e.target.value).some((c) => c.id === clienteId)) setClienteId('')
            }}
            placeholder="Digite parte do nome" />
        </div>
        <div className="field">
          <label htmlFor="campanha-cliente">Cliente</label>
          <select id="campanha-cliente" className="select w-full" value={clienteId} disabled={isLoading || isError}
            aria-invalid={erro ? true : undefined}
            onChange={(e) => { setClienteId(e.target.value); setErro(undefined) }}>
            <option value="">{isLoading ? 'Carregando clientes…' : opcoes.length ? 'Escolha o cliente' : 'Nenhum cliente com esse nome'}</option>
            {opcoes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
          {erro && <p className="err" role="alert"><AlertCircle className="h-3.5 w-3.5" aria-hidden />{erro}</p>}
          {isError && <p className="err" role="alert"><AlertCircle className="h-3.5 w-3.5" aria-hidden />Não deu para carregar os clientes. Feche e tente de novo.</p>}
        </div>
        {criar.error && (
          <div role="alert" className="rounded-md bg-danger-light px-3 py-2 text-[13px] text-danger">
            Não deu para criar a campanha. Confira a conexão e tente de novo.
            <span className="mt-0.5 block text-[12px] opacity-80">{mensagemErro(criar.error)}</span>
          </div>
        )}
      </form>
    </Modal>
  )
}
