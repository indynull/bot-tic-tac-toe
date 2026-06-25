import type { BoardSize, Cell, Player } from './types'
import { DEFAULT_BOARD_SIZE, WIN_LINES } from './types'

/** @deprecated Prefer boardSize² from game state; kept for 3×3 compatibility. */
export const BOARD_SIZE = 9
export const ROWS = 3
export const COLS = 3

export function cellCount(boardSize: BoardSize): number {
  return boardSize * boardSize
}

export function createEmptyBoard(boardSize: BoardSize = DEFAULT_BOARD_SIZE): Cell[] {
  return Array.from({ length: cellCount(boardSize) }, () => null)
}

export function indexToRowCol(index: number, boardSize: BoardSize = DEFAULT_BOARD_SIZE): { row: number; col: number } {
  return { row: Math.floor(index / boardSize), col: index % boardSize }
}

export function rowColToIndex(row: number, col: number, boardSize: BoardSize = DEFAULT_BOARD_SIZE): number {
  return row * boardSize + col
}

export function isValidIndex(index: number, boardSize: BoardSize = DEFAULT_BOARD_SIZE): boolean {
  return Number.isInteger(index) && index >= 0 && index < cellCount(boardSize)
}

export function isInBounds(row: number, col: number, boardSize: BoardSize = DEFAULT_BOARD_SIZE): boolean {
  return (
    Number.isInteger(row) &&
    Number.isInteger(col) &&
    row >= 0 &&
    row < boardSize &&
    col >= 0 &&
    col < boardSize
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

const DIRS: readonly [number, number][] = [
  [0, 1], // horizontal
  [1, 0], // vertical
  [1, 1], // diagonal ↘
  [1, -1], // diagonal ↙
]

/**
 * Find winLength consecutive marks starting at (row,col) in direction (dr,dc).
 * Only scans from cells that could be the start of a line (avoids double-count).
 */
function lineFrom(
  board: Cell[],
  boardSize: BoardSize,
  winLength: number,
  row: number,
  col: number,
  dr: number,
  dc: number,
): number[] | null {
  const start = rowColToIndex(row, col, boardSize)
  const player = board[start]
  if (player === null) return null

  const line: number[] = [start]
  let r = row + dr
  let c = col + dc
  while (line.length < winLength && isInBounds(r, c, boardSize)) {
    const idx = rowColToIndex(r, c, boardSize)
    if (board[idx] !== player) return null
    line.push(idx)
    r += dr
    c += dc
  }
  return line.length === winLength ? line : null
}

/** Evaluate board after a move; win checked before draw. Supports N×N with K-in-a-row. */
export function evaluateBoard(
  board: Cell[],
  boardSize: BoardSize = DEFAULT_BOARD_SIZE,
  winLength?: number,
): Outcome {
  const k = winLength ?? boardSize

  // Fast path: classic 3×3 uses precomputed lines
  if (boardSize === 3 && k === 3 && board.length === 9) {
    for (const line of WIN_LINES) {
      const [a, b, c] = line
      const v = board[a]
      if (v !== null && v === board[b] && v === board[c]) {
        return { status: 'won', winner: v, winningLine: [...line] }
      }
    }
  } else {
    for (let row = 0; row < boardSize; row++) {
      for (let col = 0; col < boardSize; col++) {
        for (const [dr, dc] of DIRS) {
          // Only start lines where the full segment fits
          const endR = row + dr * (k - 1)
          const endC = col + dc * (k - 1)
          if (!isInBounds(endR, endC, boardSize)) continue
          const line = lineFrom(board, boardSize, k, row, col, dr, dc)
          if (line) {
            return { status: 'won', winner: board[line[0]]!, winningLine: line }
          }
        }
      }
    }
  }

  if (board.every((cell) => cell !== null)) {
    return { status: 'draw', winner: null, winningLine: null }
  }
  return { status: 'in_progress', winner: null, winningLine: null }
}
