import { useCallback, useRef } from 'react'

type SoundKind = 'place' | 'win' | 'draw'

/** Minimal Web Audio beeps; fails silently if audio is blocked. */
export function useSound(enabled: boolean) {
  const ctxRef = useRef<AudioContext | null>(null)

  const getCtx = useCallback(() => {
    if (!ctxRef.current) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (!AC) return null
      ctxRef.current = new AC()
    }
    return ctxRef.current
  }, [])

  const play = useCallback(
    (kind: SoundKind) => {
      if (!enabled) return
      try {
        const ctx = getCtx()
        if (!ctx) return
        void ctx.resume()
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain)
        gain.connect(ctx.destination)

        const now = ctx.currentTime
        if (kind === 'place') {
          osc.frequency.value = 520
          gain.gain.setValueAtTime(0.08, now)
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08)
          osc.start(now)
          osc.stop(now + 0.09)
        } else if (kind === 'win') {
          osc.frequency.setValueAtTime(440, now)
          osc.frequency.setValueAtTime(554, now + 0.1)
          osc.frequency.setValueAtTime(659, now + 0.2)
          gain.gain.setValueAtTime(0.1, now)
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4)
          osc.start(now)
          osc.stop(now + 0.42)
        } else {
          osc.type = 'triangle'
          osc.frequency.value = 220
          gain.gain.setValueAtTime(0.08, now)
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25)
          osc.start(now)
          osc.stop(now + 0.27)
        }
      } catch {
        // autoplay / unsupported — ignore
      }
    },
    [enabled, getCtx],
  )

  return { play }
}
