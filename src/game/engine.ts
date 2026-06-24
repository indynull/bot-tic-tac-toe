import { createEmptyBoard, evaluateBoard, getLegalMoves as boardLegalMoves, isValidIndex, opponent, setCell } from './board'
import type {
  ApplyMoveResult,
  GameState,
  Move,
  Player,
  Scores,
  Settings,
} from './types'
import { DEFAULT_SCORES, DEFAULT_SETTINGS } from './types'

export interface CreateGameOptions {
  settings?: Partial<Settings>
  scores?: Scores
}

export interface ResetGameOptions {
  preserveScores?: boolean
  preserveSettings?: boolean
  settings?: Partial<Settings>
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
  return {
    board: createEmptyBoard(),
    currentPlayer: settings.firstPlayer,
    status: 'in_progress',
    winner: null,
    winningLine: null,
    moveHistory: [],
    scores,
    settings,
  }
}

export function applyMove(state: GameState, cellIndex: number): ApplyMoveResult {
  if (state.status !== 'in_progress') {
    return { ok: false, reason: 'game_over' }
  }
  if (!isValidIndex(cellIndex)) {
    return { ok: false, reason: 'invalid_index' }
  }
  if (state.board[cellIndex] !== null) {
    return { ok: false, reason: 'cell_occupied' }
  }

  const player = state.currentPlayer
  const board = setCell(state.board, cellIndex, player)
  const outcome = evaluateBoard(board)
  const move: Move = { cellIndex, player }
  const moveHistory = [...state.moveHistory, move]

  let scores = state.scores
  if (outcome.status === 'won' || outcome.status === 'draw') {
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
    },
  }
}

export function resetGame(state: GameState, options: ResetGameOptions = {}): GameState {
  const preserveScores = options.preserveScores !== false
  const preserveSettings = options.preserveSettings !== false
  const settings = preserveSettings
    ? { ...state.settings, ...options.settings }
    : mergeSettings(options.settings)
  return createGame({
    settings,
    scores: preserveScores ? cloneScores(state.scores) : { ...DEFAULT_SCORES },
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
  const board = createEmptyBoard()
  let currentPlayer = state.settings.firstPlayer

  for (const move of history) {
    board[move.cellIndex] = move.player
    currentPlayer = opponent(move.player)
  }

  const outcome = evaluateBoard(board)

  let scores = cloneScores(state.scores)
  if (state.status === 'won' && state.winner) {
    scores[state.winner] = Math.max(0, scores[state.winner] - 1)
  } else if (state.status === 'draw') {
    scores.draws = Math.max(0, scores.draws - 1)
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
  return boardLegalMoves(state.board)
}

export function isAiTurn(state: GameState): boolean {
  if (state.settings.mode !== 'vs_ai') return false
  if (state.status !== 'in_progress') return false
  return state.currentPlayer !== state.settings.humanPlayer
}

export function getAiPlayer(state: GameState): Player {
  return opponent(state.settings.humanPlayer)
}
