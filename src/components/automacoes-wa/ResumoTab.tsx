import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { usePainelWa, useSalvarWaAutoConfig, mensagemErroWa, type WaAutoConfig } from '@/hooks/useAutomacoesWa'
import {
  DIAS_CURTOS, DIAS_SEMANA, EXEMPLO_RESUMO_SEMANAL, formataQuando, precisaConfirmarResumo, prefixoDia,
  proximoEnvioSemanal, type EstadoResumo,
} from '@/lib/automacoesWa'
import { cn } from '@/lib/utils'
import {
  Aviso, CampoHora, CartoesEscolha, Dica, EsqueletoAba, IndicadorSalvo, Interruptor, LinhaFalta, MensagemErro, Secao,
} from './comum'
import { botaoSecundario, campo, hhmm } from './estilos'

/** Resumo semanal: vai para o CLIENTE (privado ou grupo), sem revisão antes. */
export function ResumoTab() {
  const painel = usePainelWa()
  const salvar = useSalvarWaAutoConfig()
  const salvarDestino = useSalvarWaAutoConfig()
  const [erro, setErro] = useState<string | null>(null)
  const [exemplo, setExemplo] = useState(false)
  // Mudança que faz o resumo sair para os clientes: espera o "sim" da pessoa.
  const [pendente, setPendente] = useState<Partial<WaAutoConfig> | null>(null)

  if (painel.carregando) return <EsqueletoAba />

  const cfg = painel.config
  const oficial = cfg?.provider === 'zernio'
  const atual: EstadoResumo = { ativo: cfg?.resumo_ativo ?? false, destino: cfg?.resumo_destino ?? 'grupo' }
  const dia = cfg?.resumo_dia ?? 1
  const pendencias = painel.pendencias.filter((p) => p.automacao === 'resumo')
  const grupoNaOficial = oficial && atual.destino === 'grupo'

  const gravar = (campos: Partial<WaAutoConfig>, qual: typeof salvar = salvar) => {
    setErro(null)
    qual.mutate(campos, { onError: (e) => setErro(mensagemErroWa(e, 'Não foi possível salvar.')) })
  }
  const pedir = (campos: Partial<WaAutoConfig>, qual: typeof salvar = salvar) => {
    const novo: EstadoResumo = {
      ativo: campos.resumo_ativo ?? atual.ativo,
      destino: campos.resumo_destino ?? atual.destino,
    }
    if (precisaConfirmarResumo(atual, novo)) setPendente(campos)
    else gravar(campos, qual)
  }

  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-lg border border-border bg-card p-4" aria-label="Envio do resumo semanal">
        <div className="flex flex-wrap items-center gap-3">
          <Interruptor ligado={atual.ativo} rotulo="Enviar o resumo semanal aos clientes"
            disabled={salvar.isPending || (!atual.ativo && pendencias.length > 0)}
            onChange={(v) => pedir({ resumo_ativo: v })} />
          <label htmlFor="dia-resumo" className="text-sm font-medium text-foreground">Enviar {prefixoDia(dia)}</label>
          <select id="dia-resumo" className={cn(campo, 'py-1.5')} value={dia} onChange={(e) => gravar({ resumo_dia: Number(e.target.value) })}>
            {DIAS_SEMANA.map((d) => <option key={d.valor} value={d.valor}>{DIAS_CURTOS[d.valor]}</option>)}
          </select>
          <span className="text-sm font-medium text-foreground">às</span>
          <CampoHora rotulo="Horário do resumo semanal" valor={hhmm(cfg?.resumo_hora)} onSalvar={(v) => gravar({ resumo_hora: v })} />
          <IndicadorSalvo status={salvar.status} quando={salvar.submittedAt} />
        </div>
        {pendencias.length > 0 ? (
          <LinhaFalta pendencias={pendencias} abaAtual="resumo" />
        ) : atual.ativo ? (
          <p className="text-sm text-foreground">
            Próximo envio: <strong className="font-medium">{formataQuando(proximoEnvioSemanal(dia, cfg?.resumo_hora))}</strong>
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">Desligado. Ligue a chave para começar a enviar.</p>
        )}
        <Dica>Sai sem revisão. Não inclui alertas nem avaliação do cliente — isso fica só no relatório do gestor.</Dica>
        <MensagemErro texto={erro} />
      </section>

      <Secao titulo="Para onde vai" acao={<IndicadorSalvo status={salvarDestino.status} quando={salvarDestino.submittedAt} />}>
        <CartoesEscolha<'privado' | 'grupo'>
          nome="destino-resumo"
          legenda="Para onde vai o resumo semanal"
          valor={atual.destino}
          onChange={(d) => pedir({ resumo_destino: d }, salvarDestino)}
          opcoes={[
            { valor: 'privado', titulo: 'No privado de cada cliente', descricao: 'Feito só com a conversa direta com o cliente.' },
            {
              valor: 'grupo', titulo: 'No grupo do cliente', descricao: 'Feito só com as mensagens do grupo. Todos do grupo leem.',
              desabilitado: oficial && atual.destino !== 'grupo', motivo: 'Indisponível no WhatsApp Oficial',
            },
          ]}
        />
        {grupoNaOficial && (
          <Aviso tom="erro" acao={
            <button type="button" className={botaoSecundario} disabled={salvarDestino.isPending}
              onClick={() => pedir({ resumo_destino: 'privado' }, salvarDestino)}>
              Mudar para privado
            </button>
          }>
            O WhatsApp Oficial não envia no grupo: do jeito que está, o resumo não sai.
          </Aviso>
        )}
      </Secao>

      <Secao titulo="Exemplo da mensagem">
        <button type="button" className={botaoSecundario} aria-expanded={exemplo} onClick={() => setExemplo((v) => !v)}>
          {exemplo ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          {exemplo ? 'Esconder exemplo' : 'Ver exemplo da mensagem'}
        </button>
        {exemplo && (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Com dados de exemplo. O texto de cada semana é escrito a partir das conversas.</p>
            <div className="max-w-md whitespace-pre-wrap break-words rounded-lg rounded-tl-sm bg-success-light px-4 py-3 text-sm text-foreground">
              {EXEMPLO_RESUMO_SEMANAL}
            </div>
          </div>
        )}
      </Secao>

      <ConfirmDialog
        open={pendente !== null}
        onClose={() => setPendente(null)}
        title="Mandar o resumo semanal aos clientes?"
        description={`A partir de agora, toda semana o resumo sai sozinho para todos os clientes, ${
          (pendente?.resumo_destino ?? atual.destino) === 'grupo' ? 'no grupo de cada um' : 'no privado de cada um'
        }, sem revisão antes. Deseja continuar?`}
        confirmLabel="Sim, mandar aos clientes"
        loading={salvar.isPending || salvarDestino.isPending}
        onConfirm={() => {
          if (pendente) gravar(pendente, pendente.resumo_destino ? salvarDestino : salvar)
          setPendente(null)
        }}
      />
    </div>
  )
}
