import { normalizaTelefoneBR } from '@/lib/telefone'

/**
 * WhatsApp pessoal da equipe (tabela equipe_identidades, migration
 * 20261027120000_chat_autoria.sql) — regras puras para a tela e os testes.
 *
 * Serve para o sistema saber quando é alguém da equipe falando nos grupos dos
 * clientes (a equipe escreve do celular pessoal, não do número da empresa).
 */

export type OrigemIdentidade = 'cadastro' | 'instancia' | 'membro_agente'

/** Linha como o front enxerga (sem o telefone completo nem o LID). */
export interface IdentidadeEquipeTela {
  id: string
  user_id: string | null
  instance_uuid: string | null
  telefone_fim: string | null
  nome_exibicao: string | null
  origem: OrigemIdentidade
  ativo: boolean
  lid_aprendido_em: string | null
}

export const MAX_TELEFONES_POR_PESSOA = 3

export const ROTULO_ORIGEM: Record<OrigemIdentidade, string> = {
  cadastro: 'cadastrado aqui',
  membro_agente: 'da lista do assistente',
  instancia: 'número da empresa',
}

/** Celular BR sem o 9º dígito (55 + DDD + 8 dígitos começando em 6–9). */
const CELULAR_SEM_NOVE = /^55[1-9][0-9][6-9][0-9]{7}$/

/**
 * Telefone digitado → forma canônica gravada (só dígitos, com o 9º dígito no
 * celular BR). Mesma regra de chaveTelefoneBR (servidor) e de
 * private.autoria_chave_tel (banco).
 */
export function telefoneEquipeCanonico(
  bruto: string,
): { ok: true; telefone: string } | { ok: false; erro: string } {
  const { telefone, aviso } = normalizaTelefoneBR(bruto)
  const d = telefone.replace(/\D/g, '')
  if (!d || aviso || d.length < 12 || d.length > 13) {
    return { ok: false, erro: 'WhatsApp inválido. Use o DDD e o número, por exemplo (11) 99999-8888.' }
  }
  return { ok: true, telefone: CELULAR_SEM_NOVE.test(d) ? `55${d.slice(2, 4)}9${d.slice(4)}` : d }
}

/** "•• 1234" — a tela nunca mostra o número inteiro. */
export function finalTelefone(fim: string | null | undefined): string {
  const f = String(fim ?? '').replace(/\D/g, '').slice(-4)
  return f ? `•• ${f}` : '••'
}

/** Confere antes de gravar: formato e limite por pessoa (o banco confere de novo). */
export function validarTelefoneEquipe(
  userId: string | null | undefined,
  bruto: string,
  daPessoa: readonly Pick<IdentidadeEquipeTela, 'origem'>[],
): { ok: true; telefone: string } | { ok: false; erro: string } {
  if (!userId) return { ok: false, erro: 'Escolha a pessoa da equipe.' }
  if (daPessoa.filter((i) => i.origem === 'cadastro').length >= MAX_TELEFONES_POR_PESSOA) {
    return { ok: false, erro: `Cada pessoa pode ter até ${MAX_TELEFONES_POR_PESSOA} WhatsApp cadastrados.` }
  }
  return telefoneEquipeCanonico(bruto)
}

/** Agrupa as identidades por pessoa (as da empresa, sem pessoa, ficam de fora). */
export function identidadesPorPessoa(lista: readonly IdentidadeEquipeTela[]): Map<string, IdentidadeEquipeTela[]> {
  const m = new Map<string, IdentidadeEquipeTela[]>()
  for (const i of lista) {
    if (!i.user_id) continue
    const atual = m.get(i.user_id) ?? []
    atual.push(i)
    m.set(i.user_id, atual)
  }
  return m
}
