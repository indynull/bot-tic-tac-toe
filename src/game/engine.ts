import { createEmptyBoard, evaluateBoard, getEmptyCells, isValidIndex, opponent, setCell } from './board'
import type {
  ApplyMoveResult,
  BoardSize,
  GameState,
  Move,
  Player,
  Scores,
  Settings,
} from './types'
import {
  DEFAULT_BOARD_SIZE,
  DEFAULT_SCORES,
  DEFAULT_SETTINGS,
  DIFFICULTY_ORDER,
  MAX_BOARD_SIZE,
  nextBoardSize,
  nextDifficulty,
  shouldEscalateDifficulty,
  winLengthForBoard,
  type Difficulty,
} from './types'

function previousDifficulty(current: Difficulty): Difficulty {
  const idx = DIFFICULTY_ORDER.indexOf(current)
  if (idx <= 0) return DIFFICULTY_ORDER[0]!
  return DIFFICULTY_ORDER[idx - 1]!
}

export interface CreateGameOptions {
  settings?: Partial<Settings>
  scores?: Scores
  /** Size of this game's board (and default ladder if ladderSize omitted). */
  boardSize?: BoardSize
  /** Override ladder size for the following new game. */
  ladderSize?: BoardSize
}

export interface ResetGameOptions {
  preserveScores?: boolean
  preserveSettings?: boolean
  settings?: Partial<Settings>
  /** Force a specific board size for the new empty game. */
  boardSize?: BoardSize
  /** Reset ladder back to classic 3×3 (e.g. reset scores / user opt-out). */
  resetProgression?: boolean
}

function mergeSettings(partial?: Partial<Settings>): Settings {
  return { ...DEFAULT_SETTINGS, ...partial }
}

function cloneScores(scores: Scores): Scores {
  return { X: scores.X, O: scores.O, draws: scores.draws }
}

function applyOutcomeScores(scores: Scores, status: GameState['status'], winner: Player | null): Scores {
  const next = cloneScores(scores)
  if (status === 'won' && winner) {
    next[winner] += 1
  } else if (status === 'draw') {
    next.draws += 1
  }
  return next
}

export function createGame(options: CreateGameOptions = {}): GameState {
  const settings = mergeSettings(options.settings)
  const scores = options.scores ? cloneScores(options.scores) : { ...DEFAULT_SCORES }
  const boardSize = options.boardSize ?? DEFAULT_BOARD_SIZE
  const ladderSize = options.ladderSize ?? boardSize
  return {
    boardSize,
    winLength: winLengthForBoard(boardSize),
    board: createEmptyBoard(boardSize),
    currentPlayer: settings.firstPlayer,
    status: 'in_progress',
    winner: null,
    winningLine: null,
    moveHistory: [],
    scores,
    settings,
    ladderSize,
    ladderAdvanced: false,
  }
}

/**
 * After a full-board draw: advance ladder for the next empty game (if room),
 * optionally bump vs-AI difficulty when leaving 3×3.
 */
function applyDrawLadder(state: GameState): Pick<GameState, 'ladderSize' | 'ladderAdvanced' | 'settings'> {
  if (state.boardSize >= MAX_BOARD_SIZE) {
    return {
      ladderSize: state.boardSize,
      ladderAdvanced: false,
      settings: state.settings,
    }
  }
  const ladderSize = nextBoardSize(state.boardSize)
  let settings = state.settings
  if (settings.mode === 'vs_ai' && shouldEscalateDifficulty(state.boardSize)) {
    settings = { ...settings, difficulty: nextDifficulty(settings.difficulty) }
  }
  return { ladderSize, ladderAdvanced: true, settings }
}

export function applyMove(state: GameState, cellIndex: number): ApplyMoveResult {
  if (state.status !== 'in_progress') {
    return { ok: false, reason: 'game_over' }
  }
  if (!isValidIndex(cellIndex, state.boardSize)) {
    return { ok: false, reason: 'invalid_index' }
  }
  if (state.board[cellIndex] !== null) {
    return { ok: false, reason: 'cell_occupied' }
  }

  const player = state.currentPlayer
  const board = setCell(state.board, cellIndex, player)
  const outcome = evaluateBoard(board, state.boardSize, state.winLength)
  const move: Move = { cellIndex, player }
  const moveHistory = [...state.moveHistory, move]

  if (outcome.status === 'draw') {
    const scores = applyOutcomeScores(state.scores, 'draw', null)
    const ladder = applyDrawLadder(state)
    return {
      ok: true,
      state: {
        ...state,
        board,
        currentPlayer: player,
        status: 'draw',
        winner: null,
        winningLine: null,
        moveHistory,
        scores,
        ...ladder,
      },
    }
  }

  let scores = state.scores
  if (outcome.status === 'won') {
    scores = applyOutcomeScores(state.scores, outcome.status, outcome.winner)
  }

  return {
    ok: true,
    state: {
      ...state,
      board,
      currentPlayer: outcome.status === 'in_progress' ? opponent(player) : player,
      status: outcome.status,
      winner: outcome.winner,
      winningLine: outcome.winningLine,
      moveHistory,
      scores,
      // Wins keep playing at this size; ladder mirrors current board unless a prior draw advanced it
      ladderSize: outcome.status === 'won' ? state.boardSize : state.ladderSize,
      ladderAdvanced: false,
    },
  }
}

/**
 * Resolve board size + settings for a new (empty) game.
 * Uses ladderSize (advanced after draws) unless reset or overridden.
 */
export function resolveEscalation(
  state: GameState,
  options: ResetGameOptions = {},
): { boardSize: BoardSize; settings: Settings } {
  const preserveSettings = options.preserveSettings !== false
  const settings = preserveSettings
    ? { ...state.settings, ...options.settings }
    : mergeSettings(options.settings)

  if (options.resetProgression) {
    return { boardSize: DEFAULT_BOARD_SIZE, settings }
  }

  if (options.boardSize !== undefined) {
    return { boardSize: options.boardSize, settings }
  }

  return { boardSize: state.ladderSize, settings }
}

export function resetGame(state: GameState, options: ResetGameOptions = {}): GameState {
  const preserveScores = options.preserveScores !== false
  const { boardSize, settings } = resolveEscalation(state, options)
  return createGame({
    settings,
    scores: preserveScores ? cloneScores(state.scores) : { ...DEFAULT_SCORES },
    boardSize,
    ladderSize: options.resetProgression ? DEFAULT_BOARD_SIZE : boardSize,
  })
}

export function resetScores(state: GameState): GameState {
  return {
    ...state,
    scores: { ...DEFAULT_SCORES },
  }
}

export function updateSettings(state: GameState, partial: Partial<Settings>): GameState {
  return {
    ...state,
    settings: { ...state.settings, ...partial },
  }
}

/** Undo one move. In vs_ai, callers should typically undo twice (human+AI pair). */
export function undoMove(state: GameState): GameState {
  if (state.moveHistory.length === 0) return state

  const history = state.moveHistory.slice(0, -1)
  const board = createEmptyBoard(state.boardSize)
  let currentPlayer = state.settings.firstPlayer

  for (const move of history) {
    board[move.cellIndex] = move.player
    currentPlayer = opponent(move.player)
  }

  const outcome = evaluateBoard(board, state.boardSize, state.winLength)

  let scores = cloneScores(state.scores)
  if (state.status === 'won' && state.winner) {
    scores[state.winner] = Math.max(0, scores[state.winner] - 1)
  } else if (state.status === 'draw') {
    scores.draws = Math.max(0, scores.draws - 1)
  }

  // Revert ladder / tier if undoing the drawing move that advanced them
  let ladderSize = state.ladderSize
  let settings = state.settings
  if (state.status === 'draw' && state.ladderAdvanced) {
    ladderSize = state.boardSize
    if (settings.mode === 'vs_ai' && shouldEscalateDifficulty(state.boardSize)) {
      settings = { ...settings, difficulty: previousDifficulty(settings.difficulty) }
    }
  }

  return {
    ...state,
    board,
    currentPlayer: outcome.status === 'in_progress' ? currentPlayer : state.currentPlayer,
    status: outcome.status,
    winner: outcome.winner,
    winningLine: outcome.winningLine,
    moveHistory: history,
    scores,
    ladderSize,
    ladderAdvanced: false,
    settings,
  }
}

/**
 * Undo appropriate step(s): in vs_ai, remove last human+AI pair when possible;
 * in PvP, remove one move.
 */
export function undoLastTurn(state: GameState): GameState {
  if (state.moveHistory.length === 0) return state

  if (state.settings.mode === 'vs_ai') {
    let next = undoMove(state)
    if (state.moveHistory.length >= 2) {
      next = undoMove(next)
    }
    return next
  }

  return undoMove(state)
}

export function getLegalMoves(state: GameState): number[] {
  if (state.status !== 'in_progress') return []
  return getEmptyCells(state.board)
}

export function isAiTurn(state: GameState): boolean {
  if (state.settings.mode !== 'vs_ai') return false
  if (state.status !== 'in_progress') return false
  return state.currentPlayer !== state.settings.humanPlayer
}

export function getAiPlayer(state: GameState): Player {
  return opponent(state.settings.humanPlayer)
}
