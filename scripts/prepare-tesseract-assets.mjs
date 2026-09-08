/**
 * Prepara os arquivos do leitor de comprovante (OCR) para serem servidos pelo
 * NOSSO domínio, em vez de baixados de um CDN de terceiros em tempo de execução.
 *
 * Por que isso importa: por padrão o tesseract.js busca o worker, o WASM e o
 * modelo de idioma no cdn.jsdelivr.net enquanto a página roda. Isso significa
 * executar código de terceiro dentro da página pública de venda — a mesma que
 * manipula comprovante bancário, CPF e endereço do cliente. Se o CDN (ou o DNS
 * da rede de quem está usando) for comprometido, o atacante executa o que quiser
 * nessa página. Servindo do próprio domínio, esse vetor deixa de existir.
 *
 * O único arquivo que ainda vem da rede é o modelo de idioma, baixado UMA VEZ
 * aqui na build — e com hash SHA-256 conferido, então um arquivo adulterado
 * quebra a build em vez de ir para produção.
 *
 * Roda automaticamente no `npm run dev` e no `npm run build`.
 */
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { mkdir, copyFile, writeFile, readFile, access } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
// Deriva o diretório de import.meta.url em vez de import.meta.dirname: este último
// só existe no Node 20.11+, e num Node mais antigo viraria `undefined` — quebrando
// o build inteiro já na primeira linha, que foi o que aconteceu no primeiro deploy.
const AQUI = path.dirname(fileURLToPath(import.meta.url))
const RAIZ = path.resolve(AQUI, '..')
const DESTINO = path.join(RAIZ, 'public', 'tesseract')

// Modelo de português. A versão é fixa de propósito: "latest" abriria caminho
// para o conteúdo mudar sem ninguém revisar.
const MODELO_URL = 'https://cdn.jsdelivr.net/npm/@tesseract.js-data/por@1.0.0/4.0.0_best_int/por.traineddata.gz'
// Hash do arquivo conferido em 04/08/2026. Se a build falhar por causa dele,
// não contorne: confira o que mudou antes de atualizar este valor.
const MODELO_SHA256 = process.env.TESSERACT_POR_SHA256
  ?? 'dacebc1386ddaaf8389f81094236cca0d690897cde693d48cbdaa881c86e2b4c'

async function existe(p) {
  try { await access(p); return true } catch { return false }
}

async function copiarDoPacote() {
  const workerSrc = require.resolve('tesseract.js/dist/worker.min.js')
  const coreDir = path.dirname(require.resolve('tesseract.js-core/package.json'))

  await mkdir(DESTINO, { recursive: true })
  await copyFile(workerSrc, path.join(DESTINO, 'worker.min.js'))

  // O tesseract escolhe a variante conforme o que o navegador suporta (SIMD ou
  // não). Copiamos as variantes "lstm", que são as menores e suficientes para
  // texto impresso — que é o caso de um comprovante.
  const variantes = [
    'tesseract-core-lstm.wasm.js',
    'tesseract-core-simd-lstm.wasm.js',
    'tesseract-core-relaxedsimd-lstm.wasm.js',
  ]
  for (const nome of variantes) {
    const origem = path.join(coreDir, nome)
    if (!(await existe(origem))) {
      throw new Error(`Arquivo do OCR não encontrado no pacote: ${nome}. O tesseract.js-core mudou de layout?`)
    }
    await copyFile(origem, path.join(DESTINO, nome))
  }
  return variantes.length + 1
}

async function baixarModelo() {
  const destino = path.join(DESTINO, 'lang', 'por.traineddata.gz')
  await mkdir(path.dirname(destino), { recursive: true })

  if (await existe(destino)) {
    const atual = createHash('sha256').update(await readFile(destino)).digest('hex')
    if (!MODELO_SHA256 || atual === MODELO_SHA256) return { destino, sha256: atual, baixado: false }
  }

  // Uma segunda tentativa: um blip de rede no CI não deve derrubar o deploy inteiro.
  let resp = await fetch(MODELO_URL).catch(() => null)
  if (!resp?.ok) resp = await fetch(MODELO_URL).catch(() => null)
  if (!resp?.ok) throw new Error(`Falha ao baixar o modelo de idioma (${resp?.status ?? 'sem resposta'})`)
  const bytes = Buffer.from(await resp.arrayBuffer())
  const sha256 = createHash('sha256').update(bytes).digest('hex')

  // Trava de integridade: com o hash configurado, um arquivo diferente do
  // esperado derruba a build em vez de virar código em produção.
  if (MODELO_SHA256 && sha256 !== MODELO_SHA256) {
    throw new Error(
      `Modelo de idioma com hash inesperado.\n  esperado: ${MODELO_SHA256}\n  recebido: ${sha256}\n` +
      'Se a mudança for legítima, atualize TESSERACT_POR_SHA256.',
    )
  }

  await writeFile(destino, bytes)
  return { destino, sha256, baixado: true }
}

const arquivos = await copiarDoPacote()
const modelo = await baixarModelo()
console.log(`[tesseract] ${arquivos} arquivo(s) copiados para public/tesseract/`)
console.log(`[tesseract] modelo pt-BR ${modelo.baixado ? 'baixado' : 'já presente'} — sha256 ${modelo.sha256}`)
if (!MODELO_SHA256) {
  console.log('[tesseract] defina TESSERACT_POR_SHA256 com esse hash para travar a verificação de integridade.')
}
