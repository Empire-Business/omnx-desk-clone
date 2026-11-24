/**
 * Tutoriais em vídeo do Desk, hospedados no Vimeo (EmpireOS / OMNX Desk — Tutoriais).
 * Não listados (só abre quem tem o link) e embutíveis só em desk.omnx.pro.
 * Gerado a partir do recibo de envio em 07/11/2026; o `hash` faz parte do link
 * não listado (não é segredo, mas não deve ser publicado fora do Desk).
 */
import { RECURSOS } from '@/config/recursos'

export interface VideoVimeo { id: string; hash: string }
export interface Tutorial {
  numero: string
  titulo: string
  /** Assunto do manual onde o vídeo aparece (`SECOES_MANUAL[].id`). */
  secao: string
  secaoTitulo: string
  segundos: number
  horizontal: VideoVimeo
  vertical: VideoVimeo
}

const TODOS_TUTORIAIS: readonly Tutorial[] = [
  { numero: '01', titulo: 'Primeiro acesso', secao: 'comecar', secaoTitulo: 'Comece por aqui', segundos: 102,
    horizontal: { id: '1244752118', hash: '86f0652f64' }, vertical: { id: '1244752176', hash: '0d498e641b' } },
  { numero: '02', titulo: 'Atender pelo WhatsApp', secao: 'chat', secaoTitulo: 'Conversas', segundos: 90,
    horizontal: { id: '1244752294', hash: '8422f8a1bf' }, vertical: { id: '1244752354', hash: '67f6691410' } },
  { numero: '03', titulo: 'Trabalhar a fila de tickets', secao: 'atendimento', secaoTitulo: 'Tickets', segundos: 89,
    horizontal: { id: '1244752412', hash: 'c3b3bfd397' }, vertical: { id: '1244752503', hash: '7c746f2c83' } },
  { numero: '04', titulo: 'Resolver e reabrir um ticket', secao: 'atendimento', secaoTitulo: 'Tickets', segundos: 68,
    horizontal: { id: '1244752589', hash: '642657a221' }, vertical: { id: '1244752674', hash: '32105b4871' } },
  { numero: '05', titulo: 'Contratos do cliente', secao: 'contratos', secaoTitulo: 'Contratos', segundos: 79,
    horizontal: { id: '1244752760', hash: 'fe5f5956c0' }, vertical: { id: '1244752801', hash: '96f743a702' } },
  { numero: '06', titulo: 'Perguntar à Íris', secao: 'ajuda', secaoTitulo: 'Ajuda e Perguntar à Íris', segundos: 51,
    horizontal: { id: '1244752870', hash: '36177352a6' }, vertical: { id: '1244752929', hash: 'df3b20cb66' } },
  { numero: '07', titulo: 'Reportar um problema', secao: 'suporte', secaoTitulo: 'Reporte um problema', segundos: 64,
    horizontal: { id: '1244753003', hash: 'c6ec65c8cc' }, vertical: { id: '1244753057', hash: 'eb1af838b2' } },
]

/** Vazio quando os vídeos não tocam neste endereço (fora do domínio da empresa). */
export const TUTORIAIS: readonly Tutorial[] = RECURSOS.tutoriaisVideo ? TODOS_TUTORIAIS : []

export function tutoriaisDaSecao(secao: string): readonly Tutorial[] {
  return TUTORIAIS.filter((t) => t.secao === secao)
}

export function linkVimeo(v: VideoVimeo): string {
  return `https://vimeo.com/${v.id}/${v.hash}`
}
