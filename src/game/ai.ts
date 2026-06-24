import { getEmptyIndices, oppositePlayer } from './board'
import { evaluateBoard } from './evaluate'
import type { Cell, Difficulty, GameState, Player } from './types'
import { getLegalMoves } from './engine'

function randomPick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)]!
}

/** Score from the perspective of `aiPlayer`: +10 win, -10 loss, 0 draw/ongoing. */
function minimax(
  board: Cell[],
  aiPlayer: Player,
  current: Player,
  depth: number,
  alpha: number,
  beta: number,
): number {
  const evaluation = evaluateBoard(board)
  if (evaluation.status === 'won') {
    return evaluation.winner === aiPlayer ? 10 - depth : depth - 10
  }
  if (evaluation.status === 'draw') {
    return 0
  }

  const empties = getEmptyIndices(board)
  const maximizing = current === aiPlayer

  if (maximizing) {
    let best = -Infinity
    for (const idx of empties) {
      board[idx] = current
      const score = minimax(board, aiPlayer, oppositePlayer(current), depth + 1, alpha, beta)
      board[idx] = null
      best = Math.max(best, score)
      alpha = Math.max(alpha, best)
      if (beta <= alpha) break
    }
    return best
  }

  let best = Infinity
  for (const idx of empties) {
    board[idx] = current
    const score = minimax(board, aiPlayer, oppositePlayer(current), depth + 1, alpha, beta)
    board[idx] = null
    best = Math.min(best, score)
    beta = Math.min(beta, best)
    if (beta <= alpha) break
  }
  return best
}

function chooseHardMove(board: readonly Cell[], aiPlayer: Player): number {
  const empties = getEmptyIndices(board)
  if (empties.length === 0) {
    throw new Error('No legal moves for hard AI')
  }

  const mutable = board.slice() as Cell[]
  let bestScore = -Infinity
  let bestMoves: number[] = []

  for (const idx of empties) {
    mutable[idx] = aiPlayer
    const score = minimax(mutable, aiPlayer, oppositePlayer(aiPlayer), 0, -Infinity, Infinity)
    mutable[idx] = null
    if (score > bestScore) {
      bestScore = score
      bestMoves = [idx]
    } else if (score === bestScore) {
      bestMoves.push(idx)
    }
  }

  return randomPick(bestMoves)
}

/** Immediate winning cell for player, or null. */
function findWinningMove(board: readonly Cell[], player: Player): number | null {
  for (const idx of getEmptyIndices(board)) {
    const trial = board.slice() as Cell[]
    trial[idx] = player
    const evaluation = evaluateBoard(trial)
    if (evaluation.status === 'won' && evaluation.winner === player) {
      return idx
    }
  }
  return null
}

function chooseMediumMove(board: readonly Cell[], aiPlayer: Player): number {
  const win = findWinningMove(board, aiPlayer)
  if (win !== null) return win

  const block = findWinningMove(board, oppositePlayer(aiPlayer))
  if (block !== null) return block

  // Prefer center, then corners, then edges — not optimal minimax.
  const preference = [4, 0, 2, 6, 8, 1, 3, 5, 7]
  for (const idx of preference) {
    if (board[idx] === null) return idx
  }

  return randomPick(getEmptyIndices(board))
}

function chooseEasyMove(board: readonly Cell[]): number {
  const empties = getEmptyIndices(board)
  if (empties.length === 0) {
    throw new Error('No legal moves for easy AI')
  }

  // Light bias: 20% chance to block a threat if one exists, else random.
  // Intentionally imperfect so humans can win.
  if (Math.random() < 0.2) {
    // Peek at threats for either player casually — miss often.
    for (const player of ['X', 'O'] as Player[]) {
      const threat = findWinningMove(board, player)
      if (threat !== null && Math.random() < 0.5) return threat
    }
  }

  return randomPick(empties)
}

/**
 * Choose an AI cell index for the given difficulty.
 * Caller must ensure it is the AI's turn and game is in progress.
 */
export function chooseMove(state: GameState, difficulty: Difficulty = state.settings.difficulty): number {
  const legal = getLegalMoves(state)
  if (legal.length === 0) {
    throw new Error('chooseMove called with no legal moves')
  }

  const aiPlayer = oppositePlayer(state.settings.humanPlayer)

  switch (difficulty) {
    case 'easy':
      return chooseEasyMove(state.board)
    case 'medium':
      return chooseMediumMove(state.board, aiPlayer)
    case 'hard':
      return chooseHardMove(state.board, aiPlayer)
    default: {
      const _exhaustive: never = difficulty
      return _exhaustive
    }
  }
}

/** Exported for tests: pure minimax best move. */
export function chooseOptimalMove(board: readonly Cell[], aiPlayer: Player): number {
  return chooseHardMove(board, aiPlayer)
}
