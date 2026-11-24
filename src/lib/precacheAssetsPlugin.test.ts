import { describe, expect, it } from 'vitest'
import { precacheAssetsPlugin } from './precacheAssetsPlugin'

function request(path: string) {
  return new Request(`https://app.example${path}`)
}

function response(mime?: string, status = 200) {
  return new Response(new TextEncoder().encode('conteúdo'), {
    status,
    headers: mime ? { 'Content-Type': mime } : {},
  })
}

async function verificar(path: string, resposta: Response, esperado: Response | null) {
  const requisicao = request(path)
  expect(await precacheAssetsPlugin.cachedResponseWillBeUsed({ request: requisicao, cachedResponse: resposta })).toBe(esperado)
  expect(await precacheAssetsPlugin.cacheWillUpdate({ request: requisicao, response: resposta })).toBe(esperado)
  expect(resposta.bodyUsed).toBe(false)
}

describe('validação do precache de scripts e estilos', () => {
  it.each(['js', 'mjs', 'css'])('ignora HTML já armazenado e impede novo cache em .%s', async extensao => {
    await verificar(`/assets/app.${extensao}?__WB_REVISION__=abc`, response('text/html; charset=utf-8'), null)
  })

  it.each([undefined, 'text/plain', 'application/json', 'text/css', 'application/octet-stream'])('rejeita script com MIME incorreto: %j', async mime => {
    await verificar('/assets/app.js', response(mime), null)
  })

  it.each([
    ['app.js', 'application/javascript'],
    ['app.mjs', 'text/javascript; charset=utf-8'],
    ['app.JS', 'Application/JavaScript; charset=UTF-8'],
    ['app.js', 'application/x-javascript'],
    ['app.js', 'text/ecmascript'],
    ['app.js', 'text/javascript1.5'],
    ['app.css', 'text/css; charset=utf-8'],
  ])('preserva %s válido com MIME %s sem consumir o corpo', async (arquivo, mime) => {
    const resposta = response(mime)
    await verificar(`/assets/${arquivo}`, resposta, resposta)
  })

  it('não aceita JavaScript como folha de estilos', async () => {
    await verificar('/assets/app.css', response('text/javascript'), null)
  })

  it.each([400, 404, 500])('preserva a rejeição de HTTP %s mesmo com MIME correto', async status => {
    await verificar('/assets/app.js', response('application/javascript', status), null)
    await verificar('/index.html', response('text/html', status), null)
  })

  it.each([
    ['/index.html', 'text/html'],
    ['/icons/app.png', 'image/png'],
    ['/assets/app.js.map', 'application/json'],
    ['/manifest.webmanifest', 'application/manifest+json'],
  ])('mantém os demais assets: %s', async (path, mime) => {
    const resposta = response(mime)
    await verificar(path, resposta, resposta)
  })

  it('mantém o cache miss quando a entrada não existe', async () => {
    expect(await precacheAssetsPlugin.cachedResponseWillBeUsed({ request: request('/assets/app.js') })).toBeNull()
  })
})
