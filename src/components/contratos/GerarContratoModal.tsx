import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FileDown, Check, AlertCircle, Plus, Trash2 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { supabase } from '@/lib/supabase'
import { useContratoModelos, modelosDoProduto, carregarModeloArquivo } from '@/hooks/useContratoModelos'
import { useUploadAnexo } from '@/hooks/useComissoes'
import { type DadosContrato, type Parcela } from '@/lib/contratoTemplate'
import { gerarContratoDocx, baixarBlob } from '@/lib/gerarContratoDocx'
import { converterDocxParaPdf } from '@/lib/converterPdf'

const MIME_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

interface Props {
  open: boolean
  onClose: () => void
  dados: DadosContrato
  produtoId: string | null
  contratoId?: string | null
  vendaPendenteId?: string | null
}

function slug(s: string) {
  return (s || 'contrato').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'contrato'
}

const inp = 'w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40'

export function GerarContratoModal({ open, onClose, dados, produtoId, contratoId, vendaPendenteId }: Props) {
  const { data: modelos, isLoading } = useContratoModelos()
  const aplicaveis = modelosDoProduto(modelos, produtoId)
  const upload = useUploadAnexo()

  const [selecionado, setSelecionado] = useState<string>('')
  const [form, setForm] = useState<DadosContrato>(dados)
  const [gerando, setGerando] = useState(false)
  const [resultado, setResultado] = useState<{ tipo: 'ok' | 'erro'; msg: string } | null>(null)

  useEffect(() => {
    if (open) {
      setResultado(null)
      setForm(dados)
      setSelecionado(aplicaveis[0]?.id ?? '')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, modelos])

  const modelo = aplicaveis.find((m) => m.id === selecionado) ?? null

  const { data: contratoLink } = useQuery({
    queryKey: ['contrato-por-venda-pendente', vendaPendenteId],
    enabled: open && !contratoId && !!vendaPendenteId,
    queryFn: async () => {
      const { data } = await supabase.from('contratos').select('id').eq('venda_pendente_id', vendaPendenteId!).maybeSingle()
      return (data as { id: string } | null)?.id ?? null
    },
  })
  const contratoIdFinal = contratoId ?? contratoLink ?? null

  const set = <K extends keyof DadosContrato>(k: K, v: DadosContrato[K]) => setForm((f) => ({ ...f, [k]: v }))
  const parcelas = form.parcelas ?? []
  const setParcela = (i: number, campo: keyof Parcela, v: string) =>
    setForm((f) => ({ ...f, parcelas: (f.parcelas ?? []).map((p, j) => (j === i ? { ...p, [campo]: campo === 'valor' ? (v === '' ? null : Number(v)) : v } : p)) }))
  const addParcela = () => setForm((f) => ({ ...f, parcelas: [...(f.parcelas ?? []), { data: null, valor: null, forma: null, plataforma: null, sinal: null }] }))
  const delParcela = (i: number) => setForm((f) => ({ ...f, parcelas: (f.parcelas ?? []).filter((_, j) => j !== i) }))

  async function gerar() {
    if (!modelo) return
    setGerando(true)
    setResultado(null)
    try {
      const arq = await carregarModeloArquivo(modelo.id)
      const docxBlob = await gerarContratoDocx(arq, form)
      const base = `contrato-${slug(form.cliente_nome ?? 'cliente')}${modelo.variante ? '-' + slug(modelo.variante) : ''}`
      try {
        // caminho principal: PDF (via edge function / CloudConvert)
        const pdf = await converterDocxParaPdf(docxBlob, `${base}.docx`)
        baixarBlob(pdf, `${base}.pdf`)
        if (contratoIdFinal) {
          await upload.mutateAsync({ contratoId: contratoIdFinal, file: new File([pdf], `${base}.pdf`, { type: 'application/pdf' }), categoria: 'contrato' })
          setResultado({ tipo: 'ok', msg: 'PDF gerado, baixado e anexado ao contrato.' })
        } else {
          setResultado({ tipo: 'ok', msg: 'PDF gerado e baixado.' })
        }
      } catch (convErr) {
        // fallback: baixa o .docx pra não travar
        baixarBlob(docxBlob, `${base}.docx`)
        if (contratoIdFinal) {
          await upload.mutateAsync({ contratoId: contratoIdFinal, file: new File([docxBlob], `${base}.docx`, { type: MIME_DOCX }), categoria: 'contrato' })
        }
        setResultado({ tipo: 'erro', msg: `Não gerou o PDF (${(convErr as Error).message}). Baixei o .docx como alternativa.` })
      }
    } catch (e) {
      setResultado({ tipo: 'erro', msg: `Erro ao gerar: ${(e as Error).message}` })
    } finally {
      setGerando(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Gerar contrato" description={dados.produto_nome ?? undefined} size="lg">
      {isLoading ? (
        <div className="h-40 shimmer rounded-lg" />
      ) : aplicaveis.length === 0 ? (
        <div className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm">
          <AlertCircle className="h-5 w-5 shrink-0 text-warning" />
          <div>
            <p className="font-medium text-foreground">Nenhum modelo cadastrado para este produto.</p>
            <p className="text-muted-foreground">Um admin pode subir o modelo em <span className="font-medium">Contratos → Modelos</span>.</p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-foreground">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <span><span className="font-medium">Revise os dados antes de gerar.</span> Tudo que estiver aqui embaixo vai direto pro contrato — confira nome, CPF/CNPJ, endereço e principalmente as datas e valores das parcelas.</span>
          </div>

          {aplicaveis.length > 1 && (
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Modelo / variante</label>
              <select value={selecionado} onChange={(e) => setSelecionado(e.target.value)} className={inp}>
                {aplicaveis.map((m) => <option key={m.id} value={m.id}>{m.titulo || m.variante || 'Modelo'}</option>)}
              </select>
            </div>
          )}

          {/* Dados do cliente — editáveis */}
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">Confira e ajuste os dados do cliente</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <label className="text-xs text-muted-foreground">Cliente
                <input className={inp} value={form.cliente_nome ?? ''} onChange={(e) => set('cliente_nome', e.target.value)} />
              </label>
              <label className="text-xs text-muted-foreground">CPF / CNPJ
                <input className={inp} value={form.cpf_cnpj ?? ''} onChange={(e) => set('cpf_cnpj', e.target.value || null)} />
              </label>
              <label className="text-xs text-muted-foreground sm:col-span-2">Endereço
                <input className={inp} value={form.endereco ?? ''} onChange={(e) => set('endereco', e.target.value || null)} />
              </label>
              <label className="text-xs text-muted-foreground">E-mail
                <input className={inp} value={form.email ?? ''} onChange={(e) => set('email', e.target.value || null)} />
              </label>
              <label className="text-xs text-muted-foreground">WhatsApp
                <input className={inp} value={form.whatsapp ?? ''} onChange={(e) => set('whatsapp', e.target.value || null)} />
              </label>
            </div>
          </div>

          {/* Plano de pagamento — editável */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">Plano de pagamento</p>
              <button onClick={addParcela} className="flex items-center gap-1 text-xs text-primary hover:underline">
                <Plus className="h-3 w-3" /> Adicionar parcela
              </button>
            </div>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr className="text-left">
                    <th className="px-2 py-1.5 font-medium">Vencimento</th>
                    <th className="px-2 py-1.5 font-medium">Valor</th>
                    <th className="px-2 py-1.5 font-medium">Forma</th>
                    <th className="px-2 py-1.5 font-medium">Plataforma</th>
                    <th className="px-2 py-1.5 font-medium">Descrição</th>
                    <th className="px-2 py-1.5" />
                  </tr>
                </thead>
                <tbody>
                  {parcelas.length === 0 ? (
                    <tr><td colSpan={6} className="px-2 py-3 text-center text-muted-foreground">Sem parcelas. Adicione acima.</td></tr>
                  ) : parcelas.map((p, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="px-1 py-1"><input type="date" className={inp} value={(p.data ?? '').slice(0, 10)} onChange={(e) => setParcela(i, 'data', e.target.value)} /></td>
                      <td className="px-1 py-1"><input type="number" step="0.01" className={inp} value={p.valor ?? ''} onChange={(e) => setParcela(i, 'valor', e.target.value)} /></td>
                      <td className="px-1 py-1">
                        <input list="formas-pgto" className={inp} value={p.forma ?? ''} onChange={(e) => setParcela(i, 'forma', e.target.value)} />
                      </td>
                      <td className="px-1 py-1"><input className={inp} value={p.plataforma ?? ''} onChange={(e) => setParcela(i, 'plataforma', e.target.value)} /></td>
                      <td className="px-1 py-1"><input className={inp} value={p.sinal ?? ''} onChange={(e) => setParcela(i, 'sinal', e.target.value)} /></td>
                      <td className="px-1 py-1 text-right">
                        <button onClick={() => delParcela(i)} className="rounded p-1 text-muted-foreground/60 hover:text-danger hover:bg-danger/10"><Trash2 className="h-3.5 w-3.5" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <datalist id="formas-pgto">
              <option value="PIX" /><option value="Cartão à vista" /><option value="Cartão parcelado" /><option value="Boleto" /><option value="Transferência" />
            </datalist>
          </div>

          <p className="text-xs text-muted-foreground">
            Gera o <span className="font-medium">.docx</span> com a formatação original, preenchendo os dados acima. Confira antes de gerar.
          </p>

          {resultado && (
            <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${resultado.tipo === 'ok' ? 'bg-success-light text-success' : 'bg-danger-light text-danger'}`}>
              {resultado.tipo === 'ok' ? <Check className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
              {resultado.msg}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} className="rounded-full border border-border px-4 py-2 text-sm hover:bg-muted transition-colors">Fechar</button>
            <button onClick={gerar} disabled={gerando || !modelo} className="flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity">
              <FileDown className="h-4 w-4" /> {gerando ? 'Gerando…' : 'Gerar contrato (PDF)'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
