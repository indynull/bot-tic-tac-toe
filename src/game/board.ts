import type { Cell, Player } from './types'
import { WIN_LINES } from './types'

export const BOARD_SIZE = 9
export const ROWS = 3
export const COLS = 3

export function createEmptyBoard(): Cell[] {
  return Array.from({ length: BOARD_SIZE }, () => null)
}

export function indexToRowCol(index: number): { row: number; col: number } {
  return { row: Math.floor(index / COLS), col: index % COLS }
}

export function rowColToIndex(row: number, col: number): number {
  return row * COLS + col
}

export function isValidIndex(index: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < BOARD_SIZE
}

export function isInBounds(row: number, col: number): boolean {
  return (
    Number.isInteger(row) &&
    Number.isInteger(col) &&
    row >= 0 &&
    row < ROWS &&
    col >= 0 &&
    col < COLS
  )
}

export function setCell(board: Cell[], index: number, player: Player): Cell[] {
  const next = board.slice()
  next[index] = player
  return next
}

/** Empty cell indices on a raw board (no game-status check). */
export function getEmptyCells(board: Cell[]): number[] {
  const moves: number[] = []
  for (let i = 0; i < board.length; i++) {
    if (board[i] === null) moves.push(i)
  }
  return moves
}

export function opponent(player: Player): Player {
  return player === 'X' ? 'O' : 'X'
}

export interface Outcome {
  status: 'in_progress' | 'won' | 'draw'
  winner: Player | null
  winningLine: number[] | null
}

/** Evaluate board after a move; win checked before draw. */
export function evaluateBoard(board: Cell[]): Outcome {
  for (const line of WIN_LINES) {
    const [a, b, c] = line
    const v = board[a]
    if (v !== null && v === board[b] && v === board[c]) {
      return { status: 'won', winner: v, winningLine: [...line] }
    }
  }
  if (board.every((cell) => cell !== null)) {
    return { status: 'draw', winner: null, winningLine: null }
  }
  return { status: 'in_progress', winner: null, winningLine: null }
}
