import { useState } from 'react'
import { Check } from 'lucide-react'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useSegmentoAtendimento, useDefinirSegmento } from '@/hooks/useAtendimento'
import { LISTA_SEGMENTOS } from '@/lib/atendimentoSegmentos'
import { cn } from '@/lib/utils'

/**
 * Ramo da empresa — qual é o negócio desta conta.
 *
 * Mora em **Configurações**, não dentro do app de Atendimento: é um dado da
 * empresa (como marca e logo), não uma preferência de um app. Ele decide como
 * as coisas se chamam no sistema inteiro, então escondê-lo dentro de um app
 * fazia parecer ajuste local do Atendimento — e quem procurava "onde mudo o
 * ramo?" ia primeiro em Configurações, como manda a intuição.
 *
 * Trocar o ramo é **aditivo**: as etapas e os tipos do ramo novo entram junto
 * dos que já existem. Nada de trabalho registrado é apagado — por isso a
 * confirmação diz exatamente isso, em vez de um "tem certeza?" genérico.
 */
export function RamoEmpresaSection() {
  const { segmento } = useSegmentoAtendimento()
  const definir = useDefinirSegmento()
  const [pendente, setPendente] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const alvo = LISTA_SEGMENTOS.find((s) => s.chave === pendente)

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Define como as coisas se chamam, quais abas aparecem e quais indicadores o painel
        mostra. Trocar o ramo <strong className="font-medium">acrescenta</strong> as etapas e
        os tipos do ramo novo — nada do que já existe é apagado.
      </p>

      <ul className="grid gap-3 sm:grid-cols-3">
        {LISTA_SEGMENTOS.map((s) => {
          const atual = s.chave === segmento.chave
          return (
            <li key={s.chave}>
              <button
                type="button"
                onClick={() => !atual && setPendente(s.chave)}
                disabled={atual || definir.isPending}
                className={cn(
                  'h-full w-full rounded-lg border p-3 text-left transition-colors',
                  atual
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/40 hover:bg-muted/40',
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="font-medium text-foreground">{s.nome}</span>
                  {atual && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                      <Check className="h-3 w-3" /> Em uso
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{s.descricao}</p>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Chama de <strong className="font-medium">{s.rotuloItens}</strong> · abas:{' '}
                  {s.abas.filter((a) => a !== 'config').join(', ')}
                </p>
              </button>
            </li>
          )
        })}
      </ul>

      {erro && (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{erro}</p>
      )}

      <ConfirmDialog
        open={pendente !== null}
        onClose={() => setPendente(null)}
        onConfirm={() => {
          if (!pendente) return
          setErro(null)
          definir.mutate(pendente, {
            onError: (e) =>
              setErro(e instanceof Error ? e.message : 'Não foi possível trocar o ramo.'),
          })
          setPendente(null)
        }}
        title={`Mudar para ${alvo?.nome ?? ''}?`}
        description={
          alvo
            ? `As telas passam a falar em "${alvo.rotuloItens}" e o painel mostra os indicadores desse ramo. As etapas e tipos de ${alvo.nome} são acrescentados aos que já existem — nenhum trabalho registrado se perde.`
            : ''
        }
        confirmLabel="Mudar o ramo"
      />
    </div>
  )
}
