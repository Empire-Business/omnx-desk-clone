import { describe, expect, it } from 'vitest'
import { destinoAjuda, fontesAjudaValidas, respostaLocalAjuda, temaAjuda } from './ajudaIris'

describe('ajuda com fontes e destinos conhecidos', () => {
  it('nunca transforma URLs ou IDs recebidos em destinos', () => {
    for (const id of ['https://exemplo.test', '//exemplo.test', 'javascript:alert(1)', '__proto__', 'clientes?admin=true']) {
      expect(destinoAjuda(id, () => true, () => true)).toBeNull()
      expect(fontesAjudaValidas([id])).toEqual([])
    }
    expect(fontesAjudaValidas(['clientes', 'clientes', 'chat'])).toEqual(['clientes', 'chat'])
  })
  it('filtra destinos por permissão e app habilitado', () => {
    expect(destinoAjuda('chat', () => false, () => true)).toBeNull()
    expect(destinoAjuda('chat', () => true, () => false)).toBeNull()
    expect(destinoAjuda('iris', (_r, acao) => acao !== 'admin', () => true)).toBeNull()
    expect(destinoAjuda('clientes', () => true, () => true)?.caminho).toBe('/clientes')
  })
  it('identifica honestamente a consulta local e não inventa respostas', () => {
    const r = respostaLocalAjuda('Como cadastrar um cliente?')
    expect(r.modo).toBe('manual'); expect(r.fontes).toContain('clientes')
    const vazio = respostaLocalAjuda('xyzabcdefghi')
    expect(vazio.fontes).toEqual([]); expect(vazio.texto).toContain('Não encontrei')
    expect(temaAjuda('/chat/contatos')).toBe('chat')
    expect(temaAjuda('/__proto__')).toBe('comecar')
  })
  it('reconhece os endereços novos da navegação', () => {
    expect(temaAjuda('/conversas/contatos')).toBe('chat')
    expect(temaAjuda('/tickets/abc')).toBe('atendimento')
    expect(temaAjuda('/')).toBe('atendimento')
    expect(temaAjuda('/ia/alertas')).toBe('iris')
    expect(temaAjuda('/ia/tempo-resposta')).toBe('tempo-resposta')
    expect(temaAjuda('/clientes/grupos')).toBe('iris')
    expect(temaAjuda('/clientes/abc')).toBe('clientes')
    expect(temaAjuda('/ajustes')).toBe('configuracoes')
    expect(temaAjuda('/aulas/abc')).toBe('aulas')
    expect(temaAjuda('/relatorios/pesquisas')).toBe('pesquisas')
    expect(temaAjuda('/relatorios/pesquisas/abc')).toBe('pesquisas')
    expect(temaAjuda('/relatorios')).toBe('relatorios')
    expect(destinoAjuda('chat', () => true, () => true)?.caminho).toBe('/conversas')
    expect(destinoAjuda('atendimento', () => true, () => true)?.caminho).toBe('/tickets')
    expect(destinoAjuda('iris', () => true, () => true)?.caminho).toBe('/ia')
    expect(destinoAjuda('chat', () => true, () => true)?.rotulo).not.toMatch(/OMNXChat/)
  })
  it('deriva os atalhos de DESTINOS, inclusive abas (A02)', () => {
    const tudo = () => true
    expect(destinoAjuda('financeiro', tudo, tudo)).toEqual({ caminho: '/contratos/recebiveis', rotulo: 'Abrir A receber' })
    expect(destinoAjuda('tempo-resposta', tudo, tudo, { perfil: 'gerente' })?.caminho).toBe('/ia/tempo-resposta')
    expect(destinoAjuda('whatsapp', tudo, tudo)?.caminho).toBe('/ia/aviso-diario')
    expect(destinoAjuda('suporte', () => false, () => false)?.caminho).toBe('/meus-reportes')
  })
  it('respeita perfil nas abas restritas e some sem o app ligado', () => {
    const tudo = () => true
    expect(destinoAjuda('tempo-resposta', tudo, tudo, { perfil: 'estrategista' })).toBeNull()
    expect(destinoAjuda('tempo-resposta', tudo, tudo)).toBeNull()
    expect(destinoAjuda('relatorios', tudo, tudo, { perfil: 'gerente' })).toBeNull()
    expect(destinoAjuda('relatorios', tudo, tudo, { perfil: 'admin' })?.caminho).toBe('/relatorios')
    expect(destinoAjuda('pesquisas', tudo, tudo, { perfil: 'gerente' })).toBeNull()
    expect(destinoAjuda('pesquisas', tudo, tudo, { perfil: 'admin' })?.caminho).toBe('/relatorios/pesquisas')
    expect(destinoAjuda('atendimento', tudo, (slug) => slug !== 'atendimento')).toBeNull()
  })
})
