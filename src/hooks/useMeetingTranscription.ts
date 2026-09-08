import { useEffect, useRef, useState } from 'react'
import { useTracks } from '@livekit/components-react'
import { Track } from 'livekit-client'
import { supabase } from '@/lib/supabase'

export interface TranscriptEntry {
  id: string
  speaker: string
  text: string
  is_final: boolean
  timestamp: number
}

interface Options {
  meetingId: string | null
  enabled: boolean
}

const SONIOX_WS_URL = 'wss://stt-rt.soniox.com/transcribe-websocket'
const TARGET_SAMPLE_RATE = 16000

export function useMeetingTranscription({ meetingId, enabled }: Options) {
  const micTracks = useTracks([Track.Source.Microphone], { onlySubscribed: false })
  const [transcripts, setTranscripts] = useState<TranscriptEntry[]>([])
  const [status, setStatus] = useState<'idle' | 'connecting' | 'live' | 'error'>('idle')
  const wsRef = useRef<WebSocket | null>(null)
  const ctxRef = useRef<AudioContext | null>(null)
  const processorsRef = useRef<Array<{ node: ScriptProcessorNode; source: MediaStreamAudioSourceNode; ctx: AudioContext }>>([])
  const finalsRef = useRef<TranscriptEntry[]>([])

  useEffect(() => {
    if (!enabled || !meetingId) return

    let cancelled = false

    ;(async () => {
      try {
        setStatus('connecting')

        const { data, error } = await supabase.functions.invoke('soniox-token', { body: {} })
        if (error || !data?.api_key) {
          console.error('[transcription] failed to get soniox key', error)
          setStatus('error')
          return
        }
        const apiKey = data.api_key

        if (cancelled) return

        const ws = new WebSocket(SONIOX_WS_URL)
        ws.binaryType = 'arraybuffer'
        wsRef.current = ws

        ws.onopen = () => {
          ws.send(JSON.stringify({
            api_key: apiKey,
            model: 'stt-rt-preview',
            language_hints: ['pt', 'en'],
            audio_format: 'pcm_s16le',
            sample_rate: TARGET_SAMPLE_RATE,
            num_channels: 1,
            enable_speaker_diarization: true,
            enable_non_final_tokens: true,
          }))
          setStatus('live')
        }

        ws.onmessage = (ev) => {
          try {
            const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : '')
            if (msg.tokens && Array.isArray(msg.tokens)) {
              processTokens(msg.tokens)
            }
            if (msg.error_code) {
              console.error('[transcription] soniox error:', msg)
              setStatus('error')
            }
          } catch { /* ignore */ }
        }

        ws.onerror = () => setStatus('error')
        ws.onclose = () => {
          if (!cancelled) setStatus('idle')
        }
      } catch (err) {
        console.error('[transcription] init error:', err)
        setStatus('error')
      }
    })()

    return () => {
      cancelled = true
      cleanup()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, meetingId])

  // Attach audio streams to the WebSocket once ready — MIX todos num unico stream
  useEffect(() => {
    if (status !== 'live' || !wsRef.current) return

    const ws = wsRef.current
    let ctx: AudioContext | null = null
    let processor: ScriptProcessorNode | null = null
    const sources: MediaStreamAudioSourceNode[] = []

    try {
      // Um unico AudioContext misturando todos os tracks
      ctx = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE })
      ctxRef.current = ctx

      // Gain node como mixer de entrada — todos os sources vao nele
      const mixer = ctx.createGain()
      mixer.gain.value = 1.0

      micTracks.forEach((tr) => {
        const mediaTrack = tr.publication?.track?.mediaStreamTrack || tr.publication?.audioTrack?.mediaStreamTrack
        if (!mediaTrack) return
        try {
          const stream = new MediaStream([mediaTrack])
          const source = ctx!.createMediaStreamSource(stream)
          source.connect(mixer)
          sources.push(source)
        } catch (err) {
          console.warn('[transcription] failed to attach source:', err)
        }
      })

      // UM ScriptProcessor no output do mix envia pro WS
      processor = ctx.createScriptProcessor(4096, 1, 1)
      mixer.connect(processor)
      processor.connect(ctx.destination)

      processor.onaudioprocess = (e) => {
        if (ws.readyState !== WebSocket.OPEN) return
        const input = e.inputBuffer.getChannelData(0)
        const pcm = floatToInt16(input)
        ws.send(pcm.buffer)
      }
    } catch (err) {
      console.error('[transcription] mixer setup error:', err)
    }

    return () => {
      sources.forEach((s) => { try { s.disconnect() } catch { /* ignore */ } })
      try { processor?.disconnect() } catch { /* ignore */ }
      try { ctx?.close() } catch { /* ignore */ }
      if (ctxRef.current === ctx) ctxRef.current = null
    }
  }, [status, micTracks])

  // Periodically save to DB
  useEffect(() => {
    if (!meetingId || !enabled) return
    const interval = setInterval(() => {
      if (finalsRef.current.length === 0) return
      const snapshot = finalsRef.current.map((t) => ({
        speaker: t.speaker,
        text: t.text,
        timestamp: t.timestamp,
      }))
      supabase
        .from('meetings')
        .update({ transcriptions: snapshot } as never)
        .eq('id', meetingId)
        .then(() => {})
    }, 15000)

    return () => clearInterval(interval)
  }, [meetingId, enabled])

  function processTokens(tokens: any[]) {
    // Accumulate final tokens; merge interim preview per speaker
    setTranscripts((prev) => {
      const next = [...prev]
      const lastBySpeaker = new Map<string, TranscriptEntry>()
      next.forEach((t) => { if (!t.is_final) lastBySpeaker.set(t.speaker, t) })

      for (const tk of tokens) {
        const text: string = tk.text || ''
        if (!text) continue
        const speakerId = tk.speaker ? `Pessoa ${tk.speaker}` : 'Pessoa'
        const isFinal = !!tk.is_final

        if (isFinal) {
          // Append to last final entry for the same speaker if recent
          const lastFinal = [...next].reverse().find((t) => t.is_final && t.speaker === speakerId)
          const now = Date.now()
          if (lastFinal && (now - lastFinal.timestamp) < 3000) {
            lastFinal.text += text
            lastFinal.timestamp = now
          } else {
            next.push({ id: `${now}-${Math.random()}`, speaker: speakerId, text, is_final: true, timestamp: now })
          }
        } else {
          // Interim - replace last non-final for this speaker
          const interim = lastBySpeaker.get(speakerId)
          if (interim) {
            interim.text = text
            interim.timestamp = Date.now()
          } else {
            next.push({ id: `${Date.now()}-${Math.random()}`, speaker: speakerId, text, is_final: false, timestamp: Date.now() })
          }
        }
      }

      // Keep non-finals always at the end, finals in order
      const finals = next.filter((t) => t.is_final)
      const nonFinals = next.filter((t) => !t.is_final)
      finalsRef.current = finals
      return [...finals, ...nonFinals].slice(-50)
    })
  }

  function cleanup() {
    processorsRef.current.forEach((p) => {
      try { p.source.disconnect() } catch { /* ignore */ }
      try { p.node.disconnect() } catch { /* ignore */ }
      try { p.ctx.close() } catch { /* ignore */ }
    })
    processorsRef.current = []
    try { ctxRef.current?.close() } catch { /* ignore */ }
    ctxRef.current = null
    if (wsRef.current) {
      try {
        if (wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: 'end' }))
        }
        wsRef.current.close()
      } catch { /* ignore */ }
      wsRef.current = null
    }
  }

  return { transcripts, status }
}

function floatToInt16(float32: Float32Array): Int16Array {
  const out = new Int16Array(float32.length)
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]))
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  return out
}
