// Ponte omnx-desk → GHL — aplica uma tag de campanha num lote de contatos.
//
// O Desk não dispara mensagem nenhuma: ele entrega público etiquetado, e o workflow
// do GHL ("Contact Tag Added") é quem manda a mensagem. Esta função é a única peça
// que realmente escreve no CRM.
//
// Duas fontes, cada uma para o que sabe melhor:
//   - o ESPELHO local (tabela contatos) sabe quando um telefone tem MAIS DE UM
//     cadastro no CRM. A busca da API não sabe: ela devolve um só e esconde o resto.
//   - a API do GHL é a verdade sobre existir AGORA. O espelho atrasa nos dois
//     sentidos: falta contato criado ontem e sobra contato apagado semana passada.
//
// Por isso a classificação usa as duas: o espelho detecta ambiguidade, a API confirma
// existência. Um contato do espelho que a API não reconhece mais é tratado como
// ausente — senão a tag falharia calada e a pessoa nunca receberia a mensagem.
//
// O match é pela CHAVE CANÔNICA (DDD + últimos 8 dígitos), nunca pela string cheia:
// o mesmo celular está gravado com e sem o nono dígito entre as bases.
//   1 no espelho  → confirma na API e aplica só a tag (não altera nome/e-mail/telefone)
//   0 no espelho  → procura na API; só cria se não achar E `criar_novos` for true
//   >1 no espelho → AMBÍGUO: não toca e devolve na lista para resolução manual
//
// Autenticação: secret por tenant (digest SHA-256 → workspace), igual às demais crm-*.
// Sem workspace resolvido é 401 — sem ele não há credencial GHL para usar (fail-closed).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1';
import { createRequestId, logSafeError } from '../_shared/safe-error.ts';
import { resolveGhlCredentials } from '../_shared/resolve-workspace-credentials.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || Deno.env.get('SB_URL') || '';
const SUPABASE_SERVICE_KEY =
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SB_SERVICE_ROLE_KEY') || '';

const GHL_API_BASE = 'https://services.leadconnectorhq.com';
const GHL_VERSION = '2021-07-28';

/** Teto por requisição. O Desk já lotifica em 200; isto é a trava do lado de cá. */
const MAX_CONTATOS = 500;
/** Chamadas simultâneas ao GHL. O limite dele é 100 req/10s — 6 em paralelo fica folgado. */
const CONCORRENCIA = 6;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'x-omnx-desk-secret, x-empiredesk-secret, authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function extractSecret(req: Request): string | null {
  const omnx = req.headers.get('x-omnx-desk-secret');
  if (omnx && omnx.length > 0) return omnx;
  const legacy = req.headers.get('x-empiredesk-secret');
  if (legacy && legacy.length > 0) return legacy;
  const auth = req.headers.get('authorization');
  const bearer = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
  return bearer && bearer.length > 0 ? bearer : null;
}

async function sha256Hex(s: string): Promise<string> {
  const bytes = new TextEncoder().encode(s);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function ghlHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    Version: GHL_VERSION,
    'Content-Type': 'application/json',
  };
}

// ---------------------------------------------------------------------------
// Telefone — mesma lógica de src/lib/telefone.ts no Desk e de chave_telefone_br
// no banco. Duplicada de propósito: o servidor não confia na chave que o cliente
// mandou, ele recalcula a partir do telefone.
// ---------------------------------------------------------------------------

function normalizaTelefoneBR(bruto: unknown): string {
  if (typeof bruto !== 'string' || !bruto) return '';
  const digitos = bruto.replace(/\D/g, '').replace(/^0+/, '');
  if (!digitos) return '';
  if (digitos.startsWith('55') && (digitos.length === 12 || digitos.length === 13)) return `+${digitos}`;
  if (digitos.length === 10 || digitos.length === 11) return `+55${digitos}`;
  return `+${digitos}`;
}

/** DDD + últimos 8 dígitos. Vazio quando não é telefone brasileiro plausível. */
function chaveTelefone(bruto: unknown): string {
  const telefone = normalizaTelefoneBR(bruto);
  if (!telefone) return '';
  const d = telefone.replace(/\D/g, '');
  if (!d.startsWith('55') || (d.length !== 12 && d.length !== 13)) return '';
  const nacional = d.slice(2);
  return nacional.slice(0, 2) + nacional.slice(-8);
}

/** Formato em que contatos NOVOS são gravados: E.164 completo. */
function paraE164(bruto: unknown): string {
  const t = normalizaTelefoneBR(bruto);
  const d = t.replace(/\D/g, '');
  if (!d.startsWith('55') || (d.length !== 12 && d.length !== 13)) return '';
  return `+${d}`;
}

/** A tag viaja como veio do Desk, mas é revalidada aqui — ela cria registro no CRM. */
function normalizaTag(bruto: unknown): string {
  if (typeof bruto !== 'string') return '';
  return bruto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

// ---------------------------------------------------------------------------

interface ContatoEntrada {
  telefone?: unknown;
  nome?: unknown;
  email?: unknown;
}

interface ContatoPreparado {
  chave: string;
  telefone: string;
  nome: string;
  email: string | null;
}

interface LinhaMatch {
  chave: string | null;
  ghl_id: string | null;
}

/**
 * Roda as tarefas com no máximo `limite` em voo. Mantém a ordem do resultado.
 *
 * `aquecer` faz o PRIMEIRO item rodar sozinho, antes de liberar o paralelismo.
 * Isso existe por causa de uma corrida real: o GHL cria a tag no momento em que
 * ela é usada, e seis requisições simultâneas com uma tag inédita não enxergam
 * umas às outras — cada uma cria a sua, e a conta fica com N tags de mesmo nome.
 * Tag duplicada quebra o workflow, que amarra o gatilho a UMA delas: parte do
 * público recebe a tag "errada" e nunca é disparado. A primeira chamada isolada
 * cria a tag; as seguintes só reaproveitam.
 */
async function comLimite<T, R>(
  itens: T[],
  limite: number,
  fn: (item: T) => Promise<R>,
  aquecer = false,
): Promise<R[]> {
  const saida = new Array<R>(itens.length);
  let cursor = 0;
  if (aquecer && itens.length > 0) {
    saida[0] = await fn(itens[0]);
    cursor = 1;
  }
  const trabalhador = async () => {
    while (true) {
      const i = cursor++;
      if (i >= itens.length) return;
      saida[i] = await fn(itens[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limite, itens.length) }, trabalhador));
  return saida;
}

/** fetch com retry só no que vale a pena repetir: 429 e 5xx. */
async function fetchGhl(url: string, init: RequestInit, tentativas = 3): Promise<Response> {
  let res = await fetch(url, init);
  for (let n = 1; n < tentativas && (res.status === 429 || res.status >= 500); n++) {
    await new Promise((r) => setTimeout(r, 1000 * n));
    res = await fetch(url, init);
  }
  return res;
}

type Confere = 'existe' | 'sumiu' | 'erro';

/**
 * O id veio do espelho; aqui se pergunta ao CRM se ele ainda vale.
 * Contato apagado no GHL responde 400/404 — e vira candidato a recriação,
 * em vez de virar uma falha silenciosa na hora de aplicar a tag.
 */
async function conferirContato(apiKey: string, contactId: string): Promise<Confere> {
  const res = await fetchGhl(`${GHL_API_BASE}/contacts/${encodeURIComponent(contactId)}`, {
    headers: ghlHeaders(apiKey),
  });
  if (res.ok) return 'existe';
  if (res.status === 400 || res.status === 404) return 'sumiu';
  return 'erro';
}

/**
 * Procura o telefone no CRM. Usada para quem não está no espelho (ou sumiu dele).
 * Devolve o contactId, null se não existe, ou erro se não deu para saber.
 */
async function buscarNoGhl(
  apiKey: string,
  locationId: string,
  telefone: string,
): Promise<{ id: string | null; erro: boolean }> {
  const url = `${GHL_API_BASE}/contacts/search/duplicate?locationId=${encodeURIComponent(locationId)}&number=${encodeURIComponent(telefone)}`;
  const res = await fetchGhl(url, { headers: ghlHeaders(apiKey) });
  if (res.status === 404) return { id: null, erro: false };
  if (!res.ok) return { id: null, erro: true };
  const data = (await res.json().catch(() => ({}))) as { contact?: { id?: string } | null };
  const id = data?.contact?.id;
  return { id: typeof id === 'string' && id.length > 0 ? id : null, erro: false };
}

async function aplicarTag(apiKey: string, contactId: string, tag: string): Promise<boolean> {
  const res = await fetchGhl(`${GHL_API_BASE}/contacts/${encodeURIComponent(contactId)}/tags`, {
    method: 'POST',
    headers: ghlHeaders(apiKey),
    body: JSON.stringify({ tags: [tag] }),
  });
  return res.ok;
}

function partesDoNome(nome: string): { firstName: string; lastName: string } {
  const limpo = nome.trim().replace(/\s+/g, ' ');
  if (!limpo) return { firstName: 'Contato', lastName: '' };
  const partes = limpo.split(' ');
  return { firstName: partes[0], lastName: partes.slice(1).join(' ') };
}

/**
 * Cria o contato já com a tag. Se o GHL responder "duplicado" (ele tem uma checagem
 * própria que às vezes pega o que a busca não pegou), aproveita o id devolvido e só
 * aplica a tag — criar de novo seria justamente a duplicata que queremos evitar.
 */
async function criarContato(
  apiKey: string,
  locationId: string,
  c: ContatoPreparado,
  tag: string,
): Promise<{ criado: boolean; marcado: boolean }> {
  const { firstName, lastName } = partesDoNome(c.nome);
  const corpo: Record<string, unknown> = {
    locationId,
    firstName,
    phone: c.telefone,
    tags: [tag],
    source: 'omnx-desk-disparo',
  };
  if (lastName) corpo.lastName = lastName;
  if (c.email) corpo.email = c.email;

  const res = await fetchGhl(`${GHL_API_BASE}/contacts/`, {
    method: 'POST',
    headers: ghlHeaders(apiKey),
    body: JSON.stringify(corpo),
  });
  if (res.ok) return { criado: true, marcado: true };

  const data = (await res.json().catch(() => ({}))) as { meta?: { contactId?: string } };
  const existente = data?.meta?.contactId;
  if (typeof existente === 'string' && existente.length > 0) {
    const marcado = await aplicarTag(apiKey, existente, tag);
    return { criado: false, marcado };
  }
  return { criado: false, marcado: false };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return json({ error: 'Missing Supabase env vars' }, 500);

  const secret = extractSecret(req);
  if (!secret) return json({ error: 'Unauthorized' }, 401);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });

  // Secret por tenant. Sem workspace não há credencial GHL — não existe fallback global.
  let workspaceId: string | null = null;
  try {
    const digest = await sha256Hex(secret);
    const { data: wsId, error: rpcErr } = await supabase.rpc(
      'resolve_workspace_by_omnx_desk_secret_digest',
      { p_digest: digest },
    );
    if (rpcErr) {
      const requestId = createRequestId();
      logSafeError('crm-aplicar-tag:resolve-secret', requestId, rpcErr);
      return json({ error: 'Não foi possível autenticar o secret.', request_id: requestId }, 500);
    }
    if (typeof wsId === 'string' && wsId.length > 0) workspaceId = wsId;
  } catch (e) {
    const requestId = createRequestId();
    logSafeError('crm-aplicar-tag:digest', requestId, e);
    return json({ error: 'Falha ao processar o secret.', request_id: requestId }, 500);
  }
  if (!workspaceId) return json({ error: 'Unauthorized' }, 401);

  let body: { tag?: unknown; dry_run?: unknown; criar_novos?: unknown; contatos?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const tag = normalizaTag(body?.tag);
  if (!tag) return json({ error: 'tag_obrigatoria' }, 400);

  const dryRun = body?.dry_run !== false; // ausente = análise. Escrever no CRM é sempre explícito.
  const criarNovos = body?.criar_novos === true;

  const entrada = Array.isArray(body?.contatos) ? (body.contatos as ContatoEntrada[]) : [];
  if (entrada.length === 0) return json({ error: 'sem_contatos' }, 400);
  if (entrada.length > MAX_CONTATOS) return json({ error: 'lote_grande_demais', max: MAX_CONTATOS }, 400);

  // Recalcula a chave a partir do telefone e deduplica: o mesmo número duas vezes
  // é a mesma pessoa, e marcar duas vezes seria duas mensagens.
  const porChave = new Map<string, ContatoPreparado>();
  let descartados = 0;
  for (const c of entrada) {
    const chave = chaveTelefone(c?.telefone);
    const telefone = paraE164(c?.telefone);
    if (!chave || !telefone) {
      descartados++;
      continue;
    }
    if (porChave.has(chave)) continue;
    const email = typeof c?.email === 'string' ? c.email.trim().toLowerCase() : '';
    porChave.set(chave, {
      chave,
      telefone,
      nome: typeof c?.nome === 'string' ? c.nome.trim().slice(0, 120) : '',
      email: email.includes('@') ? email : null,
    });
  }
  const contatos = [...porChave.values()];
  if (contatos.length === 0) return json({ error: 'nenhum_telefone_valido', descartados }, 400);

  // 1. Espelho local (uma consulta para o lote inteiro) — é quem revela duplicidade.
  const { data: matches, error: matchErr } = await supabase.rpc('crm_match_contatos_por_chave', {
    p_workspace_id: workspaceId,
    p_chaves: contatos.map((c) => c.chave),
  });
  if (matchErr) {
    const requestId = createRequestId();
    logSafeError('crm-aplicar-tag:match', requestId, matchErr);
    return json({ error: 'Falha ao consultar contatos.', request_id: requestId }, 500);
  }

  const idsPorChave = new Map<string, string[]>();
  for (const linha of (matches ?? []) as LinhaMatch[]) {
    if (!linha.chave || !linha.ghl_id) continue;
    const lista = idsPorChave.get(linha.chave) ?? [];
    if (!lista.includes(linha.ghl_id)) lista.push(linha.ghl_id);
    idsPorChave.set(linha.chave, lista);
  }

  const candidatos: Array<{ contato: ContatoPreparado; ghlId: string }> = [];
  const semEspelho: ContatoPreparado[] = [];
  const ambiguos: Array<{ telefone: string; nome: string }> = [];
  for (const c of contatos) {
    const ids = idsPorChave.get(c.chave) ?? [];
    if (ids.length === 1) candidatos.push({ contato: c, ghlId: ids[0] });
    else if (ids.length > 1) ambiguos.push({ telefone: c.telefone, nome: c.nome });
    else semEspelho.push(c);
  }

  // 2. Credencial do workspace (Vault/BYOK).
  let apiKey: string;
  let locationId: string | null;
  try {
    const cred = await resolveGhlCredentials(supabase, workspaceId);
    apiKey = cred.apiKey;
    locationId = cred.locationId;
  } catch (e) {
    const requestId = createRequestId();
    logSafeError('crm-aplicar-tag:resolve-ghl-cred', requestId, e);
    return json({ error: 'Sem credencial GHL para o workspace.', request_id: requestId }, 502);
  }
  if (!locationId) return json({ error: 'Workspace sem location_id do GHL' }, 422);
  const location = locationId;

  let falhas = 0;

  // 3. Confere no CRM se cada candidato do espelho ainda existe. O espelho guarda
  //    contatos que já foram apagados lá; sem esta checagem eles contariam como
  //    "já existe" e nunca receberiam nada.
  const existentes: Array<{ contato: ContatoPreparado; ghlId: string }> = [];
  const paraProcurar: ContatoPreparado[] = [...semEspelho];
  const conferidos = await comLimite(candidatos, CONCORRENCIA, (x) => conferirContato(apiKey, x.ghlId));
  conferidos.forEach((r, i) => {
    const x = candidatos[i];
    if (r === 'existe') existentes.push(x);
    else if (r === 'sumiu') paraProcurar.push(x.contato); // apagado lá: trata como ausente
    else falhas++; // não deu para saber: não mexe, e aparece como falha
  });

  // 4. Quem não tem id válido: pergunta ao CRM pelo telefone antes de considerar novo.
  const novos: ContatoPreparado[] = [];
  const buscas = await comLimite(paraProcurar, CONCORRENCIA, (c) => buscarNoGhl(apiKey, location, c.telefone));
  buscas.forEach((r, i) => {
    const c = paraProcurar[i];
    if (r.erro) {
      // Não deu para saber se existe. Não cria — criar às cegas é o risco de duplicata.
      falhas++;
      return;
    }
    if (r.id) existentes.push({ contato: c, ghlId: r.id });
    else novos.push(c);
  });

  if (dryRun) {
    return json({
      tag,
      existentes: existentes.length,
      novos: novos.length,
      criados: 0,
      marcados: 0,
      falhas,
      descartados,
      ambiguos,
    });
  }

  // 5. Efetiva. Existentes levam SÓ a tag — nome, e-mail e telefone deles não são tocados.
  //    A primeira escrita do lote roda isolada (`aquecer`) para a tag nascer uma vez
  //    só no CRM; quem vier depois em paralelo reaproveita a que já existe.
  let marcados = 0;
  const resMarcar = await comLimite(existentes, CONCORRENCIA, (x) => aplicarTag(apiKey, x.ghlId, tag), true);
  for (const ok of resMarcar) ok ? marcados++ : falhas++;

  let criados = 0;
  if (criarNovos && novos.length > 0) {
    // Só aquece aqui se nenhuma marcação deu certo — aí a tag ainda não nasceu.
    const precisaAquecer = marcados === 0;
    const resCriar = await comLimite(novos, CONCORRENCIA, (c) => criarContato(apiKey, location, c, tag), precisaAquecer);
    for (const r of resCriar) {
      if (r.criado) criados++;
      if (r.marcado) marcados++;
      else falhas++;
    }
  }

  return json({
    tag,
    existentes: existentes.length,
    novos: novos.length,
    criados,
    marcados,
    falhas,
    descartados,
    ambiguos,
  });
});
