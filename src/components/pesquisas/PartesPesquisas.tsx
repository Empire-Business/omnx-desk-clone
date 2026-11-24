import { useState } from 'react'
import { Check, Copy, Minus, Star, ThumbsDown, ThumbsUp } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { SeloStatus, type TomStatus } from '@/components/ui/StatusBadge'
import { cn } from '@/lib/utils'
import { faixaNps, linkPesquisa, zonaNps, type FaixaNps, type PlacarNps } from '@/lib/pesquisasNps'

const TOM_FAIXA: Record<FaixaNps, TomStatus> = { promotor: 'resolvido', neutro: 'aguardando', detrator: 'atrasado' }
const COR_FAIXA: Record<FaixaNps, string> = { promotor: 'bg-success', neutro: 'bg-warning', detrator: 'bg-danger' }

export function NotaNps({ nota }: { nota: number }) {
  return <SeloStatus tom={TOM_FAIXA[faixaNps(nota)]} size="sm">{nota}</SeloStatus>
}

function Cartao({ rotulo, valor, detalhe, icone: Icone, cor }: {
  rotulo: string
  valor: string | number
  detalhe?: string
  icone: LucideIcon
  cor: string
}) {
  return (
    <div className="glass-card flex items-center gap-4 p-4 sm:p-5">
      <div className={cn('shrink-0 rounded-lg p-2.5', cor)}><Icone className="h-5 w-5" aria-hidden /></div>
      <div className="min-w-0">
        <p className="t-h2 tabular-nums leading-tight text-foreground">{valor}</p>
        <p className="mt-0.5 text-[12.5px] text-muted-foreground">{rotulo}{detalhe ? ` · ${detalhe}` : ''}</p>
      </div>
    </div>
  )
}

/** Placar NPS: número, zona, promotores/neutros/detratores e a barra de distribuição. */
export function PlacarNpsCartoes({ placar }: { placar: PlacarNps }) {
  const corNps = placar.nps === null ? 'bg-muted text-muted-foreground'
    : placar.nps >= 50 ? 'bg-success-light text-success'
      : placar.nps >= 0 ? 'bg-warning-light text-warning' : 'bg-danger-light text-danger'
  const faixas: Array<{ chave: FaixaNps; rotulo: string; valor: number }> = [
    { chave: 'promotor', rotulo: 'Promotores', valor: placar.promotores },
    { chave: 'neutro', rotulo: 'Neutros', valor: placar.neutros },
    { chave: 'detrator', rotulo: 'Detratores', valor: placar.detratores },
  ]
  return (
    <section aria-label="Placar NPS" className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
        <Cartao rotulo="NPS" valor={placar.nps ?? '—'} detalhe={zonaNps(placar.nps)} icone={Star} cor={corNps} />
        <Cartao rotulo="Promotores (9–10)" valor={placar.promotores} icone={ThumbsUp} cor="bg-success-light text-success" />
        <Cartao rotulo="Neutros (7–8)" valor={placar.neutros} icone={Minus} cor="bg-warning-light text-warning" />
        <Cartao rotulo="Detratores (0–6)" valor={placar.detratores} icone={ThumbsDown} cor="bg-danger-light text-danger" />
      </div>
      {placar.total > 0 && (
        <div className="glass-card space-y-2 p-4 sm:p-5">
          <p className="m-0 text-[12.5px] text-muted-foreground">
            {placar.total === 1 ? '1 resposta' : `${placar.total} respostas`} · média <b className="text-foreground">{String(placar.media).replace('.', ',')}</b>
          </p>
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
            {faixas.filter((f) => f.valor > 0).map((f) => (
              <div key={f.chave} className={cn('h-full', COR_FAIXA[f.chave])} style={{ width: `${(f.valor / placar.total) * 100}%` }} />
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

/** Copia o endereço do portal em que o cliente responde. Não envia nada. */
export function BotaoCopiarLink({ surveyId, portalLigado, compacto }: { surveyId: string; portalLigado: boolean; compacto?: boolean }) {
  const [copiado, setCopiado] = useState(false)
  const [falhou, setFalhou] = useState(false)
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(linkPesquisa(window.location.origin, surveyId))
      setFalhou(false)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      setFalhou(true)
    }
  }
  const titulo = portalLigado
    ? 'Copia o endereço em que o cliente responde, no portal do cliente'
    : 'O portal do cliente está desligado nesta instalação: o link só abre para o cliente quando ele for ligado'
  return (
    <button type="button" className={cn('btn btn-secondary', compacto && 'btn-sm')} onClick={copiar} disabled={!portalLigado} title={titulo}>
      {copiado ? <Check aria-hidden /> : <Copy aria-hidden />}
      {copiado ? 'Link copiado' : falhou ? 'Não deu para copiar' : 'Copiar link'}
    </button>
  )
}
