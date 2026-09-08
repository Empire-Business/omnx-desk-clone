import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/**
 * Leitura do comprovante de pagamento por IA com visão.
 *
 * Por que existe: a leitura local (tesseract, no navegador) lê texto, mas não
 * *entende* o documento. Em 06/08/2026 ela devolveu 0 de 19 — porque a maioria
 * dos comprovantes não é print de PIX, e sim print de checkout, e-mail de
 * confirmação ou tela de plataforma, onde o nome de quem pagou não vem depois de
 * um rótulo "Pagador:". A heurística de rótulo não tinha o que casar.
 *
 * Um modelo com visão olha a imagem inteira e responde "quem pagou isto?" —
 * inclusive quando a resposta está no meio de uma frase ("Olá, João, seu
 * pagamento foi aprovado").
 *
 * Onde roda: no servidor, de propósito. O arquivo é baixado com service role, a
 * chave da IA nunca chega ao navegador, e não há limite de memória do celular de
 * quem está conferindo.
 *
 * O que devolve: sempre um palpite com confiança declarada. `alta` grava
 * sozinho; `media`/`baixa` volta para a tela como sugestão, porque identificador
 * errado é pior que identificador vazio — ele engana quem confere o extrato.
 */

/**
 * A lista de cabeçalhos precisa incluir `x-client-info` e `apikey`: o cliente
 * Supabase manda os dois em toda chamada, e o navegador barra a requisição
 * inteira na verificação prévia se algum não estiver autorizado. O sintoma é
 * "Failed to send a request to the Edge Function" — que parece função fora do ar,
 * mas é o navegador nem tendo chegado a chamar.
 */
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const BUCKET = 'vendas-comprovantes'
const MODELO = 'anthropic/claude-sonnet-4-6'
/** Acima disto o arquivo não vira base64 sem estourar a memória da function. */
const TAMANHO_MAX = 8 * 1024 * 1024

const PROMPT = `Você lê comprovantes de pagamento brasileiros e responde APENAS JSON.

Sua tarefa: identificar o NOME DE QUEM PAGOU — a pessoa ou empresa cujo dinheiro
saiu. É o nome que aparecerá no extrato bancário de quem recebeu.

O documento pode ser:
- comprovante de PIX/TED/boleto (procure "pagador", "origem", "debitado de", "de");
- print de checkout de plataforma (Hotmart, Kiwify, Stripe, Asaas...) — o pagador
  é o comprador/aluno;
- e-mail de confirmação de compra — o pagador é a quem o e-mail se dirige;
- print de tela de banco ou de aplicativo.

REGRAS:
1. NUNCA devolva o nome de quem RECEBEU (favorecido, beneficiário, destinatário)
   nem o nome da empresa vendedora, do banco ou da plataforma.
2. Se o pagador for pessoa física, devolva o nome completo como está escrito.
3. **O pagador pode ser uma EMPRESA** — "Fulano Consultoria LTDA", "Fulano ME",
   "Beltrano Serviços Eireli". Isso é comum: o cliente paga pelo CNPJ dele.
   Devolva a razão social exatamente como aparece, com LTDA/ME/MEI/EIRELI. Só
   não confunda com a empresa que RECEBEU nem com o banco/plataforma.
4. **Se não houver nome, mas houver o E-MAIL de quem comprou/pagou**, devolva o
   e-mail e marque tipo: "email". Isso é comum em print de checkout, onde só
   aparece o e-mail do comprador. E-mail identifica a pessoa quase tão bem
   quanto o nome — é melhor que campo vazio.
5. Se não houver nem nome nem e-mail do pagador, devolva identificador: null.
   Chutar é pior que admitir que não dá — o campo é conferido contra o extrato.
6. Não devolva e-mail da empresa vendedora, de suporte ou "noreply".
7. confianca: "alta" quando o documento diz explicitamente quem pagou;
   "media" quando você inferiu de contexto (ex.: nome no cabeçalho do e-mail);
   "baixa" quando é palpite fraco.

Responda exatamente neste formato, sem texto em volta:
{"identificador": "Nome Completo ou email" ou null, "tipo": "nome"|"email", "confianca": "alta"|"media"|"baixa", "motivo": "uma frase curta"}`

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

/** ArrayBuffer → base64 em blocos: string gigante de uma vez estoura a pilha. */
function paraBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let bin = ''
  const BLOCO = 0x8000
  for (let i = 0; i < bytes.length; i += BLOCO) {
    bin += String.fromCharCode(...bytes.subarray(i, i + BLOCO))
  }
  return btoa(bin)
}

interface Comprovante {
  storage_path: string
  nome_original?: string
  mime_type?: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const openrouterKey = (Deno.env.get('OPENROUTER_API_KEY') ?? '').trim()
    if (!openrouterKey) return json({ error: 'missing_openrouter_key' }, 500)

    // Quem chama é o usuário logado, com o token dele — a permissão é a mesma da
    // tela de Onboarding. O service role só entra depois, para baixar o arquivo.
    const auth = req.headers.get('authorization') ?? ''
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: auth } },
    })
    const { data: u } = await userClient.auth.getUser()
    if (!u.user) return json({ error: 'unauthorized' }, 401)

    const { data: perfil } = await userClient
      .from('users').select('perfil, tenant_id').eq('id', u.user.id).single()
    if (!perfil || !['admin', 'gerente', 'atendimento'].includes(perfil.perfil as string)) {
      return json({ error: 'forbidden' }, 403)
    }

    const body = await req.json() as { venda_id?: string; gravar?: boolean }
    if (!body.venda_id) return json({ error: 'venda_id_required' }, 400)

    const admin = createClient(supabaseUrl, serviceKey)

    // Filtra pelo tenant de quem chamou: sem isso, o service role leria a venda
    // de qualquer empresa a partir de um id adivinhado.
    const { data: venda } = await admin
      .from('vendas_pendentes')
      .select('id, comprovantes, tenant_id')
      .eq('id', body.venda_id)
      .eq('tenant_id', perfil.tenant_id)
      .single()
    if (!venda) return json({ error: 'venda_nao_encontrada' }, 404)

    const comprovantes = (venda.comprovantes ?? []) as Comprovante[]
    if (comprovantes.length === 0) return json({ error: 'sem_comprovante' }, 400)

    // Tenta um comprovante por vez e para no primeiro que der resposta boa.
    const tentativas: Array<{ arquivo: string; erro?: string; confianca?: string }> = []

    for (const c of comprovantes) {
      const nome = c.nome_original ?? c.storage_path
      const mime = (c.mime_type ?? '').toLowerCase()
      const ehPdf = mime.includes('pdf') || /\.pdf$/i.test(nome)
      const ehImagem = mime.startsWith('image/') || /\.(jpe?g|png|webp|gif|bmp|heic|heif)$/i.test(nome)
      if (!ehPdf && !ehImagem) {
        tentativas.push({ arquivo: nome, erro: 'formato_nao_suportado' })
        continue
      }

      const { data: blob, error: erroDown } = await admin.storage.from(BUCKET).download(c.storage_path)
      if (erroDown || !blob) {
        tentativas.push({ arquivo: nome, erro: 'download_falhou' })
        continue
      }
      if (blob.size > TAMANHO_MAX) {
        tentativas.push({ arquivo: nome, erro: 'arquivo_grande_demais' })
        continue
      }

      const base64 = paraBase64(await blob.arrayBuffer())
      const tipo = ehPdf ? 'application/pdf' : (mime || 'image/png')

      const conteudo = ehPdf
        ? [{ type: 'file', file: { filename: nome, file_data: `data:application/pdf;base64,${base64}` } }]
        : [{ type: 'image_url', image_url: { url: `data:${tipo};base64,${base64}` } }]

      const resposta = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${openrouterKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: MODELO,
          messages: [
            { role: 'system', content: PROMPT },
            { role: 'user', content: [...conteudo, { type: 'text', text: 'Quem pagou? Responda apenas o JSON.' }] },
          ],
          temperature: 0,
          max_tokens: 300,
        }),
      })

      if (!resposta.ok) {
        // O corpo do erro do OpenRouter diz o motivo real (modelo inexistente,
        // crédito acabado, imagem grande demais). Sem ele, `ia_400` não ajuda
        // ninguém a corrigir nada.
        const motivo = (await resposta.text().catch(() => '')).slice(0, 200)
        tentativas.push({ arquivo: nome, erro: `ia_${resposta.status}${motivo ? `: ${motivo}` : ''}` })
        continue
      }

      const completion = await resposta.json()
      const texto: string = completion.choices?.[0]?.message?.content ?? ''
      // O modelo às vezes embrulha o JSON em ```json — pega o primeiro objeto.
      const bruto = texto.match(/\{[\s\S]*\}/)?.[0] ?? ''
      let lido: {
        identificador?: string | null; tipo?: string; confianca?: string; motivo?: string
      } = {}
      try { lido = JSON.parse(bruto) } catch { /* resposta fora do formato */ }

      const cru = (lido.identificador ?? '').toString().trim()
      const confianca = (lido.confianca ?? 'baixa').toString()

      // Print de checkout muitas vezes só traz o e-mail do comprador. Nesse caso
      // gravamos o e-mail com a marca do que ele é — quem confere o extrato
      // precisa saber, na hora, que aquilo não é o nome do titular e que o nome
      // ainda vai ter de ser confirmado de outro jeito.
      const ehEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cru) || lido.tipo === 'email'
      const identificador = cru
        ? (ehEmail ? `${cru} (e-mail — nome não encontrado no comprovante)` : cru)
        : null

      if (identificador) {
        // Só grava sozinho quando a IA diz que o documento é explícito. Com
        // confiança menor, devolve para a tela e a pessoa confirma.
        if (body.gravar !== false && confianca === 'alta') {
          await admin.from('vendas_pendentes')
            .update({ identificador_pagamento: identificador })
            .eq('id', venda.id)
        }
        return json({
          identificador,
          tipo: ehEmail ? 'email' : 'nome',
          confianca,
          motivo: lido.motivo ?? null,
          gravado: body.gravar !== false && confianca === 'alta',
          arquivo: nome,
        })
      }

      tentativas.push({ arquivo: nome, erro: 'nao_identificado', confianca })
    }

    // "Não identifiquei quem pagou" e "a chamada falhou" são coisas diferentes:
    // a primeira é resposta, a segunda é defeito. Quando NENHUMA tentativa
    // chegou a ver o documento, isto volta como erro — senão uma chave inválida
    // apareceria na tela como "os 19 comprovantes estão ilegíveis".
    const nenhumaLeu = tentativas.every((t) => t.erro && t.erro !== 'nao_identificado')
    if (nenhumaLeu && tentativas.length > 0) {
      return json({
        error: tentativas[0].erro,
        detail: tentativas.map((t) => `${t.arquivo}: ${t.erro}`).join(' | ').slice(0, 500),
        identificador: null,
        confianca: 'baixa',
        gravado: false,
        tentativas,
      })
    }

    return json({ identificador: null, confianca: 'baixa', gravado: false, tentativas })
  } catch (e) {
    return json({ error: 'erro_inesperado', detail: e instanceof Error ? e.message : String(e) }, 500)
  }
})
