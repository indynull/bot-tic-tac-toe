/** Core domain types for tic-tac-toe. Board is row-major: index = row * boardSize + col. */

export type Player = 'X' | 'O'
export type Cell = Player | null
export type GameStatus = 'in_progress' | 'won' | 'draw'
export type GameMode = 'local_pvp' | 'vs_ai'
export type Difficulty = 'easy' | 'medium' | 'hard' | 'impossible'
export type Theme = 'light' | 'dark'

/** Square board dimension (3 = classic 3×3). Escalates after draws up to mini-gomoku sizes. */
export type BoardSize = 3 | 4 | 5 | 6 | 7 | 8 | 9

export const MIN_BOARD_SIZE: BoardSize = 3
/** Ladder ceiling: 9×9 with 5-in-a-row (small gomoku); further gomoku identity is a later pass. */
export const MAX_BOARD_SIZE: BoardSize = 9
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
  /** N for an N×N board this game (3–9). */
  boardSize: BoardSize
  /** Marks in a row needed to win (see `winLengthForBoard`). */
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
   * Size for the *next* new/empty game (tracks current ladder; grows with in-place expansion).
   * Persisted as progression.boardSize.
   */
  ladderSize: BoardSize
  /**
   * True for one announcement cycle after an in-place board growth.
   * Cleared on the next move, undo, or new game.
   */
  justGrew: boolean
  /** Board size before the most recent in-place growth (status copy); null if never grew this session. */
  previousBoardSize: BoardSize | null
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
 * Win length for an N×N board. Full-line wins on large N are nearly unwinnable,
 * so we use 4-in-a-row on 4×4/5×5 and lock **5-in-a-row** from 6×6 upward
 * (gomoku-style k on the growing ladder; branding pass comes later).
 */
export function winLengthForBoard(boardSize: BoardSize): number {
  if (boardSize <= 3) return 3
  if (boardSize <= 5) return 4
  return 5
}

/**
 * After every draw that grows the ladder, bump difficulty one step (if not already max).
 * Keeps pressure on as boards get larger and search becomes shallower.
 */
export function shouldEscalateDifficulty(_fromBoardSize: BoardSize): boolean {
  return true
}

/** Short win-rule label, e.g. "3 in a row" / "4 in a row". */
export function winRuleLabel(boardSize: BoardSize): string {
  const k = winLengthForBoard(boardSize)
  return `${k} in a row`
}

/** Human-readable AI policy note by board size (settings / status). */
export function aiPolicyNote(boardSize: BoardSize, difficulty: Difficulty): string {
  if (boardSize <= 3) {
    if (difficulty === 'impossible') return 'Optimal minimax + opening book on 3×3'
    if (difficulty === 'hard') return 'Optimal minimax on 3×3'
    if (difficulty === 'medium') return 'Tactical (wins/blocks/forks)'
    return 'Mostly random with occasional tactics'
  }
  if (difficulty === 'impossible') {
    return `Deep minimax on ${boardSize}×${boardSize} (≤200ms budget; not proven optimal)`
  }
  if (difficulty === 'hard') {
    return `Tactical play on ${boardSize}×${boardSize} (wins/blocks/forks; sub-second)`
  }
  return `Tactical play on ${boardSize}×${boardSize} (sub-second; not optimal search)`
}

export const DEFAULT_SETTINGS: Settings = {
  firstPlayer: 'X',
  /**
   * Agrajag pass: human plays O so the computer opens as X on impossible.
   * (Other passes already set vs_ai/impossible; this removes the human first-move edge.)
   */
  humanPlayer: 'O',
  /** Fresh installs land in vs computer so the challenge is immediate. */
  mode: 'vs_ai',
  difficulty: 'impossible',
  theme: 'light',
  soundEnabled: false,
}

export const STORAGE_KEY = 'ttt-v1'
/** v3: progression is ladder boardSize only (next new game size). */
export const STORAGE_VERSION = 3

export interface ProgressionState {
  /** Size for the next new game (advances after draws; reset scores → 3). */
  boardSize: BoardSize
}

export const DEFAULT_PROGRESSION: ProgressionState = {
  boardSize: DEFAULT_BOARD_SIZE,
}

export interface PersistedData {
  version: number
  scores: Scores
  settings: Settings
  /** Ladder size for the next empty game. */
  progression?: ProgressionState
}
