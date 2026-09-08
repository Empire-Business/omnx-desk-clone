import { AtendimentoTabs } from '@/components/atendimento/AtendimentoTabs'
import ChatRelatorioSemanalPage from '@/pages/chat/ChatRelatorioSemanalPage'

/**
 * Aba Sentimental dentro do app Atendimento.
 *
 * A análise sentimental das conversas já existia, mas só era alcançável por uma
 * aba do Dashboard antigo — que saiu do menu quando o Atendimento virou a tela
 * inicial. Na prática, a leitura de como o cliente está se sentindo tinha
 * deixado de ser encontrável.
 *
 * Aqui ela é a **mesma tela**, não uma cópia: reaproveitamos
 * `ChatRelatorioSemanalPage` inteira. Duplicar o relatório significaria duas
 * versões divergindo com o tempo. O que muda é só a moldura — a navegação do
 * Atendimento por cima, para a pessoa saber onde está.
 */
export function AtendimentoSentimentoPage() {
  return (
    <div className="space-y-6">
      <AtendimentoTabs />
      <ChatRelatorioSemanalPage />
    </div>
  )
}
