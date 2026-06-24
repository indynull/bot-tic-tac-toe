import { evaluateBoard, getEmptyCells, opponent, setCell } from './board'
import type { Cell, Difficulty, Player } from './types'
import type { GameState } from './types'
import { WIN_LINES } from './types'
import { getAiPlayer, getLegalMoves as stateLegalMoves } from './engine'

function randomChoice<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)]!
}

/** Strategic cell weights: center > corners > edges (classic optimal opening theory). */
const POSITION_WEIGHT: readonly number[] = [3, 1, 3, 1, 5, 1, 3, 1, 3]

/**
 * Count how many ways `player` can complete a line on the next turn from `board`.
 * Used to detect and create forks (two simultaneous threats = guaranteed win).
 */
function countImmediateThreats(board: Cell[], player: Player): number {
  let threats = 0
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

/** Does placing `player` at `move` on `board` create a fork (2+ threats)? */
function createsFork(board: Cell[], move: number, player: Player): boolean {
  return countImmediateThreats(setCell(board, move, player), player) >= 2
}

/**
 * Quiet-position heuristic for move ordering / tie-breaking among equal minimax scores.
 * Prefers: instant wins > blocks > forks > center > corners > edges.
 * Micro-scores are tiny so they never override true minimax win/loss/draw outcomes.
 */
function positionHeuristic(board: Cell[], move: number, aiPlayer: Player): number {
  const human = opponent(aiPlayer)
  const afterAi = setCell(board, move, aiPlayer)
  let h = POSITION_WEIGHT[move]! * 0.001

  if (evaluateBoard(afterAi).winner === aiPlayer) h += 100
  if (evaluateBoard(setCell(board, move, human)).winner === human) h += 50
  if (countImmediateThreats(afterAi, aiPlayer) >= 2) h += 25
  // Deny opponent fork setups by taking the forking square ourselves
  if (createsFork(board, move, human)) h += 20

  return h
}

/** Order moves for better alpha-beta pruning (try strong cells first). */
function orderedMoves(board: Cell[], player: Player): number[] {
  const moves = getEmptyCells(board)
  return moves.sort((a, b) => {
    const ha = positionHeuristic(board, a, player)
    const hb = positionHeuristic(board, b, player)
    return hb - ha
  })
}

/**
 * Full minimax with depth preference (faster wins / slower losses).
 * Score from `maximizingPlayer` perspective: ~10 win, ~-10 loss, 0 draw.
 * Move ordering improves pruning on larger search trees.
 */
function minimax(
  board: Cell[],
  current: Player,
  maximizingPlayer: Player,
  depth: number,
  alpha: number,
  beta: number,
): number {
  const outcome = evaluateBoard(board)
  if (outcome.status === 'won') {
    // Stronger depth bias: win ASAP, delay losses as long as possible
    return outcome.winner === maximizingPlayer ? 1000 - depth * 10 : depth * 10 - 1000
  }
  if (outcome.status === 'draw') return 0

  const moves = orderedMoves(board, current)
  const isMax = current === maximizingPlayer

  if (isMax) {
    let best = -Infinity
    for (const m of moves) {
      const next = setCell(board, m, current)
      const score = minimax(next, opponent(current), maximizingPlayer, depth + 1, alpha, beta)
      best = Math.max(best, score)
      alpha = Math.max(alpha, best)
      if (beta <= alpha) break
    }
    return best
  }

  let best = Infinity
  for (const m of moves) {
    const next = setCell(board, m, current)
    const score = minimax(next, opponent(current), maximizingPlayer, depth + 1, alpha, beta)
    best = Math.min(best, score)
    beta = Math.min(beta, best)
    if (beta <= alpha) break
  }
  return best
}

/**
 * Optimal play: minimax + heuristic tie-break among equally scored moves.
 * Never picks a sub-optimal line; among perfect lines, picks the most punishing.
 */
function chooseHardMove(board: Cell[], aiPlayer: Player): number {
  const moves = getEmptyCells(board)
  if (moves.length === 0) throw new Error('No legal moves')

  let bestScore = -Infinity
  let bestTieBreak = -Infinity
  let bestMove = moves[0]!

  for (const m of moves) {
    const next = setCell(board, m, aiPlayer)
    const score = minimax(next, opponent(aiPlayer), aiPlayer, 0, -Infinity, Infinity)
    const tie = positionHeuristic(board, m, aiPlayer)
    if (score > bestScore || (score === bestScore && tie > bestTieBreak)) {
      bestScore = score
      bestTieBreak = tie
      bestMove = m
    }
  }

  return bestMove
}

/**
 * Opening book: on an empty board, always take center (strongest first move).
 * If center is taken, answer with a corner — denies early fork setups.
 */
function openingBookMove(board: Cell[], aiPlayer: Player): number | null {
  const empties = getEmptyCells(board)
  const filled = 9 - empties.length

  if (filled === 0) return 4 // center

  if (filled === 1) {
    // Human opened; respond optimally
    if (board[4] === null) return 4
    // Human took center → take a corner (prefer 0 for consistency)
    const corners = [0, 2, 6, 8].filter((i) => board[i] === null)
    if (corners.length > 0) return corners[0]!
  }

  if (filled === 2 && board[4] === aiPlayer) {
    // We opened center; if human played edge, take opposite-side corner pair logic via minimax
    // If human played corner, take opposite corner to set up
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
 * Impossible: perfect minimax + opening book + extra aggression.
 * Always optimal; among draws, maximizes opponent pressure via fork bias.
 */
function chooseImpossibleMove(board: Cell[], aiPlayer: Player): number {
  const book = openingBookMove(board, aiPlayer)
  if (book !== null) {
    // Verify book move is still optimal (paranoia check — never play sub-optimal)
    const moves = getEmptyCells(board)
    if (moves.includes(book)) {
      const bookScore = minimax(
        setCell(board, book, aiPlayer),
        opponent(aiPlayer),
        aiPlayer,
        0,
        -Infinity,
        Infinity,
      )
      let bestOther = -Infinity
      for (const m of moves) {
        if (m === book) continue
        const s = minimax(
          setCell(board, m, aiPlayer),
          opponent(aiPlayer),
          aiPlayer,
          0,
          -Infinity,
          Infinity,
        )
        bestOther = Math.max(bestOther, s)
      }
      if (bookScore >= bestOther) return book
    }
  }
  return chooseHardMove(board, aiPlayer)
}

/**
 * Medium: near-optimal tactical play. Always takes wins/blocks, creates forks,
 * and only rarely (~8%) slips to a non-optimal but still legal move.
 */
function chooseMediumMove(board: Cell[], aiPlayer: Player): number {
  const moves = getEmptyCells(board)
  if (moves.length === 0) throw new Error('No legal moves')
  const human = opponent(aiPlayer)

  // Always finish if we can win now
  for (const m of moves) {
    if (evaluateBoard(setCell(board, m, aiPlayer)).winner === aiPlayer) return m
  }

  // Always block opponent's immediate win
  for (const m of moves) {
    if (evaluateBoard(setCell(board, m, human)).winner === human) return m
  }

  // Create a fork when possible
  for (const m of moves) {
    if (createsFork(board, m, aiPlayer)) return m
  }

  // Block opponent fork
  const forkBlocks = moves.filter((m) => createsFork(board, m, human))
  if (forkBlocks.length === 1) return forkBlocks[0]!
  if (forkBlocks.length > 1) {
    // Multiple fork threats: fall back to optimal minimax (rare on 3×3)
    return chooseHardMove(board, aiPlayer)
  }

  // Small slip chance so medium isn't literally impossible
  if (Math.random() < 0.08) {
    return randomChoice(moves)
  }

  // Otherwise use full optimal play
  return chooseHardMove(board, aiPlayer)
}

/**
 * Easy: still mostly random, but occasionally plays a smart tactical move
 * so it doesn't feel completely brain-dead — and blocks/wins ~35% of the time.
 */
function chooseEasyMove(board: Cell[], aiPlayer?: Player): number {
  const moves = getEmptyCells(board)
  if (moves.length === 0) throw new Error('No legal moves')

  if (aiPlayer && Math.random() < 0.35) {
    const human = opponent(aiPlayer)
    for (const m of moves) {
      if (evaluateBoard(setCell(board, m, aiPlayer)).winner === aiPlayer) return m
    }
    for (const m of moves) {
      if (evaluateBoard(setCell(board, m, human)).winner === human) return m
    }
  } else if (Math.random() < 0.2) {
    for (const player of ['X', 'O'] as Player[]) {
      for (const m of moves) {
        if (evaluateBoard(setCell(board, m, player)).winner === player) return m
      }
    }
  }
  return randomChoice(moves)
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

  switch (diff) {
    case 'easy':
      return chooseEasyMove(board, aiPlayer)
    case 'medium':
      return chooseMediumMove(board, aiPlayer)
    case 'hard':
      return chooseHardMove(board, aiPlayer)
    case 'impossible':
      return chooseImpossibleMove(board, aiPlayer)
    default:
      return chooseImpossibleMove(board, aiPlayer)
  }
}

/** Exported for tests: optimal move on a raw board. */
export function chooseHardMoveForBoard(board: Cell[], aiPlayer: Player): number {
  return chooseHardMove(board, aiPlayer)
}
