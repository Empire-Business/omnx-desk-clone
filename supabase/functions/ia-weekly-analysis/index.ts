import { servirComLicenca } from '../_shared/htai-licenca.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

servirComLicenca(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const openrouterKey = (Deno.env.get('OPENROUTER_API_KEY') ?? '').trim()
    if (!openrouterKey) {
      return new Response(JSON.stringify({ error: 'OPENROUTER_API_KEY not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let body: any = {}
    try { body = await req.json() } catch { /* */ }

    const now = new Date()
    let weekStart: Date, weekEnd: Date, semanaInicio: string

    if (body.start_date && body.end_date) {
      weekStart = new Date(body.start_date + 'T00:00:00Z')
      weekEnd = new Date(body.end_date + 'T23:59:59Z')
      semanaInicio = body.start_date
    } else {
      // Default: últimos 7 dias rolando, semana_inicio = data execução
      weekEnd = new Date(now)
      weekStart = new Date(now)
      weekStart.setUTCDate(weekStart.getUTCDate() - 7)
      semanaInicio = now.toISOString().slice(0, 10)
    }

    console.log(`Brand consulting analysis: ${semanaInicio} (${weekStart.toISOString()} → ${weekEnd.toISOString()})`)

    const { data: estrategistas, error: estErr } = await supabase
      .from('users')
      .select('id, nome')
      .eq('perfil', 'estrategista')
      .eq('ativo', true)
    if (estErr) throw estErr

    const { data: allClients } = await supabase.from('clients').select('id, nome')
    const clientNameMap: Record<string, string> = {}
    for (const c of allClients ?? []) clientNameMap[c.id] = c.nome

    let processed = 0, skipped = 0, errors = 0
    const errorDetails: string[] = []

    for (const est of estrategistas ?? []) {
      // Fonte 1: clientes formalmente atribuídos a este estrategista (client_assignments)
      const { data: assignments } = await supabase
        .from('client_assignments')
        .select('client_id')
        .eq('user_id', est.id)
        .eq('tipo', 'estrategista')
        .eq('ativo', true)
      const assignedClientIds = (assignments ?? []).map(a => a.client_id)

      // Contatos do WhatsApp linkados a esses clientes
      let contactIdsFromAssignments: string[] = []
      if (assignedClientIds.length > 0) {
        const { data: contacts } = await supabase
          .from('chat_contacts')
          .select('id')
          .in('client_id', assignedClientIds)
        contactIdsFromAssignments = (contacts ?? []).map(c => c.id)
      }

      // Conversas via assignments (cliente cadastrado) — sem filtro de agente_id
      const { data: convsByClient } = contactIdsFromAssignments.length > 0
        ? await supabase
            .from('chat_conversations')
            .select(`id, status, sentimento, is_group, chat_contacts(id, nome, numero_whatsapp, client_id)`)
            .in('contact_id', contactIdsFromAssignments)
            .gte('atualizado_em', weekStart.toISOString())
            .lt('atualizado_em', weekEnd.toISOString())
        : { data: [] as any[] }

      // Fonte 2 (legado): conversas onde o estrategista assumiu manualmente (agente_id)
      const { data: convsByAgent, error: convErr } = await supabase
        .from('chat_conversations')
        .select(`id, status, sentimento, is_group, chat_contacts(id, nome, numero_whatsapp, client_id)`)
        .eq('agente_id', est.id)
        .gte('atualizado_em', weekStart.toISOString())
        .lt('atualizado_em', weekEnd.toISOString())

      if (convErr) {
        errorDetails.push(`Conv error ${est.nome}: ${JSON.stringify(convErr)}`)
        errors++
        continue
      }

      // União dedup por id
      const convMap: Record<string, any> = {}
      for (const c of convsByClient ?? []) convMap[c.id] = c
      for (const c of convsByAgent ?? []) convMap[c.id] = c
      const conversations = Object.values(convMap)

      if (!conversations || conversations.length === 0) { skipped++; continue }

      const contactGroups: Record<string, {
        contactId: string; contactNome: string; clientId: string | null; clientNome: string | null; convIds: string[]; isGroup: boolean
      }> = {}

      for (const conv of conversations) {
        const contact = (conv as any).chat_contacts
        if (!contact) continue
        const cid = contact.id
        if (!contactGroups[cid]) {
          contactGroups[cid] = {
            contactId: cid,
            contactNome: contact.nome ?? contact.numero_whatsapp ?? 'Contato',
            clientId: contact.client_id ?? null,
            clientNome: contact.client_id ? (clientNameMap[contact.client_id] ?? null) : null,
            convIds: [],
            isGroup: (conv as any).is_group === true,
          }
        }
        contactGroups[cid].convIds.push(conv.id)
      }

      for (const group of Object.values(contactGroups)) {
        const reportClientId = group.clientId
        const reportContactId = group.contactId
        const reportClientNome = group.clientNome ?? group.contactNome

        const existingQuery = supabase
          .from('chat_weekly_reports')
          .select('id')
          .eq('semana_inicio', semanaInicio)
          .eq('estrategista_id', est.id)
        const { data: existing } = reportClientId
          ? await existingQuery.eq('client_id', reportClientId).maybeSingle()
          : await existingQuery.eq('contact_id', reportContactId).maybeSingle()

        if (existing) { skipped++; continue }

        const { data: messages } = await supabase
          .from('chat_messages')
          .select('conteudo, tipo, enviado_por_agente, criado_em')
          .in('conversation_id', group.convIds)
          .in('tipo', ['texto'])
          .order('criado_em', { ascending: true })
          .limit(400)

        if (!messages || messages.length === 0) { skipped++; continue }

        const transcript = messages.map((m: any) => {
          // Em grupos, o webhook já prefixa o conteúdo com [nome_remetente]
          // então apenas distinguimos estrategista vs lado-cliente.
          const role = m.enviado_por_agente
            ? `[ESTRATEGISTA ${est.nome}]`
            : group.isGroup
              ? `[LADO CLIENTE]`
              : `[CLIENTE ${reportClientNome}]`
          const time = new Date(m.criado_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
          return `${time} ${role}: ${m.conteudo}`
        }).join('\n')

        const totalMsgs = messages.length
        const msgsClient = messages.filter((m: any) => !m.enviado_por_agente).length
        const msgsEst = totalMsgs - msgsClient
        const groupContextNote = group.isGroup
          ? `\n\nIMPORTANTE: Esta é uma conversa de GRUPO no WhatsApp entre o estrategista e o cliente "${reportClientNome}" + equipe do cliente. Mensagens marcadas como [LADO CLIENTE] vêm prefixadas com o nome de quem falou (ex.: "[Maria] tudo bem?"). Considere todos os participantes não-estrategistas como parte do "lado cliente" — analise como uma única relação estrategista × cliente, mas reconheça quando diferentes pessoas da equipe do cliente trazem perspectivas distintas (ex.: dono indeciso, gestor querendo executar).`
          : ''

        const systemPrompt = `Você é um analista sênior de consultoria de marca. Analisa conversas entre um estrategista (consultor de marca) e seu cliente, gerando um diagnóstico acionável que ajuda o estrategista a melhorar e a liderança a entender o estado de cada relacionamento.

Contexto: o estrategista acompanha o cliente e atende seus pedidos por WhatsApp. O trabalho dele inclui orientar, esclarecer dúvidas, combinar prazos e acompanhar a execução do que foi combinado. O cliente está em acompanhamento contínuo.

Você deve ler a conversa e extrair sinais reais — não inventar. Se não houver sinal suficiente para um campo, deixe como string vazia ou array vazio.

Retorne SOMENTE um JSON válido (sem markdown, sem comentários) com esta estrutura exata:

{
  "resumo": "resumo executivo em 2-3 frases sobre o estado do relacionamento e da marca do cliente",
  "nota_detalhada": "análise narrativa em 4-6 frases: o que está sendo trabalhado, evolução real, riscos concretos, oportunidades. Cite trechos/exemplos quando possível.",

  "clareza_posicionamento": "baixa" | "media" | "alta",
  "nivel_execucao": "baixo" | "medio" | "alto",
  "nivel_confianca_cliente": "baixo" | "medio" | "alto",
  "risco_abandono": "baixo" | "medio" | "alto",
  "qualidade_consultoria_estrategista": <inteiro de 1 a 5>,
  "ia_score": <inteiro de 0 a 100, sua leitura geral da saúde do relacionamento>,
  "sentimento_geral": "positivo" | "neutro" | "negativo",

  "temas_tratados": ["tema 1", "tema 2", ...],
  "direcionamentos_dados": ["orientação concreta dada pelo estrategista 1", ...],
  "entregaveis_pendentes": ["pendência 1 (de quem)", ...],
  "bloqueios": ["bloqueio identificado 1", ...],

  "topicos": ["tópico debatido 1", ...],
  "objecoes": ["resistência ou objeção 1", ...],
  "como_lidar": ["dica para a objeção 1", ...],
  "proximos_passos": ["ação concreta recomendada 1", ...],
  "alertas": ["alerta crítico 1", ...],
  "sugestoes_estrategista": ["sugestão prática de melhoria para o estrategista 1", ...]
}

Definições:
- clareza_posicionamento: o cliente sabe quem é como marca, pra quem fala, qual a promessa? alta=sim e bem definido, media=parcial, baixa=ainda buscando.
- nivel_execucao: o cliente está colocando em prática o que foi orientado? alto=executa rápido, medio=executa parcialmente, baixo=fala muito e age pouco.
- nivel_confianca_cliente: o cliente confia nas orientações ou questiona/resiste muito?
- risco_abandono: sinais de que pode esfriar — pouca resposta, postergação, dúvida sobre continuar, hostilidade.
- qualidade_consultoria_estrategista: 1=raso/passivo, 3=cumpre o básico, 5=traz visão de fora, provoca, direciona.
- ia_score: 0=relacionamento rompido, 50=neutro, 100=cliente engajado e marca avançando bem.
- temas_tratados: ex. "prazos", "contrato", "entregas combinadas", "dúvidas de uso", "pagamento", "reunião".
- direcionamentos_dados: ações concretas que o estrategista RECOMENDOU ao cliente.
- entregaveis_pendentes: deixe claro de quem é a pendência. Ex.: "[cliente] enviar os documentos pedidos", "[estrategista] enviar a proposta até sexta".
- bloqueios: o que está travando o avanço. Ex.: "insegurança em aparecer", "indecisão sobre nicho", "falta de tempo do cliente".
- como_lidar deve ter o mesmo número de itens que objecoes.
- sugestoes_estrategista: 2-4 sugestões concretas e práticas para o estrategista melhorar a abordagem com ESTE cliente específico, baseadas no que você observou na conversa. Ex.: "Faça perguntas mais provocativas para forçar o cliente a tomar decisão sobre nicho", "Reduza o tom didático — o cliente já tem maturidade", "Estabeleça prazos curtos para entregas — ele precisa de pressão amigável". Seja específico ao caso, não genérico.

Seja específico, use linguagem direta de negócios, não invente sinais que não estão na conversa.`

        try {
          const aiRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${openrouterKey}`,
              'Content-Type': 'application/json',
              'HTTP-Referer': 'https://omnxdesk.com.br',
              'X-Title': 'OMNX Desk Brand Consulting Analysis',
            },
            body: JSON.stringify({
              model: 'openai/gpt-4o-mini',
              max_tokens: 2500,
              temperature: 0.2,
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: `Cliente: ${reportClientNome}${group.isGroup ? ' (grupo com equipe do cliente)' : ''}\nEstrategista: ${est.nome}\nMensagens lado cliente: ${msgsClient} | mensagens estrategista: ${msgsEst}${groupContextNote}\n\nCONVERSA:\n${transcript.slice(0, 12000)}` },
              ],
            }),
          })

          if (!aiRes.ok) {
            const errText = await aiRes.text()
            errorDetails.push(`OpenRouter ${aiRes.status} for ${est.nome}/${reportClientNome}: ${errText.slice(0, 200)}`)
            errors++
            continue
          }

          const aiData = await aiRes.json()
          const content = aiData.choices?.[0]?.message?.content ?? ''

          let parsed: any = {}
          try {
            parsed = JSON.parse(content.trim())
          } catch {
            const match = content.match(/\{[\s\S]*\}/)
            if (match) {
              try { parsed = JSON.parse(match[0]) } catch { /* */ }
            }
          }

          const allowedTri = (v: unknown, opts: string[]) =>
            typeof v === 'string' && opts.includes(v) ? v : null

          const { error: upsertErr } = await supabase
            .from('chat_weekly_reports')
            .insert({
              semana_inicio: semanaInicio,
              estrategista_id: est.id,
              estrategista_nome: est.nome,
              client_id: reportClientId ?? null,
              contact_id: reportClientId ? null : reportContactId,
              client_nome: reportClientNome,

              resumo: parsed.resumo ?? null,
              nota_detalhada: parsed.nota_detalhada ?? null,

              clareza_posicionamento: allowedTri(parsed.clareza_posicionamento, ['baixa', 'media', 'alta']),
              nivel_execucao: allowedTri(parsed.nivel_execucao, ['baixo', 'medio', 'alto']),
              nivel_confianca_cliente: allowedTri(parsed.nivel_confianca_cliente, ['baixo', 'medio', 'alto']),
              risco_abandono: allowedTri(parsed.risco_abandono, ['baixo', 'medio', 'alto']),
              qualidade_consultoria_estrategista: typeof parsed.qualidade_consultoria_estrategista === 'number'
                ? Math.max(1, Math.min(5, Math.round(parsed.qualidade_consultoria_estrategista)))
                : null,
              ia_score: typeof parsed.ia_score === 'number'
                ? Math.max(0, Math.min(100, Math.round(parsed.ia_score)))
                : null,
              sentimento_geral: allowedTri(parsed.sentimento_geral, ['positivo', 'neutro', 'negativo']) ?? 'neutro',

              temas_tratados: Array.isArray(parsed.temas_tratados) ? parsed.temas_tratados : [],
              direcionamentos_dados: Array.isArray(parsed.direcionamentos_dados) ? parsed.direcionamentos_dados : [],
              entregaveis_pendentes: Array.isArray(parsed.entregaveis_pendentes) ? parsed.entregaveis_pendentes : [],
              bloqueios: Array.isArray(parsed.bloqueios) ? parsed.bloqueios : [],

              topicos: parsed.topicos ?? [],
              objecoes: parsed.objecoes ?? [],
              como_lidar: parsed.como_lidar ?? [],
              proximos_passos: parsed.proximos_passos ?? [],
              alertas: parsed.alertas ?? [],
              sugestoes_estrategista: Array.isArray(parsed.sugestoes_estrategista) ? parsed.sugestoes_estrategista : [],

              total_mensagens: messages.length,
              total_conversas: group.convIds.length,
              is_group: group.isGroup,
            })

          if (upsertErr) {
            errorDetails.push(`Upsert ${est.nome}/${reportClientNome}: ${upsertErr.message}`)
            errors++
          } else {
            processed++
            console.log(`✓ ${est.nome} / ${reportClientNome} (${messages.length} msgs)`)
          }

          await new Promise(r => setTimeout(r, 800))
        } catch (e) {
          errorDetails.push(`Exception ${est.nome}/${reportClientNome}: ${String(e)}`)
          errors++
        }
      }
    }

    return new Response(
      JSON.stringify({ ok: true, semana: semanaInicio, processed, skipped, errors, errorDetails }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    console.error('Fatal error:', err)
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
