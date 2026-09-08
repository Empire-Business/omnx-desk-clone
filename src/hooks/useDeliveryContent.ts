import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { deliveryKeys } from '@/hooks/useEntregas'
import type { ContentType } from '@/types/database'

export interface ContentItemInput {
  tipo: ContentType
  file?: File        // for imagem/video/documento
  url?: string       // for link
  texto?: string     // for texto
  nome?: string
}

export interface CreateVersionInput {
  delivery_id: string
  notas?: string
  items: ContentItemInput[]
}

export function useCreateVersion() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ delivery_id, notas, items }: CreateVersionInput) => {
      // Step 1: Insert new delivery version
      const { data: version, error: versionError } = await supabase
        .from('delivery_versions')
        .insert({ delivery_id, notas: notas ?? null })
        .select()
        .single()

      if (versionError) throw versionError

      const version_id = version.id

      // Step 2: Process and insert each content item
      for (const item of items) {
        let resolvedUrl: string | null = item.url ?? null
        let resolvedNome: string | null = item.nome ?? null
        let resolvedTamanho: number | null = null

        const isFileType = item.tipo === 'imagem' || item.tipo === 'video' || item.tipo === 'documento'

        if (isFileType && item.file) {
          const file = item.file
          const filename = file.name
          const storagePath = `deliveries/${delivery_id}/${version_id}/${filename}`

          const { error: uploadError } = await supabase.storage
            .from('deliveries')
            .upload(storagePath, file, { upsert: false })

          if (uploadError) throw uploadError

          const { data: urlData } = supabase.storage
            .from('deliveries')
            .getPublicUrl(storagePath)

          resolvedUrl = urlData.publicUrl
          resolvedNome = item.nome ?? filename
          resolvedTamanho = file.size
        }

        const { error: itemError } = await supabase
          .from('delivery_content_items')
          .insert({
            version_id,
            tipo: item.tipo,
            url: resolvedUrl,
            texto: item.texto ?? null,
            nome: resolvedNome,
            tamanho: resolvedTamanho,
          })

        if (itemError) throw itemError
      }

      // Step 3: Update delivery status to 'aguardando_aprovacao'
      const { error: statusError } = await supabase
        .from('deliveries')
        .update({ status: 'aguardando_aprovacao' })
        .eq('id', delivery_id)

      if (statusError) throw statusError

      return version
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: deliveryKeys.all })
      queryClient.invalidateQueries({ queryKey: deliveryKeys.detail(variables.delivery_id) })
    },
  })
}

export function useDeleteVersion() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ version_id, delivery_id }: { version_id: string; delivery_id: string }) => {
      // Delete the version — cascade removes content_items via FK constraint
      const { error: deleteError } = await supabase
        .from('delivery_versions')
        .delete()
        .eq('id', version_id)

      if (deleteError) throw deleteError

      // Check if any versions remain for this delivery
      const { data: remaining, error: countError } = await supabase
        .from('delivery_versions')
        .select('id')
        .eq('delivery_id', delivery_id)

      if (countError) throw countError

      // If no versions remain, reset delivery status back to 'rascunho'
      if (!remaining || remaining.length === 0) {
        const { error: statusError } = await supabase
          .from('deliveries')
          .update({ status: 'rascunho' })
          .eq('id', delivery_id)

        if (statusError) throw statusError
      }

      return { version_id, delivery_id }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: deliveryKeys.all })
      queryClient.invalidateQueries({ queryKey: deliveryKeys.detail(variables.delivery_id) })
    },
  })
}
