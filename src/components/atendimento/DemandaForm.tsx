import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { useClientes } from '@/hooks/useClientes'
import { useUsers } from '@/hooks/useUsers'
import {
  useAtendimentoTipos,
  useAtendimentoEtapas,
  useCriarDemanda,
  useSegmentoAtendimento,
  type Prioridade,
} from '@/hooks/useAtendimento'

const PRIORIDADES: Array<{ valor: Prioridade; label: string }> = [
  { valor: 'baixa', label: 'Baixa' },
  { valor: 'media', label: 'Média' },
  { valor: 'alta', label: 'Alta' },
  { valor: 'urgente', label: 'Urgente' },
]

const campo =
  'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none'
const rotulo = 'mb-1 block text-xs font-medium text-muted-foreground'

/**
 * Criação de demanda. Pede o mínimo para a demanda existir (o que é, para quem)
 * e deixa o resto para a tela de detalhe — cobrar 10 campos de quem está no meio
 * de um atendimento é o caminho mais curto para ninguém registrar nada.
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

  const [titulo, setTitulo] = useState('')
  const [clienteId, setClienteId] = useState('')
  const [tipoId, setTipoId] = useState('')
  const [prioridade, setPrioridade] = useState<Prioridade>('media')
  const [prazo, setPrazo] = useState('')
  const [responsavelId, setResponsavelId] = useState('')
  const [descricao, setDescricao] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  const primeiraEtapa = etapas?.[0]?.id

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
        err instanceof Error ? err.message : `Não foi possível criar a ${segmento.rotuloItem}.`,
      )
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={segmento.acaoNovo}
      description={`Registre o que o ${segmento.rotuloCliente} pediu. Os detalhes podem ser completados depois.`}
    >
      <form onSubmit={salvar} className="space-y-4">
        <div>
          <label className={rotulo} htmlFor="demanda-titulo">
            O que precisa ser feito
          </label>
          <input
            id="demanda-titulo"
            className={campo}
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="Ex.: 4 reels sobre o lançamento de abril"
            required
            autoFocus
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={rotulo} htmlFor="demanda-cliente">
              {segmento.rotuloCliente.charAt(0).toUpperCase() + segmento.rotuloCliente.slice(1)}
            </label>
            <select
              id="demanda-cliente"
              className={campo}
              value={clienteId}
              onChange={(e) => setClienteId(e.target.value)}
            >
              <option value="">Selecione…</option>
              {(clientes ?? []).map((c) => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={rotulo} htmlFor="demanda-tipo">Tipo</label>
            <select
              id="demanda-tipo"
              className={campo}
              value={tipoId}
              onChange={(e) => setTipoId(e.target.value)}
            >
              <option value="">Selecione…</option>
              {(tipos ?? []).filter((t) => t.ativo).map((t) => (
                <option key={t.id} value={t.id}>{t.nome}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={rotulo} htmlFor="demanda-prazo">Prazo</label>
            <input
              id="demanda-prazo"
              type="date"
              className={campo}
              value={prazo}
              onChange={(e) => setPrazo(e.target.value)}
            />
          </div>

          <div>
            <label className={rotulo} htmlFor="demanda-prioridade">Prioridade</label>
            <select
              id="demanda-prioridade"
              className={campo}
              value={prioridade}
              onChange={(e) => setPrioridade(e.target.value as Prioridade)}
            >
              {PRIORIDADES.map((p) => (
                <option key={p.valor} value={p.valor}>{p.label}</option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-2">
            <label className={rotulo} htmlFor="demanda-responsavel">Responsável</label>
            <select
              id="demanda-responsavel"
              className={campo}
              value={responsavelId}
              onChange={(e) => setResponsavelId(e.target.value)}
            >
              <option value="">Definir depois</option>
              {(usuarios ?? []).filter((u) => u.ativo).map((u) => (
                <option key={u.id} value={u.id}>{u.nome}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className={rotulo} htmlFor="demanda-descricao">Detalhes (opcional)</label>
          <textarea
            id="demanda-descricao"
            className={campo}
            rows={3}
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="Referências, tom de voz, o que o cliente falou…"
          />
        </div>

        {erro && (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{erro}</p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={criar.isPending || !titulo.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {criar.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {segmento.acaoNovo}
          </button>
        </div>
      </form>
    </Modal>
  )
}
