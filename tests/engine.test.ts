import { describe, expect, it } from 'vitest'
import {
  applyMove,
  createGame,
  getLegalMoves,
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
    expect(g.pendingEscalation).toBe(false)
  })

  it('supports custom board sizes', () => {
    const g = createGame({ boardSize: 4 })
    expect(g.boardSize).toBe(4)
    expect(g.winLength).toBe(4)
    expect(g.board).toHaveLength(16)
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
  it('detects a full-board draw', () => {
    // Classic draw sequence
    const moves = [0, 1, 2, 4, 3, 6, 5, 8, 7]
    let g = createGame()
    for (const m of moves) {
      const r = applyMove(g, m)
      expect(r.ok).toBe(true)
      if (!r.ok) return
      g = r.state
    }
    expect(g.status).toBe('draw')
    expect(g.winner).toBeNull()
    expect(g.scores.draws).toBe(1)
    expect(g.pendingEscalation).toBe(true)
  })
})

describe('draw escalation', () => {
  it('escalates board size and difficulty after a draw on new game (vs AI)', () => {
    const moves = [0, 1, 2, 4, 3, 6, 5, 8, 7]
    let g = createGame({ settings: { mode: 'vs_ai', difficulty: 'easy' } })
    for (const m of moves) {
      const r = applyMove(g, m)
      if (!r.ok) return
      g = r.state
    }
    expect(g.pendingEscalation).toBe(true)

    const planned = resolveEscalation(g)
    expect(planned.boardSize).toBe(4)
    expect(planned.settings.difficulty).toBe('medium')

    g = resetGame(g, { preserveScores: true, preserveSettings: true })
    expect(g.boardSize).toBe(4)
    expect(g.board).toHaveLength(16)
    expect(g.settings.difficulty).toBe('medium')
    expect(g.pendingEscalation).toBe(false)
    expect(g.status).toBe('in_progress')
  })

  it('escalates board size only in PvP (no difficulty change)', () => {
    const moves = [0, 1, 2, 4, 3, 6, 5, 8, 7]
    let g = createGame({ settings: { mode: 'local_pvp', difficulty: 'easy' } })
    for (const m of moves) {
      const r = applyMove(g, m)
      if (!r.ok) return
      g = r.state
    }
    g = resetGame(g)
    expect(g.boardSize).toBe(4)
    expect(g.settings.difficulty).toBe('easy')
  })

  it('does not escalate without a draw', () => {
    let g = createGame({ settings: { mode: 'vs_ai', difficulty: 'easy' } })
    // X wins top row
    for (const idx of [0, 3, 1, 4, 2]) {
      const r = applyMove(g, idx)
      if (!r.ok) return
      g = r.state
    }
    expect(g.status).toBe('won')
    expect(g.pendingEscalation).toBe(false)
    g = resetGame(g)
    expect(g.boardSize).toBe(3)
    expect(g.settings.difficulty).toBe('easy')
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
