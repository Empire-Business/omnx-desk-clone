import { describe, expect, it } from 'vitest'
import { CAMINHOS_ANTIGOS, traduzirRotaAntiga } from './rotasAntigas'

describe('redirecionamento permanente de endereços antigos', () => {
  const casos: Array<[string, string, string, string]> = [
    // [caminho, busca, âncora, esperado]
    ['/atendimento', '', '', '/'],
    ['/atendimento/demandas', '', '', '/tickets'],
    ['/atendimento/demandas', '?etapa=nova', '', '/tickets?etapa=nova'],
    ['/atendimento/demandas/abc-123', '', '#comentarios', '/tickets/abc-123#comentarios'],
    ['/atendimento/kanban', '', '', '/tickets/quadro'],
    ['/atendimento/sentimento', '', '', '/tickets/analise'],
    ['/atendimento/config', '', '', '/tickets/configurar'],
    // Push do celular (sw.ts) abre /chat?id=… — a conversa não pode se perder (R4)
    ['/chat', '?id=conv-1', '', '/conversas?id=conv-1'],
    ['/chat', '?nome=Ana%20Lu&whatsapp=5511999&mensagem=Ol%C3%A1', '', '/conversas?nome=Ana%20Lu&whatsapp=5511999&mensagem=Ol%C3%A1'],
    ['/chat/', '?contato=c1', '', '/conversas?contato=c1'],
    ['/chat/inbox', '?novaConversa=true', '', '/conversas?novaConversa=true'],
    ['/chat/kanban', '', '', '/conversas/quadro'],
    ['/chat/contatos', '', '', '/conversas/contatos'],
    ['/chat/anotacoes', '', '', '/conversas/anotacoes'],
    ['/chat/config', '', '', '/conversas/configurar'],
    ['/chat/instancias', '', '', '/conversas/configurar?aba=instancias'],
    ['/chat/acessos', '?x=1', '', '/conversas/configurar?x=1&aba=acessos'],
    ['/chat/departamentos', '', '', '/conversas/filas'],
    ['/chat/reunioes', '', '', '/conversas/reunioes'],
    ['/chat/relatorio-semanal', '', '', '/tickets/analise'],
    ['/chat/equipe', '', '', '/conversas/equipe'],
    // Links enviados no WhatsApp (R2)
    ['/automacoes-wa/alertas', '', '', '/ia/alertas'],
    ['/automacoes-wa/vinculos', '?contato=abc&nome=Grupo%20X', '', '/clientes/grupos?contato=abc&nome=Grupo%20X'],
    ['/automacoes-wa', '', '', '/ia/comecar'],
    ['/automacoes-wa/inicio', '', '', '/ia/comecar'],
    ['/automacoes-wa/iris', '', '#memoria', '/ia#memoria'],
    ['/automacoes-wa/assistente', '', '', '/ia'],
    ['/automacoes-wa/relatorio', '', '', '/ia/aviso-diario'],
    ['/automacoes-wa/gestores', '', '', '/ia/aviso-diario'],
    ['/automacoes-wa/resumo', '', '', '/ia/resumo-semanal'],
    ['/automacoes-wa/agendamento', '', '', '/ia/reunioes'],
    ['/automacoes-wa/reunioes', '', '', '/ia/reunioes'],
    ['/automacoes-wa/tempo-resposta', '', '', '/ia/tempo-resposta'],
    ['/automacoes-wa/historico', '', '', '/ia/historico'],
    ['/automacoes-wa/conexao', '', '', '/ia/conexao'],
    ['/automacoes-wa/qualquer', '', '', '/ia/comecar'],
    // Notificação gravada no banco com rota que nunca existiu (R3)
    ['/comissoes/vendas-pendentes', '', '', '/contratos/onboarding'],
    ['/usuarios', '', '', '/colaboradores'],
    ['/contratos/modelos', '', '', '/contratos/produtos'],
  ]

  it.each(casos)('%s%s%s → %s', (caminho, busca, ancora, esperado) => {
    expect(traduzirRotaAntiga(caminho, busca, ancora)).toBe(esperado)
  })

  it('não mexe em endereços que não são antigos', () => {
    for (const p of ['/', '/conversas', '/tickets/abc', '/clientes', '/contratos/abc', '/ia', '/chatx', '/atendimento-x']) {
      expect(traduzirRotaAntiga(p)).toBeNull()
    }
  })

  it('não aceita barras a mais no parâmetro de ticket', () => {
    expect(traduzirRotaAntiga('/atendimento/demandas/a/b')).toBeNull()
  })

  it('expõe ao roteador todos os caminhos antigos que precisam continuar vivos', () => {
    for (const p of ['/chat', '/chat/*', '/atendimento/demandas/:id', '/automacoes-wa/vinculos', '/automacoes-wa/alertas', '/comissoes/vendas-pendentes']) {
      expect(CAMINHOS_ANTIGOS).toContain(p)
    }
  })
})
