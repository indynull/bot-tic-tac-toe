import type { Cell, Player } from './types'

export const BOARD_SIZE = 3
export const CELL_COUNT = BOARD_SIZE * BOARD_SIZE

/** Eight winning lines as cell indices on a 3×3 board. */
export const WIN_LINES: readonly (readonly number[])[] = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
] as const

export function createEmptyBoard(): Cell[] {
  return Array.from({ length: CELL_COUNT }, () => null)
}

export function isValidIndex(index: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < CELL_COUNT
}

export function indexToRowCol(index: number): { row: number; col: number } {
  if (!isValidIndex(index)) {
    throw new RangeError(`Cell index out of bounds: ${index}`)
  }
  return { row: Math.floor(index / BOARD_SIZE), col: index % BOARD_SIZE }
}

export function rowColToIndex(row: number, col: number): number {
  if (
    !Number.isInteger(row) ||
    !Number.isInteger(col) ||
    row < 0 ||
    row >= BOARD_SIZE ||
    col < 0 ||
    col >= BOARD_SIZE
  ) {
    throw new RangeError(`Row/col out of bounds: (${row}, ${col})`)
  }
  return row * BOARD_SIZE + col
}

/** Immutable place: returns a new board array. */
export function placeMark(board: readonly Cell[], index: number, player: Player): Cell[] {
  if (!isValidIndex(index)) {
    throw new RangeError(`Cell index out of bounds: ${index}`)
  }
  const next = board.slice()
  next[index] = player
  return next
}

export function getEmptyIndices(board: readonly Cell[]): number[] {
  const indices: number[] = []
  for (let i = 0; i < board.length; i++) {
    if (board[i] === null) indices.push(i)
  }
  return indices
}

export function oppositePlayer(player: Player): Player {
  return player === 'X' ? 'O' : 'X'
}
