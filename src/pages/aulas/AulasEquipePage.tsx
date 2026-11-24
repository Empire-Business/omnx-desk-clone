import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, BookOpen, Clock, GraduationCap, Layers, Plus } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useMyProgress, useTrilhasComAulas } from '@/hooks/useTrilhas'
import { PageContainer } from '@/components/ui/PageContainer'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { BarraProgresso, MarcaTrilha } from '@/components/aulas/PartesAulas'
import { NovaTrilhaModal } from '@/components/aulas/FormulariosAulas'
import {
  duracaoLegivel, idsConcluidos, plural, podeMontarTrilhas, proximaOrdem, resumoTrilha,
} from '@/lib/aulasEquipe'

/**
 * Aulas da equipe (/aulas): trilhas internas (`learning_paths.tipo = 'interno'`)
 * com o progresso de quem está vendo. O portal do cliente (/portal/trilhas)
 * continua com as trilhas `cliente`; esta tela não mostra nem cria essas.
 */
export function AulasEquipePage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const admin = podeMontarTrilhas(user?.perfil)
  const { data: trilhas = [], isLoading, isError, refetch } = useTrilhasComAulas('interno')
  const { data: progresso } = useMyProgress()
  const [criando, setCriando] = useState(false)

  const concluidas = useMemo(() => idsConcluidos(progresso), [progresso])
  // Trilha desligada (`ativo = false`) fica só para quem monta, marcada como tal.
  const visiveis = useMemo(() => trilhas.filter((t) => admin || t.ativo !== false), [trilhas, admin])
  const resumos = useMemo(() => visiveis.map((t) => ({ trilha: t, resumo: resumoTrilha(t, concluidas) })), [visiveis, concluidas])
  const totalAulas = resumos.reduce((n, r) => n + r.resumo.aulas, 0)
  const totalFeitas = resumos.reduce((n, r) => n + r.resumo.concluidas, 0)

  const botaoNova = admin ? (
    <button type="button" className="btn btn-primary" onClick={() => setCriando(true)}>
      <Plus aria-hidden />Nova trilha
    </button>
  ) : null

  return (
    <PageContainer>
      <PageHeader
        title="Aulas da equipe"
        count={isLoading ? undefined : visiveis.length}
        description={
          isLoading || !visiveis.length
            ? 'Trilhas de estudo para a equipe, organizadas em módulos e aulas.'
            : <><b>{plural(visiveis.length, 'trilha', 'trilhas')}</b> · <b>{plural(totalAulas, 'aula', 'aulas')}</b> · você concluiu <b>{totalFeitas}</b></>
        }
        action={botaoNova}
      />

      {isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true">
          <span className="sr-only">Carregando trilhas…</span>
          {[0, 1, 2].map((i) => <div key={i} className="h-48 animate-pulse rounded-[14px] bg-muted" />)}
        </div>
      )}

      {isError && (
        <EmptyState
          title="Não deu para carregar as trilhas"
          description="Confira a conexão e tente de novo."
          action={<button type="button" className="btn btn-secondary" onClick={() => refetch()}>Tentar de novo</button>}
        />
      )}

      {!isLoading && !isError && !visiveis.length && (
        <EmptyState
          icon={GraduationCap}
          title="Nenhuma trilha da equipe ainda"
          description={admin
            ? 'Crie a primeira trilha e organize as aulas em módulos.'
            : 'Quando a administração publicar uma trilha, ela aparece aqui.'}
          action={botaoNova}
        />
      )}

      {!isLoading && !isError && visiveis.length > 0 && (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {resumos.map(({ trilha, resumo }) => (
            <li key={trilha.id}>
              <Link
                to={`/aulas/${trilha.id}`}
                className="group flex h-full flex-col gap-3 rounded-[14px] border border-border bg-card p-5 transition-colors duration-fast hover:border-primary-muted hover:bg-primary-light/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <MarcaTrilha titulo={trilha.titulo} />
                  {trilha.ativo === false && <span className="tag tag-warning">Desligada</span>}
                </div>
                <div className="min-w-0">
                  <h2 className="t-h4 m-0 break-words text-foreground group-hover:underline">{trilha.titulo}</h2>
                  {trilha.descricao && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{trilha.descricao}</p>}
                </div>
                <p className="m-0 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5"><Layers className="h-3.5 w-3.5" aria-hidden />{plural(resumo.modulos, 'módulo', 'módulos')}</span>
                  <span className="inline-flex items-center gap-1.5"><BookOpen className="h-3.5 w-3.5" aria-hidden />{plural(resumo.aulas, 'aula', 'aulas')}</span>
                  {resumo.minutos > 0 && (
                    <span className="inline-flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" aria-hidden />{duracaoLegivel(resumo.minutos)}</span>
                  )}
                </p>
                <div className="mt-auto flex items-center gap-3 pt-1">
                  {resumo.aulas ? (
                    <>
                      <BarraProgresso percentual={resumo.percentual} rotulo={`Seu progresso em ${trilha.titulo}`} />
                      <small className="mono shrink-0 text-[12px] text-fg-2">{resumo.concluidas} de {resumo.aulas}</small>
                    </>
                  ) : (
                    <small className="flex-1 text-[12.5px] text-muted-foreground">Sem aulas ainda</small>
                  )}
                  <ArrowRight className="h-4 w-4 shrink-0 text-fg-4" aria-hidden />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {admin && (
        <NovaTrilhaModal
          open={criando}
          onClose={() => setCriando(false)}
          ordem={proximaOrdem(trilhas)}
          onCriada={(id) => navigate(`/aulas/${id}`)}
        />
      )}
    </PageContainer>
  )
}

export default AulasEquipePage
