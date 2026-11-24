// Exportação completa dos dados de uma empresa (contrato da licença §4: exportar
// fica sempre aberto, mesmo com a licença negada). Puro: o banco é injetado
// (testável no Vitest). A função index.ts confere quem pede e liga ao Supabase.
//
// Formato (JSON, um arquivo): {formato, app, gerado_em, empresa_id, tabelas: {nome: [linhas]}, avisos: []}.
// Gerado em pedaços (stream) para não carregar tudo na memória da função.

export const FORMATO_EXPORTACAO = 'htai-exportacao-v1'
export const TAMANHO_PAGINA = 1000

/** Colunas que nunca saem na exportação (segredos que por engano estejam numa tabela de dados). */
const COLUNA_SECRETA = /(token|secret|segredo|senha|password|api_?key|chave_?privada|private_?key)/i

export function colunaSecreta(nome: string): boolean {
  return COLUNA_SECRETA.test(nome)
}

export function limparLinha(linha: Record<string, unknown>): Record<string, unknown> {
  const saida: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(linha)) if (!colunaSecreta(k)) saida[k] = v
  return saida
}

export interface TabelaExportavel {
  tabela: string
  ordem: string | null
}

export interface ExportarDeps {
  empresaId: string
  agora: () => Date
  /** Lista de tabelas (RPC htai_exportar_tabelas). */
  tabelas(): Promise<TabelaExportavel[]>
  /** Uma página de linhas da empresa (service_role, filtrada por tenant_id). */
  pagina(t: TabelaExportavel, de: number, ate: number): Promise<Record<string, unknown>[]>
}

const NOME_TABELA = /^[a-z][a-z0-9_]{0,62}$/

/**
 * Gera o JSON da exportação aos pedaços. Uma tabela que falha não derruba a
 * exportação: entra em `avisos` e as outras seguem.
 */
export async function* gerarExportacao(deps: ExportarDeps): AsyncGenerator<string> {
  const avisos: string[] = []
  yield `{"formato":${JSON.stringify(FORMATO_EXPORTACAO)},"app":"omnx-desk",` +
    `"gerado_em":${JSON.stringify(deps.agora().toISOString())},"empresa_id":${JSON.stringify(deps.empresaId)},"tabelas":{`
  const lista = (await deps.tabelas()).filter((t) => NOME_TABELA.test(t.tabela))
  let primeiraTabela = true
  for (const t of lista) {
    yield `${primeiraTabela ? '' : ','}${JSON.stringify(t.tabela)}:[`
    primeiraTabela = false
    let primeiraLinha = true
    try {
      for (let de = 0; ; de += TAMANHO_PAGINA) {
        const linhas = await deps.pagina(t, de, de + TAMANHO_PAGINA - 1)
        for (const linha of linhas) {
          yield `${primeiraLinha ? '' : ','}${JSON.stringify(limparLinha(linha))}`
          primeiraLinha = false
        }
        if (linhas.length < TAMANHO_PAGINA) break
      }
    } catch {
      avisos.push(`Não foi possível ler a tabela ${t.tabela}; as linhas acima dela podem estar incompletas.`)
    }
    yield ']'
  }
  if (lista.some((t) => !t.ordem)) {
    avisos.push('Algumas tabelas não têm coluna de ordem; se o app estiver em uso durante a exportação, gere de novo.')
  }
  avisos.push('Arquivos (anexos, contratos, comprovantes) continuam no Storage do seu projeto Supabase; aqui ficam os caminhos.')
  yield `},"avisos":${JSON.stringify(avisos)}}`
}

/** Junta o gerador num stream de bytes para a Response. */
export function streamDaExportacao(gerador: AsyncGenerator<string>): ReadableStream<Uint8Array> {
  const enc = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await gerador.next()
        if (done) controller.close()
        else controller.enqueue(enc.encode(value))
      } catch (e) {
        controller.error(e)
      }
    },
    async cancel() {
      await gerador.return(undefined)
    },
  })
}

export function nomeDoArquivo(agora: Date): string {
  return `dados-desk-${agora.toISOString().slice(0, 10)}.json`
}
