import { useMemo, useState } from 'react'
import {
  Check, Loader2, Send, Search, AlertTriangle, Users, PhoneOff,
  Tag as TagIcon, ShieldCheck, UserPlus, UserMinus, CircleAlert, PartyPopper, X,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { PageHeader } from '@/components/ui/PageHeader'
import { cn } from '@/lib/utils'
import { normalizaTelefoneBR, chaveTelefone } from '@/lib/telefone'
import { useContratos } from '@/hooks/useComissoes'
import { useTags } from '@/hooks/useTags'
import { usePermissoes } from '@/hooks/usePermissoes'
import { useAnalisarDisparo, useAplicarDisparo, type ContatoDisparo } from '@/hooks/useDisparo'

/**
 * Disparo — envia um recorte da base para o CRM externo com uma tag.
 *
 * Esta tela NÃO manda mensagem. Ela etiqueta contatos lá no CRM; quem dispara é
 * a automação de lá, que escuta a tag. Por isso o fluxo é: filtrar → analisar →
 * confirmar → aplicar.
 *
 * O layout separa **o que se configura** (coluna da esquerda) de **o que vai
 * acontecer** (painel da direita, que acompanha a rolagem). Disparo é ação sem
 * desfazer: o número de pessoas atingidas fica sempre visível, não escondido no
 * fim de um formulário longo.
 *
 * **Rota não listada**, por decisão do Bruno (28/07/2026): não aparece no menu,
 * chega-se digitando /disparo. Isso esconde, mas não protege — quem souber a URL
 * entra. A trava de verdade é o gate de admin logo abaixo.
 */

const STATUS_OPCOES = [
  { valor: 'Não iniciado', label: 'Não iniciado' },
  { valor: 'ATIVO', label: 'Ativo' },
  { valor: 'PAUSADO', label: 'Pausado' },
  { valor: 'INADIMPLENTE', label: 'Inadimplente' },
  { valor: 'CANCELADO', label: 'Cancelado' },
  { valor: 'CONCLUÍDO', label: 'Concluído' },
] as const

/** Só quem está em andamento entra por padrão — disparo para cancelado é erro caro. */
const STATUS_DEFAULT = ['ATIVO']

/** Status que quase nunca deveriam receber campanha: avisa antes, não bloqueia. */
const STATUS_SENSIVEIS = ['CANCELADO', 'INADIMPLENTE']

/**
 * A tag viaja para o CRM, então segue um formato previsível: minúsculas, sem
 * acento e com hífen. Evita `Campanha Julho` e `campanha-julho` virarem duas
 * tags diferentes lá dentro.
 */
function normalizaTag(bruto: string): string {
  return bruto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

/** Contato que os filtros deixaram de fora. Carrega a situação para a lista avisar por quê. */
interface ContatoForaDoRecorte extends ContatoDisparo {
  situacao: string
}

/** Busca sem acento e sem caixa — quem digita "jose" espera achar "José". */
function paraBusca(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/** Telefone em formato de leitura. Só para a lista; o que viaja é sempre o E.164. */
function telefoneLegivel(e164: string): string {
  const d = e164.replace(/\D/g, '').replace(/^55/, '')
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return e164
}

export function DisparoPage() {
  const { can, carregando } = usePermissoes()
  const { data: contratos, isLoading } = useContratos()
  const { data: todasTags = [] } = useTags()

  const [status, setStatus] = useState<string[]>([...STATUS_DEFAULT])
  const [produto, setProduto] = useState('')
  const [tagsFiltro, setTagsFiltro] = useState<string[]>([])
  const [umPorCliente, setUmPorCliente] = useState(true)
  const [tagCampanha, setTagCampanha] = useState('')
  const [confirmaCriacao, setConfirmaCriacao] = useState(false)
  const [busca, setBusca] = useState('')
  /**
   * Quem o admin tirou do recorte na mão. Guarda os EXCLUÍDOS, não os incluídos:
   * assim um contrato que entra depois (por mudança de filtro ou dado novo) já
   * nasce marcado, em vez de ficar de fora em silêncio.
   */
  const [excluidos, setExcluidos] = useState<Set<string>>(new Set())
  /** Quem foi puxado na mão de fora do recorte — o caminho para incluir um nome avulso. */
  const [incluidos, setIncluidos] = useState<Set<string>>(new Set())

  const analisar = useAnalisarDisparo()
  const aplicar = useAplicarDisparo()

  const produtos = useMemo(() => {
    const nomes = new Set((contratos ?? []).map((c) => c.produto_nome ?? '').filter(Boolean))
    return [...nomes].sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [contratos])

  /**
   * Público final. Separa em `publico` (vai) e `semTelefone` (não vai, mas a
   * pessoa precisa ver que ficou de fora — sumir em silêncio é o que faz alguém
   * achar que mandou para a base toda).
   */
  const { publico, semTelefone, foraDoRecorte } = useMemo(() => {
    const todos = contratos ?? []
    let base = todos
    if (status.length > 0) {
      base = base.filter((c) => status.includes(c.status_secundario ?? c.status ?? ''))
    }
    if (produto) base = base.filter((c) => (c.produto_nome ?? '') === produto)
    if (tagsFiltro.length > 0) {
      base = base.filter((c) => (c.tags ?? []).some((t) => tagsFiltro.includes(t.id)))
    }

    const sem: typeof base = []
    const com: ContatoDisparo[] = []
    const vistos = new Set<string>()

    for (const c of base) {
      const { telefone } = normalizaTelefoneBR(c.whatsapp)
      if (!telefone) {
        sem.push(c)
        continue
      }
      if (umPorCliente) {
        // Mesma pessoa com vários contratos receberia a mensagem N vezes.
        const chave = chaveTelefone(c.whatsapp) || telefone
        if (vistos.has(chave)) continue
        vistos.add(chave)
      }
      com.push({
        contrato_id: c.id,
        nome: c.cliente_nome ?? '',
        telefone,
        email: (c.email ?? '').trim().toLowerCase() || null,
      })
    }

    /**
     * Todo o resto da base com telefone válido. Não entra no envio sozinho — existe
     * para a busca alcançar quem os filtros deixaram de fora. Sem isto, mandar para
     * um cliente cancelado exigiria mexer nos filtros e refazer a lista inteira.
     */
    const noRecorte = new Set(com.map((c) => c.contrato_id))
    const fora: ContatoForaDoRecorte[] = []
    for (const c of todos) {
      if (noRecorte.has(c.id)) continue
      const { telefone } = normalizaTelefoneBR(c.whatsapp)
      if (!telefone) continue
      fora.push({
        contrato_id: c.id,
        nome: c.cliente_nome ?? '',
        telefone,
        email: (c.email ?? '').trim().toLowerCase() || null,
        situacao: c.status_secundario ?? c.status ?? '',
      })
    }

    return { publico: com, semTelefone: sem, foraDoRecorte: fora }
  }, [contratos, status, produto, tagsFiltro, umPorCliente])

  /**
   * O que realmente vai para o CRM: o recorte menos quem foi desmarcado, mais quem
   * foi puxado de fora na busca. A deduplicação por telefone vale para os dois —
   * senão alguém adicionado à mão receberia a mensagem duas vezes.
   */
  const selecionados = useMemo(() => {
    const saida: ContatoDisparo[] = []
    const vistos = new Set<string>()
    const adiciona = (c: ContatoDisparo) => {
      const chave = chaveTelefone(c.telefone) || c.telefone
      if (vistos.has(chave)) return
      vistos.add(chave)
      saida.push(c)
    }
    for (const c of publico) if (!excluidos.has(c.contrato_id)) adiciona(c)
    for (const c of foraDoRecorte) {
      if (!incluidos.has(c.contrato_id)) continue
      adiciona({ contrato_id: c.contrato_id, nome: c.nome, telefone: c.telefone, email: c.email })
    }
    return saida
  }, [publico, foraDoRecorte, excluidos, incluidos])

  /**
   * A lista da tela, em uma coleção só. Gente de fora do recorte entra na mesma
   * lista, marcada com o status — duas listas separadas obrigavam a pessoa a
   * entender a diferença entre "desmarcar" e "puxar" antes de conseguir usar.
   * Aqui todo item é uma caixinha; o que muda é só o selo ao lado do nome.
   *
   * Sem busca a lista é o recorte (mais quem já foi puxado, para não sumir da
   * conferência). Mostrar a base inteira por padrão convidaria a mandar para quem
   * os filtros excluíram de propósito.
   */
  const linhas = useMemo(() => {
    const termo = paraBusca(busca.trim())
    const digitos = termo.replace(/\D/g, '')
    const bate = (c: ContatoDisparo) =>
      paraBusca(c.nome).includes(termo) ||
      (digitos.length >= 3 && c.telefone.includes(digitos))

    const doRecorte = (termo ? publico.filter(bate) : publico).map((c) => ({
      contato: c,
      fora: false,
      situacao: '',
      marcado: !excluidos.has(c.contrato_id),
    }))

    const deFora = foraDoRecorte
      .filter((c) => incluidos.has(c.contrato_id) || (termo.length >= 2 && bate(c)))
      .slice(0, 50)
      .map((c) => ({
        contato: c as ContatoDisparo,
        fora: true,
        situacao: c.situacao,
        marcado: incluidos.has(c.contrato_id),
      }))

    return [...doRecorte, ...deFora]
  }, [publico, foraDoRecorte, busca, excluidos, incluidos])

  const marcadosVisiveis = linhas.filter((l) => l.marcado).length

  const tagLimpa = normalizaTag(tagCampanha)
  const analise = analisar.data
  // Uma análise antiga vira mentira quando o recorte muda — some com ela.
  const analiseValida = analise && analise.total === selecionados.length && analise.tag === tagLimpa
  const sensiveisLigados = status.filter((s) => STATUS_SENSIVEIS.includes(s))
  const vaoReceber = analiseValida ? analise.existentes + (confirmaCriacao ? analise.novos : 0) : 0

  if (!carregando && !can('disparo', 'admin')) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="font-display text-lg font-semibold text-foreground">Sem acesso</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          O disparo é restrito a administradores.
        </p>
        <Link to="/" className="mt-4 inline-block text-sm text-primary hover:underline">
          Voltar ao início
        </Link>
      </div>
    )
  }

  function toggle<T>(lista: T[], set: (v: T[]) => void, valor: T) {
    set(lista.includes(valor) ? lista.filter((v) => v !== valor) : [...lista, valor])
  }

  /** Qualquer mudança no recorte invalida a confirmação de criação já dada. */
  function mudouRecorte() {
    setConfirmaCriacao(false)
  }

  function alternaPessoa(contratoId: string) {
    setExcluidos((atual) => {
      const proximo = new Set(atual)
      if (proximo.has(contratoId)) proximo.delete(contratoId)
      else proximo.add(contratoId)
      return proximo
    })
    mudouRecorte()
  }

  /** Puxa (ou devolve) alguém que os filtros tinham deixado de fora. */
  function alternaFora(contratoId: string) {
    setIncluidos((atual) => {
      const proximo = new Set(atual)
      if (proximo.has(contratoId)) proximo.delete(contratoId)
      else proximo.add(contratoId)
      return proximo
    })
    mudouRecorte()
  }

  /** Marca/desmarca só o que a lista está mostrando — o resto da seleção fica como está. */
  function alternaVisiveis(marcar: boolean) {
    const idsRecorte = linhas.filter((l) => !l.fora).map((l) => l.contato.contrato_id)
    const idsFora = linhas.filter((l) => l.fora).map((l) => l.contato.contrato_id)
    setExcluidos((atual) => {
      const proximo = new Set(atual)
      for (const id of idsRecorte) marcar ? proximo.delete(id) : proximo.add(id)
      return proximo
    })
    setIncluidos((atual) => {
      const proximo = new Set(atual)
      for (const id of idsFora) marcar ? proximo.add(id) : proximo.delete(id)
      return proximo
    })
    mudouRecorte()
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6">
      <PageHeader
        title="Disparo"
        description="Escolha o público, marque com uma tag no CRM e a automação de lá manda a mensagem."
        breadcrumb={[{ label: 'Contratos', href: '/contratos/lista' }, { label: 'Disparo' }]}
        backTo="/contratos/lista"
      />

      <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/30 px-4 py-3 animate-fade-in">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Nenhuma mensagem sai daqui.</span>{' '}
          Esta tela só coloca a tag nos contatos do CRM. Quem envia é o fluxo de automação de
          lá — e ele precisa estar configurado para escutar essa tag.
        </p>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        {/* ─── Configuração ────────────────────────────────────────────────── */}
        <div className="space-y-6">
          <Secao passo="1" titulo="Quem vai receber">
            <Campo rotulo="Status do contrato">
              <div className="flex flex-wrap gap-2">
                {STATUS_OPCOES.map((s) => (
                  <Pill
                    key={s.valor}
                    ativo={status.includes(s.valor)}
                    onClick={() => { toggle(status, setStatus, s.valor); mudouRecorte() }}
                  >
                    {s.label}
                  </Pill>
                ))}
              </div>
              {sensiveisLigados.length > 0 && (
                <p className="flex items-center gap-1.5 text-xs text-warning">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  O recorte inclui contratos {sensiveisLigados.map((s) => s.toLowerCase()).join(' e ')}.
                </p>
              )}
            </Campo>

            <div className="grid gap-5 sm:grid-cols-2">
              <Campo rotulo="Produto" htmlFor="disparo-produto">
                <select
                  id="disparo-produto"
                  value={produto}
                  onChange={(e) => { setProduto(e.target.value); mudouRecorte() }}
                  className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground transition-colors hover:border-primary/40 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                >
                  <option value="">Todos os produtos</option>
                  {produtos.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </Campo>

              <Campo rotulo="Evitar repetição">
                <Caixa
                  marcado={umPorCliente}
                  onToggle={() => { setUmPorCliente((v) => !v); mudouRecorte() }}
                  label="Um contato por cliente"
                  dica="Quem tem mais de um contrato recebe uma vez só."
                />
              </Campo>
            </div>

            {todasTags.length > 0 && (
              <Campo rotulo="Tags do contrato" opcional>
                <div className="flex flex-wrap gap-2">
                  {todasTags.map((t) => (
                    <PillTag
                      key={t.id}
                      ativo={tagsFiltro.includes(t.id)}
                      cor={t.cor}
                      onClick={() => { toggle(tagsFiltro, setTagsFiltro, t.id); mudouRecorte() }}
                    >
                      {t.nome}
                    </PillTag>
                  ))}
                </div>
              </Campo>
            )}
          </Secao>

          <Secao passo="2" titulo="Pessoa por pessoa">
            <p className="-mt-1 text-sm text-muted-foreground">
              Todo mundo do recorte entra marcado. Desmarque quem não deve receber, ou
              busque um nome para incluir alguém que os filtros deixaram de fora — a busca
              alcança <strong>toda a base de contratos</strong>.
            </p>

            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por nome ou telefone em toda a base"
                autoComplete="off"
                aria-label="Buscar pessoa"
                className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-9 text-sm text-foreground transition-colors placeholder:text-muted-foreground/60 hover:border-primary/40 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              {busca && (
                <button
                  type="button"
                  onClick={() => setBusca('')}
                  aria-label="Limpar busca"
                  className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Uma lista só: quem está fora do recorte aparece junto, com um selo de
                status. Duas listas separadas obrigavam a entender a diferença entre
                "desmarcar" e "puxar" antes de conseguir usar a tela. */}
            <div className="overflow-hidden rounded-xl border border-border">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/30 px-3 py-2">
                <span className="text-xs text-muted-foreground">
                  {linhas.length === 0 ? (
                    'nada para mostrar'
                  ) : (
                    <>
                      <span className="font-medium tabular-nums text-foreground">{marcadosVisiveis}</span>
                      {' de '}
                      <span className="tabular-nums">{linhas.length}</span>
                      {busca ? ' encontrados' : ' no recorte'}
                    </>
                  )}
                </span>
                <span className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => alternaVisiveis(true)}
                    disabled={linhas.length === 0}
                    className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-background hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Marcar {busca ? 'exibidos' : 'todos'}
                  </button>
                  <span className="text-border">·</span>
                  <button
                    type="button"
                    onClick={() => alternaVisiveis(false)}
                    disabled={linhas.length === 0}
                    className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-background hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Desmarcar {busca ? 'exibidos' : 'todos'}
                  </button>
                </span>
              </div>

              {linhas.length === 0 ? (
                <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                  {busca
                    ? <>Ninguém na base bate com “{busca}”.</>
                    : 'Nenhum contato no recorte. Ajuste os filtros acima ou busque um nome.'}
                </p>
              ) : (
                <ul className="max-h-96 divide-y divide-border/60 overflow-y-auto bg-background">
                  {linhas.map((l) => (
                    <li key={l.contato.contrato_id}>
                      <button
                        type="button"
                        onClick={() => (l.fora ? alternaFora : alternaPessoa)(l.contato.contrato_id)}
                        role="checkbox"
                        aria-checked={l.marcado}
                        className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40"
                      >
                        <span
                          className={cn(
                            'flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
                            l.marcado ? 'border-primary bg-primary text-primary-foreground' : 'border-border',
                          )}
                        >
                          {l.marcado && <Check className="h-3 w-3" />}
                        </span>
                        <span
                          className={cn(
                            'min-w-0 flex-1 truncate text-sm',
                            l.marcado ? 'text-foreground' : 'text-muted-foreground',
                          )}
                        >
                          {l.contato.nome || 'sem nome'}
                        </span>
                        {l.fora && (
                          <span
                            className={cn(
                              'shrink-0 rounded-full border px-2 py-0.5 text-[11px] lowercase',
                              STATUS_SENSIVEIS.includes(l.situacao)
                                ? 'border-warning/40 bg-warning/10 text-warning'
                                : 'border-border bg-muted text-muted-foreground',
                            )}
                            title="Fora do recorte atual — marque para incluir mesmo assim"
                          >
                            {l.situacao ? l.situacao.toLowerCase() : 'fora do recorte'}
                          </span>
                        )}
                        <span className="shrink-0 font-mono text-xs text-muted-foreground">
                          {telefoneLegivel(l.contato.telefone)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {(excluidos.size > 0 || incluidos.size > 0) && (
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {excluidos.size > 0 && (
                  <span>
                    {excluidos.size} desmarcados ·{' '}
                    <button
                      type="button"
                      onClick={() => { setExcluidos(new Set()); mudouRecorte() }}
                      className="text-primary hover:underline"
                    >
                      restaurar
                    </button>
                  </span>
                )}
                {incluidos.size > 0 && (
                  <span>
                    {incluidos.size} {incluidos.size === 1 ? 'puxado' : 'puxados'} de fora do recorte ·{' '}
                    <button
                      type="button"
                      onClick={() => { setIncluidos(new Set()); mudouRecorte() }}
                      className="text-primary hover:underline"
                    >
                      tirar
                    </button>
                  </span>
                )}
              </p>
            )}
          </Secao>

          <Secao passo="3" titulo="Tag da campanha">
            <Campo rotulo="Nome da tag" htmlFor="disparo-tag">
              <div className="relative">
                <TagIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  id="disparo-tag"
                  value={tagCampanha}
                  onChange={(e) => { setTagCampanha(e.target.value); mudouRecorte() }}
                  placeholder="campanha-julho-gold"
                  autoComplete="off"
                  spellCheck={false}
                  className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm text-foreground transition-colors placeholder:text-muted-foreground/60 hover:border-primary/40 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              {tagLimpa && tagLimpa !== tagCampanha.trim() ? (
                <p className="text-xs text-muted-foreground">
                  Será gravada como{' '}
                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground">{tagLimpa}</code>{' '}
                  — sem acento, minúscula e com hífen, para não virar duas tags no CRM.
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  É esta tag que a automação do CRM escuta. Ela precisa existir lá <strong>antes</strong> do envio.
                </p>
              )}
            </Campo>
          </Secao>

          {analiseValida && analise.ambiguos.length > 0 && (
            <section className="space-y-3 rounded-2xl border border-warning/30 bg-warning/5 p-5 animate-fade-in">
              <h2 className="flex items-center gap-2 font-display text-base font-semibold text-foreground">
                <AlertTriangle className="h-4 w-4 text-warning" />
                {analise.ambiguos.length}{' '}
                {analise.ambiguos.length === 1 ? 'contato ficará de fora' : 'contatos ficarão de fora'}
              </h2>
              <p className="text-sm text-muted-foreground">
                O CRM tem mais de um cadastro com esses telefones. Escolher um deles seria chute,
                então nenhum é tocado. Resolva a duplicidade lá e rode a análise de novo.
              </p>
              <ul className="max-h-52 divide-y divide-border/60 overflow-y-auto rounded-lg border border-border/60 bg-card">
                {analise.ambiguos.map((a) => (
                  <li key={a.telefone} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <span className="truncate text-foreground">{a.nome || 'sem nome'}</span>
                    <span className="shrink-0 font-mono text-xs text-muted-foreground">{a.telefone}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        {/* ─── Resumo e ação ───────────────────────────────────────────────── */}
        <aside className="space-y-4 lg:sticky lg:top-6">
          <section className="overflow-hidden rounded-2xl border border-border bg-card">
            <div className="border-b border-border px-5 py-4">
              <Eyebrow>Resumo</Eyebrow>
              {isLoading ? (
                <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando contratos…
                </p>
              ) : (
                <>
                  <p className="mt-2 flex items-baseline gap-2">
                    <span className="font-display text-3xl font-semibold tabular-nums text-foreground">
                      {selecionados.length}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {selecionados.length === 1 ? 'contato selecionado' : 'contatos selecionados'}
                    </span>
                  </p>
                  {excluidos.size > 0 && (
                    <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <UserMinus className="h-3.5 w-3.5 shrink-0" />
                      {excluidos.size} desmarcados na lista
                    </p>
                  )}
                  {incluidos.size > 0 && (
                    <p className="mt-1.5 flex items-center gap-1.5 text-xs text-primary">
                      <UserPlus className="h-3.5 w-3.5 shrink-0" />
                      {incluidos.size} {incluidos.size === 1 ? 'puxada' : 'puxadas'} de fora do recorte
                    </p>
                  )}
                  {semTelefone.length > 0 && (
                    <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <PhoneOff className="h-3.5 w-3.5 shrink-0" />
                      {semTelefone.length} fora por não ter telefone
                    </p>
                  )}
                </>
              )}
            </div>

            <div className="space-y-4 px-5 py-4">
              <Eyebrow>Passo 4 · Conferir</Eyebrow>

              <button
                type="button"
                onClick={() => {
                  setConfirmaCriacao(false)
                  analisar.mutate({ tag: tagLimpa, contatos: selecionados })
                }}
                disabled={selecionados.length === 0 || !tagLimpa || analisar.isPending}
                className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-border bg-background text-sm font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
              >
                {analisar.isPending
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <Search className="h-4 w-4" />}
                {analisar.isPending ? 'Consultando o CRM…' : 'Analisar no CRM'}
              </button>

              {analisar.isError && (
                <p className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-xs text-danger">
                  Não deu para analisar: {(analisar.error as Error).message}
                </p>
              )}

              {analiseValida ? (
                <ul className="space-y-2">
                  <LinhaResumo
                    icone={<Users className="h-4 w-4" />}
                    numero={analise.existentes}
                    rotulo="já existem no CRM"
                    dica="Recebem só a tag."
                  />
                  <LinhaResumo
                    icone={<UserPlus className="h-4 w-4" />}
                    numero={analise.novos}
                    rotulo="serão criados"
                    dica="Ainda não têm cadastro lá."
                    tom={analise.novos > 0 ? 'destaque' : undefined}
                  />
                  <LinhaResumo
                    icone={<CircleAlert className="h-4 w-4" />}
                    numero={analise.ambiguos.length}
                    rotulo="ambíguos"
                    dica="Duplicados no CRM — ficam de fora."
                    tom={analise.ambiguos.length > 0 ? 'alerta' : undefined}
                  />
                </ul>
              ) : (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {selecionados.length === 0
                    ? publico.length === 0
                      ? 'Ajuste o recorte para ter pelo menos um contato.'
                      : 'Marque pelo menos uma pessoa na lista.'
                    : !tagLimpa
                      ? 'Informe a tag da campanha para conferir.'
                      : 'Rode a análise para ver quantos já existem no CRM. Nada é gravado nessa etapa.'}
                </p>
              )}

              {analiseValida && analise.novos > 0 && (
                <Caixa
                  marcado={confirmaCriacao}
                  onToggle={() => setConfirmaCriacao((v) => !v)}
                  label={`Criar ${analise.novos} ${analise.novos === 1 ? 'contato novo' : 'contatos novos'}`}
                  dica="Sem marcar, só quem já existe recebe a tag."
                />
              )}
            </div>

            <div className="space-y-3 border-t border-border bg-muted/20 px-5 py-4">
              {aplicar.isSuccess ? (
                <div className="space-y-1 rounded-lg border border-success/30 bg-success/5 px-3 py-2.5">
                  <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <PartyPopper className="h-4 w-4 text-success" />
                    {aplicar.data.marcados} {aplicar.data.marcados === 1 ? 'contato marcado' : 'contatos marcados'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {aplicar.data.criados > 0 && <>{aplicar.data.criados} criados no CRM. </>}
                    {aplicar.data.falhas > 0
                      ? <span className="text-danger">{aplicar.data.falhas} falharam — rode a análise de novo.</span>
                      : 'A automação do CRM assume daqui.'}
                  </p>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {analiseValida
                    ? <>Vão receber a tag: <span className="font-medium tabular-nums text-foreground">{vaoReceber}</span>{' '}
                      {vaoReceber === 1 ? 'contato' : 'contatos'}.</>
                    : 'Confira a análise antes de aplicar.'}
                </p>
              )}

              {aplicar.isError && (
                <p className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-xs text-danger">
                  Falhou: {(aplicar.error as Error).message}
                </p>
              )}

              <button
                type="button"
                onClick={() =>
                  aplicar.mutate({ tag: tagLimpa, contatos: selecionados, criarNovos: confirmaCriacao })
                }
                disabled={!analiseValida || aplicar.isPending || vaoReceber === 0}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {aplicar.isPending
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <Send className="h-4 w-4" />}
                {aplicar.isPending ? 'Aplicando…' : 'Aplicar tag no CRM'}
              </button>
              <p className="text-center text-[11px] text-muted-foreground">
                Não tem desfazer: a tag entra no CRM na hora.
              </p>
            </div>
          </section>
        </aside>
      </div>
    </div>
  )
}

// ─── Peças de UI ─────────────────────────────────────────────────────────────

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[11px] uppercase tracking-wider text-primary">{children}</span>
  )
}

/** Bloco de um passo do fluxo. O número vem antes do título para dar ordem de leitura. */
function Secao({ passo, titulo, children }: {
  passo: string
  titulo: string
  children: React.ReactNode
}) {
  return (
    <section className="space-y-5 rounded-2xl border border-border bg-card p-5 animate-fade-in sm:p-6">
      <header className="flex items-center gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary/10 font-mono text-xs font-medium text-primary">
          {passo}
        </span>
        <h2 className="font-display text-base font-semibold tracking-tight text-foreground">{titulo}</h2>
      </header>
      {children}
    </section>
  )
}

function Campo({ rotulo, htmlFor, opcional, children }: {
  rotulo: string
  htmlFor?: string
  opcional?: boolean
  children: React.ReactNode
}) {
  const Rotulo = htmlFor ? 'label' : 'span'
  return (
    <div className="space-y-2">
      <Rotulo
        htmlFor={htmlFor}
        className="flex items-center gap-2 text-sm font-medium text-foreground"
      >
        {rotulo}
        {opcional && <span className="text-xs font-normal text-muted-foreground">opcional</span>}
      </Rotulo>
      {children}
    </div>
  )
}

function LinhaResumo({ icone, numero, rotulo, dica, tom }: {
  icone: React.ReactNode
  numero: number
  rotulo: string
  dica: string
  tom?: 'destaque' | 'alerta'
}) {
  return (
    <li
      className={cn(
        'flex items-start gap-3 rounded-lg border px-3 py-2.5',
        tom === 'alerta'
          ? 'border-warning/30 bg-warning/5'
          : tom === 'destaque'
            ? 'border-primary/30 bg-primary/5'
            : 'border-border bg-background',
      )}
    >
      <span
        className={cn(
          'mt-0.5 shrink-0',
          tom === 'alerta' ? 'text-warning' : tom === 'destaque' ? 'text-primary' : 'text-muted-foreground',
        )}
      >
        {icone}
      </span>
      <span className="min-w-0">
        <span className="block text-sm text-foreground">
          <span className="font-semibold tabular-nums">{numero}</span> {rotulo}
        </span>
        <span className="block text-xs text-muted-foreground">{dica}</span>
      </span>
    </li>
  )
}

function Pill({ ativo, onClick, children }: {
  ativo: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={cn(
        'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
        ativo
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}

/**
 * Pill de tag do contrato. Usa a cor da própria tag — a mesma leitura da lista de
 * contratos, para a pessoa reconhecer a etiqueta pela cor e não ter que ler todas.
 * Alpha em hex: `1a` ≈ 10% de fundo, `55` ≈ 33% de borda.
 */
function PillTag({ ativo, cor, onClick, children }: {
  ativo: boolean
  cor: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={cn(
        'inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
        ativo ? '' : 'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground',
      )}
      style={ativo ? { backgroundColor: `${cor}1a`, color: cor, borderColor: `${cor}55` } : undefined}
    >
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: cor }} />
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
      role="checkbox"
      aria-checked={marcado}
      className={cn(
        'flex w-full items-start gap-2.5 rounded-lg border p-3 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
        marcado ? 'border-primary/40 bg-primary/5' : 'border-border bg-background hover:border-primary/40',
      )}
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
