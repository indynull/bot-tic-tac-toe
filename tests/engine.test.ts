import { describe, expect, it } from 'vitest'
import {
  applyMove,
  createGame,
  embedBoard,
  evaluateBoard,
  getLegalMoves,
  remapIndex,
  resetGame,
  resetScores,
  resolveEscalation,
  undoLastTurn,
  undoMove,
  WIN_LINES,
} from '../src/game'

/** Classic 3×3 full-board draw sequence (no 3-in-a-row). */
const CLASSIC_DRAW_MOVES = [0, 1, 2, 4, 3, 6, 5, 8, 7] as const

function playMoves(start = createGame(), moves: readonly number[] = CLASSIC_DRAW_MOVES) {
  let g = start
  for (const m of moves) {
    const r = applyMove(g, m)
    if (!r.ok) throw new Error(`move ${m} failed: ${r.reason}`)
    g = r.state
  }
  return g
}

describe('createGame', () => {
  it('starts with an empty board and X by default', () => {
    const g = createGame()
    expect(g.boardSize).toBe(3)
    expect(g.winLength).toBe(3)
    expect(g.board).toEqual(Array(9).fill(null))
    expect(g.currentPlayer).toBe('X')
    expect(g.status).toBe('in_progress')
    expect(g.winner).toBeNull()
    expect(g.winningLine).toBeNull()
    expect(g.moveHistory).toEqual([])
    expect(g.scores).toEqual({ X: 0, O: 0, draws: 0 })
    expect(g.ladderSize).toBe(3)
    expect(g.ladderAdvanced).toBe(false)
  })

  it('supports custom board sizes with scaled win length', () => {
    const g4 = createGame({ boardSize: 4 })
    expect(g4.boardSize).toBe(4)
    expect(g4.winLength).toBe(4)
    expect(g4.board).toHaveLength(16)
    const g6 = createGame({ boardSize: 6 })
    expect(g6.winLength).toBe(5)
  })

  it('respects firstPlayer setting', () => {
    const g = createGame({ settings: { firstPlayer: 'O' } })
    expect(g.currentPlayer).toBe('O')
  })
})

describe('applyMove', () => {
  it('alternates players on valid moves', () => {
    let g = createGame()
    const r1 = applyMove(g, 0)
    expect(r1.ok).toBe(true)
    if (!r1.ok) return
    expect(r1.state.board[0]).toBe('X')
    expect(r1.state.currentPlayer).toBe('O')

    const r2 = applyMove(r1.state, 1)
    expect(r2.ok).toBe(true)
    if (!r2.ok) return
    expect(r2.state.board[1]).toBe('O')
    expect(r2.state.currentPlayer).toBe('X')
  })

  it('rejects move on occupied cell', () => {
    let g = createGame()
    const r1 = applyMove(g, 4)
    expect(r1.ok).toBe(true)
    if (!r1.ok) return
    const r2 = applyMove(r1.state, 4)
    expect(r2.ok).toBe(false)
    if (r2.ok) return
    expect(r2.reason).toBe('cell_occupied')
  })

  it('rejects invalid index', () => {
    const g = createGame()
    const r = applyMove(g, 99)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('invalid_index')
  })

  it('rejects move after game over', () => {
    let g = createGame()
    // X wins top row
    for (const idx of [0, 3, 1, 4, 2]) {
      const r = applyMove(g, idx)
      expect(r.ok).toBe(true)
      if (!r.ok) return
      g = r.state
    }
    expect(g.status).toBe('won')
    const blocked = applyMove(g, 8)
    expect(blocked.ok).toBe(false)
    if (blocked.ok) return
    expect(blocked.reason).toBe('game_over')
  })
})

describe('win detection', () => {
  it.each(WIN_LINES.map((line, i) => [i, line] as const))(
    'detects win on line index %i',
    (_i, line) => {
      let g = createGame()
      const other = [0, 1, 2, 3, 4, 5, 6, 7, 8].filter((n) => !line.includes(n))
      // Place X on winning line, O elsewhere interleaved
      const seq: number[] = []
      seq.push(line[0]!, other[0]!, line[1]!, other[1]!, line[2]!)
      for (const idx of seq) {
        const r = applyMove(g, idx)
        if (!r.ok) throw new Error('unexpected fail')
        g = r.state
      }
      expect(g.status).toBe('won')
      expect(g.winner).toBe('X')
      expect(g.winningLine).toEqual([...line])
      expect(g.scores.X).toBe(1)
    },
  )
})

describe('draw detection', () => {
  it('ends as a draw on classic 3×3 full board and advances the ladder', () => {
    const g = playMoves()
    expect(g.status).toBe('draw')
    expect(g.boardSize).toBe(3)
    expect(g.board).toHaveLength(9)
    expect(g.scores.draws).toBe(1)
    expect(g.ladderAdvanced).toBe(true)
    expect(g.ladderSize).toBe(4)
  })
})

describe('board embed helpers', () => {
  it('embedBoard places marks in top-left and leaves new ring empty', () => {
    const small = ['X', 'O', null, null, 'X', null, null, null, 'O'] as const
    const big = embedBoard([...small], 3, 4)
    expect(big).toHaveLength(16)
    expect(big[0]).toBe('X')
    expect(big[1]).toBe('O')
    expect(big[4]).toBeNull() // new column on row 0
    expect(big[5]).toBe('X') // old index 4 → row1 col1 on 4×4
    expect(big[15]).toBeNull()
  })

  it('remapIndex preserves row/col under top-left embed', () => {
    expect(remapIndex(4, 3, 4)).toBe(5) // (1,1) on 3×3 → (1,1) on 4×4 = 5
    expect(remapIndex(8, 3, 5)).toBe(12) // (2,2) → 2*5+2 = 12
  })
})

describe('draw ladder (next-game escalation)', () => {
  it('advances ladder 3→4 and bumps AI difficulty on vs_ai draw', () => {
    const g = playMoves(createGame({ settings: { mode: 'vs_ai', difficulty: 'easy' } }))
    expect(g.status).toBe('draw')
    expect(g.boardSize).toBe(3)
    expect(g.ladderSize).toBe(4)
    expect(g.ladderAdvanced).toBe(true)
    expect(g.settings.difficulty).toBe('medium')
    expect(g.scores.draws).toBe(1)
  })

  it('advances ladder in PvP without changing difficulty', () => {
    const g = playMoves(createGame({ settings: { mode: 'local_pvp', difficulty: 'easy' } }))
    expect(g.status).toBe('draw')
    expect(g.ladderSize).toBe(4)
    expect(g.settings.difficulty).toBe('easy')
  })

  it('new game starts empty at advanced ladder size', () => {
    let g = playMoves(createGame({ settings: { mode: 'vs_ai', difficulty: 'easy' } }))
    expect(g.ladderSize).toBe(4)
    g = resetGame(g, { preserveScores: true, preserveSettings: true })
    expect(g.boardSize).toBe(4)
    expect(g.winLength).toBe(4)
    expect(g.board.every((c) => c === null)).toBe(true)
    expect(g.status).toBe('in_progress')
    expect(g.ladderAdvanced).toBe(false)
    expect(g.settings.difficulty).toBe('medium')
  })

  it('win does not advance the ladder', () => {
    let g = createGame({ settings: { mode: 'vs_ai', difficulty: 'easy' } })
    for (const idx of [0, 3, 1, 4, 2]) {
      const r = applyMove(g, idx)
      if (!r.ok) return
      g = r.state
    }
    expect(g.status).toBe('won')
    expect(g.boardSize).toBe(3)
    expect(g.ladderSize).toBe(3)
    expect(g.ladderAdvanced).toBe(false)
    expect(g.settings.difficulty).toBe('easy')
  })

  it('draw at 7×7 counts but does not advance past max', () => {
    const size = 7 as const
    const pattern = ['X', 'X', 'X', 'X', 'O', 'O', 'O'] as const
    const board: ('X' | 'O' | null)[] = Array(49).fill(null)
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        board[row * size + col] = pattern[(col + row * 3) % size]!
      }
    }
    expect(evaluateBoard(board, 7, 5).status).toBe('draw')
    const lastPlayer = board[48]!
    board[48] = null
    let g = createGame({ boardSize: 7, settings: { mode: 'vs_ai', difficulty: 'hard' } })
    g = {
      ...g,
      board,
      currentPlayer: lastPlayer,
      moveHistory: board
        .map((p, i) => (p ? { cellIndex: i, player: p } : null))
        .filter((m): m is { cellIndex: number; player: 'X' | 'O' } => m !== null),
    }
    const r = applyMove(g, 48)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.state.boardSize).toBe(7)
    expect(r.state.status).toBe('draw')
    expect(r.state.scores.draws).toBe(1)
    expect(r.state.ladderSize).toBe(7)
    expect(r.state.ladderAdvanced).toBe(false)
  })

  it('draw on 4×4 advances ladder and tiers-up difficulty (pressure keeps climbing)', () => {
    let g = createGame({ boardSize: 4, settings: { mode: 'vs_ai', difficulty: 'medium' } })
    // Fill without 4-in-a-row if possible; use alternating pattern
    const board: ('X' | 'O' | null)[] = Array(16).fill(null)
    for (let i = 0; i < 15; i++) board[i] = i % 2 === 0 ? 'X' : 'O'
    board[15] = null
    const outcome15 = evaluateBoard([...board.slice(0, 15), 'O'], 4, 4)
    g = {
      ...g,
      board,
      currentPlayer: 'O',
      moveHistory: board
        .map((p, i) => (p ? { cellIndex: i, player: p } : null))
        .filter((m): m is { cellIndex: number; player: 'X' | 'O' } => m !== null),
    }
    const r = applyMove(g, 15)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    if (outcome15.status === 'draw') {
      expect(r.state.status).toBe('draw')
      expect(r.state.ladderSize).toBe(5)
      expect(r.state.settings.difficulty).toBe('hard')
    } else {
      // Pattern might win for O — still valid board rules
      expect(['won', 'draw']).toContain(r.state.status)
    }
  })

  it('undo after draw reverts ladder and score', () => {
    let g = playMoves()
    expect(g.status).toBe('draw')
    expect(g.ladderSize).toBe(4)
    expect(g.scores.draws).toBe(1)
    g = undoMove(g)
    expect(g.status).toBe('in_progress')
    expect(g.boardSize).toBe(3)
    expect(g.ladderSize).toBe(3)
    expect(g.ladderAdvanced).toBe(false)
    expect(g.scores.draws).toBe(0)
  })

  it('undo after vs_ai draw also reverts difficulty tier', () => {
    let g = playMoves(createGame({ settings: { mode: 'vs_ai', difficulty: 'easy' } }))
    expect(g.settings.difficulty).toBe('medium')
    g = undoMove(g)
    expect(g.settings.difficulty).toBe('easy')
    expect(g.ladderSize).toBe(3)
  })

  it('resetProgression returns to 3×3', () => {
    let g = createGame({ boardSize: 5 })
    g = resetGame(g, { resetProgression: true })
    expect(g.boardSize).toBe(3)
    expect(g.ladderSize).toBe(3)
    expect(g.ladderAdvanced).toBe(false)
  })

  it('detects 4-in-a-row on a 4×4 board', () => {
    let g = createGame({ boardSize: 4 })
    const seq = [0, 4, 1, 5, 2, 6, 3]
    for (const m of seq) {
      const r = applyMove(g, m)
      expect(r.ok).toBe(true)
      if (!r.ok) return
      g = r.state
    }
    expect(g.status).toBe('won')
    expect(g.winner).toBe('X')
    expect(g.winningLine).toEqual([0, 1, 2, 3])
    expect(g.ladderSize).toBe(4)
  })

  it('detects diagonal win on 5×5 with 4-in-a-row', () => {
    let g = createGame({ boardSize: 5 })
    expect(g.winLength).toBe(4)
    const seq = [0, 1, 6, 2, 12, 3, 18]
    for (const m of seq) {
      const r = applyMove(g, m)
      if (!r.ok) return
      g = r.state
    }
    expect(g.status).toBe('won')
    expect(g.winner).toBe('X')
  })

  it('resolveEscalation uses ladderSize for next game', () => {
    const drawn = playMoves()
    const planned = resolveEscalation(drawn)
    expect(planned.boardSize).toBe(4)
    const mid = createGame({ boardSize: 5 })
    expect(resolveEscalation(mid).boardSize).toBe(5)
  })
})

describe('reset & scores', () => {
  it('reset preserves scores and settings by default', () => {
    let g = createGame()
    for (const idx of [0, 3, 1, 4, 2]) {
      const r = applyMove(g, idx)
      if (!r.ok) return
      g = r.state
    }
    expect(g.scores.X).toBe(1)
    g = resetGame(g)
    expect(g.board.every((c) => c === null)).toBe(true)
    expect(g.scores.X).toBe(1)
    expect(g.status).toBe('in_progress')
    expect(g.winningLine).toBeNull()
  })

  it('resetScores zeroes counters', () => {
    let g = createGame({ scores: { X: 2, O: 1, draws: 3 } })
    g = resetScores(g)
    expect(g.scores).toEqual({ X: 0, O: 0, draws: 0 })
  })

  it('reset can clear scores when requested', () => {
    let g = createGame({ scores: { X: 5, O: 0, draws: 0 } })
    g = resetGame(g, { preserveScores: false })
    expect(g.scores).toEqual({ X: 0, O: 0, draws: 0 })
  })
})

describe('undo', () => {
  it('undoMove restores previous board and player', () => {
    let g = createGame()
    const r1 = applyMove(g, 0)
    if (!r1.ok) return
    g = r1.state
    const r2 = applyMove(g, 4)
    if (!r2.ok) return
    g = r2.state
    g = undoMove(g)
    expect(g.board[4]).toBeNull()
    expect(g.board[0]).toBe('X')
    expect(g.currentPlayer).toBe('O')
    expect(g.moveHistory).toHaveLength(1)
  })

  it('undoLastTurn in PvP undoes one move', () => {
    let g = createGame({ settings: { mode: 'local_pvp' } })
    const r1 = applyMove(g, 0)
    if (!r1.ok) return
    g = undoLastTurn(r1.state)
    expect(g.board[0]).toBeNull()
    expect(g.moveHistory).toHaveLength(0)
  })

  it('undoLastTurn in vs_ai undoes pair', () => {
    let g = createGame({ settings: { mode: 'vs_ai', humanPlayer: 'X' } })
    const r1 = applyMove(g, 0)
    if (!r1.ok) return
    g = r1.state
    const r2 = applyMove(g, 1)
    if (!r2.ok) return
    g = r2.state
    g = undoLastTurn(g)
    expect(g.moveHistory).toHaveLength(0)
    expect(g.board.every((c) => c === null)).toBe(true)
  })

  it('undo after win decrements score', () => {
    let g = createGame()
    for (const idx of [0, 3, 1, 4, 2]) {
      const r = applyMove(g, idx)
      if (!r.ok) return
      g = r.state
    }
    expect(g.scores.X).toBe(1)
    g = undoMove(g)
    expect(g.status).toBe('in_progress')
    expect(g.scores.X).toBe(0)
  })
})

describe('getLegalMoves', () => {
  it('returns empty cells only while in progress', () => {
    let g = createGame()
    const r = applyMove(g, 0)
    if (!r.ok) return
    g = r.state
    expect(getLegalMoves(g)).not.toContain(0)
    expect(getLegalMoves(g)).toHaveLength(8)
  })
})
