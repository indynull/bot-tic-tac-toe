import { describe, expect, it } from 'vitest'
import {
  applyMove,
  createGame,
  plantMine,
  undoMove,
} from '../src/game'

describe('mine mode', () => {
  it('plantMine uses turn and hides mine for owner', () => {
    let g = createGame({ settings: { mineMode: true, mode: 'local_pvp', firstPlayer: 'X' } })
    expect(g.minesRemaining.X).toBe(2)
    const r = plantMine(g, 4)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    g = r.state
    expect(g.mines[4]).toBe('X')
    expect(g.minesRemaining.X).toBe(1)
    expect(g.currentPlayer).toBe('O')
    expect(g.board[4]).toBeNull()
    expect(g.justPlantedMine).toBe(true)
  })

  it('stepping on enemy mine gives the cell to the trap owner', () => {
    let g = createGame({ settings: { mineMode: true, mode: 'local_pvp', firstPlayer: 'X' } })
    // X places center
    let r = applyMove(g, 4)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    g = r.state
    // O plants on corner 0
    r = plantMine(g, 0)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    g = r.state
    // X steps on 0 — O (owner) gets cell 0; may steal X's center
    r = applyMove(g, 0)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    g = r.state
    expect(g.board[0]).toBe('O')
    expect(g.board[4]).toBe('O') // stolen from X
    expect(g.mines[0]).toBeUndefined()
    expect(g.lastMineEvent?.stepper).toBe('X')
    expect(g.lastMineEvent?.owner).toBe('O')
    expect(g.currentPlayer).toBe('O') // owner to move after trap
  })

  it('mine trigger converts a mark from the stepper to the owner', () => {
    let g = createGame({ settings: { mineMode: true, mode: 'local_pvp', firstPlayer: 'X' } })
    for (const m of [4, 0]) {
      // X center, O corner
      const r = applyMove(g, m)
      if (!r.ok) throw new Error('setup')
      g = r.state
    }
    // X plants on 8
    let r = plantMine(g, 8)
    if (!r.ok) throw new Error('plant')
    g = r.state
    // O steps on 8 — X owns the trap: cell 8 is X, O's corner 0 flips to X
    r = applyMove(g, 8)
    if (!r.ok) throw new Error('step')
    g = r.state
    expect(g.board[8]).toBe('X')
    expect(g.board[0]).toBe('X')
    expect(g.board[4]).toBe('X')
    expect(g.lastMineEvent?.capturedIndex).toBe(0)
    // X may have already won via the trap conversion (3-in-a-row)
    if (g.status === 'won') {
      expect(g.winner).toBe('X')
    } else {
      expect(g.currentPlayer).toBe('X')
    }
  })

  it('disabled without mineMode', () => {
    const g = createGame({ settings: { mineMode: false } })
    expect(plantMine(g, 0).ok).toBe(false)
  })

  it('undo restores mines via replay', () => {
    let g = createGame({ settings: { mineMode: true, mode: 'local_pvp' } })
    let r = plantMine(g, 1)
    if (!r.ok) throw new Error('plant')
    g = r.state
    expect(g.mines[1]).toBe('X')
    g = undoMove(g)
    expect(g.mines[1]).toBeUndefined()
    expect(g.minesRemaining.X).toBe(2)
    expect(g.currentPlayer).toBe('X')
  })

  it('after human (O) plants, it is AI (X) turn in vs_ai defaults', () => {
    // Defaults: human O, first X — AI should open; simulate AI placed then human plants.
    let g = createGame({
      settings: {
        mineMode: true,
        mode: 'vs_ai',
        humanPlayer: 'O',
        firstPlayer: 'X',
        difficulty: 'easy',
      },
    })
    expect(g.currentPlayer).toBe('X')
    let r = applyMove(g, 4)
    if (!r.ok) throw new Error('ai open')
    g = r.state
    expect(g.currentPlayer).toBe('O')
    r = plantMine(g, 0)
    if (!r.ok) throw new Error('human plant')
    g = r.state
    expect(g.currentPlayer).toBe('X')
    expect(g.mines[0]).toBe('O')
    // AI can still act
    r = applyMove(g, 1)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.state.currentPlayer).toBe('O')
  })

  it('plant always advances currentPlayer even with partial mine state', () => {
    let g = createGame({ settings: { mineMode: true, mode: 'local_pvp', firstPlayer: 'X' } })
    // Simulate degraded state (missing fields) — plantMine should normalize
    g = { ...g, mines: undefined as unknown as typeof g.mines }
    const r = plantMine(g, 2)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.state.currentPlayer).toBe('O')
    expect(r.state.mines[2]).toBe('X')
  })
})
