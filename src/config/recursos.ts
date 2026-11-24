// Recursos que dependem de serviços de fora do app, ligados por variável de ambiente
// (Vercel → Settings → Environment Variables). Um lugar só para saber o que liga o quê.
//
// Regra: o que manda dado do usuário para um serviço de terceiros nasce DESLIGADO
// e só liga com a variável preenchida. O deploy da empresa preenche as variáveis
// (ver docs/INSTALACAO-DO-ZERO.md, seção "Variáveis do site").

import { BRAND } from '@/config/brand'

const env = import.meta.env

/** Lê uma variável liga/desliga. Vazio ou ausente = `padrao`. */
export function lerLigado(valor: string | undefined, padrao: boolean): boolean {
  const v = (valor ?? '').trim().toLowerCase()
  if (!v) return padrao
  return ['1', 'true', 'on', 'sim', 'ligado'].includes(v)
}

/** Endereço base (https, sem barra no fim) ou '' quando ausente/inválido. */
export function lerEndereco(valor: string | undefined): string {
  const v = (valor ?? '').trim().replace(/\/+$/, '')
  if (!v) return ''
  try {
    const u = new URL(v)
    return u.protocol === 'https:' ? v : ''
  } catch {
    return ''
  }
}

export const RECURSOS = {
  /**
   * Central do High Ticket AI (lista de plataformas no menu e troca de plataforma).
   * Ex.: https://<projeto-da-central>.supabase.co/functions/v1
   * Vazio = desligado: o app NÃO manda o token de sessão do usuário para fora.
   */
  centralHtaiUrl: lerEndereco(env.VITE_HTAI_CENTRAL_URL),

  /**
   * Provedor de login do Supabase usado pelo botão "Entrar com High Ticket AI"
   * (ex.: custom:empire-os). Vazio = botão escondido. Só funciona se o mesmo
   * provedor estiver configurado no Supabase Auth deste projeto.
   */
  loginHtaiProvider: (env.VITE_HTAI_LOGIN_PROVIDER ?? '').trim(),

  /**
   * Sala de vídeo das reuniões (LiveKit) e transcrição ao vivo (Soniox).
   * Precisa das funções livekit-token, livekit-end-room e soniox-token publicadas.
   * Padrão ligado (comportamento atual da empresa); a instalação do zero desliga.
   */
  reuniaoVideo: lerLigado(env.VITE_REUNIAO_VIDEO, true),

  /**
   * Resumo de reunião por IA (função meeting-ai-summary).
   * Padrão ligado (comportamento atual da empresa); a instalação do zero desliga.
   */
  reuniaoResumoIa: lerLigado(env.VITE_REUNIAO_RESUMO_IA, true),

  /**
   * Entregas da Cami (função cami-deliveries, integração interna da empresa).
   * Padrão ligado (comportamento atual da empresa); a instalação do zero desliga.
   */
  entregasCami: lerLigado(env.VITE_CAMI_ENTREGAS, true),

  /**
   * Link "Entrar no GT3" do manual público. Padrão: só na marca OMNX (empresa).
   */
  linkGt3: lerEndereco(env.VITE_GT3_URL) || (BRAND.familiaOmnx ? 'https://gt3.omnx.pro/auth' : ''),

  /**
   * Tutoriais em vídeo (Vimeo não listado, embutível só no domínio da empresa).
   * Padrão: ligado na marca OMNX; fora dela, desligado (os vídeos não tocariam).
   */
  tutoriaisVideo: lerLigado(env.VITE_TUTORIAIS_VIDEO, BRAND.familiaOmnx),
} as const
