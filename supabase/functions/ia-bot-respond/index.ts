import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const openrouterKey = Deno.env.get('OPENROUTER_API_KEY')!

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const jwt = authHeader.replace('Bearer ', '')
  const supabase = createClient(supabaseUrl, supabaseKey)

  // In auto_mode (called by webhook with service role key), skip user validation
  // The service role key is validated by Supabase's edge function infrastructure
  let userId: string | null = null
  if (jwt === supabaseKey) {
    // Called internally with service role key — auto_mode from webhook
    userId = null
  } else {
    const { data: { user }, error: authError } = await supabase.auth.getUser(jwt)
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    userId = user.id
  }

  let body: {
    bot_id: string
    message: string
    conversation_id?: string
    test_mode?: boolean
    auto_mode?: boolean
  }

  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { bot_id, message, conversation_id, test_mode = false, auto_mode = false } = body

  if (!bot_id || !message) {
    return new Response(JSON.stringify({ error: 'bot_id and message are required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { data: bot, error: botError } = await supabase
    .from('ia_bots')
    .select('id, nome, modelo_openrouter, system_prompt, temperatura')
    .eq('id', bot_id)
    .single()

  if (botError || !bot) {
    return new Response(JSON.stringify({ error: 'Bot not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { data: documents } = await supabase
    .from('ia_bot_documents')
    .select('conteudo, titulo')
    .eq('bot_id', bot_id)

  const docsContext = documents && documents.length > 0
    ? '\n\n---\nDocumentos de referência:\n' +
      documents.map((d: { titulo: string; conteudo: string }) => `### ${d.titulo}\n${d.conteudo}`).join('\n\n')
    : ''

  // ── Load bot tools (ferramentas) ────────────────────────────────────────
  const { data: botFull } = await supabase
    .from('ia_bots')
    .select('ferramentas')
    .eq('id', bot_id)
    .single()

  const ferramentas = (botFull?.ferramentas ?? {}) as Record<string, { enabled: boolean; config?: Record<string, string> }>
  const enabledTools = Object.entries(ferramentas).filter(([, v]) => v.enabled).map(([k]) => k)

  let toolsPrompt = ''
  if (enabledTools.length > 0) {
    const toolDescriptions: Record<string, string> = {
      consultar_entrega: 'Para consultar o status de uma entrega, responda com [TOOL:consultar_entrega:NUMERO_TELEFONE_OU_NOME_CLIENTE]. Substitua pelo dado do cliente.',
      transferir_departamento: 'Para transferir a conversa para um departamento humano, responda com [TOOL:transferir_departamento]. A conversa será transferida automaticamente.',
      agendar_callback: 'Para agendar um callback (ligação de retorno), responda com [TOOL:agendar_callback:HORARIO_PREFERIDO]. Substitua pelo horário solicitado pelo cliente.',
      consultar_faq: 'Para buscar respostas em nossa base de conhecimento (FAQ), responda com [TOOL:consultar_faq:TERMO_DE_BUSCA]. Substitua pelo tema da pergunta.',
      encerrar_conversa: 'Para encerrar a conversa após o atendimento, responda com [TOOL:encerrar_conversa].',
    }
    const activeDescriptions = enabledTools
      .map(t => toolDescriptions[t])
      .filter(Boolean)
      .join('\n')
    toolsPrompt = `\n\n---\nFerramentas disponíveis:\nVocê pode executar ações usando comandos especiais. Inclua o comando no final da sua resposta quando apropriado.\n${activeDescriptions}`
  }

  const systemPrompt = (bot.system_prompt ?? '') + docsContext + toolsPrompt

  type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }
  const messages: ChatMessage[] = [{ role: 'system', content: systemPrompt }]

  if (conversation_id) {
    const { data: history } = await supabase
      .from('chat_messages')
      .select('role, conteudo')
      .eq('conversation_id', conversation_id)
      .order('criado_em', { ascending: true })
      .limit(10)

    for (const msg of history ?? []) {
      messages.push({
        role: msg.role as 'user' | 'assistant',
        content: msg.conteudo,
      })
    }
  }

  messages.push({ role: 'user', content: message })

  const startTime = Date.now()

  const openrouterRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openrouterKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: bot.modelo_openrouter,
      messages,
      temperature: bot.temperatura ?? 0.7,
    }),
  })

  if (!openrouterRes.ok) {
    const errorText = await openrouterRes.text()
    return new Response(JSON.stringify({ error: 'OpenRouter error', detail: errorText }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const completion = await openrouterRes.json()
  let responseText: string = completion.choices?.[0]?.message?.content ?? ''
  const tokensInput: number = completion.usage?.prompt_tokens ?? 0
  const tokensOutput: number = completion.usage?.completion_tokens ?? 0
  const duration = Date.now() - startTime

  // ── Process tool calls from LLM response ──────────────────────────────
  const toolPattern = /\[TOOL:(\w+)(?::([^\]]*))?\]/g
  let toolMatch: RegExpExecArray | null
  let toolExecuted = false
  let escalada = false

  while ((toolMatch = toolPattern.exec(responseText)) !== null) {
    const toolName = toolMatch[1]
    const toolArg = toolMatch[2] ?? ''

    // Only process if tool is enabled
    if (!enabledTools.includes(toolName)) continue

    try {
      switch (toolName) {
        case 'consultar_entrega': {
          // Query entregas table for the client
          const searchTerm = toolArg.trim()
          if (searchTerm && conversation_id) {
            const { data: entregas } = await supabase
              .from('entregas')
              .select('titulo, status, data_entrega')
              .or(`client_nome.ilike.%${searchTerm}%,client_telefone.ilike.%${searchTerm}%`)
              .limit(3)
            if (entregas && entregas.length > 0) {
              const statusList = entregas.map((e: { titulo: string; status: string; data_entrega: string | null }) =>
                `- ${e.titulo}: ${e.status}${e.data_entrega ? ` (entrega: ${e.data_entrega})` : ''}`
              ).join('\n')
              responseText = responseText.replace(toolMatch[0], '').trim()
              responseText += `\n\nStatus das entregas encontradas:\n${statusList}`
            } else {
              responseText = responseText.replace(toolMatch[0], '').trim()
              responseText += '\n\nNão encontrei entregas para esse cliente.'
            }
          }
          toolExecuted = true
          break
        }

        case 'transferir_departamento': {
          if (conversation_id) {
            const deptConfig = ferramentas.transferir_departamento?.config?.department_id
            const updatePayload: Record<string, unknown> = {
              status: 'aberta',
              agente_id: null,
              atualizado_em: new Date().toISOString(),
            }
            if (deptConfig) updatePayload.department_id = deptConfig

            await supabase
              .from('chat_conversations')
              .update(updatePayload)
              .eq('id', conversation_id)

            responseText = responseText.replace(toolMatch[0], '').trim()
            escalada = true
          }
          toolExecuted = true
          break
        }

        case 'agendar_callback': {
          if (conversation_id) {
            await supabase.from('notifications').insert({
              tipo: 'callback',
              titulo: `Callback solicitado: ${toolArg || 'sem horário definido'}`,
              descricao: `Conversa ${conversation_id} - cliente solicitou callback`,
              lida: false,
            })
            responseText = responseText.replace(toolMatch[0], '').trim()
          }
          toolExecuted = true
          break
        }

        case 'consultar_faq': {
          const searchQuery = toolArg.trim()
          if (searchQuery) {
            const { data: faqs } = await supabase
              .from('chat_quick_replies')
              .select('titulo, conteudo')
              .ilike('conteudo', `%${searchQuery}%`)
              .limit(3)
            if (faqs && faqs.length > 0) {
              const faqText = faqs.map((f: { titulo: string; conteudo: string }) =>
                `${f.titulo}: ${f.conteudo}`
              ).join('\n\n')
              responseText = responseText.replace(toolMatch[0], '').trim()
              responseText += `\n\n${faqText}`
            } else {
              responseText = responseText.replace(toolMatch[0], '').trim()
            }
          }
          toolExecuted = true
          break
        }

        case 'encerrar_conversa': {
          if (conversation_id) {
            await supabase
              .from('chat_conversations')
              .update({
                status: 'encerrada',
                encerrada_em: new Date().toISOString(),
                atualizado_em: new Date().toISOString(),
              })
              .eq('id', conversation_id)
            responseText = responseText.replace(toolMatch[0], '').trim()
          }
          toolExecuted = true
          break
        }
      }
    } catch (toolErr) {
      console.error(`Tool ${toolName} error:`, toolErr)
    }
  }

  if (!test_mode && !auto_mode) {
    // Manual test from playground — insert both user message and bot response
    if (conversation_id) {
      // Sem sessão de usuário, o banco não resolve o tenant sozinho quando há mais
      // de uma empresa cadastrada — ele vem da conversa.
      const { data: convTenant } = await supabase
        .from('chat_conversations')
        .select('tenant_id')
        .eq('id', conversation_id)
        .single()
      const tenant_id = convTenant?.tenant_id ?? null

      await supabase.from('chat_messages').insert([
        { tenant_id, conversation_id, conteudo: message, tipo: 'texto', enviado_por_agente: false, lida: true },
        { tenant_id, conversation_id, conteudo: responseText, tipo: 'texto', enviado_por_agente: false, enviado_por_ia: true, lida: true },
      ])
    }
  }

  // Always log execution (except in test_mode)
  if (!test_mode) {
    await supabase.from('ia_bot_execution_logs').insert({
      bot_id,
      conversation_id: conversation_id ?? null,
      tokens_input: tokensInput,
      tokens_output: tokensOutput,
      escalada,
      erro: null,
    })
  }

  return new Response(
    JSON.stringify({ response: responseText, tokens_input: tokensInput, tokens_output: tokensOutput }),
    { headers: { 'Content-Type': 'application/json' } }
  )
})
