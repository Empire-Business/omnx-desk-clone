// Ponte de vendas Desk <-> CRM OMNX (omnx-sdria) — partes puras, sem banco nem rede.
//
// Contrato v1 (os dois lados seguem igual):
//   - Segredo compartilhado por par de empresas. No Desk fica no cofre via
//     tenant_integracoes provider='crm_omnx'; base_url = URL completa do receptor do CRM.
//   - Headers: X-OMNX-Timestamp (unix em segundos) e
//     X-OMNX-Signature: sha256=<hex HMAC-SHA256(segredo, "<timestamp>.<corpo cru>")>.
//     Quem recebe recusa |agora - timestamp| > 300 s e compara em tempo constante.
//   - CRM -> Desk manda também X-OMNX-Desk-Tenant (uuid do tenant do Desk), que é
//     como o Desk acha o segredo.
//
// Tudo aqui é testável sem Supabase: crm-omnx_test.ts (Deno).
import { normalizaTelefoneBR } from './telefone.ts'

export const CRM_PROVIDER = 'crm_omnx'
export const JANELA_ASSINATURA_S = 300
export const CLOSER_NOME_PADRAO = 'CRM'
export const CLOSER_EMAIL_PADRAO = 'crm@omnx.pro'

export const HEADER_TIMESTAMP = 'x-omnx-timestamp'
export const HEADER_ASSINATURA = 'x-omnx-signature'
export const HEADER_TENANT = 'x-omnx-desk-tenant'

const encoder = new TextEncoder()

function hex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** HMAC-SHA256 em hex de "<timestamp>.<corpo cru>". */
export async function hmacCrm(secret: string, timestamp: string | number, rawBody: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  return hex(await crypto.subtle.sign('HMAC', key, encoder.encode(`${timestamp}.${rawBody}`)))
}

/** Valor do header X-OMNX-Signature ("sha256=<hex>"). */
export async function assinarCrm(secret: string, timestamp: string | number, rawBody: string): Promise<string> {
  return `sha256=${await hmacCrm(secret, timestamp, rawBody)}`
}

/** Comparação em tempo constante (não sai no primeiro caractere diferente). */
export function igualTempoConstante(a: string, b: string): boolean {
  const ba = encoder.encode(a)
  const bb = encoder.encode(b)
  let diff = ba.length ^ bb.length
  const n = Math.max(ba.length, bb.length)
  for (let i = 0; i < n; i++) diff |= (ba[i] ?? 0) ^ (bb[i] ?? 0)
  return diff === 0
}

export type ResultadoAssinatura =
  | { ok: true }
  | { ok: false; code: 'missing_headers' | 'stale_timestamp' | 'invalid_signature' }

export async function verificarAssinaturaCrm(
  secret: string,
  args: { timestamp: string | null; signature: string | null; rawBody: string; nowMs?: number },
): Promise<ResultadoAssinatura> {
  const { timestamp, signature, rawBody } = args
  if (!timestamp || !signature) return { ok: false, code: 'missing_headers' }
  if (!/^\d{1,12}$/.test(timestamp.trim())) return { ok: false, code: 'stale_timestamp' }
  const agoraS = Math.floor((args.nowMs ?? Date.now()) / 1000)
  if (Math.abs(agoraS - Number(timestamp.trim())) > JANELA_ASSINATURA_S) {
    return { ok: false, code: 'stale_timestamp' }
  }
  const esperado = await assinarCrm(secret, timestamp.trim(), rawBody)
  const recebido = signature.trim().toLowerCase()
  if (!igualTempoConstante(esperado, recebido)) return { ok: false, code: 'invalid_signature' }
  return { ok: true }
}

/** Headers para um POST assinado do Desk para o CRM. */
export async function headersAssinadosCrm(
  secret: string,
  rawBody: string,
  nowMs: number = Date.now(),
): Promise<Record<string, string>> {
  const ts = String(Math.floor(nowMs / 1000))
  return {
    'Content-Type': 'application/json',
    'X-OMNX-Timestamp': ts,
    'X-OMNX-Signature': await assinarCrm(secret, ts, rawBody),
  }
}

// ---------------------------------------------------------------------------
// Forma comum da venda
// ---------------------------------------------------------------------------

export interface ClienteComum {
  nome: string
  razao_social: string | null
  cpf_cnpj: string | null
  email: string | null
  whatsapp: string | null
  instagram: string | null
  cep: string | null
  logradouro: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  municipio: string | null
  uf: string | null
}

export interface PagadorComum {
  diferente: boolean
  nome: string | null
  cpf_cnpj: string | null
  relacao: string | null
}

export interface PagamentoComum {
  data: string
  valor: number
  forma: string
  plataforma: string | null
  sinal: string | null
}

export interface ContratoResumo {
  status: 'preparing' | 'signed'
  link: string | null
  assinado_em: string | null
}

export interface VendaComum {
  status: string
  ganha_em: string | null
  valor_total: number | null
  produto_nome: string | null
  closer_nome: string | null
  closer_email: string | null
  cliente: ClienteComum
  /** null = sem dados de pagador (CRM -> Desk: o Desk não mexe nos campos do pagador). */
  pagador: PagadorComum | null
  pagamentos: PagamentoComum[]
  observacoes: string | null
  contrato: ContratoResumo | null
}

// ---------------------------------------------------------------------------
// CRM -> Desk
// ---------------------------------------------------------------------------

export interface EventoCrmVenda {
  event_id: string
  event: 'crm.venda.sincronizada'
  crm_tenant_id: string | null
  crm_venda_id: string
  crm_oportunidade_id: string | null
  versao: number | null
  /** v1.1: venda do Desk já ligada a esta venda do CRM (evita duplicar). */
  desk_venda_id: string | null
  venda: VendaComum
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function ehUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID_RE.test(v)
}

function texto(v: unknown, max = 500): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim().slice(0, max)
  return t.length > 0 ? t : null
}

function numero(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.round(v * 100) / 100
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Math.round(Number(v) * 100) / 100
  return null
}

function soDigitos(v: unknown): string | null {
  const t = texto(v, 40)
  if (!t) return null
  const d = t.replace(/\D/g, '')
  return d.length > 0 ? d : null
}

/** Data de calendário real (2026-02-30 não passa: ida e volta pelo Date). */
export function dataValida(yyyyMmDd: string): boolean {
  const m = yyyyMmDd.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return false
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === yyyyMmDd
}

function dataIso(v: unknown): string | null {
  const t = texto(v, 40)
  if (!t) return null
  const m = t.match(/^(\d{4}-\d{2}-\d{2})/)
  return m && dataValida(m[1]) ? m[1] : null
}

/** Instante ISO-8601 válido (com data de calendário real). */
function instanteValido(t: string): boolean {
  const m = t.match(/^(\d{4}-\d{2}-\d{2})/)
  return !!m && dataValida(m[1]) && !Number.isNaN(new Date(t).getTime())
}

function objeto(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}

/** Valida o corpo de `crm.venda.sincronizada`. Erro curto e legível no 400. */
export function validarEventoCrm(body: unknown):
  | { ok: true; evento: EventoCrmVenda }
  | { ok: false; erro: string; codigo: 'invalid_payload' | 'data_invalida' } {
  const invalido = (erro: string) => ({ ok: false as const, erro, codigo: 'invalid_payload' as const })
  const dataRuim = (erro: string) => ({ ok: false as const, erro, codigo: 'data_invalida' as const })
  const b = objeto(body)
  if (!ehUuid(b.event_id)) return invalido('event_id inválido')
  if (b.event !== 'crm.venda.sincronizada') return invalido('event não suportado')
  if (!ehUuid(b.crm_venda_id)) return invalido('crm_venda_id inválido')
  if (b.desk_venda_id !== undefined && b.desk_venda_id !== null && !ehUuid(b.desk_venda_id)) {
    return invalido('desk_venda_id inválido')
  }
  const v = objeto(b.venda)
  const c = objeto(v.cliente)
  const nome = texto(c.nome, 200)
  if (!nome) return invalido('venda.cliente.nome obrigatório')
  if (v.pagamentos !== undefined && v.pagamentos !== null && !Array.isArray(v.pagamentos)) {
    return invalido('venda.pagamentos deve ser lista')
  }
  const ganhaEm = texto(v.ganha_em, 40)
  if (ganhaEm && !instanteValido(ganhaEm)) return dataRuim('venda.ganha_em inválida')
  const pagamentos: PagamentoComum[] = []
  for (const [i, raw] of ((v.pagamentos as unknown[] | null | undefined) ?? []).entries()) {
    const p = objeto(raw)
    const data = dataIso(p.data)
    const valor = numero(p.valor)
    if (!data) return dataRuim(`venda.pagamentos[${i}].data inválida`)
    if (valor === null || valor <= 0) return invalido(`venda.pagamentos[${i}].valor inválido`)
    pagamentos.push({
      data,
      valor,
      forma: texto(p.forma, 60) ?? 'não informada',
      plataforma: texto(p.plataforma, 60),
      sinal: texto(p.sinal, 60),
    })
  }
  const pg = v.pagador === null || v.pagador === undefined ? null : objeto(v.pagador)
  const ct = v.contrato === null || v.contrato === undefined ? null : objeto(v.contrato)
  const assinadoBruto = ct ? texto(ct.assinado_em, 40) : null
  const assinadoEm = assinadoBruto ? dataIso(assinadoBruto) : null
  if (assinadoBruto && !assinadoEm) return dataRuim('venda.contrato.assinado_em inválida')
  const evento: EventoCrmVenda = {
    event_id: b.event_id,
    event: 'crm.venda.sincronizada',
    crm_tenant_id: ehUuid(b.crm_tenant_id) ? b.crm_tenant_id : null,
    crm_venda_id: b.crm_venda_id,
    crm_oportunidade_id: ehUuid(b.crm_oportunidade_id) ? b.crm_oportunidade_id : null,
    versao: typeof b.versao === 'number' ? b.versao : null,
    desk_venda_id: ehUuid(b.desk_venda_id) ? b.desk_venda_id : null,
    venda: {
      status: texto(v.status, 40) ?? 'won',
      ganha_em: ganhaEm,
      valor_total: numero(v.valor_total),
      produto_nome: texto(v.produto_nome, 200),
      closer_nome: texto(v.closer_nome, 200),
      closer_email: texto(v.closer_email, 200)?.toLowerCase() ?? null,
      cliente: {
        nome,
        razao_social: texto(c.razao_social, 200),
        cpf_cnpj: soDigitos(c.cpf_cnpj),
        email: texto(c.email, 200)?.toLowerCase() ?? null,
        whatsapp: texto(c.whatsapp, 40),
        instagram: texto(c.instagram, 120),
        cep: texto(c.cep, 20),
        logradouro: texto(c.logradouro, 300),
        numero: texto(c.numero, 40),
        complemento: texto(c.complemento, 200),
        bairro: texto(c.bairro, 200),
        municipio: texto(c.municipio, 200),
        uf: texto(c.uf, 2)?.toUpperCase() ?? null,
      },
      pagador: pg
        ? {
            diferente: pg.diferente === true,
            nome: texto(pg.nome, 200),
            cpf_cnpj: soDigitos(pg.cpf_cnpj),
            relacao: texto(pg.relacao, 120),
          }
        : null,
      pagamentos,
      observacoes: texto(v.observacoes, 5000),
      contrato: ct
        ? {
            status: ct.status === 'signed' ? 'signed' : 'preparing',
            link: texto(ct.link, 2000),
            assinado_em: assinadoEm,
          }
        : null,
    },
  }
  return { ok: true, evento }
}

/**
 * Colunas de vendas_pendentes a partir da venda do CRM. Valores nulos significam
 * "o CRM não informou": na criação viram o padrão (closer 'CRM'/'crm@omnx.pro'),
 * na atualização mantêm o que já está no Desk (crm_omnx_aplicar_venda).
 *
 * Pagamentos no mesmo formato que o formulário grava:
 * {data, valor, forma, plataforma, sinal}. Sem rótulo, a 1ª linha é "Entrada" e as
 * seguintes "Parcela N" (o gatilho renumerar_parcelas_pagamentos acerta a ordem).
 */
export function vendaCrmParaColunas(v: VendaComum): Record<string, unknown> {
  let parcela = 0
  const pagamentos = v.pagamentos.map((p, i) => {
    let sinal = p.sinal
    if (!sinal) {
      if (i === 0) sinal = 'Entrada'
      else sinal = `Parcela ${++parcela}`
    }
    return {
      data: p.data,
      valor: p.valor,
      forma: p.forma,
      plataforma: p.plataforma ?? 'CRM',
      sinal,
    }
  })
  const soma = pagamentos.reduce((s, p) => s + p.valor, 0)
  const valorTotal = v.valor_total ?? (pagamentos.length > 0 ? Math.round(soma * 100) / 100 : null)
  const whatsapp = v.cliente.whatsapp ? normalizaTelefoneBR(v.cliente.whatsapp) || v.cliente.whatsapp : null
  // Pagador: null = o CRM não tem dados -> as chaves nem vão (o banco não mexe).
  // Presente -> os campos vão juntos (pagador_observacao é limpo quando não é terceiro).
  const pagador: Record<string, unknown> = {}
  if (v.pagador) {
    const dif = v.pagador.diferente === true
    pagador.pagador_diferente = dif
    pagador.pagador_nome = dif ? v.pagador.nome : null
    pagador.pagador_cpf_cnpj = dif ? v.pagador.cpf_cnpj : null
    pagador.pagador_relacao = dif ? v.pagador.relacao : null
  }
  return {
    closer_nome: v.closer_nome,
    closer_email: v.closer_email,
    cliente_nome: v.cliente.nome,
    cliente_razao_social: v.cliente.razao_social,
    cliente_cpf_cnpj: v.cliente.cpf_cnpj,
    cliente_email: v.cliente.email,
    cliente_whatsapp: whatsapp,
    cliente_instagram: v.cliente.instagram,
    cliente_cep: v.cliente.cep,
    cliente_logradouro: v.cliente.logradouro,
    cliente_numero: v.cliente.numero,
    cliente_complemento: v.cliente.complemento,
    cliente_bairro: v.cliente.bairro,
    cliente_municipio: v.cliente.municipio,
    cliente_uf: v.cliente.uf,
    produto_nome: v.produto_nome,
    valor_total_venda: valorTotal,
    pagamentos: pagamentos.length > 0 ? pagamentos : null,
    observacoes: v.observacoes,
    ...pagador,
  }
}

// ---------------------------------------------------------------------------
// Desk -> CRM
// ---------------------------------------------------------------------------

export type TipoEventoDesk = 'desk.venda.registrada' | 'desk.venda.atualizada' | 'desk.contrato.atualizado'

/** Linha de vendas_pendentes (só o que a ponte usa). */
export interface LinhaVendaDesk {
  id: string
  tenant_id: string
  status: string
  criado_em: string | null
  closer_nome: string | null
  closer_email: string | null
  cliente_nome: string
  cliente_razao_social: string | null
  cliente_cpf_cnpj: string | null
  cliente_email: string | null
  cliente_whatsapp: string | null
  cliente_instagram: string | null
  cliente_endereco: string | null
  cliente_cep: string | null
  cliente_logradouro: string | null
  cliente_numero: string | null
  cliente_complemento: string | null
  cliente_bairro: string | null
  cliente_municipio: string | null
  cliente_uf: string | null
  produto_nome: string | null
  valor_total_venda: number | string | null
  pagamentos: unknown
  observacoes: string | null
  pagador_diferente: boolean | null
  pagador_nome: string | null
  pagador_cpf_cnpj: string | null
  pagador_relacao: string | null
  crm_venda_id: string | null
}

/** Linha de contratos (só o que a ponte usa). */
export interface LinhaContratoDesk {
  id: string
  status: string | null
  status_secundario: string | null
  link_clicksign: string | null
  data_assinatura: string | null
}

function vazioParaNull(v: string | null | undefined): string | null {
  if (v === null || v === undefined) return null
  const t = String(v).trim()
  return t.length > 0 ? t : null
}

function pagamentosDesk(raw: unknown): PagamentoComum[] {
  if (!Array.isArray(raw)) return []
  const out: PagamentoComum[] = []
  for (const item of raw) {
    const p = objeto(item)
    const data = dataIso(p.data)
    const valor = numero(p.valor)
    if (!data || valor === null) continue
    out.push({
      data,
      valor,
      forma: texto(p.forma, 60) ?? 'não informada',
      plataforma: texto(p.plataforma, 60),
      sinal: texto(p.sinal, 60),
    })
  }
  return out
}

/** Contrato assinado no Desk = tem link do Clicksign ou data de assinatura. */
export function resumoContrato(c: LinhaContratoDesk | null): ContratoResumo | null {
  if (!c) return null
  const link = vazioParaNull(c.link_clicksign)
  const assinadoEm = dataIso(c.data_assinatura)
  return {
    status: link || assinadoEm ? 'signed' : 'preparing',
    link,
    assinado_em: assinadoEm,
  }
}

export function vendaDeskParaComum(v: LinhaVendaDesk, contrato: LinhaContratoDesk | null): VendaComum {
  const pagamentos = pagamentosDesk(v.pagamentos)
  const valorInformado = numero(v.valor_total_venda)
  const soma = Math.round(pagamentos.reduce((s, p) => s + p.valor, 0) * 100) / 100
  const whatsapp = normalizaTelefoneBR(v.cliente_whatsapp) || null
  const criado = v.criado_em ? new Date(v.criado_em) : null
  return {
    status: v.status,
    ganha_em: criado && !Number.isNaN(criado.getTime()) ? criado.toISOString() : null,
    valor_total: valorInformado ?? (pagamentos.length > 0 ? soma : null),
    produto_nome: vazioParaNull(v.produto_nome),
    closer_nome: vazioParaNull(v.closer_nome),
    closer_email: vazioParaNull(v.closer_email)?.toLowerCase() ?? null,
    cliente: {
      nome: v.cliente_nome,
      razao_social: vazioParaNull(v.cliente_razao_social),
      cpf_cnpj: soDigitos(v.cliente_cpf_cnpj),
      email: vazioParaNull(v.cliente_email)?.toLowerCase() ?? null,
      whatsapp,
      instagram: vazioParaNull(v.cliente_instagram),
      cep: vazioParaNull(v.cliente_cep),
      // Vendas antigas só têm o endereço numa linha (cliente_endereco).
      logradouro: vazioParaNull(v.cliente_logradouro) ?? vazioParaNull(v.cliente_endereco),
      numero: vazioParaNull(v.cliente_numero),
      complemento: vazioParaNull(v.cliente_complemento),
      bairro: vazioParaNull(v.cliente_bairro),
      municipio: vazioParaNull(v.cliente_municipio),
      uf: vazioParaNull(v.cliente_uf)?.toUpperCase() ?? null,
    },
    pagador: {
      diferente: v.pagador_diferente === true,
      nome: v.pagador_diferente ? vazioParaNull(v.pagador_nome) : null,
      cpf_cnpj: v.pagador_diferente ? soDigitos(v.pagador_cpf_cnpj) : null,
      relacao: v.pagador_diferente ? vazioParaNull(v.pagador_relacao) : null,
    },
    pagamentos,
    observacoes: vazioParaNull(v.observacoes),
    contrato: resumoContrato(contrato),
  }
}

export interface EventoDesk {
  event_id: string
  event: TipoEventoDesk
  desk_tenant_id: string
  desk_venda_id: string
  desk_contrato_id: string | null
  crm_venda_id: string | null
  occurred_at: string
  venda: VendaComum
  contrato: {
    id: string
    status: string | null
    status_secundario: string | null
    link_clicksign: string | null
    data_assinatura: string | null
  } | null
}

export function montarEventoDesk(args: {
  tipo: TipoEventoDesk
  venda: LinhaVendaDesk
  contrato: LinhaContratoDesk | null
  eventId: string
  occurredAt: Date
}): EventoDesk {
  const { venda, contrato } = args
  return {
    event_id: args.eventId,
    event: args.tipo,
    desk_tenant_id: venda.tenant_id,
    desk_venda_id: venda.id,
    desk_contrato_id: contrato?.id ?? null,
    crm_venda_id: venda.crm_venda_id ?? null,
    occurred_at: args.occurredAt.toISOString(),
    venda: vendaDeskParaComum(venda, contrato),
    contrato: contrato
      ? {
          id: contrato.id,
          status: contrato.status ?? null,
          status_secundario: contrato.status_secundario ?? null,
          link_clicksign: vazioParaNull(contrato.link_clicksign),
          data_assinatura: dataIso(contrato.data_assinatura),
        }
      : null,
  }
}

/**
 * Tipo do evento de venda quando o gatilho não disse: venda que nunca chegou ao
 * CRM é "registrada", o resto é "atualizada".
 */
export function tipoEventoVenda(pedido: unknown, jaSincronizada: boolean): TipoEventoDesk {
  if (pedido === 'desk.venda.registrada' || pedido === 'desk.venda.atualizada') return pedido
  return jaSincronizada ? 'desk.venda.atualizada' : 'desk.venda.registrada'
}

/** Códigos gravados em vendas_pendentes.crm_sincronizacao_erro (a tela traduz). */
export const ERRO_CLIENTE_NAO_ENCONTRADO = 'cliente_nao_encontrado_no_crm'
export const ERRO_CLIENTE_AMBIGUO = 'cliente_ambiguo_no_crm'

export interface ResultadoEnvioCrm {
  /** true quando o CRM aplicou (ou já tinha aplicado) a venda. */
  sincronizado: boolean
  /** null quando deu certo; código legível quando não. */
  erro: string | null
  crmVendaId: string | null
}

/** Lê a resposta do receptor do CRM e decide o que gravar na venda. */
export function interpretarRespostaCrm(httpStatus: number, body: unknown): ResultadoEnvioCrm {
  const b = objeto(body)
  const crmVendaId = ehUuid(b.crm_venda_id) ? b.crm_venda_id : null
  if (httpStatus < 200 || httpStatus >= 300) {
    const det = texto(b.error, 80) ?? texto(b.detail, 80)
    return { sincronizado: false, erro: `crm_http_${httpStatus}${det ? `: ${det}` : ''}`.slice(0, 200), crmVendaId: null }
  }
  switch (b.status) {
    case 'applied':
    case 'duplicate':
      return { sincronizado: true, erro: null, crmVendaId }
    case 'ignored':
      return { sincronizado: true, erro: null, crmVendaId }
    case 'unmatched':
      return { sincronizado: false, erro: ERRO_CLIENTE_NAO_ENCONTRADO, crmVendaId: null }
    case 'ambiguous':
      return { sincronizado: false, erro: ERRO_CLIENTE_AMBIGUO, crmVendaId: null }
    default:
      return { sincronizado: false, erro: 'crm_resposta_inesperada', crmVendaId: null }
  }
}

/** base_url do crm_omnx precisa ser https (o segredo vai junto da assinatura). */
export function urlReceptorValida(url: string | null | undefined): boolean {
  if (!url) return false
  try {
    const u = new URL(url)
    return u.protocol === 'https:'
  } catch {
    return false
  }
}
