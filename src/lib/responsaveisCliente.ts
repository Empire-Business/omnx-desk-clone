export type TipoResponsavel = 'estrategista' | 'atendimento'
export type AcaoResponsavel = 'adicionar' | 'trocar' | 'encerrar'
export interface VinculoResponsavel {
  id: string; client_id: string; user_id: string; tipo: TipoResponsavel; ativo: boolean
  criado_em: string; usuario_nome: string; usuario_ativo: boolean
}
export interface PessoaElegivel { id: string; nome: string; tipos: TipoResponsavel[] }
export interface SnapshotResponsavel { user_id: string; usuario_nome: string; tipo: TipoResponsavel }
export interface EventoResponsavel {
  id: string; revisao: number; operacao_id: string | null; acao: string; origem: string
  motivo: string | null; ator_id: string | null; ator_nome: string | null; ocorrido_em: string
  antes: SnapshotResponsavel | null; depois: SnapshotResponsavel | null
}
export interface ContextoResponsaveis {
  client_id: string; revisao: number; atuais: VinculoResponsavel[]; usuarios_elegiveis: PessoaElegivel[]
  historico: EventoResponsavel[]; historico_proximo_cursor: number | null; historico_desde: string | null
}
export interface PedidoResponsavel {
  clientId: string; acao: AcaoResponsavel; tipo: TipoResponsavel; assignmentId: string | null
  userId: string | null; revisao: number; idempotencia: string; motivo: string
}
export interface TransporteResponsaveis {
  rpc(nome: string, parametros: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>
}
export class ErroResponsaveis extends Error {
  readonly codigo: 'conflito' | 'permissao' | 'atualizacao' | 'dados' | 'destino'
  constructor(message: string, codigo: ErroResponsaveis['codigo'] = 'dados') { super(message); this.codigo = codigo }
}
/** Só falhas sem resultado confirmado devem repetir o mesmo pedido. */
export function podeRepetirPedidoResponsavel(erro: unknown): boolean {
  return !(erro instanceof ErroResponsaveis) || erro.codigo === 'dados'
}
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
const invalido = () => new ErroResponsaveis('Não foi possível conferir os responsáveis. Atualize os dados e tente novamente.')
function objeto(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw invalido()
  return v as Record<string, unknown>
}
function texto(v: unknown, max = 500): string {
  if (typeof v !== 'string' || v.length > max) throw invalido()
  return v
}
function uuid(v: unknown): string { const s = texto(v, 36); if (!UUID.test(s)) throw invalido(); return s }
function revisao(v: unknown): number { if (!Number.isSafeInteger(v) || Number(v) < 0) throw invalido(); return Number(v) }
function tipo(v: unknown): TipoResponsavel { if (v !== 'estrategista' && v !== 'atendimento') throw invalido(); return v }
function lista(v: unknown, max: number): unknown[] { if (!Array.isArray(v) || v.length > max) throw invalido(); return v }
function opcional<T>(v: unknown, ler: (v: unknown) => T): T | null { return v == null ? null : ler(v) }
function snapshot(v: unknown): SnapshotResponsavel | null {
  if (v == null) return null
  const e = objeto(v)
  return { user_id: uuid(e.user_id), usuario_nome: texto(e.usuario_nome, 200), tipo: tipo(e.tipo) }
}
export function lerEventoResponsavel(v: unknown): EventoResponsavel {
  const e = objeto(v)
  return { id: uuid(e.id), revisao: revisao(e.revisao), operacao_id: opcional(e.operacao_id, uuid),
    acao: texto(e.acao, 40), origem: texto(e.origem, 80), motivo: opcional(e.motivo, texto),
    ator_id: opcional(e.ator_id, uuid), ator_nome: opcional(e.ator_nome, (x) => texto(x, 200)),
    ocorrido_em: texto(e.ocorrido_em, 80), antes: snapshot(e.antes), depois: snapshot(e.depois) }
}
export function lerContextoResponsaveis(v: unknown): ContextoResponsaveis {
  const c = objeto(v)
  return { client_id: uuid(c.client_id), revisao: revisao(c.revisao),
    atuais: lista(c.atuais, 200).map((v) => {
      const a = objeto(v)
      if (typeof a.ativo !== 'boolean' || typeof a.usuario_ativo !== 'boolean') throw invalido()
      return { id: uuid(a.id), client_id: uuid(a.client_id), user_id: uuid(a.user_id), tipo: tipo(a.tipo),
        ativo: a.ativo, criado_em: texto(a.criado_em, 80), usuario_nome: texto(a.usuario_nome, 200), usuario_ativo: a.usuario_ativo }
    }),
    usuarios_elegiveis: lista(c.usuarios_elegiveis, 500).map((v) => {
      const u = objeto(v)
      return { id: uuid(u.id), nome: texto(u.nome, 200), tipos: lista(u.tipos, 2).map(tipo) }
    }),
    historico: lista(c.historico, 30).map(lerEventoResponsavel),
    historico_proximo_cursor: opcional(c.historico_proximo_cursor, revisao),
    historico_desde: opcional(c.historico_desde, (x) => texto(x, 80)),
  }
}
function erroRemoto(e: unknown): ErroResponsaveis {
  const r = e && typeof e === 'object' ? e as Record<string, unknown> : {}
  const message = String(r.message ?? ''); const code = String(r.code ?? '')
  if (message.includes('atribuicao_estado_alterado') || code === '40001') return new ErroResponsaveis('A equipe deste cliente mudou. Atualize os dados, confira a nova situação e prepare a alteração novamente.', 'conflito')
  if (message.includes('atribuicao_sem_permissao') || code === '42501') return new ErroResponsaveis('Seu acesso não permite gerenciar os responsáveis deste cliente.', 'permissao')
  if (code === 'PGRST202' || code === '42883') return new ErroResponsaveis('O novo cadastro de responsáveis ainda aguarda atualização da plataforma.', 'atualizacao')
  if (/atribuicao_destino_|atribuicao_ja_ativa/.test(message)) return new ErroResponsaveis('Essa pessoa não está disponível para este vínculo. Atualize os dados e escolha outra pessoa.', 'destino')
  if (message.includes('atribuicao_idempotencia_incompativel')) return new ErroResponsaveis('Os dados deste pedido mudaram. Prepare uma nova alteração antes de confirmar.', 'conflito')
  return new ErroResponsaveis('Não foi possível concluir a alteração. Confira a conexão e tente novamente com o mesmo pedido.')
}
async function rpc(banco: TransporteResponsaveis, nome: string, parametros: Record<string, unknown>): Promise<unknown> {
  const r = await banco.rpc(nome, parametros)
  if (r.error) throw erroRemoto(r.error)
  return r.data
}
export async function carregarResponsaveis(banco: TransporteResponsaveis, clientId: string) {
  const c = lerContextoResponsaveis(await rpc(banco, 'client_assignment_contexto', { p_client_id: uuid(clientId) }))
  if (c.client_id !== clientId || c.atuais.some((a) => a.client_id !== clientId || !a.ativo)) throw invalido()
  return c
}
export async function carregarHistoricoResponsaveis(banco: TransporteResponsaveis, clientId: string, cursor: number) {
  const r = objeto(await rpc(banco, 'client_assignment_historico', { p_client_id: uuid(clientId), p_antes_revisao: revisao(cursor) }))
  return { eventos: lista(r.eventos, 30).map(lerEventoResponsavel), proximo_cursor: opcional(r.proximo_cursor, revisao) }
}
export function parametrosResponsavel(p: PedidoResponsavel) {
  if (!['adicionar', 'trocar', 'encerrar'].includes(p.acao) || p.motivo.trim().length < 3 || p.motivo.trim().length > 500) throw new ErroResponsaveis('Descreva o motivo da alteração com 3 a 500 caracteres.')
  if ((p.acao === 'adicionar' && (p.assignmentId !== null || !p.userId))
    || (p.acao === 'trocar' && (!p.assignmentId || !p.userId))
    || (p.acao === 'encerrar' && (!p.assignmentId || p.userId !== null))) throw invalido()
  return { p_client_id: uuid(p.clientId), p_acao: p.acao, p_tipo: tipo(p.tipo),
    p_assignment_id: opcional(p.assignmentId, uuid), p_user_id: opcional(p.userId, uuid),
    p_revisao_esperada: revisao(p.revisao), p_idempotencia: uuid(p.idempotencia), p_motivo: p.motivo.trim() }
}
export async function decidirResponsavel(banco: TransporteResponsaveis, pedido: PedidoResponsavel) {
  const r = objeto(await rpc(banco, 'client_assignment_decidir', parametrosResponsavel(pedido)))
  if (r.ok !== true || typeof r.repetida !== 'boolean') throw invalido()
  return { ok: true as const, operacao_id: uuid(r.operacao_id), revisao: revisao(r.revisao), repetida: r.repetida }
}

/** Agrupa os dois fatos de uma troca sem perder eventos legados independentes. */
export function agruparHistoricoResponsaveis(eventos: readonly EventoResponsavel[]) {
  const grupos = new Map<string, EventoResponsavel[]>()
  for (const e of eventos) {
    const chave = e.operacao_id ?? e.id
    grupos.set(chave, [...(grupos.get(chave) ?? []), e])
  }
  return [...grupos.entries()].map(([id, itens]) => ({ id, itens,
    incompleto: itens.some((e) => e.acao === 'trocar') && itens.length < 2,
    antes: [...itens].sort((a, b) => a.revisao - b.revisao).find((e) => e.antes)?.antes ?? null,
    depois: [...itens].sort((a, b) => b.revisao - a.revisao).find((e) => e.depois)?.depois ?? null,
    ocorrido_em: itens[0].ocorrido_em, ator_nome: itens[0].ator_nome,
    motivo: itens[0].motivo, origem: itens[0].origem,
  }))
}
