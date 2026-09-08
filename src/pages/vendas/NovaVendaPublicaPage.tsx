import { useEffect, useState } from 'react'
import { Plus, Trash2, Upload, CheckCircle2, User, Building2, Package, Wallet, FileText, Copy, AlertTriangle, Info, Repeat, Minus, PlayCircle, Users, ScanLine, Loader2 } from 'lucide-react'
import PhoneInput from 'react-phone-number-input'
import 'react-phone-number-input/style.css'
import { supabase } from '@/lib/supabase'
import { GuidedTour, type TourStep } from '@/components/ui/GuidedTour'
import { lerComprovante, comprovanteEhLegivel, encerrarOcr } from '@/lib/ocrComprovante'

const TOUR_STORAGE_KEY = 'omnx_tour_venda_v1'

const TOUR_STEPS: TourStep[] = [
  {
    title: 'Bem-vindo! Vou te guiar 👋',
    body: 'Em poucos passos você aprende a registrar a venda do jeito certo. Leva menos de 1 minuto — é só ir clicando em “Próximo”.',
  },
  {
    target: 'closer',
    title: '1. Seus dados',
    body: 'Comece com seu nome e e-mail de closer. É como sabemos quem registrou a venda.',
  },
  {
    target: 'cliente',
    title: '2. Dados do cliente',
    body: 'Preencha com atenção. O WhatsApp e o e-mail precisam estar corretos — é por eles que a venda é localizada e vira contrato depois.',
  },
  {
    target: 'produto',
    title: '3. Produto e valor',
    body: 'Escolha o produto vendido e informe o valor total negociado.',
  },
  {
    target: 'pagamentos',
    title: '4. Pagamentos (a parte mais importante)',
    body: (
      <>
        Cadastre <strong className="text-foreground">TODOS os pagamentos do cliente</strong>, incluindo as parcelas
        que ainda vão acontecer — não só a entrada. Essa lista espelha o contrato. Anexe o comprovante dos pagamentos já feitos.
      </>
    ),
  },
  {
    target: 'repetir',
    title: '5. Muitas parcelas iguais? Use o Repetir',
    body: (
      <>
        Ex.: entrada + 11 mensais. Preencha a <strong className="text-foreground">primeira parcela</strong>, escolha a quantidade
        e clique em <strong className="text-foreground">Gerar</strong> — as demais são criadas sozinhas, mês a mês.
      </>
    ),
  },
  {
    target: 'enviar',
    title: '6. Conferir e enviar',
    body: 'Revise tudo e envie. Se você deixar só 1 pagamento, a gente pergunta pra confirmar se está certo — a maioria das vendas tem parcelas futuras.',
  },
]

// Espelha os limites da edge function vendas-publicas-create — se mudar lá, mudar aqui.
const MAX_ARQUIVO_BYTES = 20 * 1024 * 1024
const MAX_ARQUIVOS_VENDA = 60
const MIME_ACEITO = /^(image\/(jpe?g|png|webp|heic|heif|gif)|application\/pdf)$/i
const EXT_ACEITA = /\.(jpe?g|png|webp|heic|heif|gif|pdf)$/i

// Fotos de iPhone (HEIC) e alguns prints chegam com `type` vazio no navegador.
// Nesses casos vale a extensão do nome do arquivo.
function arquivoEhComprovanteAceito(f: File): boolean {
  if (f.type && f.type !== 'application/octet-stream') return MIME_ACEITO.test(f.type)
  return EXT_ACEITA.test(f.name)
}

// O invoke do supabase-js lança FunctionsHttpError com a mensagem genérica
// "Edge Function returned a non-2xx status code" — o motivo real está no corpo
// da resposta, guardado em `context`. Sem isso o closer não sabe o que corrigir.
async function mensagemDoErro(err: unknown): Promise<string> {
  const ctx = (err as { context?: Response }).context
  let corpo: { error?: string; detail?: string } | null = null
  if (ctx && typeof ctx.json === 'function') {
    try { corpo = await ctx.clone().json() } catch { /* corpo não era JSON */ }
  }
  if (corpo?.error) {
    const detalhe = corpo.detail ? ` (${corpo.detail})` : ''
    switch (corpo.error) {
      case 'validation':
        return `Confira os dados: ${corpo.detail ?? 'algum campo obrigatório ficou em branco'}.`
      case 'file_too_large':
        return `O comprovante${detalhe} passa de 20 MB. Reduza a imagem ou tire um print mais leve.`
      case 'invalid_mime':
        return `Formato de arquivo não aceito${detalhe}. Anexe imagem (JPG, PNG, WEBP, HEIC) ou PDF.`
      case 'too_many_files':
        return `Muitos comprovantes anexados. O limite é ${MAX_ARQUIVOS_VENDA} por venda.`
      case 'rate_limited':
        return 'Você enviou vendas demais em pouco tempo. Espere 1 minuto e tente de novo.'
      case 'upload_failed':
        return `Não conseguimos guardar os comprovantes${detalhe}. Tente enviar novamente.`
      case 'db_insert_failed':
        return `Não conseguimos salvar a venda${detalhe}. Avise o time de tecnologia.`
      default:
        return `Erro ao enviar a venda: ${corpo.error}${detalhe}.`
    }
  }
  return (err as Error)?.message || 'Erro ao enviar venda.'
}

const FORMAS = ['PIX', 'Cartão à vista', 'Cartão parcelado', 'Boleto'] as const
const PLATAFORMAS = ['Hotmart', 'Pix Banco Inter', 'Firepay', 'Routerfy'] as const

interface Pagamento {
  data: string
  valor: string
  forma: string
  plataforma: string
  sinal: string
  arquivos: File[]
}

interface Produto { id: string; nome: string }

const pagamentoVazio = (): Pagamento => ({
  data: new Date().toISOString().slice(0, 10),
  valor: '',
  forma: 'PIX',
  plataforma: 'Pix Banco Inter',
  sinal: 'Entrada',
  arquivos: [],
})

/** Formata número (em reais, como string com ponto decimal) pra "1.234,56" pra exibição. */
function formatBRLInput(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (!digits) return ''
  const cents = digits.padStart(3, '0')
  const inteiros = cents.slice(0, -2).replace(/^0+(?=\d)/, '')
  const centavos = cents.slice(-2)
  return `${Number(inteiros).toLocaleString('pt-BR')},${centavos}`
}

/** Converte o display "1.234,56" → string canônica "1234.56" pra envio. */
function parseBRLInput(formatted: string): string {
  const digits = formatted.replace(/\D/g, '')
  if (!digits) return ''
  const cents = digits.padStart(3, '0')
  return `${cents.slice(0, -2).replace(/^0+(?=\d)/, '')}.${cents.slice(-2)}`
}

/** Máscara de CEP: "00000000" → "00000-000". */
function formatCEP(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 8)
  return d.length <= 5 ? d : `${d.slice(0, 5)}-${d.slice(5)}`
}

/** Soma n meses a uma data "YYYY-MM-DD" (usada pra gerar parcelas mês a mês). */
function addMeses(data: string, n: number): string {
  const d = new Date(`${data}T00:00:00`)
  if (Number.isNaN(d.getTime())) return data
  d.setMonth(d.getMonth() + n)
  return d.toISOString().slice(0, 10)
}

export function NovaVendaPublicaPage() {
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const [closerNome, setCloserNome] = useState('')
  const [closerEmail, setCloserEmail] = useState('')
  const [clienteNome, setClienteNome] = useState('')
  const [clienteRazaoSocial, setClienteRazaoSocial] = useState('')
  const [clienteCpfCnpj, setClienteCpfCnpj] = useState('')
  const [clienteEmail, setClienteEmail] = useState('')
  const [clienteWhatsapp, setClienteWhatsapp] = useState('')
  const [clienteInstagram, setClienteInstagram] = useState('')
  const [clienteCep, setClienteCep] = useState('')
  const [clienteLogradouro, setClienteLogradouro] = useState('')
  const [clienteNumero, setClienteNumero] = useState('')
  const [clienteComplemento, setClienteComplemento] = useState('')
  const [clienteBairro, setClienteBairro] = useState('')
  const [clienteMunicipio, setClienteMunicipio] = useState('')
  const [clienteUf, setClienteUf] = useState('')
  const [pagadorDiferente, setPagadorDiferente] = useState(false)
  const [pagadorNome, setPagadorNome] = useState('')
  const [pagadorCpfCnpj, setPagadorCpfCnpj] = useState('')
  const [pagadorRelacao, setPagadorRelacao] = useState('')
  const [pagadorObservacao, setPagadorObservacao] = useState('')
  const [produtoId, setProdutoId] = useState('')
  const [valorTotalVenda, setValorTotalVenda] = useState('')
  const [pagamentos, setPagamentos] = useState<Pagamento[]>([pagamentoVazio()])
  // Identificador de pagamento: o nome que aparece no extrato bancário. É lido do
  // comprovante por OCR no próprio navegador — palpite, não verdade. Se o closer
  // digitar por cima, o OCR para de mexer no campo.
  const [identificadorPagamento, setIdentificadorPagamento] = useState('')
  const [identificadorEditado, setIdentificadorEditado] = useState(false)
  const [ocrStatus, setOcrStatus] = useState<'idle' | 'lendo' | 'achou' | 'nao_achou'>('idle')
  const [observacoes, setObservacoes] = useState('')
  const [qtdRepetir, setQtdRepetir] = useState(11)
  // Vira true quando o vendedor tenta enviar com 1 pagamento só e precisamos que confirme.
  const [avisoPagUnico, setAvisoPagUnico] = useState(false)
  const [tourOpen, setTourOpen] = useState(false)

  // Abre o tutorial guiado automaticamente na primeira vez que a pessoa acessa o formulário.
  useEffect(() => {
    try {
      if (!localStorage.getItem(TOUR_STORAGE_KEY)) setTourOpen(true)
    } catch { /* localStorage indisponível — segue sem abrir */ }
  }, [])

  function fecharTour() {
    setTourOpen(false)
    try { localStorage.setItem(TOUR_STORAGE_KEY, '1') } catch { /* ignora */ }
  }

  useEffect(() => {
    supabase.functions.invoke('vendas-publicas-create', { method: 'GET' })
      .then(({ data, error }) => {
        if (error) return
        const p = (data as { produtos?: Produto[] })?.produtos ?? []
        setProdutos(p)
      })
      .catch(() => {})
  }, [])

  // O leitor de comprovante carrega ~15 MB de modelo na memória. Devolve tudo ao
  // sair da página em vez de deixar pendurado.
  useEffect(() => () => { void encerrarOcr() }, [])

  function addPagamento() {
    const sinalNovo = pagamentos.length === 0 ? 'Entrada' : `Parcela ${pagamentos.length}`
    setPagamentos([...pagamentos, { ...pagamentoVazio(), sinal: sinalNovo }])
    setAvisoPagUnico(false)
  }
  function updatePagamento(idx: number, patch: Partial<Pagamento>) {
    setPagamentos(pagamentos.map((p, i) => (i === idx ? { ...p, ...patch } : p)))
  }
  function removePagamento(idx: number) {
    if (pagamentos.length === 1) return
    setPagamentos(pagamentos.filter((_, i) => i !== idx))
  }
  // Repete a última parcela X vezes, avançando 1 mês e numerando o sinal (Parcela N).
  // Facilita cadastrar planos com muitas parcelas iguais (ex: 12x) sem redigitar tudo.
  function repetirUltima(vezes: number) {
    if (pagamentos.length === 0 || vezes < 1) return
    const base = pagamentos[pagamentos.length - 1]
    const m = base.sinal.match(/(\d+)/)
    let n = m ? Number(m[1]) : 0
    const novos: Pagamento[] = []
    for (let i = 1; i <= vezes; i++) {
      n += 1
      novos.push({ ...base, data: addMeses(base.data, i), sinal: `Parcela ${n}`, arquivos: [] })
    }
    setPagamentos([...pagamentos, ...novos])
    setAvisoPagUnico(false)
  }

  function addArquivosPagamento(idx: number, files: File[]) {
    // Valida aqui, no anexo, e não no envio: o closer descobre o problema na hora
    // em que escolhe o arquivo, com o nome dele na frente.
    const recusados: string[] = []
    const aceitos = files.filter((f) => {
      if (f.size > MAX_ARQUIVO_BYTES) {
        recusados.push(`${f.name} tem ${(f.size / 1024 / 1024).toFixed(1)} MB (limite: 20 MB)`)
        return false
      }
      if (!arquivoEhComprovanteAceito(f)) {
        recusados.push(`${f.name} não é um comprovante aceito (use JPG, PNG, WEBP, HEIC ou PDF)`)
        return false
      }
      return true
    })
    if (recusados.length > 0) {
      setErro(`Não deu pra anexar: ${recusados.join('; ')}.`)
    } else {
      setErro(null)
    }
    if (aceitos.length === 0) return
    setPagamentos(pagamentos.map((p, i) => (i === idx ? { ...p, arquivos: [...p.arquivos, ...aceitos].slice(0, 8) } : p)))
    lerIdentificadorDoComprovante(aceitos)
  }

  /**
   * Tenta descobrir o nome do extrato lendo o comprovante anexado. Roda em segundo
   * plano: o closer continua preenchendo o formulário enquanto isso acontece, e se
   * o OCR não achar nada o campo simplesmente fica em branco pra digitar.
   */
  async function lerIdentificadorDoComprovante(arquivos: File[]) {
    if (identificadorEditado || identificadorPagamento.trim()) return
    const legivel = arquivos.find(comprovanteEhLegivel)
    if (!legivel) return

    setOcrStatus('lendo')
    const { identificador } = await lerComprovante(legivel)
    // Enquanto o OCR rodava o closer pode ter digitado o nome na mão — nesse caso
    // o que ele escreveu vale mais que o palpite.
    setIdentificadorPagamento((atual) => {
      if (atual.trim()) return atual
      return identificador ?? ''
    })
    setOcrStatus(identificador ? 'achou' : 'nao_achou')
  }
  function removeArquivoPagamento(idx: number, fIdx: number) {
    setPagamentos(pagamentos.map((p, i) => (i === idx ? { ...p, arquivos: p.arquivos.filter((_, j) => j !== fIdx) } : p)))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)

    if (!closerNome.trim() || !closerEmail.includes('@')) { setErro('Preencha seu nome e e-mail.'); return }
    if (!clienteNome.trim() || !clienteWhatsapp.trim()) { setErro('Nome e WhatsApp do cliente são obrigatórios.'); return }
    if (pagadorDiferente && !pagadorNome.trim()) { setErro('Informe o nome de quem fez o pagamento.'); return }
    if (pagamentos.some((p) => !p.data || !p.valor || Number(p.valor) <= 0)) {
      setErro('Preencha data e valor de todos os pagamentos.'); return
    }
    if (pagamentos.every((p) => p.arquivos.length === 0)) { setErro('Anexe ao menos um comprovante em algum pagamento.'); return }
    const totalArquivos = pagamentos.reduce((soma, p) => soma + p.arquivos.length, 0)
    if (totalArquivos > MAX_ARQUIVOS_VENDA) {
      setErro(`Você anexou ${totalArquivos} comprovantes e o limite é ${MAX_ARQUIVOS_VENDA}. Remova alguns e envie de novo.`); return
    }
    // Só 1 pagamento é o erro mais comum: quase toda venda tem parcelas futuras.
    // Pede confirmação explícita antes de deixar enviar.
    if (pagamentos.length === 1 && !avisoPagUnico) {
      setErro(null)
      setAvisoPagUnico(true)
      return
    }

    const produto = produtos.find((p) => p.id === produtoId)
    const payload = {
      closer_nome: closerNome.trim(),
      closer_email: closerEmail.trim().toLowerCase(),
      cliente_nome: clienteNome.trim(),
      cliente_razao_social: clienteRazaoSocial.trim() || null,
      cliente_cpf_cnpj: clienteCpfCnpj.trim() || null,
      cliente_email: clienteEmail.trim() || null,
      cliente_whatsapp: clienteWhatsapp.trim(),
      cliente_instagram: clienteInstagram.trim() || null,
      cliente_cep: clienteCep.trim() || null,
      cliente_logradouro: clienteLogradouro.trim() || null,
      cliente_numero: clienteNumero.trim() || null,
      cliente_complemento: clienteComplemento.trim() || null,
      cliente_bairro: clienteBairro.trim() || null,
      cliente_municipio: clienteMunicipio.trim() || null,
      cliente_uf: clienteUf.trim().toUpperCase() || null,
      produto_id: produtoId || null,
      produto_nome: produto?.nome ?? null,
      valor_total_venda: valorTotalVenda ? Number(valorTotalVenda) : null,
      pagador_diferente: pagadorDiferente,
      pagador_nome: pagadorDiferente ? (pagadorNome.trim() || null) : null,
      pagador_cpf_cnpj: pagadorDiferente ? (pagadorCpfCnpj.trim() || null) : null,
      pagador_relacao: pagadorDiferente ? (pagadorRelacao.trim() || null) : null,
      pagador_observacao: pagadorDiferente ? (pagadorObservacao.trim() || null) : null,
      pagamentos: pagamentos.map((p) => ({
        data: p.data,
        valor: Number(p.valor),
        forma: p.forma,
        plataforma: p.plataforma,
        sinal: p.sinal.trim(),
      })),
      observacoes: observacoes.trim() || null,
      identificador_pagamento: identificadorPagamento.trim() || null,
    }

    const fd = new FormData()
    fd.append('payload', JSON.stringify(payload))
    pagamentos.forEach((p, pIdx) => {
      p.arquivos.forEach((f, fIdx) => fd.append(`comprovante_${pIdx}_${fIdx}`, f, f.name))
    })

    setSubmitting(true)
    try {
      const { data, error } = await supabase.functions.invoke('vendas-publicas-create', {
        method: 'POST',
        body: fd,
      })
      if (error) throw error
      if ((data as { error?: string })?.error) {
        throw new Error((data as { detail?: string; error: string }).detail ?? (data as { error: string }).error)
      }
      setSuccess(true)
    } catch (err) {
      setErro(await mensagemDoErro(err))
    } finally {
      setSubmitting(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen bg-background gradient-bg flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center space-y-5 glass-card p-10 animate-fade-in">
          <div className="mx-auto h-16 w-16 rounded-full bg-success/10 flex items-center justify-center">
            <CheckCircle2 className="h-9 w-9 text-success" />
          </div>
          <div className="space-y-1.5">
            <h1 className="text-2xl font-bold text-foreground">Venda enviada!</h1>
            <p className="text-sm text-muted-foreground">
              O time de atendimento já foi avisado e vai validar os dados. Você pode fechar essa página.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background gradient-bg py-10 px-4">
      <div className="max-w-2xl mx-auto space-y-8">
        <header className="flex flex-col items-center text-center space-y-4 animate-fade-in">
          <div className="flex items-center gap-3">
            <img src="/omnx-logo.png" alt="OMNX Desk" className="h-9 w-9 rounded-xl shadow-sm" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
            <div className="flex flex-col items-start leading-none">
              <span className="text-[10px] uppercase tracking-[0.18em] font-semibold text-muted-foreground">OMNX Desk</span>
              <span className="text-base font-bold text-foreground">Formulário de Cadastro</span>
            </div>
          </div>
          <div className="space-y-2 max-w-md">
            <h1 className="text-3xl font-bold text-foreground tracking-tight">Registrar venda</h1>
            <p className="text-sm text-muted-foreground">
              Preencha os dados da venda que você acabou de fechar. O time de atendimento revisa e dá sequência ao fluxo.
            </p>
          </div>
        </header>

        <div className="glass-card flex flex-col sm:flex-row sm:items-center gap-3 border-l-4 border-l-primary p-4 animate-fade-in">
          <Info className="hidden sm:block h-5 w-5 shrink-0 text-primary" />
          <div className="flex-1 text-sm">
            <p className="font-semibold text-foreground">Primeira vez preenchendo?</p>
            <p className="text-muted-foreground">Veja o passo a passo guiado — leva menos de 1 minuto e evita erros.</p>
          </div>
          <button
            type="button"
            onClick={() => setTourOpen(true)}
            className="flex items-center justify-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            <PlayCircle className="h-4 w-4" /> Ver tutorial
          </button>
        </div>

        <form onSubmit={submit} className="space-y-5">
          <Card title="Seus dados (closer)" icon={<User className="h-4 w-4" />} dataTour="closer">
            <Field label="Seu nome *">
              <Input value={closerNome} onChange={setCloserNome} required />
            </Field>
            <Field label="Seu e-mail *">
              <Input type="email" value={closerEmail} onChange={setCloserEmail} required />
            </Field>
          </Card>

          <Card title="Dados do cliente" icon={<Building2 className="h-4 w-4" />} dataTour="cliente">
            <Field label="Nome completo *" wide>
              <Input value={clienteNome} onChange={setClienteNome} required />
            </Field>
            <Field label="Razão social" wide>
              <Input value={clienteRazaoSocial} onChange={setClienteRazaoSocial} />
            </Field>
            <Field label="WhatsApp *">
              <PhoneInput
                international
                defaultCountry="BR"
                countryOptionsOrder={['BR', '|', 'US', 'PT', 'AR', 'CL', 'CO', 'MX', 'PY', 'UY', 'PE', 'ES', 'GB', 'CA', '...']}
                value={clienteWhatsapp}
                onChange={(v) => setClienteWhatsapp(v ?? '')}
                placeholder="(11) 91234-5678"
                className="phone-input-omnx"
              />
            </Field>
            <Field label="E-mail">
              <Input type="email" value={clienteEmail} onChange={setClienteEmail} />
            </Field>
            <Field label="CPF / CNPJ">
              <Input value={clienteCpfCnpj} onChange={setClienteCpfCnpj} />
            </Field>
            <Field label="Instagram">
              <Input value={clienteInstagram} onChange={setClienteInstagram} placeholder="@usuario ou URL" />
            </Field>
            <Field label="CEP">
              <Input value={clienteCep} onChange={(v) => setClienteCep(formatCEP(v))} placeholder="00000-000" />
            </Field>
            <Field label="Logradouro" wide>
              <Input value={clienteLogradouro} onChange={setClienteLogradouro} placeholder="Av. / Rua" />
            </Field>
            <Field label="Número">
              <Input value={clienteNumero} onChange={setClienteNumero} placeholder="123" />
            </Field>
            <Field label="Complemento">
              <Input value={clienteComplemento} onChange={setClienteComplemento} placeholder="Sala, apto, bloco…" />
            </Field>
            <Field label="Bairro">
              <Input value={clienteBairro} onChange={setClienteBairro} />
            </Field>
            <Field label="Município">
              <Input value={clienteMunicipio} onChange={setClienteMunicipio} />
            </Field>
            <Field label="UF">
              <Input value={clienteUf} onChange={(v) => setClienteUf(v.toUpperCase().slice(0, 2))} placeholder="SP" />
            </Field>
          </Card>

          <Card title="Quem fez o pagamento" icon={<Users className="h-4 w-4" />}>
            <div className="col-span-full space-y-3">
              <label className="flex items-start gap-3 rounded-lg border border-border p-3 cursor-pointer hover:bg-muted/40">
                <input
                  type="checkbox"
                  checked={pagadorDiferente}
                  onChange={(e) => setPagadorDiferente(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-border accent-primary"
                />
                <span className="text-sm">
                  <span className="font-medium text-foreground">O pagamento foi feito por outra pessoa (não o cliente do contrato)</span>
                  <span className="block text-xs text-muted-foreground">Marque quando quem pagou é diferente de quem assina — ex.: empresa/sócio, cônjuge ou familiar.</span>
                </span>
              </label>

              {pagadorDiferente && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-lg border border-warning/40 bg-warning/5 p-3 animate-fade-in">
                  <div className="sm:col-span-2">
                    <label className="text-xs font-medium text-foreground">Nome de quem pagou *</label>
                    <Input value={pagadorNome} onChange={setPagadorNome} placeholder="Nome completo ou razão social" required />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-foreground">CPF / CNPJ de quem pagou</label>
                    <Input value={pagadorCpfCnpj} onChange={setPagadorCpfCnpj} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-foreground">Relação com o cliente</label>
                    <Input value={pagadorRelacao} onChange={setPagadorRelacao} placeholder="Sócio, cônjuge, empresa, pai/mãe…" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-xs font-medium text-foreground">Observação</label>
                    <textarea
                      value={pagadorObservacao}
                      onChange={(e) => setPagadorObservacao(e.target.value)}
                      rows={2}
                      placeholder="Algum detalhe sobre o arranjo de pagamento…"
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                  </div>
                </div>
              )}
            </div>
          </Card>

          <Card title="Produto vendido" icon={<Package className="h-4 w-4" />} dataTour="produto">
            <Field label="Produto *" wide>
              <select
                value={produtoId}
                onChange={(e) => setProdutoId(e.target.value)}
                required
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              >
                <option value="">— selecione —</option>
                {produtos.map((p) => (
                  <option key={p.id} value={p.id}>{p.nome}</option>
                ))}
              </select>
            </Field>
            <Field label="Valor total da venda" wide>
              <Input
                value={formatBRLInput(valorTotalVenda)}
                onChange={(v) => setValorTotalVenda(parseBRLInput(v))}
                placeholder="0,00"
              />
            </Field>
          </Card>

          <Card title="Pagamentos" icon={<Wallet className="h-4 w-4" />} dataTour="pagamentos">
            <div className="col-span-full space-y-3">
              <div className="flex gap-2 rounded-lg border border-info/30 bg-info-light/50 px-3 py-2 text-xs text-foreground">
                <Info className="h-4 w-4 shrink-0 text-info mt-0.5" />
                <span>Liste <strong>todos os pagamentos futuros</strong> do cliente (entrada + todas as parcelas) pra espelhar o contrato. Parcelas que ainda vão acontecer não precisam de comprovante agora.</span>
              </div>

              <div className="rounded-lg border border-border p-3 space-y-1.5">
                <Field label="Identificador de pagamento">
                  <Input
                    value={identificadorPagamento}
                    onChange={(v) => { setIdentificadorPagamento(v); setIdentificadorEditado(true) }}
                    placeholder="Nome que aparece no extrato do banco"
                  />
                </Field>
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  {ocrStatus === 'lendo' ? (
                    <><Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" /> Lendo o comprovante pra achar o nome do extrato…</>
                  ) : ocrStatus === 'achou' ? (
                    <><ScanLine className="h-3.5 w-3.5 shrink-0 text-success" /> Nome lido do comprovante — <strong>confira</strong> e corrija se estiver errado.</>
                  ) : ocrStatus === 'nao_achou' ? (
                    <><ScanLine className="h-3.5 w-3.5 shrink-0 text-warning" /> Não consegui ler o nome no comprovante. Digite como aparece no extrato.</>
                  ) : (
                    <><ScanLine className="h-3.5 w-3.5 shrink-0" /> Preenche sozinho quando você anexar o comprovante (imagem). Serve pra achar o pagamento no extrato do banco.</>
                  )}
                </p>
              </div>
              {pagamentos.map((p, idx) => (
                <div key={idx} className="rounded-lg border border-border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">Pagamento {idx + 1}</span>
                    {pagamentos.length > 1 && (
                      <button type="button" onClick={() => removePagamento(idx)} className="p-1 rounded hover:bg-danger-light text-muted-foreground hover:text-danger">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <Field label="Data">
                      <Input type="date" value={p.data} onChange={(v) => updatePagamento(idx, { data: v })} required />
                    </Field>
                    <Field label="Valor (R$)">
                      <Input
                        value={formatBRLInput(p.valor)}
                        onChange={(v) => updatePagamento(idx, { valor: parseBRLInput(v) })}
                        placeholder="0,00"
                        required
                      />
                    </Field>
                    <Field label="Forma">
                      <select
                        value={(FORMAS as readonly string[]).includes(p.forma) ? p.forma : 'Outros'}
                        onChange={(e) => updatePagamento(idx, { forma: e.target.value === 'Outros' ? '' : e.target.value })}
                        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                      >
                        {FORMAS.map((f) => <option key={f} value={f}>{f}</option>)}
                        <option value="Outros">Outros</option>
                      </select>
                      {!(FORMAS as readonly string[]).includes(p.forma) && (
                        <Input
                          value={p.forma}
                          onChange={(v) => updatePagamento(idx, { forma: v })}
                          placeholder="Descreva a forma de pagamento"
                          required
                        />
                      )}
                    </Field>
                    <Field label="Plataforma">
                      <select
                        value={(PLATAFORMAS as readonly string[]).includes(p.plataforma) ? p.plataforma : 'Outros'}
                        onChange={(e) => updatePagamento(idx, { plataforma: e.target.value === 'Outros' ? '' : e.target.value })}
                        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                      >
                        {PLATAFORMAS.map((f) => <option key={f} value={f}>{f}</option>)}
                        <option value="Outros">Outros</option>
                      </select>
                      {!(PLATAFORMAS as readonly string[]).includes(p.plataforma) && (
                        <Input
                          value={p.plataforma}
                          onChange={(v) => updatePagamento(idx, { plataforma: v })}
                          placeholder="Descreva a plataforma"
                          required
                        />
                      )}
                    </Field>
                    <Field label="Sinal / Parcela" wide>
                      <Input value={p.sinal} onChange={(v) => updatePagamento(idx, { sinal: v })} placeholder="Entrada, Parcela 1, Parcela 2…" required />
                    </Field>
                    <div className="sm:col-span-2 space-y-1.5">
                      <label className="text-xs font-medium text-foreground">Comprovantes desta parcela</label>
                      <label className="flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-muted/30 p-3 cursor-pointer hover:bg-muted">
                        <Upload className="h-4 w-4 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">Anexar imagens ou PDF</span>
                        <input
                          type="file"
                          multiple
                          accept="image/*,application/pdf,.heic,.heif"
                          className="hidden"
                          onChange={(e) => { addArquivosPagamento(idx, Array.from(e.target.files ?? [])); e.target.value = '' }}
                        />
                      </label>
                      {p.arquivos.length > 0 && (
                        <ul className="space-y-1">
                          {p.arquivos.map((f, fIdx) => (
                            <li key={fIdx} className="flex items-center justify-between rounded-md border border-border px-2 py-1 text-xs">
                              <span className="truncate">{f.name} <span className="text-muted-foreground">({Math.round(f.size / 1024)} KB)</span></span>
                              <button type="button" onClick={() => removeArquivoPagamento(idx, fIdx)} className="p-1 rounded hover:bg-danger-light text-muted-foreground hover:text-danger">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={addPagamento}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted"
              >
                <Plus className="h-4 w-4" /> Adicionar pagamento
              </button>

              <div data-tour="repetir" className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-2.5">
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Repeat className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-xs font-semibold text-foreground">Muitas parcelas iguais?</p>
                    <p className="text-[11px] text-muted-foreground">Preencha a última parcela acima e gere as próximas, mês a mês.</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center rounded-full border border-border bg-background">
                    <button
                      type="button"
                      onClick={() => setQtdRepetir((v) => Math.max(1, v - 1))}
                      className="flex h-8 w-8 items-center justify-center rounded-l-full text-muted-foreground hover:bg-muted"
                      aria-label="Diminuir"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="w-9 text-center text-sm font-bold tabular-nums text-foreground">{qtdRepetir}</span>
                    <button
                      type="button"
                      onClick={() => setQtdRepetir((v) => Math.min(48, v + 1))}
                      className="flex h-8 w-8 items-center justify-center rounded-r-full text-muted-foreground hover:bg-muted"
                      aria-label="Aumentar"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <span className="text-xs text-muted-foreground">parcelas</span>
                  <button
                    type="button"
                    onClick={() => repetirUltima(qtdRepetir)}
                    className="ml-auto flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90"
                    title="Cria cópias da última parcela, mês a mês, numerando automaticamente"
                  >
                    <Copy className="h-3.5 w-3.5" /> Gerar parcelas
                  </button>
                </div>
              </div>
            </div>
          </Card>

          <Card title="Observações" icon={<FileText className="h-4 w-4" />}>
            <Field label="Algo importante sobre a venda" wide>
              <textarea
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                rows={3}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </Field>
          </Card>

          {erro && (
            <div className="rounded-lg border border-danger/40 bg-danger-light p-3 text-sm text-danger animate-fade-in">
              {erro}
            </div>
          )}

          {avisoPagUnico && (
            <div className="rounded-lg border border-warning/50 bg-warning/10 p-3 space-y-3 animate-fade-in">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-5 w-5 shrink-0 text-warning" />
                <div className="text-sm">
                  <p className="font-semibold text-foreground">Você cadastrou só 1 pagamento. Está certo?</p>
                  <p className="text-muted-foreground">A maioria das vendas tem parcelas futuras. Se o cliente ainda vai pagar mais parcelas, adicione todas aqui — elas precisam espelhar o contrato.</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 pl-7">
                <button
                  type="button"
                  onClick={addPagamento}
                  className="flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
                >
                  <Plus className="h-3.5 w-3.5" /> Adicionar as parcelas
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50"
                >
                  É só esse pagamento mesmo, enviar
                </button>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            data-tour="enviar"
            className="w-full gradient-primary rounded-full px-4 py-3.5 text-sm font-semibold text-primary-foreground shadow-md hover:opacity-95 transition-opacity disabled:opacity-50"
          >
            {submitting ? 'Enviando…' : 'Enviar venda'}
          </button>

          <p className="text-center text-[11px] text-muted-foreground pt-2">
            OMNX Desk © {new Date().getFullYear()} — Aliança de Alto Valor
          </p>
        </form>
      </div>

      <GuidedTour steps={TOUR_STEPS} open={tourOpen} onClose={fecharTour} />
    </div>
  )
}

function Card({ title, icon, children, dataTour }: { title: string; icon?: React.ReactNode; children: React.ReactNode; dataTour?: string }) {
  return (
    <div className="glass-card p-5 sm:p-6 space-y-4" data-tour={dataTour}>
      <div className="flex items-center gap-2 pb-1 border-b border-border/60">
        {icon && <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">{icon}</span>}
        <h2 className="text-sm font-bold text-foreground tracking-tight">{title}</h2>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {children}
      </div>
    </div>
  )
}

function Field({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <div className={`space-y-1.5 ${wide ? 'sm:col-span-2' : ''}`}>
      <label className="text-xs font-medium text-foreground">{label}</label>
      {children}
    </div>
  )
}

function Input({
  value, onChange, type = 'text', placeholder, required, step, min,
}: {
  value: string
  onChange: (v: string) => void
  type?: string
  placeholder?: string
  required?: boolean
  step?: string
  min?: string
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      required={required}
      step={step}
      min={min}
      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
    />
  )
}
