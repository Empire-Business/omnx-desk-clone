import { Link } from 'react-router-dom'
import { ArrowRight, Bot, CalendarClock, CheckCircle2, Circle, FileText, MessagesSquare } from 'lucide-react'
import { useGruposAgente, useMembrosAgente, usePainelWa, useUltimoEnvio, type WaAutoEnvio } from '@/hooks/useAutomacoesWa'
import {
  DIAS_CURTOS, contarDestinosAtivos, estadoAssistente, estadoAutomacao, formataQuando, modeloPronto, prefixoDia, primeirosPassos,
  proximoEnvioDiario, proximoEnvioSemanal, type AbaWa, type Automacao, type Pendencia,
} from '@/lib/automacoesWa'
import { cn } from '@/lib/utils'
import {
  EsqueletoAba, SeloEstado,
} from './comum'
import { ROTA_ABA, botaoLink, botaoSecundario, hhmm } from './estilos'

/** Aba "Início": o que falta configurar e como está cada automação. */
export function InicioTab() {
  const painel = usePainelWa()
  const teste = useUltimoEnvio('teste', 'enviado')
  const cfg = painel.config

  if (painel.carregando) return <EsqueletoAba />

  const provider = cfg?.provider ?? 'uazapi'
  const oficial = provider === 'zernio'
  // "Quem recebe" = pessoas no privado e/ou grupos internos.
  const destinos = contarDestinosAtivos(painel.gestores, cfg)
  const passos = primeirosPassos({
    provider,
    conectado: oficial ? painel.conexao.zernioConectado : Boolean(cfg?.uazapi_instance_id),
    textosAprovados: modeloPronto(painel.modelos, 'relatorio', cfg?.template_relatorio)
      && (!cfg?.resumo_ativo || modeloPronto(painel.modelos, 'resumo', cfg?.template_resumo)),
    testeEnviado: Boolean(teste.data),
    gestoresAtivos: destinos.pessoas,
    gruposAtivos: destinos.grupos,
    relatorioAtivo: cfg?.relatorio_ativo ?? false,
  })
  const feitos = passos.filter((p) => p.feito).length
  const completo = feitos === passos.length
  const proximo = passos.find((p) => !p.feito)
  const de = (a: Automacao) => painel.pendencias.filter((p) => p.automacao === a)
  const agora = new Date()

  return (
    <div className="space-y-4">
      {completo ? (
        <p className="flex items-center gap-2 rounded-lg border border-success/30 bg-emerald-500/5 px-4 py-3 text-sm font-medium text-success">
          <CheckCircle2 className="h-4 w-4" aria-hidden /> Tudo configurado
        </p>
      ) : (
        <section aria-labelledby="primeiros-passos" className="space-y-3 rounded-lg border border-border bg-card p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="primeiros-passos" className="font-display text-base font-semibold text-foreground">Primeiros passos</h2>
            <span className="text-xs text-muted-foreground">{feitos} de {passos.length} concluídos</span>
          </div>
          <ol className="space-y-1">
            {passos.map((p, i) => (
              <li key={p.chave} className={cn('flex items-center gap-3 rounded-lg px-2 py-2', p === proximo && 'bg-muted/50')}>
                {p.feito
                  ? <CheckCircle2 className="h-5 w-5 shrink-0 text-success" aria-hidden />
                  : <Circle className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />}
                <span className={cn('min-w-0 flex-1 text-sm', p.feito ? 'text-muted-foreground line-through decoration-muted-foreground/40' : 'text-foreground')}>
                  {i + 1}. {p.titulo}
                  <span className="sr-only">{p.feito ? ' (feito)' : ' (pendente)'}</span>
                </span>
                {!p.feito && (
                  <Link to={ROTA_ABA(p.aba)} className={cn(p === proximo ? botaoSecundario : botaoLink, p === proximo && 'py-1.5')}>
                    {p === proximo ? 'Fazer agora' : 'Ir'} <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                  </Link>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}

      <div className="grid gap-3 md:grid-cols-3">
        <CartaoAutomacao
          Icone={FileText}
          titulo="Relatório diário"
          paraQuem={destinos.grupos > 0 ? 'Para os gestores, no privado ou no grupo interno' : 'Para os gestores, no privado'}
          ativo={cfg?.relatorio_ativo ?? false}
          pendencias={de('relatorio')}
          quando={`Todo dia às ${hhmm(cfg?.relatorio_hora)}`}
          proximo={formataQuando(proximoEnvioDiario(cfg?.relatorio_hora, agora), agora)}
          tipoEnvio="relatorio_diario"
          aba="relatorio"
          extra={(
            <Link to={ROTA_ABA('alertas')} className={botaoLink}>
              Ver pontos de atenção de hoje <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          )}
        />
        <CartaoAutomacao
          Icone={MessagesSquare}
          titulo="Resumo semanal"
          paraQuem={`Para os clientes, ${cfg?.resumo_destino === 'grupo' ? 'no grupo' : 'no privado'}`}
          ativo={cfg?.resumo_ativo ?? false}
          pendencias={de('resumo')}
          quando={`${prefixoDia(cfg?.resumo_dia ?? 1) === 'toda' ? 'Toda' : 'Todo'} ${DIAS_CURTOS[cfg?.resumo_dia ?? 1]} às ${hhmm(cfg?.resumo_hora)}`}
          proximo={formataQuando(proximoEnvioSemanal(cfg?.resumo_dia ?? 1, cfg?.resumo_hora, agora), agora)}
          tipoEnvio="resumo_semanal"
          aba="resumo"
        />
        <CartaoAutomacao
          Icone={CalendarClock}
          titulo="Link da reunião"
          paraQuem="Para o grupo do cliente, quando você mandar"
          ativo={cfg?.agendamento_ativo ?? false}
          pendencias={de('link')}
          quando="Só quando você clicar em enviar"
          proximo={null}
          tipoEnvio="agendamento_link"
          aba="reunioes"
        />
      </div>

      <PassoAssistente />
    </div>
  )
}

/** Passo OPCIONAL: o assistente da equipe (não conta nos "Primeiros passos"). */
function PassoAssistente() {
  const painel = usePainelWa()
  const membros = useMembrosAgente()
  const grupos = useGruposAgente()
  const cfg = painel.config
  const estado = estadoAssistente({
    ativo: cfg?.agente_ativo === true,
    privado: cfg?.agente_privado !== false,
    grupos: cfg?.agente_grupos === true,
    membrosAtivos: (membros.data ?? []).filter((m) => m.ativo).length,
    gruposAtivos: (grupos.data ?? []).filter((g) => g.ativo).length,
  })
  return (
    <section aria-label="Íris, assistente da equipe (opcional)" className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-border bg-card p-4">
      <Bot className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-semibold text-foreground">
          Íris <span className="font-normal text-muted-foreground">· assistente da equipe</span>
        </h3>
        <p className={cn('text-xs', estado.tipo === 'falta' ? 'text-danger' : 'text-muted-foreground')}>
          {estado.tipo === 'desligado' && 'A equipe pergunta no WhatsApp sobre os clientes da carteira e ele responde.'}
          {estado.tipo === 'ligado' && `${estado.resumo}.`}
          {estado.tipo === 'falta' && `Ligado, mas falta ${estado.motivo}.`}
        </p>
      </div>
      <Link to="/ia" className={botaoLink}>
        {estado.tipo === 'desligado' ? 'Conhecer' : 'Ajustar'} <ArrowRight className="h-3.5 w-3.5" aria-hidden />
      </Link>
    </section>
  )
}

function CartaoAutomacao({
  Icone, titulo, paraQuem, ativo, pendencias, quando, proximo, tipoEnvio, aba, extra,
}: {
  Icone: typeof FileText
  titulo: string
  paraQuem: string
  ativo: boolean
  pendencias: Pendencia[]
  quando: string
  /** null = não tem horário fixo. */
  proximo: string | null
  tipoEnvio: WaAutoEnvio['tipo']
  aba: AbaWa
  /** Link a mais no pé do cartão. */
  extra?: React.ReactNode
}) {
  const ultimo = useUltimoEnvio(tipoEnvio)
  const estado = estadoAutomacao(ativo, pendencias)
  const vaiSair = estado.tipo === 'ligado'
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4" aria-label={titulo}>
      <div className="flex items-start gap-2">
        <Icone className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-foreground">{titulo}</h3>
          <p className="text-xs text-muted-foreground">{paraQuem}</p>
        </div>
      </div>
      <div>
        <SeloEstado estado={estado} />
        {(estado.tipo === 'ligado_sem_envio' || estado.tipo === 'falta_configurar') && (
          <p className={cn('mt-1 text-xs', estado.tipo === 'ligado_sem_envio' ? 'text-danger' : 'text-muted-foreground')}>
            Falta {estado.motivo}.
          </p>
        )}
      </div>
      <dl className="space-y-1 text-xs">
        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">Quando</dt>
          <dd className="text-right text-foreground">{quando}</dd>
        </div>
        {proximo && vaiSair && (
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Próximo envio</dt>
            <dd className="text-right font-medium text-foreground">{proximo}</dd>
          </div>
        )}
        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">Último envio</dt>
          <dd className={cn('text-right', ultimo.data?.status === 'falhou' ? 'text-danger' : 'text-foreground')}>
            {ultimo.isLoading ? '…' : ultimo.data
              ? `${formataQuando(new Date(ultimo.data.created_at))}${ultimo.data.status === 'falhou' ? ' (falhou)' : ''}`
              : 'Nenhum ainda'}
          </dd>
        </div>
      </dl>
      <div className="mt-auto flex flex-col items-start gap-1.5">
        {extra}
        <Link to={ROTA_ABA(aba)} className={botaoLink}>
          {estado.tipo === 'ligado' || estado.tipo === 'desligado' ? 'Ajustar' : 'Resolver'} <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>
    </section>
  )
}
