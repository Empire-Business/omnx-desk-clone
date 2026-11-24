import { useCallback, useState } from 'react'

const CHAVE = 'omnx-menu-recolhido'

function ler(): boolean | null {
  try {
    const v = localStorage.getItem(CHAVE)
    return v === null ? null : v === '1'
  } catch {
    return null
  }
}

/**
 * Preferência "menu lateral recolhido", lembrada entre telas e visitas.
 * É só conveniência: se o navegador bloquear o armazenamento, cai no padrão.
 */
export function useMenuRecolhido(padrao = false): [boolean, () => void] {
  const [recolhido, setRecolhido] = useState<boolean>(() => ler() ?? padrao)
  const alternar = useCallback(() => {
    setRecolhido((atual) => {
      const novo = !atual
      try { localStorage.setItem(CHAVE, novo ? '1' : '0') } catch { /* sem armazenamento */ }
      return novo
    })
  }, [])
  return [recolhido, alternar]
}
