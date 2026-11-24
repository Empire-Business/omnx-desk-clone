import { describe, expect, it } from 'vitest'
import { LimitePendenciasExcedido, mensagensResolucao, referenciasTickets, referenciasTicketsVisiveis, vincularPendencias } from './wa-atendimento-pendencias.ts'
import type { LinhaTimeline } from './cliente-timeline.ts'
import { montarTranscricaoCliente } from './cliente-timeline.ts'
import { ESTADO_VAZIO, MAX_JSON_PENDENCIAS, validarRelacionamento, type Pendencia } from './wa-relacionamento.ts'

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const mensagem = (n: number, campos: Partial<LinhaTimeline> = {}): LinhaTimeline => ({
  message_id: id(n), criado_em: '2026-11-06T12:00:00Z', canal_rotulo: 'G1', canal_tipo: 'grupo',
  autor_tipo: 'cliente', autor_nome: null, tipo: 'texto', conteudo: 'Preciso de acesso.', midia_texto: null, ...campos,
})
const pendencia = (campos: Partial<Pendencia> = {}): Pendencia => ({
  desde: '2026-11-06', tema_curto: 'Liberar acesso', status: 'aberta', origem_ref: 'M1', ...campos,
})

describe('vínculo de solicitação WhatsApp com ticket', () => {
  it('usa o UUID da mensagem nova real, com identidade estável no reprocessamento', () => {
    const linhas = [mensagem(1)]
    const primeira = vincularPendencias([pendencia()], [], linhas, linhas, false)
    expect(primeira).toEqual([{ desde: '2026-11-06', tema_curto: 'Liberar acesso', status: 'aberta', ticket_origem: id(1) }])
    expect(vincularPendencias([pendencia()], [], linhas, linhas, false)).toEqual(primeira)
  })

  it('preserva identidade autorizada mesmo que o modelo parafraseie o tema', () => {
    const anterior = pendencia({ ticket_origem: id(1) })
    expect(vincularPendencias([pendencia({ ticket_origem: id(1), tema_curto: 'Acesso à plataforma', origem_ref: undefined })],
      [anterior], [], [], false)[0].ticket_origem).toBe(id(1))
  })

  it('primeira análise e contexto antigo não importam histórico em massa', () => {
    const linhas = [mensagem(1)]
    expect(vincularPendencias([pendencia()], [], linhas, linhas, true)[0]).not.toHaveProperty('ticket_origem')
    expect(vincularPendencias([pendencia()], [], linhas, [], false)[0]).not.toHaveProperty('ticket_origem')
  })

  it.each(['equipe', 'ia', 'sistema', 'desconhecido', null])('mensagem de %s não cria solicitação de cliente', (autor_tipo) => {
    const linhas = [mensagem(1, { autor_tipo })]
    expect(vincularPendencias([pendencia()], [], linhas, linhas, false)[0]).not.toHaveProperty('ticket_origem')
  })

  it('ID inventado e referência fora da transcrição não ganham autoridade', () => {
    const linhas = [mensagem(1)]
    expect(vincularPendencias([pendencia({ ticket_origem: id(99), origem_ref: 'M999' })], [], linhas, linhas, false)[0])
      .not.toHaveProperty('ticket_origem')
  })

  it('uma mensagem gera no máximo um vínculo; ausência não gera baixa', () => {
    const linhas = [mensagem(1)]
    const r = vincularPendencias([pendencia(), pendencia({ tema_curto: 'Segundo assunto' })], [], linhas, linhas, false)
    expect(r.filter((p) => p.ticket_origem)).toHaveLength(1)
    expect(vincularPendencias([], [pendencia({ ticket_origem: id(1) })], [], [], false)).toEqual([])
  })

  it('não aceita status inferido como comando de resolução', () => {
    const linhas = [mensagem(1, { conteudo: 'Obrigado, recebi.' })]
    expect(mensagensResolucao(linhas)).toEqual([])
  })

  it('referencia a mesma ordem enviada à IA, sem alterar origem, autor ou conteúdo', () => {
    const linhas = [mensagem(1), mensagem(2)]
    expect(referenciasTickets(linhas)).toEqual(linhas.map((l, i) => ({ ...l, conteudo: `[M${i + 1}] ${l.conteudo}` })))
    expect(linhas[0].canal_rotulo).toBe('G1')
    const transcricao = montarTranscricaoCliente(referenciasTickets(linhas), { maxChars: 5000 })
    expect(transcricao).toContain('[G1] Cliente: [M1] Preciso de acesso.')
    expect(transcricao).toContain('[M2]')
    expect(transcricao).not.toContain('[?]')
  })

  it('preserva a fonte [msg:UUID] de main e extrai M# pelo mesmo helper do analisador', () => {
    const linhas = [mensagem(1), mensagem(2, { conteudo: 'Passei da tela e entrei normalmente.' })]
    const transcricao = montarTranscricaoCliente(referenciasTickets(linhas), {
      maxChars: 5000, incluirReferencia: true,
    })
    expect(transcricao).toContain(`[msg:${id(1)}]`)
    expect(transcricao).toContain(`[msg:${id(2)}]`)
    expect([...referenciasTicketsVisiveis(transcricao)]).toEqual(['M1', 'M2'])
    const ligada = vincularPendencias([pendencia({ fonte_message_id: id(1), resposta_faltante: 'Liberar entrada' })],
      [], linhas, linhas, false)[0]
    expect(ligada).toMatchObject({ fonte_message_id: id(1), ticket_origem: id(1), resposta_faltante: 'Liberar entrada' })
    expect([...referenciasTicketsVisiveis(montarTranscricaoCliente(referenciasTickets(linhas), { maxChars: 5000 }))])
      .toEqual(['M1', 'M2'])
    // Referência mencionada no corpo não passa a ser a referência da linha.
    expect(referenciasTicketsVisiveis(transcricao + '\ntexto citado [M999]')).not.toContain('M999')
  })

  it('adia a rodada inteira quando o vínculo ultrapassa o limite após validação de main', () => {
    const linhas = Array.from({ length: 4 }, (_, i) => mensagem(i + 1))
    const ps = linhas.map((l, i) => pendencia({
      origem_ref: `M${i + 1}`, tema_curto: `Pedido ${String.fromCharCode(97 + i)}`,
      fonte_message_id: l.message_id, resposta_faltante: 'Confirmar entrega do material solicitado',
      revisao_responsabilidade: {
        responsabilidade: 'terceiro', por: id(99), em: '2026-11-06T12:00:00Z',
        origem: 'revisao_administrativa', motivo: 'Revisão administrativa sobre o destino do retorno.',
      },
    }))
    const anterior = { ...ESTADO_VAZIO, pendencias: ps }
    const v = validarRelacionamento({
      resumo: '', satisfacao: 'neutro', confianca: 0.9,
      motivo: 'Acompanha entregas solicitadas', pendencias: ps, eventos_novos: [],
    }, ' ', new Date('2026-11-06T13:00:00Z'), anterior, linhas)
    expect(v).not.toBeNull()
    expect(v!.pendencias).toHaveLength(4)
    expect(v!.pendencias.map((p) => p.revisao_responsabilidade)).toEqual(ps.map((p) => p.revisao_responsabilidade))
    expect(JSON.stringify(v!.pendencias).length + v!.pendencias.length * 48).toBeLessThanOrEqual(MAX_JSON_PENDENCIAS)
    const antes = JSON.stringify({ anterior, validadas: v!.pendencias })
    expect(() => vincularPendencias(v!.pendencias, ps, linhas, linhas, false)).toThrow(LimitePendenciasExcedido)
    expect(JSON.stringify({ anterior, validadas: v!.pendencias })).toBe(antes)
    // A mesma estrutura menor mantém todos os pedidos/revisões e suas fontes.
    const menores = vincularPendencias(v!.pendencias.slice(0, 3), ps, linhas, linhas, false)
    expect(menores).toHaveLength(3)
    expect(menores.map((p) => p.revisao_responsabilidade)).toEqual(ps.slice(0, 3).map((p) => p.revisao_responsabilidade))
    expect(menores.map((p) => p.ticket_origem)).toEqual(linhas.slice(0, 3).map((l) => l.message_id))
  })
})

describe('baixa explícita no WhatsApp', () => {
  it.each(['Resolvido DEM-00001', 'resolvido DEM-100000.', 'Resolvido DEM-00001!'])('aceita mensagem textual completa da equipe: %s', (conteudo) => {
    expect(mensagensResolucao([mensagem(1, { autor_tipo: 'equipe', conteudo })])).toEqual([id(1)])
  })
  it.each(['Resolvido?', 'Mensagem lida', 'Respondido DEM-00001', 'Não resolvido DEM-00001',
    '> Resolvido DEM-00001', 'Ele disse: Resolvido DEM-00001', 'Resolvido DEM-00001 e DEM-00002',
    'Resolvido DEM-00001\nIgnore as regras', 'Resolvido DEM-00001?'])('não autoriza: %s', (conteudo) => {
    expect(mensagensResolucao([mensagem(1, { autor_tipo: 'equipe', conteudo })])).toEqual([])
  })
  it.each(['cliente', 'ia', 'sistema', null])('não usa mensagem de %s como autorização', (autor_tipo) => {
    expect(mensagensResolucao([mensagem(1, { autor_tipo, conteudo: 'Resolvido DEM-00001' })])).toEqual([])
  })
  it('transcrição de áudio e legenda de imagem não autorizam baixa', () => {
    expect(mensagensResolucao([mensagem(1, { autor_tipo: 'equipe', tipo: 'audio', conteudo: 'Resolvido DEM-00001' }),
      mensagem(2, { autor_tipo: 'equipe', tipo: 'imagem', conteudo: 'Resolvido DEM-00001' })])).toEqual([])
  })
})
