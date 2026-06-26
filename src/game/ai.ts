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
 * Depth limit for minimax. 3×3 is exhaustive (tiny tree).
 * Hard on 4×4+ stays tactical (depth 1). Impossible searches deeper but stays
 * well under a 200ms move budget on every board size.
 */
function maxSearchDepth(boardSize: BoardSize, difficulty: Difficulty = 'hard'): number {
  if (boardSize <= 3) return 20
  if (difficulty !== 'impossible') return 1
  // Conservative depths; iterative deepening + deadline aborts long branches.
  switch (boardSize) {
    case 4:
      return 5
    case 5:
      return 4
    case 6:
      return 3
    case 7:
      return 2
    case 8:
    case 9:
      return 2
    default:
      return 1
  }
}

/** Hard uses pure tactics on 4×4+; impossible always searches (depth-limited). */
function prefersTacticalHard(boardSize: BoardSize, difficulty: Difficulty = 'hard'): boolean {
  return boardSize >= 4 && difficulty !== 'impossible'
}

/** Hard ceiling for a single impossible move calculation (ms). Leave headroom under 200ms. */
const IMPOSSIBLE_MOVE_BUDGET_MS = 160

/** Sentinel: minimax aborted due to time; caller should discard incomplete root scores. */
const SEARCH_ABORTED = -1e9

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

/**
 * Leaf evaluation: center control + open-line potential (near-complete segments score high).
 * Stronger than pure distance so depth-limited impossible play builds threats.
 */
function heuristicScore(board: Cell[], ctx: BoardContext, maximizingPlayer: Player): number {
  let score = 0
  const center = (ctx.boardSize - 1) / 2
  const opp = opponent(maximizingPlayer)
  for (let i = 0; i < board.length; i++) {
    const cell = board[i]
    if (cell === null) continue
    const { row, col } = indexToRowCol(i, ctx.boardSize)
    const dist = Math.abs(row - center) + Math.abs(col - center)
    const weight = Math.max(0, ctx.boardSize - dist)
    score += cell === maximizingPlayer ? weight : -weight
  }

  // Segment potential: reward own partial lines, penalize opponent's.
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
        let theirs = 0
        let empty = 0
        let r = row
        let c = col
        for (let i = 0; i < k; i++) {
          const cell = board[r * ctx.boardSize + c]
          if (cell === maximizingPlayer) mine++
          else if (cell === opp) theirs++
          else empty++
          r += dr
          c += dc
        }
        if (theirs === 0 && mine > 0) {
          // Exponential: 1-in-line is mild, (k-1) is a near-win threat.
          score += mine * mine * 4 + (mine === k - 1 ? 40 : 0)
        } else if (mine === 0 && theirs > 0) {
          score -= theirs * theirs * 4 + (theirs === k - 1 ? 40 : 0)
        }
      }
    }
  }

  // Immediate double-threat pressure (fork readiness).
  score += countImmediateThreats(board, maximizingPlayer, ctx) * 30
  score -= countImmediateThreats(board, opp, ctx) * 35
  return score
}

/**
 * Minimax with depth preference (faster wins / slower losses).
 * Score from `maximizingPlayer` perspective: ~1000 win, ~-1000 loss, 0 draw.
 * When `deadline` is finite, aborts with SEARCH_ABORTED if time runs out.
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
  deadline: number = Infinity,
): number {
  if (deadline < Infinity && performance.now() >= deadline) return SEARCH_ABORTED

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
      const score = minimax(
        next,
        opponent(current),
        maximizingPlayer,
        depth + 1,
        alpha,
        beta,
        ctx,
        maxDepth,
        deadline,
      )
      if (score === SEARCH_ABORTED) return SEARCH_ABORTED
      best = Math.max(best, score)
      alpha = Math.max(alpha, best)
      if (beta <= alpha) break
    }
    return best
  }

  let best = Infinity
  for (const m of moves) {
    const next = setCell(board, m, current)
    const score = minimax(
      next,
      opponent(current),
      maximizingPlayer,
      depth + 1,
      alpha,
      beta,
      ctx,
      maxDepth,
      deadline,
    )
    if (score === SEARCH_ABORTED) return SEARCH_ABORTED
    best = Math.min(best, score)
    beta = Math.min(beta, best)
    if (beta <= alpha) break
  }
  return best
}

/**
 * Collect minimax-optimal moves (same best score).
 * For impossible on large boards, iteratively deepen and stop before the time budget.
 */
function optimalMoves(
  board: Cell[],
  aiPlayer: Player,
  ctx: BoardContext,
  difficulty: Difficulty = 'hard',
): number[] {
  const moves = getEmptyCells(board)
  if (moves.length === 0) throw new Error('No legal moves')

  const targetDepth = maxSearchDepth(ctx.boardSize, difficulty)
  const useBudget = difficulty === 'impossible' && ctx.boardSize >= 4
  const deadline = useBudget ? performance.now() + IMPOSSIBLE_MOVE_BUDGET_MS : Infinity

  // Order root candidates once (strong first) for better alpha-beta + early good PV.
  const ordered = orderedMoves(board, aiPlayer, ctx)
  let best: number[] = ordered.slice(0, 1)
  let bestScore = -Infinity

  const searchAtDepth = (
    maxDepth: number,
  ): { moves: number[]; score: number; timedOut: boolean; complete: boolean } => {
    let localBest = -Infinity
    const winners: number[] = []
    for (const m of ordered) {
      if (performance.now() >= deadline) {
        return {
          moves: winners,
          score: localBest,
          timedOut: true,
          complete: false,
        }
      }
      const next = setCell(board, m, aiPlayer)
      const score = minimax(
        next,
        opponent(aiPlayer),
        aiPlayer,
        0,
        -Infinity,
        Infinity,
        ctx,
        maxDepth,
        deadline,
      )
      if (score === SEARCH_ABORTED) {
        return {
          moves: winners,
          score: localBest,
          timedOut: true,
          complete: false,
        }
      }
      if (score > localBest) {
        localBest = score
        winners.length = 0
        winners.push(m)
      } else if (score === localBest) {
        winners.push(m)
      }
    }
    return { moves: winners, score: localBest, timedOut: false, complete: true }
  }

  if (!useBudget) {
    const result = searchAtDepth(targetDepth)
    return result.moves.length > 0 ? result.moves : ordered.slice(0, 1)
  }

  // Iterative deepening: only adopt a depth if every root move finished in time.
  for (let depth = 1; depth <= targetDepth; depth++) {
    if (performance.now() >= deadline) break
    const result = searchAtDepth(depth)
    if (result.complete && result.moves.length > 0) {
      best = result.moves
      bestScore = result.score
    }
    if (result.timedOut || !result.complete) break
    // Winning forced line — no need to search deeper.
    if (bestScore >= 900) break
  }

  return best
}

/**
 * Hard: optimal minimax on 3×3; tactical on 4×4+ (sub-second budget).
 * Among equally optimal lines on 3×3, pick randomly for variety.
 */
function chooseHardMove(board: Cell[], aiPlayer: Player, ctx: BoardContext): number {
  if (prefersTacticalHard(ctx.boardSize, 'hard')) {
    // No random slips on tactical rungs (discipline on 5×5+).
    return chooseMediumMove(board, aiPlayer, ctx, /*allowSlip*/ false)
  }
  return randomChoice(optimalMoves(board, aiPlayer, ctx, 'hard'))
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
 * Impossible: optimal minimax + deterministic tie-breaks + opening book on 3×3.
 * On 4×4–9×9: depth-limited minimax with iterative deepening (≤160ms budget),
 * plus tactical pre-checks so instant wins/blocks never get missed.
 */
function chooseImpossibleMove(board: Cell[], aiPlayer: Player, ctx: BoardContext): number {
  const moves = getEmptyCells(board)
  const human = opponent(aiPlayer)

  // Always take forced tactics first (cheap; minimax would agree but this is O(moves)).
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
  // Multiple fork-blocks: prefer the one minimax/heuristic ranks highest via search below.

  const book = openingBookMove(board, aiPlayer, ctx)
  if (book !== null) {
    const optimal = optimalMoves(board, aiPlayer, ctx, 'impossible')
    if (optimal.includes(book)) return book
  }

  const optimal = optimalMoves(board, aiPlayer, ctx, 'impossible')
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
 * forks when obvious, otherwise uses cell priority with a rare (~5%) random slip.
 * Hard/impossible large-board fallbacks pass allowSlip=false (no gifts on upper rungs).
 */
function chooseMediumMove(
  board: Cell[],
  aiPlayer: Player,
  ctx: BoardContext,
  allowSlip = true,
): number {
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

  if (allowSlip && Math.random() < 0.05) {
    return randomChoice(moves)
  }

  for (const p of priorityIndices(ctx.boardSize)) {
    if (moves.includes(p)) return p
  }
  return allowSlip ? randomChoice(moves) : (moves[0] ?? priorityIndices(ctx.boardSize)[0]!)
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
