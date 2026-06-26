import { describe, expect, it } from 'vitest'
import {
  applyMove,
  chooseFortressCell,
  createGame,
  isAiTurn,
  isSiegeSetup,
  placeFortress,
} from '../src/game'

describe('siege mode', () => {
  it('starts in siege_setup when enabled', () => {
    const g = createGame({ settings: { siegeMode: true, mode: 'local_pvp', firstPlayer: 'X' } })
    expect(g.phase).toBe('siege_setup')
    expect(isSiegeSetup(g)).toBe(true)
  })

  it('places fortresses then enters playing', () => {
    let g = createGame({ settings: { siegeMode: true, mode: 'local_pvp', firstPlayer: 'X' } })
    for (const cell of [0, 1]) {
      const r = placeFortress(g, cell)
      expect(r.ok).toBe(true)
      if (!r.ok) return
      g = r.state
    }
    expect(g.currentPlayer).toBe('O')
    for (const cell of [2, 3]) {
      const r = placeFortress(g, cell)
      expect(r.ok).toBe(true)
      if (!r.ok) return
      g = r.state
    }
    expect(g.phase).toBe('playing')
    expect(g.currentPlayer).toBe('X')
    expect(g.fortresses.X).toEqual([0, 1])
    expect(g.fortresses.O).toEqual([2, 3])
  })

  it('hitting enemy fortress grants extra turn', () => {
    let g = createGame({ settings: { siegeMode: true, mode: 'local_pvp', firstPlayer: 'X' } })
    // X forts 0,1 — O forts 8,7 — then play
    for (const cell of [0, 1, 8, 7]) {
      const r = placeFortress(g, cell)
      if (!r.ok) throw new Error('setup')
      g = r.state
    }
    expect(g.phase).toBe('playing')
    // X places on O fortress 8
    const r = applyMove(g, 8)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    g = r.state
    expect(g.board[8]).toBe('X')
    expect(g.currentPlayer).toBe('X') // extra turn
    expect(g.lastFortressHit?.attacker).toBe('X')
    expect(g.revealedFortresses).toContain(8)
    expect(g.fortresses.O).not.toContain(8)
  })

  it('AI can choose fortress cells during setup', () => {
    let g = createGame({
      settings: {
        siegeMode: true,
        mode: 'vs_ai',
        humanPlayer: 'O',
        firstPlayer: 'X',
        difficulty: 'easy',
      },
    })
    expect(isAiTurn(g)).toBe(true)
    expect(isSiegeSetup(g)).toBe(true)
    const cell = chooseFortressCell(g)
    const r = placeFortress(g, cell)
    expect(r.ok).toBe(true)
  })

  it('disabled without siegeMode', () => {
    const g = createGame({ settings: { siegeMode: false } })
    expect(placeFortress(g, 0).ok).toBe(false)
    expect(g.phase).toBe('playing')
  })
})
