import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import {
  LiveKitRoom,
  GridLayout,
  ParticipantTile,
  useTracks,
  useLocalParticipant,
  useRoomContext,
  useParticipants,
  usePersistentUserChoices,
} from '@livekit/components-react'
import { Track, RoomEvent } from 'livekit-client'
import { BackgroundBlur, VirtualBackground } from '@livekit/track-processors'
import '@livekit/components-styles'
import {
  Mic, MicOff, Video as VideoIcon, VideoOff, PhoneOff, ScreenShare, ScreenShareOff,
  Sparkles, MessageSquare, Users, Send, X, Lock, Film, ArrowLeft, CheckCircle2,
  Upload, Check, Ban, Star, VolumeX, Captions, CaptionsOff,
} from 'lucide-react'
import { useMeetingTranscription } from '@/hooks/useMeetingTranscription'
import { supabase } from '@/lib/supabase'
import { fetchLiveKitToken, endMeetingRoom, type MeetRole } from '@/lib/livekit'
import { cn } from '@/lib/utils'

interface ConnectionData {
  token: string
  url: string
}

export default function MeetRoom() {
  const { roomId } = useParams<{ roomId: string }>()
  const [searchParams] = useSearchParams()

  const role = (searchParams.get('role') || 'guest') as MeetRole
  const defaultName = searchParams.get('name') || ''
  const clientId = searchParams.get('client_id') || undefined
  const conversationId = searchParams.get('conversation_id') || undefined
  const returnUrl = searchParams.get('return') || '/'

  const isObserver = role === 'observer'
  const isHost = role === 'host'

  const [stage, setStage] = useState<'checking' | 'prejoin' | 'connecting' | 'inroom' | 'feedback' | 'ended' | 'error'>('checking')
  const [participantName, setParticipantName] = useState(defaultName)
  const [linkInvalid, setLinkInvalid] = useState<string | null>(null)

  // Validate link: check if meeting exists and isn't cancelled/completed
  useEffect(() => {
    if (!roomId) return
    ;(async () => {
      const { data } = await supabase
        .from('meetings')
        .select('status, scheduled_at')
        .eq('livekit_room_name', roomId)
        .maybeSingle()

      if (data) {
        const m = data as { status: string | null; scheduled_at: string | null }
        if (m.status === 'cancelled') {
          setLinkInvalid('Esta reunião foi cancelada.')
          setStage('error')
          return
        }
        if (m.status === 'completed') {
          setLinkInvalid('Esta reunião já foi encerrada.')
          setStage('error')
          return
        }
      }
      setStage(isObserver ? 'connecting' : 'prejoin')
    })()
  }, [roomId, isObserver])
  const [error, setError] = useState<string | null>(null)
  const [connectionData, setConnectionData] = useState<ConnectionData | null>(null)
  const [joinOpts, setJoinOpts] = useState<{ name: string; video: boolean; audio: boolean; blur: boolean } | null>(null)

  useEffect(() => {
    if (isObserver && stage === 'connecting' && roomId && !connectionData) {
      (async () => {
        try {
          const { token, url } = await fetchLiveKitToken({
            roomName: roomId,
            participantName: defaultName || 'Observador',
            role: 'observer',
            metadata: { client_id: clientId, conversation_id: conversationId },
          })
          setJoinOpts({ name: defaultName || 'Observador', video: false, audio: false, blur: false })
          setConnectionData({ token, url })
          setStage('inroom')
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Erro ao conectar')
          setStage('error')
        }
      })()
    }
  }, [isObserver, roomId, stage, defaultName, clientId, conversationId])

  async function handleJoin(opts: { name: string; video: boolean; audio: boolean; blur: boolean }) {
    if (!roomId) return
    setStage('connecting')
    setError(null)
    try {
      const { data: existing } = await supabase
        .from('meetings')
        .select('id, status, started_at')
        .eq('livekit_room_name', roomId)
        .maybeSingle()

      if (!existing) {
        await supabase.from('meetings').insert({
          title: `Reunião ${roomId}`,
          client_id: clientId || null,
          conversation_id: conversationId || null,
          meeting_type: 'sales_call',
          status: 'active',
          livekit_room_name: roomId,
          recording_status: 'pending',
          meeting_link: window.location.origin + '/meet/' + roomId,
          started_at: new Date().toISOString(),
        } as never)
      } else if (isHost) {
        // Host entrou — marca sala como ativa imediatamente (fallback caso webhook falhe)
        const m = existing as { id: string; status: string | null; started_at: string | null }
        if (m.status !== 'active' && m.status !== 'completed') {
          await supabase
            .from('meetings')
            .update({
              status: 'active',
              started_at: m.started_at || new Date().toISOString(),
            } as never)
            .eq('id', m.id)
        }
      }

      const { token, url } = await fetchLiveKitToken({
        roomName: roomId,
        participantName: opts.name,
        role,
        metadata: { client_id: clientId, conversation_id: conversationId },
      })

      setJoinOpts(opts)
      setParticipantName(opts.name)
      setConnectionData({ token, url })
      setStage('inroom')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao conectar')
      setStage('error')
    }
  }

  const handleDisconnected = useCallback(async () => {
    if (isHost && roomId) {
      // Fecha sala pros outros
      endMeetingRoom(roomId).catch(() => {})
      // Fallback: atualiza status diretamente no DB (webhook também atualiza, mas não depende dele)
      supabase
        .from('meetings')
        .update({
          status: 'completed',
          ended_at: new Date().toISOString(),
        } as never)
        .eq('livekit_room_name', roomId)
        .then(() => {})
      setStage('ended')
    } else if (!isObserver && roomId) {
      // Convidado: pedir feedback antes de ir pra tela de encerramento
      setStage('feedback')
    } else {
      setStage('ended')
    }
  }, [isHost, isObserver, roomId])

  if (stage === 'error') {
    return <FullScreenMessage title={linkInvalid ? 'Reunião indisponível' : 'Erro ao conectar'} desc={linkInvalid || error || ''} returnUrl={returnUrl} />
  }
  if (stage === 'checking') {
    return <LoadingScreen />
  }
  if (stage === 'feedback' && roomId) {
    return (
      <FeedbackScreen
        roomName={roomId}
        participantName={participantName}
        onDone={() => setStage('ended')}
      />
    )
  }
  if (stage === 'ended') {
    return <FullScreenMessage title="Reunião encerrada" desc="Obrigado pela participação" returnUrl={returnUrl} success />
  }
  if (stage === 'prejoin' && !isObserver) {
    return (
      <PreJoinScreen
        defaultName={defaultName}
        onJoin={handleJoin}
        returnUrl={returnUrl}
      />
    )
  }
  if (stage === 'connecting' || !connectionData || !joinOpts) {
    return <LoadingScreen />
  }

  return (
    <LiveKitRoom
      token={connectionData.token}
      serverUrl={connectionData.url}
      video={joinOpts.video && !isObserver}
      audio={joinOpts.audio && !isObserver}
      connect={true}
      onDisconnected={handleDisconnected}
      data-lk-theme="default"
      style={{ height: '100dvh', width: '100dvw', background: '#0a0a0f', overflow: 'hidden' }}
    >
      <MeetingRoom
        isHost={isHost}
        isObserver={isObserver}
        initialBlur={joinOpts.blur}
        roomId={roomId!}
        onLeave={() => handleDisconnected()}
      />
    </LiveKitRoom>
  )
}

// ─── PreJoin Screen ──────────────────────────────────────────────────────────

function PreJoinScreen({
  defaultName, onJoin, returnUrl,
}: {
  defaultName: string
  onJoin: (opts: { name: string; video: boolean; audio: boolean; blur: boolean }) => void
  returnUrl: string
}) {
  const { saveAudioInputEnabled, saveVideoInputEnabled, userChoices } = usePersistentUserChoices()
  const [name, setName] = useState(defaultName || userChoices.username || '')
  const [videoOn, setVideoOn] = useState(userChoices.videoEnabled ?? true)
  const [audioOn, setAudioOn] = useState(userChoices.audioEnabled ?? true)
  const [blurOn, setBlurOn] = useState(false)
  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null)
  const [permError, setPermError] = useState<'denied' | 'notfound' | 'other' | null>(null)
  const [devices, setDevices] = useState<{ cameras: MediaDeviceInfo[]; mics: MediaDeviceInfo[] }>({ cameras: [], mics: [] })
  const [selectedCamera, setSelectedCamera] = useState<string>('')
  const [selectedMic, setSelectedMic] = useState<string>('')
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    let mounted = true
    let stream: MediaStream | null = null

    async function init() {
      setPermError(null)
      if (!videoOn && !audioOn) {
        setPreviewStream(null)
        return
      }
      try {
        const videoConstraint = videoOn ? (selectedCamera ? { deviceId: { exact: selectedCamera }, width: 1280, height: 720 } : { width: 1280, height: 720 }) : false
        const audioConstraint = audioOn ? (selectedMic ? { deviceId: { exact: selectedMic } } : true) : false
        const s = await navigator.mediaDevices.getUserMedia({ video: videoConstraint, audio: audioConstraint })
        if (!mounted) {
          s.getTracks().forEach((t) => t.stop())
          return
        }
        stream = s
        setPreviewStream(videoOn ? s : null)

        // Enumera dispositivos só depois do primeiro getUserMedia (senão labels vêm vazios)
        const allDevices = await navigator.mediaDevices.enumerateDevices()
        setDevices({
          cameras: allDevices.filter((d) => d.kind === 'videoinput'),
          mics: allDevices.filter((d) => d.kind === 'audioinput'),
        })
      } catch (err: any) {
        if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') setPermError('denied')
        else if (err?.name === 'NotFoundError' || err?.name === 'DevicesNotFoundError') setPermError('notfound')
        else setPermError('other')
        setPreviewStream(null)
      }
    }

    init()

    return () => {
      mounted = false
      if (stream) stream.getTracks().forEach((t) => t.stop())
    }
  }, [videoOn, audioOn, selectedCamera, selectedMic])

  useEffect(() => {
    if (videoRef.current && previewStream) {
      videoRef.current.srcObject = previewStream
    }
  }, [previewStream])

  const canJoin = name.trim().length > 0

  return (
    <div className="h-dvh w-dvw relative overflow-hidden text-white flex items-center justify-center p-4" style={{ backgroundColor: '#0a0a0f' }}>
      {/* Ambient gradient background */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full bg-[#C9A240]/10 blur-3xl" />
        <div className="absolute -bottom-40 -right-40 w-[500px] h-[500px] rounded-full bg-[#BFC5CC]/10 blur-3xl" />
      </div>

      <div className="relative w-full max-w-5xl max-h-full grid md:grid-cols-[1.3fr_1fr] gap-4 md:gap-6 items-center">
        {/* Video preview */}
        <div className="relative aspect-video max-h-[50dvh] md:max-h-[70dvh] w-full rounded-3xl overflow-hidden border border-white/10 bg-[#15151b] shadow-2xl">
          {videoOn && previewStream ? (
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className="absolute inset-0 w-full h-full object-cover scale-x-[-1]"
            />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
              <div className="w-24 h-24 rounded-full bg-[#C9A240] flex items-center justify-center text-4xl font-semibold text-[#0D1829] shadow-xl">
                {(name || 'V').trim().charAt(0).toUpperCase()}
              </div>
              <p className="text-sm text-white/60">Câmera desligada</p>
            </div>
          )}

          {/* Overlay controls */}
          <div className="absolute inset-x-0 bottom-0 p-4 flex items-center justify-center gap-2 bg-gradient-to-t from-black/80 to-transparent">
            <CircleBtn on={audioOn} onClick={() => { setAudioOn(!audioOn); saveAudioInputEnabled(!audioOn) }} onIcon={<Mic />} offIcon={<MicOff />} label="Microfone" />
            <CircleBtn on={videoOn} onClick={() => { setVideoOn(!videoOn); saveVideoInputEnabled(!videoOn) }} onIcon={<VideoIcon />} offIcon={<VideoOff />} label="Câmera" />
            <CircleBtn on={blurOn} onClick={() => setBlurOn(!blurOn)} onIcon={<Sparkles />} offIcon={<Sparkles />} label="Blur de fundo" activeColor="accent" />
          </div>
        </div>

        {/* Join form */}
        <div className="relative rounded-3xl border border-white/10 bg-[#15151b]/80 backdrop-blur-xl p-6 md:p-8 shadow-2xl">
          <div className="flex items-center gap-2 mb-2">
            <div className="h-2 w-2 rounded-full bg-[#C9A240] animate-pulse" />
            <span className="text-xs font-mono tracking-wider text-[#C9A240] uppercase">Pronto pra entrar</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-semibold mb-1 text-white">Entrar na reunião</h1>
          <p className="text-sm text-white/60 mb-6">Digite seu nome pra entrar.</p>

          <label className="block text-xs font-medium text-white/60 mb-2 uppercase tracking-wider">Seu nome</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && canJoin && onJoin({ name: name.trim(), video: videoOn, audio: audioOn, blur: blurOn })}
            placeholder="Ex: João Silva"
            className="w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-white placeholder:text-white/30 focus:outline-none focus:border-[#C9A240] transition-all"
            autoFocus
          />

          {permError && (
            <div className="mt-3 rounded-lg bg-red-500/10 border border-red-500/30 p-3 text-xs text-red-300 space-y-1">
              <p className="font-semibold text-red-200">
                {permError === 'denied' ? 'Acesso à câmera/microfone bloqueado' :
                 permError === 'notfound' ? 'Nenhuma câmera ou microfone encontrado' :
                 'Não foi possível acessar os dispositivos'}
              </p>
              {permError === 'denied' && (
                <p className="text-red-300/80">Clique no ícone de cadeado na barra do navegador e libere câmera/microfone pra este site.</p>
              )}
            </div>
          )}

          {devices.cameras.length > 0 && (
            <div className="mt-3 space-y-2">
              <select
                value={selectedCamera}
                onChange={(e) => setSelectedCamera(e.target.value)}
                className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-xs text-white focus:outline-none focus:border-[#C9A240]"
              >
                <option value="">Câmera padrão</option>
                {devices.cameras.map((d) => (
                  <option key={d.deviceId} value={d.deviceId} className="bg-[#15151b]">
                    {d.label || `Câmera ${d.deviceId.slice(0, 8)}`}
                  </option>
                ))}
              </select>
              <select
                value={selectedMic}
                onChange={(e) => setSelectedMic(e.target.value)}
                className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-xs text-white focus:outline-none focus:border-[#C9A240]"
              >
                <option value="">Microfone padrão</option>
                {devices.mics.map((d) => (
                  <option key={d.deviceId} value={d.deviceId} className="bg-[#15151b]">
                    {d.label || `Microfone ${d.deviceId.slice(0, 8)}`}
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            onClick={() => onJoin({ name: name.trim(), video: videoOn, audio: audioOn, blur: blurOn })}
            disabled={!canJoin}
            className={cn(
              'mt-6 w-full cursor-pointer rounded-xl py-3.5 font-semibold text-base transition-all',
              'bg-[#BFC5CC] text-[#0D1829] hover:bg-white',
              'shadow-lg hover:shadow-xl',
              'disabled:opacity-40 disabled:cursor-not-allowed',
            )}
          >
            Entrar na sala
          </button>

          <a
            href={returnUrl}
            className="mt-3 flex items-center justify-center gap-1.5 text-xs text-white/50 hover:text-white transition-colors"
          >
            <ArrowLeft className="h-3 w-3" />
            Cancelar e voltar
          </a>

          <div className="mt-6 pt-6 border-t border-white/10 text-xs text-white/60 space-y-2">
            <p className="flex items-center gap-2">
              <Lock className="h-3.5 w-3.5 shrink-0 text-[#C9A240]" />
              Reunião privada e criptografada
            </p>
            <p className="flex items-center gap-2">
              <Film className="h-3.5 w-3.5 shrink-0 text-[#C9A240]" />
              Gravada automaticamente no seu espaço
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

function CircleBtn({
  on, onClick, onIcon, offIcon, label, activeColor = 'white',
}: {
  on: boolean
  onClick: () => void
  onIcon: React.ReactNode
  offIcon: React.ReactNode
  label: string
  activeColor?: 'white' | 'accent' | 'red'
}) {
  const activeClass =
    activeColor === 'accent' ? 'bg-accent text-accent-foreground hover:brightness-110' :
    activeColor === 'red' ? 'bg-destructive text-destructive-foreground hover:brightness-110' :
    'bg-white/15 hover:bg-white/25 text-white backdrop-blur-sm'
  const offClass = 'bg-destructive text-destructive-foreground hover:brightness-110'

  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        'h-11 w-11 md:h-12 md:w-12 rounded-full cursor-pointer transition-all flex items-center justify-center',
        'border border-white/10 shadow-lg',
        on ? activeClass : offClass,
      )}
    >
      <span className="[&>svg]:w-5 [&>svg]:h-5">{on ? onIcon : offIcon}</span>
    </button>
  )
}

// ─── Meeting Room ────────────────────────────────────────────────────────────

function MeetingRoom({
  isHost, isObserver, initialBlur, roomId, onLeave,
}: {
  isHost: boolean
  isObserver: boolean
  initialBlur: boolean
  roomId: string
  onLeave: () => void
}) {
  const tracks = useTracks(
    [{ source: Track.Source.Camera, withPlaceholder: true }, { source: Track.Source.ScreenShare, withPlaceholder: false }],
    { onlySubscribed: false },
  )

  const room = useRoomContext()
  const { localParticipant } = useLocalParticipant()
  const [startTime] = useState(Date.now())
  const [elapsed, setElapsed] = useState(0)
  const [showChat, setShowChat] = useState(false)
  const [showCaptions, setShowCaptions] = useState(false)
  const [mutedNotice, setMutedNotice] = useState(false)
  const [dbMeetingId, setDbMeetingId] = useState<string | null>(null)
  const participants = useParticipants()

  // Resolve meeting DB ID uma vez
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('meetings').select('id').eq('livekit_room_name', roomId).maybeSingle()
      if (data) setDbMeetingId((data as any).id)
    })()
  }, [roomId])

  const transcription = useMeetingTranscription({ meetingId: dbMeetingId, enabled: showCaptions })

  useEffect(() => {
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - startTime) / 1000)), 1000)
    return () => clearInterval(timer)
  }, [startTime])

  // Listen for host's "mute all" signal
  useEffect(() => {
    if (isHost) return
    const decoder = new TextDecoder()
    function onData(payload: Uint8Array) {
      try {
        const msg = JSON.parse(decoder.decode(payload))
        if (msg.type === 'mute_all' && !isObserver) {
          localParticipant.setMicrophoneEnabled(false)
          setMutedNotice(true)
          setTimeout(() => setMutedNotice(false), 4000)
        }
      } catch { /* ignore */ }
    }
    room.on(RoomEvent.DataReceived, onData as any)
    return () => { room.off(RoomEvent.DataReceived, onData as any) }
  }, [room, isHost, isObserver, localParticipant])

  const mm = Math.floor(elapsed / 60).toString().padStart(2, '0')
  const ss = (elapsed % 60).toString().padStart(2, '0')
  const hh = Math.floor(elapsed / 3600)
  const timeStr = hh > 0 ? `${hh}:${mm}:${ss}` : `${mm}:${ss}`

  const screenTracks = tracks.filter((t) => t.source === Track.Source.ScreenShare)
  const cameraTracks = tracks.filter((t) => t.source !== Track.Source.ScreenShare)
  const hasScreenShare = screenTracks.length > 0

  return (
    <div className="relative h-dvh w-dvw overflow-hidden flex flex-col text-white" style={{ backgroundColor: '#0a0a0f' }}>
      {/* Mute notice */}
      {mutedNotice && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-30 rounded-full bg-black/80 backdrop-blur-md border border-white/10 px-4 py-2 text-xs text-white flex items-center gap-2 animate-fade-in">
          <VolumeX className="w-3.5 h-3.5" />
          O host mutou seu microfone
        </div>
      )}

      {/* Top bar — todos à direita */}
      <div className="absolute top-4 right-4 z-20 flex items-center gap-2 pointer-events-auto">
        <div className="flex items-center gap-2 rounded-full bg-black/70 backdrop-blur-md border border-white/10 px-3 py-1.5">
          <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
          <span className="text-[11px] font-mono tracking-wider uppercase text-white">REC</span>
        </div>
        <div className="rounded-full bg-black/70 backdrop-blur-md border border-white/10 px-3 py-1.5 text-sm font-mono tabular-nums text-white">
          {timeStr}
        </div>
        <button
          onClick={() => setShowCaptions(!showCaptions)}
          title={showCaptions ? 'Desligar legendas' : 'Ligar legendas em tempo real'}
          className={cn(
            'h-9 px-3 rounded-full cursor-pointer transition-all flex items-center gap-1.5 text-xs font-medium',
            'backdrop-blur-md border border-white/10',
            showCaptions ? 'bg-[#C9A240] text-[#0D1829]' : 'bg-black/70 text-white hover:bg-black/90',
          )}
        >
          {showCaptions ? <Captions className="w-3.5 h-3.5" /> : <CaptionsOff className="w-3.5 h-3.5" />}
          <span className="hidden sm:inline">
            {showCaptions ? (transcription.status === 'live' ? 'Transcrevendo' : transcription.status === 'connecting' ? '...' : 'CC') : 'CC'}
          </span>
        </button>
        <button
          onClick={() => setShowChat(!showChat)}
          className={cn(
            'h-9 px-3 rounded-full cursor-pointer transition-all flex items-center gap-1.5 text-xs font-medium',
            'backdrop-blur-md border border-white/10',
            showChat ? 'bg-[#C9A240] text-[#0D1829]' : 'bg-black/70 text-white hover:bg-black/90',
          )}
        >
          <Users className="w-3.5 h-3.5" />
          {participants.length}
        </button>
      </div>

      {/* Captions overlay */}
      {showCaptions && transcription.transcripts.length > 0 && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-20 max-w-3xl w-[calc(100vw-32px)] rounded-2xl bg-black/75 backdrop-blur-md border border-white/10 px-5 py-3 pointer-events-none">
          <div className="space-y-1 max-h-[180px] overflow-hidden">
            {transcription.transcripts.slice(-4).map((t) => (
              <div key={t.id} className={cn('flex gap-2 text-sm', !t.is_final && 'opacity-60')}>
                <span className="text-[#C9A240] font-semibold shrink-0">{t.speaker}:</span>
                <span className="text-white">{t.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Video area */}
      <div className="flex-1 flex relative min-h-0">
        <div className={cn('flex-1 p-4 pt-20 pb-28 transition-all min-h-0 overflow-hidden', showChat && 'md:pr-[360px]')}>
          {tracks.length === 0 ? (
            <div className="h-full flex items-center justify-center text-white/50">
              <p>Aguardando participantes...</p>
            </div>
          ) : hasScreenShare ? (
            // Presenter layout: screen share grande à esquerda + coluna de câmeras à direita (estilo Google Meet)
            <div className="h-full flex flex-col md:flex-row gap-3">
              <div className="flex-1 min-h-0 min-w-0 rounded-2xl overflow-hidden border border-white/10 bg-black">
                {screenTracks.slice(0, 1).map((t) => (
                  <ParticipantTile key={`${t.participant.identity}-${t.source}`} trackRef={t} />
                ))}
              </div>
              {cameraTracks.length > 0 && (
                <div className="md:w-[220px] shrink-0 flex md:flex-col gap-2 md:overflow-y-auto overflow-x-auto">
                  {cameraTracks.map((t) => (
                    <div
                      key={`${t.participant.identity}-${t.source}`}
                      className="aspect-video w-[200px] md:w-full shrink-0 rounded-xl overflow-hidden border border-white/10 bg-black"
                    >
                      <ParticipantTile trackRef={t} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <GridLayout tracks={cameraTracks} style={{ height: '100%' }}>
              <ParticipantTile />
            </GridLayout>
          )}
        </div>

        {/* Chat panel */}
        {showChat && <ChatPanel onClose={() => setShowChat(false)} />}
      </div>

      {/* Control bar */}
      <ControlBar
        isObserver={isObserver}
        initialBlur={initialBlur}
        onLeave={onLeave}
        isHost={isHost}
        roomId={roomId}
      />
    </div>
  )
}

// ─── Control Bar ─────────────────────────────────────────────────────────────

type EffectMode =
  | { type: 'none' }
  | { type: 'blur'; strength: number }
  | { type: 'image'; url: string; label: string }

const PRESET_BACKGROUNDS: { url: string; label: string }[] = [
  { url: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=1280&q=75', label: 'Escritório' },
  { url: 'https://images.unsplash.com/photo-1497366811353-6870744d04b2?w=1280&q=75', label: 'Sala moderna' },
  { url: 'https://images.unsplash.com/photo-1499951360447-b19be8fe80f5?w=1280&q=75', label: 'Lounge' },
  { url: 'https://images.unsplash.com/photo-1564069114553-7215e1ff1890?w=1280&q=75', label: 'Biblioteca' },
  { url: 'https://images.unsplash.com/photo-1506748686214-e9df14d4d9d0?w=1280&q=75', label: 'Natureza' },
  { url: 'https://images.unsplash.com/photo-1531482615713-2afd69097998?w=1280&q=75', label: 'Praia' },
]

function ControlBar({
  isObserver, initialBlur, onLeave, isHost,
}: {
  isObserver: boolean
  initialBlur: boolean
  onLeave: () => void
  isHost: boolean
  roomId: string
}) {
  const { localParticipant } = useLocalParticipant()

  const [micOn, setMicOn] = useState(!isObserver)
  const [camOn, setCamOn] = useState(!isObserver)
  const [screenOn, setScreenOn] = useState(false)
  const [effect, setEffect] = useState<EffectMode>(initialBlur ? { type: 'blur', strength: 15 } : { type: 'none' })
  const [effectPending, setEffectPending] = useState(false)
  const [effectMenuOpen, setEffectMenuOpen] = useState(false)
  const [customBackgrounds, setCustomBackgrounds] = useState<{ url: string; label: string }[]>([])

  // Apply initial effect
  useEffect(() => {
    if (initialBlur && !isObserver) {
      applyEffect({ type: 'blur', strength: 15 }).catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function applyEffect(mode: EffectMode) {
    if (isObserver) return
    setEffectPending(true)
    try {
      const videoPub = localParticipant.getTrackPublication(Track.Source.Camera)
      const videoTrack = videoPub?.track as any
      if (!videoTrack) {
        setEffect(mode)
        return
      }
      if (mode.type === 'none') {
        await videoTrack.stopProcessor()
      } else if (mode.type === 'blur') {
        const processor = BackgroundBlur(mode.strength)
        await videoTrack.setProcessor(processor)
      } else if (mode.type === 'image') {
        const processor = VirtualBackground(mode.url)
        await videoTrack.setProcessor(processor)
      }
      setEffect(mode)
    } catch (err) {
      console.error('[effect] error:', err)
    } finally {
      setEffectPending(false)
    }
  }

  function handleUpload(file: File) {
    const reader = new FileReader()
    reader.onload = () => {
      const url = reader.result as string
      const label = file.name.replace(/\.[^.]+$/, '').slice(0, 20)
      setCustomBackgrounds((prev) => [{ url, label }, ...prev].slice(0, 6))
      applyEffect({ type: 'image', url, label })
    }
    reader.readAsDataURL(file)
  }

  const effectActive = effect.type !== 'none'

  async function toggleMic() {
    if (isObserver) return
    await localParticipant.setMicrophoneEnabled(!micOn)
    setMicOn(!micOn)
  }

  async function toggleCam() {
    if (isObserver) return
    await localParticipant.setCameraEnabled(!camOn)
    setCamOn(!camOn)
  }

  async function toggleScreen() {
    if (isObserver) return
    try {
      await localParticipant.setScreenShareEnabled(!screenOn)
      setScreenOn(!screenOn)
    } catch (err) {
      console.error('[screen share]', err)
    }
  }

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-40">
      {/* Effects popover */}
      {effectMenuOpen && !isObserver && (
        <EffectsPopover
          current={effect}
          onSelect={(m) => { applyEffect(m); setEffectMenuOpen(false) }}
          onUpload={handleUpload}
          onClose={() => setEffectMenuOpen(false)}
          custom={customBackgrounds}
          pending={effectPending}
        />
      )}

      <div className="flex items-center gap-1.5 rounded-full bg-[#15151b]/90 backdrop-blur-xl border border-white/10 px-2 py-2 shadow-2xl">
        {!isObserver && (
          <>
            <BarBtn on={micOn} onClick={toggleMic} onIcon={<Mic />} offIcon={<MicOff />} label="Microfone" offRed />
            <BarBtn on={camOn} onClick={toggleCam} onIcon={<VideoIcon />} offIcon={<VideoOff />} label="Câmera" offRed />
            <BarBtn
              on={effectActive}
              onClick={() => setEffectMenuOpen((v) => !v)}
              onIcon={<Sparkles />}
              offIcon={<Sparkles />}
              label="Efeitos de fundo"
              activeBg="accent"
              disabled={effectPending}
            />
            <BarBtn
              on={screenOn}
              onClick={toggleScreen}
              onIcon={<ScreenShareOff />}
              offIcon={<ScreenShare />}
              label="Compartilhar tela"
              activeBg="accent"
            />
            {isHost && (
              <BarBtn
                on={false}
                onClick={async () => {
                  // Muta o próprio + manda sinal pros outros via DataChannel
                  await localParticipant.setMicrophoneEnabled(false)
                  const encoder = new TextEncoder()
                  const payload = encoder.encode(JSON.stringify({ type: 'mute_all' }))
                  try { await localParticipant.publishData(payload, { reliable: true }) } catch { /* ignore */ }
                }}
                onIcon={<VolumeX />}
                offIcon={<VolumeX />}
                label="Silenciar todos"
                activeBg="accent"
              />
            )}
            <div className="w-px h-8 bg-white/10 mx-1" />
          </>
        )}
        <button
          onClick={onLeave}
          className="h-12 px-5 rounded-full cursor-pointer bg-red-600 text-white hover:bg-red-500 transition flex items-center gap-2 font-medium text-sm shadow-lg"
        >
          <PhoneOff className="w-4 h-4" />
          <span className="hidden sm:inline">{isHost ? 'Encerrar' : 'Sair'}</span>
        </button>
      </div>
    </div>
  )
}

function EffectsPopover({
  current, onSelect, onUpload, onClose, custom, pending,
}: {
  current: EffectMode
  onSelect: (mode: EffectMode) => void
  onUpload: (file: File) => void
  onClose: () => void
  custom: { url: string; label: string }[]
  pending: boolean
}) {
  const fileRef = useRef<HTMLInputElement>(null)

  const isActive = (m: EffectMode) => {
    if (m.type !== current.type) return false
    if (m.type === 'blur' && current.type === 'blur') return m.strength === current.strength
    if (m.type === 'image' && current.type === 'image') return m.url === current.url
    return m.type === current.type
  }

  return (
    <div className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 w-[360px] max-w-[calc(100vw-32px)] rounded-2xl bg-[#15151b] border border-white/10 shadow-2xl p-4 z-50">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-[#C9A240]" />
          <h3 className="text-sm font-semibold text-white">Efeitos de fundo</h3>
          {pending && (
            <span className="text-[10px] text-white/50">aplicando...</span>
          )}
        </div>
        <button onClick={onClose} className="cursor-pointer text-white/50 hover:text-white" aria-label="Fechar">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Blur + none options */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <EffectTile
          label="Nenhum"
          icon={<Ban className="w-4 h-4" />}
          active={isActive({ type: 'none' })}
          onClick={() => onSelect({ type: 'none' })}
        />
        <EffectTile
          label="Blur leve"
          icon={<Sparkles className="w-4 h-4" />}
          active={isActive({ type: 'blur', strength: 8 })}
          onClick={() => onSelect({ type: 'blur', strength: 8 })}
        />
        <EffectTile
          label="Blur forte"
          icon={<Sparkles className="w-4 h-4" />}
          active={isActive({ type: 'blur', strength: 20 })}
          onClick={() => onSelect({ type: 'blur', strength: 20 })}
        />
      </div>

      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-medium uppercase tracking-wider text-white/50">
          Imagens de fundo
        </span>
        <button
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-1 text-[10px] text-[#C9A240] hover:brightness-125 cursor-pointer"
        >
          <Upload className="w-3 h-3" />
          Enviar imagem
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) onUpload(f)
            if (e.target) e.target.value = ''
          }}
        />
      </div>

      {/* Backgrounds grid */}
      <div className="grid grid-cols-3 gap-2 max-h-[280px] overflow-y-auto">
        {[...custom, ...PRESET_BACKGROUNDS].map((bg, i) => {
          const active = isActive({ type: 'image', url: bg.url, label: bg.label })
          return (
            <button
              key={`${bg.url}-${i}`}
              onClick={() => onSelect({ type: 'image', url: bg.url, label: bg.label })}
              className={cn(
                'relative aspect-video rounded-lg overflow-hidden border-2 cursor-pointer group transition-all',
                active ? 'border-[#C9A240] ring-2 ring-[#C9A240]/40' : 'border-transparent hover:border-white/20',
              )}
              title={bg.label}
            >
              <img src={bg.url} alt={bg.label} className="absolute inset-0 w-full h-full object-cover" />
              <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity" />
              {active && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                  <Check className="w-5 h-5 text-[#C9A240]" />
                </div>
              )}
              <div className="absolute bottom-0 inset-x-0 px-1.5 py-1 bg-gradient-to-t from-black/80 to-transparent">
                <span className="text-[9px] font-medium text-white truncate block">{bg.label}</span>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function EffectTile({
  label, icon, active, onClick,
}: { label: string; icon: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex flex-col items-center gap-1.5 rounded-lg border p-3 transition-all cursor-pointer',
        active
          ? 'border-[#C9A240] bg-[#C9A240]/10 text-[#C9A240]'
          : 'border-white/10 bg-white/5 text-white/60 hover:border-[#C9A240]/40 hover:text-white',
      )}
    >
      {icon}
      <span className="text-[10px] font-medium">{label}</span>
    </button>
  )
}

function BarBtn({
  on, onClick, onIcon, offIcon, label, activeBg = 'dark', offRed = false, disabled = false,
}: {
  on: boolean
  onClick: () => void
  onIcon: React.ReactNode
  offIcon: React.ReactNode
  label: string
  activeBg?: 'dark' | 'accent'
  offRed?: boolean
  disabled?: boolean
}) {
  const onCls =
    activeBg === 'accent' ? 'bg-[#C9A240] text-[#0D1829] hover:brightness-110' :
    'bg-white/10 hover:bg-white/20 text-white'
  const offCls = offRed ? 'bg-red-600 text-white hover:bg-red-500' : 'bg-white/10 hover:bg-white/20 text-white/60'

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        'h-12 w-12 rounded-full cursor-pointer transition-all flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed',
        on ? onCls : offCls,
      )}
    >
      <span className="[&>svg]:w-5 [&>svg]:h-5">{on ? onIcon : offIcon}</span>
    </button>
  )
}

// ─── Chat Panel ──────────────────────────────────────────────────────────────

interface ChatMsg {
  id: string
  sender: string
  text: string
  timestamp: number
  isSelf: boolean
}

function ChatPanel({ onClose }: { onClose: () => void }) {
  const room = useRoomContext()
  const { localParticipant } = useLocalParticipant()
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [text, setText] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const decoder = new TextDecoder()
    function onData(payload: Uint8Array, participant: any) {
      try {
        const raw = decoder.decode(payload)
        const data = JSON.parse(raw)
        if (data.type === 'chat') {
          setMessages((prev) => [...prev, {
            id: `${Date.now()}-${Math.random()}`,
            sender: participant?.name || 'Participante',
            text: data.text,
            timestamp: Date.now(),
            isSelf: false,
          }])
        }
      } catch {
        // ignore
      }
    }
    room.on(RoomEvent.DataReceived, onData as any)
    return () => {
      room.off(RoomEvent.DataReceived, onData as any)
    }
  }, [room])

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages])

  async function send() {
    const t = text.trim()
    if (!t) return
    const encoder = new TextEncoder()
    const payload = encoder.encode(JSON.stringify({ type: 'chat', text: t }))
    try {
      await localParticipant.publishData(payload, { reliable: true })
      setMessages((prev) => [...prev, {
        id: `${Date.now()}`,
        sender: localParticipant.name || 'Você',
        text: t,
        timestamp: Date.now(),
        isSelf: true,
      }])
      setText('')
    } catch (err) {
      console.error('[chat] publish error', err)
    }
  }

  return (
    <div className="absolute top-16 right-4 bottom-24 w-[340px] max-w-[calc(100vw-32px)] rounded-2xl bg-[#15151b]/95 backdrop-blur-xl border border-white/10 flex flex-col shadow-2xl z-20">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-[#C9A240]" />
          <h3 className="text-sm font-semibold text-white">Chat</h3>
        </div>
        <button onClick={onClose} className="cursor-pointer text-white/50 hover:text-white">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 ? (
          <p className="text-xs text-white/40 text-center py-8">Nenhuma mensagem ainda</p>
        ) : messages.map((m) => (
          <div key={m.id} className={cn('flex flex-col', m.isSelf && 'items-end')}>
            <span className="text-[10px] uppercase tracking-wider text-white/40 mb-0.5">{m.sender}</span>
            <div className={cn(
              'rounded-2xl px-3 py-2 text-sm max-w-[85%]',
              m.isSelf ? 'bg-[#C9A240] text-[#0D1829] rounded-br-sm' : 'bg-white/10 text-white rounded-bl-sm',
            )}>
              {m.text}
            </div>
          </div>
        ))}
      </div>

      <div className="p-3 border-t border-white/10 flex items-center gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="Mensagem..."
          className="flex-1 rounded-full bg-white/5 border border-white/10 px-4 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-[#C9A240]"
        />
        <button
          onClick={send}
          disabled={!text.trim()}
          className="h-9 w-9 rounded-full cursor-pointer bg-[#C9A240] text-[#0D1829] hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

// ─── Shared screens ──────────────────────────────────────────────────────────

function FullScreenMessage({
  title, desc, returnUrl, success = false,
}: { title: string; desc: string; returnUrl: string; success?: boolean }) {
  function handleBack() {
    // Se foi aberta em nova aba (tem opener), fecha. Senão navega.
    if (window.opener && !window.opener.closed) {
      try { window.close() } catch { /* ignore */ }
      // Fallback se browser bloquear window.close()
      setTimeout(() => { window.location.href = returnUrl }, 300)
    } else {
      window.location.href = returnUrl
    }
  }

  return (
    <div className="h-dvh w-dvw flex items-center justify-center p-4 relative overflow-hidden text-white" style={{ backgroundColor: '#0a0a0f' }}>
      <div className="absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full bg-[#C9A240]/10 blur-3xl" />
      <div className="relative max-w-md w-full text-center">
        <div className={cn(
          'mx-auto mb-6 w-16 h-16 rounded-2xl flex items-center justify-center',
          success ? 'bg-[#C9A240]/20 text-[#C9A240]' : 'bg-red-500/20 text-red-400',
        )}>
          {success ? <CheckCircle2 className="w-8 h-8" /> : <PhoneOff className="w-8 h-8" />}
        </div>
        <h1 className="text-2xl font-semibold mb-2 text-white">{title}</h1>
        <p className="text-white/60 mb-8">{desc}</p>
        <button
          onClick={handleBack}
          className="inline-flex items-center gap-2 rounded-xl bg-[#BFC5CC] text-[#0D1829] hover:bg-white px-6 py-3 font-medium transition-all shadow-lg cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar
        </button>
      </div>
    </div>
  )
}

function FeedbackScreen({
  roomName, participantName, onDone,
}: { roomName: string; participantName: string; onDone: () => void }) {
  const [rating, setRating] = useState(0)
  const [hover, setHover] = useState(0)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function submit() {
    if (rating === 0) return
    setSubmitting(true)
    try {
      await supabase.from('meeting_feedback').insert({
        livekit_room_name: roomName,
        rating,
        comment: comment.trim() || null,
        respondent_name: participantName || null,
        respondent_role: 'guest',
      } as never)
    } catch (err) {
      console.error('[feedback] error:', err)
    } finally {
      setSubmitting(false)
      onDone()
    }
  }

  return (
    <div className="h-dvh w-dvw flex items-center justify-center p-4 relative overflow-hidden text-white" style={{ backgroundColor: '#0a0a0f' }}>
      <div className="absolute -top-40 -right-40 w-[500px] h-[500px] rounded-full bg-[#C9A240]/10 blur-3xl" />
      <div className="absolute -bottom-40 -left-40 w-[500px] h-[500px] rounded-full bg-[#BFC5CC]/10 blur-3xl" />

      <div className="relative w-full max-w-md rounded-3xl border border-white/10 bg-[#15151b]/90 backdrop-blur-xl p-7 shadow-2xl">
        <div className="mx-auto mb-5 w-14 h-14 rounded-2xl bg-[#C9A240]/15 text-[#C9A240] flex items-center justify-center">
          <Star className="w-6 h-6" />
        </div>

        <h1 className="text-xl font-semibold text-white text-center mb-1">Como foi sua reunião?</h1>
        <p className="text-sm text-white/60 text-center mb-6">
          Seu feedback ajuda a gente a melhorar o atendimento.
        </p>

        {/* Stars */}
        <div className="flex items-center justify-center gap-1 mb-5">
          {[1, 2, 3, 4, 5].map((n) => {
            const active = n <= (hover || rating)
            return (
              <button
                key={n}
                type="button"
                onClick={() => setRating(n)}
                onMouseEnter={() => setHover(n)}
                onMouseLeave={() => setHover(0)}
                aria-label={`${n} estrelas`}
                className="p-1.5 cursor-pointer transition-transform hover:scale-110"
              >
                <Star
                  className={cn(
                    'w-8 h-8 transition-colors',
                    active ? 'text-[#C9A240] fill-[#C9A240]' : 'text-white/20',
                  )}
                />
              </button>
            )
          })}
        </div>

        {rating > 0 && (
          <p className="text-center text-xs text-white/50 mb-4">
            {rating === 5 ? 'Excelente!' : rating === 4 ? 'Muito bom' : rating === 3 ? 'Bom' : rating === 2 ? 'Regular' : 'Precisa melhorar'}
          </p>
        )}

        <label className="block text-xs font-medium text-white/50 uppercase tracking-wider mb-2">
          Comentário <span className="text-white/30">(opcional)</span>
        </label>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Conta pra gente como foi a experiência..."
          rows={3}
          className="w-full rounded-xl bg-white/5 border border-white/10 px-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-[#C9A240] resize-none"
        />

        <div className="mt-5 flex items-center gap-2">
          <button
            onClick={onDone}
            className="flex-1 rounded-xl border border-white/10 bg-transparent text-white/60 hover:text-white hover:border-white/20 py-2.5 text-sm font-medium transition cursor-pointer"
          >
            Pular
          </button>
          <button
            onClick={submit}
            disabled={rating === 0 || submitting}
            className="flex-1 rounded-xl bg-[#C9A240] text-[#0D1829] hover:brightness-110 py-2.5 text-sm font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            {submitting ? 'Enviando...' : 'Enviar feedback'}
          </button>
        </div>
      </div>
    </div>
  )
}

function LoadingScreen() {
  return (
    <div className="h-dvh w-dvw flex items-center justify-center text-white" style={{ backgroundColor: '#0a0a0f' }}>
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 rounded-full border-2 border-[#C9A240] border-t-transparent animate-spin" />
        <p className="text-white/60 text-sm">Conectando...</p>
      </div>
    </div>
  )
}
