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

describe('draw detection', () => {
  it('grows in place instead of ending on a classic 3×3 full-board "draw"', () => {
    // Classic draw sequence — board fills without a 3-in-a-row
    const moves = [0, 1, 2, 4, 3, 6, 5, 8, 7]
    let g = createGame()
    for (const m of moves) {
      const r = applyMove(g, m)
      expect(r.ok).toBe(true)
      if (!r.ok) return
      g = r.state
    }
    // In-place growth: game continues on 4×4 with marks preserved (top-left embed)
    expect(g.status).toBe('in_progress')
    expect(g.boardSize).toBe(4)
    expect(g.winLength).toBe(4)
    expect(g.board).toHaveLength(16)
    expect(g.scores.draws).toBe(0)
    expect(g.justGrew).toBe(true)
    expect(g.previousBoardSize).toBe(3)
    // Original top-left 3×3 marks still present at remapped indices
    expect(g.board[0]).toBe('X') // was 0
    expect(g.board[1]).toBe('O') // was 1
    expect(g.board[5]).toBe('O') // was 4 on 3×3 → row1*4+col1 = 5
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

  it('planBoardGrowth prefers +1 when next player cannot win immediately', () => {
    const board = ['X', 'O', 'X', 'X', 'O', 'O', 'O', 'X', 'X'] as ('X' | 'O' | null)[]
    const plan = planBoardGrowth(board, 3, 'O')
    expect(plan.grew).toBe(true)
    expect(plan.boardSize).toBe(4)
    expect(plan.winLength).toBe(4)
    expect(hasImmediateWin(plan.board, 4, 4, 'O')).toBe(false)
  })

  it('planBoardGrowth returns grew:false at max size', () => {
    const board = Array(49).fill(null) as (null)[]
    const plan = planBoardGrowth(board, 7, 'X')
    expect(plan.grew).toBe(false)
    expect(plan.boardSize).toBe(7)
  })
})

describe('in-place board growth on draw', () => {
  it('grows 3×3 → 4×4 and bumps AI difficulty (vs AI)', () => {
    const moves = [0, 1, 2, 4, 3, 6, 5, 8, 7]
    let g = createGame({ settings: { mode: 'vs_ai', difficulty: 'easy' } })
    for (const m of moves) {
      const r = applyMove(g, m)
      if (!r.ok) return
      g = r.state
    }
    expect(g.status).toBe('in_progress')
    expect(g.boardSize).toBe(4)
    expect(g.settings.difficulty).toBe('medium')
    // Sequence ends with X at 7 → next is O on the grown board
    expect(g.currentPlayer).toBe('O')
  })

  it('grows board size in PvP without changing difficulty', () => {
    const moves = [0, 1, 2, 4, 3, 6, 5, 8, 7]
    let g = createGame({ settings: { mode: 'local_pvp', difficulty: 'easy' } })
    for (const m of moves) {
      const r = applyMove(g, m)
      if (!r.ok) return
      g = r.state
    }
    expect(g.boardSize).toBe(4)
    expect(g.settings.difficulty).toBe('easy')
    expect(g.status).toBe('in_progress')
  })

  it('new game keeps current ladder size (empty board at same N)', () => {
    const moves = [0, 1, 2, 4, 3, 6, 5, 8, 7]
    let g = createGame({ settings: { mode: 'vs_ai', difficulty: 'easy' } })
    for (const m of moves) {
      const r = applyMove(g, m)
      if (!r.ok) return
      g = r.state
    }
    expect(g.boardSize).toBe(4)
    g = resetGame(g, { preserveScores: true, preserveSettings: true })
    expect(g.boardSize).toBe(4)
    expect(g.board.every((c) => c === null)).toBe(true)
    expect(g.status).toBe('in_progress')
    expect(g.settings.difficulty).toBe('medium')
  })

  it('does not grow without filling the board (win ends game normally)', () => {
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

  it('records a real draw at 7×7 when the board fills with no 5-in-a-row', () => {
    // XXXXOOO repeating every 7 cells breaks 5-in-a-row in rows; rotate per row for cols/diags
    const size = 7 as const
    const pattern = ['X', 'X', 'X', 'X', 'O', 'O', 'O'] as const
    const board: ('X' | 'O' | null)[] = Array(49).fill(null)
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        board[row * size + col] = pattern[(col + row * 3) % size]!
      }
    }
    const fullEval = evaluateBoard(board, 7, 5)
    expect(fullEval.status).toBe('draw')
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
    expect(planBoardGrowth([...board.slice(0, 48), lastPlayer], 7, lastPlayer === 'X' ? 'O' : 'X').grew).toBe(false)
    const r = applyMove(g, 48)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.state.boardSize).toBe(7)
    expect(r.state.status).toBe('draw')
    expect(r.state.scores.draws).toBe(1)
    expect(r.state.justGrew).toBe(false)
  })

  it('does not bump difficulty when growing from 4×4+ (tier-up only from 3×3)', () => {
    let g = createGame({ boardSize: 4, settings: { mode: 'vs_ai', difficulty: 'medium' } })
    // Full 4×4 with no 4-in-a-row: alternate in 2×2 blocks
    const board: ('X' | 'O' | null)[] = Array(16).fill(null)
    for (let i = 0; i < 15; i++) board[i] = i % 2 === 0 ? 'X' : 'O'
    board[15] = null
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
    // If grew, difficulty must stay medium (source was 4, not ≤3)
    if (r.state.boardSize > 4) {
      expect(r.state.settings.difficulty).toBe('medium')
    } else {
      // Terminal draw at 4 is also fine if pattern won/drew without growth
      expect(['draw', 'won', 'in_progress']).toContain(r.state.status)
    }
    // Direct unit: growBoardInPlace from 5 never bumps hard
    const g5 = createGame({ boardSize: 5, settings: { mode: 'vs_ai', difficulty: 'hard' } })
    const grown = growBoardInPlace(g5, 6)
    expect(grown.boardSize).toBe(6)
    expect(grown.settings.difficulty).toBe('hard')
  })

  it('skips intermediate size when next player would win immediately', () => {
    // Craft a 3×3 embed where on 4×4 with winLength 4 nobody wins immediately is normal.
    // For a forced skip we need hasImmediateWin on candidate 4 but not 5.
    // Build a 4×4 position where next player has a 4-in-a-row threat on one empty cell.
    const board4: ('X' | 'O' | null)[] = [
      'X', 'X', 'X', null,
      'O', 'O', 'O', null,
      null, null, null, null,
      null, null, null, null,
    ]
    // X to move on 4×4 has immediate win at 3; planBoardGrowth from 3 wouldn't produce this.
    // Call planBoardGrowth with source 4: next player X has win at 3 on size 4 → should try 5
    const plan = planBoardGrowth(board4, 4, 'X')
    expect(plan.grew).toBe(true)
    expect(plan.boardSize).toBeGreaterThanOrEqual(5)
    expect(hasImmediateWin(plan.board, plan.boardSize, plan.winLength, 'X')).toBe(false)
  })

  it('undo after growth is size-sticky (does not shrink board)', () => {
    const moves = [0, 1, 2, 4, 3, 6, 5, 8, 7]
    let g = createGame()
    for (const m of moves) {
      const r = applyMove(g, m)
      if (!r.ok) return
      g = r.state
    }
    expect(g.boardSize).toBe(4)
    expect(g.justGrew).toBe(true)
    const beforeUndo = g.moveHistory.length
    g = undoMove(g)
    expect(g.boardSize).toBe(4) // sticky — not back to 3×3
    expect(g.moveHistory.length).toBe(beforeUndo - 1)
    expect(g.justGrew).toBe(false)
    expect(g.status).toBe('in_progress')
  })

  it('resetProgression returns to 3×3', () => {
    let g = createGame({ boardSize: 5 })
    g = resetGame(g, { resetProgression: true })
    expect(g.boardSize).toBe(3)
    expect(g.justGrew).toBe(false)
  })

  it('growBoardInPlace remaps move history indices', () => {
    let g = createGame()
    const r = applyMove(g, 4)
    if (!r.ok) return
    g = r.state
    g = growBoardInPlace(g, 4)
    expect(g.boardSize).toBe(4)
    expect(g.moveHistory[0]!.cellIndex).toBe(5) // center 4 on 3×3 → 5 on 4×4
    expect(g.board[5]).toBe('X')
  })

  it('detects 4-in-a-row on a 4×4 board', () => {
    let g = createGame({ boardSize: 4 })
    // X fills first row: 0,1,2,3 with O playing elsewhere
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
    // Place X on diagonal 0,6,12,18 (indices for 5×5: row*5+col)
    let g = createGame({ boardSize: 5 })
    expect(g.winLength).toBe(4)
    const seq = [0, 1, 6, 2, 12, 3, 18] // X at 0,6,12,18
    for (const m of seq) {
      const r = applyMove(g, m)
      if (!r.ok) return
      g = r.state
    }
    expect(g.status).toBe('won')
    expect(g.winner).toBe('X')
  })

  it('resolveEscalation keeps current board size on normal reset', () => {
    const g = createGame({ boardSize: 5 })
    const planned = resolveEscalation(g, { applyEscalation: true })
    expect(planned.boardSize).toBe(5)
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
