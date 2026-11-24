import { Navigate, useParams } from 'react-router-dom'
import { Check } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { PageContainer } from '@/components/ui/PageContainer'
import { AbasRolaveis } from '@/components/ui/AbasRolaveis'
import { useAuth } from '@/contexts/AuthContext'
import { usePermissoes } from '@/hooks/usePermissoes'
import { usePainelWa } from '@/hooks/useAutomacoesWa'
import { InicioTab } from '@/components/automacoes-wa/InicioTab'
import { ConexaoTab } from '@/components/automacoes-wa/ConexaoTab'
import { RelatorioTab } from '@/components/automacoes-wa/RelatorioTab'
import { AlertasTab } from '@/components/automacoes-wa/AlertasTab'
import { AssistenteTab } from '@/components/automacoes-wa/AssistenteTab'
import { ResumoTab } from '@/components/automacoes-wa/ResumoTab'
import { ReunioesTab } from '@/components/automacoes-wa/ReunioesTab'
import { HistoricoTab } from '@/components/automacoes-wa/HistoricoTab'
import { TempoRespostaTab } from '@/components/automacoes-wa/TempoRespostaTab'
import {
  EsqueletoAba,
} from '@/components/automacoes-wa/comum'
import type { AbaWa, Automacao } from '@/lib/automacoesWa'
import { ABAS_IRIS, abaIrisDoSegmento, ROTAS } from '@/config/navegacao'

/**
 * Conteúdo de cada aba (chave interna AbaWa). Ordem, rótulo e endereço vêm de
 * `config/navegacao.ts` (ABAS_IRIS). soGestao: só admin e gerente veem a aba
 * (e o banco confere de novo).
 *
 * "Vínculos" saiu daqui: virou "Grupos e clientes" em /clientes/grupos
 * (GruposClientesPage). A faixa de abas ainda mostra um atalho para lá.
 */
const CONTEUDO: Partial<Record<AbaWa, { Comp: () => React.ReactElement; soGestao?: boolean }>> = {
  inicio: { Comp: InicioTab },
  conexao: { Comp: ConexaoTab },
  relatorio: { Comp: RelatorioTab },
  alertas: { Comp: AlertasTab },
  'tempo-resposta': { Comp: TempoRespostaTab, soGestao: true },
  assistente: { Comp: AssistenteTab },
  resumo: { Comp: ResumoTab },
  reunioes: { Comp: ReunioesTab },
  historico: { Comp: HistoricoTab },
}

const ehGestao = (perfil: string | null | undefined) => perfil === 'admin' || perfil === 'gerente'

/** Abas visíveis na faixa, na ordem da navegação. */
const abasVisiveis = (gestao: boolean) =>
  ABAS_IRIS.filter((a) => {
    if (a.aba === 'vinculos') return gestao
    const c = CONTEUDO[a.aba]
    return c && (!c.soGestao || gestao)
  })

/**
 * Íris (antes "Automações WhatsApp"), em /ia e /ia/<aba>. Só quem administra
 * o app entra. Endereços antigos /automacoes-wa/* são traduzidos em
 * `config/rotasAntigas.ts` antes de chegar aqui.
 */
export function AutomacoesWaConfigPage() {
  const { can, carregando } = usePermissoes()
  const { user } = useAuth()
  const { aba: segmento } = useParams()
  const gestao = ehGestao(user?.perfil)

  if (!carregando && !can('automacoes-wa', 'admin')) return <Navigate to="/" replace />
  const chave = abaIrisDoSegmento(segmento)
  const conteudo = chave ? CONTEUDO[chave] : undefined
  // Aba desconhecida ou sem permissão: o comportamento de sempre era abrir os primeiros passos.
  if (!conteudo || (conteudo.soGestao && !gestao)) return <Navigate to="/ia/comecar" replace />
  const atual = conteudo

  return (
    <PageContainer>
      <PageHeader
        title="Íris"
        description="A assistente de IA do WhatsApp: aviso diário para gestores, resumo semanal para clientes, pontos de atenção e tempo de resposta."
      />
      {carregando ? (
        <>
          <Abas configuradas={null} gestao={gestao} />
          <EsqueletoAba />
        </>
      ) : (
        <ConteudoAdmin Comp={atual.Comp} gestao={gestao} />
      )}
    </PageContainer>
  )
}

function ConteudoAdmin({ Comp, gestao }: { Comp: () => React.ReactElement; gestao: boolean }) {
  const painel = usePainelWa()
  const cfg = painel.config
  const ok = (a: Automacao) => !painel.pendencias.some((p) => p.automacao === a)
  const configuradas = new Set<AbaWa>()
  if (cfg) {
    const conectado = cfg.provider === 'zernio' ? painel.conexao.zernioConectado : Boolean(cfg.uazapi_instance_id)
    if (conectado) configuradas.add('conexao')
    if (cfg.relatorio_ativo && ok('relatorio')) configuradas.add('relatorio')
    if (cfg.resumo_ativo && ok('resumo')) configuradas.add('resumo')
    if (cfg.agendamento_ativo && ok('link')) configuradas.add('reunioes')
    if (cfg.agente_ativo) configuradas.add('assistente')
  }
  return (
    <>
      <Abas configuradas={painel.carregando ? null : configuradas} gestao={gestao} />
      <Comp />
    </>
  )
}

function Abas({ configuradas, gestao }: { configuradas: Set<AbaWa> | null; gestao: boolean }) {
  return (
    <AbasRolaveis
      rotulo="Seções da Íris"
      itens={abasVisiveis(gestao).map((t) => {
        const feita = configuradas?.has(t.aba) ?? false
        return {
          id: t.id,
          para: t.rota,
          fim: t.rota === ROTAS.ia,
          rotulo: (
            <span className="inline-flex items-center gap-1">
              {t.rotulo}
              {feita && (
                <>
                  <Check className="h-3 w-3 text-iris-fg" aria-hidden />
                  <span className="sr-only">(configurado)</span>
                </>
              )}
            </span>
          ),
        }
      })}
    />
  )
}
