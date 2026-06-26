import type { BoardSize, Cell, Player } from './types'
import { DEFAULT_BOARD_SIZE, MAX_BOARD_SIZE, WIN_LINES, winLengthForBoard } from './types'

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

/**
 * Embed an N×N board into an M×M board (M ≥ N) at (rowOffset, colOffset).
 * Default offsets (0,0) place marks in the top-left; new ring cells are empty.
 */
export function embedBoard(
  board: Cell[],
  fromSize: BoardSize,
  toSize: BoardSize,
  rowOffset = 0,
  colOffset = 0,
): Cell[] {
  if (toSize < fromSize) {
    throw new Error(`Cannot embed ${fromSize}×${fromSize} into smaller ${toSize}×${toSize}`)
  }
  const maxOff = toSize - fromSize
  if (rowOffset < 0 || colOffset < 0 || rowOffset > maxOff || colOffset > maxOff) {
    throw new Error(`Embed offset (${rowOffset},${colOffset}) out of range for ${fromSize}→${toSize}`)
  }
  if (toSize === fromSize) return board.slice()
  const next = createEmptyBoard(toSize)
  for (let row = 0; row < fromSize; row++) {
    for (let col = 0; col < fromSize; col++) {
      const src = rowColToIndex(row, col, fromSize)
      const dst = rowColToIndex(row + rowOffset, col + colOffset, toSize)
      next[dst] = board[src]!
    }
  }
  return next
}

/** Remap a cell index from one board size to another under the given embed offset. */
export function remapIndex(
  index: number,
  fromSize: BoardSize,
  toSize: BoardSize,
  rowOffset = 0,
  colOffset = 0,
): number {
  if (fromSize === toSize) return index
  const { row, col } = indexToRowCol(index, fromSize)
  return rowColToIndex(row + rowOffset, col + colOffset, toSize)
}

/** True if `player` has at least one legal move that wins immediately. */
export function hasImmediateWin(
  board: Cell[],
  boardSize: BoardSize,
  winLength: number,
  player: Player,
): boolean {
  for (const idx of getEmptyCells(board)) {
    const after = setCell(board, idx, player)
    if (evaluateBoard(after, boardSize, winLength).winner === player) return true
  }
  return false
}

const SEGMENT_DIRS: readonly [number, number][] = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
]

/**
 * True if `player` still has at least one winLength segment containing only their
 * marks and empties (with ≥1 empty). Opponent marks in a segment kill it forever.
 * Used to avoid "dead" growth where 5-in-a-row is already impossible for everyone.
 */
export function hasOpenWinningLine(
  board: Cell[],
  boardSize: BoardSize,
  winLength: number,
  player: Player,
): boolean {
  const opp = player === 'X' ? 'O' : 'X'
  for (let row = 0; row < boardSize; row++) {
    for (let col = 0; col < boardSize; col++) {
      for (const [dr, dc] of SEGMENT_DIRS) {
        const endR = row + dr * (winLength - 1)
        const endC = col + dc * (winLength - 1)
        if (endR < 0 || endC < 0 || endR >= boardSize || endC >= boardSize) continue
        let empty = 0
        let blocked = false
        let r = row
        let c = col
        for (let i = 0; i < winLength; i++) {
          const cell = board[r * boardSize + c]
          if (cell === opp) {
            blocked = true
            break
          }
          if (cell === null) empty++
          r += dr
          c += dc
        }
        if (!blocked && empty > 0) return true
      }
    }
  }
  return false
}

/** At least one side can still theoretically complete a winLength line. */
export function positionHasWinningPotential(
  board: Cell[],
  boardSize: BoardSize,
  winLength: number,
): boolean {
  return (
    hasOpenWinningLine(board, boardSize, winLength, 'X') ||
    hasOpenWinningLine(board, boardSize, winLength, 'O')
  )
}

export interface GrowPlan {
  boardSize: BoardSize
  winLength: number
  board: Cell[]
  grew: boolean
  /** Embed offset of the old block inside the new board (0,0 = top-left). */
  rowOffset: number
  colOffset: number
}

function noGrowthPlan(board: Cell[], boardSize: BoardSize): GrowPlan {
  return {
    boardSize,
    winLength: winLengthForBoard(boardSize),
    board: board.slice(),
    grew: false,
    rowOffset: 0,
    colOffset: 0,
  }
}

function isSafeLiveGrowth(
  grown: Cell[],
  candidate: BoardSize,
  winLength: number,
  nextPlayer: Player,
): boolean {
  const outcome = evaluateBoard(grown, candidate, winLength)
  if (outcome.status === 'won') return false
  // No free win on the first move after growth.
  if (hasImmediateWin(grown, candidate, winLength, nextPlayer)) return false
  // Must still be possible for someone to get k-in-a-row (avoid dead 6×6 etc.).
  if (!positionHasWinningPotential(grown, candidate, winLength)) return false
  return true
}

/**
 * Plan in-place growth so play can continue after a would-be draw.
 * Prefers the smallest larger size, then top-left embed, then other offsets.
 * Rejects placements that:
 *   - are already a completed win,
 *   - give `nextPlayer` an immediate winning move, or
 *   - leave **no** open winLength line for either player (dead position — grow further).
 * If no safe live placement exists up to max size, returns grew=false (scored draw).
 */
export function planBoardGrowth(
  board: Cell[],
  boardSize: BoardSize,
  nextPlayer: Player,
): GrowPlan {
  if (boardSize >= MAX_BOARD_SIZE) {
    return noGrowthPlan(board, boardSize)
  }

  for (let size = boardSize + 1; size <= MAX_BOARD_SIZE; size++) {
    const candidate = size as BoardSize
    const winLength = winLengthForBoard(candidate)
    const maxOff = size - boardSize
    for (let rowOffset = 0; rowOffset <= maxOff; rowOffset++) {
      for (let colOffset = 0; colOffset <= maxOff; colOffset++) {
        const grown = embedBoard(board, boardSize, candidate, rowOffset, colOffset)
        if (!isSafeLiveGrowth(grown, candidate, winLength, nextPlayer)) continue
        return {
          boardSize: candidate,
          winLength,
          board: grown,
          grew: true,
          rowOffset,
          colOffset,
        }
      }
    }
  }

  return noGrowthPlan(board, boardSize)
}
