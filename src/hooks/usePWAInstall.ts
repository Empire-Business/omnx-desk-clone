import { useState, useEffect, useCallback, useRef } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isInstalled, setIsInstalled] = useState(false)
  const [isIOS, setIsIOS] = useState(false)
  const [isStandalone, setIsStandalone] = useState(false)
  const [swReady, setSwReady] = useState(false)
  const promptRef = useRef<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    // Check if already installed (standalone mode)
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as any).standalone === true
    setIsStandalone(standalone)
    setIsInstalled(standalone)

    // Detect iOS
    const ua = navigator.userAgent
    const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    setIsIOS(ios)

    // Check if service worker is ready
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then(() => setSwReady(true))
    }

    // Capture the beforeinstallprompt event (Chrome/Edge/Android)
    // This event fires when Chrome determines the app is installable
    function handleBeforeInstall(e: Event) {
      e.preventDefault()
      const evt = e as BeforeInstallPromptEvent
      promptRef.current = evt
      setDeferredPrompt(evt)
    }

    // Detect when app is installed
    function handleAppInstalled() {
      setIsInstalled(true)
      setDeferredPrompt(null)
      promptRef.current = null
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstall)
    window.addEventListener('appinstalled', handleAppInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  const install = useCallback(async () => {
    // Use ref as fallback (state might be stale in some closure scenarios)
    const prompt = deferredPrompt ?? promptRef.current
    if (!prompt) return false
    await prompt.prompt()
    const { outcome } = await prompt.userChoice
    if (outcome === 'accepted') {
      setIsInstalled(true)
      setDeferredPrompt(null)
      promptRef.current = null
    }
    return outcome === 'accepted'
  }, [deferredPrompt])

  return {
    canInstall: (!!deferredPrompt || !!promptRef.current) && !isInstalled,
    isInstalled,
    isIOS,
    isStandalone,
    swReady,
    install,
  }
}
