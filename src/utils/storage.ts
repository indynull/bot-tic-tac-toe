import type { Scores, Settings, Theme } from '../game/types'
import { DEFAULT_SCORES, DEFAULT_SETTINGS } from '../game/engine'

export const STORAGE_KEY = 'ttt-session-v1'

export interface PersistedSession {
  version: 1
  scores: Scores
  settings: Settings
}

function isPlayer(value: unknown): value is 'X' | 'O' {
  return value === 'X' || value === 'O'
}

function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark'
}

function isDifficulty(value: unknown): value is Settings['difficulty'] {
  return value === 'easy' || value === 'medium' || value === 'hard'
}

function isMode(value: unknown): value is Settings['mode'] {
  return value === 'local_pvp' || value === 'vs_ai'
}

function parseScores(raw: unknown): Scores | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  if (
    typeof obj.X !== 'number' ||
    typeof obj.O !== 'number' ||
    typeof obj.draws !== 'number' ||
    !Number.isFinite(obj.X) ||
    !Number.isFinite(obj.O) ||
    !Number.isFinite(obj.draws)
  ) {
    return null
  }
  return {
    X: Math.max(0, Math.floor(obj.X)),
    O: Math.max(0, Math.floor(obj.O)),
    draws: Math.max(0, Math.floor(obj.draws)),
  }
}

function parseSettings(raw: unknown): Settings | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  if (
    !isPlayer(obj.firstPlayer) ||
    !isMode(obj.mode) ||
    !isDifficulty(obj.difficulty) ||
    !isTheme(obj.theme) ||
    typeof obj.soundEnabled !== 'boolean' ||
    !isPlayer(obj.humanPlayer)
  ) {
    return null
  }
  return {
    firstPlayer: obj.firstPlayer,
    mode: obj.mode,
    difficulty: obj.difficulty,
    theme: obj.theme,
    soundEnabled: obj.soundEnabled,
    humanPlayer: obj.humanPlayer,
  }
}

export function serializeSession(scores: Scores, settings: Settings): string {
  const payload: PersistedSession = {
    version: 1,
    scores: { ...scores },
    settings: { ...settings },
  }
  return JSON.stringify(payload)
}

export function deserializeSession(json: string): PersistedSession | null {
  try {
    const data = JSON.parse(json) as unknown
    if (!data || typeof data !== 'object') return null
    const obj = data as Record<string, unknown>
    if (obj.version !== 1) return null
    const scores = parseScores(obj.scores)
    const settings = parseSettings(obj.settings)
    if (!scores || !settings) return null
    return { version: 1, scores, settings }
  } catch {
    return null
  }
}

export function loadSession(): PersistedSession | null {
  try {
    if (typeof localStorage === 'undefined') return null
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return deserializeSession(raw)
  } catch {
    return null
  }
}

export function saveSession(scores: Scores, settings: Settings): void {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(STORAGE_KEY, serializeSession(scores, settings))
  } catch {
    // Quota / private mode — ignore.
  }
}

export function defaultThemeFromSystem(): Theme {
  try {
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
      return 'dark'
    }
  } catch {
    // ignore
  }
  return DEFAULT_SETTINGS.theme
}

export function buildInitialSettings(overrides?: Partial<Settings>): Settings {
  const stored = loadSession()
  const base = stored?.settings ?? { ...DEFAULT_SETTINGS, theme: defaultThemeFromSystem() }
  return { ...base, ...overrides }
}

export function buildInitialScores(): Scores {
  const stored = loadSession()
  return stored?.scores ?? { ...DEFAULT_SCORES }
}
