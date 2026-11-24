import { useId, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { SelectDs } from '@/components/atendimento/TicketUi'
import { useClientes } from '@/hooks/useClientes'
import { useUsers } from '@/hooks/useUsers'
import { tiposSelecionaveisAtendimento } from '@/lib/formatosAtendimento'
import {
  useAtendimentoTipos,
  useAtendimentoEtapas,
  useCriarDemanda,
  useSegmentoAtendimento,
  type Prioridade,
} from '@/hooks/useAtendimento'
import { primeiraEtapaAberta } from '@/lib/ticketStatus'

const PRIORIDADES: Array<{ valor: Prioridade; label: string }> = [
  { valor: 'baixa', label: 'Baixa' },
  { valor: 'media', label: 'Média' },
  { valor: 'alta', label: 'Alta' },
  { valor: 'urgente', label: 'Urgente' },
]

/** Campo do DS; 16 px no celular para o iPhone não dar zoom ao tocar. */
const campo = 'input text-base sm:text-sm'

/**
 * Criação de ticket à mão. Pede o mínimo para o ticket existir (o que é, para
 * quem) e deixa o resto para a ficha — cobrar 10 campos de quem está no meio
 * de um atendimento é o caminho mais curto para ninguém registrar nada.
 * Tickets do WhatsApp nascem sozinhos; este formulário é para o que chega por fora.
 */
export function DemandaForm({
  open,
  onClose,
  onCriada,
  etapaIdInicial,
}: {
  open: boolean
  onClose: () => void
  onCriada?: (id: string) => void
  etapaIdInicial?: string
}) {
  const { data: clientes } = useClientes()
  const { data: usuarios } = useUsers()
  const { data: tipos } = useAtendimentoTipos()
  const { data: etapas } = useAtendimentoEtapas()
  const criar = useCriarDemanda()
  const { segmento } = useSegmentoAtendimento()
  // O botão "Criar ticket" fica no rodapé fixo do modal, fora do <form>.
  const idFormulario = useId()

  const [titulo, setTitulo] = useState('')
  const [clienteId, setClienteId] = useState('')
  const [tipoId, setTipoId] = useState('')
  const [prioridade, setPrioridade] = useState<Prioridade>('media')
  const [prazo, setPrazo] = useState('')
  const [responsavelId, setResponsavelId] = useState('')
  const [descricao, setDescricao] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  // Mesma regra do servidor: nasce na primeira etapa não final pela ordem.
  const primeiraEtapa = primeiraEtapaAberta(etapas ?? [])?.id

  const limpar = () => {
    setTitulo('')
    setClienteId('')
    setTipoId('')
    setPrioridade('media')
    setPrazo('')
    setResponsavelId('')
    setDescricao('')
    setErro(null)
  }

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault()
    setErro(null)
    try {
      const nova = await criar.mutateAsync({
        titulo: titulo.trim(),
        descricao: descricao.trim() || null,
        cliente_id: clienteId || null,
        tipo_id: tipoId || null,
        // Nasce na primeira etapa do fluxo: demanda sem etapa não aparece no
        // kanban e vira trabalho invisível.
        etapa_id: etapaIdInicial ?? primeiraEtapa ?? null,
        prioridade,
        prazo: prazo || null,
        responsavel_id: responsavelId || null,
      })
      limpar()
      onClose()
      onCriada?.(nova.id)
    } catch (err) {
      setErro(
        err instanceof Error ? err.message : 'Não foi possível criar o ticket.',
      )
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Novo ticket"
      description={`Registre o que o ${segmento.rotuloCliente} pediu. Os detalhes podem ser completados depois.`}
      footer={
        <>
          <button type="button" onClick={onClose} className="btn btn-secondary">
            Cancelar
          </button>
          <button
            type="submit"
            form={idFormulario}
            disabled={criar.isPending || !titulo.trim()}
            className="btn btn-primary"
          >
            {criar.isPending && <span className="btn-spin" aria-hidden />}
            Criar ticket
          </button>
        </>
      }
    >
      <form id={idFormulario} onSubmit={salvar} className="grid gap-4">
        <div className="field">
          <label htmlFor="demanda-titulo">O que precisa ser feito</label>
          <input
            id="demanda-titulo"
            className={campo}
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="Ex.: Confirmar o acesso e retornar ao cliente"
            required
            autoFocus
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="field">
            <label htmlFor="demanda-cliente">
              {segmento.rotuloCliente.charAt(0).toUpperCase() + segmento.rotuloCliente.slice(1)}
            </label>
            <SelectDs id="demanda-cliente" value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
              <option value="">Selecione…</option>
              {(clientes ?? []).map((c) => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </SelectDs>
          </div>

          <div className="field">
            <label htmlFor="demanda-tipo">Tipo</label>
            <SelectDs id="demanda-tipo" value={tipoId} onChange={(e) => setTipoId(e.target.value)}>
              <option value="">Selecione…</option>
              {tiposSelecionaveisAtendimento(tipos ?? []).map((t) => (
                <option key={t.id} value={t.id}>{t.nome}</option>
              ))}
            </SelectDs>
          </div>

          <div className="field">
            <label htmlFor="demanda-prazo">Prazo</label>
            <input
              id="demanda-prazo"
              type="date"
              className={campo}
              value={prazo}
              onChange={(e) => setPrazo(e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="demanda-prioridade">Prioridade</label>
            <SelectDs
              id="demanda-prioridade"
              value={prioridade}
              onChange={(e) => setPrioridade(e.target.value as Prioridade)}
            >
              {PRIORIDADES.map((p) => (
                <option key={p.valor} value={p.valor}>{p.label}</option>
              ))}
            </SelectDs>
          </div>

          <div className="field sm:col-span-2">
            <label htmlFor="demanda-responsavel">Responsável</label>
            <SelectDs id="demanda-responsavel" value={responsavelId} onChange={(e) => setResponsavelId(e.target.value)}>
              <option value="">Definir depois</option>
              {(usuarios ?? []).filter((u) => u.ativo).map((u) => (
                <option key={u.id} value={u.id}>{u.nome}</option>
              ))}
            </SelectDs>
          </div>
        </div>

        <div className="field">
          <label htmlFor="demanda-descricao">
            Detalhes <span className="font-normal text-muted-foreground">(opcional)</span>
          </label>
          <textarea
            id="demanda-descricao"
            className="textarea text-base sm:text-sm"
            rows={3}
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="O que o cliente falou, combinados, observações…"
          />
        </div>

        {erro && (
          <p role="alert" className="m-0 rounded-md bg-danger-light px-3 py-2 text-sm text-danger">{erro}</p>
        )}
      </form>
    </Modal>
  )
}
