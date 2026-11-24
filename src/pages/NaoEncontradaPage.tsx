import { useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { CircleHelp, SearchX } from 'lucide-react'
import { ITENS_PRINCIPAIS } from '@/config/navegacao'
import { useAcessoNavegacao } from '@/hooks/useAcessoNavegacao'
import { registrarEvento } from '@/lib/observabilidade'
import { useAjuda } from '@/components/ajuda/ajudaContexto'

/**
 * Página para qualquer endereço desconhecido (auditoria 01, R5).
 *
 * Antes não havia rota curinga: link antigo ou erro de digitação = tela em
 * branco. Agora a pessoa vê onde está e para onde pode ir. O endereço é
 * registrado (sem a busca, que pode ter dado pessoal) para descobrirmos links
 * antigos ainda em uso.
 */
export function NaoEncontradaPage() {
  const { pathname } = useLocation()
  const { pode } = useAcessoNavegacao()
  const { abrirMenu } = useAjuda()
  const atalhos = ITENS_PRINCIPAIS.filter((i) => pode(i.acesso))

  useEffect(() => {
    registrarEvento({ evento: 'rota_nao_encontrada', nivel: 'aviso', detalhe: { caminho: pathname.slice(0, 200) } })
  }, [pathname])

  return (
    <div className="mx-auto flex max-w-lg flex-col items-center py-10 text-center sm:py-16">
      <div className="mb-4 rounded-lg bg-muted p-4">
        <SearchX className="h-8 w-8 text-muted-foreground" aria-hidden />
      </div>
      <h1 className="t-h2 text-foreground">Não encontramos essa tela</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        O endereço pode ter mudado ou estar digitado errado. Escolha para onde quer ir:
      </p>
      <ul className="mt-6 grid w-full grid-cols-2 gap-2 sm:grid-cols-3">
        {atalhos.map((item) => (
          <li key={item.id}>
            <Link
              to={item.rota}
              className="flex min-h-12 items-center justify-center gap-2 btn btn-secondary min-h-12 w-full justify-center"
            >
              <item.icone className="h-4 w-4 text-muted-foreground" aria-hidden />
              {item.rotulo}
            </Link>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={abrirMenu}
        className="btn btn-ghost mt-6"
      >
        <CircleHelp className="h-4 w-4" aria-hidden /> Precisa de ajuda?
      </button>
    </div>
  )
}
