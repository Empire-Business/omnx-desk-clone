// Rodapé "como falar com o assistente" no relatório diário: quem recebe e se ele
// sai LITERAL (a IA não consegue reescrever, tirar nem duplicar).
import { describe, expect, it } from 'vitest'
import { type InfoComoFalar, carregarInfoComoFalar, comoFalarPara } from './wa-agente-rodape.ts'
import { rodapesGrupo, rodapesPrivado } from './wa-agente-como-chamar.ts'
import { type DadosRelatorio, comoFalarSeguro, montarTextoRelatorio, pedidoHumanizacaoRelatorio, pedidoHumanizacaoRelatorioGrupo } from './wa-relatorio.ts'
import { humanizarTexto, mascarar, montarFallback, validarTexto, type ChamadaIa } from './wa-humanizar.ts'
import { chaveTelefone } from './telefone.ts'
import { criarSupabaseFalso } from './teste-supabase-falso.ts'
import { pedidoBoasVindas } from './wa-agente-admin-acoes.ts'

const GRUPO = '120363000000000001@g.us'
const info: InfoComoFalar = {
  nome: 'Ana', nomeContato: 'Ana Suporte', privado: true, grupos: true,
  membros: new Set([chaveTelefone('+5511911112222')]),
  gruposLiberados: new Map([[GRUPO, '+5511951979967']]),
}
const zero = () => 0

describe('comoFalarPara', () => {
  it('membro ativo no privado recebe o rodapé do privado (com ou sem o 9º dígito)', () => {
    expect(comoFalarPara(info, { tipo: 'pessoa', destino: '+5511911112222' }, zero)).toBe('Dúvidas? É só me responder aqui.')
    expect(comoFalarPara(info, { tipo: 'pessoa', destino: '+551111112222' }, zero)).toBe('Dúvidas? É só me responder aqui.')
  })
  it('gestor que não é membro, privado desligado ou assistente desligado → sem rodapé', () => {
    expect(comoFalarPara(info, { tipo: 'pessoa', destino: '+5511900000000' })).toBeNull()
    expect(comoFalarPara({ ...info, privado: false }, { tipo: 'pessoa', destino: '+5511911112222' })).toBeNull()
    expect(comoFalarPara(null, { tipo: 'pessoa', destino: '+5511911112222' })).toBeNull()
  })
  it('grupo liberado recebe o rodapé do grupo com @contato e final do número principal', () => {
    const r = comoFalarPara(info, { tipo: 'grupo', destino: GRUPO }, zero)
    expect(r).toBe('Para falar comigo aqui, marque @Ana Suporte (digite @ e escolha o contato final 9967) ou responda a esta mensagem. Também funciona começar com "Ana,"')
  })
  it('grupo não liberado ou grupos desligados → sem rodapé', () => {
    expect(comoFalarPara(info, { tipo: 'grupo', destino: '120363000000000002@g.us' })).toBeNull()
    expect(comoFalarPara({ ...info, grupos: false }, { tipo: 'grupo', destino: GRUPO })).toBeNull()
  })
})

describe('carregarInfoComoFalar', () => {
  it('assistente desligado → null; ligado → membros e grupos com o número principal', async () => {
    const T = 't1'
    const tabelas = {
      wa_auto_config: [{ tenant_id: T, agente_ativo: true, agente_nome: 'Ana', agente_nome_contato: null, agente_privado: true, agente_grupos: true }],
      wa_agente_membros: [{ tenant_id: T, telefone: '+5511911112222', ativo: true }, { tenant_id: T, telefone: '+5511933334444', ativo: false }],
      wa_agente_grupos: [{ id: 'g1', tenant_id: T, grupo_jid: GRUPO, ativo: true }],
      wa_agente_grupo_numeros: [
        { tenant_id: T, grupo_id: 'g1', instance_uuid: 'i2', ordem: 2 },
        { tenant_id: T, grupo_id: 'g1', instance_uuid: 'i1', ordem: 1 },
      ],
      whatsapp_instances: [{ id: 'i1', tenant_id: T, numero_whatsapp: '+5511951979967' }, { id: 'i2', tenant_id: T, numero_whatsapp: '+5511900001111' }],
    }
    const f = criarSupabaseFalso(tabelas)
    const r = await carregarInfoComoFalar(f.client, T)
    expect(r?.membros.size).toBe(1)
    expect(r?.gruposLiberados.get(GRUPO)).toBe('+5511951979967')
    for (const c of f.consultas) expect(c.filtros).toContain('eq:tenant_id')
    tabelas.wa_auto_config[0].agente_ativo = false
    expect(await carregarInfoComoFalar(criarSupabaseFalso(tabelas).client, T)).toBeNull()
    expect(await carregarInfoComoFalar(criarSupabaseFalso({}).client, T)).toBeNull()
  })
})

const dados: DadosRelatorio = {
  data: '26/10/2026',
  alertas: { sem_resposta: [{ cliente: 'Jane Fernandes', detalhe: 'esperando há 6h' }] },
  reunioes: [{ hora: '10:00', cliente: 'João Prado' }],
  linkPainel: 'https://app.omnx.com/automacoes-wa/alertas',
}

describe('relatório com rodapé', () => {
  const rodapePriv = rodapesPrivado()[0]
  const rodapeGrupo = rodapesGrupo({ nome: 'Ana', nomeContato: 'Ana Suporte', telefoneNumero: '+5511951979967' })[0]

  it('comoFalarSeguro aceita os rodapés e recusa texto estranho', () => {
    for (const r of [...rodapesPrivado(), ...rodapesGrupo({ nome: 'Ana', telefoneNumero: '+5511951979967' })]) expect(comoFalarSeguro(r)).toBe(r)
    expect(comoFalarSeguro('a {{x}}')).toBeNull()
    expect(comoFalarSeguro('a\nb\nc')).toBeNull()
    expect(comoFalarSeguro('x'.repeat(401))).toBeNull()
  })
  it('texto sem humanização termina com o rodapé', () => {
    expect(montarTextoRelatorio('Bruno', { ...dados, comoFalar: rodapePriv }).endsWith(`\n\n${rodapePriv}`)).toBe(true)
    expect(montarTextoRelatorio('Bruno', dados)).not.toContain(rodapePriv)
  })
  it('na humanização o rodapé vai como bloco [COMO_FALAR] (a IA não vê o texto)', () => {
    const p = pedidoHumanizacaoRelatorioGrupo({ ...dados, comoFalar: rodapeGrupo }, 'manha', zero)
    const m = mascarar(p)
    expect(m).not.toBeNull()
    expect(m!.texto).toContain('[COMO_FALAR]')
    expect(m!.texto).not.toContain('marque @')
    expect(p.textoBase.endsWith(rodapeGrupo)).toBe(true)
  })
  it('IA que mantém [COMO_FALAR] → texto final com o rodapé literal', async () => {
    const pedido = pedidoHumanizacaoRelatorio('Bruno', { ...dados, comoFalar: rodapePriv }, 'manha', zero)
    const m = mascarar(pedido)!
    // IA "boa": troca só a saudação.
    const chamarIa: ChamadaIa = async () => JSON.stringify({ texto: m.texto.replace(/^\*Aviso diário — \[DATA\]\*\nBom dia, \[GESTOR\]!/, '*Aviso diário — [DATA]*\nOi, [GESTOR], bom dia!') })
    const r = await humanizarTexto(pedido, { chamarIa, prazoMs: 10_000, memoria: new Map() })
    expect(r.origem).toBe('ia')
    expect(r.texto.endsWith(rodapePriv)).toBe(true)
    expect(r.texto.split(rodapePriv)).toHaveLength(2)
  })
  it('IA que reescreve, tira ou duplica o rodapé é recusada → fallback com o rodapé literal', async () => {
    const pedido = pedidoHumanizacaoRelatorio('Bruno', { ...dados, comoFalar: rodapePriv }, 'manha', zero)
    const m = mascarar(pedido)!
    for (const ruim of [
      m.texto.replace('[COMO_FALAR]', 'Qualquer coisa me chama!'),
      m.texto.replace('[COMO_FALAR]', ''),
      `${m.texto}\n\n[COMO_FALAR]`,
      m.texto.replace('\n\n[COMO_FALAR]', ' [COMO_FALAR]'),
    ]) {
      const r = await humanizarTexto(pedido, { chamarIa: async () => JSON.stringify({ texto: ruim }), prazoMs: 10_000, memoria: new Map() })
      expect(r.origem).toBe('fallback')
      expect(r.texto.endsWith(rodapePriv)).toBe(true)
      expect(r.texto.split(rodapePriv)).toHaveLength(2)
    }
  })
  it('fallback do grupo também valida e termina com o rodapé', () => {
    const p = pedidoHumanizacaoRelatorioGrupo({ ...dados, comoFalar: rodapeGrupo }, 'tarde')
    for (let i = 0; i < 10; i++) {
      const fb = montarFallback(p)
      expect(validarTexto(fb.texto, p, { modo: 'fallback' }).ok).toBe(true)
      expect(fb.texto.endsWith(rodapeGrupo)).toBe(true)
    }
  })
})

describe('boas-vindas', () => {
  it('pedido com exemplos e "como chamar" como blocos literais; fallback válido', () => {
    for (const canal of ['privado', 'grupo'] as const) {
      const p = pedidoBoasVindas(canal, { nome: 'Ana', nomeContato: 'Ana Suporte', telefoneNumero: '+5511951979967' }, 'manha')
      const m = mascarar(p)
      expect(m).not.toBeNull()
      expect(m!.texto).toContain('[EXEMPLOS]')
      expect(m!.texto).toContain('[COMO_FALAR]')
      const fb = montarFallback(p)
      expect(validarTexto(fb.texto, p, { modo: 'fallback' }).ok).toBe(true)
      expect(fb.texto).toContain('"Quais clientes precisam de atenção hoje?"')
      expect(fb.texto).not.toMatch(/reuni[ãõ]|agend/i)
      if (canal === 'grupo') expect(fb.texto).toContain('marque @Ana Suporte')
    }
  })
})
