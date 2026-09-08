import { supabase } from './supabase'

export type MeetRole = 'host' | 'guest' | 'observer'

export function generateRoomName(): string {
  return `meeting-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function getBaseUrl(): string {
  if (typeof window === 'undefined') return ''
  const host = window.location.hostname
  if (host === 'localhost' || host === '127.0.0.1') {
    return import.meta.env.VITE_PUBLIC_APP_URL || window.location.origin
  }
  return window.location.origin
}

export function getMeetUrl(
  roomName: string,
  opts?: { role?: MeetRole; clientId?: string; conversationId?: string; name?: string },
): string {
  const base = getBaseUrl()
  const params = new URLSearchParams()
  if (opts?.role) params.set('role', opts.role)
  if (opts?.clientId) params.set('client_id', opts.clientId)
  if (opts?.conversationId) params.set('conversation_id', opts.conversationId)
  if (opts?.name) params.set('name', opts.name)
  const qs = params.toString()
  return `${base}/meet/${roomName}${qs ? '?' + qs : ''}`
}

export async function fetchLiveKitToken(params: {
  roomName: string
  participantName: string
  role: MeetRole
  metadata?: Record<string, unknown>
}): Promise<{ token: string; url: string }> {
  const { data, error } = await supabase.functions.invoke('livekit-token', {
    body: params,
  })
  if (error || !data?.token) throw new Error(error?.message || 'Falha ao gerar token LiveKit')
  return data as { token: string; url: string }
}

export async function endMeetingRoom(roomName: string): Promise<void> {
  await supabase.functions.invoke('livekit-end-room', { body: { room_name: roomName } })
}
