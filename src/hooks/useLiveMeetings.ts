import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export function useLiveMeetingsCount(): number {
  const [count, setCount] = useState(0)

  useEffect(() => {
    let mounted = true

    async function load() {
      const { data } = await supabase
        .from('meetings')
        .select('id')
        .or('status.eq.active,recording_status.eq.recording')

      if (mounted) setCount(data?.length ?? 0)
    }

    load()
    const interval = setInterval(load, 15000)

    return () => {
      mounted = false
      clearInterval(interval)
    }
  }, [])

  return count
}
