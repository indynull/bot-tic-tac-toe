import { describe, expect, it } from 'vitest'
import {
  applyMove,
  createGame,
  getLegalMoves,
  resetGame,
  resetScores,
  undoMove,
} from '../src/game/engine'
import { evaluateBoard } from '../src/game/evaluate'
import { WIN_LINES } from '../src/game/board'
import type { Cell, Player } from '../src/game/types'

describe('createGame', () => {
  it('starts with empty board and X to move by default', () => {
    const state = createGame()
    expect(state.board).toEqual(Array(9).fill(null))
    expect(state.currentPlayer).toBe('X')
    expect(state.status).toBe('in_progress')
    expect(state.winner).toBeNull()
    expect(state.winningLine).toBeNull()
    expect(state.moveHistory).toEqual([])
    expect(state.scores).toEqual({ X: 0, O: 0, draws: 0 })
  })

  it('respects firstPlayer setting', () => {
    const state = createGame({ firstPlayer: 'O' })
    expect(state.currentPlayer).toBe('O')
  })
})

describe('applyMove', () => {
  it('places mark and alternates player', () => {
    let state = createGame()
    const r1 = applyMove(state, 0)
    expect(r1.ok).toBe(true)
    if (!r1.ok) return
    state = r1.state
    expect(state.board[0]).toBe('X')
    expect(state.currentPlayer).toBe('O')

    const r2 = applyMove(state, 1)
    expect(r2.ok).toBe(true)
    if (!r2.ok) return
    expect(r2.state.board[1]).toBe('O')
    expect(r2.state.currentPlayer).toBe('X')
  })

  it('rejects occupied cell', () => {
    let state = createGame()
    const r1 = applyMove(state, 4)
    expect(r1.ok).toBe(true)
    if (!r1.ok) return
    state = r1.state
    const r2 = applyMove(state, 4)
    expect(r2.ok).toBe(false)
    if (r2.ok) return
    expect(r2.reason).toBe('cell_occupied')
  })

  it('rejects out of bounds', () => {
    const state = createGame()
    const r = applyMove(state, 99)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('out_of_bounds')
  })

  it('rejects moves after game over', () => {
    // X wins top row
    let state = createGame()
    for (const idx of [0, 3, 1, 4, 2]) {
      const r = applyMove(state, idx)
      expect(r.ok).toBe(true)
      if (!r.ok) return
      state = r.state
    }
    expect(state.status).toBe('won')
    expect(state.winner).toBe('X')
    const blocked = applyMove(state, 8)
    expect(blocked.ok).toBe(false)
    if (blocked.ok) return
    expect(blocked.reason).toBe('game_over')
  })

  it('increments winner score on win', () => {
    let state = createGame()
    for (const idx of [0, 3, 1, 4, 2]) {
      const r = applyMove(state, idx)
      if (!r.ok) throw new Error('unexpected fail')
      state = r.state
    }
    expect(state.scores.X).toBe(1)
    expect(state.scores.O).toBe(0)
  })
})

describe('win patterns', () => {
  it.each(WIN_LINES.map((line, i) => [i, line] as const))(
    'detects win on line %# %j',
    (_i, line) => {
      const board: Cell[] = Array(9).fill(null)
      for (const idx of line) board[idx] = 'X'
      const ev = evaluateBoard(board)
      expect(ev.status).toBe('won')
      expect(ev.winner).toBe('X')
      expect(ev.winningLine).toEqual([...line])
    },
  )
})

describe('draw detection', () => {
  it('detects full board with no winner', () => {
    // Classic draw pattern
    const moves = [0, 1, 2, 4, 3, 5, 7, 6, 8]
    let state = createGame()
    for (const idx of moves) {
      const r = applyMove(state, idx)
      expect(r.ok).toBe(true)
      if (!r.ok) return
      state = r.state
    }
    expect(state.status).toBe('draw')
    expect(state.winner).toBeNull()
    expect(state.scores.draws).toBe(1)
  })
})

describe('resetGame', () => {
  it('preserves scores by default', () => {
    let state = createGame()
    for (const idx of [0, 3, 1, 4, 2]) {
      const r = applyMove(state, idx)
      if (!r.ok) throw new Error('fail')
      state = r.state
    }
    const reset = resetGame(state)
    expect(reset.board.every((c) => c === null)).toBe(true)
    expect(reset.scores.X).toBe(1)
    expect(reset.status).toBe('in_progress')
    expect(reset.winningLine).toBeNull()
  })

  it('can clear scores', () => {
    let state = createGame({ scores: { X: 2, O: 1, draws: 1 } })
    state = resetGame(state, { preserveScores: false })
    expect(state.scores).toEqual({ X: 0, O: 0, draws: 0 })
  })
})

describe('resetScores', () => {
  it('zeros counters without changing board', () => {
    let state = createGame()
    const r = applyMove(state, 0)
    if (!r.ok) throw new Error('fail')
    state = { ...r.state, scores: { X: 3, O: 2, draws: 1 } }
    const cleared = resetScores(state)
    expect(cleared.scores).toEqual({ X: 0, O: 0, draws: 0 })
    expect(cleared.board[0]).toBe('X')
  })
})

describe('undoMove', () => {
  it('restores previous board and player', () => {
    let state = createGame()
    const r1 = applyMove(state, 0)
    if (!r1.ok) throw new Error('fail')
    state = r1.state
    const r2 = applyMove(state, 4)
    if (!r2.ok) throw new Error('fail')
    state = r2.state
    state = undoMove(state)
    expect(state.board[4]).toBeNull()
    expect(state.board[0]).toBe('X')
    expect(state.currentPlayer).toBe('O')
    expect(state.moveHistory).toHaveLength(1)
  })

  it('reverts win score on undo after victory', () => {
    let state = createGame()
    for (const idx of [0, 3, 1, 4, 2]) {
      const r = applyMove(state, idx)
      if (!r.ok) throw new Error('fail')
      state = r.state
    }
    expect(state.scores.X).toBe(1)
    state = undoMove(state)
    expect(state.status).toBe('in_progress')
    expect(state.scores.X).toBe(0)
  })
})

describe('getLegalMoves', () => {
  it('returns empty indices while in progress', () => {
    let state = createGame()
    const r = applyMove(state, 0)
    if (!r.ok) throw new Error('fail')
    state = r.state
    expect(getLegalMoves(state).sort()).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })

  it('returns none after game over', () => {
    let state = createGame()
    for (const idx of [0, 3, 1, 4, 2]) {
      const r = applyMove(state, idx)
      if (!r.ok) throw new Error('fail')
      state = r.state
    }
    expect(getLegalMoves(state)).toEqual([])
  })
})

describe('player helpers via play sequence', () => {
  it('supports O as first player', () => {
    let state = createGame({ firstPlayer: 'O' })
    const r = applyMove(state, 4)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.state.board[4]).toBe('O' satisfies Player)
    expect(r.state.currentPlayer).toBe('X')
  })
})
