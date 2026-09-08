import { useMemo, useState } from 'react'
import { FileDown, Check } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { cn } from '@/lib/utils'
import { ehRecorrentePorParcelas } from '@/pages/contratos/recorrencia'
import { normalizaTelefoneBR } from '@/lib/telefone'
import type { Contrato } from '@/hooks/useComissoes'

/**
 * Diálogo de exportação de contratos para CSV.
 *
 * A lista já vem filtrada pela tela; aqui a pessoa afina o recorte *do arquivo*
 * (só quem tem telefone, sem valores zerados, um por cliente…) e escolhe quais
 * colunas entram. O objetivo mais comum é gerar uma lista de contatos para
 * importar numa ferramenta de disparo — por isso o preset "Disparo" já sai com
 * o telefone normalizado no padrão internacional.
 */

/**
 * Byte Order Mark (U+FEFF). Sem ele o Excel abre o CSV interpretando os bytes
 * como Latin-1 e a acentuação vira caractere quebrado. Escrito por código de
 * caractere porque o símbolo em si é invisível no editor.
 */
const BOM_EXCEL = String.fromCharCode(0xfeff)

// ─── Catálogo de colunas ─────────────────────────────────────────────────────

interface ColunaCtx {
  estrategistaNome: (id: string | null) => string
  statusLabel: (valor: string | null | undefined) => string
  normalizarTelefone: boolean
}

interface ColunaDef {
  key: string
  label: string
  valor: (c: Contrato, ctx: ColunaCtx) => string | number
}

function primeiroNome(nome: string | null): string {
  return (nome ?? '').trim().split(/\s+/)[0] ?? ''
}
function sobrenome(nome: string | null): string {
  return (nome ?? '').trim().split(/\s+/).slice(1).join(' ')
}

const COLUNAS: ColunaDef[] = [
  { key: 'cliente',      label: 'Cliente',          valor: (c) => c.cliente_nome ?? '' },
  { key: 'primeiro',     label: 'Primeiro nome',    valor: (c) => primeiroNome(c.cliente_nome) },
  { key: 'sobrenome',    label: 'Sobrenome',        valor: (c) => sobrenome(c.cliente_nome) },
  { key: 'whatsapp',     label: 'WhatsApp',         valor: (c, ctx) => (ctx.normalizarTelefone ? normalizaTelefoneBR(c.whatsapp).telefone : (c.whatsapp ?? '')) },
  { key: 'email',        label: 'E-mail',           valor: (c) => c.email ?? '' },
  { key: 'produto',      label: 'Produto',          valor: (c) => c.produto_nome ?? '' },
  { key: 'status',       label: 'Status',           valor: (c, ctx) => ctx.statusLabel(c.status_secundario ?? c.status) },
  { key: 'estrategista', label: 'Estrategista',     valor: (c, ctx) => ctx.estrategistaNome(c.estrategista_id) },
  { key: 'vendedor',     label: 'Vendedor',         valor: (c) => c.vendedor ?? '' },
  { key: 'treinador',    label: 'Treinador',        valor: (c) => c.treinador ?? '' },
  { key: 'recorrente',   label: 'Recorrente',       valor: (c) => (ehRecorrentePorParcelas(c.num_parcelas) ? 'Sim' : 'Não') },
  { key: 'assinatura',   label: 'Assinatura',       valor: (c) => c.data_fechamento ?? '' },
  { key: 'vencimento',   label: 'Vencimento',       valor: (c) => c.vencimento ?? '' },
  { key: 'valor',        label: 'Valor total',      valor: (c) => c.valor_total ?? 0 },
  { key: 'parcelas',     label: 'Parcelas',         valor: (c) => c.num_parcelas ?? 1 },
  { key: 'valorParcela', label: 'Valor parcela',    valor: (c) => c.valor_parcela ?? '' },
  { key: 'percentual',   label: '% comissão',       valor: (c) => c.percentual_aplicado ?? 0 },
  { key: 'formaPgto',    label: 'Forma pagamento',  valor: (c) => c.forma_pagamento ?? '' },
  { key: 'cpfCnpj',      label: 'CPF/CNPJ',         valor: (c) => c.cpf_cnpj ?? '' },
  { key: 'empresa',      label: 'Empresa',          valor: (c) => c.empresa ?? '' },
  { key: 'instagram',    label: 'Instagram',        valor: (c) => c.instagram ?? '' },
  { key: 'nicho',        label: 'Nicho',            valor: (c) => c.nicho ?? '' },
  { key: 'clicksign',    label: 'Link Clicksign',   valor: (c) => c.link_clicksign ?? '' },
  { key: 'notion',       label: 'Notion #',         valor: (c) => c.notion_numero ?? '' },
  { key: 'tags',         label: 'Tags',             valor: (c) => (c.tags ?? []).map((t) => t.nome).join('; ') },
  { key: 'aviso',        label: 'Aviso',            valor: (c) => normalizaTelefoneBR(c.whatsapp).aviso },
]

const PRESETS: Record<string, { label: string; descricao: string; colunas: string[] }> = {
  disparo: {
    label: 'Disparo / contatos',
    descricao: 'Só o essencial para importar numa ferramenta de mensagens.',
    colunas: ['cliente', 'primeiro', 'whatsapp', 'email', 'produto', 'aviso'],
  },
  financeiro: {
    label: 'Financeiro',
    descricao: 'Valores, parcelas e datas.',
    colunas: ['cliente', 'produto', 'status', 'assinatura', 'vencimento', 'valor', 'parcelas', 'valorParcela', 'percentual', 'formaPgto'],
  },
  completo: {
    label: 'Completo',
    descricao: 'Todas as colunas disponíveis.',
    colunas: COLUNAS.map((c) => c.key),
  },
}

// ─── Componente ──────────────────────────────────────────────────────────────

interface Props {
  open: boolean
  onClose: () => void
  /** Contratos já filtrados pela tela. */
  contratos: Contrato[]
  /** IDs marcados na tabela (para exportar só a seleção). */
  selecionados: Set<string>
  estrategistaNome: (id: string | null) => string
  statusLabel: (valor: string | null | undefined) => string
}

export function ExportContratosDialog({
  open, onClose, contratos, selecionados, estrategistaNome, statusLabel,
}: Props) {
  const [preset, setPreset] = useState<string>('disparo')
  const [colunas, setColunas] = useState<string[]>(PRESETS.disparo.colunas)
  const [escopo, setEscopo] = useState<'filtrados' | 'selecionados'>('filtrados')
  const [semValorZerado, setSemValorZerado] = useState(true)
  const [soComWhatsapp, setSoComWhatsapp] = useState(true)
  const [soComEmail, setSoComEmail] = useState(false)
  const [umPorCliente, setUmPorCliente] = useState(true)
  const [normalizarTelefone, setNormalizarTelefone] = useState(true)

  function aplicarPreset(nome: string) {
    setPreset(nome)
    setColunas(PRESETS[nome].colunas)
  }

  function toggleColuna(key: string) {
    setPreset('personalizado')
    setColunas((atual) => (atual.includes(key) ? atual.filter((k) => k !== key) : [...atual, key]))
  }

  // Linhas que realmente vão para o arquivo, já com todos os recortes aplicados.
  const linhas = useMemo(() => {
    let base = escopo === 'selecionados'
      ? contratos.filter((c) => selecionados.has(c.id))
      : contratos
    if (semValorZerado) base = base.filter((c) => Number(c.valor_total ?? 0) > 0)
    if (soComWhatsapp) base = base.filter((c) => Boolean(normalizaTelefoneBR(c.whatsapp).telefone))
    if (soComEmail) base = base.filter((c) => Boolean((c.email ?? '').trim()))
    if (umPorCliente) {
      // Mesma pessoa com vários contratos receberia a mesma mensagem N vezes.
      // A chave é o telefone quando existe; senão o nome, para não colapsar
      // clientes diferentes que estão os dois sem telefone.
      const vistos = new Set<string>()
      base = base.filter((c) => {
        const chave = normalizaTelefoneBR(c.whatsapp).telefone || `nome:${(c.cliente_nome ?? '').toLowerCase()}`
        if (vistos.has(chave)) return false
        vistos.add(chave)
        return true
      })
    }
    return base
  }, [contratos, selecionados, escopo, semValorZerado, soComWhatsapp, soComEmail, umPorCliente])

  const descartados = (escopo === 'selecionados' ? selecionados.size : contratos.length) - linhas.length

  function baixar() {
    const escolhidas = COLUNAS.filter((col) => colunas.includes(col.key))
    if (escolhidas.length === 0 || linhas.length === 0) return
    const ctx: ColunaCtx = { estrategistaNome, statusLabel, normalizarTelefone }
    const celula = (v: string | number) => {
      const s = String(v ?? '').replace(/"/g, '""')
      return /[,;"\n]/.test(s) ? `"${s}"` : s
    }
    const csv = [
      escolhidas.map((col) => celula(col.label)).join(','),
      ...linhas.map((c) => escolhidas.map((col) => celula(col.valor(c, ctx))).join(',')),
    ].join('\r\n')
    // O BOM faz o Excel abrir com a acentuação correta.
    const blob = new Blob([BOM_EXCEL + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `contratos-${preset}-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a); a.click(); a.remove()
    URL.revokeObjectURL(url)
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Exportar contratos"
      description="Afine o recorte e escolha as colunas antes de gerar o arquivo."
      size="lg"
    >
      <div className="space-y-5">
        {/* Escopo */}
        <section className="space-y-2">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">O que exportar</h3>
          <div className="flex flex-wrap gap-2">
            <Pill ativo={escopo === 'filtrados'} onClick={() => setEscopo('filtrados')}>
              Todos os filtrados ({contratos.length})
            </Pill>
            <Pill
              ativo={escopo === 'selecionados'}
              onClick={() => setEscopo('selecionados')}
              disabled={selecionados.size === 0}
            >
              Só os marcados ({selecionados.size})
            </Pill>
          </div>
        </section>

        {/* Recortes */}
        <section className="space-y-2">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Refinar</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            <Caixa marcado={semValorZerado} onToggle={() => setSemValorZerado((v) => !v)}
              label="Ignorar contratos sem valor"
              dica="Tira os que estão com valor zerado no cadastro." />
            <Caixa marcado={soComWhatsapp} onToggle={() => setSoComWhatsapp((v) => !v)}
              label="Só quem tem WhatsApp"
              dica="Sem telefone não dá para disparar." />
            <Caixa marcado={soComEmail} onToggle={() => setSoComEmail((v) => !v)}
              label="Só quem tem e-mail" />
            <Caixa marcado={umPorCliente} onToggle={() => setUmPorCliente((v) => !v)}
              label="Um contato por cliente"
              dica="Evita mandar a mesma mensagem duas vezes para quem tem mais de um contrato." />
            <Caixa marcado={normalizarTelefone} onToggle={() => setNormalizarTelefone((v) => !v)}
              label="Telefone no padrão +55"
              dica="Formato que as ferramentas de disparo entendem." />
          </div>
        </section>

        {/* Colunas */}
        <section className="space-y-2">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Colunas</h3>
          <div className="flex flex-wrap gap-2">
            {Object.entries(PRESETS).map(([key, p]) => (
              <Pill key={key} ativo={preset === key} onClick={() => aplicarPreset(key)} title={p.descricao}>
                {p.label}
              </Pill>
            ))}
            {preset === 'personalizado' && <Pill ativo onClick={() => undefined}>Personalizado</Pill>}
          </div>
          <div className="flex flex-wrap gap-1.5 rounded-xl border border-border bg-muted/30 p-3">
            {COLUNAS.map((col) => {
              const marcada = colunas.includes(col.key)
              return (
                <button
                  key={col.key}
                  type="button"
                  onClick={() => toggleColuna(col.key)}
                  className={cn(
                    'flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors',
                    marcada
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-background text-muted-foreground hover:text-foreground',
                  )}
                >
                  {marcada && <Check className="h-3 w-3" />}
                  {col.label}
                </button>
              )
            })}
          </div>
        </section>

        {/* Resumo + ação */}
        <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground tabular-nums">{linhas.length}</span>{' '}
            {linhas.length === 1 ? 'linha' : 'linhas'} · {colunas.length}{' '}
            {colunas.length === 1 ? 'coluna' : 'colunas'}
            {descartados > 0 && (
              <span className="text-muted-foreground"> · {descartados} fora pelos refinos</span>
            )}
          </p>
          <button
            onClick={baixar}
            disabled={linhas.length === 0 || colunas.length === 0}
            className="flex items-center justify-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
          >
            <FileDown className="h-4 w-4" /> Baixar CSV
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ─── Peças de UI ─────────────────────────────────────────────────────────────

function Pill({ ativo, onClick, disabled, title, children }: {
  ativo: boolean
  onClick: () => void
  disabled?: boolean
  title?: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-40',
        ativo
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-background text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}

function Caixa({ marcado, onToggle, label, dica }: {
  marcado: boolean
  onToggle: () => void
  label: string
  dica?: string
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex items-start gap-2.5 rounded-xl border border-border bg-background p-3 text-left transition-colors hover:border-primary/40"
    >
      <span
        className={cn(
          'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
          marcado ? 'border-primary bg-primary text-primary-foreground' : 'border-border',
        )}
      >
        {marcado && <Check className="h-3 w-3" />}
      </span>
      <span className="min-w-0">
        <span className="block text-sm text-foreground">{label}</span>
        {dica && <span className="block text-xs text-muted-foreground">{dica}</span>}
      </span>
    </button>
  )
}
