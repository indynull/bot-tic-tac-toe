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
  /** N for an N×N board this game (3–7). */
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
   * Board size for the *next* new game. Advances after a draw (up to max);
   * wins keep the current size. Persisted as progression.boardSize.
   */
  ladderSize: BoardSize
  /**
   * True when this game ended in a draw that advanced the ladder.
   * Cleared on new game / undo. Used for status copy and a11y.
   */
  ladderAdvanced: boolean
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
  if (boardSize === 4) {
    if (difficulty === 'impossible') return 'Deep shallow search on 4×4 (depth 5; not full-tree optimal)'
    if (difficulty === 'hard') return 'Shallow search on 4×4 (depth 4; not full-tree optimal)'
    return 'Tactical play on 4×4'
  }
  if (boardSize <= 6) {
    if (difficulty === 'hard' || difficulty === 'impossible') {
      return `Limited minimax on ${boardSize}×${boardSize} (tactical fallback only on 7×7)`
    }
    return `Tactical play on ${boardSize}×${boardSize}`
  }
  return 'Tactical play on 7×7 (fast; not optimal search)'
}

export const DEFAULT_SETTINGS: Settings = {
  firstPlayer: 'X',
  /** Human plays X; AI is O and moves second — still brutal at impossible. */
  humanPlayer: 'X',
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
