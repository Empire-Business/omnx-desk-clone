import { describe, expect, it } from 'vitest'
import { coletarAlertas } from './wa-relatorio-dados.ts'
import { criarSupabaseFalso as criarFalsoBase, comClientesAtendidos } from './teste-supabase-falso.ts'
const criarSupabaseFalso: typeof criarFalsoBase = (tabelas, rpcs) => criarFalsoBase(comClientesAtendidos(tabelas), rpcs)

const T = 'empresa-1'
const AGORA = new Date('2026-10-27T12:00:00Z')

function banco() {
  const cliente = (id: string, nome: string) => ({ id, nome, tenant_id: T, ativo: true })
  const contrato = (id: string, cliente_id: string, status_secundario: string) => ({
    id, cliente_id, cliente_nome: cliente_id, tenant_id: T, status: 'ativo', status_secundario,
    atualizado_em: '2026-10-26T12:00:00Z', data_fechamento: '2026-10-01', data_assinatura: null, plano_dias: 90,
  })
  return criarSupabaseFalso({
    clients: [
      cliente('c-inadimplente', 'Cliente inadimplente'), cliente('c-nao-iniciado', 'Cliente não iniciado'),
      cliente('c-chat', 'Cliente sem resposta'), cliente('c-pausado', 'Cliente pausado'),
      cliente('c-agenda-futura', 'Agenda futura'), cliente('c-agenda-passada', 'Agenda passada'),
    ],
    contratos: [
      contrato('ct-inadimplente', 'c-inadimplente', 'INADIMPLENTE'),
      contrato('ct-nao-iniciado', 'c-nao-iniciado', 'Não iniciado'),
      contrato('ct-chat', 'c-chat', 'ATIVO'),
      contrato('ct-pausado', 'c-pausado', 'PAUSADO'),
    ],
    chat_contacts: [{
      id: 'contato-chat', tenant_id: T, client_id: 'c-chat', nome: 'Cliente sem resposta',
      numero_whatsapp: '5521999998888', bloqueado: false, group_size: null,
    }],
    chat_conversations: [{
      id: 'conversa-chat', tenant_id: T, contact_id: 'contato-chat', aguardando_resposta: true,
      arquivada: false, status: 'aberta', ultima_msg_cliente_em: '2026-10-27T06:00:00Z', is_group: false, silenciado: false,
    }],
    // Estes registros seriam elegíveis tanto para a agenda do dia quanto para
    // a antiga pendência de reunião atrasada. Nenhum deve ser consultado.
    meetings: [
      { id: 'm-hoje', tenant_id: T, client_id: 'c-agenda-futura', status: 'scheduled', scheduled_at: '2026-10-27T16:00:00Z' },
      { id: 'm-atrasada', tenant_id: T, client_id: 'c-agenda-passada', status: 'scheduled', scheduled_at: '2026-10-26T12:00:00Z' },
      { id: 'm-outra-empresa', tenant_id: 'outra-empresa', client_id: 'c-fora', status: 'scheduled', scheduled_at: '2026-10-27T17:00:00Z' },
    ],
  }, { wa_auto_grupos_sem_cliente: () => [] })
}

describe('coleta operacional sem integração de agenda', () => {
  for (const soClientesAtivos of [true, false]) {
    it(`não consulta meetings e mantém contratos e Chat com opção de ativos ${soClientesAtivos ? 'ligada' : 'desligada'}`, async () => {
      const f = banco()
      const r = await coletarAlertas(f.client, T, [
        { tipo: 'pendencia', ativo: true, limiar: 0 },
        { tipo: 'sem_resposta', ativo: true, limiar: 4 },
      ], AGORA, 'America/Sao_Paulo', { agruparPorEstrategista: false, soClientesAtivos })

      expect(r.dados.reunioes).toEqual([])
      expect(r.dados.alertas.sem_resposta?.map((a) => a.client_id)).toEqual(['c-chat'])
      expect(r.dados.alertas.pendencia?.map((a) => a.contract_id)).toEqual([
        'ct-inadimplente', 'ct-nao-iniciado', ...(!soClientesAtivos ? ['ct-pausado'] : []),
      ])
      expect(r.dados.alertas.pendencia?.map((a) => a.detalhe)).toEqual([
        'contrato inadimplente', 'contrato não iniciado há 26 dias', ...(!soClientesAtivos ? ['contrato pausado'] : []),
      ])
      expect(r.ocultos.contrato_pausado).toBe(soClientesAtivos ? 1 : 0)
      expect(JSON.stringify(r.dados)).not.toMatch(/Agenda futura|Agenda passada|reunião/)
      expect(f.consultas.some((q) => q.tabela === 'meetings')).toBe(false)
      expect(f.consultas.some((q) => q.tabela === 'contratos')).toBe(true)
      for (const q of f.consultas) expect(q.filtros).toContain('eq:tenant_id')
      expect(f.inseridos).toEqual([])
      expect(f.atualizados).toEqual([])
    })
  }
})
