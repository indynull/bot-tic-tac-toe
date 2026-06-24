import { describe, expect, it } from 'vitest'
import { chooseMove, chooseOptimalMove } from '../src/game/ai'
import { applyMove, createGame, getLegalMoves } from '../src/game/engine'
import type { Cell } from '../src/game/types'

function play(indices: number[]) {
  let state = createGame({ mode: 'vs_ai', humanPlayer: 'X', difficulty: 'hard' })
  for (const idx of indices) {
    const r = applyMove(state, idx)
    if (!r.ok) throw new Error(`illegal setup move ${idx}`)
    state = r.state
  }
  return state
}

describe('hard AI', () => {
  it('takes an instant winning move', () => {
    // X center, O corner, X edge, O — can win on next if set up for O
    // Board: X at 0,1 — needs 2 to win but it's O's turn with O at 3,4 need 5
    // Simpler: O has 0 and 1 empty 2, O to move
    const board: Cell[] = ['O', 'O', null, 'X', 'X', null, null, null, null]
    const move = chooseOptimalMove(board, 'O')
    expect(move).toBe(2)
  })

  it('blocks opponent winning move', () => {
    // X has 0,1 — threatens 2; O must block
    const board: Cell[] = ['X', 'X', null, 'O', null, null, null, null, null]
    const move = chooseOptimalMove(board, 'O')
    expect(move).toBe(2)
  })

  it('never returns illegal moves from live state', () => {
    let state = createGame({ mode: 'vs_ai', humanPlayer: 'X', difficulty: 'hard' })
    // Human plays center
    const r = applyMove(state, 4)
    if (!r.ok) throw new Error('fail')
    state = r.state
    const move = chooseMove(state, 'hard')
    expect(getLegalMoves(state)).toContain(move)
  })

  it('does not lose to optimal play (draw or AI win only)', () => {
    // Play minimax vs minimax should always draw
    let state = createGame({ mode: 'vs_ai', humanPlayer: 'X', firstPlayer: 'X', difficulty: 'hard' })
    while (state.status === 'in_progress') {
      const player = state.currentPlayer
      const boardMove = chooseOptimalMove(state.board, player)
      const r = applyMove(state, boardMove)
      if (!r.ok) throw new Error('illegal minimax move')
      state = r.state
    }
    expect(state.status).toBe('draw')
  })
})

describe('easy AI', () => {
  it('only returns legal moves', () => {
    const state = play([4, 0, 8])
    for (let i = 0; i < 30; i++) {
      const move = chooseMove(state, 'easy')
      expect(getLegalMoves(state)).toContain(move)
    }
  })
})

describe('medium AI', () => {
  it('takes win when available', () => {
    // Human X, AI O. After five plies O has O O _ on top and it is O's turn.
    let state = createGame({ mode: 'vs_ai', humanPlayer: 'X', difficulty: 'medium' })
    for (const idx of [5, 0, 8, 1, 7]) {
      const r = applyMove(state, idx)
      if (!r.ok) throw new Error('setup')
      state = r.state
    }
    expect(state.currentPlayer).toBe('O')
    expect(state.board.slice(0, 3)).toEqual(['O', 'O', null])
    const move = chooseMove(state, 'medium')
    expect(move).toBe(2)
  })

  it('blocks immediate loss', () => {
    let state = createGame({ mode: 'vs_ai', humanPlayer: 'X', difficulty: 'medium' })
    // X0, O4, X1 — threatens X at 2; O should block
    for (const idx of [0, 4, 1]) {
      const r = applyMove(state, idx)
      if (!r.ok) throw new Error('setup')
      state = r.state
    }
    const move = chooseMove(state, 'medium')
    expect(move).toBe(2)
  })
})
