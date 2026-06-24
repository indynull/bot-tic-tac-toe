/** Core domain types for tic-tac-toe. Board is a fixed-length array of 9 cells (row-major: index = row * 3 + col). */

export type Player = 'X' | 'O'
export type Cell = Player | null
export type GameStatus = 'in_progress' | 'won' | 'draw'
export type GameMode = 'local_pvp' | 'vs_ai'
export type Difficulty = 'easy' | 'medium' | 'hard'
export type Theme = 'light' | 'dark'

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
  board: Cell[]
  currentPlayer: Player
  status: GameStatus
  winner: Player | null
  winningLine: number[] | null
  moveHistory: Move[]
  scores: Scores
  settings: Settings
}

export type MoveErrorReason =
  | 'game_over'
  | 'cell_occupied'
  | 'invalid_index'
  | 'wrong_turn'

export type ApplyMoveResult =
  | { ok: true; state: GameState }
  | { ok: false; reason: MoveErrorReason }

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
