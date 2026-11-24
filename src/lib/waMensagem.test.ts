import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  chaveIdempotencia, conversaZernioValida, converterMensagem, destinoUazapi, destinoValido,
  destinoZernio, idiomaTemplateValido, janelaDia, janelaMinuto, limparParametroOficial,
  paraTemplateOficial, renderizarTexto, validarBaseUrl, variaveisDoModelo,
} from './waMensagem'

describe('espelho Deno', () => {
  it('src/lib/waMensagem.ts e supabase/functions/_shared/wa-mensagem.ts são idênticos', () => {
    // Caminhos relativos à raiz do projeto (o vitest roda dali), como em gerarContratoDocx.test.ts.
    const front = readFileSync('src/lib/waMensagem.ts', 'utf8')
    const deno = readFileSync('supabase/functions/_shared/wa-mensagem.ts', 'utf8')
    expect(deno).toBe(front)
  })
})

describe('variaveisDoModelo', () => {
  it('lista na ordem da 1ª aparição, sem repetir, ignorando caixa e espaços', () => {
    expect(variaveisDoModelo('Oi {{cliente}}, dia {{ data }} — {{Cliente}}')).toEqual(['cliente', 'data'])
  })
  it('modelo sem variável', () => {
    expect(variaveisDoModelo('Bom dia')).toEqual([])
  })
})

describe('renderizarTexto (UAZAPI)', () => {
  it('substitui placeholders', () => {
    expect(renderizarTexto('Oi {{cliente}}, reunião às {{hora}}.', { cliente: 'Maria', hora: '14h' }))
      .toBe('Oi Maria, reunião às 14h.')
  })
  it('não reinterpreta placeholder que veio dentro de um valor', () => {
    expect(renderizarTexto('{{cliente}} / {{hora}}', { cliente: '{{hora}}', hora: '9h' })).toBe('{{hora}} / 9h')
  })
  it('falha quando falta valor (toda mensagem cita o cliente)', () => {
    expect(() => renderizarTexto('Oi {{cliente}}', { cliente: '  ' })).toThrow(/cliente/)
    expect(() => renderizarTexto('Oi {{cliente}}', {})).toThrow(/Variáveis sem valor/)
  })
  it('aceita número como valor', () => {
    expect(renderizarTexto('{{n}} alertas', { n: 3 })).toBe('3 alertas')
  })
})

describe('paraTemplateOficial', () => {
  it('numera na ordem e reusa o número em repetições', () => {
    const t = paraTemplateOficial('Oi {{cliente}}, dia {{data}}. Até, {{cliente}}!', { cliente: 'Maria', data: '26/10' })
    expect(t.modeloNumerado).toBe('Oi {{1}}, dia {{2}}. Até, {{1}}!')
    expect(t.ordem).toEqual(['cliente', 'data'])
    expect(t.variaveis).toEqual(['Maria', '26/10'])
  })
  it('achata quebras de linha e espaços (regra da API oficial)', () => {
    expect(limparParametroOficial('a\n\tb     c ')).toBe('a b c')
    expect(paraTemplateOficial('{{x}}', { x: 'linha1\nlinha2' }).variaveis).toEqual(['linha1 linha2'])
  })
  it('falha quando falta valor', () => {
    expect(() => paraTemplateOficial('{{cliente}}', {})).toThrow()
  })
})

describe('converterMensagem', () => {
  it('UAZAPI vira texto; oficial vira variáveis', () => {
    expect(converterMensagem('uazapi', 'Oi {{cliente}}', { cliente: 'Ana' })).toEqual({ tipo: 'texto', texto: 'Oi Ana' })
    expect(converterMensagem('zernio', 'Oi {{cliente}}', { cliente: 'Ana' }))
      .toEqual({ tipo: 'template', variaveis: ['Ana'], ordem: ['cliente'] })
  })
})

describe('destinos', () => {
  it('valida telefone E.164 e grupo', () => {
    expect(destinoValido('+5511999998888')).toBe(true)
    expect(destinoValido('120363012345678901@g.us')).toBe(true)
    expect(destinoValido('11999998888')).toBe(false)
    expect(destinoValido('+55 11 99999-8888')).toBe(false)
    expect(destinoValido('abc@g.us')).toBe(false)
  })
  it('UAZAPI: só dígitos para telefone, chatid para grupo', () => {
    expect(destinoUazapi('+5511999998888')).toBe('5511999998888')
    expect(destinoUazapi('120363012345678901@G.US')).toBe('120363012345678901@g.us')
    expect(() => destinoUazapi('5511999998888')).toThrow()
  })
  it('Zernio: só dígitos sem +, recusa grupo', () => {
    expect(destinoZernio('+5511999998888')).toBe('5511999998888')
    expect(() => destinoZernio('120363012345678901@g.us')).toThrow(/grupo/)
  })
  it('conversationId e idioma seguros', () => {
    expect(conversaZernioValida('conv_123-AB')).toBe(true)
    expect(conversaZernioValida('../admin')).toBe(false)
    expect(conversaZernioValida('')).toBe(false)
    expect(idiomaTemplateValido('pt_BR')).toBe(true)
    expect(idiomaTemplateValido('en')).toBe(true)
    expect(idiomaTemplateValido('pt-BR')).toBe(false)
  })
})

describe('idempotência', () => {
  const d = new Date('2026-10-26T14:05:42.123Z')
  it('janelas', () => {
    expect(janelaMinuto(d)).toBe('2026-10-26T14:05')
    // 01:30 UTC ainda é dia 25 em São Paulo (UTC-3)
    expect(janelaDia(new Date('2026-10-26T01:30:00Z'))).toBe('2026-10-25')
  })
  it('mesma entrada → mesma chave; telefone normalizado', () => {
    const a = chaveIdempotencia('teste', '+5511999998888', janelaMinuto(d))
    const b = chaveIdempotencia('teste', ' 5511999998888 ', janelaMinuto(d))
    expect(a).toBe('teste:5511999998888:2026-10-26T14:05')
    expect(b).toBe(a)
  })
  it('muda com tipo, destino ou janela', () => {
    const base = chaveIdempotencia('relatorio_diario', '+5511999998888', '2026-10-26')
    expect(chaveIdempotencia('resumo_semanal', '+5511999998888', '2026-10-26')).not.toBe(base)
    expect(chaveIdempotencia('relatorio_diario', '+5511999997777', '2026-10-26')).not.toBe(base)
    expect(chaveIdempotencia('relatorio_diario', '+5511999998888', '2026-10-27')).not.toBe(base)
  })
  it('grupo mantém o chatid', () => {
    expect(chaveIdempotencia('agendamento_link', '120363012345678901@g.us', 'x')).toBe('agendamento_link:120363012345678901@g.us:x')
  })
  it('recusa entradas inválidas', () => {
    expect(() => chaveIdempotencia('outro' as never, '+5511999998888', 'x')).toThrow()
    expect(() => chaveIdempotencia('teste', '+5511999998888', ' ')).toThrow()
    expect(() => chaveIdempotencia('teste', 'abc', 'x')).toThrow()
  })
})

describe('validarBaseUrl (SSRF)', () => {
  it('aceita domínio e subdomínio permitidos, normaliza barra final', () => {
    expect(validarBaseUrl('uazapi', 'https://empirebusiness.uazapi.com/')).toBe('https://empirebusiness.uazapi.com')
    expect(validarBaseUrl('zernio', 'https://zernio.com/api/v1')).toBe('https://zernio.com/api/v1')
    expect(validarBaseUrl('zernio', 'https://ZERNIO.com/api/v1/')).toBe('https://zernio.com/api/v1')
  })
  it('recusa domínio de outro provedor ou parecido', () => {
    expect(() => validarBaseUrl('uazapi', 'https://zernio.com')).toThrow(/não permitido/)
    expect(() => validarBaseUrl('uazapi', 'https://uazapi.com.evil.com')).toThrow(/não permitido/)
    expect(() => validarBaseUrl('uazapi', 'https://eviluazapi.com')).toThrow(/não permitido/)
    expect(() => validarBaseUrl('zernio', 'https://169.254.169.254/latest')).toThrow(/não permitido/)
    expect(() => validarBaseUrl('zernio', 'https://localhost')).toThrow(/não permitido/)
  })
  it('recusa http, credenciais, porta e query', () => {
    expect(() => validarBaseUrl('uazapi', 'http://x.uazapi.com')).toThrow(/https/)
    expect(() => validarBaseUrl('uazapi', 'https://user:pw@x.uazapi.com')).toThrow(/usuário/)
    expect(() => validarBaseUrl('uazapi', 'https://x.uazapi.com:8443')).toThrow(/porta/)
    expect(() => validarBaseUrl('uazapi', 'https://x.uazapi.com/?a=1')).toThrow(/parâmetros/)
    expect(() => validarBaseUrl('uazapi', 'não é url')).toThrow(/inválido/)
  })
})
