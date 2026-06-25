/** Core domain types for tic-tac-toe. Board is row-major: index = row * boardSize + col. */

export type Player = 'X' | 'O'
export type Cell = Player | null
export type GameStatus = 'in_progress' | 'won' | 'draw'
export type GameMode = 'local_pvp' | 'vs_ai'
export type Difficulty = 'easy' | 'medium' | 'hard' | 'impossible'
export type Theme = 'light' | 'dark'

/** Square board dimension (3 = classic 3×3). Escalates after draws. */
export type BoardSize = 3 | 4 | 5 | 6 | 7

export const MIN_BOARD_SIZE: BoardSize = 3
export const MAX_BOARD_SIZE: BoardSize = 7
export const DEFAULT_BOARD_SIZE: BoardSize = 3

export const DIFFICULTY_ORDER: readonly Difficulty[] = ['easy', 'medium', 'hard', 'impossible'] as const

export interface Scores {
  X: number
  O: number
  draws: number
}

export interface Settings {
  firstPlayer: Player
  /** Which side the human plays in vs_ai mode. */
  humanPlayer: Player
  mode: GameMode
  difficulty: Difficulty
  theme: Theme
  soundEnabled: boolean
}

export interface Move {
  cellIndex: number
  player: Player
}

export interface GameState {
  /** N for an N×N board (3–7). */
  boardSize: BoardSize
  /** Marks in a row needed to win (equals boardSize). */
  winLength: number
  board: Cell[]
  currentPlayer: Player
  status: GameStatus
  winner: Player | null
  winningLine: number[] | null
  moveHistory: Move[]
  scores: Scores
  settings: Settings
  /**
   * After a draw, the next new game escalates board size + difficulty.
   * Cleared when a new game starts (escalated or not).
   */
  pendingEscalation: boolean
}

export type MoveErrorReason =
  | 'game_over'
  | 'cell_occupied'
  | 'invalid_index'
  | 'wrong_turn'

export type ApplyMoveResult =
  | { ok: true; state: GameState }
  | { ok: false; reason: MoveErrorReason }

/** Classic 3×3 win lines (kept for tests / 3×3 helpers). */
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

export const DEFAULT_SCORES: Scores = { X: 0, O: 0, draws: 0 }

export function clampBoardSize(n: number): BoardSize {
  const clamped = Math.max(MIN_BOARD_SIZE, Math.min(MAX_BOARD_SIZE, Math.floor(n)))
  return clamped as BoardSize
}

export function nextDifficulty(current: Difficulty): Difficulty {
  const idx = DIFFICULTY_ORDER.indexOf(current)
  if (idx < 0 || idx >= DIFFICULTY_ORDER.length - 1) return 'impossible'
  return DIFFICULTY_ORDER[idx + 1]!
}

export function nextBoardSize(current: BoardSize): BoardSize {
  return clampBoardSize(current + 1)
}

export const DEFAULT_SETTINGS: Settings = {
  firstPlayer: 'X',
  humanPlayer: 'X',
  mode: 'local_pvp',
  difficulty: 'medium',
  theme: 'light',
  soundEnabled: false,
}

export const STORAGE_KEY = 'ttt-v1'
export const STORAGE_VERSION = 1

export interface PersistedData {
  version: number
  scores: Scores
  settings: Settings
}
