// Teste de caracterização: a chat-api ORIGINAL não pode mudar junto com a v2/MCP.
// Compara o SHA-256 do arquivo no disco com o do commit HEAD e garante que ela não importa nada novo.
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const raiz = execFileSync('git', ['rev-parse', '--show-toplevel']).toString().trim()
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex')
const arquivos = ['supabase/functions/chat-api/index.ts', 'supabase/functions/_shared/chat-api-regras.ts']

describe('chat-api original idêntica ao HEAD', () => {
  for (const a of arquivos) {
    it(a, () => {
      const head = execFileSync('git', ['show', `HEAD:${a}`], { cwd: raiz, maxBuffer: 10_000_000 })
      expect(sha(readFileSync(`${raiz}/${a}`))).toBe(sha(head))
    })
  }
  it('não importa nenhum módulo novo (v2, núcleo, mcp)', () => {
    const src = readFileSync(`${raiz}/${arquivos[0]}`, 'utf8') + readFileSync(`${raiz}/${arquivos[1]}`, 'utf8')
    expect(src).not.toMatch(/chat-api-v2|chat-api-nucleo|desk-mcp/)
  })
})
