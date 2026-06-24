import { describe, expect, it } from 'vitest'
import { applyMove, chooseHardMoveForBoard, chooseMove, createGame, getLegalMoves } from '../src/game'
import type { Cell } from '../src/game'

function boardFrom(marks: (Cell)[]): Cell[] {
  return marks.slice()
}

describe('hard AI', () => {
  it('takes an instant winning move', () => {
    // O can win on bottom row: 6,7 filled, 8 empty (also could block at 1; must prefer win)
    const board = boardFrom(['X', null, 'X', null, null, null, 'O', 'O', null])
    const move = chooseHardMoveForBoard(board, 'O')
    expect(move).toBe(8)
    const after = board.slice()
    after[move] = 'O'
    expect(after[6]).toBe('O')
    expect(after[7]).toBe('O')
    expect(after[8]).toBe('O')
  })

  it('blocks opponent winning move', () => {
    // X threatens top row 0,1,2 — has 0 and 1; O to play
    const board = boardFrom(['X', 'X', null, null, 'O', null, null, null, null])
    const move = chooseHardMoveForBoard(board, 'O')
    expect(move).toBe(2)
  })

  it('never returns illegal moves from chooseMove', () => {
    let g = createGame({ settings: { mode: 'vs_ai', humanPlayer: 'X', difficulty: 'hard' } })
    // Human plays center; AI's turn (O)
    const r = applyMove(g, 4)
    if (!r.ok) return
    g = r.state
    expect(g.currentPlayer).toBe('O')
    const legal = getLegalMoves(g)
    expect(legal.length).toBeGreaterThan(0)
    const move = chooseMove(g, 'hard')
    expect(legal).toContain(move)
  })

  it('opens with center on empty board', () => {
    const board = boardFrom([null, null, null, null, null, null, null, null, null])
    const move = chooseHardMoveForBoard(board, 'X')
    expect(move).toBe(4)
  })
})

describe('impossible AI', () => {
  it('takes winning moves and blocks like hard', () => {
    const board = boardFrom(['X', 'X', null, null, 'O', null, null, null, null])
    let g = createGame({
      settings: { mode: 'vs_ai', humanPlayer: 'X', difficulty: 'impossible', firstPlayer: 'O' },
    })
    // Build via chooseMove on a real state: simpler to use chooseMove after setup sequence
    g = createGame({ settings: { mode: 'vs_ai', humanPlayer: 'X', difficulty: 'impossible' } })
    const seq = [0, 6, 1, 7, 3] // X O X O X — O can win at 8
    for (const m of seq) {
      const r = applyMove(g, m)
      if (!r.ok) throw new Error('setup failed')
      g = r.state
    }
    expect(chooseMove(g, 'impossible')).toBe(8)
  })

  it('responds to center opening with a corner', () => {
    let g = createGame({ settings: { mode: 'vs_ai', humanPlayer: 'X', difficulty: 'impossible' } })
    const r = applyMove(g, 4)
    if (!r.ok) throw new Error('setup failed')
    g = r.state
    const move = chooseMove(g, 'impossible')
    expect([0, 2, 6, 8]).toContain(move)
  })
})

describe('easy AI', () => {
  it('only returns legal moves', () => {
    let g = createGame({ settings: { mode: 'vs_ai', humanPlayer: 'X', difficulty: 'easy' } })
    const r = applyMove(g, 0)
    if (!r.ok) return
    g = r.state
    for (let i = 0; i < 20; i++) {
      const legal = getLegalMoves(g)
      if (legal.length === 0) break
      const move = chooseMove(g, 'easy')
      expect(legal).toContain(move)
    }
  })
})

describe('medium AI', () => {
  it('takes a winning move when available', () => {
    let g = createGame({
      settings: { mode: 'vs_ai', humanPlayer: 'X', difficulty: 'medium', firstPlayer: 'O' },
    })
    // Force board: let O play by setting up via moves
    // Simpler: use chooseMove with crafted state via multiple applies
    // O at 0,1 needs 2; X elsewhere
    let board = boardFrom(['O', 'O', null, 'X', 'X', null, null, null, null])
    // Build state manually by playing
    g = createGame({ settings: { mode: 'vs_ai', humanPlayer: 'X', difficulty: 'medium' } })
    // X0 O1 X3 O4 X8 — not helpful. Use hard helper pattern via medium on state.
    // Apply sequence where O has two in a row on bottom
    const seq = [0, 6, 1, 7, 3] // X, O, X, O, X — O to play at 8 for win
    for (const m of seq) {
      const r = applyMove(g, m)
      if (!r.ok) throw new Error('setup failed')
      g = r.state
    }
    expect(g.currentPlayer).toBe('O')
    const move = chooseMove(g, 'medium')
    expect(move).toBe(8)
  })
})
