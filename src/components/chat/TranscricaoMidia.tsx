import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from '@/integrations/supabase/client'

// "Ver transcrição" sob a mensagem de voz (chat_midia_texto — migration
// 20261027130000). Só busca quando a pessoa clica. A RLS da tabela é a mesma
// da mensagem: quem vê o áudio vê a transcrição. Texto exibido como texto puro
// (o React escapa) — é o que o cliente falou, transcrito por IA.

// Tabela nova ainda fora dos tipos gerados do Supabase.
const semTipos = () => supabase as unknown as SupabaseClient

interface LinhaTexto {
  status: 'pendente' | 'ok' | 'falhou' | 'ignorado'
  texto: string | null
}

export function TranscricaoMidia({ messageId }: { messageId: string }) {
  const [aberto, setAberto] = useState(false)
  const { data, isLoading, isError } = useQuery({
    queryKey: ['chat_midia_texto', messageId],
    enabled: aberto,
    staleTime: 60_000,
    queryFn: async (): Promise<LinhaTexto | null> => {
      const { data: linha, error } = await semTipos()
        .from('chat_midia_texto')
        .select('status, texto')
        .eq('message_id', messageId)
        .maybeSingle()
      if (error) throw error
      return (linha as LinhaTexto | null) ?? null
    },
  })

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="self-start min-h-6 rounded-sm text-[12px] font-medium text-link hover:underline underline-offset-2 focus-ds"
      >
        Ver transcrição
      </button>
    )
  }

  let corpo: string
  if (isLoading) corpo = 'Carregando…'
  else if (isError || !data) corpo = 'Transcrição indisponível para este áudio.'
  else if (data.status === 'ok' && data.texto) corpo = data.texto
  else if (data.status === 'pendente') corpo = 'Transcrição em andamento. Volte em alguns minutos.'
  else corpo = 'Não foi possível transcrever este áudio.'

  return (
    <div className="max-w-[min(300px,100%)] rounded-md bg-foreground/[0.04] px-2.5 py-1.5">
      <p className="text-[13px] leading-relaxed whitespace-pre-wrap break-words">{corpo}</p>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
        <span className="text-[11px] text-muted-foreground">Transcrição automática, pode conter erros</span>
        <button
          type="button"
          onClick={() => setAberto(false)}
          className="min-h-6 rounded-sm text-[12px] font-medium text-link hover:underline underline-offset-2 focus-ds"
        >
          Ocultar
        </button>
      </div>
    </div>
  )
}
