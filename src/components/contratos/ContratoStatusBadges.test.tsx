import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ContratoStatusBadges } from './ContratoStatusBadges'

function selos(status: string, statusSecundario?: string | null) {
  const html = renderToStaticMarkup(<ContratoStatusBadges status={status} statusSecundario={statusSecundario} />)
  return { html, textos: [...html.matchAll(/<span[^>]*>(.*?)<\/span>/g)].map(match => match[1]) }
}

describe('selos de status do contrato na ficha do cliente', () => {
  it.each(['CONCLUÍDO', '  concluido  ', 'Conclui\u0301do'])('exibe Concluído uma única vez para %s', secundario => {
    expect(selos('concluido', secundario).textos).toEqual(['Concluído'])
  })

  it('preserva o status secundário quando traz uma informação diferente', () => {
    expect(selos('ativo', 'INADIMPLENTE').textos).toEqual(['Ativo', 'INADIMPLENTE'])
  })

  it('exibe Pausado sem um falso selo Ativo', () => {
    expect(selos('pausado', 'PAUSADO').textos).toEqual(['Pausado'])
  })

  it('normaliza também os espaços internos no rótulo equivalente', () => {
    expect(selos('rascunho', ' NÃO   INICIADO ').textos).toEqual(['Não iniciado'])
  })

  it.each([null, '', '   '])('omite status secundário vazio: %j', secundario => {
    expect(selos('ativo', secundario).textos).toEqual(['Ativo'])
  })

  it('apresenta status desconhecido com estilo neutro', () => {
    const resultado = selos('em revisão')
    expect(resultado.textos).toEqual(['em revisão'])
    expect(resultado.html).not.toContain('text-success')
  })

  it('identifica status ausente sem presumir que o contrato está ativo', () => {
    expect(selos('').textos).toEqual(['Não informado'])
  })
})
