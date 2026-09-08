import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MessageCircle, X, Copy, CheckCircle2, Archive, FileImage, FileText, ClipboardCheck, Pencil, Save, Plus, FileSignature, Users, ScanLine, Loader2 } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { ContratosTabs } from '@/components/contratos/ContratosTabs'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import {
  useVendasPendentes,
  useUpdateVendaPendente,
  getComprovanteUrl,
  type VendaPendente,
  type VendaPendenteEdicao,
  type VendaPendentePagamento,
  type VendaPendenteComprovante,
} from '@/hooks/useVendasPendentes'
import { useProdutosList } from '@/hooks/useComissoes'
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip'
import { GerarContratoModal } from '@/components/contratos/GerarContratoModal'
import { lerComprovanteComIa } from '@/lib/comprovanteIa'
import { VisualizadorComprovante } from '@/components/vendas/VisualizadorComprovante'
import type { DadosContrato } from '@/lib/contratoTemplate'

/** Monta o endereço a partir do texto único ou dos campos estruturados do lead. */
function montarEndereco(v: VendaPendente): string | null {
  if (v.cliente_endereco && v.cliente_endereco.trim()) return v.cliente_endereco.trim()
  const partes = [
    [v.cliente_logradouro, v.cliente_numero].filter(Boolean).join(', '),
    v.cliente_complemento,
    v.cliente_bairro,
    [v.cliente_municipio, v.cliente_uf].filter(Boolean).join('/'),
    v.cliente_cep ? `CEP ${v.cliente_cep}` : null,
  ].filter((p) => p && String(p).trim())
  return partes.length ? partes.join(' — ') : null
}

/** Mapeia uma venda pendente (lead do formulário) para os dados do gerador de contrato. */
function vendaParaDados(v: VendaPendente): DadosContrato {
  const total = v.pagamentos.reduce((acc, p) => acc + Number(p.valor || 0), 0)
  return {
    cliente_nome: v.cliente_nome,
    empresa: v.cliente_razao_social,
    cpf_cnpj: v.cliente_cpf_cnpj,
    email: v.cliente_email,
    whatsapp: v.cliente_whatsapp,
    instagram: v.cliente_instagram,
    endereco: montarEndereco(v),
    produto_nome: v.produto_nome,
    valor_total: v.valor_total_venda ?? total,
    num_parcelas: v.pagamentos.length || null,
    valor_parcela: v.pagamentos[0] ? Number(v.pagamentos[0].valor) || null : null,
    forma_pagamento: v.pagamentos[0]?.forma ?? null,
    data_fechamento: v.criado_em,
    vendedor: v.closer_nome,
    parcelas: v.pagamentos.map((p) => ({
      data: p.data, valor: Number(p.valor) || null, forma: p.forma, plataforma: p.plataforma, sinal: p.sinal,
    })),
  }
}

// Campos que podem ser editados no onboarding (usados pra montar inputs e calcular o diff do histórico).
const CAMPOS_EDITAVEIS: { campo: string; label: string }[] = [
  { campo: 'cliente_nome', label: 'Nome' },
  { campo: 'cliente_whatsapp', label: 'WhatsApp' },
  { campo: 'cliente_email', label: 'E-mail' },
  { campo: 'cliente_cpf_cnpj', label: 'CPF / CNPJ' },
  { campo: 'cliente_razao_social', label: 'Razão social' },
  { campo: 'cliente_instagram', label: 'Instagram' },
  { campo: 'cliente_logradouro', label: 'Logradouro' },
  { campo: 'cliente_numero', label: 'Número' },
  { campo: 'cliente_complemento', label: 'Complemento' },
  { campo: 'cliente_bairro', label: 'Bairro' },
  { campo: 'cliente_municipio', label: 'Município' },
  { campo: 'cliente_uf', label: 'UF' },
  { campo: 'cliente_cep', label: 'CEP' },
  { campo: 'identificador_pagamento', label: 'Identificador de pagamento' },
  { campo: 'pagador_nome', label: 'Pagador (nome)' },
  { campo: 'pagador_cpf_cnpj', label: 'Pagador (CPF/CNPJ)' },
  { campo: 'pagador_relacao', label: 'Pagador (relação)' },
  { campo: 'pagador_observacao', label: 'Pagador (observação)' },
  { campo: 'observacoes', label: 'Observação' },
]

function fmtBRL(v: number) { return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }
function fmtDate(d: string) { return new Date(d).toLocaleString('pt-BR') }

// Datas de pagamento vêm como "YYYY-MM-DD" (sem hora). Formatar via new Date()
// interpreta como UTC e volta um dia no fuso BRT — por isso o parse manual.
function fmtDataPagamento(d: string): string {
  const [y, m, day] = (d ?? '').slice(0, 10).split('-')
  if (!y || !m || !day) return '—'
  return `${day}/${m}/${y}`
}

function onlyDigits(s: string) { return (s ?? '').replace(/\D/g, '') }

// PDF não é imagem: jogado num <img> ele renderiza como figura quebrada e passa a
// impressão de arquivo corrompido. Quem for PDF vira um cartão com o nome, clicável.
function ehPdf(nome?: string | null, mime?: string | null): boolean {
  return (mime ?? '').toLowerCase().includes('pdf') || (nome ?? '').toLowerCase().endsWith('.pdf')
}

// Normaliza o WhatsApp pro formato E.164 (+55...), igual ao que o form público salva.
// É o que garante que o "Abrir chat"/wa.me funcione pra mandar mensagem.
function normalizeWhatsapp(raw: string): string {
  const r = (raw ?? '').trim()
  const d = onlyDigits(r)
  if (!d) return ''
  if (r.startsWith('+')) return `+${d}`
  if (d.length === 10 || d.length === 11) return `+55${d}` // número BR sem DDI
  return `+${d}`
}

function orNull(s: string): string | null {
  const t = (s ?? '').trim()
  return t === '' ? null : t
}

// Estado local da edição de pagamentos — tudo string pra digitação livre; converte ao salvar.
type PagamentoEdit = { data: string; valor: string; forma: string; plataforma: string; sinal: string }

function pagamentoToEdit(p: VendaPendentePagamento): PagamentoEdit {
  return {
    data: (p.data ?? '').slice(0, 10),
    valor: p.valor != null ? String(p.valor) : '',
    forma: p.forma ?? '',
    plataforma: p.plataforma ?? '',
    sinal: p.sinal ?? '',
  }
}

// Forma canônica pra detectar mudança nos pagamentos (ignora hora na data e tipos).
function pagamentosComparaveis(ps: VendaPendentePagamento[]): string {
  return JSON.stringify(
    ps.map((p) => [(p.data ?? '').slice(0, 10), Number(p.valor) || 0, p.forma ?? '', p.plataforma ?? '', p.sinal ?? '']),
  )
}

function resumoPagamentos(ps: VendaPendentePagamento[]): string {
  if (ps.length === 0) return 'nenhum'
  const total = ps.reduce((s, p) => s + (Number(p.valor) || 0), 0)
  return `${ps.length} pagamento(s) · total ${fmtBRL(total)}`
}

// Exibe o WhatsApp de forma legível: +55 (86) 99929-1729.
// Aceita E.164 (+55...) ou número solto e tenta formatar; se não bater, devolve original.
function formatWhatsapp(raw: string): string {
  const r = (raw ?? '').trim()
  if (!r) return '—'
  let d = onlyDigits(r)
  if (d.startsWith('55') && d.length >= 12) d = d.slice(2) // tira o DDI pra formatar DDD+número
  if (d.length === 11) return `+55 (${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `+55 (${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return r
}

function enderecoLegivel(v: VendaPendente): string {
  const estruturado = [
    [v.cliente_logradouro, v.cliente_numero].filter(Boolean).join(', '),
    v.cliente_complemento,
    v.cliente_bairro,
    [v.cliente_municipio, v.cliente_uf].filter(Boolean).join('/'),
    v.cliente_cep,
  ].filter((x) => x && String(x).trim()).join(' · ')
  return estruturado || v.cliente_endereco || '—'
}

function statusBadge(s: VendaPendente['status']) {
  switch (s) {
    case 'pendente':       return { label: 'Pendente', cls: 'bg-warning text-warning-foreground' }
    case 'em_atendimento': return { label: 'Em atendimento', cls: 'bg-info text-white' }
    case 'concluida':      return { label: 'Concluída', cls: 'bg-success text-white' }
    case 'descartada':     return { label: 'Descartada', cls: 'bg-muted text-muted-foreground' }
  }
}

export function VendasPendentesPage() {
  const { user } = useAuth()
  const podeAcessar = user && ['admin', 'gerente', 'atendimento'].includes(user.perfil)

  const [filtroStatus, setFiltroStatus] = useState<VendaPendente['status'] | 'all'>('all')
  const { data: todasVendas, isLoading, refetch: refetchVendas } = useVendasPendentes()
  const update = useUpdateVendaPendente()
  const vendas = useMemo(() => {
    if (!todasVendas) return undefined
    return filtroStatus === 'all' ? todasVendas : todasVendas.filter((v) => v.status === filtroStatus)
  }, [todasVendas, filtroStatus])
  const contagem = useMemo(() => {
    const c: Record<string, number> = { pendente: 0, em_atendimento: 0, concluida: 0, descartada: 0 }
    todasVendas?.forEach((v) => { c[v.status] = (c[v.status] ?? 0) + 1 })
    return c
  }, [todasVendas])
  const [selecionada, setSelecionada] = useState<VendaPendente | null>(null)
  const [gerarPara, setGerarPara] = useState<VendaPendente | null>(null)

  // Backfill: vendas antigas ficaram sem identificador porque o campo não existia.
  // Este botão lê os comprovantes delas de uma vez, aqui no navegador.
  const [backfill, setBackfill] = useState<
    { total: number; feitos: number; achados: number; semLeitura: number; falha?: string | null } | null
  >(null)
  // Com a leitura por IA, PDF também entra: o OCR local não abria PDF, a IA abre.
  const pendentesDeLeitura = useMemo(
    () => (todasVendas ?? []).filter(
      (v) => !v.identificador_pagamento?.trim() && v.comprovantes.length > 0,
    ),
    [todasVendas],
  )

  /**
   * Lê os comprovantes pendentes com a IA de visão, no servidor.
   *
   * Era OCR local (tesseract) e devolveu **0 de 19** em 06/08/2026: a maioria
   * dos comprovantes não é print de PIX, e sim print de checkout ou e-mail de
   * confirmação, onde não existe o rótulo "Pagador:" que a heurística procurava.
   * A IA olha o documento inteiro e responde quem pagou.
   */
  async function rodarBackfill() {
    const alvos = pendentesDeLeitura
    if (alvos.length === 0) return
    setBackfill({ total: alvos.length, feitos: 0, achados: 0, semLeitura: 0 })
    let achados = 0
    let semLeitura = 0
    let falha: string | null = null
    for (const [i, v] of alvos.entries()) {
      let leu = false
      try {
        // A function grava sozinha quando a confiança é alta; aqui só
        // atualizamos a tela com o que ela devolveu.
        const r = await lerComprovanteComIa(v.id)
        if (r.identificador) {
          if (!r.gravado) {
            await update.mutateAsync({ id: v.id, identificador_pagamento: r.identificador })
          }
          achados += 1
          leu = true
        } else if (r.erro) {
          // Guarda o primeiro erro real: se a chave da IA some ou a permissão
          // muda, TODAS falham igual — e mostrar isso é mais útil que um
          // "0 de 19" que parece problema dos comprovantes.
          falha ??= r.erro
        }
      } catch (e) {
        falha ??= e instanceof Error ? e.message : String(e)
      }
      if (!leu) semLeitura += 1
      setBackfill({ total: alvos.length, feitos: i + 1, achados, semLeitura, falha })
    }
    await refetchVendas()
  }

  // Não há mais leitor local para desligar: a leitura acontece no servidor.

  function abrirModal(v: VendaPendente) {
    if (v.status === 'pendente') {
      update.mutate({ id: v.id, status: 'em_atendimento', atendido_por: user?.id ?? null, atendido_em: new Date().toISOString() })
    }
    setSelecionada(v)
  }

  if (!podeAcessar) {
    return (
      <div className="glass-card p-8 text-center text-sm text-muted-foreground">
        Apenas o time de atendimento tem acesso a essa página.
      </div>
    )
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <PageHeader
        title="Onboarding"
        description="Vendas enviadas pelos closers para início do atendimento e onboarding do cliente."
      />

      <ContratosTabs />

      <div className="glass-card p-5 space-y-4">
        <div className="flex items-center gap-3 text-xs">
          {(['all', 'pendente', 'em_atendimento', 'concluida', 'descartada'] as const).map((s) => {
            const ativo = filtroStatus === s
            const label = s === 'all' ? 'Todas' : statusBadge(s).label
            const count = s === 'all' ? (todasVendas?.length ?? 0) : (contagem[s] ?? 0)
            return (
              <button
                key={s}
                onClick={() => setFiltroStatus(s)}
                className={`rounded-full px-3 py-1 transition-colors inline-flex items-center gap-1.5 ${ativo ? 'bg-primary text-primary-foreground' : 'border border-border hover:bg-muted'}`}
              >
                {label}
                <span className={`text-[10px] tabular-nums rounded-full px-1.5 py-0 ${ativo ? 'bg-white/20' : 'bg-muted text-muted-foreground'}`}>{count}</span>
              </button>
            )
          })}
          <span className="ml-auto text-muted-foreground">{vendas?.length ?? 0} venda(s)</span>
        </div>

        {(pendentesDeLeitura.length > 0 || backfill) && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs">
            <ScanLine className="h-4 w-4 shrink-0 text-primary" />
            {backfill ? (
              backfill.feitos < backfill.total ? (
                <span className="text-foreground">
                  Lendo comprovantes… {backfill.feitos} de {backfill.total} ({backfill.achados} preenchidos).
                  Deixe esta aba aberta.
                </span>
              ) : (
                <span className="text-foreground">
                  Leitura concluída: {backfill.achados} de {backfill.total} vendas ganharam identificador.
                  {backfill.semLeitura > 0 && !backfill.falha && (
                    <> Em {backfill.semLeitura} o comprovante não trazia o nome de quem pagou de
                    forma legível — nesses, digite o identificador à mão.</>
                  )}
                  {backfill.falha && (
                    <span className="mt-1 block rounded bg-danger/10 px-2 py-1 font-mono text-[11px] text-danger">
                      A leitura falhou (não é o comprovante): {backfill.falha}
                    </span>
                  )}
                </span>
              )
            ) : (
              <>
                <span className="text-muted-foreground">
                  {pendentesDeLeitura.length} venda(s) com comprovante ainda sem identificador de pagamento.
                </span>
                <button
                  onClick={rodarBackfill}
                  className="ml-auto rounded-full bg-primary px-3 py-1 font-medium text-primary-foreground hover:opacity-90"
                >
                  Ler comprovantes com IA
                </button>
              </>
            )}
          </div>
        )}

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-14 shimmer rounded-lg" />)}
          </div>
        ) : !vendas || vendas.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">Nada por aqui.</p>
        ) : (
          <ul className="divide-y divide-border">
            {vendas.map((v) => {
              const total = v.pagamentos.reduce((acc, p) => acc + Number(p.valor || 0), 0)
              const badge = statusBadge(v.status)
              return (
                <li
                  key={v.id}
                  onClick={() => abrirModal(v)}
                  className="py-3 cursor-pointer hover:bg-muted/40 transition-colors px-2 -mx-2 rounded-lg"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{v.cliente_nome}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {v.produto_nome ?? '—'} · Closer: {v.closer_nome} · {fmtDate(v.criado_em)}
                      </p>
                      {/* Identificador de pagamento: é por ele que o financeiro acha o
                          lançamento no extrato, então fica na linha, não escondido no modal. */}
                      <p className="mt-0.5 flex items-center gap-1.5 text-xs truncate" title="Nome que aparece no extrato bancário">
                        <ScanLine className={`h-3.5 w-3.5 shrink-0 ${v.identificador_pagamento ? 'text-primary' : 'text-warning'}`} />
                        {v.identificador_pagamento
                          ? <span className="font-medium text-foreground truncate">{v.identificador_pagamento}</span>
                          : <span className="text-warning">sem identificador de pagamento</span>}
                      </p>
                    </div>
                    <span className="text-sm font-semibold text-foreground tabular-nums">{fmtBRL(total)}</span>
                    {v.ghl_pipeline_name && (
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border ${
                          isPipelineCorreto(v.ghl_pipeline_name)
                            ? 'bg-success/10 text-success border-success/30'
                            : 'bg-warning/10 text-warning border-warning/30'
                        }`}
                        title={
                          isPipelineCorreto(v.ghl_pipeline_name)
                            ? `Vinculado no pipeline ${v.ghl_pipeline_name}`
                            : `Vinculado em "${v.ghl_pipeline_name}" — fora de ${PIPELINE_ESPERADO_LABEL}`
                        }
                      >
                        {v.ghl_pipeline_name}
                      </span>
                    )}
                    {/* O selo aparece em QUALQUER venda sem vínculo, não só na concluída:
                        antes, uma venda em atendimento sem vínculo ficava sem aviso nenhum,
                        e a ausência do selo passava a impressão de que estava vinculada. */}
                    {!v.ghl_oportunidade_id && v.status !== 'descartada' && (
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          v.status === 'concluida'
                            ? 'bg-warning text-warning-foreground'
                            : 'border border-warning/40 bg-warning/10 text-warning'
                        }`}
                        title={
                          v.status === 'concluida'
                            ? 'Concluída sem vínculo no CRM — não conta no faturamento'
                            : 'Ainda não vinculada ao CRM — só entra no faturamento depois de concluir e vincular'
                        }
                      >
                        sem vínculo
                      </span>
                    )}
                    {v.pagador_diferente && (
                      <span
                        className="inline-flex items-center gap-1 rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-2xs font-medium text-foreground"
                        title={`Pagamento feito por outra pessoa${v.pagador_nome ? `: ${v.pagador_nome}` : ''}`}
                      >
                        <Users className="h-3 w-3" /> pago por terceiro
                      </span>
                    )}
                    <BadgeEditado edicoes={v.historico_edicoes} />
                    <button
                      onClick={(e) => { e.stopPropagation(); setGerarPara(v) }}
                      className="flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors"
                      title="Gerar contrato em PDF a partir do modelo do produto"
                    >
                      <FileSignature className="h-3.5 w-3.5" /> Gerar contrato
                    </button>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.cls}`}>{badge.label}</span>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {selecionada && <VendaModal venda={selecionada} onClose={() => setSelecionada(null)} />}

      {gerarPara && (
        <GerarContratoModal
          open={!!gerarPara}
          onClose={() => setGerarPara(null)}
          dados={vendaParaDados(gerarPara)}
          produtoId={gerarPara.produto_id}
          vendaPendenteId={gerarPara.id}
        />
      )}
    </div>
  )
}

interface OppCandidata {
  oportunidade_id: string
  titulo: string | null
  pipeline_name: string | null
  status: string | null
  data_lead_recebido: string | null
  sdr_name: string | null
  vendedor_closer: string | null
}

/** Pipeline esperado para o vínculo de vendas no GHL. */
const PIPELINE_ESPERADO_LABEL = 'Vendas SQL'

/** Normaliza texto para comparação: minúsculas, sem acentos e sem espaços extras. */
function normalizarTexto(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

/** Retorna true quando o pipeline da oportunidade é o pipeline de vendas esperado ("Vendas SQL"). */
function isPipelineCorreto(pipelineName: string | null | undefined): boolean {
  if (!pipelineName) return false
  const n = normalizarTexto(pipelineName)
  return n.includes('vendas sql') || n.includes('sql')
}
interface LeadCandidato {
  contato_id: string
  contato_nome: string | null
  contato_email: string | null
  contato_telefone: string | null
  match_por: string
  oportunidades: OppCandidata[]
}

function VendaModal({ venda, onClose }: { venda: VendaPendente; onClose: () => void }) {
  const update = useUpdateVendaPendente()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [comprovanteUrls, setComprovanteUrls] = useState<Record<string, string>>({})
  // Índice do comprovante aberto no visualizador (null = fechado). São dois
  // estados porque a lista em edição pode diferir da salva (arquivo removido
  // mas ainda não gravado) — um índice só apontaria para o arquivo errado.
  const [visualizando, setVisualizando] = useState<number | null>(null)
  const [visualizandoEdit, setVisualizandoEdit] = useState<number | null>(null)
  const [copiado, setCopiado] = useState(false)
  const [copiadoInfos, setCopiadoInfos] = useState(false)
  const [candidatos, setCandidatos] = useState<LeadCandidato[] | null>(null)
  const [buscandoLead, setBuscandoLead] = useState(false)
  const [oppSelecionada, setOppSelecionada] = useState<string | null>(venda.ghl_oportunidade_id ?? null)
  const [sincronizando, setSincronizando] = useState(false)
  const [erroSync, setErroSync] = useState<string | null>(null)

  // Edição dos dados do cliente direto no onboarding (libera corrigir nº errado, e-mail, etc).
  const [editando, setEditando] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erroEdicao, setErroEdicao] = useState<string | null>(null)
  // Releitura do comprovante (OCR no navegador) pra preencher o identificador
  // de pagamento quando o closer não mandou, ou quando o palpite saiu errado.
  const [lendoComprovante, setLendoComprovante] = useState(false)
  const [erroOcr, setErroOcr] = useState<string | null>(null)
  const [form, setForm] = useState(() => ({
    cliente_nome: venda.cliente_nome ?? '',
    cliente_whatsapp: venda.cliente_whatsapp ?? '',
    cliente_email: venda.cliente_email ?? '',
    cliente_cpf_cnpj: venda.cliente_cpf_cnpj ?? '',
    cliente_razao_social: venda.cliente_razao_social ?? '',
    cliente_instagram: venda.cliente_instagram ?? '',
    identificador_pagamento: venda.identificador_pagamento ?? '',
    cliente_logradouro: venda.cliente_logradouro ?? '',
    cliente_numero: venda.cliente_numero ?? '',
    cliente_complemento: venda.cliente_complemento ?? '',
    cliente_bairro: venda.cliente_bairro ?? '',
    cliente_municipio: venda.cliente_municipio ?? '',
    cliente_uf: venda.cliente_uf ?? '',
    cliente_cep: venda.cliente_cep ?? '',
    pagador_nome: venda.pagador_nome ?? '',
    pagador_cpf_cnpj: venda.pagador_cpf_cnpj ?? '',
    pagador_relacao: venda.pagador_relacao ?? '',
    pagador_observacao: venda.pagador_observacao ?? '',
    observacoes: venda.observacoes ?? '',
  }))
  const [pagadorDiferente, setPagadorDiferente] = useState(!!venda.pagador_diferente)
  const setCampo = (k: keyof typeof form) => (val: string) => setForm((f) => ({ ...f, [k]: val }))

  // Edição dos dados da venda (produto, valor negociado, pagamentos e comprovantes) — não só os cadastrais.
  const { data: produtos } = useProdutosList()
  const [formVenda, setFormVenda] = useState(() => ({
    produto_id: venda.produto_id ?? '',
    produto_nome: venda.produto_nome ?? '',
    valor_total_venda: venda.valor_total_venda != null ? String(venda.valor_total_venda) : '',
  }))
  const [pagamentosEdit, setPagamentosEdit] = useState<PagamentoEdit[]>(
    () => venda.pagamentos.map(pagamentoToEdit),
  )
  const [comprovantesEdit, setComprovantesEdit] = useState<VendaPendenteComprovante[]>(
    () => venda.comprovantes.map((c) => ({ ...c })),
  )
  const [novosComprovantes, setNovosComprovantes] = useState<File[]>([])
  function atualizarPagamento(i: number, campo: keyof PagamentoEdit, val: string) {
    setPagamentosEdit((ps) => ps.map((p, j) => (j === i ? { ...p, [campo]: val } : p)))
  }
  function selecionarProduto(id: string) {
    const nome = produtos?.find((p) => p.id === id)?.nome ?? ''
    setFormVenda((f) => ({ ...f, produto_id: id, produto_nome: id ? nome : f.produto_nome }))
  }
  // Endereço legível a partir dos dados (já refletindo edições), com fallback no campo livre antigo.
  const enderecoAtual = enderecoLegivel({ ...venda, ...form })

  const waNumero = useMemo(() => {
    // O form público salva em formato E.164 (+5511...). Pra wa.me basta os dígitos.
    // Cobre fallback: se vier um número antigo sem DDI (10-11 dígitos), assume Brasil.
    const raw = (form.cliente_whatsapp ?? '').trim()
    const d = onlyDigits(raw)
    if (raw.startsWith('+')) return d
    if (d.length === 10 || d.length === 11) return `55${d}`
    return d
  }, [form.cliente_whatsapp])

  const totalPagamentos = venda.pagamentos.reduce((acc, p) => acc + Number(p.valor || 0), 0)

  useEffect(() => {
    Promise.all(
      venda.comprovantes.map(async (c) => {
        try { return [c.storage_path, await getComprovanteUrl(c.storage_path)] as const }
        catch { return [c.storage_path, ''] as const }
      })
    ).then((entries) => {
      setComprovanteUrls(Object.fromEntries(entries))
    })
  }, [venda.id, venda.comprovantes])

  // Busca candidatos de lead no CRM (GHL) para o passo de vínculo.
  useEffect(() => {
    if (venda.sincronizado_em) return
    setBuscandoLead(true)
    supabase.functions
      .invoke('vendas-buscar-lead-crm', {
        body: { telefone: venda.cliente_whatsapp, email: venda.cliente_email },
      })
      .then(({ data, error }) => {
        if (error) { setCandidatos([]); return }
        const cands = (data as { candidatos?: LeadCandidato[] })?.candidatos ?? []
        setCandidatos(cands)
        const primeira = cands[0]?.oportunidades?.[0]?.oportunidade_id
        if (primeira) setOppSelecionada((prev) => prev ?? primeira)
      })
      .catch(() => setCandidatos([]))
      .finally(() => setBuscandoLead(false))
  }, [venda.id, venda.sincronizado_em, venda.cliente_whatsapp, venda.cliente_email])

  // A IA abre imagem e PDF — basta existir comprovante.
  const temComprovanteLegivel = venda.comprovantes.length > 0

  /**
   * Pede à IA o nome de quem pagou e joga no campo, sem salvar.
   *
   * Mesmo quando a leitura vem com confiança alta, aqui a alteração fica
   * pendente de confirmação: a pessoa abriu a venda para conferir, e trocar um
   * campo debaixo dela sem avisar é pior que pedir um clique a mais.
   */
  async function relerComprovante() {
    setErroOcr(null)
    setLendoComprovante(true)
    try {
      const r = await lerComprovanteComIa(venda.id, { gravar: false })
      if (r.identificador) {
        setForm((f) => ({ ...f, identificador_pagamento: r.identificador! }))
        setEditando(true) // visível e pendente de salvar — quem confirma é a pessoa
        if (r.confianca !== 'alta') {
          setErroOcr(`Palpite de confiança ${r.confianca}${r.motivo ? `: ${r.motivo}` : ''}. Confira antes de salvar.`)
        }
        return
      }
      setErroOcr(
        r.erro
          ? 'Falha ao ler o comprovante. Tente de novo.'
          : 'A IA não identificou quem pagou neste comprovante. Digite como aparece no extrato.',
      )
    } catch {
      setErroOcr('Falha ao ler o comprovante. Tente de novo.')
    } finally {
      setLendoComprovante(false)
    }
  }

  async function copyNumero() {
    await navigator.clipboard.writeText(form.cliente_whatsapp)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 1500)
  }

  async function copyInfos() {
    const linhas: string[] = [
      'Olá! Antes de seguir, preciso confirmar alguns dados com você:',
      '',
      `*Nome:* ${form.cliente_nome}`,
    ]
    if (form.cliente_razao_social) linhas.push(`*Razão social:* ${form.cliente_razao_social}`)
    if (form.cliente_cpf_cnpj)     linhas.push(`*CPF/CNPJ:* ${form.cliente_cpf_cnpj}`)
    if (form.cliente_email)        linhas.push(`*E-mail:* ${form.cliente_email}`)
    linhas.push(`*WhatsApp:* ${form.cliente_whatsapp}`)
    if (form.cliente_instagram)    linhas.push(`*Instagram:* ${form.cliente_instagram}`)
    const endereco = enderecoAtual
    if (endereco !== '—') linhas.push(`*Endereço:* ${endereco}`)
    if (venda.produto_nome)         linhas.push(`*Produto:* ${venda.produto_nome}`)

    if (pagadorDiferente && form.pagador_nome.trim()) {
      linhas.push('', `⚠️ *Pagamento feito por outra pessoa:* ${form.pagador_nome.trim()}`)
      if (form.pagador_cpf_cnpj.trim()) linhas.push(`*CPF/CNPJ de quem pagou:* ${form.pagador_cpf_cnpj.trim()}`)
      if (form.pagador_relacao.trim())  linhas.push(`*Relação:* ${form.pagador_relacao.trim()}`)
    }

    if (venda.pagamentos?.length > 0) {
      linhas.push('', '*Pagamentos:*')
      venda.pagamentos.forEach((p, i) => {
        linhas.push(`${i + 1}. ${p.sinal} — ${fmtBRL(Number(p.valor))} (${p.forma} · ${p.plataforma}) em ${fmtDataPagamento(p.data)}`)
      })
      linhas.push(`*Total:* ${fmtBRL(totalPagamentos)}`)
    }

    linhas.push('', 'Está tudo correto?')

    const texto = linhas.join('\n')
    try {
      await navigator.clipboard.writeText(texto)
      setCopiadoInfos(true)
      setTimeout(() => setCopiadoInfos(false), 2000)
    } catch {
      alert('Não consegui copiar. Selecione manualmente:\n\n' + texto)
    }
  }

  function abrirChat() {
    if (!waNumero) return
    if (venda.status === 'pendente') {
      update.mutate({ id: venda.id, status: 'em_atendimento', atendido_por: user?.id ?? null, atendido_em: new Date().toISOString() })
    }
    const params = new URLSearchParams({
      novaConversa: 'true',
      nome: form.cliente_nome,
      whatsapp: waNumero,
    })
    navigate(`/chat?${params.toString()}`)
    onClose()
  }

  // Nome do pipeline da oportunidade escolhida (para registrar junto com o vínculo).
  function pipelineDaOppSelecionada(): string | null {
    if (!oppSelecionada) return null
    return (
      candidatos
        ?.flatMap((c) => c.oportunidades)
        .find((o) => o.oportunidade_id === oppSelecionada)?.pipeline_name ?? null
    )
  }

  async function concluirEVincular() {
    setErroSync(null)
    // Sem oportunidade escolhida: conclui mesmo assim, mas fica na fila de pendência de vínculo.
    if (!oppSelecionada) {
      update.mutate({ id: venda.id, status: 'concluida', atendido_por: user?.id ?? null, atendido_em: new Date().toISOString() })
      onClose()
      return
    }
    setSincronizando(true)
    const { data, error } = await supabase.functions.invoke('vendas-sincronizar-crm', {
      body: { venda_id: venda.id, oportunidade_id: oppSelecionada, pipeline_name: pipelineDaOppSelecionada() },
    })
    setSincronizando(false)
    if (error || (data as { error?: string })?.error) {
      setErroSync('Não consegui enviar a venda ao CRM. Verifique a conexão e tente de novo.')
      return
    }
    update.mutate({ id: venda.id, status: 'concluida', atendido_por: user?.id ?? null, atendido_em: new Date().toISOString() })
    onClose()
  }

  // Resolução posterior: vincula/sincroniza uma venda que já foi concluída sem vínculo.
  async function vincularPosterior() {
    if (!oppSelecionada) { setErroSync('Selecione uma oportunidade para vincular.'); return }
    setErroSync(null)
    setSincronizando(true)
    const { data, error } = await supabase.functions.invoke('vendas-sincronizar-crm', {
      body: { venda_id: venda.id, oportunidade_id: oppSelecionada, pipeline_name: pipelineDaOppSelecionada() },
    })
    setSincronizando(false)
    if (error || (data as { error?: string })?.error) {
      setErroSync('Não consegui enviar a venda ao CRM. Tente de novo.')
      return
    }
    onClose()
  }

  function descartar() {
    if (!confirm('Descartar essa venda? Ela some da fila de pendentes.')) return
    update.mutate({ id: venda.id, status: 'descartada', atendido_por: user?.id ?? null, atendido_em: new Date().toISOString() })
    onClose()
  }

  function cancelarEdicao() {
    setForm({
      cliente_nome: venda.cliente_nome ?? '',
      cliente_whatsapp: venda.cliente_whatsapp ?? '',
      cliente_email: venda.cliente_email ?? '',
      cliente_cpf_cnpj: venda.cliente_cpf_cnpj ?? '',
      cliente_razao_social: venda.cliente_razao_social ?? '',
      cliente_instagram: venda.cliente_instagram ?? '',
    identificador_pagamento: venda.identificador_pagamento ?? '',
      cliente_logradouro: venda.cliente_logradouro ?? '',
      cliente_numero: venda.cliente_numero ?? '',
      cliente_complemento: venda.cliente_complemento ?? '',
      cliente_bairro: venda.cliente_bairro ?? '',
      cliente_municipio: venda.cliente_municipio ?? '',
      cliente_uf: venda.cliente_uf ?? '',
      cliente_cep: venda.cliente_cep ?? '',
      pagador_nome: venda.pagador_nome ?? '',
      pagador_cpf_cnpj: venda.pagador_cpf_cnpj ?? '',
      pagador_relacao: venda.pagador_relacao ?? '',
      pagador_observacao: venda.pagador_observacao ?? '',
      observacoes: venda.observacoes ?? '',
    })
    setPagadorDiferente(!!venda.pagador_diferente)
    setFormVenda({
      produto_id: venda.produto_id ?? '',
      produto_nome: venda.produto_nome ?? '',
      valor_total_venda: venda.valor_total_venda != null ? String(venda.valor_total_venda) : '',
    })
    setPagamentosEdit(venda.pagamentos.map(pagamentoToEdit))
    setComprovantesEdit(venda.comprovantes.map((c) => ({ ...c })))
    setNovosComprovantes([])
    setErroEdicao(null)
    setEditando(false)
  }

  async function salvarEdicao() {
    if (!form.cliente_nome.trim()) { setErroEdicao('O nome do cliente é obrigatório.'); return }
    setErroEdicao(null)
    setSalvando(true)
    const wppNormalizado = normalizeWhatsapp(form.cliente_whatsapp)

    // Valores finais já normalizados (o que de fato vai pro banco).
    const finais: Record<string, string | null> = {
      cliente_nome: form.cliente_nome.trim(),
      cliente_whatsapp: wppNormalizado,
      cliente_email: orNull(form.cliente_email),
      cliente_cpf_cnpj: orNull(form.cliente_cpf_cnpj),
      cliente_razao_social: orNull(form.cliente_razao_social),
      cliente_instagram: orNull(form.cliente_instagram),
      cliente_logradouro: orNull(form.cliente_logradouro),
      cliente_numero: orNull(form.cliente_numero),
      cliente_complemento: orNull(form.cliente_complemento),
      cliente_bairro: orNull(form.cliente_bairro),
      cliente_municipio: orNull(form.cliente_municipio),
      cliente_uf: orNull(form.cliente_uf),
      cliente_cep: orNull(form.cliente_cep),
      identificador_pagamento: orNull(form.identificador_pagamento),
      pagador_nome: pagadorDiferente ? orNull(form.pagador_nome) : null,
      pagador_cpf_cnpj: pagadorDiferente ? orNull(form.pagador_cpf_cnpj) : null,
      pagador_relacao: pagadorDiferente ? orNull(form.pagador_relacao) : null,
      pagador_observacao: pagadorDiferente ? orNull(form.pagador_observacao) : null,
      observacoes: orNull(form.observacoes),
    }

    // Calcula o diff comparando com o valor original da venda.
    const agora = new Date().toISOString()
    const novasEdicoes: VendaPendenteEdicao[] = CAMPOS_EDITAVEIS.flatMap(({ campo, label }) => {
      const antes = (venda[campo as keyof VendaPendente] as string | null) ?? null
      const depois = finais[campo] ?? null
      if ((antes ?? '') === (depois ?? '')) return []
      return [{ campo, label, antes, depois, em: agora, por_nome: user?.nome ?? null }]
    })

    // Diff dos dados da venda (produto, valor negociado, pagamentos e comprovantes).
    const patchVenda: Partial<VendaPendente> = {}

    // Pagamento por terceiro (flag booleana) — os campos de texto do pagador
    // entram pelo diff de CAMPOS_EDITAVEIS acima.
    if (!!venda.pagador_diferente !== pagadorDiferente) {
      patchVenda.pagador_diferente = pagadorDiferente
      novasEdicoes.push({
        campo: 'pagador_diferente',
        label: 'Pagamento por terceiro',
        antes: venda.pagador_diferente ? 'Sim' : 'Não',
        depois: pagadorDiferente ? 'Sim' : 'Não',
        em: agora,
        por_nome: user?.nome ?? null,
      })
    }

    const produtoIdNovo = formVenda.produto_id || null
    const produtoNomeNovo = orNull(formVenda.produto_nome)
    if ((venda.produto_id ?? null) !== produtoIdNovo || (venda.produto_nome ?? '') !== (produtoNomeNovo ?? '')) {
      patchVenda.produto_id = produtoIdNovo
      patchVenda.produto_nome = produtoNomeNovo
      novasEdicoes.push({ campo: 'produto_nome', label: 'Produto', antes: venda.produto_nome, depois: produtoNomeNovo, em: agora, por_nome: user?.nome ?? null })
    }

    const valorStr = formVenda.valor_total_venda.trim().replace(',', '.')
    const valorNovo = valorStr === '' ? null : Number(valorStr)
    if (valorNovo != null && Number.isNaN(valorNovo)) {
      setErroEdicao('Valor total negociado inválido.')
      setSalvando(false)
      return
    }
    const valorAntigo = venda.valor_total_venda != null ? Number(venda.valor_total_venda) : null
    if (valorAntigo !== valorNovo) {
      patchVenda.valor_total_venda = valorNovo
      novasEdicoes.push({
        campo: 'valor_total_venda',
        label: 'Valor total negociado',
        antes: valorAntigo != null ? fmtBRL(valorAntigo) : null,
        depois: valorNovo != null ? fmtBRL(valorNovo) : null,
        em: agora,
        por_nome: user?.nome ?? null,
      })
    }

    const pagamentosNovos: VendaPendentePagamento[] = pagamentosEdit
      .filter((p) => p.data || p.valor.trim() || p.forma.trim() || p.plataforma.trim() || p.sinal.trim())
      .map((p) => ({
        data: p.data,
        valor: Number(p.valor.replace(',', '.')) || 0,
        forma: p.forma.trim(),
        plataforma: p.plataforma.trim(),
        sinal: p.sinal.trim(),
      }))
    if (pagamentosNovos.some((p) => !p.data)) {
      setErroEdicao('Todo pagamento precisa de uma data.')
      setSalvando(false)
      return
    }
    if (pagamentosComparaveis(venda.pagamentos) !== pagamentosComparaveis(pagamentosNovos)) {
      patchVenda.pagamentos = pagamentosNovos
      novasEdicoes.push({
        campo: 'pagamentos',
        label: 'Pagamentos',
        antes: resumoPagamentos(venda.pagamentos),
        depois: resumoPagamentos(pagamentosNovos),
        em: agora,
        por_nome: user?.nome ?? null,
      })
    }

    // Comprovantes: sobe os novos arquivos pro bucket e monta a lista final.
    let comprovantesFinais = comprovantesEdit
    if (novosComprovantes.length > 0) {
      const enviados: VendaPendenteComprovante[] = []
      for (const file of novosComprovantes) {
        const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '')
        const path = `vendas/${venda.id}/${crypto.randomUUID()}.${ext}`
        const { error: upErr } = await supabase.storage
          .from('vendas-comprovantes')
          .upload(path, file, { contentType: file.type, upsert: false })
        if (upErr) {
          setErroEdicao(`Falha ao enviar o comprovante "${file.name}": ${upErr.message}`)
          setSalvando(false)
          return
        }
        enviados.push({ storage_path: path, nome_original: file.name, mime_type: file.type, tamanho_bytes: file.size })
      }
      comprovantesFinais = [...comprovantesEdit, ...enviados]
    }
    const comprovantesMudaram =
      JSON.stringify(comprovantesFinais.map((c) => c.storage_path))
      !== JSON.stringify(venda.comprovantes.map((c) => c.storage_path))
    if (comprovantesMudaram) {
      patchVenda.comprovantes = comprovantesFinais
      novasEdicoes.push({
        campo: 'comprovantes',
        label: 'Comprovantes',
        antes: `${venda.comprovantes.length} arquivo(s)`,
        depois: `${comprovantesFinais.length} arquivo(s)`,
        em: agora,
        por_nome: user?.nome ?? null,
      })
    }

    if (novasEdicoes.length === 0) { setEditando(false); setSalvando(false); return }

    const historicoAtualizado = [...novasEdicoes, ...(venda.historico_edicoes ?? [])]
    try {
      await update.mutateAsync({
        id: venda.id,
        ...finais,
        ...patchVenda,
        historico_edicoes: historicoAtualizado,
      } as Partial<VendaPendente> & { id: string })
      // Reflete na tela sem precisar reabrir o modal.
      setForm((f) => ({ ...f, cliente_whatsapp: wppNormalizado }))
      Object.assign(venda, patchVenda)
      venda.observacoes = finais.observacoes ?? null
      venda.identificador_pagamento = finais.identificador_pagamento ?? null
      venda.pagador_nome = finais.pagador_nome ?? null
      venda.pagador_cpf_cnpj = finais.pagador_cpf_cnpj ?? null
      venda.pagador_relacao = finais.pagador_relacao ?? null
      venda.pagador_observacao = finais.pagador_observacao ?? null
      venda.historico_edicoes = historicoAtualizado
      setPagamentosEdit(venda.pagamentos.map(pagamentoToEdit))
      setComprovantesEdit(venda.comprovantes.map((c) => ({ ...c })))
      setNovosComprovantes([])
      setEditando(false)
    } catch {
      setErroEdicao('Não consegui salvar as alterações. Tente de novo.')
    } finally {
      setSalvando(false)
    }
  }

  const badge = statusBadge(venda.status)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-3xl glass-card bg-card my-auto flex flex-col max-h-[92vh] overflow-hidden p-0">
        {/* Header fixo */}
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-border shrink-0">
          <div className="min-w-0">
            <h3 className="text-base font-bold text-foreground truncate">{form.cliente_nome || venda.cliente_nome}</h3>
            <p className="text-xs text-muted-foreground flex flex-wrap items-center gap-1.5 mt-0.5">
              <span>Enviada em {fmtDate(venda.criado_em)} ·</span>
              <span className={`rounded-full px-2 py-0.5 text-xs ${badge.cls}`}>{badge.label}</span>
              <BadgeEditado edicoes={venda.historico_edicoes} />
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {!editando && (
              <button
                onClick={() => setEditando(true)}
                className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 h-8 text-xs font-medium text-foreground hover:bg-muted"
                title="Editar dados da venda"
              >
                <Pencil className="h-3.5 w-3.5" /> Editar
              </button>
            )}
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
          </div>
        </div>

        {/* Corpo rolável */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

        {editando ? (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Nome" value={form.cliente_nome} onChange={setCampo('cliente_nome')} />
              <Field label="WhatsApp" value={form.cliente_whatsapp} onChange={setCampo('cliente_whatsapp')} placeholder="(86) 99929-1729" />
              <Field label="E-mail" value={form.cliente_email} onChange={setCampo('cliente_email')} type="email" />
              <Field label="CPF / CNPJ" value={form.cliente_cpf_cnpj} onChange={setCampo('cliente_cpf_cnpj')} />
              <Field label="Razão social" value={form.cliente_razao_social} onChange={setCampo('cliente_razao_social')} />
              <Field label="Instagram" value={form.cliente_instagram} onChange={setCampo('cliente_instagram')} />
              <div className="sm:col-span-2 space-y-1">
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <Field
                      label="Identificador de pagamento"
                      value={form.identificador_pagamento}
                      onChange={setCampo('identificador_pagamento')}
                      placeholder="Nome que aparece no extrato do banco"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={relerComprovante}
                    disabled={lendoComprovante || !temComprovanteLegivel}
                    className="h-[34px] shrink-0 rounded-lg border border-border px-2.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50 inline-flex items-center gap-1.5"
                    title={temComprovanteLegivel ? 'Ler o nome direto do comprovante' : 'Nenhum comprovante em imagem para ler (PDF e HEIC não dá)'}
                  >
                    {lendoComprovante
                      ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Lendo…</>
                      : <><ScanLine className="h-3.5 w-3.5" /> Ler comprovante</>}
                  </button>
                </div>
                {erroOcr && <p className="text-xs text-warning">{erroOcr}</p>}
              </div>
            </div>
            <div className="rounded-lg border border-border p-3 space-y-3">
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Endereço</p>
              <div className="grid grid-cols-1 sm:grid-cols-6 gap-3">
                <div className="sm:col-span-4"><Field label="Logradouro" value={form.cliente_logradouro} onChange={setCampo('cliente_logradouro')} /></div>
                <div className="sm:col-span-2"><Field label="Número" value={form.cliente_numero} onChange={setCampo('cliente_numero')} /></div>
                <div className="sm:col-span-3"><Field label="Complemento" value={form.cliente_complemento} onChange={setCampo('cliente_complemento')} /></div>
                <div className="sm:col-span-3"><Field label="Bairro" value={form.cliente_bairro} onChange={setCampo('cliente_bairro')} /></div>
                <div className="sm:col-span-3"><Field label="Município" value={form.cliente_municipio} onChange={setCampo('cliente_municipio')} /></div>
                <div className="sm:col-span-1"><Field label="UF" value={form.cliente_uf} onChange={setCampo('cliente_uf')} placeholder="PI" /></div>
                <div className="sm:col-span-2"><Field label="CEP" value={form.cliente_cep} onChange={setCampo('cliente_cep')} placeholder="64049-532" /></div>
              </div>
            </div>
            <div className="rounded-lg border border-border p-3 space-y-3">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={pagadorDiferente}
                  onChange={(e) => setPagadorDiferente(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-border accent-primary"
                />
                <span className="text-sm">
                  <span className="font-medium text-foreground">Pagamento feito por outra pessoa</span>
                  <span className="block text-xs text-muted-foreground">O contrato está no nome do cliente, mas quem pagou é outra pessoa/empresa.</span>
                </span>
              </label>
              {pagadorDiferente && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2"><Field label="Nome de quem pagou" value={form.pagador_nome} onChange={setCampo('pagador_nome')} /></div>
                  <Field label="CPF / CNPJ de quem pagou" value={form.pagador_cpf_cnpj} onChange={setCampo('pagador_cpf_cnpj')} />
                  <Field label="Relação com o cliente" value={form.pagador_relacao} onChange={setCampo('pagador_relacao')} placeholder="Sócio, cônjuge, empresa…" />
                  <div className="sm:col-span-2"><Field label="Observação" value={form.pagador_observacao} onChange={setCampo('pagador_observacao')} /></div>
                </div>
              )}
            </div>
            <div className="rounded-lg border border-border p-3 space-y-3">
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Venda</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Produto</label>
                  <select
                    value={formVenda.produto_id}
                    onChange={(e) => selecionarProduto(e.target.value)}
                    className="mt-0.5 w-full rounded-lg border border-border bg-background px-2.5 py-[7px] text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                  >
                    <option value="">
                      {formVenda.produto_nome && !formVenda.produto_id
                        ? `${formVenda.produto_nome} (atual, fora da lista)`
                        : '— selecione —'}
                    </option>
                    {produtos?.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                  </select>
                </div>
                <Field label="Valor total negociado (R$)" value={formVenda.valor_total_venda} onChange={(v) => setFormVenda((f) => ({ ...f, valor_total_venda: v }))} placeholder="12000" />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">Pagamentos</p>
                  <button
                    type="button"
                    onClick={() => setPagamentosEdit((ps) => [...ps, { data: new Date().toISOString().slice(0, 10), valor: '', forma: '', plataforma: '', sinal: '' }])}
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    + Adicionar pagamento
                  </button>
                </div>
                {pagamentosEdit.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nenhum pagamento.</p>
                ) : (
                  pagamentosEdit.map((p, i) => (
                    <div key={i} className="grid grid-cols-2 sm:grid-cols-6 gap-2 items-end">
                      <Field label="Data" type="date" value={p.data} onChange={(v) => atualizarPagamento(i, 'data', v)} />
                      <Field label="Valor (R$)" value={p.valor} onChange={(v) => atualizarPagamento(i, 'valor', v)} placeholder="1500" />
                      <Field label="Forma" value={p.forma} onChange={(v) => atualizarPagamento(i, 'forma', v)} placeholder="PIX" />
                      <Field label="Plataforma" value={p.plataforma} onChange={(v) => atualizarPagamento(i, 'plataforma', v)} />
                      <Field label="Sinal" value={p.sinal} onChange={(v) => atualizarPagamento(i, 'sinal', v)} />
                      <button
                        type="button"
                        onClick={() => setPagamentosEdit((ps) => ps.filter((_, j) => j !== i))}
                        className="h-[34px] rounded-lg border border-border text-xs font-medium text-muted-foreground hover:text-danger hover:border-danger/40 hover:bg-danger-light transition-colors"
                      >
                        Remover
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
            <div className="rounded-lg border border-border p-3 space-y-3">
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Comprovantes</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {comprovantesEdit.map((c, i) => {
                  const url = comprovanteUrls[c.storage_path]
                  return (
                    <div key={c.storage_path} className="relative aspect-square rounded-lg border border-border overflow-hidden bg-muted flex items-center justify-center" title={`${c.nome_original} — clique para ampliar`}>
                      {!url ? (
                        <FileImage className="h-6 w-6 text-muted-foreground" />
                      ) : (
                        <button
                          type="button"
                          onClick={() => setVisualizandoEdit(i)}
                          className="h-full w-full"
                        >
                          {ehPdf(c.nome_original, c.mime_type) ? (
                            <span className="flex h-full flex-col items-center justify-center gap-1 p-2 text-center hover:opacity-80">
                              <FileText className="h-6 w-6 text-muted-foreground" />
                              <span className="text-[10px] text-foreground line-clamp-2 break-all">{c.nome_original}</span>
                              <span className="text-[9px] text-muted-foreground">PDF · ampliar</span>
                            </span>
                          ) : (
                            <img src={url} alt={c.nome_original} className="w-full h-full object-cover" />
                          )}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setComprovantesEdit((cs) => cs.filter((x) => x.storage_path !== c.storage_path))}
                        className="absolute top-1 right-1 rounded-full bg-foreground/70 text-background p-1 hover:bg-danger transition-colors"
                        title="Remover comprovante"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  )
                })}
                {novosComprovantes.map((f, i) => (
                  <div key={`${f.name}-${i}`} className="relative aspect-square rounded-lg border border-dashed border-primary/50 bg-primary/5 p-2 flex flex-col items-center justify-center text-center gap-1" title={f.name}>
                    <FileImage className="h-5 w-5 text-primary" />
                    <span className="text-[10px] text-foreground line-clamp-2 break-all">{f.name}</span>
                    <span className="text-[9px] text-muted-foreground">novo</span>
                    <button
                      type="button"
                      onClick={() => setNovosComprovantes((ns) => ns.filter((_, j) => j !== i))}
                      className="absolute top-1 right-1 rounded-full bg-foreground/70 text-background p-1 hover:bg-danger transition-colors"
                      title="Remover"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                <label className="aspect-square rounded-lg border border-dashed border-border hover:border-primary/60 hover:bg-muted/40 transition-colors cursor-pointer flex flex-col items-center justify-center gap-1 text-muted-foreground hover:text-foreground">
                  <Plus className="h-5 w-5" />
                  <span className="text-[10px] font-medium">Adicionar</span>
                  <input
                    type="file"
                    multiple
                    accept="image/*,.pdf"
                    className="hidden"
                    onChange={(e) => {
                      const fs = Array.from(e.target.files ?? [])
                      if (fs.length > 0) setNovosComprovantes((ns) => [...ns, ...fs])
                      e.target.value = ''
                    }}
                  />
                </label>
              </div>
            </div>
            {visualizandoEdit !== null && (
              <VisualizadorComprovante
                arquivos={comprovantesEdit.map((c) => ({
                  storage_path: c.storage_path,
                  nome_original: c.nome_original,
                  mime_type: c.mime_type,
                  url: comprovanteUrls[c.storage_path],
                }))}
                indiceInicial={visualizandoEdit}
                onFechar={() => setVisualizandoEdit(null)}
              />
            )}
            <div className="rounded-lg border border-border p-3 space-y-2">
              <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Observação</label>
              <textarea
                value={form.observacoes}
                onChange={(e) => setCampo('observacoes')(e.target.value)}
                rows={6}
                placeholder="Detalhes do contrato, ajustes negociados, condições especiais…"
                className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 resize-y"
              />
            </div>
            {erroEdicao && (
              <div className="rounded-lg border border-danger/40 bg-danger-light p-2.5 text-sm text-danger">{erroEdicao}</div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <Info label="WhatsApp">
              <div className="flex items-center gap-2">
                <span className="font-medium text-foreground">{formatWhatsapp(form.cliente_whatsapp)}</span>
                <button onClick={copyNumero} className="p-1 rounded hover:bg-muted" title="Copiar">
                  <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
                {copiado && <span className="text-xs text-success">copiado!</span>}
              </div>
            </Info>
            <Info label="E-mail">{form.cliente_email || '—'}</Info>
            <Info label="CPF / CNPJ">{form.cliente_cpf_cnpj || '—'}</Info>
            <Info label="Razão social">{form.cliente_razao_social || '—'}</Info>
            <Info label="Instagram">{form.cliente_instagram || '—'}</Info>
            <Info label="Identificador de pagamento">
              <div className="flex items-center gap-2">
                <span className={form.identificador_pagamento ? 'font-medium text-foreground' : 'text-muted-foreground'}>
                  {form.identificador_pagamento || 'não informado'}
                </span>
                <button
                  onClick={relerComprovante}
                  disabled={lendoComprovante || !temComprovanteLegivel}
                  className="p-1 rounded hover:bg-muted disabled:opacity-40"
                  title={temComprovanteLegivel ? 'Ler o nome direto do comprovante' : 'Nenhum comprovante em imagem para ler'}
                >
                  {lendoComprovante
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                    : <ScanLine className="h-3.5 w-3.5 text-muted-foreground" />}
                </button>
              </div>
              {erroOcr && <p className="text-xs text-warning">{erroOcr}</p>}
            </Info>
            <Info label="Endereço">{enderecoAtual}</Info>
            <Info label="Produto">{venda.produto_nome ?? '—'}</Info>
            <Info label="Valor total negociado">{venda.valor_total_venda != null ? fmtBRL(venda.valor_total_venda) : '—'}</Info>
            <Info label="Closer">{venda.closer_nome} <span className="text-xs text-muted-foreground">({venda.closer_email})</span></Info>
          </div>
        )}

        {!editando && venda.pagador_diferente && (
          <div className="rounded-lg border border-warning/50 bg-warning/10 p-3 space-y-1.5 animate-fade-in">
            <div className="flex items-center gap-2 text-warning">
              <Users className="h-4 w-4" />
              <span className="text-xs font-bold uppercase tracking-wide">Pagamento feito por outra pessoa</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <p><span className="text-muted-foreground">Quem pagou:</span> <span className="font-medium text-foreground">{venda.pagador_nome || '—'}</span></p>
              {venda.pagador_cpf_cnpj && <p><span className="text-muted-foreground">CPF/CNPJ:</span> <span className="font-medium text-foreground">{venda.pagador_cpf_cnpj}</span></p>}
              {venda.pagador_relacao && <p><span className="text-muted-foreground">Relação:</span> <span className="font-medium text-foreground">{venda.pagador_relacao}</span></p>}
              {venda.pagador_observacao && <p className="sm:col-span-2"><span className="text-muted-foreground">Obs.:</span> <span className="text-foreground">{venda.pagador_observacao}</span></p>}
            </div>
          </div>
        )}

        {venda.pagamentos.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Pagamentos</h4>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-left text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Sinal</th>
                    <th className="px-3 py-2 font-medium">Data</th>
                    <th className="px-3 py-2 font-medium text-right">Valor</th>
                    <th className="px-3 py-2 font-medium">Forma</th>
                    <th className="px-3 py-2 font-medium">Plataforma</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {venda.pagamentos.map((p, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2 text-muted-foreground">{p.sinal || '—'}</td>
                      <td className="px-3 py-2 text-muted-foreground">{fmtDataPagamento(p.data)}</td>
                      <td className="px-3 py-2 text-right font-medium text-foreground tabular-nums">{fmtBRL(Number(p.valor))}</td>
                      <td className="px-3 py-2">{p.forma || '—'}</td>
                      <td className="px-3 py-2">{p.plataforma || '—'}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border bg-muted/40">
                    <td className="px-3 py-2 font-medium text-muted-foreground" colSpan={2}>Total</td>
                    <td className="px-3 py-2 text-right font-bold text-foreground tabular-nums">{fmtBRL(totalPagamentos)}</td>
                    <td className="px-3 py-2" colSpan={2}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {venda.comprovantes.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Comprovantes</h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {venda.comprovantes.map((c, i) => {
                const url = comprovanteUrls[c.storage_path]
                return (
                  // Abre no visualizador desta tela, não em outra aba: quem
                  // confere precisa do comprovante e do cadastro lado a lado.
                  <button
                    key={c.storage_path}
                    type="button"
                    onClick={() => setVisualizando(i)}
                    className="aspect-square rounded-lg border border-border overflow-hidden bg-muted flex items-center justify-center hover:opacity-90 hover:border-primary/50 transition-colors"
                    title={`${c.nome_original} — clique para ampliar`}
                  >
                    {!url ? (
                      <FileImage className="h-6 w-6 text-muted-foreground" />
                    ) : ehPdf(c.nome_original, c.mime_type) ? (
                      <span className="flex flex-col items-center justify-center gap-1 p-2 text-center">
                        <FileText className="h-6 w-6 text-muted-foreground" />
                        <span className="text-[10px] text-foreground line-clamp-2 break-all">{c.nome_original}</span>
                        <span className="text-[9px] text-muted-foreground">PDF · ampliar</span>
                      </span>
                    ) : (
                      <img src={url} alt={c.nome_original} className="w-full h-full object-cover" />
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {visualizando !== null && (
          <VisualizadorComprovante
            arquivos={venda.comprovantes.map((c) => ({
              storage_path: c.storage_path,
              nome_original: c.nome_original,
              mime_type: c.mime_type,
              url: comprovanteUrls[c.storage_path],
            }))}
            indiceInicial={visualizando}
            onFechar={() => setVisualizando(null)}
          />
        )}

        {venda.observacoes && (
          <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm whitespace-pre-wrap">
            {venda.observacoes}
          </div>
        )}

        {/* Vínculo com o CRM (GHL) */}
        {venda.sincronizado_em ? (
          <div className="space-y-2">
            <div className="rounded-lg border border-success/40 bg-success/10 p-2.5 text-sm text-foreground">
              Venda sincronizada com o CRM em {fmtDate(venda.sincronizado_em)}.
              <span className="mt-1 block text-[11px] text-muted-foreground">
                Qualquer alteração feita aqui é enviada ao CRM na hora.
              </span>
            </div>
            {venda.sincronizacao_erro && (
              <div className="rounded-lg border border-danger/40 bg-danger-light p-2.5 text-[11px] text-danger">
                O último envio automático falhou: {venda.sincronizacao_erro}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Vincular ao CRM</h4>
            {buscandoLead ? (
              <p className="text-sm text-muted-foreground">Buscando lead no CRM…</p>
            ) : !candidatos || candidatos.length === 0 ? (
              <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-foreground">
                Nenhum lead encontrado no CRM por telefone/e-mail. A venda pode ser concluída, mas ficará na <strong>fila de pendência de vínculo</strong> para resolução manual.
              </div>
            ) : (
              <div className="space-y-1.5">
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-2.5 text-[11px] leading-relaxed text-foreground">
                  Confira em qual <strong>pipeline</strong> o lead está antes de vincular. O vínculo deve ser feito no
                  pipeline correto — geralmente <strong>{PIPELINE_ESPERADO_LABEL}</strong>. Vincular no pipeline errado
                  compromete o funil e os relatórios.
                </div>
                {candidatos.flatMap((c) =>
                  c.oportunidades.map((o) => {
                    const pipelineOk = isPipelineCorreto(o.pipeline_name)
                    return (
                      <label
                        key={o.oportunidade_id}
                        className="flex items-start gap-2 rounded-lg border border-border p-2.5 cursor-pointer hover:bg-muted/40"
                      >
                        <input
                          type="radio"
                          name="opp-vinculo"
                          className="mt-1"
                          checked={oppSelecionada === o.oportunidade_id}
                          onChange={() => setOppSelecionada(o.oportunidade_id)}
                        />
                        <span className="text-xs">
                          <span className="font-medium text-foreground">{c.contato_nome ?? '—'}</span>
                          <span
                            className={`ml-1.5 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium ${
                              pipelineOk
                                ? 'bg-success/10 text-success border border-success/30'
                                : 'bg-warning/10 text-warning border border-warning/30'
                            }`}
                          >
                            {o.pipeline_name ?? 'sem pipeline'}
                          </span>
                          {o.data_lead_recebido && (
                            <span className="text-muted-foreground"> · {new Date(o.data_lead_recebido).toLocaleDateString('pt-BR')}</span>
                          )}
                          <span className="block text-[11px] text-muted-foreground">
                            match por {c.match_por} · {c.contato_telefone ?? c.contato_email ?? ''}
                          </span>
                          {!pipelineOk && (
                            <span className="mt-1 block text-[11px] font-medium text-warning">
                              ⚠ Este lead não está em {PIPELINE_ESPERADO_LABEL}. Confirme se é mesmo aqui que o vínculo deve ser feito.
                            </span>
                          )}
                        </span>
                      </label>
                    )
                  }),
                )}
              </div>
            )}
            {erroSync && (
              <div className="rounded-lg border border-danger/40 bg-danger-light p-2.5 text-sm text-danger">{erroSync}</div>
            )}
            {venda.status === 'concluida' && candidatos && candidatos.length > 0 && (
              <button
                type="button"
                onClick={vincularPosterior}
                disabled={sincronizando || !oppSelecionada}
                className="w-full rounded-lg bg-primary text-primary-foreground px-3 py-2 text-sm font-medium disabled:opacity-50"
              >
                {sincronizando ? 'Enviando…' : 'Enviar ao CRM agora'}
              </button>
            )}
          </div>
        )}

        </div>

        {/* Rodapé fixo */}
        <div className="px-5 py-3 border-t border-border shrink-0 bg-card">
          {editando ? (
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={cancelarEdicao}
                disabled={salvando}
                className="rounded-lg border border-border px-3 h-9 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={salvarEdicao}
                disabled={salvando}
                className="flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-3 h-9 text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
              >
                <Save className="h-4 w-4" /> {salvando ? 'Salvando…' : 'Salvar alterações'}
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <ActionButton
                onClick={abrirChat}
                disabled={!waNumero}
                icon={<MessageCircle className="h-4 w-4" />}
                label="Abrir chat"
                variant="primary"
              />
              <ActionButton
                onClick={copyInfos}
                icon={copiadoInfos ? <ClipboardCheck className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                label={copiadoInfos ? 'Copiado!' : 'Copiar infos'}
                title="Copia todos os dados em texto formatado pra colar no chat"
              />
              <ActionButton
                onClick={concluirEVincular}
                disabled={update.isPending || sincronizando || venda.status === 'concluida'}
                icon={<CheckCircle2 className="h-4 w-4" />}
                label={sincronizando ? 'Enviando…' : oppSelecionada ? 'Concluir + CRM' : 'Concluir'}
              />
              <ActionButton
                onClick={descartar}
                disabled={update.isPending || venda.status === 'descartada'}
                icon={<Archive className="h-4 w-4" />}
                label="Descartar"
                variant="danger"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ActionButton({
  onClick, disabled, icon, label, variant = 'default', title,
}: {
  onClick: () => void
  disabled?: boolean
  icon: React.ReactNode
  label: string
  variant?: 'default' | 'primary' | 'danger'
  title?: string
}) {
  const base = 'flex items-center justify-center gap-1.5 rounded-lg px-3 h-9 text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed'
  const styles =
    variant === 'primary'
      ? 'bg-primary text-primary-foreground hover:bg-primary/90'
      : variant === 'danger'
        ? 'border border-border text-muted-foreground hover:text-danger hover:border-danger/40 hover:bg-danger-light'
        : 'border border-border text-foreground hover:bg-muted'
  return (
    <button onClick={onClick} disabled={disabled} title={title} className={`${base} ${styles}`}>
      {icon}
      <span className="truncate">{label}</span>
    </button>
  )
}

function Field({
  label, value, onChange, type = 'text', placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  placeholder?: string
}) {
  return (
    <div>
      <label className="text-xs text-muted-foreground">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-0.5 w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
      />
    </div>
  )
}

function BadgeEditado({ edicoes }: { edicoes: VendaPendenteEdicao[] | null | undefined }) {
  if (!edicoes || edicoes.length === 0) return null
  const fmt = (v: string | null) => (v && v.trim() ? v : '—')
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center gap-1 rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-2xs font-medium text-foreground cursor-help align-middle">
            <Pencil className="h-3 w-3" /> editado
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs p-0">
          <div className="px-3 py-2 border-b border-border">
            <p className="text-xs font-semibold text-foreground">Histórico de edições</p>
          </div>
          <ul className="max-h-64 overflow-y-auto divide-y divide-border">
            {edicoes.slice(0, 12).map((e, i) => (
              <li key={i} className="px-3 py-1.5">
                <p className="text-2xs font-semibold text-foreground">{e.label}</p>
                <p className="text-2xs leading-snug">
                  <span className="text-danger line-through break-all">{fmt(e.antes)}</span>
                  <span className="text-muted-foreground"> → </span>
                  <span className="text-success break-all">{fmt(e.depois)}</span>
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {e.por_nome ?? 'alguém'} · {new Date(e.em).toLocaleString('pt-BR')}
                </p>
              </li>
            ))}
          </ul>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="text-sm text-foreground">{children}</div>
    </div>
  )
}
