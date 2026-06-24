/** Cell contents: empty or a player mark. */
export type Cell = null | 'X' | 'O'

/** Active player mark. */
export type Player = 'X' | 'O'

/** Overall game status after evaluation. */
export type GameStatus = 'in_progress' | 'won' | 'draw'

/** Play mode: two humans or human vs computer. */
export type GameMode = 'local_pvp' | 'vs_ai'

/** AI strength for vs_ai mode. */
export type Difficulty = 'easy' | 'medium' | 'hard'

/** Visual theme preference. */
export type Theme = 'light' | 'dark'

/** Single placed mark in history. */
export interface Move {
  cellIndex: number
  player: Player
}

/** Session score counters. */
export interface Scores {
  X: number
  O: number
  draws: number
}

/** User-configurable preferences. */
export interface Settings {
  /** Who places the first mark of a new game. */
  firstPlayer: Player
  mode: GameMode
  difficulty: Difficulty
  theme: Theme
  soundEnabled: boolean
  /** Human's mark when mode is vs_ai; AI takes the other. */
  humanPlayer: Player
}

/** Full session + board state for the pure engine. */
export interface GameState {
  /** Fixed-length 9-cell board (row-major: 0..2 row0, 3..5 row1, 6..8 row2). */
  board: Cell[]
  currentPlayer: Player
  status: GameStatus
  winner: Player | null
  winningLine: number[] | null
  moveHistory: Move[]
  scores: Scores
  settings: Settings
}

/** Successful applyMove result. */
export interface MoveSuccess {
  ok: true
  state: GameState
}

/** Failed applyMove result with reason code. */
export interface MoveFailure {
  ok: false
  reason: 'game_over' | 'cell_occupied' | 'out_of_bounds' | 'wrong_turn'
}

export type MoveResult = MoveSuccess | MoveFailure

export type CreateGameOptions = Partial<Settings> & {
  scores?: Scores
}

export type ResetGameOptions = {
  preserveScores?: boolean
  preserveSettings?: boolean
  scores?: Scores
  settings?: Partial<Settings>
}
