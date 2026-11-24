// Grupos INTERNOS que podem receber o relatório diário — regras PURAS.
//
// O relatório diário tem dado interno (cliente insatisfeito, inadimplente…), então
// ele NUNCA pode ir para um grupo de cliente. Um grupo só é "interno" quando:
//   * tem o formato real de grupo do WhatsApp (destinoGrupo — o mesmo validador
//     estrito do resumo semanal; GRUPO_WA do envio é mais largo);
//   * aparece como conversa de GRUPO (chat_conversations.is_group) do número que
//     envia (wa_auto_config.uazapi_instance_id);
//   * NENHUM contato da empresa com esse grupo está vinculado a cliente
//     (chat_contacts.client_id ou chat_contact_clients), em nenhum número;
//   * o NOME do grupo no Chat não é igual ao de nenhum cliente ativo da empresa
//     (chaveNome de ./wa-alertas.ts: sem acento/caixa/espaços extras) — pega o
//     grupo de cliente que ninguém vinculou no Chat.
// "Interno" = só "sem vínculo com cliente": não sabemos quem está no grupo. A tela
// exige que o admin confirme que só há pessoas da equipe nele.
// O banco confere o mesmo no cadastro (trigger wa_auto_confere_grupo_gestor,
// migration 20261026250000) e o envio confere de novo a cada dia.
//
// Sem banco, sem rede, sem Deno: roda igual na edge function e no Vitest
// (wa-grupos-internos.test.ts). A leitura fica em ./wa-grupos-internos-dados.ts.
import { destinoGrupo } from '../wa-auto-resumo-semanal/regras.ts'
import { chaveNome } from './wa-alertas.ts'

export { destinoGrupo }

/** Linha mínima de chat_contacts usada aqui. */
export interface ContatoDeGrupo {
  id: string
  nome: string | null
  numero_whatsapp: string | null
  client_id: string | null
}

export interface GrupoInterno {
  /** "<id>@g.us" (minúsculo). */
  grupo_jid: string
  /** Nome do grupo no Chat (até 120), ou "Grupo sem nome". */
  nome: string
}

export const MAX_NOME_GRUPO = 120

/** Uma linha só, sem caracteres de controle/invisíveis, até `max` caracteres. */
export function nomeGrupoSeguro(bruto: string | null | undefined, max = MAX_NOME_GRUPO): string | null {
  const s = String(bruto ?? '')
    // deno-lint-ignore no-control-regex
    .replace(new RegExp('[\\u0000-\\u001f\\u007f-\\u009f\\u200b-\\u200f\\u2028-\\u202e\\u2060-\\u206f\\ufeff]+', 'g'), ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!s) return null
  const letras = Array.from(s)
  return letras.length > max ? letras.slice(0, max).join('').trimEnd() : s
}

/** As duas formas em que o Chat pode ter guardado o grupo ("<id>" e "<id>@g.us"). */
export function formasDoGrupo(jid: string): string[] {
  const d = destinoGrupo(jid)
  if (!d) return []
  return [d.slice(0, -'@g.us'.length), d]
}

/** Chaves (chaveNome) dos nomes de clientes ATIVOS (ativo !== false). */
export function chavesDeClientesAtivos(
  clientes: readonly { nome: string | null; ativo?: boolean | null }[],
): Set<string> {
  const out = new Set<string>()
  for (const cl of clientes) {
    if (cl.ativo === false) continue
    const k = chaveNome(cl.nome)
    if (k) out.add(k)
  }
  return out
}

/** Jids cujo nome (em QUALQUER contato do grupo) é igual ao de um cliente ativo. */
export function gruposComNomeDeCliente(
  contatos: readonly ContatoDeGrupo[], chavesClientes: ReadonlySet<string>,
): Set<string> {
  const out = new Set<string>()
  if (chavesClientes.size === 0) return out
  for (const c of contatos) {
    const jid = destinoGrupo(c.numero_whatsapp)
    const k = chaveNome(nomeGrupoSeguro(c.nome))
    if (jid && k && chavesClientes.has(k)) out.add(jid)
  }
  return out
}

/**
 * Grupos internos a partir do que foi lido do banco.
 *   candidatos: contatos (desta empresa, do número que envia) que têm conversa
 *               marcada is_group nesse número;
 *   mesmoGrupo: TODOS os contatos da empresa com os mesmos grupos (qualquer número),
 *               para achar vínculo com cliente feito em outro contato;
 *   vinculados: ids de contato presentes em chat_contact_clients;
 *   chavesClientes: chavesDeClientesAtivos(clientes da empresa).
 * Um grupo com QUALQUER contato vinculado a cliente, ou com nome de cliente ativo,
 * fica de fora. Ordem: por nome.
 */
export function gruposInternos(
  candidatos: readonly ContatoDeGrupo[],
  mesmoGrupo: readonly ContatoDeGrupo[],
  vinculados: ReadonlySet<string>,
  chavesClientes: ReadonlySet<string> = new Set(),
): GrupoInterno[] {
  const todos = [...candidatos, ...mesmoGrupo]
  const deCliente = gruposDeCliente(todos, vinculados)
  const nomeDeCliente = gruposComNomeDeCliente(todos, chavesClientes)
  const porJid = new Map<string, string | null>()
  for (const c of candidatos) {
    const jid = destinoGrupo(c.numero_whatsapp)
    if (!jid || deCliente.has(jid) || nomeDeCliente.has(jid)) continue
    const nome = nomeGrupoSeguro(c.nome)
    if (!porJid.has(jid) || (!porJid.get(jid) && nome)) porJid.set(jid, nome)
  }
  return [...porJid.entries()]
    .map(([grupo_jid, nome]) => ({ grupo_jid, nome: nome ?? 'Grupo sem nome' }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR') || a.grupo_jid.localeCompare(b.grupo_jid))
}

/** Motivo (código) para um grupo cadastrado NÃO receber hoje; null = pode enviar. */
export type MotivoGrupoBloqueado =
  | 'grupo_invalido' | 'grupo_de_cliente' | 'grupo_nome_de_cliente' | 'grupo_fora_da_instancia'

/**
 * Confere um grupo cadastrado contra o que foi lido agora (envio).
 *   permitidos: jids de gruposInternos(...) lidos para estes grupos;
 *   deCliente:  jids com vínculo de cliente (para o motivo ficar claro no histórico);
 *   nomeDeCliente: jids com nome igual ao de um cliente ativo.
 */
export function motivoGrupoBloqueado(
  grupoJid: string | null | undefined, permitidos: ReadonlySet<string>, deCliente: ReadonlySet<string>,
  nomeDeCliente: ReadonlySet<string> = new Set(),
): MotivoGrupoBloqueado | null {
  const jid = destinoGrupo(grupoJid)
  if (!jid) return 'grupo_invalido'
  if (deCliente.has(jid)) return 'grupo_de_cliente'
  if (nomeDeCliente.has(jid)) return 'grupo_nome_de_cliente'
  if (!permitidos.has(jid)) return 'grupo_fora_da_instancia'
  return null
}

/** Jids com vínculo de cliente (mesma regra de gruposInternos), para o motivo do bloqueio. */
export function gruposDeCliente(
  contatos: readonly ContatoDeGrupo[], vinculados: ReadonlySet<string>,
): Set<string> {
  const out = new Set<string>()
  for (const c of contatos) {
    const jid = destinoGrupo(c.numero_whatsapp)
    if (jid && (c.client_id || vinculados.has(c.id))) out.add(jid)
  }
  return out
}

/** Mensagem curta (pt-BR) gravada no histórico quando o grupo é pulado. */
export const ERRO_GRUPO: Record<MotivoGrupoBloqueado | 'oficial_sem_grupo' | 'sem_numero_grupo', string> = {
  grupo_invalido: 'Grupo inválido: remova e adicione de novo na aba Relatório diário.',
  grupo_de_cliente: 'Este grupo agora está vinculado a um cliente. O relatório não vai para grupos de clientes.',
  grupo_nome_de_cliente: 'Este grupo tem o mesmo nome de um cliente. O relatório não vai para grupos de clientes.',
  grupo_fora_da_instancia: 'O grupo não aparece nas conversas do número que envia. Confira se o número ainda está no grupo.',
  oficial_sem_grupo: 'No WhatsApp Oficial o grupo sai pelo número do Chat (não oficial), que não está configurado. Veja a aba Conexão.',
  sem_numero_grupo: 'Escolha o número que envia (aba Conexão): o grupo sai por esse número.',
}
