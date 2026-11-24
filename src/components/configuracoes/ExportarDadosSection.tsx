import { useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { baixarBlob } from '@/lib/gerarContratoDocx'
import { nomeArquivoExportacao } from '@/lib/licenca'

/**
 * Exportar todos os dados da empresa num arquivo JSON (função htai-exportar).
 * Sempre aberta, inclusive com a licença negada (contrato da licença §4).
 * Só a administração da empresa consegue (o servidor confere).
 */
export function ExportarDadosSection() {
  const [estado, setEstado] = useState<'pronto' | 'gerando' | 'feito'>('pronto')
  const [erro, setErro] = useState<string | null>(null)

  async function exportar() {
    setErro(null)
    setEstado('gerando')
    try {
      const { data, error } = await supabase.functions.invoke('htai-exportar', { method: 'POST' })
      if (error || !(data instanceof Blob)) throw error ?? new Error('resposta inválida')
      baixarBlob(data, nomeArquivoExportacao())
      setEstado('feito')
    } catch {
      setErro('Não foi possível gerar a exportação. Só a administração da empresa pode exportar; se for o seu caso, tente de novo em alguns minutos.')
      setEstado('pronto')
    }
  }

  return (
    <div className="glass-card space-y-4 p-3 sm:p-4 lg:p-6">
      <div className="flex items-center gap-3">
        <Download className="h-5 w-5 text-primary" aria-hidden />
        <h2 className="t-h3 text-foreground">Exportar dados</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Baixa um arquivo com todos os dados da empresa (clientes, contratos, conversas, tickets, cobrança e o resto),
        em formato JSON. A exportação funciona mesmo com a licença vencida. Senhas, chaves e tokens não vão no arquivo.
        Os anexos continuam guardados no seu Supabase; o arquivo traz o caminho de cada um.
      </p>
      <button type="button" className="btn btn-primary min-h-11" onClick={exportar} disabled={estado === 'gerando'}>
        {estado === 'gerando' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Download className="h-4 w-4" aria-hidden />}
        {estado === 'gerando' ? 'Gerando o arquivo…' : 'Exportar todos os dados'}
      </button>
      {estado === 'feito' && <p role="status" className="text-sm text-success">Arquivo baixado.</p>}
      {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
    </div>
  )
}
