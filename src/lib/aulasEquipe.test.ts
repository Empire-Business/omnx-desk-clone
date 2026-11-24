import { describe, expect, it } from 'vitest'
import type { LearningLesson, LearningPathWithModules } from '@/hooks/useTrilhas'
import {
  PERFIS_EQUIPE_AULAS, aulaSeguinte, aulasDaTrilha, duracaoLegivel, idsConcluidos, iniciaisTrilha, plural,
  podeMontarTrilhas, proximaAula, proximaOrdem, resumoTrilha, urlSegura, validarAula, videoIncorporado,
  type RascunhoAula,
} from './aulasEquipe'
import { TRAVAS_DE_PAGINA } from '@/config/navegacao'

const aula = (id: string, ordem: number, extra: Partial<LearningLesson> = {}): LearningLesson => ({
  id, module_id: 'm', titulo: `Aula ${id}`, descricao: null, tipo: 'video', conteudo_url: null,
  conteudo_texto: null, duracao_minutos: null, ordem, criado_em: `2026-11-0${ordem}T00:00:00Z`, ...extra,
})

// Módulos e aulas fora de ordem de propósito: o embed do Supabase não ordena.
const trilha: LearningPathWithModules = {
  id: 't', titulo: 'Primeiros dias', descricao: null, tipo: 'interno', thumbnail_url: null, ativo: true,
  ordem: 1, criado_em: '2026-11-01T00:00:00Z', atualizado_em: '2026-11-01T00:00:00Z',
  learning_modules: [
    { id: 'm2', path_id: 't', titulo: 'Dois', descricao: null, ordem: 2, criado_em: '2026-11-02T00:00:00Z',
      learning_lessons: [aula('c', 1, { duracao_minutos: 30 })] },
    { id: 'm1', path_id: 't', titulo: 'Um', descricao: null, ordem: 1, criado_em: '2026-11-01T00:00:00Z',
      learning_lessons: [aula('b', 2, { duracao_minutos: 15 }), aula('a', 1, { duracao_minutos: 45 })] },
  ],
}

describe('quem pode o quê (espelho da RLS)', () => {
  it('só admin monta trilha', () => {
    expect(podeMontarTrilhas('admin')).toBe(true)
    for (const p of ['gerente', 'estrategista', 'atendimento', 'cliente', null, undefined]) expect(podeMontarTrilhas(p)).toBe(false)
  })

  it('a trava do menu e da página usa os mesmos perfis de leitura da RLS', () => {
    expect(TRAVAS_DE_PAGINA.aulas.perfis).toEqual([...PERFIS_EQUIPE_AULAS])
  })
})

describe('ordem e progresso', () => {
  it('aulas na ordem de estudo, módulo a módulo', () => {
    expect(aulasDaTrilha(trilha).map((a) => a.id)).toEqual(['a', 'b', 'c'])
  })

  it('resumo conta módulos, aulas, minutos e o que a pessoa concluiu', () => {
    expect(resumoTrilha(trilha, new Set(['b']))).toEqual({ modulos: 2, aulas: 3, minutos: 90, concluidas: 1, percentual: 33 })
    expect(resumoTrilha(trilha, new Set(['a', 'b', 'c'])).percentual).toBe(100)
    expect(resumoTrilha({ ...trilha, learning_modules: [] }, new Set()).percentual).toBe(0)
  })

  it('aula concluída de outra trilha não conta', () => {
    expect(resumoTrilha(trilha, new Set(['zzz'])).concluidas).toBe(0)
  })

  it('próxima aula é a primeira que falta; com tudo feito, volta para a primeira', () => {
    expect(proximaAula(trilha, new Set())?.id).toBe('a')
    expect(proximaAula(trilha, new Set(['a']))?.id).toBe('b')
    expect(proximaAula(trilha, new Set(['a', 'b', 'c']))?.id).toBe('a')
    expect(proximaAula({ ...trilha, learning_modules: [] }, new Set())).toBeNull()
  })

  it('aula seguinte atravessa o módulo e para na última', () => {
    expect(aulaSeguinte(trilha, 'b')?.id).toBe('c')
    expect(aulaSeguinte(trilha, 'c')).toBeNull()
    expect(aulaSeguinte(trilha, 'nao-existe')).toBeNull()
  })

  it('próxima ordem vem depois da maior', () => {
    expect(proximaOrdem([])).toBe(1)
    expect(proximaOrdem([{ ordem: 3 }, { ordem: 1 }])).toBe(4)
  })

  it('só conta progresso marcado como concluído', () => {
    expect(idsConcluidos([{ lesson_id: 'a', concluido: true }, { lesson_id: 'b', concluido: false }])).toEqual(new Set(['a']))
    expect(idsConcluidos(undefined).size).toBe(0)
  })
})

describe('conteúdo da aula', () => {
  it('só aceita http(s)', () => {
    expect(urlSegura('https://exemplo.com/a.pdf')).toBe('https://exemplo.com/a.pdf')
    expect(urlSegura('javascript:alert(1)')).toBeNull()
    expect(urlSegura('data:text/html,oi')).toBeNull()
    expect(urlSegura('exemplo.com')).toBeNull()
    expect(urlSegura('')).toBeNull()
  })

  it('YouTube e Vimeo viram player; o resto não', () => {
    const yt = 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'
    expect(videoIncorporado('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10')).toBe(yt)
    expect(videoIncorporado('https://youtu.be/dQw4w9WgXcQ')).toBe(yt)
    expect(videoIncorporado('https://youtube.com/shorts/dQw4w9WgXcQ')).toBe(yt)
    expect(videoIncorporado('https://www.youtube.com/watch?v=curto')).toBeNull()
    expect(videoIncorporado('https://vimeo.com/76979871')).toBe('https://player.vimeo.com/video/76979871')
    expect(videoIncorporado('https://www.youtube.com/live/dQw4w9WgXcQ?si=abc')).toBe(yt)
    expect(videoIncorporado('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe(yt)
    // Vídeo não listado do Vimeo: o hash (?h= ou o trecho depois do id) vai junto para o player.
    expect(videoIncorporado('https://player.vimeo.com/video/76979871?h=8a4b2c1d0e')).toBe('https://player.vimeo.com/video/76979871?h=8a4b2c1d0e')
    expect(videoIncorporado('https://vimeo.com/76979871/8a4b2c1d0e')).toBe('https://player.vimeo.com/video/76979871?h=8a4b2c1d0e')
    expect(videoIncorporado('https://vimeo.com/76979871?share=copy')).toBe('https://player.vimeo.com/video/76979871')
    expect(videoIncorporado('https://vimeo.com/showcase/11223344/video/76979871')).toBe('https://player.vimeo.com/video/76979871')
    // Link da coleção, sem /video/ID: não há vídeo para tocar.
    expect(videoIncorporado('https://vimeo.com/showcase/11223344')).toBeNull()
    expect(videoIncorporado('https://vimeo.com/album/11223344')).toBeNull()
    expect(videoIncorporado('https://vimeo.com/channels/staffpicks/76979871')).toBe('https://player.vimeo.com/video/76979871')
    // Hash fora do formato não entra na URL do player.
    expect(videoIncorporado('https://player.vimeo.com/video/76979871?h=x"onload')).toBe('https://player.vimeo.com/video/76979871')
    expect(videoIncorporado('https://exemplo.com/video.mp4')).toBeNull()
    expect(videoIncorporado('javascript:alert(1)')).toBeNull()
  })

  it('valida o formulário de aula', () => {
    const base: RascunhoAula = { titulo: 'Boas-vindas', tipo: 'video', conteudo_url: 'https://youtu.be/dQw4w9WgXcQ', conteudo_texto: '', duracao_minutos: '' }
    expect(validarAula(base)).toEqual({})
    expect(validarAula({ ...base, titulo: '  ' }).titulo).toBeTruthy()
    expect(validarAula({ ...base, conteudo_url: 'ftp://x' }).conteudo_url).toBeTruthy()
    // Vídeo e PDF abrem num quadro: http fica em branco (conteúdo misto). Link abre em outra aba e aceita http.
    expect(validarAula({ ...base, conteudo_url: 'http://youtu.be/dQw4w9WgXcQ' }).conteudo_url).toBeTruthy()
    expect(validarAula({ ...base, tipo: 'pdf', conteudo_url: 'http://exemplo.com/a.pdf' }).conteudo_url).toBeTruthy()
    expect(validarAula({ ...base, tipo: 'pdf', conteudo_url: 'https://exemplo.com/a.pdf' })).toEqual({})
    expect(validarAula({ ...base, tipo: 'link', conteudo_url: 'http://exemplo.com' })).toEqual({})
    expect(validarAula({ ...base, tipo: 'texto', conteudo_url: '' }).conteudo_texto).toBeTruthy()
    expect(validarAula({ ...base, tipo: 'texto', conteudo_url: '', conteudo_texto: 'Leia isto' })).toEqual({})
    for (const d of ['0', '1,5', '-3', '1441', 'dez']) expect(validarAula({ ...base, duracao_minutos: d }).duracao_minutos, d).toBeTruthy()
    expect(validarAula({ ...base, duracao_minutos: '45' })).toEqual({})
  })
})

describe('textos', () => {
  it('duração legível', () => {
    expect(duracaoLegivel(45)).toBe('45 min')
    expect(duracaoLegivel(80)).toBe('1 h 20 min')
    expect(duracaoLegivel(120)).toBe('2 h')
  })

  it('iniciais da trilha', () => {
    expect(iniciaisTrilha('primeiros dias no atendimento')).toBe('PD')
    expect(iniciaisTrilha('Ética')).toBe('É')
    expect(iniciaisTrilha('  — ')).toBe('T')
  })

  it('plural', () => {
    expect(plural(1, 'aula', 'aulas')).toBe('1 aula')
    expect(plural(0, 'aula', 'aulas')).toBe('0 aulas')
  })
})
