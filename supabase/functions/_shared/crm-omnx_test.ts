// Ponte Desk <-> CRM OMNX: partes puras. Rodar com:
//   deno test --no-lock --deny-net supabase/functions/_shared/crm-omnx_test.ts
import assert from 'node:assert/strict'
import {
  assinarCrm,
  CLOSER_EMAIL_PADRAO,
  dataValida,
  ERRO_CLIENTE_AMBIGUO,
  ERRO_CLIENTE_NAO_ENCONTRADO,
  headersAssinadosCrm,
  hmacCrm,
  igualTempoConstante,
  interpretarRespostaCrm,
  montarEventoDesk,
  resumoContrato,
  tipoEventoVenda,
  urlReceptorValida,
  validarEventoCrm,
  vendaCrmParaColunas,
  verificarAssinaturaCrm,
  type LinhaContratoDesk,
  type LinhaVendaDesk,
} from './crm-omnx.ts'

const SEGREDO = 'segredo-compartilhado-do-par-'.padEnd(40, 'x')
const UUID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

Deno.test('HMAC: WebCrypto confere com o vetor RFC 4231 e hmacCrm assina "<ts>.<corpo>"', async () => {
  const enc = new TextEncoder()
  const hmacHex = async (k: string, m: string) => {
    const key = await crypto.subtle.importKey('raw', enc.encode(k), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(m)))).map((b) => b.toString(16).padStart(2, '0')).join('')
  }
  // RFC 4231, caso 2.
  assert.equal(await hmacHex('Jefe', 'what do ya want for nothing?'), '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843')
  assert.equal(await hmacCrm(SEGREDO, '1763564400', '{"a":1}'), await hmacHex(SEGREDO, '1763564400.{"a":1}'))
})

Deno.test('assinatura: formato sha256=<hex> sobre "<ts>.<corpo cru>"', async () => {
  const s = await assinarCrm(SEGREDO, 1763564400, '{"a":1}')
  assert.match(s, /^sha256=[0-9a-f]{64}$/)
  assert.equal(s, `sha256=${await hmacCrm(SEGREDO, '1763564400', '{"a":1}')}`)
  // Mudar um byte do corpo muda a assinatura.
  assert.notEqual(s, await assinarCrm(SEGREDO, 1763564400, '{"a":2}'))
})

Deno.test('verificação: válida, segredo errado, corpo adulterado, fora da janela e sem headers', async () => {
  const agora = 1_763_564_400_000
  const ts = String(agora / 1000)
  const corpo = '{"event_id":"x"}'
  const sig = await assinarCrm(SEGREDO, ts, corpo)
  assert.deepEqual(await verificarAssinaturaCrm(SEGREDO, { timestamp: ts, signature: sig, rawBody: corpo, nowMs: agora }), { ok: true })
  assert.deepEqual(await verificarAssinaturaCrm(SEGREDO, { timestamp: ts, signature: sig.toUpperCase().replace('SHA256=', 'sha256='), rawBody: corpo, nowMs: agora }), { ok: true })
  assert.deepEqual(await verificarAssinaturaCrm('z'.repeat(40), { timestamp: ts, signature: sig, rawBody: corpo, nowMs: agora }), { ok: false, code: 'invalid_signature' })
  assert.deepEqual(await verificarAssinaturaCrm(SEGREDO, { timestamp: ts, signature: sig, rawBody: corpo + ' ', nowMs: agora }), { ok: false, code: 'invalid_signature' })
  assert.deepEqual(await verificarAssinaturaCrm(SEGREDO, { timestamp: ts, signature: sig, rawBody: corpo, nowMs: agora + 301_000 }), { ok: false, code: 'stale_timestamp' })
  assert.deepEqual(await verificarAssinaturaCrm(SEGREDO, { timestamp: ts, signature: sig, rawBody: corpo, nowMs: agora - 301_000 }), { ok: false, code: 'stale_timestamp' })
  assert.deepEqual(await verificarAssinaturaCrm(SEGREDO, { timestamp: ts, signature: sig, rawBody: corpo, nowMs: agora + 300_000 }), { ok: true })
  assert.deepEqual(await verificarAssinaturaCrm(SEGREDO, { timestamp: 'abc', signature: sig, rawBody: corpo, nowMs: agora }), { ok: false, code: 'stale_timestamp' })
  assert.deepEqual(await verificarAssinaturaCrm(SEGREDO, { timestamp: null, signature: sig, rawBody: corpo, nowMs: agora }), { ok: false, code: 'missing_headers' })
  assert.deepEqual(await verificarAssinaturaCrm(SEGREDO, { timestamp: ts, signature: null, rawBody: corpo, nowMs: agora }), { ok: false, code: 'missing_headers' })
})

Deno.test('headers assinados de saída conferem no verificador', async () => {
  const agora = 1_763_564_400_123
  const corpo = JSON.stringify({ a: 'ç' })
  const h = await headersAssinadosCrm(SEGREDO, corpo, agora)
  assert.equal(h['X-OMNX-Timestamp'], '1763564400')
  assert.deepEqual(
    await verificarAssinaturaCrm(SEGREDO, { timestamp: h['X-OMNX-Timestamp'], signature: h['X-OMNX-Signature'], rawBody: corpo, nowMs: agora }),
    { ok: true },
  )
})

Deno.test('igualTempoConstante', () => {
  assert.equal(igualTempoConstante('abc', 'abc'), true)
  assert.equal(igualTempoConstante('abc', 'abd'), false)
  assert.equal(igualTempoConstante('abc', 'abcd'), false)
  assert.equal(igualTempoConstante('', ''), true)
})

const eventoCrm = (venda: Record<string, unknown> = {}) => ({
  event_id: UUID(1),
  event: 'crm.venda.sincronizada',
  crm_tenant_id: UUID(2),
  crm_venda_id: UUID(3),
  crm_oportunidade_id: UUID(4),
  versao: 3,
  venda: {
    status: 'won',
    ganha_em: '2026-11-19T15:00:00Z',
    valor_total: 12000,
    produto_nome: 'Acelerador',
    closer_nome: 'Larissa',
    closer_email: 'Larissa@Exemplo.com',
    cliente: {
      nome: ' Maria Silva ', razao_social: null, cpf_cnpj: '123.456.789-09', email: 'MARIA@x.com',
      whatsapp: '(11) 99999-9999', instagram: null, cep: '01001-000', logradouro: 'Praça da Sé',
      numero: '1', complemento: null, bairro: 'Sé', municipio: 'São Paulo', uf: 'sp',
    },
    pagador: { diferente: false, nome: 'ignorado', cpf_cnpj: null, relacao: null },
    pagamentos: [
      { data: '2026-11-19', valor: 2000, forma: 'pix', plataforma: null, sinal: null },
      { data: '2026-12-19', valor: 5000, forma: 'boleto', plataforma: 'Asaas', sinal: null },
      { data: '2027-01-19', valor: 5000, forma: 'boleto', plataforma: 'Asaas', sinal: null },
    ],
    observacoes: null,
    contrato: { status: 'signed', link: 'https://app.clicksign.com/x', assinado_em: '2026-11-19' },
    ...venda,
  },
})

Deno.test('validarEventoCrm: aceita o exemplo do contrato e normaliza', () => {
  const r = validarEventoCrm(eventoCrm())
  assert.equal(r.ok, true)
  if (!r.ok) return
  assert.equal(r.evento.venda.cliente.nome, 'Maria Silva')
  assert.equal(r.evento.venda.cliente.cpf_cnpj, '12345678909')
  assert.equal(r.evento.venda.cliente.email, 'maria@x.com')
  assert.equal(r.evento.venda.cliente.uf, 'SP')
  assert.equal(r.evento.venda.closer_email, 'larissa@exemplo.com')
  assert.deepEqual(r.evento.venda.contrato, { status: 'signed', link: 'https://app.clicksign.com/x', assinado_em: '2026-11-19' })
})

Deno.test('validarEventoCrm: recusa payload inválido com motivo legível', () => {
  const inv = (erro: string) => ({ ok: false, erro, codigo: 'invalid_payload' })
  assert.deepEqual(validarEventoCrm(null), inv('event_id inválido'))
  assert.deepEqual(validarEventoCrm({ ...eventoCrm(), event: 'outro' }), inv('event não suportado'))
  assert.deepEqual(validarEventoCrm({ ...eventoCrm(), crm_venda_id: 'x' }), inv('crm_venda_id inválido'))
  assert.deepEqual(validarEventoCrm({ ...eventoCrm(), desk_venda_id: 'x' }), inv('desk_venda_id inválido'))
  assert.deepEqual(validarEventoCrm(eventoCrm({ cliente: { nome: '  ' } })), inv('venda.cliente.nome obrigatório'))
  assert.deepEqual(validarEventoCrm(eventoCrm({ pagamentos: [{ data: '2026-11-19', valor: 0 }] })), inv('venda.pagamentos[0].valor inválido'))
  assert.deepEqual(validarEventoCrm(eventoCrm({ pagamentos: 'x' })), inv('venda.pagamentos deve ser lista'))
})

Deno.test('validarEventoCrm: data impossível vira 400 data_invalida (nunca 500 no banco)', () => {
  const ruim = (erro: string) => ({ ok: false, erro, codigo: 'data_invalida' })
  assert.deepEqual(validarEventoCrm(eventoCrm({ pagamentos: [{ data: 'ontem', valor: 1 }] })), ruim('venda.pagamentos[0].data inválida'))
  assert.deepEqual(validarEventoCrm(eventoCrm({ pagamentos: [{ data: '2026-02-30', valor: 1 }] })), ruim('venda.pagamentos[0].data inválida'))
  assert.deepEqual(validarEventoCrm(eventoCrm({ ganha_em: '2026-13-01T00:00:00Z' })), ruim('venda.ganha_em inválida'))
  assert.deepEqual(validarEventoCrm(eventoCrm({ contrato: { status: 'signed', link: 'https://x', assinado_em: '2026-02-30' } })), ruim('venda.contrato.assinado_em inválida'))
  assert.equal(dataValida('2028-02-29'), true)
  assert.equal(dataValida('2026-02-29'), false)
  assert.equal(validarEventoCrm(eventoCrm({ ganha_em: null, contrato: null })).ok, true)
})

Deno.test('validarEventoCrm: desk_venda_id (v1.1) é opcional e passa adiante', () => {
  const com = validarEventoCrm({ ...eventoCrm(), desk_venda_id: UUID(9) })
  assert.ok(com.ok)
  if (com.ok) assert.equal(com.evento.desk_venda_id, UUID(9))
  const sem = validarEventoCrm(eventoCrm())
  assert.ok(sem.ok)
  if (sem.ok) assert.equal(sem.evento.desk_venda_id, null)
})

Deno.test('vendaCrmParaColunas: pagador null não manda as chaves do pagador', () => {
  const r = validarEventoCrm(eventoCrm({ pagador: null }))
  assert.ok(r.ok)
  if (!r.ok) return
  assert.equal(r.evento.venda.pagador, null)
  const c = vendaCrmParaColunas(r.evento.venda)
  for (const k of ['pagador_diferente', 'pagador_nome', 'pagador_cpf_cnpj', 'pagador_relacao']) {
    assert.equal(k in c, false, k)
  }
  const outro = validarEventoCrm(eventoCrm({ pagador: { diferente: true, nome: 'João', cpf_cnpj: '1', relacao: 'pai' } }))
  assert.ok(outro.ok)
  if (!outro.ok) return
  const c2 = vendaCrmParaColunas(outro.evento.venda)
  assert.deepEqual(
    [c2.pagador_diferente, c2.pagador_nome, c2.pagador_cpf_cnpj, c2.pagador_relacao],
    [true, 'João', '1', 'pai'],
  )
})

Deno.test('vendaCrmParaColunas: formato de pagamentos do formulário, telefone E.164 e pagador', () => {
  const r = validarEventoCrm(eventoCrm())
  assert.ok(r.ok)
  if (!r.ok) return
  const c = vendaCrmParaColunas(r.evento.venda)
  assert.equal(c.cliente_whatsapp, '+5511999999999')
  assert.equal(c.valor_total_venda, 12000)
  assert.deepEqual(c.pagamentos, [
    { data: '2026-11-19', valor: 2000, forma: 'pix', plataforma: 'CRM', sinal: 'Entrada' },
    { data: '2026-12-19', valor: 5000, forma: 'boleto', plataforma: 'Asaas', sinal: 'Parcela 1' },
    { data: '2027-01-19', valor: 5000, forma: 'boleto', plataforma: 'Asaas', sinal: 'Parcela 2' },
  ])
  // Pagador igual ao cliente: campos do pagador vão vazios.
  assert.equal(c.pagador_diferente, false)
  assert.equal(c.pagador_nome, null)
})

Deno.test('vendaCrmParaColunas: closer ausente fica nulo (o banco aplica CRM / crm@omnx.pro na criação)', () => {
  const r = validarEventoCrm(eventoCrm({ closer_nome: null, closer_email: undefined, valor_total: null, pagamentos: [] }))
  assert.ok(r.ok)
  if (!r.ok) return
  const c = vendaCrmParaColunas(r.evento.venda)
  assert.equal(c.closer_nome, null)
  assert.equal(c.closer_email, null)
  assert.equal(c.pagamentos, null)
  assert.equal(c.valor_total_venda, null)
  assert.equal(CLOSER_EMAIL_PADRAO, 'crm@omnx.pro')
})

Deno.test('vendaCrmParaColunas: sem valor_total soma os pagamentos', () => {
  const r = validarEventoCrm(eventoCrm({ valor_total: null }))
  assert.ok(r.ok)
  if (!r.ok) return
  assert.equal(vendaCrmParaColunas(r.evento.venda).valor_total_venda, 12000)
})

const linhaVenda = (extra: Partial<LinhaVendaDesk> = {}): LinhaVendaDesk => ({
  id: UUID(10),
  tenant_id: '00000000-0000-0000-0000-000000000001',
  status: 'pendente',
  criado_em: '2026-11-19T12:00:00.000Z',
  closer_nome: 'Larissa',
  closer_email: 'Larissa@exemplo.com',
  cliente_nome: 'Maria Silva',
  cliente_razao_social: '',
  cliente_cpf_cnpj: '123.456.789-09',
  cliente_email: 'maria@x.com',
  cliente_whatsapp: '+55 11 99999-9999',
  cliente_instagram: null,
  cliente_endereco: 'Rua Antiga, 10',
  cliente_cep: null,
  cliente_logradouro: null,
  cliente_numero: null,
  cliente_complemento: null,
  cliente_bairro: null,
  cliente_municipio: null,
  cliente_uf: 'sp',
  produto_nome: 'Acelerador',
  valor_total_venda: '24000.00',
  pagamentos: [
    { data: '2026-11-19', valor: 4000, forma: 'pix', plataforma: 'Asaas', sinal: 'Entrada' },
    { data: '2026-12-19', valor: 20000, forma: 'cartão', plataforma: 'Asaas', sinal: 'Parcela 1' },
    { data: 'lixo', valor: 1 },
  ],
  observacoes: null,
  pagador_diferente: true,
  pagador_nome: 'João',
  pagador_cpf_cnpj: '11.222.333/0001-81',
  pagador_relacao: 'sócio',
  crm_venda_id: null,
  ...extra,
})

const contratoRascunho: LinhaContratoDesk = {
  id: UUID(20), status: 'rascunho', status_secundario: 'Não iniciado', link_clicksign: null, data_assinatura: null,
}

Deno.test('montarEventoDesk: desk.venda.registrada com a forma comum da venda', () => {
  const ev = montarEventoDesk({
    tipo: 'desk.venda.registrada',
    venda: linhaVenda(),
    contrato: contratoRascunho,
    eventId: UUID(30),
    occurredAt: new Date('2026-11-19T15:00:00Z'),
  })
  assert.equal(ev.event, 'desk.venda.registrada')
  assert.equal(ev.event_id, UUID(30))
  assert.equal(ev.desk_tenant_id, '00000000-0000-0000-0000-000000000001')
  assert.equal(ev.desk_venda_id, UUID(10))
  assert.equal(ev.desk_contrato_id, UUID(20))
  assert.equal(ev.crm_venda_id, null)
  assert.equal(ev.occurred_at, '2026-11-19T15:00:00.000Z')
  assert.equal(ev.venda.status, 'pendente')
  assert.equal(ev.venda.ganha_em, '2026-11-19T12:00:00.000Z')
  assert.equal(ev.venda.valor_total, 24000)
  assert.equal(ev.venda.closer_email, 'larissa@exemplo.com')
  assert.deepEqual(ev.venda.cliente, {
    nome: 'Maria Silva', razao_social: null, cpf_cnpj: '12345678909', email: 'maria@x.com',
    whatsapp: '+5511999999999', instagram: null, cep: null, logradouro: 'Rua Antiga, 10',
    numero: null, complemento: null, bairro: null, municipio: null, uf: 'SP',
  })
  assert.deepEqual(ev.venda.pagador, { diferente: true, nome: 'João', cpf_cnpj: '11222333000181', relacao: 'sócio' })
  assert.equal(ev.venda.pagamentos.length, 2) // linha sem data válida fica de fora
  assert.deepEqual(ev.venda.contrato, { status: 'preparing', link: null, assinado_em: null })
  assert.deepEqual(ev.contrato, { id: UUID(20), status: 'rascunho', status_secundario: 'Não iniciado', link_clicksign: null, data_assinatura: null })
})

Deno.test('montarEventoDesk: contrato assinado vira signed; sem contrato vai null', () => {
  const assinado: LinhaContratoDesk = { ...contratoRascunho, status: 'ativo', link_clicksign: 'https://clicksign/x', data_assinatura: '2026-11-20' }
  const ev = montarEventoDesk({ tipo: 'desk.contrato.atualizado', venda: linhaVenda({ crm_venda_id: UUID(3) }), contrato: assinado, eventId: UUID(31), occurredAt: new Date() })
  assert.equal(ev.crm_venda_id, UUID(3))
  assert.deepEqual(ev.venda.contrato, { status: 'signed', link: 'https://clicksign/x', assinado_em: '2026-11-20' })
  assert.equal(ev.contrato?.data_assinatura, '2026-11-20')
  const semContrato = montarEventoDesk({ tipo: 'desk.venda.atualizada', venda: linhaVenda({ valor_total_venda: null }), contrato: null, eventId: UUID(32), occurredAt: new Date() })
  assert.equal(semContrato.desk_contrato_id, null)
  assert.equal(semContrato.contrato, null)
  assert.equal(semContrato.venda.contrato, null)
  assert.equal(semContrato.venda.valor_total, 24000) // soma dos pagamentos válidos
  // Contrato fechado fora do Clicksign: só a data já conta como assinado.
  assert.equal(resumoContrato({ ...contratoRascunho, data_assinatura: '2026-11-21' })?.status, 'signed')
})

Deno.test('ida e volta: venda do Desk -> forma comum -> colunas preserva os dados', () => {
  const ev = montarEventoDesk({ tipo: 'desk.venda.registrada', venda: linhaVenda(), contrato: null, eventId: UUID(33), occurredAt: new Date() })
  const c = vendaCrmParaColunas(ev.venda)
  assert.equal(c.cliente_nome, 'Maria Silva')
  assert.equal(c.cliente_whatsapp, '+5511999999999')
  assert.equal(c.valor_total_venda, 24000)
  assert.equal(c.pagador_nome, 'João')
  assert.deepEqual((c.pagamentos as Array<{ sinal: string }>).map((p) => p.sinal), ['Entrada', 'Parcela 1'])
})

Deno.test('tipoEventoVenda', () => {
  assert.equal(tipoEventoVenda('desk.venda.registrada', true), 'desk.venda.registrada')
  assert.equal(tipoEventoVenda(undefined, false), 'desk.venda.registrada')
  assert.equal(tipoEventoVenda('qualquer', true), 'desk.venda.atualizada')
})

Deno.test('interpretarRespostaCrm: aplicado, sem cliente, ambíguo e erro HTTP', () => {
  assert.deepEqual(interpretarRespostaCrm(200, { ok: true, status: 'applied', crm_venda_id: UUID(3) }), { sincronizado: true, erro: null, crmVendaId: UUID(3) })
  assert.deepEqual(interpretarRespostaCrm(200, { ok: true, status: 'duplicate', crm_venda_id: null }), { sincronizado: true, erro: null, crmVendaId: null })
  assert.deepEqual(interpretarRespostaCrm(200, { ok: true, status: 'unmatched' }), { sincronizado: false, erro: ERRO_CLIENTE_NAO_ENCONTRADO, crmVendaId: null })
  assert.deepEqual(interpretarRespostaCrm(200, { ok: true, status: 'ambiguous' }), { sincronizado: false, erro: ERRO_CLIENTE_AMBIGUO, crmVendaId: null })
  assert.deepEqual(interpretarRespostaCrm(401, { error: 'invalid_signature' }), { sincronizado: false, erro: 'crm_http_401: invalid_signature', crmVendaId: null })
  assert.deepEqual(interpretarRespostaCrm(200, 'x'), { sincronizado: false, erro: 'crm_resposta_inesperada', crmVendaId: null })
})

Deno.test('urlReceptorValida: só https', () => {
  assert.equal(urlReceptorValida('https://sdrai.omnx.pro/api/v1/integrations/desk/events/' + UUID(5)), true)
  assert.equal(urlReceptorValida('http://sdrai.omnx.pro/x'), false)
  assert.equal(urlReceptorValida('lixo'), false)
  assert.equal(urlReceptorValida(null), false)
})
