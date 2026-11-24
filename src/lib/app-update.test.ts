import { describe, expect, it } from 'vitest'
import { appUpdateNotice, isNewerVersion, updateRequest } from './app-update'
import { parseHtaiAppUpdate } from '../../supabase/functions/_shared/htai-licenca-core'
import { recordAppUpdate, recordInstalledVersion, sincronizarComAviso } from '../../supabase/functions/_shared/htai-app-update'

describe('Aviso de versão nova', () => {
  it('compara versões por número, não por texto', () => {
    expect(isNewerVersion('0.1.7', '0.2.0')).toBe(true)
    expect(isNewerVersion('0.1.9', '0.1.10')).toBe(true)
    expect(isNewerVersion('0.2.0', '0.2.0')).toBe(false)
    expect(isNewerVersion('0.3.0', '0.2.0')).toBe(false)
    expect(isNewerVersion('1.0', '1.0.0')).toBe(false)
    expect(isNewerVersion('unknown', '0.2.0')).toBe(false)
    expect(isNewerVersion('0.2.0', '0.3.0-rc1')).toBe(false)
    expect(isNewerVersion('v0.1.0', '0.2.0')).toBe(false)
  })

  it('só avisa quando a mais nova é maior, e filtra novidades', () => {
    expect(appUpdateNotice({ installed_version: '0.1.7', latest_version: '0.2.0', notes: ['Aviso novo.', 3, ' '] }))
      .toEqual({ installed: '0.1.7', latest: '0.2.0', notes: ['Aviso novo.'] })
    expect(appUpdateNotice({ installed_version: '0.2.0', latest_version: '0.2.0', notes: [] })).toBeNull()
    expect(appUpdateNotice({ installed_version: '0.1.7', latest_version: null, notes: [] })).toBeNull()
    expect(appUpdateNotice(null)).toBeNull()
  })

  it('lê o bloco da central e recusa formato estranho', () => {
    expect(parseHtaiAppUpdate({ versao_mais_nova: '0.2.0', novidades: ['a', 1, 'b'] })).toEqual({ latestVersion: '0.2.0', notes: ['a', 'b'] })
    expect(parseHtaiAppUpdate({ versao_mais_nova: '0.2.0', novidades: ['1', '2', '3', '4', '5', '6'] })?.notes).toHaveLength(5)
    expect(parseHtaiAppUpdate({ versao_mais_nova: '<x>' })).toBeNull()
    expect(parseHtaiAppUpdate(undefined)).toBeNull()
    expect(parseHtaiAppUpdate([])).toBeNull()
  })

  it('pedido pronto para a IA', () => {
    expect(updateRequest('Desk')).toBe('Atualize o meu app Desk.')
  })
})

describe('Aviso de versão nova — gravação na htai-licenca (nunca muda a licença)', () => {
  const db = (impl: (name: string, args: Record<string, unknown>) => Promise<{ error: unknown }>) => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = []
    return { calls, rpc: (name: string, args: Record<string, unknown>) => { calls.push({ name, args }); return impl(name, args) } }
  }

  it('grava a versão mais nova e as novidades', async () => {
    const d = db(async () => ({ error: null }))
    expect(await recordAppUpdate(d, '0.1.7', { latestVersion: '0.2.0', notes: ['a'] })).toBe(true)
    expect(d.calls[0]).toEqual({ name: 'htai_installation_set_update', args: { p_installed_version: '0.1.7', p_latest_version: '0.2.0', p_notes: ['a'] } })
  })

  it('sem aviso, limpa (latest nulo)', async () => {
    const d = db(async () => ({ error: null }))
    await recordAppUpdate(d, '0.1.7', null)
    expect(d.calls[0].args).toMatchObject({ p_latest_version: null, p_notes: [] })
  })

  it('erro do banco ou exceção não sobem', async () => {
    expect(await recordAppUpdate(db(async () => ({ error: { code: '42883' } })), '0.1.7', null)).toBe(false)
    expect(await recordAppUpdate(db(async () => { throw new Error('rede') }), '0.1.7', null)).toBe(false)
    expect(await recordInstalledVersion(db(async () => { throw new Error('rede') }), '0.2.0')).toBe(false)
  })

  it('rodada: grava a instalada antes e a mais nova só quando o envelope foi aplicado', async () => {
    const d = db(async () => ({ error: null }))
    const r = await sincronizarComAviso(d, { ativo: true, versaoApp: '0.1.7' }, async () => ({ feito: 'aplicado', atualizacao: { latestVersion: '0.2.0', notes: [] } }))
    expect(r.feito).toBe('aplicado')
    expect(d.calls.map((c) => c.name)).toEqual(['htai_installation_set_installed_version', 'htai_installation_set_update'])

    const d2 = db(async () => ({ error: null }))
    await sincronizarComAviso(d2, { ativo: true, versaoApp: '0.1.7' }, async () => ({ feito: 'central_fora' }))
    expect(d2.calls.map((c) => c.name)).toEqual(['htai_installation_set_installed_version'])
  })

  it('licença desligada (produção da empresa), não ativada ou sem versão: não grava nada', async () => {
    for (const ctx of [{ ativo: false, versaoApp: '0.1.7' }, { ativo: true, versaoApp: null }]) {
      const d = db(async () => ({ error: null }))
      await sincronizarComAviso(d, ctx, async () => ({ feito: 'aplicado', atualizacao: { latestVersion: '0.2.0', notes: [] } }))
      expect(d.calls).toHaveLength(0)
    }
  })

  it('falha ao gravar o aviso não muda o resultado da licença', async () => {
    const d = db(async () => { throw new Error('banco fora') })
    const r = await sincronizarComAviso(d, { ativo: true, versaoApp: '0.1.7' }, async () => ({ feito: 'aplicado', atualizacao: null }))
    expect(r).toEqual({ feito: 'aplicado', atualizacao: null })
  })
})
