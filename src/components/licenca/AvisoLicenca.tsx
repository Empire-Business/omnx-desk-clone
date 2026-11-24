import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { LockKeyhole } from 'lucide-react'
import { useLicenca } from '@/hooks/useLicenca'
import { MENSAGEM_LICENCA_VENCIDA, ROTA_EXPORTAR_DADOS, rotaAbertaSemLicenca, type SituacaoLicenca } from '@/lib/licenca'

/** Faixa no topo enquanto a licença estiver negada. */
export function AvisoLicenca({ situacao }: { situacao: SituacaoLicenca }) {
  if (!situacao.nega) return null
  return (
    <div role="alert" className="border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
      {situacao.mensagem ?? MENSAGEM_LICENCA_VENCIDA}
    </div>
  )
}

/** Tela mostrada no lugar das telas de uso quando a licença está negada. */
export function TelaLicencaNegada({ situacao }: { situacao: SituacaoLicenca }) {
  const atalhos = [
    { rota: '/configuracoes', rotulo: 'Configurações' },
    { rota: ROTA_EXPORTAR_DADOS, rotulo: 'Exportar dados' },
    { rota: '/meus-reportes', rotulo: 'Ajuda e reportes' },
  ]
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center px-4 py-10 text-center sm:py-16">
      <div className="mb-4 rounded-lg bg-muted p-4">
        <LockKeyhole className="h-8 w-8 text-muted-foreground" aria-hidden />
      </div>
      <h1 className="t-h2 text-foreground">Licença inativa</h1>
      <p className="mt-2 text-sm text-muted-foreground">{situacao.mensagem ?? MENSAGEM_LICENCA_VENCIDA}</p>
      <ul className="mt-6 grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
        {atalhos.map((a) => (
          <li key={a.rota}>
            <Link to={a.rota} className="btn btn-secondary min-h-12 w-full justify-center">{a.rotulo}</Link>
          </li>
        ))}
        <li>
          <a href="/manual" className="btn btn-secondary min-h-12 w-full justify-center">Manual</a>
        </li>
      </ul>
    </div>
  )
}

/**
 * Envolve as rotas: com a licença negada, só as telas abertas (login,
 * Configurações com a exportação, Ajuda) aparecem; as demais mostram a
 * TelaLicencaNegada. O banco e as funções negam de verdade; aqui é só a tela.
 * Em modo off (produção da empresa) não muda nada.
 */
export function TravaDeLicenca({ children }: { children: ReactNode }) {
  const situacao = useLicenca()
  const { pathname } = useLocation()
  if (!situacao.nega) return <>{children}</>
  return (
    <>
      <AvisoLicenca situacao={situacao} />
      {rotaAbertaSemLicenca(pathname) ? children : <TelaLicencaNegada situacao={situacao} />}
    </>
  )
}
