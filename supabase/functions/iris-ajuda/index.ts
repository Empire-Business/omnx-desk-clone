import { criarHandlerAjuda } from '../_shared/iris-ajuda-http.ts'

// Apenas JWT de usuário. Nunca usa service_role nem o agente operacional.
// Ajuda tem configuração própria e mais barata que a Íris operacional
// (avaliação de 07/11/2026: Sonnet 5.5 com esforço baixo respondeu as mesmas 12
// perguntas com a mesma qualidade do Opus 5.5 médio, a ~40% do custo e ~2x mais
// rápido). Trocável por IRIS_AJUDA_MODELO / IRIS_AJUDA_ESFORCO sem novo deploy.
Deno.serve(criarHandlerAjuda({ env: {
  supabaseUrl: Deno.env.get('SUPABASE_URL') ?? '',
  anonKey: Deno.env.get('SUPABASE_ANON_KEY') ?? '',
  apiKey: Deno.env.get('OPENROUTER_API_KEY'),
  modelo: Deno.env.get('IRIS_AJUDA_MODELO')?.trim() || 'anthropic/claude-sonnet-5.5',
  esforco: Deno.env.get('IRIS_AJUDA_ESFORCO')?.trim() || 'low',
} }))
