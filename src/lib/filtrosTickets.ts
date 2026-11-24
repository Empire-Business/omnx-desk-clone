import { ROTULO_PRIORIDADE } from '@/lib/atendimento'
import type { Prioridade } from '@/hooks/useAtendimento'

/**
 * Os filtros da lista de tickets moram no endereço, como as visões do
 * Acompanhamento do OMNX Clients: o link copiado abre a mesma lista, e voltar
 * da ficha de um ticket não perde o recorte. A busca digitada fica fora (só é
 * lida de `?q=` ao abrir), para não reescrever o endereço a cada tecla.
 */
export interface FiltrosTickets {
  soWhatsApp: boolean
  semResponsavel: boolean
  meus: boolean
  clienteId: string
  responsavelId: string
  prioridade: Prioridade | ''
  etapaId: string
}

const CHAVE: Record<keyof FiltrosTickets, string> = {
  soWhatsApp: 'whatsapp',
  semResponsavel: 'sem_responsavel',
  meus: 'meus',
  clienteId: 'cliente',
  responsavelId: 'responsavel',
  prioridade: 'prioridade',
  etapaId: 'etapa',
}

export const FILTROS_VAZIOS: FiltrosTickets = {
  soWhatsApp: false, semResponsavel: false, meus: false, clienteId: '', responsavelId: '', prioridade: '', etapaId: '',
}

function prioridadeValida(v: string | null): Prioridade | '' {
  return v && v in ROTULO_PRIORIDADE ? (v as Prioridade) : ''
}

export function lerFiltros(params: URLSearchParams): FiltrosTickets {
  const sim = (k: keyof FiltrosTickets) => params.get(CHAVE[k]) === '1'
  const semResponsavel = sim('semResponsavel')
  return {
    soWhatsApp: sim('soWhatsApp'),
    semResponsavel,
    // Os dois chips se excluem na tela; num link montado à mão, vale "sem responsável".
    meus: sim('meus') && !semResponsavel,
    clienteId: params.get(CHAVE.clienteId) ?? '',
    responsavelId: params.get(CHAVE.responsavelId) ?? '',
    prioridade: prioridadeValida(params.get(CHAVE.prioridade)),
    etapaId: params.get(CHAVE.etapaId) ?? '',
  }
}

/** Novo endereço com a mudança; o que não é filtro (status, q…) fica como está. */
export function gravarFiltros(params: URLSearchParams, mudanca: Partial<FiltrosTickets>): URLSearchParams {
  const novo = new URLSearchParams(params)
  ;(Object.keys(mudanca) as Array<keyof FiltrosTickets>).forEach((k) => {
    const v = mudanca[k]
    if (v === true) novo.set(CHAVE[k], '1')
    else if (typeof v === 'string' && v) novo.set(CHAVE[k], v)
    else novo.delete(CHAVE[k])
  })
  return novo
}

/** Algum dos filtros de "Mais filtros" veio no endereço? Então a área abre aberta. */
export function temMaisFiltros(f: FiltrosTickets): boolean {
  return Boolean(f.clienteId || f.responsavelId || f.prioridade || f.etapaId)
}
