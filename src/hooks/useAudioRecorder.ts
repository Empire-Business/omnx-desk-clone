import { useCallback, useEffect, useRef, useState } from 'react'

export function useAudioRecorder() {
  const [isRecording, setIsRecording] = useState(false)
  const [duration, setDuration] = useState(0)
  const mounted = useRef(true)
  const generation = useRef(0)
  const starting = useRef(false)
  const recorder = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  const finishStop = useRef<((file: File | null) => void) | null>(null)

  const release = useCallback(() => {
    generation.current++
    starting.current = false
    if (timer.current) clearInterval(timer.current)
    timer.current = null
    const current = recorder.current
    recorder.current = null
    if (current) {
      current.onstop = null
      current.ondataavailable = null
      if (current.state !== 'inactive') current.stop()
      current.stream.getTracks().forEach(track => track.stop())
    }
    chunks.current = []
    finishStop.current?.(null)
    finishStop.current = null
  }, [])

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; release() }
  }, [release])

  const startRecording = useCallback(async () => {
    if (starting.current || recorder.current) return
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      throw new Error('Este navegador não permite gravar áudio. Você pode anexar um arquivo de áudio.')
    }
    const request = ++generation.current
    starting.current = true
    let stream: MediaStream | undefined
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (!mounted.current || request !== generation.current) {
        stream.getTracks().forEach(track => track.stop())
        return
      }
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
        .find(type => MediaRecorder.isTypeSupported(type))
      const current = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      recorder.current = current
      chunks.current = []
      current.ondataavailable = event => { if (event.data.size) chunks.current.push(event.data) }
      current.start(100)
      setIsRecording(true)
      setDuration(0)
      timer.current = setInterval(() => setDuration(value => value + 1), 1000)
    } catch (error) {
      stream?.getTracks().forEach(track => track.stop())
      if (request === generation.current) {
        recorder.current = null
        if (mounted.current) throw error
      }
    } finally {
      if (request === generation.current) starting.current = false
    }
  }, [])

  const stopRecording = useCallback((): Promise<File | null> => {
    const current = recorder.current
    if (!current || current.state === 'inactive' || finishStop.current) return Promise.resolve(null)
    return new Promise(resolve => {
      finishStop.current = resolve
      current.onstop = () => {
        const type = current.mimeType || 'audio/webm'
        const extension = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm'
        const file = new File(chunks.current, `audio_${Date.now()}.${extension}`, { type })
        current.stream.getTracks().forEach(track => track.stop())
        recorder.current = null
        chunks.current = []
        finishStop.current = null
        resolve(mounted.current ? file : null)
      }
      current.stop()
      setIsRecording(false)
      if (timer.current) clearInterval(timer.current)
      timer.current = null
    })
  }, [])

  const cancelRecording = useCallback(() => {
    release()
    if (mounted.current) { setIsRecording(false); setDuration(0) }
  }, [release])

  const formatDuration = useCallback((seconds: number) =>
    `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`, [])

  return { isRecording, duration, startRecording, stopRecording, cancelRecording, formatDuration }
}
