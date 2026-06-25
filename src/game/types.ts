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
   * True only when a real draw was recorded at max board size (no further growth).
   * Kept for status copy / persistence compatibility; in-place growth clears it.
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

/**
 * Win length for an N×N board. Full-line wins on 6×6/7×7 are nearly unwinnable,
 * so we cap at 5-in-a-row and use 4-in-a-row on 4×4/5×5 for a playable ladder.
 */
export function winLengthForBoard(boardSize: BoardSize): number {
  if (boardSize <= 3) return 3
  if (boardSize <= 5) return 4
  return 5
}

/** Whether escalating difficulty is meaningful (shallow search on huge boards). */
export function shouldEscalateDifficulty(boardSize: BoardSize): boolean {
  return boardSize <= 4
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
/** Bumped when persisted progression fields were added. */
export const STORAGE_VERSION = 2

export interface ProgressionState {
  boardSize: BoardSize
  pendingEscalation: boolean
}

export const DEFAULT_PROGRESSION: ProgressionState = {
  boardSize: DEFAULT_BOARD_SIZE,
  pendingEscalation: false,
}

export interface PersistedData {
  version: number
  scores: Scores
  settings: Settings
  /** Draw-escalation ladder (board size + pending flag). */
  progression?: ProgressionState
}
