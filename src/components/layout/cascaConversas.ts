import { useEffect } from 'react'
import { useOutletContext } from 'react-router-dom'

/**
 * Canal entre a casca de Conversas (`ChatLayout`) e as telas dentro dela.
 *
 * Hoje serve a uma coisa só: no celular, quando uma conversa está aberta, a
 * barra inferior some para devolver a altura ao campo de mensagem (o botão
 * "voltar" do cabeçalho da conversa leva de volta à lista, e a barra volta).
 */
export type ContextoCascaConversas = {
  /** Avisa a casca se há uma conversa aberta ocupando a tela do celular. */
  marcarConversaAberta: (aberta: boolean) => void
}

/**
 * Informa à casca que há (ou não) uma conversa aberta em tela cheia no celular.
 * Ao sair da tela, desmarca sozinho — a barra inferior nunca fica presa escondida.
 * Fora da casca de Conversas não faz nada.
 */
export function useAvisarConversaAberta(aberta: boolean) {
  const casca = useOutletContext<ContextoCascaConversas | undefined>()
  const marcar = casca?.marcarConversaAberta

  useEffect(() => {
    if (!marcar) return
    marcar(aberta)
    return () => marcar(false)
  }, [marcar, aberta])
}
