import type { BoardSize, PersistedData, ProgressionState, Scores, Settings } from './types'
import {
  clampBoardSize,
  DEFAULT_PROGRESSION,
  DEFAULT_SCORES,
  DEFAULT_SETTINGS,
  STORAGE_KEY,
  STORAGE_VERSION,
} from './types'

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
    (s.difficulty === 'easy' ||
      s.difficulty === 'medium' ||
      s.difficulty === 'hard' ||
      s.difficulty === 'impossible') &&
    (s.theme === 'light' || s.theme === 'dark') &&
    typeof s.soundEnabled === 'boolean'
  )
}

function isProgression(v: unknown): v is ProgressionState {
  if (!v || typeof v !== 'object') return false
  const p = v as Record<string, unknown>
  if (typeof p.pendingEscalation !== 'boolean') return false
  if (typeof p.boardSize !== 'number') return false
  const size = clampBoardSize(p.boardSize)
  return size === p.boardSize
}

export function serializePersisted(
  scores: Scores,
  settings: Settings,
  progression: ProgressionState = DEFAULT_PROGRESSION,
): string {
  const data: PersistedData = {
    version: STORAGE_VERSION,
    scores,
    settings,
    progression: {
      boardSize: clampBoardSize(progression.boardSize) as BoardSize,
      pendingEscalation: progression.pendingEscalation,
    },
  }
  return JSON.stringify(data)
}

export function deserializePersisted(raw: string | null): PersistedData | null {
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    const obj = parsed as Record<string, unknown>
    // Accept v1 (scores+settings only) and v2 (+progression)
    if (obj.version !== 1 && obj.version !== STORAGE_VERSION) return null
    if (!isScores(obj.scores) || !isSettings(obj.settings)) return null
    const progression = isProgression(obj.progression) ? obj.progression : { ...DEFAULT_PROGRESSION }
    return {
      version: STORAGE_VERSION,
      scores: obj.scores,
      settings: obj.settings,
      progression,
    }
  } catch {
    return null
  }
}

export function loadPersisted(): {
  scores: Scores
  settings: Settings
  progression: ProgressionState
} {
  if (typeof localStorage === 'undefined') {
    return {
      scores: { ...DEFAULT_SCORES },
      settings: { ...DEFAULT_SETTINGS },
      progression: { ...DEFAULT_PROGRESSION },
    }
  }
  try {
    const data = deserializePersisted(localStorage.getItem(STORAGE_KEY))
    if (!data) {
      return {
        scores: { ...DEFAULT_SCORES },
        settings: getDefaultSettingsWithTheme(),
        progression: { ...DEFAULT_PROGRESSION },
      }
    }
    return {
      scores: data.scores,
      settings: data.settings,
      progression: data.progression ?? { ...DEFAULT_PROGRESSION },
    }
  } catch {
    return {
      scores: { ...DEFAULT_SCORES },
      settings: getDefaultSettingsWithTheme(),
      progression: { ...DEFAULT_PROGRESSION },
    }
  }
}

function getDefaultSettingsWithTheme(): Settings {
  const settings = { ...DEFAULT_SETTINGS }
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
    settings.theme = 'dark'
  }
  return settings
}

export function savePersisted(
  scores: Scores,
  settings: Settings,
  progression: ProgressionState = DEFAULT_PROGRESSION,
): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, serializePersisted(scores, settings, progression))
  } catch {
    // quota / private mode — ignore
  }
}
