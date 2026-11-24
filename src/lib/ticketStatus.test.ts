import { describe, expect, it } from 'vitest'
import {
  autorDaMensagem, autorDoHistorico, descreverConfianca, envioFalhou, etapaDestino, filaDoStatus, inicioDaEspera,
  passaNoFiltro, primeiraEtapaAberta, rotuloEtapa, rotuloNomeEtapa, statusDoTicket, tempoDesde, textoPrazoTicket,
  ticketResolvido, ultimaMensagemDaConversa, ROTULO_STATUS_TICKET, type StatusTicket,
} from './ticketStatus'

const etapas = [
  { id: 'e3', nome: 'Em revisão interna', ordem: 30, is_final: false },
  { id: 'e1', nome: 'Solicitado', ordem: 10, is_final: false },
  { id: 'e6', nome: 'Publicado', ordem: 60, is_final: true },
  { id: 'e2', nome: 'Em produção', ordem: 20, is_final: false },
]

const base = { etapaId: 'e1', etapaFinal: false, primeiraEtapaAbertaId: 'e1' }

describe('statusDoTicket — WhatsApp', () => {
  it('aguardando equipe quando a última mensagem é do cliente', () => {
    expect(statusDoTicket({ ...base, origemWhatsApp: true, ultimaMensagemDe: 'cliente' })).toBe('aguardando_equipe')
  })

  it('aguardando cliente quando a última mensagem é da equipe', () => {
    expect(statusDoTicket({ ...base, origemWhatsApp: true, ultimaMensagemDe: 'equipe' })).toBe('aguardando_cliente')
  })

  it('vale também em etapas intermediárias', () => {
    expect(statusDoTicket({ ...base, etapaId: 'e2', origemWhatsApp: true, ultimaMensagemDe: 'equipe' })).toBe('aguardando_cliente')
  })

  it('resolvido quando a etapa é final, mesmo com mensagem do cliente depois', () => {
    expect(statusDoTicket({
      etapaId: 'e6', etapaFinal: true, concluidaEm: '2026-11-06T10:00:00Z',
      origemWhatsApp: true, ultimaMensagemDe: 'cliente',
    })).toBe('resolvido')
  })

  it('resolvido quando a etapa é final mas a data de conclusão ainda não foi gravada', () => {
    expect(statusDoTicket({ etapaId: 'e6', etapaFinal: true, concluidaEm: null, origemWhatsApp: true })).toBe('resolvido')
  })

  it('reaberto quando a reabertura é posterior à resolução e ainda não foi resolvido de novo', () => {
    expect(statusDoTicket({
      ...base, origemWhatsApp: true, ultimaMensagemDe: 'equipe',
      reabertaEm: '2026-11-06T12:00:00Z', concluidaEm: null,
    })).toBe('reaberto')
  })

  it('reaberto mesmo quando sobrou uma data de conclusão anterior', () => {
    expect(statusDoTicket({
      ...base, etapaFinal: false, reabertaEm: '2026-11-06T12:00:00Z', concluidaEm: '2026-11-06T10:00:00Z',
    })).toBe('reaberto')
  })

  it('resolvido de novo depois de reaberto volta a ser resolvido', () => {
    expect(statusDoTicket({
      etapaId: 'e6', etapaFinal: true, reabertaEm: '2026-11-06T12:00:00Z', concluidaEm: '2026-11-06T13:00:00Z',
      origemWhatsApp: true,
    })).toBe('resolvido')
  })

  it('não vira reaberto se a reabertura é anterior a uma conclusão que ficou na etapa não final', () => {
    // Marcação "Final" desligada por fora: a etapa manda (não resolvido), e a
    // reabertura antiga não conta mais que a conclusão mais nova.
    expect(statusDoTicket({
      ...base, etapaFinal: false, origemWhatsApp: true, ultimaMensagemDe: 'cliente',
      reabertaEm: '2026-11-06T09:00:00Z', concluidaEm: '2026-11-06T10:00:00Z',
    })).toBe('aguardando_equipe')
  })

  it('sem informação da conversa, cai na etapa (aberto / em andamento)', () => {
    expect(statusDoTicket({ ...base, origemWhatsApp: true, ultimaMensagemDe: null })).toBe('aberto')
    expect(statusDoTicket({ ...base, etapaId: 'e3', origemWhatsApp: true })).toBe('em_andamento')
  })

  it('ignora a última mensagem quando o ticket não veio do WhatsApp', () => {
    expect(statusDoTicket({ ...base, origemWhatsApp: false, ultimaMensagemDe: 'cliente' })).toBe('aberto')
  })
})

describe('statusDoTicket — sem WhatsApp', () => {
  it('aberto na primeira etapa de trabalho', () => {
    expect(statusDoTicket(base)).toBe('aberto')
  })

  it('em andamento em outra etapa não final', () => {
    expect(statusDoTicket({ ...base, etapaId: 'e2' })).toBe('em_andamento')
  })

  it('resolvido na etapa final', () => {
    expect(statusDoTicket({ ...base, etapaId: 'e6', etapaFinal: true })).toBe('resolvido')
  })

  it('aberto sem etapa e sem conclusão', () => {
    expect(statusDoTicket({ etapaId: null, etapaFinal: null, primeiraEtapaAbertaId: 'e1' })).toBe('aberto')
  })

  it('sem etapa conhecida usa a data de conclusão', () => {
    expect(statusDoTicket({ etapaId: null, concluidaEm: '2026-11-01T00:00:00Z' })).toBe('resolvido')
  })

  it('aberto quando não há etapas abertas configuradas', () => {
    expect(statusDoTicket({ etapaId: 'e2', etapaFinal: false, primeiraEtapaAbertaId: null })).toBe('aberto')
  })
})

describe('ticketResolvido', () => {
  it('a etapa vale mais que a data', () => {
    expect(ticketResolvido({ etapaFinal: false, concluidaEm: '2026-11-01T00:00:00Z' })).toBe(false)
    expect(ticketResolvido({ etapaFinal: true, concluidaEm: null })).toBe(true)
  })
  it('sem etapa conhecida, usa a data', () => {
    expect(ticketResolvido({ etapaFinal: null, concluidaEm: null })).toBe(false)
    expect(ticketResolvido({ concluidaEm: '2026-11-01T00:00:00Z' })).toBe(true)
  })
})

describe('filas e filtros', () => {
  const todos: StatusTicket[] = ['aguardando_equipe', 'aguardando_cliente', 'resolvido', 'reaberto', 'aberto', 'em_andamento']

  it('cada status cai em exatamente uma fila', () => {
    expect(todos.map(filaDoStatus)).toEqual(['equipe', 'cliente', 'resolvidos', 'equipe', 'equipe', 'equipe'])
  })

  it('"Todos" aceita qualquer status', () => {
    expect(todos.every((s) => passaNoFiltro(s, 'todos'))).toBe(true)
  })

  it('cada filtro aceita só a sua fila', () => {
    expect(todos.filter((s) => passaNoFiltro(s, 'cliente'))).toEqual(['aguardando_cliente'])
    expect(todos.filter((s) => passaNoFiltro(s, 'resolvidos'))).toEqual(['resolvido'])
    expect(todos.filter((s) => passaNoFiltro(s, 'equipe'))).toEqual(['aguardando_equipe', 'reaberto', 'aberto', 'em_andamento'])
  })

  it('todo status tem rótulo em português', () => {
    expect(todos.map((s) => ROTULO_STATUS_TICKET[s])).toEqual([
      'Aguardando equipe', 'Aguardando cliente', 'Resolvido', 'Reaberto', 'Aberto', 'Em andamento',
    ])
  })
})

describe('autorDaMensagem', () => {
  it('usa o autor gravado', () => {
    expect(autorDaMensagem({ autor_tipo: 'equipe' })).toBe('equipe')
    expect(autorDaMensagem({ autor_tipo: 'ia' })).toBe('equipe')
    expect(autorDaMensagem({ autor_tipo: 'cliente', enviado_por_agente: true })).toBe('cliente')
    expect(autorDaMensagem({ autor_tipo: 'desconhecido' })).toBe('cliente')
    expect(autorDaMensagem({ autor_tipo: 'sistema' })).toBe('sistema')
  })
  it('sem autor, usa as marcas antigas', () => {
    expect(autorDaMensagem({ autor_tipo: null, enviado_por_agente: true })).toBe('equipe')
    expect(autorDaMensagem({ enviado_por_ia: true })).toBe('equipe')
    expect(autorDaMensagem({})).toBe('cliente')
  })
})

describe('envioFalhou', () => {
  it('só a falha de envio conta como "não enviada"', () => {
    expect(envioFalhou({ status_envio: 'falha' })).toBe(true)
    expect(envioFalhou({ status_envio: 'enviando' })).toBe(false)
    expect(envioFalhou({ status_envio: 'enviada' })).toBe(false)
    expect(envioFalhou({ status_envio: null })).toBe(false)
    expect(envioFalhou({})).toBe(false)
  })
})

describe('ultimaMensagemDaConversa', () => {
  it('traduz o "aguardando resposta" da conversa', () => {
    expect(ultimaMensagemDaConversa(true)).toBe('cliente')
    expect(ultimaMensagemDaConversa(false)).toBe('equipe')
    expect(ultimaMensagemDaConversa(null)).toBeNull()
    expect(ultimaMensagemDaConversa(undefined)).toBeNull()
  })
})

describe('etapas', () => {
  it('primeira etapa aberta segue a ordem, não a posição na lista', () => {
    expect(primeiraEtapaAberta(etapas)?.id).toBe('e1')
    expect(primeiraEtapaAberta([{ id: 'f', nome: 'Feito', ordem: 1, is_final: true }])).toBeNull()
  })

  it('resolver vai para a primeira etapa final; reabrir para a primeira aberta', () => {
    expect(etapaDestino(etapas, 'e2', 'resolver')?.id).toBe('e6')
    expect(etapaDestino(etapas, 'e6', 'reabrir')?.id).toBe('e1')
  })

  it('nunca devolve a etapa atual (o botão não pode ficar sem efeito)', () => {
    expect(etapaDestino(etapas, 'e1', 'reabrir')?.id).toBe('e2')
    expect(etapaDestino(etapas, 'e6', 'resolver')).toBeNull()
  })

  it('sem etapa do tipo pedido, devolve nulo', () => {
    expect(etapaDestino(etapas.filter((e) => !e.is_final), 'e1', 'resolver')).toBeNull()
    expect(etapaDestino([], null, 'reabrir')).toBeNull()
  })

  it('etapa final aparece como "Resolvido"', () => {
    expect(rotuloEtapa({ nome: 'Publicado', is_final: true }, etapas)).toBe('Resolvido')
    expect(rotuloEtapa({ nome: 'Em produção', is_final: false }, etapas)).toBe('Em produção')
  })

  it('com mais de uma etapa final, mantém o nome para distinguir', () => {
    const duas = [...etapas, { id: 'e7', nome: 'Concluída', ordem: 70, is_final: true }]
    expect(rotuloEtapa({ nome: 'Publicado', is_final: true }, duas)).toBe('Resolvido (Publicado)')
    expect(rotuloEtapa({ nome: 'Resolvido', is_final: true }, duas)).toBe('Resolvido')
  })

  it('traduz nomes gravados no histórico', () => {
    expect(rotuloNomeEtapa('Publicado', etapas)).toBe('Resolvido')
    expect(rotuloNomeEtapa('Solicitado', etapas)).toBe('Solicitado')
    expect(rotuloNomeEtapa('Etapa apagada', etapas)).toBe('Etapa apagada')
    expect(rotuloNomeEtapa(null, etapas)).toBe('sem etapa')
  })
})

describe('textos', () => {
  it('descreve a confiança sem números', () => {
    expect(descreverConfianca(0.99)).toBe('muito alta')
    expect(descreverConfianca(0.93)).toBe('alta')
    expect(descreverConfianca(0.8)).toBe('média')
    expect(descreverConfianca(0.4)).toBe('baixa')
    expect(descreverConfianca(null)).toBeNull()
    expect(descreverConfianca(undefined)).toBeNull()
  })

  it('prazo do ticket no masculino', () => {
    const agora = new Date(2026, 10, 6, 15, 0)
    expect(textoPrazoTicket(null, agora)).toBe('Sem prazo')
    expect(textoPrazoTicket('inválido', agora)).toBe('Sem prazo')
    expect(textoPrazoTicket('2026-11-06', agora)).toBe('Vence hoje')
    expect(textoPrazoTicket('2026-11-05', agora)).toBe('Atrasado 1 dia')
    expect(textoPrazoTicket('2026-11-01', agora)).toBe('Atrasado 5 dias')
    expect(textoPrazoTicket('2026-11-12', agora)).toBe('Vence 12/11')
  })

  it('tempo desde, em linguagem simples', () => {
    const agora = new Date('2026-11-06T12:00:00Z')
    expect(tempoDesde('2026-11-06T11:59:40Z', agora)).toBe('agora há pouco')
    expect(tempoDesde('2026-11-06T11:55:00Z', agora)).toBe('há 5 min')
    expect(tempoDesde('2026-11-06T09:00:00Z', agora)).toBe('há 3 h')
    expect(tempoDesde('2026-11-05T11:00:00Z', agora)).toBe('há 1 dia')
    expect(tempoDesde('2026-11-01T12:00:00Z', agora)).toBe('há 5 dias')
    expect(tempoDesde(null, agora)).toBeNull()
    expect(tempoDesde('data inválida', agora)).toBeNull()
  })

  it('início da espera depende do status', () => {
    const datas = {
      criadoEm: 'c', concluidaEm: 'f', reabertaEm: 'r', ultimaMsgClienteEm: 'm', conversaAtualizadaEm: 'a',
    }
    expect(inicioDaEspera('aguardando_equipe', datas)).toBe('m')
    expect(inicioDaEspera('aguardando_cliente', datas)).toBe('a')
    expect(inicioDaEspera('resolvido', datas)).toBe('f')
    expect(inicioDaEspera('reaberto', datas)).toBe('r')
    expect(inicioDaEspera('aberto', datas)).toBe('c')
    expect(inicioDaEspera('em_andamento', datas)).toBe('c')
    expect(inicioDaEspera('aguardando_equipe', { criadoEm: 'c' })).toBe('c')
  })

  it('autor vazio num ticket do WhatsApp é a Íris', () => {
    expect(autorDoHistorico(null, true)).toBe('Íris')
    expect(autorDoHistorico('  ', true)).toBe('Íris')
    expect(autorDoHistorico(null, false)).toBe('Alguém da equipe')
    expect(autorDoHistorico('Ana', true)).toBe('Ana')
  })
})
