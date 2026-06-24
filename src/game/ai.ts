import { evaluateBoard, getEmptyCells, opponent, setCell } from './board'
import type { Cell, Difficulty, Player } from './types'
import type { GameState } from './types'
import { getAiPlayer, getLegalMoves as stateLegalMoves } from './engine'

function randomChoice<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)]!
}

/** Full minimax: returns best score from `maximizingPlayer` perspective (+1 win, -1 loss, 0 draw). */
function minimax(
  board: Cell[],
  current: Player,
  maximizingPlayer: Player,
  alpha: number,
  beta: number,
): number {
  const outcome = evaluateBoard(board)
  if (outcome.status === 'won') {
    return outcome.winner === maximizingPlayer ? 1 : -1
  }
  if (outcome.status === 'draw') return 0

  const moves = getEmptyCells(board)
  const isMax = current === maximizingPlayer

  if (isMax) {
    let best = -Infinity
    for (const m of moves) {
      const next = setCell(board, m, current)
      const score = minimax(next, opponent(current), maximizingPlayer, alpha, beta)
      best = Math.max(best, score)
      alpha = Math.max(alpha, best)
      if (beta <= alpha) break
    }
    return best
  }

  let best = Infinity
  for (const m of moves) {
    const next = setCell(board, m, current)
    const score = minimax(next, opponent(current), maximizingPlayer, alpha, beta)
    best = Math.min(best, score)
    beta = Math.min(beta, best)
    if (beta <= alpha) break
  }
  return best
}

function chooseHardMove(board: Cell[], aiPlayer: Player): number {
  const moves = getEmptyCells(board)
  if (moves.length === 0) throw new Error('No legal moves')

  let bestScore = -Infinity
  const bestMoves: number[] = []

  for (const m of moves) {
    const next = setCell(board, m, aiPlayer)
    const score = minimax(next, opponent(aiPlayer), aiPlayer, -Infinity, Infinity)
    if (score > bestScore) {
      bestScore = score
      bestMoves.length = 0
      bestMoves.push(m)
    } else if (score === bestScore) {
      bestMoves.push(m)
    }
  }

  return randomChoice(bestMoves)
}

/** Medium: take win, block loss, else heuristic with occasional slip. */
function chooseMediumMove(board: Cell[], aiPlayer: Player): number {
  const moves = getEmptyCells(board)
  if (moves.length === 0) throw new Error('No legal moves')
  const human = opponent(aiPlayer)

  for (const m of moves) {
    const next = setCell(board, m, aiPlayer)
    if (evaluateBoard(next).winner === aiPlayer) return m
  }

  for (const m of moves) {
    const next = setCell(board, m, human)
    if (evaluateBoard(next).winner === human) return m
  }

  if (Math.random() < 0.25) {
    return randomChoice(moves)
  }

  const priority = [4, 0, 2, 6, 8, 1, 3, 5, 7]
  for (const p of priority) {
    if (moves.includes(p)) return p
  }
  return randomChoice(moves)
}

function chooseEasyMove(board: Cell[]): number {
  const moves = getEmptyCells(board)
  if (moves.length === 0) throw new Error('No legal moves')
  if (Math.random() < 0.15) {
    for (const player of ['X', 'O'] as Player[]) {
      for (const m of moves) {
        const next = setCell(board, m, player)
        if (evaluateBoard(next).winner === player) return m
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
      return chooseEasyMove(board)
    case 'medium':
      return chooseMediumMove(board, aiPlayer)
    case 'hard':
      return chooseHardMove(board, aiPlayer)
    default:
      return chooseEasyMove(board)
  }
}

/** Exported for tests: optimal move on a raw board. */
export function chooseHardMoveForBoard(board: Cell[], aiPlayer: Player): number {
  return chooseHardMove(board, aiPlayer)
}
