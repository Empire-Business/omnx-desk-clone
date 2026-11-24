import { useState } from 'react'
import { KeyRound } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSalvarTokenNumero, type TipoNumeroUazapi } from '@/hooks/useUazapiTokens'

/**
 * Token da UAZAPI deste número, guardado no cofre do banco. O valor nunca é
 * mostrado de volta: a tela só diz se há um salvo. Usado nos números do Chat e
 * nos números de Cobrança (`tipo`).
 */
export function TokenDoNumero({ instanciaId, salvo, tipo = 'chat' }: { instanciaId: string; salvo: boolean; tipo?: TipoNumeroUazapi }) {
  const [token, setToken] = useState('')
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)
  const salvar = useSalvarTokenNumero(tipo)

  function enviar(valor: string) {
    setAviso(null)
    salvar.mutate(
      { instanciaId, token: valor },
      {
        onSuccess: () => {
          setToken('')
          setAviso({ tipo: 'ok', texto: valor ? 'Token salvo.' : 'Token removido.' })
        },
        onError: () => setAviso({ tipo: 'erro', texto: 'Não foi possível salvar o token. Confira se você é administrador.' }),
      },
    )
  }

  return (
    <div className="mt-5 space-y-2 border-t border-border pt-4">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={`token-${instanciaId}`} className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          <KeyRound className="h-4 w-4 text-muted-foreground" aria-hidden />
          Token do número (UAZAPI)
        </label>
        <span className={cn('tag', salvo && 'tag-success')}>{salvo ? 'Token salvo' : 'Sem token salvo'}</span>
      </div>
      <p className="text-xs text-muted-foreground">
        Copie o token deste número no painel da UAZAPI e cole aqui. Ele fica guardado no cofre do banco e não aparece de novo.
      </p>
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => { e.preventDefault(); if (token.trim()) enviar(token) }}
      >
        <input
          id={`token-${instanciaId}`}
          type="password"
          autoComplete="off"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder={salvo ? 'Colar um token novo para trocar' : 'Colar o token'}
          className="input mono min-w-0 flex-1"
        />
        <button type="submit" disabled={!token.trim() || salvar.isPending} className="btn btn-secondary">
          {salvar.isPending ? 'Salvando...' : salvo ? 'Trocar token' : 'Salvar token'}
        </button>
        {salvo && (
          <button type="button" disabled={salvar.isPending} onClick={() => enviar('')} className="btn btn-ghost hover:!text-danger">
            Remover
          </button>
        )}
      </form>
      {aviso && (
        <p role="status" className={cn('text-xs', aviso.tipo === 'ok' ? 'text-success' : 'text-danger')}>{aviso.texto}</p>
      )}
    </div>
  )
}
