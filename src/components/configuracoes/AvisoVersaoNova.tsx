import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Check, Copy, Sparkles } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { BRAND } from '@/config/brand'
import { appUpdateNotice, updateRequest, type AppUpdateRow } from '@/lib/app-update'

/** Banco sem a tabela, sem linha ou com a licença negada (402) = sem aviso. */
async function buscarAvisoVersao(): Promise<AppUpdateRow | null> {
  try {
    const { data, error } = await supabase
      .from('htai_app_update' as never)
      .select('installed_version, latest_version, notes')
      .maybeSingle()
    if (error || !data) return null
    return data as unknown as AppUpdateRow
  } catch {
    return null
  }
}

/**
 * Faixa "versão nova" do app instalado, para quem administra a instalação, com o
 * pedido pronto para colar na IA (mesmo padrão do GT3). Os dados vêm da central
 * do HTAI pela função htai-licenca (tabela htai_app_update).
 */
export function AvisoVersaoNova() {
  const [copiado, setCopiado] = useState(false)
  const [erro, setErro] = useState(false)
  const { data } = useQuery({
    queryKey: ['htai-app-update'],
    queryFn: buscarAvisoVersao,
    staleTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  })
  const aviso = appUpdateNotice(data)
  if (!aviso) return null
  const pedido = updateRequest(BRAND.appName)

  async function copiar() {
    try {
      await navigator.clipboard.writeText(pedido)
      setErro(false)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2500)
    } catch {
      setErro(true)
    }
  }

  return (
    <div role="status" className="glass-card mb-4 space-y-3 border border-primary/40 p-3 sm:p-4">
      <div className="flex items-start gap-2">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
        <p className="text-sm font-semibold text-foreground">Versão nova do {BRAND.appName}: {aviso.latest}</p>
      </div>
      <p className="text-sm text-muted-foreground">
        Você está na {aviso.installed}. O que você personalizou e os dados continuam, e fica uma cópia de segurança.
      </p>
      {aviso.notes.length > 0 && (
        <ul className="list-disc space-y-1 pl-5 text-sm text-foreground">
          {aviso.notes.map((n, i) => <li key={`${i}-${n}`}>{n}</li>)}
        </ul>
      )}
      <p className="text-sm text-foreground">Para atualizar, abra a pasta do app na sua IA (Claude Code ou Codex) e cole o pedido:</p>
      <button type="button" onClick={copiar} className="btn btn-secondary min-h-10">
        {copiado ? <Check className="mr-2 h-4 w-4" aria-hidden /> : <Copy className="mr-2 h-4 w-4" aria-hidden />}
        {copiado ? 'Pedido copiado' : `Copiar "${pedido}"`}
      </button>
      {erro && <p className="text-xs text-danger">Não foi possível copiar. Escreva na IA: {pedido}</p>}
    </div>
  )
}
