/**
 * Aulas da equipe (/aulas) — regras puras, sem Supabase, para teste.
 *
 * Quem pode o quê vem da RLS de `20260310184822_trilhas_tables.sql`, que esta
 * tela só espelha (não concede nada):
 * - ler trilhas `tipo = 'interno'`: perfis admin, gerente, estrategista e atendimento;
 * - criar trilha, módulo e aula: só o perfil `admin` (`admin_manage_*`);
 * - progresso (`own_progress`): cada pessoa lê e grava só o próprio.
 */
import type { LearningLesson, LearningPathWithModules } from '@/hooks/useTrilhas'

/** Perfis que a política `team_read_internal_paths` deixa ler as trilhas internas. */
export const PERFIS_EQUIPE_AULAS = ['admin', 'gerente', 'estrategista', 'atendimento'] as const

/** Mesma regra das políticas `admin_manage_paths/modules/lessons`. */
export function podeMontarTrilhas(perfil: string | null | undefined): boolean {
  return perfil === 'admin'
}

type ComOrdem = { ordem: number | null; criado_em?: string | null }

/** Ordem de exibição: `ordem` e, no empate, quem foi criado antes. */
export function porOrdem<T extends ComOrdem>(itens: readonly T[]): T[] {
  return [...itens].sort(
    (a, b) => (a.ordem ?? 0) - (b.ordem ?? 0) || String(a.criado_em ?? '').localeCompare(String(b.criado_em ?? '')),
  )
}

/** Ordem do próximo item: um depois do maior (lista vazia começa em 1). */
export function proximaOrdem(itens: readonly ComOrdem[]): number {
  return itens.reduce((maior, i) => Math.max(maior, i.ordem ?? 0), 0) + 1
}

/** Trilha com módulos e aulas já em ordem (o embed do Supabase não ordena). */
export function trilhaOrdenada(trilha: LearningPathWithModules): LearningPathWithModules {
  return {
    ...trilha,
    learning_modules: porOrdem(trilha.learning_modules ?? []).map((m) => ({
      ...m,
      learning_lessons: porOrdem(m.learning_lessons ?? []),
    })),
  }
}

/** Aulas da trilha na ordem de estudo (módulo a módulo). */
export function aulasDaTrilha(trilha: LearningPathWithModules): LearningLesson[] {
  return trilhaOrdenada(trilha).learning_modules.flatMap((m) => m.learning_lessons)
}

export type ResumoTrilha = {
  modulos: number
  aulas: number
  minutos: number
  concluidas: number
  /** 0–100, inteiro. Trilha sem aula = 0. */
  percentual: number
}

export function resumoTrilha(trilha: LearningPathWithModules, concluidas: ReadonlySet<string>): ResumoTrilha {
  const aulas = aulasDaTrilha(trilha)
  const feitas = aulas.filter((a) => concluidas.has(a.id)).length
  return {
    modulos: trilha.learning_modules?.length ?? 0,
    aulas: aulas.length,
    minutos: aulas.reduce((total, a) => total + (a.duracao_minutos ?? 0), 0),
    concluidas: feitas,
    percentual: aulas.length ? Math.round((feitas / aulas.length) * 100) : 0,
  }
}

/** Primeira aula ainda não concluída; com tudo feito, a primeira (para rever). */
export function proximaAula(trilha: LearningPathWithModules, concluidas: ReadonlySet<string>): LearningLesson | null {
  const aulas = aulasDaTrilha(trilha)
  return aulas.find((a) => !concluidas.has(a.id)) ?? aulas[0] ?? null
}

/** Aula seguinte na ordem de estudo, ou `null` na última. */
export function aulaSeguinte(trilha: LearningPathWithModules, aulaId: string): LearningLesson | null {
  const aulas = aulasDaTrilha(trilha)
  const i = aulas.findIndex((a) => a.id === aulaId)
  return i >= 0 && i < aulas.length - 1 ? aulas[i + 1] : null
}

/** Ids das aulas concluídas pela pessoa (a RLS já devolve só o próprio progresso). */
export function idsConcluidos(progresso: ReadonlyArray<{ lesson_id: string; concluido: boolean }> | undefined): Set<string> {
  return new Set((progresso ?? []).filter((p) => p.concluido).map((p) => p.lesson_id))
}

/** Só `http(s)`: um `javascript:` ou `data:` salvo na aula nunca vira link nem iframe. */
export function urlSegura(url: string | null | undefined): string | null {
  const texto = (url ?? '').trim()
  if (!texto) return null
  try {
    const u = new URL(texto)
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null
  } catch {
    return null
  }
}

/** Endereço do player do YouTube (sem cookies) ou do Vimeo; outro endereço = `null`. */
export function videoIncorporado(url: string | null | undefined): string | null {
  const segura = urlSegura(url)
  if (!segura) return null
  const u = new URL(segura)
  const host = u.hostname.replace(/^www\.|^m\./, '')
  if (host === 'youtube.com' || host === 'youtu.be') {
    const id = host === 'youtu.be' ? u.pathname.slice(1) : u.searchParams.get('v') ?? u.pathname.match(/^\/(?:embed|shorts|live)\/([^/]+)/)?.[1]
    return id && /^[\w-]{11}$/.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : null
  }
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    // vimeo.com/ID, vimeo.com/ID/HASH, player.vimeo.com/video/ID?h=HASH e vimeo.com/showcase/N/video/ID.
    // O HASH é o do vídeo não listado: sem ele o player responde que o vídeo não existe.
    // vimeo.com/showcase/N (ou album/N) sem /video/ID é a coleção, não um vídeo: `null`.
    const partes = u.pathname.split('/').filter(Boolean)
    const depoisDeVideo = partes.findIndex((p, i) => /^videos?$/.test(p) && /^\d+$/.test(partes[i + 1] ?? '')) + 1
    if (depoisDeVideo === 0 && /^(showcase|album)$/.test(partes[0] ?? '')) return null
    const i = depoisDeVideo > 0 ? depoisDeVideo : partes.findIndex((p) => /^\d+$/.test(p))
    if (i < 0) return null
    const hash = [u.searchParams.get('h'), partes[i + 1]].find((h) => h && /^[\da-f]+$/i.test(h))
    return `https://player.vimeo.com/video/${partes[i]}${hash ? `?h=${hash}` : ''}`
  }
  return null
}

export type TipoAula = LearningLesson['tipo']

export const ROTULO_TIPO_AULA: Record<TipoAula, string> = {
  video: 'Vídeo',
  texto: 'Texto',
  pdf: 'PDF',
  link: 'Link',
}

export type RascunhoAula = {
  titulo: string
  tipo: TipoAula
  conteudo_url: string
  conteudo_texto: string
  duracao_minutos: string
}

export type ErrosAula = Partial<Record<'titulo' | 'conteudo_url' | 'conteudo_texto' | 'duracao_minutos', string>>

/** Confere o formulário de aula antes de gravar (o banco só exige título e tipo). */
export function validarAula(r: RascunhoAula): ErrosAula {
  const erros: ErrosAula = {}
  if (!r.titulo.trim()) erros.titulo = 'Dê um nome para a aula.'
  if (r.tipo === 'texto') {
    if (!r.conteudo_texto.trim()) erros.conteudo_texto = 'Escreva o conteúdo da aula.'
  } else {
    const url = urlSegura(r.conteudo_url)
    // Vídeo e PDF abrem num quadro dentro do Desk (https): um endereço http fica em branco, bloqueado como
    // conteúdo misto. O link abre em outra aba, então http ainda serve.
    if (!url || (r.tipo !== 'link' && !url.startsWith('https:'))) {
      erros.conteudo_url = 'Cole um endereço que comece com https://.'
    }
  }
  const minutos = r.duracao_minutos.trim()
  if (minutos && !(/^\d+$/.test(minutos) && Number(minutos) > 0 && Number(minutos) <= 1440)) {
    erros.duracao_minutos = 'Use minutos inteiros, de 1 a 1440.'
  }
  return erros
}

/** Duração para exibir: "45 min", "1 h 20 min", "2 h". */
export function duracaoLegivel(minutos: number): string {
  if (minutos < 60) return `${minutos} min`
  const h = Math.floor(minutos / 60)
  const m = minutos % 60
  return m ? `${h} h ${m} min` : `${h} h`
}

/** Iniciais para a marca do cartão da trilha (como as coleções do Clients). */
export function iniciaisTrilha(titulo: string): string {
  const palavras = titulo.trim().split(/\s+/).filter((p) => /[\p{L}\p{N}]/u.test(p))
  const letras = palavras.slice(0, 2).map((p) => p.match(/[\p{L}\p{N}]/u)![0])
  return letras.join('').toLocaleUpperCase('pt-BR') || 'T'
}

export function plural(n: number, um: string, varios: string): string {
  return `${n} ${n === 1 ? um : varios}`
}
