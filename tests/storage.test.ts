import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SCORES,
  DEFAULT_SETTINGS,
  deserializePersisted,
  serializePersisted,
  STORAGE_VERSION,
} from '../src/game'

describe('storage helpers', () => {
  it('round-trips valid data', () => {
    const scores = { X: 2, O: 1, draws: 1 }
    const settings = { ...DEFAULT_SETTINGS, theme: 'dark' as const, soundEnabled: true }
    const raw = serializePersisted(scores, settings)
    const data = deserializePersisted(raw)
    expect(data).not.toBeNull()
    expect(data?.version).toBe(STORAGE_VERSION)
    expect(data?.scores).toEqual(scores)
    expect(data?.settings.theme).toBe('dark')
    expect(data?.settings.soundEnabled).toBe(true)
  })

  it('returns null for corrupt JSON', () => {
    expect(deserializePersisted('not-json{{{')).toBeNull()
  })

  it('round-trips progression state', () => {
    const progression = { boardSize: 5 as const, pendingEscalation: true }
    const raw = serializePersisted(DEFAULT_SCORES, DEFAULT_SETTINGS, progression)
    const data = deserializePersisted(raw)
    expect(data?.progression).toEqual(progression)
  })

  it('migrates v1 payloads without progression', () => {
    const v1 = JSON.stringify({
      version: 1,
      scores: DEFAULT_SCORES,
      settings: DEFAULT_SETTINGS,
    })
    const data = deserializePersisted(v1)
    expect(data).not.toBeNull()
    expect(data?.progression).toEqual({ boardSize: 3, pendingEscalation: false })
  })

  it('returns null for wrong version', () => {
    const bad = JSON.stringify({
      version: 999,
      scores: DEFAULT_SCORES,
      settings: DEFAULT_SETTINGS,
    })
    expect(deserializePersisted(bad)).toBeNull()
  })

  it('returns null for missing fields', () => {
    expect(deserializePersisted(JSON.stringify({ version: 1 }))).toBeNull()
  })

  it('returns null for null/empty input', () => {
    expect(deserializePersisted(null)).toBeNull()
    expect(deserializePersisted('')).toBeNull()
  })
})
