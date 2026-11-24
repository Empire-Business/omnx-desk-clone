import { useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import {
  ArrowRight, BookOpen, Check, CheckCircle2, Circle, ExternalLink, FileText, Link2, Play, Plus,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useMarkLessonComplete, useMyProgress, useTrilha, type LearningLesson, type LearningModuleWithLessons } from '@/hooks/useTrilhas'
import { PageContainer } from '@/components/ui/PageContainer'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { BarraProgresso } from '@/components/aulas/PartesAulas'
import { NovaAulaModal, NovoModuloModal } from '@/components/aulas/FormulariosAulas'
import { mensagemErro } from '@/lib/mensagemErro'
import { cn } from '@/lib/utils'
import {
  aulaSeguinte, duracaoLegivel, idsConcluidos, plural, podeMontarTrilhas, proximaAula, proximaOrdem,
  resumoTrilha, ROTULO_TIPO_AULA, trilhaOrdenada, urlSegura, videoIncorporado,
} from '@/lib/aulasEquipe'

const ICONE_TIPO = { video: Play, texto: FileText, pdf: BookOpen, link: Link2 } as const

/**
 * Uma trilha da equipe (/aulas/:id): módulos com as aulas, a aula aberta
 * (`?aula=`) e o progresso de quem está vendo. Para o admin, os botões de
 * montar (novo módulo, nova aula).
 */
export function AulaTrilhaPage() {
  const { id = '' } = useParams<{ id: string }>()
  const [params, setParams] = useSearchParams()
  const { user } = useAuth()
  const admin = podeMontarTrilhas(user?.perfil)
  const { data, isLoading, isError } = useTrilha(id)
  const { data: progresso } = useMyProgress()
  const [novoModulo, setNovoModulo] = useState(false)
  const [moduloDaNovaAula, setModuloDaNovaAula] = useState<LearningModuleWithLessons | null>(null)

  const concluidas = useMemo(() => idsConcluidos(progresso), [progresso])
  // Esta tela é só das trilhas internas; uma trilha de cliente fica no portal.
  const trilha = useMemo(() => (data && data.tipo === 'interno' ? trilhaOrdenada(data) : null), [data])

  if (isLoading) {
    return (
      <PageContainer>
        <div className="grid gap-4" aria-busy="true">
          <span className="sr-only">Carregando trilha…</span>
          <div className="h-10 w-1/2 animate-pulse rounded-md bg-muted" />
          <div className="h-64 animate-pulse rounded-[14px] bg-muted" />
        </div>
      </PageContainer>
    )
  }

  if (isError || !trilha || (!admin && trilha.ativo === false)) {
    return (
      <PageContainer>
        <PageHeader title="Trilha não encontrada" backTo="/aulas" />
        <EmptyState
          title="Essa trilha não está disponível"
          description="Ela pode ter sido desligada, ou o endereço está errado."
          action={<Link to="/aulas" className="btn btn-secondary">Ver as trilhas</Link>}
        />
      </PageContainer>
    )
  }

  const resumo = resumoTrilha(trilha, concluidas)
  const aulas = trilha.learning_modules.flatMap((m) => m.learning_lessons)
  const aberta = aulas.find((a) => a.id === params.get('aula')) ?? null
  const continuar = proximaAula(trilha, concluidas)
  const abrir = (aulaId: string) => {
    const proximo = new URLSearchParams(params)
    proximo.set('aula', aulaId)
    setParams(proximo)
  }

  return (
    <PageContainer>
      <PageHeader
        title={trilha.titulo}
        backTo="/aulas"
        description={
          <>
            {plural(resumo.aulas, 'aula', 'aulas')}
            {resumo.minutos > 0 && <> · {duracaoLegivel(resumo.minutos)}</>}
            {' · '}{plural(resumo.concluidas, 'concluída', 'concluídas')}
            {trilha.ativo === false && <> · <span className="tag tag-warning">Desligada</span></>}
          </>
        }
        action={
          <div className="flex flex-wrap gap-2">
            {admin && (
              <button type="button" className="btn btn-secondary" onClick={() => setNovoModulo(true)}>
                <Plus aria-hidden />Novo módulo
              </button>
            )}
            {continuar && continuar.id !== aberta?.id && (
              <button type="button" className="btn btn-primary" onClick={() => abrir(continuar.id)}>
                <Play aria-hidden />{resumo.concluidas ? (resumo.concluidas === resumo.aulas ? 'Rever do início' : 'Continuar') : 'Começar'}
              </button>
            )}
          </div>
        }
      />

      {trilha.descricao && <p className="-mt-2 mb-5 max-w-[72ch] text-[14px] text-fg-2">{trilha.descricao}</p>}

      <div className={cn('grid gap-5', aberta && 'lg:grid-cols-[minmax(0,1fr)_340px]')}>
        {aberta && (
          <AulaAberta
            key={aberta.id}
            aula={aberta}
            concluida={concluidas.has(aberta.id)}
            seguinte={aulaSeguinte(trilha, aberta.id)}
            onAbrir={abrir}
          />
        )}

        <section className="cume-panel" aria-labelledby="conteudo-trilha">
          <div className="cume-panel-head">
            <h2 id="conteudo-trilha" className="t-h4 m-0">Conteúdo da trilha</h2>
            {resumo.aulas > 0 && <small className="mono text-[12px] text-fg-2">{resumo.concluidas} de {resumo.aulas}</small>}
          </div>
          {resumo.aulas > 0 && <BarraProgresso percentual={resumo.percentual} rotulo="Seu progresso nesta trilha" className="mb-4" />}

          {!trilha.learning_modules.length ? (
            <EmptyState
              compact
              bare
              icon={BookOpen}
              title="Nenhum módulo ainda"
              description={admin ? 'Comece pelo primeiro módulo; as aulas entram dentro dele.' : 'As aulas desta trilha ainda estão sendo preparadas.'}
              action={admin ? <button type="button" className="btn btn-secondary btn-sm" onClick={() => setNovoModulo(true)}><Plus aria-hidden />Novo módulo</button> : undefined}
            />
          ) : (
            <ol className="grid gap-4">
              {trilha.learning_modules.map((modulo, i) => (
                <li key={modulo.id}>
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <h3 className="m-0 text-[13px] font-semibold text-foreground">
                      <span className="mono mr-1.5 text-fg-3">{String(i + 1).padStart(2, '0')}</span>{modulo.titulo}
                    </h3>
                    {admin && (
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setModuloDaNovaAula(modulo)}>
                        <Plus aria-hidden />Nova aula
                      </button>
                    )}
                  </div>
                  {modulo.learning_lessons.length ? (
                    <ul className="grid gap-0.5">
                      {modulo.learning_lessons.map((aula) => (
                        <LinhaAula
                          key={aula.id}
                          aula={aula}
                          concluida={concluidas.has(aula.id)}
                          ativa={aula.id === aberta?.id}
                          onAbrir={() => abrir(aula.id)}
                        />
                      ))}
                    </ul>
                  ) : (
                    <p className="m-0 px-2 py-1.5 text-[12.5px] text-muted-foreground">Sem aulas neste módulo.</p>
                  )}
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      {admin && (
        <>
          <NovoModuloModal
            open={novoModulo}
            onClose={() => setNovoModulo(false)}
            pathId={trilha.id}
            ordem={proximaOrdem(trilha.learning_modules)}
          />
          {moduloDaNovaAula && (
            <NovaAulaModal
              open
              onClose={() => setModuloDaNovaAula(null)}
              moduleId={moduloDaNovaAula.id}
              moduloTitulo={moduloDaNovaAula.titulo}
              ordem={proximaOrdem(moduloDaNovaAula.learning_lessons)}
            />
          )}
        </>
      )}
    </PageContainer>
  )
}

function LinhaAula({ aula, concluida, ativa, onAbrir }: {
  aula: LearningLesson
  concluida: boolean
  ativa: boolean
  onAbrir: () => void
}) {
  const Icone = ICONE_TIPO[aula.tipo]
  return (
    <li>
      <button
        type="button"
        onClick={onAbrir}
        aria-current={ativa ? 'true' : undefined}
        className={cn(
          'flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors duration-fast hover:bg-bg-2',
          ativa && 'bg-primary-light hover:bg-primary-light',
        )}
      >
        {concluida
          ? <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-label="Concluída" />
          : <Circle className="h-4 w-4 shrink-0 text-fg-4" aria-label="Não concluída" />}
        <span className="min-w-0 flex-1 truncate text-foreground">{aula.titulo}</span>
        <Icone className="h-3.5 w-3.5 shrink-0 text-fg-3" aria-hidden />
        {aula.duracao_minutos ? <small className="mono shrink-0 text-[11.5px] text-fg-3">{duracaoLegivel(aula.duracao_minutos)}</small> : null}
      </button>
    </li>
  )
}

function AulaAberta({ aula, concluida, seguinte, onAbrir }: {
  aula: LearningLesson
  concluida: boolean
  seguinte: LearningLesson | null
  onAbrir: (id: string) => void
}) {
  const marcar = useMarkLessonComplete()
  const feita = concluida || marcar.isSuccess

  return (
    <article className="cume-panel min-w-0" aria-labelledby="aula-aberta-titulo">
      <div className="cume-panel-head">
        <div className="min-w-0">
          <span className="tag tag-info">{ROTULO_TIPO_AULA[aula.tipo]}</span>
          <h2 id="aula-aberta-titulo" className="t-h3 mb-0 mt-1.5 break-words">{aula.titulo}</h2>
        </div>
      </div>
      {aula.descricao && <p className="mb-4 mt-0 text-[14px] text-fg-2">{aula.descricao}</p>}

      <ConteudoAula aula={aula} />

      <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-border pt-4">
        {feita ? (
          <span className="tag tag-success"><Check className="h-3.5 w-3.5" aria-hidden />Aula concluída</span>
        ) : (
          <button type="button" className="btn btn-primary" disabled={marcar.isPending} onClick={() => marcar.mutate(aula.id)}>
            <Check aria-hidden />{marcar.isPending ? 'Salvando…' : 'Marcar como concluída'}
          </button>
        )}
        {seguinte && (
          <button type="button" className="btn btn-secondary ml-auto" onClick={() => onAbrir(seguinte.id)}>
            Próxima: {seguinte.titulo}<ArrowRight aria-hidden />
          </button>
        )}
        {marcar.isError && (
          <p role="alert" className="err basis-full">Não deu para marcar. {mensagemErro(marcar.error)}</p>
        )}
      </div>
    </article>
  )
}

function ConteudoAula({ aula }: { aula: LearningLesson }) {
  if (aula.tipo === 'texto') {
    return aula.conteudo_texto
      ? <div className="whitespace-pre-wrap break-words text-[14.5px] leading-relaxed text-foreground">{aula.conteudo_texto}</div>
      : <SemConteudo />
  }

  const url = urlSegura(aula.conteudo_url)
  if (!url) return <SemConteudo />

  if (aula.tipo === 'video') {
    const embed = videoIncorporado(url)
    return (
      <div className="aspect-video w-full overflow-hidden rounded-[10px] bg-black">
        {embed ? (
          <iframe
            src={embed}
            title={aula.titulo}
            className="h-full w-full"
            allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        ) : (
          <video src={url} controls className="h-full w-full" />
        )}
      </div>
    )
  }

  if (aula.tipo === 'pdf') {
    return (
      <div className="grid gap-2">
        <iframe src={url} title={aula.titulo} className="h-[70vh] w-full rounded-[10px] border border-border bg-bg-2" />
        <a href={url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm justify-self-start">
          <ExternalLink aria-hidden />Abrir o PDF em outra aba
        </a>
      </div>
    )
  }

  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="btn btn-secondary">
      <ExternalLink aria-hidden />Abrir o conteúdo
    </a>
  )
}

function SemConteudo() {
  return <p className="m-0 text-[13px] text-muted-foreground">Esta aula ainda não tem conteúdo.</p>
}

export default AulaTrilhaPage
