import { describe, expect, it } from 'vitest'
import {
  deserializeSession,
  serializeSession,
} from '../src/utils/storage'
import { DEFAULT_SCORES, DEFAULT_SETTINGS } from '../src/game/engine'

describe('storage helpers', () => {
  it('round-trips valid session', () => {
    const scores = { X: 2, O: 1, draws: 3 }
    const settings = { ...DEFAULT_SETTINGS, theme: 'dark' as const, difficulty: 'hard' as const }
    const json = serializeSession(scores, settings)
    const parsed = deserializeSession(json)
    expect(parsed).toEqual({ version: 1, scores, settings })
  })

  it('returns null for corrupt JSON', () => {
    expect(deserializeSession('not-json')).toBeNull()
    expect(deserializeSession('{}')).toBeNull()
    expect(deserializeSession(JSON.stringify({ version: 1, scores: DEFAULT_SCORES }))).toBeNull()
  })

  it('returns null for wrong version', () => {
    const json = JSON.stringify({
      version: 99,
      scores: DEFAULT_SCORES,
      settings: DEFAULT_SETTINGS,
    })
    expect(deserializeSession(json)).toBeNull()
  })

  it('returns null for invalid score types', () => {
    const json = JSON.stringify({
      version: 1,
      scores: { X: 'nope', O: 0, draws: 0 },
      settings: DEFAULT_SETTINGS,
    })
    expect(deserializeSession(json)).toBeNull()
  })
})
