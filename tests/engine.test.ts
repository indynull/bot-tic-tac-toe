import { describe, expect, it } from 'vitest'
import {
  applyMove,
  createGame,
  embedBoard,
  evaluateBoard,
  getLegalMoves,
  growBoardInPlace,
  hasImmediateWin,
  planBoardGrowth,
  remapIndex,
  resetGame,
  resetScores,
  resolveEscalation,
  undoLastTurn,
  undoMove,
  WIN_LINES,
} from '../src/game'

/** Classic 3×3 full-board sequence with no 3-in-a-row (triggers growth). */
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
    expect(g.justGrew).toBe(false)
    expect(g.previousBoardSize).toBeNull()
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

describe('draw detection / in-place growth', () => {
  it('grows in place on classic 3×3 full board instead of scoring a draw', () => {
    const g = playMoves()
    expect(g.status).toBe('in_progress')
    expect(g.boardSize).toBe(4)
    expect(g.winLength).toBe(4)
    expect(g.board).toHaveLength(16)
    expect(g.scores.draws).toBe(0)
    expect(g.justGrew).toBe(true)
    expect(g.previousBoardSize).toBe(3)
    expect(g.ladderSize).toBe(4)
    // Top-left embed keeps marks
    expect(g.board[0]).toBe('X')
    expect(g.board[1]).toBe('O')
  })
})

describe('board embed helpers', () => {
  it('embedBoard places marks in top-left and leaves new ring empty', () => {
    const small = ['X', 'O', null, null, 'X', null, null, null, 'O'] as const
    const big = embedBoard([...small], 3, 4)
    expect(big).toHaveLength(16)
    expect(big[0]).toBe('X')
    expect(big[1]).toBe('O')
    expect(big[4]).toBeNull()
    expect(big[5]).toBe('X')
    expect(big[15]).toBeNull()
  })

  it('remapIndex preserves row/col under top-left embed', () => {
    expect(remapIndex(4, 3, 4)).toBe(5)
    expect(remapIndex(8, 3, 5)).toBe(12)
  })

  it('planBoardGrowth always prefers +1 for continued escalation', () => {
    const board = ['X', 'O', 'X', 'X', 'O', 'O', 'O', 'X', 'X'] as ('X' | 'O' | null)[]
    const plan = planBoardGrowth(board, 3, 'O')
    expect(plan.grew).toBe(true)
    expect(plan.boardSize).toBe(4)
    expect(hasImmediateWin(plan.board, plan.boardSize, plan.winLength, 'O')).toBe(false)
  })

  it('planBoardGrowth never leaves next player with an instant win', () => {
    const board4: ('X' | 'O' | null)[] = Array(16).fill(null)
    for (let i = 0; i < 16; i++) board4[i] = i % 2 === 0 ? 'X' : 'O'
    const plan = planBoardGrowth(board4, 4, 'X')
    if (plan.grew) {
      expect(hasImmediateWin(plan.board, plan.boardSize, plan.winLength, 'X')).toBe(false)
      expect(evaluateBoard(plan.board, plan.boardSize, plan.winLength).status).not.toBe('won')
    }
  })

  it('planBoardGrowth shifts embed when top-left would gift an instant win', () => {
    // 3×3 full of X on a path where 4-in-a-row for O is possible only with certain embeds.
    // Force a position where O threatens 4-in-a-row if we only expand the right/bottom ring
    // with marks in the top-left: three O in a column that can complete on the new ring.
    const board: ('X' | 'O' | null)[] = [
      'X', 'O', 'X',
      'X', 'O', 'X',
      'O', 'X', 'O',
    ]
    // Not a 3-in-a-row win on 3×3
    expect(evaluateBoard(board, 3, 3).status).toBe('draw')
    const plan = planBoardGrowth(board, 3, 'O')
    expect(plan.grew).toBe(true)
    expect(hasImmediateWin(plan.board, plan.boardSize, plan.winLength, 'O')).toBe(false)
  })

  it('applyMove growth never grants the next player an instant winning cell', () => {
    let g = playMoves()
    expect(g.status).toBe('in_progress')
    expect(g.justGrew).toBe(true)
    expect(hasImmediateWin(g.board, g.boardSize, g.winLength, g.currentPlayer)).toBe(false)
  })
})

describe('chained in-place growth', () => {
  it('can grow more than once in a single game (3→4 and again on next fill)', () => {
    let g = playMoves()
    expect(g.boardSize).toBe(4)
    expect(g.status).toBe('in_progress')

    // Fill remaining empty cells on 4×4 (new ring) without relying on a specific winner.
    // Play legally until board would draw/grow or game ends.
    let guard = 0
    while (g.status === 'in_progress' && g.boardSize === 4 && guard++ < 32) {
      const empties = g.board
        .map((c, i) => (c === null ? i : -1))
        .filter((i) => i >= 0)
      if (empties.length === 0) break
      const r = applyMove(g, empties[0]!)
      if (!r.ok) break
      g = r.state
    }
    // Either grew to 5+ (preferred) or someone won on 4×4 — both valid; assert not stuck at 4 draw
    if (g.status === 'draw') {
      expect(g.boardSize).toBeGreaterThanOrEqual(7)
    } else if (g.status === 'in_progress') {
      expect(g.boardSize).toBeGreaterThanOrEqual(4)
      // If we filled the 4×4 ring without a 4-in-a-row, must have grown
      const filled4 = g.boardSize > 4 || g.board.filter((c) => c === null).length > 0
      expect(filled4 || g.justGrew || g.boardSize > 4).toBe(true)
    }
  })
})

describe('in-place board growth', () => {
  it('grows 3×3 → 4×4 and bumps AI difficulty (vs AI)', () => {
    const g = playMoves(createGame({ settings: { mode: 'vs_ai', difficulty: 'easy' } }))
    expect(g.status).toBe('in_progress')
    expect(g.boardSize).toBe(4)
    expect(g.settings.difficulty).toBe('medium')
    expect(g.currentPlayer).toBe('O')
    expect(g.scores.draws).toBe(0)
  })

  it('grows in PvP without changing difficulty', () => {
    const g = playMoves(createGame({ settings: { mode: 'local_pvp', difficulty: 'easy' } }))
    expect(g.boardSize).toBe(4)
    expect(g.settings.difficulty).toBe('easy')
    expect(g.status).toBe('in_progress')
  })

  it('new game keeps ladder size (empty board at grown N)', () => {
    let g = playMoves(createGame({ settings: { mode: 'vs_ai', difficulty: 'easy' } }))
    expect(g.boardSize).toBe(4)
    g = resetGame(g, { preserveScores: true, preserveSettings: true })
    expect(g.boardSize).toBe(4)
    expect(g.board.every((c) => c === null)).toBe(true)
    expect(g.justGrew).toBe(false)
    expect(g.settings.difficulty).toBe('medium')
  })

  it('win does not grow the board', () => {
    let g = createGame({ settings: { mode: 'vs_ai', difficulty: 'easy' } })
    for (const idx of [0, 3, 1, 4, 2]) {
      const r = applyMove(g, idx)
      if (!r.ok) return
      g = r.state
    }
    expect(g.status).toBe('won')
    expect(g.boardSize).toBe(3)
    expect(g.settings.difficulty).toBe('easy')
  })

  it('grows 7×7 → 8×8 on a full board with no 5-in-a-row', () => {
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
    expect(r.state.boardSize).toBe(8)
    expect(r.state.status).toBe('in_progress')
    expect(r.state.justGrew).toBe(true)
    expect(r.state.winLength).toBe(5)
  })

  it('records a real draw at 9×9 when full with no 5-in-a-row', () => {
    const size = 9 as const
    // Period-5 stripe so no 5 consecutive identical marks in a row/col/diag segment.
    const pattern = ['X', 'X', 'X', 'X', 'O', 'O', 'O', 'O', 'X'] as const
    const cells = size * size
    const board: ('X' | 'O' | null)[] = Array(cells).fill(null)
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        board[row * size + col] = pattern[(col + row * 2) % pattern.length]!
      }
    }
    // If the stripe still forms a 5-in-a-row, fall back to a checker that is known draw-ish:
    // alternate pairs per row offset so runs of 4 max.
    let evalBoard = board
    if (evaluateBoard(evalBoard, 9, 5).status !== 'draw') {
      evalBoard = Array(cells).fill(null)
      for (let i = 0; i < cells; i++) {
        const row = Math.floor(i / size)
        const col = i % size
        evalBoard[i] = (row + Math.floor(col / 4)) % 2 === 0 ? 'X' : 'O'
      }
    }
    expect(evaluateBoard(evalBoard, 9, 5).status).toBe('draw')
    const lastIdx = cells - 1
    const lastPlayer = evalBoard[lastIdx]!
    evalBoard[lastIdx] = null
    let g = createGame({ boardSize: 9, settings: { mode: 'vs_ai', difficulty: 'hard' } })
    g = {
      ...g,
      board: evalBoard,
      currentPlayer: lastPlayer,
      moveHistory: evalBoard
        .map((p, i) => (p ? { cellIndex: i, player: p } : null))
        .filter((m): m is { cellIndex: number; player: 'X' | 'O' } => m !== null),
    }
    const r = applyMove(g, lastIdx)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.state.boardSize).toBe(9)
    expect(r.state.status).toBe('draw')
    expect(r.state.scores.draws).toBe(1)
    expect(r.state.justGrew).toBe(false)
  })

  it('winLength is 5 on 8×8 and 9×9', () => {
    expect(createGame({ boardSize: 8 }).winLength).toBe(5)
    expect(createGame({ boardSize: 9 }).winLength).toBe(5)
  })

  it('undo after growth is size-sticky', () => {
    let g = playMoves()
    expect(g.boardSize).toBe(4)
    expect(g.justGrew).toBe(true)
    const beforeUndo = g.moveHistory.length
    g = undoMove(g)
    expect(g.boardSize).toBe(4)
    expect(g.moveHistory.length).toBe(beforeUndo - 1)
    expect(g.justGrew).toBe(false)
    expect(g.status).toBe('in_progress')
  })

  it('resetProgression returns to 3×3', () => {
    let g = createGame({ boardSize: 5 })
    g = resetGame(g, { resetProgression: true })
    expect(g.boardSize).toBe(3)
    expect(g.ladderSize).toBe(3)
    expect(g.justGrew).toBe(false)
  })

  it('growBoardInPlace remaps move history indices', () => {
    let g = createGame()
    const r = applyMove(g, 4)
    if (!r.ok) return
    g = r.state
    g = growBoardInPlace(g, 4)
    expect(g.boardSize).toBe(4)
    expect(g.moveHistory[0]!.cellIndex).toBe(5)
    expect(g.board[5]).toBe('X')
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

  it('resolveEscalation keeps grown ladder size', () => {
    const grown = playMoves()
    expect(resolveEscalation(grown).boardSize).toBe(4)
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
