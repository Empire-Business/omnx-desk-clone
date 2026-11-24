import { describe, expect, it } from 'vitest'
import {
  base64UrlParaBytes,
  bytesParaBase64Url,
  cifrarWebPush,
  decifrarWebPush,
  importarParEcdh,
  WEB_PUSH_MAX_TEXTO,
} from './web-push-cifra.ts'

// RFC 8291, seção 5 e Apêndice A (texto oficial em https://www.rfc-editor.org/rfc/rfc8291.txt).
// Os espaços dos valores quebrados em linhas na RFC foram removidos.
const RFC = {
  texto: 'V2hlbiBJIGdyb3cgdXAsIEkgd2FudCB0byBiZSBhIHdhdGVybWVsb24',
  asPublic: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  uaPublic: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  uaPrivate: 'q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  ecdhSecret: 'kyrL1jIIOHEzg3sM2ZWRHDRB62YACZhhSlknJ672kSs',
  prkKey: 'Snr3JMxaHVDXHWJn5wdC52WjpCtd2EIEGBykDcZW32k',
  ikm: 'S4lYMb_L0FxCeq0WhDx813KgSYqU26kOyzWUdsXYyrg',
  prk: '09_eUZGrsvxChDCGRCdkLiDXrReGOEVeSCdCcPBSJSc',
  cek: 'oIhVW04MRdy2XN9CiKLxTg',
  nonce: '4h_95klXJ5E_qnoN',
  cabecalho: 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  cifrado: '8pfeW0KbunFT06SuDKoJH9Ql87S1QUrdirN6GcG7sFz1y1sqLgVi1VhjVkHsUoEsbI_0LpXMuGvnzQ',
  mensagem:
    'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27ml' +
    'mlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPT' +
    'pK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
}

describe('RFC 8291 — Apêndice A (byte a byte)', () => {
  it('reproduz todos os valores intermediários e a mensagem da seção 5', async () => {
    const par = await importarParEcdh(RFC.asPrivate, RFC.asPublic)
    const { corpo, derivadas } = await cifrarWebPush({
      texto: base64UrlParaBytes(RFC.texto),
      uaPublic: RFC.uaPublic,
      authSecret: RFC.auth,
      salt: base64UrlParaBytes(RFC.salt),
      parServidor: par,
    })
    expect(new TextDecoder().decode(base64UrlParaBytes(RFC.texto))).toBe('When I grow up, I want to be a watermelon')
    expect(bytesParaBase64Url(derivadas.ecdhSecret)).toBe(RFC.ecdhSecret)
    expect(bytesParaBase64Url(derivadas.prkKey)).toBe(RFC.prkKey)
    expect(bytesParaBase64Url(derivadas.ikm)).toBe(RFC.ikm)
    expect(bytesParaBase64Url(derivadas.prk)).toBe(RFC.prk)
    expect(bytesParaBase64Url(derivadas.cek)).toBe(RFC.cek)
    expect(bytesParaBase64Url(derivadas.nonce)).toBe(RFC.nonce)
    // A seção 5 mostra "Content-Length: 145", mas o corpo do próprio exemplo decodifica
    // para 144 bytes (86 de cabeçalho + 41 + 1 de delimitador + 16 de tag).
    expect(corpo.length).toBe(144)
    expect(base64UrlParaBytes(RFC.mensagem).length).toBe(144)
    expect(bytesParaBase64Url(corpo.slice(0, 86))).toBe(RFC.cabecalho)
    expect(bytesParaBase64Url(corpo.slice(86))).toBe(RFC.cifrado)
    expect(bytesParaBase64Url(corpo)).toBe(RFC.mensagem)
  })

  it('o navegador do exemplo decifra a mensagem da RFC', async () => {
    const ua = await importarParEcdh(RFC.uaPrivate, RFC.uaPublic)
    const claro = await decifrarWebPush({ corpo: base64UrlParaBytes(RFC.mensagem), parNavegador: ua, authSecret: RFC.auth })
    expect(new TextDecoder().decode(claro)).toBe('When I grow up, I want to be a watermelon')
  })
})

describe('cifrarWebPush — uso real (sal e par efêmero aleatórios)', () => {
  it('ida e volta com chave efêmera nova a cada mensagem', async () => {
    const ua = await importarParEcdh(RFC.uaPrivate, RFC.uaPublic)
    const texto = JSON.stringify({ title: 'Cliente', body: 'Nova mensagem — ç ã', url: '/conversas?id=1' })
    const a = await cifrarWebPush({ texto, uaPublic: RFC.uaPublic, authSecret: RFC.auth })
    const b = await cifrarWebPush({ texto, uaPublic: RFC.uaPublic, authSecret: RFC.auth })
    expect(bytesParaBase64Url(a.corpo)).not.toBe(bytesParaBase64Url(b.corpo))
    expect(a.corpo[20]).toBe(65)
    expect(new DataView(a.corpo.buffer).getUint32(16, false)).toBe(4096)
    const claro = await decifrarWebPush({ corpo: a.corpo, parNavegador: ua, authSecret: RFC.auth })
    expect(new TextDecoder().decode(claro)).toBe(texto)
  })

  it('segredo auth errado não decifra', async () => {
    const ua = await importarParEcdh(RFC.uaPrivate, RFC.uaPublic)
    const { corpo } = await cifrarWebPush({ texto: 'oi', uaPublic: RFC.uaPublic, authSecret: RFC.auth })
    await expect(decifrarWebPush({ corpo, parNavegador: ua, authSecret: 'AAAAAAAAAAAAAAAAAAAAAA' })).rejects.toThrow()
  })

  it('recusa chave da inscrição inválida e texto acima do limite de um registro', async () => {
    await expect(cifrarWebPush({ texto: 'oi', uaPublic: 'AAAA', authSecret: RFC.auth })).rejects.toThrow(/P-256/)
    await expect(cifrarWebPush({ texto: 'oi', uaPublic: RFC.uaPublic, authSecret: 'AAAA' })).rejects.toThrow(/auth/)
    const grande = 'x'.repeat(WEB_PUSH_MAX_TEXTO + 1)
    await expect(cifrarWebPush({ texto: grande, uaPublic: RFC.uaPublic, authSecret: RFC.auth })).rejects.toThrow(/grande/)
    const noLimite = await cifrarWebPush({ texto: 'x'.repeat(WEB_PUSH_MAX_TEXTO), uaPublic: RFC.uaPublic, authSecret: RFC.auth })
    expect(noLimite.corpo.length).toBe(4096)
  })
})
