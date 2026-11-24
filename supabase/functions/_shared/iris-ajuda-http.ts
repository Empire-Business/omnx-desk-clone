import { encontrarAssuntosAjuda, LIMITE_PERGUNTA_AJUDA, respostaLocalAjuda } from './iris-ajuda-conhecimento.ts'
import { esforcoDaEnv, rodarLoop, type MensagemChat } from './wa-agente-llm.ts'
import { mascararDadosAjuda, promptAjuda, textoSimplesAjuda } from './iris-ajuda-prompt.ts'

type Ambiente = { supabaseUrl: string; anonKey: string; apiKey?: string; modelo?: string; esforco?: string }
type Dependencias = { env: Ambiente; fetchFn?: typeof fetch; agora?: () => number }
const MAX_CORPO = 16_384
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Cache-Control': 'no-store' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

/** Uma instância tem memória própria: este controle NÃO é uma cota distribuída. */
export function criarHandlerAjuda({ env, fetchFn = fetch, agora = Date.now }: Dependencias) {
  const limites = new Map<string, { inicio: number; total: number; ultimo: number; ocupado: boolean }>()
  const remoto = (url: string, headers: Record<string, string>) => fetchFn(url, { headers, signal: AbortSignal.timeout(8_000), redirect: 'error' })
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
    if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405)
    const authorization = req.headers.get('Authorization') ?? ''
    if (!/^Bearer \S+$/.test(authorization)) return json({ error: 'Entre na sua conta para usar a ajuda.' }, 401)
    if (!env.supabaseUrl || !env.anonKey) return json({ error: 'Ajuda indisponível.' }, 503)
    let chaveLimite: string | undefined
    try {
      // Contagem efetiva de bytes, inclusive sem Content-Length, antes do JSON.parse.
      const reader = req.body?.getReader()
      if (!reader) return json({ error: 'Pergunta inválida.' }, 400)
      const partes: Uint8Array[] = []; let tamanho = 0
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        tamanho += value.byteLength
        if (tamanho > MAX_CORPO) { await reader.cancel(); return json({ error: 'Pergunta muito longa.' }, 413) }
        partes.push(value)
      }
      const bytes = new Uint8Array(tamanho); let deslocamento = 0
      for (const parte of partes) { bytes.set(parte, deslocamento); deslocamento += parte.byteLength }
      let body: unknown
      try { body = JSON.parse(new TextDecoder().decode(bytes)) } catch { return json({ error: 'Pergunta inválida.' }, 400) }
      if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'Pergunta inválida.' }, 400)
      const entrada = body as Record<string, unknown>
      const pergunta = typeof entrada.pergunta === 'string' ? entrada.pergunta.trim() : ''
      if (!pergunta || pergunta.length > LIMITE_PERGUNTA_AJUDA) return json({ error: 'Escreva uma pergunta com até 1.000 caracteres.' }, 400)
      const historico: MensagemChat[] = []
      if (entrada.historico !== undefined) {
        if (!Array.isArray(entrada.historico) || entrada.historico.length > 6) return json({ error: 'Histórico inválido.' }, 400)
        for (const item of entrada.historico) {
          if (!item || !['user', 'assistant'].includes(item.role) || typeof item.content !== 'string' || item.content.length > 1500) return json({ error: 'Histórico inválido.' }, 400)
          historico.push({ role: item.role, content: item.content }) // Descarta system, tools, nomes e demais campos.
        }
      }
      const headers = { Authorization: authorization, apikey: env.anonKey }
      const auth = await remoto(`${env.supabaseUrl}/auth/v1/user`, headers)
      if (!auth.ok) return json({ error: 'Sua sessão expirou. Entre novamente.' }, 401)
      const identidade = await auth.json()
      if (typeof identidade?.id !== 'string') return json({ error: 'Sessão inválida.' }, 401)
      const perfilRes = await remoto(`${env.supabaseUrl}/rest/v1/users?id=eq.${encodeURIComponent(identidade.id)}&select=id,ativo,perfil,tenant_id&limit=1`, headers)
      if (!perfilRes.ok) return json({ error: 'Não foi possível conferir seu acesso.' }, 403)
      const perfis = await perfilRes.json(); const perfil = Array.isArray(perfis) ? perfis[0] : null
      const equipe = ['admin', 'gerente', 'estrategista', 'atendimento', 'admin_cobranca', 'agente_chat', 'agente_cobranca']
      if (perfil?.id !== identidade.id || perfil?.ativo !== true || !equipe.includes(perfil.perfil) || typeof perfil.tenant_id !== 'string' || !perfil.tenant_id) return json({ error: 'A ajuda interna está disponível para a equipe ativa.' }, 403)
      // Contexto do navegador só restringe: jamais determina identidade ou empresa.
      // Impede enviar histórico anterior à IA após uma troca de conta/tenant.
      const contexto = entrada.contexto as { usuario?: unknown; empresa?: unknown } | undefined
      if (!contexto || contexto.usuario !== identidade.id || contexto.empresa !== perfil.tenant_id) return json({ error: 'Seu acesso mudou. Feche a ajuda e atualize a página.' }, 409)
      const tema = typeof entrada.tema === 'string' ? entrada.tema.slice(0, 60) : undefined
      // Continuação ("e onde fica isso?") herda o assunto da última pergunta da pessoa.
      const anteriores = historico.filter((m) => m.role === 'user').map((m) => String(m.content ?? '')).slice(-2)
      const local = respostaLocalAjuda(pergunta, tema, anteriores)
      // Sem chave, sem assunto no manual, pedido de dado ou de mudar as regras: responde sem IA.
      if (!env.apiKey?.trim() || !local.fontes.length || local.motivo) return json(local)
      const now = agora()
      for (const [key, limite] of limites) if (!limite.ocupado && now - limite.inicio >= 86_400_000) limites.delete(key)
      const key = `${perfil.tenant_id}:${identidade.id}`
      const limite = limites.get(key) ?? { inicio: now, total: 0, ultimo: -Infinity, ocupado: false }
      if (limite.ocupado || now - limite.ultimo < 12_000 || limite.total >= 50 || (!limites.has(key) && limites.size >= 2000)) return json({ error: 'Aguarde um pouco antes de perguntar novamente.' }, 429)
      limite.total++; limite.ultimo = now; limite.ocupado = true; limites.set(key, limite); chaveLimite = key
      const secoes = encontrarAssuntosAjuda(pergunta, tema, anteriores)
      const sistema = promptAjuda({ secoes, perfil: String(perfil.perfil) })
      // O cliente existente registra erros de provedor; remove o corpo antes de ele o observar.
      const fetchSeguro: typeof fetch = async (input, init) => {
        const response = await fetchFn(input, init)
        return response.ok ? response : new Response('{}', { status: response.status })
      }
      const r = await rodarLoop({ apiKey: env.apiKey, modelo: env.modelo, esforco: esforcoDaEnv(env.esforco), sistema,
        mensagens: [...historico.map((m) => ({ role: m.role, content: mascararDadosAjuda(String(m.content ?? '')) })), { role: 'user', content: mascararDadosAjuda(pergunta) }], ferramentas: [], executar: async () => 'Ferramentas indisponíveis.',
        maxPassos: 1, prazoMs: 35_000, timeoutChamadaMs: 30_000, titulo: 'OMNX Desk Ajuda', fetchFn: fetchSeguro })
      const texto = r.ok && r.texto ? textoSimplesAjuda(r.texto).slice(0, 6000) : ''
      if (!texto) return json(local)
      return json({ modo: 'ia', texto, fontes: local.fontes })
    } catch {
      return json({ error: 'Não foi possível consultar a ajuda agora.' }, 503)
    } finally {
      if (chaveLimite) { const limite = limites.get(chaveLimite); if (limite) limite.ocupado = false }
    }
  }
}
