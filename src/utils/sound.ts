/** Minimal Web Audio beeps; safe if autoplay is blocked. */

let ctx: AudioContext | null = null

function getCtx(): AudioContext | null {
  try {
    if (typeof window === 'undefined') return null
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return null
    if (!ctx) ctx = new AC()
    return ctx
  } catch {
    return null
  }
}

function tone(freq: number, durationMs: number, type: OscillatorType = 'sine', gain = 0.04): void {
  const audio = getCtx()
  if (!audio) return
  void audio.resume().catch(() => undefined)

  const osc = audio.createOscillator()
  const g = audio.createGain()
  osc.type = type
  osc.frequency.value = freq
  g.gain.value = gain
  osc.connect(g)
  g.connect(audio.destination)

  const now = audio.currentTime
  g.gain.setValueAtTime(gain, now)
  g.gain.exponentialRampToValueAtTime(0.001, now + durationMs / 1000)
  osc.start(now)
  osc.stop(now + durationMs / 1000)
}

export function playPlaceSound(enabled: boolean): void {
  if (!enabled) return
  try {
    tone(520, 60, 'triangle', 0.03)
  } catch {
    // ignore
  }
}

export function playWinSound(enabled: boolean): void {
  if (!enabled) return
  try {
    tone(660, 80, 'sine', 0.04)
    setTimeout(() => tone(880, 120, 'sine', 0.04), 90)
  } catch {
    // ignore
  }
}

export function playDrawSound(enabled: boolean): void {
  if (!enabled) return
  try {
    tone(300, 150, 'sine', 0.03)
  } catch {
    // ignore
  }
}
