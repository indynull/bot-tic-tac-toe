import { evaluateBoard, getEmptyCells, indexToRowCol, opponent, setCell } from './board'
import type { BoardSize, Cell, Difficulty, GameState, Player } from './types'
import { DEFAULT_BOARD_SIZE, winLengthForBoard, WIN_LINES } from './types'
import { getAiPlayer, getLegalMoves as stateLegalMoves } from './engine'

function randomChoice<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)]!
}

interface BoardContext {
  boardSize: BoardSize
  winLength: number
}

/**
 * Depth limit for minimax. 3×3 stays exhaustive; larger boards use shallow search
 * with one extra ply on 4×4 vs the old ladder (still low-millisecond range).
 */
function maxSearchDepth(boardSize: BoardSize): number {
  if (boardSize <= 3) return 20
  if (boardSize === 4) return 4
  if (boardSize === 5) return 2
  if (boardSize === 6) return 1
  return 1
}

/** Only 7×7 falls back to pure tactical; 5×6 run limited minimax (was tactical-only). */
function prefersTacticalHard(boardSize: BoardSize): boolean {
  return boardSize >= 7
}

/** Strategic cell weights for classic 3×3: center > corners > edges. */
const POSITION_WEIGHT_3: readonly number[] = [3, 1, 3, 1, 5, 1, 3, 1, 3]

function positionWeight(move: number, boardSize: BoardSize): number {
  if (boardSize === 3 && move < POSITION_WEIGHT_3.length) {
    return POSITION_WEIGHT_3[move]!
  }
  const { row, col } = indexToRowCol(move, boardSize)
  const center = (boardSize - 1) / 2
  const dist = Math.abs(row - center) + Math.abs(col - center)
  return Math.max(0, boardSize - dist)
}

/**
 * Count how many ways `player` can complete a line on the next turn from `board`.
 * Used to detect and create forks (two simultaneous threats = guaranteed win).
 */
function countImmediateThreats(board: Cell[], player: Player, ctx: BoardContext): number {
  let threats = 0
  if (ctx.boardSize === 3 && ctx.winLength === 3) {
    for (const line of WIN_LINES) {
      let mine = 0
      let empty = 0
      for (const idx of line) {
        const cell = board[idx]
        if (cell === player) mine++
        else if (cell === null) empty++
      }
      if (mine === 2 && empty === 1) threats++
    }
    return threats
  }
  // General N×N: scan all potential winning segments
  const k = ctx.winLength
  const dirs: [number, number][] = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ]
  for (let row = 0; row < ctx.boardSize; row++) {
    for (let col = 0; col < ctx.boardSize; col++) {
      for (const [dr, dc] of dirs) {
        const endR = row + dr * (k - 1)
        const endC = col + dc * (k - 1)
        if (endR < 0 || endC < 0 || endR >= ctx.boardSize || endC >= ctx.boardSize) continue
        let mine = 0
        let empty = 0
        let r = row
        let c = col
        for (let i = 0; i < k; i++) {
          const idx = r * ctx.boardSize + c
          const cell = board[idx]
          if (cell === player) mine++
          else if (cell === null) empty++
          r += dr
          c += dc
        }
        if (mine === k - 1 && empty === 1) threats++
      }
    }
  }
  return threats
}

/** Does placing `player` at `move` on `board` create a fork (2+ threats)? */
function createsFork(board: Cell[], move: number, player: Player, ctx: BoardContext): boolean {
  return countImmediateThreats(setCell(board, move, player), player, ctx) >= 2
}

/**
 * Quiet-position heuristic for move ordering / tie-breaking among equal minimax scores.
 */
function positionHeuristic(board: Cell[], move: number, aiPlayer: Player, ctx: BoardContext): number {
  const human = opponent(aiPlayer)
  const afterAi = setCell(board, move, aiPlayer)
  let h = positionWeight(move, ctx.boardSize) * 0.001

  if (evaluateBoard(afterAi, ctx.boardSize, ctx.winLength).winner === aiPlayer) h += 100
  if (evaluateBoard(setCell(board, move, human), ctx.boardSize, ctx.winLength).winner === human) h += 50
  if (countImmediateThreats(afterAi, aiPlayer, ctx) >= 2) h += 25
  if (createsFork(board, move, human, ctx)) h += 20

  return h
}

/** Order moves for better alpha-beta pruning (try strong cells first). */
function orderedMoves(board: Cell[], player: Player, ctx: BoardContext): number[] {
  const moves = getEmptyCells(board)
  return moves.sort((a, b) => {
    const ha = positionHeuristic(board, a, player, ctx)
    const hb = positionHeuristic(board, b, player, ctx)
    return hb - ha
  })
}

function heuristicScore(board: Cell[], ctx: BoardContext, maximizingPlayer: Player): number {
  let score = 0
  const center = (ctx.boardSize - 1) / 2
  for (let i = 0; i < board.length; i++) {
    const cell = board[i]
    if (cell === null) continue
    const { row, col } = indexToRowCol(i, ctx.boardSize)
    const dist = Math.abs(row - center) + Math.abs(col - center)
    const weight = Math.max(0, ctx.boardSize - dist)
    score += cell === maximizingPlayer ? weight : -weight
  }
  return score
}

/**
 * Minimax with depth preference (faster wins / slower losses).
 * Score from `maximizingPlayer` perspective: ~1000 win, ~-1000 loss, 0 draw.
 */
function minimax(
  board: Cell[],
  current: Player,
  maximizingPlayer: Player,
  depth: number,
  alpha: number,
  beta: number,
  ctx: BoardContext,
  maxDepth: number,
): number {
  const outcome = evaluateBoard(board, ctx.boardSize, ctx.winLength)
  if (outcome.status === 'won') {
    return outcome.winner === maximizingPlayer ? 1000 - depth * 10 : depth * 10 - 1000
  }
  if (outcome.status === 'draw') return 0
  if (depth >= maxDepth) {
    return heuristicScore(board, ctx, maximizingPlayer) * 0.01
  }

  const moves = orderedMoves(board, current, ctx)
  const isMax = current === maximizingPlayer

  if (isMax) {
    let best = -Infinity
    for (const m of moves) {
      const next = setCell(board, m, current)
      const score = minimax(next, opponent(current), maximizingPlayer, depth + 1, alpha, beta, ctx, maxDepth)
      best = Math.max(best, score)
      alpha = Math.max(alpha, best)
      if (beta <= alpha) break
    }
    return best
  }

  let best = Infinity
  for (const m of moves) {
    const next = setCell(board, m, current)
    const score = minimax(next, opponent(current), maximizingPlayer, depth + 1, alpha, beta, ctx, maxDepth)
    best = Math.min(best, score)
    beta = Math.min(beta, best)
    if (beta <= alpha) break
  }
  return best
}

/** Collect all minimax-optimal moves (same best score). */
function optimalMoves(board: Cell[], aiPlayer: Player, ctx: BoardContext): number[] {
  const moves = getEmptyCells(board)
  if (moves.length === 0) throw new Error('No legal moves')

  const maxDepth = maxSearchDepth(ctx.boardSize)
  let bestScore = -Infinity
  const best: number[] = []

  for (const m of moves) {
    const next = setCell(board, m, aiPlayer)
    const score = minimax(next, opponent(aiPlayer), aiPlayer, 0, -Infinity, Infinity, ctx, maxDepth)
    if (score > bestScore) {
      bestScore = score
      best.length = 0
      best.push(m)
    } else if (score === bestScore) {
      best.push(m)
    }
  }

  return best
}

/**
 * Hard: optimal minimax on 3×3; limited-depth minimax on 4×4–6×6; tactical on 7×7.
 * Among equally optimal lines on small boards, pick randomly for variety.
 */
function chooseHardMove(board: Cell[], aiPlayer: Player, ctx: BoardContext): number {
  if (prefersTacticalHard(ctx.boardSize)) {
    return chooseMediumMove(board, aiPlayer, ctx)
  }
  return randomChoice(optimalMoves(board, aiPlayer, ctx))
}

/**
 * Opening book for 3×3: center first; respond to center with corner.
 */
function openingBookMove(board: Cell[], aiPlayer: Player, ctx: BoardContext): number | null {
  if (ctx.boardSize !== 3) return null
  const empties = getEmptyCells(board)
  const filled = 9 - empties.length

  if (filled === 0) return 4

  if (filled === 1) {
    if (board[4] === null) return 4
    const corners = [0, 2, 6, 8].filter((i) => board[i] === null)
    if (corners.length > 0) return corners[0]!
  }

  if (filled === 2 && board[4] === aiPlayer) {
    const human = opponent(aiPlayer)
    const oppCorners: Record<number, number> = { 0: 8, 2: 6, 6: 2, 8: 0 }
    for (const [corner, opposite] of Object.entries(oppCorners)) {
      const c = Number(corner)
      if (board[c] === human && board[opposite] === null) return opposite
    }
  }

  return null
}

/**
 * Impossible: optimal minimax + deterministic fork/position tie-breaks + opening book on 3×3.
 * On 4×4–6×6 uses limited minimax with deterministic tie-breaks; on 7×7 uses tactical play.
 */
function chooseImpossibleMove(board: Cell[], aiPlayer: Player, ctx: BoardContext): number {
  if (prefersTacticalHard(ctx.boardSize)) {
    // Deterministic tactical: prefer center/corners over random medium slips
    const moves = getEmptyCells(board)
    const human = opponent(aiPlayer)
    for (const m of moves) {
      if (evaluateBoard(setCell(board, m, aiPlayer), ctx.boardSize, ctx.winLength).winner === aiPlayer) return m
    }
    for (const m of moves) {
      if (evaluateBoard(setCell(board, m, human), ctx.boardSize, ctx.winLength).winner === human) return m
    }
    for (const m of moves) {
      if (createsFork(board, m, aiPlayer, ctx)) return m
    }
    const forkBlocks = moves.filter((m) => createsFork(board, m, human, ctx))
    if (forkBlocks.length === 1) return forkBlocks[0]!
    for (const p of priorityIndices(ctx.boardSize)) {
      if (moves.includes(p)) return p
    }
    return moves[0]!
  }

  const book = openingBookMove(board, aiPlayer, ctx)
  if (book !== null) {
    const optimal = optimalMoves(board, aiPlayer, ctx)
    if (optimal.includes(book)) return book
  }

  const optimal = optimalMoves(board, aiPlayer, ctx)
  let bestTie = -Infinity
  let bestMove = optimal[0]!
  for (const m of optimal) {
    const tie = positionHeuristic(board, m, aiPlayer, ctx)
    if (tie > bestTie) {
      bestTie = tie
      bestMove = m
    }
  }
  return bestMove
}

/** Cell priority: center first, then corners/edges — works for any N×N. */
function priorityIndices(boardSize: BoardSize): number[] {
  const center = Math.floor(boardSize / 2)
  const indices: number[] = []
  const seen = new Set<number>()
  const push = (r: number, c: number) => {
    if (r < 0 || c < 0 || r >= boardSize || c >= boardSize) return
    const i = r * boardSize + c
    if (!seen.has(i)) {
      seen.add(i)
      indices.push(i)
    }
  }
  push(center, center)
  push(0, 0)
  push(0, boardSize - 1)
  push(boardSize - 1, 0)
  push(boardSize - 1, boardSize - 1)
  for (let r = 0; r < boardSize; r++) {
    for (let c = 0; c < boardSize; c++) {
      push(r, c)
    }
  }
  return indices
}

/**
 * Medium: tactical play without full minimax. Always takes wins/blocks, creates/blocks
 * forks when obvious, otherwise uses cell priority with a small (~8%) random slip.
 */
function chooseMediumMove(board: Cell[], aiPlayer: Player, ctx: BoardContext): number {
  const moves = getEmptyCells(board)
  if (moves.length === 0) throw new Error('No legal moves')
  const human = opponent(aiPlayer)

  for (const m of moves) {
    if (evaluateBoard(setCell(board, m, aiPlayer), ctx.boardSize, ctx.winLength).winner === aiPlayer) return m
  }

  for (const m of moves) {
    if (evaluateBoard(setCell(board, m, human), ctx.boardSize, ctx.winLength).winner === human) return m
  }

  for (const m of moves) {
    if (createsFork(board, m, aiPlayer, ctx)) return m
  }

  const forkBlocks = moves.filter((m) => createsFork(board, m, human, ctx))
  if (forkBlocks.length === 1) return forkBlocks[0]!

  if (Math.random() < 0.08) {
    return randomChoice(moves)
  }

  for (const p of priorityIndices(ctx.boardSize)) {
    if (moves.includes(p)) return p
  }
  return randomChoice(moves)
}

/**
 * Easy: still beatable, but always takes instant wins and often blocks — ~55% tactical.
 */
function chooseEasyMove(board: Cell[], ctx: BoardContext, aiPlayer?: Player): number {
  const moves = getEmptyCells(board)
  if (moves.length === 0) throw new Error('No legal moves')

  // Never leave a free win on the table even on easy.
  if (aiPlayer) {
    for (const m of moves) {
      if (evaluateBoard(setCell(board, m, aiPlayer), ctx.boardSize, ctx.winLength).winner === aiPlayer) return m
    }
  }

  if (aiPlayer && Math.random() < 0.55) {
    const human = opponent(aiPlayer)
    for (const m of moves) {
      if (evaluateBoard(setCell(board, m, human), ctx.boardSize, ctx.winLength).winner === human) return m
    }
    for (const m of moves) {
      if (createsFork(board, m, aiPlayer, ctx)) return m
    }
  } else if (Math.random() < 0.3) {
    for (const player of ['X', 'O'] as Player[]) {
      for (const m of moves) {
        if (evaluateBoard(setCell(board, m, player), ctx.boardSize, ctx.winLength).winner === player) return m
      }
    }
  }
  return randomChoice(moves)
}

function ctxFromState(state: GameState): BoardContext {
  return { boardSize: state.boardSize, winLength: state.winLength }
}

/**
 * Choose an AI move for the given game state and difficulty.
 * Always returns a legal index when the game is in progress; throws if none exist.
 */
export function chooseMove(state: GameState, difficulty?: Difficulty): number {
  const diff = difficulty ?? state.settings.difficulty
  const legal = stateLegalMoves(state)
  if (legal.length === 0) {
    throw new Error('No legal moves available')
  }

  const aiPlayer = getAiPlayer(state)
  const board = state.board
  const ctx = ctxFromState(state)

  switch (diff) {
    case 'easy':
      return chooseEasyMove(board, ctx, aiPlayer)
    case 'medium':
      return chooseMediumMove(board, aiPlayer, ctx)
    case 'hard':
      return chooseHardMove(board, aiPlayer, ctx)
    case 'impossible':
      return chooseImpossibleMove(board, aiPlayer, ctx)
    default:
      return chooseEasyMove(board, ctx, aiPlayer)
  }
}

/** Exported for tests: optimal move on a raw 3×3 board. */
export function chooseHardMoveForBoard(
  board: Cell[],
  aiPlayer: Player,
  boardSize: BoardSize = DEFAULT_BOARD_SIZE,
): number {
  return chooseHardMove(board, aiPlayer, { boardSize, winLength: winLengthForBoard(boardSize) })
}

/** Exported for tests: impossible-tier move on a raw board. */
export function chooseImpossibleMoveForBoard(board: Cell[], aiPlayer: Player): number {
  return chooseImpossibleMove(board, aiPlayer, {
    boardSize: DEFAULT_BOARD_SIZE,
    winLength: winLengthForBoard(DEFAULT_BOARD_SIZE),
  })
}
