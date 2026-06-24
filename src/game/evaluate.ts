import { WIN_LINES } from './board'
import type { Cell, GameStatus, Player } from './types'

export interface Evaluation {
  status: GameStatus
  winner: Player | null
  winningLine: number[] | null
}

/**
 * Evaluate a board for terminal state.
 * Win is checked before draw so a full board with three-in-a-row still counts as a win.
 */
export function evaluateBoard(board: readonly Cell[]): Evaluation {
  for (const line of WIN_LINES) {
    const [a, b, c] = line
    const mark = board[a]
    if (mark !== null && mark === board[b] && mark === board[c]) {
      return {
        status: 'won',
        winner: mark,
        winningLine: [...line],
      }
    }
  }

  const hasEmpty = board.some((cell) => cell === null)
  if (!hasEmpty) {
    return { status: 'draw', winner: null, winningLine: null }
  }

  return { status: 'in_progress', winner: null, winningLine: null }
}
