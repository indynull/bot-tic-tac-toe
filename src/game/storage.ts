import type { PersistedData, Scores, Settings } from './types'
import { DEFAULT_SCORES, DEFAULT_SETTINGS, STORAGE_KEY, STORAGE_VERSION } from './types'

function isPlayer(v: unknown): v is 'X' | 'O' {
  return v === 'X' || v === 'O'
}

function isScores(v: unknown): v is Scores {
  if (!v || typeof v !== 'object') return false
  const s = v as Record<string, unknown>
  return (
    typeof s.X === 'number' &&
    typeof s.O === 'number' &&
    typeof s.draws === 'number' &&
    s.X >= 0 &&
    s.O >= 0 &&
    s.draws >= 0
  )
}

function isSettings(v: unknown): v is Settings {
  if (!v || typeof v !== 'object') return false
  const s = v as Record<string, unknown>
  return (
    isPlayer(s.firstPlayer) &&
    isPlayer(s.humanPlayer) &&
    (s.mode === 'local_pvp' || s.mode === 'vs_ai') &&
    (s.difficulty === 'easy' || s.difficulty === 'medium' || s.difficulty === 'hard') &&
    (s.theme === 'light' || s.theme === 'dark') &&
    typeof s.soundEnabled === 'boolean'
  )
}

export function serializePersisted(scores: Scores, settings: Settings): string {
  const data: PersistedData = {
    version: STORAGE_VERSION,
    scores,
    settings,
  }
  return JSON.stringify(data)
}

export function deserializePersisted(raw: string | null): PersistedData | null {
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    const obj = parsed as Record<string, unknown>
    if (obj.version !== STORAGE_VERSION) return null
    if (!isScores(obj.scores) || !isSettings(obj.settings)) return null
    return {
      version: STORAGE_VERSION,
      scores: obj.scores,
      settings: obj.settings,
    }
  } catch {
    return null
  }
}

export function loadPersisted(): { scores: Scores; settings: Settings } {
  if (typeof localStorage === 'undefined') {
    return { scores: { ...DEFAULT_SCORES }, settings: { ...DEFAULT_SETTINGS } }
  }
  try {
    const data = deserializePersisted(localStorage.getItem(STORAGE_KEY))
    if (!data) {
      return { scores: { ...DEFAULT_SCORES }, settings: getDefaultSettingsWithTheme() }
    }
    return { scores: data.scores, settings: data.settings }
  } catch {
    return { scores: { ...DEFAULT_SCORES }, settings: getDefaultSettingsWithTheme() }
  }
}

function getDefaultSettingsWithTheme(): Settings {
  const settings = { ...DEFAULT_SETTINGS }
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
    settings.theme = 'dark'
  }
  return settings
}

export function savePersisted(scores: Scores, settings: Settings): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, serializePersisted(scores, settings))
  } catch {
    // quota / private mode — ignore
  }
}
