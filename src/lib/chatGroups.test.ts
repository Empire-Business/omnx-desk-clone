import { describe, expect, it } from 'vitest'
import { agruparConversas, origensDoGrupo } from './chatGroups'

const conversa = (id: string, numero = '120363400000001', tenant = 'empresa-a', grupo = true) => ({
  id, tenant_id: tenant, is_group: grupo, chat_contacts: { numero_whatsapp: numero, nome: 'Mesmo nome' },
})

describe('grupos autorizados do Chat', () => {
  it('reúne o mesmo JID entre instâncias e preserva os registros físicos e a ordem', () => {
    const a = conversa('mais-recente'), b = conversa('outra-instancia', '120363400000001@g.us')
    expect(agruparConversas([a, b])).toEqual([[a, b]])
    expect(a.id).toBe('mais-recente')
  })
  it('nunca mistura empresas, nomes iguais, conversa direta ou JID ausente', () => {
    const linhas = [conversa('a'), conversa('b', '120363400000001', 'empresa-b'), conversa('c', '120363400000002'), conversa('d', '120363400000001', 'empresa-a', false), conversa('e', ''), conversa('f', '')]
    expect(agruparConversas(linhas)).toHaveLength(6)
  })
  it('sem tenant explícito não agrega dois registros', () => {
    expect(agruparConversas([conversa('a', '12345', ''), conversa('b', '12345', '')])).toHaveLength(2)
  })
  it('histórico só recebe as origens presentes na lista autorizada/filtrada', () => {
    const a = conversa('a'), b = conversa('b'), terceiro = conversa('c', 'outro')
    expect(origensDoGrupo(a, [a, terceiro])).toEqual([a])
    expect(origensDoGrupo(a, [a, b])).toEqual([a, b])
    expect(origensDoGrupo(undefined, [a, b])).toEqual([])
  })
})
