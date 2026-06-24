import { createEmptyBoard, getEmptyIndices, isValidIndex, oppositePlayer, placeMark } from './board'
import { evaluateBoard } from './evaluate'
import type {
  CreateGameOptions,
  GameState,
  GameStatus,
  MoveResult,
  Player,
  ResetGameOptions,
  Scores,
  Settings,
} from './types'

export const DEFAULT_SETTINGS: Settings = {
  firstPlayer: 'X',
  mode: 'local_pvp',
  difficulty: 'medium',
  theme: 'light',
  soundEnabled: false,
  humanPlayer: 'X',
}

export const DEFAULT_SCORES: Scores = {
  X: 0,
  O: 0,
  draws: 0,
}

function mergeSettings(partial?: Partial<Settings>): Settings {
  return { ...DEFAULT_SETTINGS, ...partial }
}

function cloneScores(scores: Scores): Scores {
  return { X: scores.X, O: scores.O, draws: scores.draws }
}

function withTerminalScores(state: GameState): GameState {
  if (state.status === 'won' && state.winner) {
    const scores = cloneScores(state.scores)
    scores[state.winner] += 1
    return { ...state, scores }
  }
  if (state.status === 'draw') {
    const scores = cloneScores(state.scores)
    scores.draws += 1
    return { ...state, scores }
  }
  return state
}

/** Create a fresh game session. */
export function createGame(options: CreateGameOptions = {}): GameState {
  const { scores, ...settingsPartial } = options
  const settings = mergeSettings(settingsPartial)
  const firstPlayer = settings.firstPlayer

  return {
    board: createEmptyBoard(),
    currentPlayer: firstPlayer,
    status: 'in_progress',
    winner: null,
    winningLine: null,
    moveHistory: [],
    scores: scores ? cloneScores(scores) : { ...DEFAULT_SCORES },
    settings,
  }
}

/** Apply a mark at cellIndex for the current player. Returns structured success/failure. */
export function applyMove(state: GameState, cellIndex: number): MoveResult {
  if (state.status !== 'in_progress') {
    return { ok: false, reason: 'game_over' }
  }

  if (!isValidIndex(cellIndex)) {
    return { ok: false, reason: 'out_of_bounds' }
  }

  if (state.board[cellIndex] !== null) {
    return { ok: false, reason: 'cell_occupied' }
  }

  const player = state.currentPlayer
  const board = placeMark(state.board, cellIndex, player)
  const evaluation = evaluateBoard(board)

  let next: GameState = {
    ...state,
    board,
    currentPlayer: evaluation.status === 'in_progress' ? oppositePlayer(player) : player,
    status: evaluation.status,
    winner: evaluation.winner,
    winningLine: evaluation.winningLine,
    moveHistory: [...state.moveHistory, { cellIndex, player }],
  }

  next = withTerminalScores(next)
  return { ok: true, state: next }
}

/** Reset board and turn; optionally preserve scores/settings. */
export function resetGame(state: GameState, options: ResetGameOptions = {}): GameState {
  const preserveScores = options.preserveScores !== false
  const preserveSettings = options.preserveSettings !== false

  const settings = preserveSettings
    ? { ...state.settings, ...options.settings }
    : mergeSettings(options.settings)

  const scores = options.scores
    ? cloneScores(options.scores)
    : preserveScores
      ? cloneScores(state.scores)
      : { ...DEFAULT_SCORES }

  return createGame({ ...settings, scores })
}

/** Zero X / O / draws while keeping board and settings. */
export function resetScores(state: GameState): GameState {
  return {
    ...state,
    scores: { ...DEFAULT_SCORES },
  }
}

/** Pop one move from history and recompute state from remaining moves. */
export function undoMove(state: GameState): GameState {
  if (state.moveHistory.length === 0) {
    return state
  }

  const history = state.moveHistory.slice(0, -1)
  let rebuilt = createGame({
    ...state.settings,
    scores: cloneScores(state.scores),
  })

  // Revert any score increments from the undone terminal position.
  // We rebuild without scoring, then re-apply terminal scoring only if the new position is terminal.
  rebuilt = {
    ...rebuilt,
    scores: cloneScores(state.scores),
  }

  // If previous state was terminal, subtract the point that was awarded.
  let scores = cloneScores(state.scores)
  if (state.status === 'won' && state.winner) {
    scores[state.winner] = Math.max(0, scores[state.winner] - 1)
  } else if (state.status === 'draw') {
    scores.draws = Math.max(0, scores.draws - 1)
  }

  let board = createEmptyBoard()
  let currentPlayer: Player = state.settings.firstPlayer
  let status: GameStatus = 'in_progress'
  let winner: Player | null = null
  let winningLine: number[] | null = null

  for (const move of history) {
    board = placeMark(board, move.cellIndex, move.player)
    const evaluation = evaluateBoard(board)
    if (evaluation.status !== 'in_progress') {
      status = evaluation.status
      winner = evaluation.winner
      winningLine = evaluation.winningLine
      currentPlayer = move.player
      break
    }
    currentPlayer = oppositePlayer(move.player)
  }

  const next: GameState = {
    board,
    currentPlayer: status === 'in_progress' ? currentPlayer : (winner ?? currentPlayer),
    status,
    winner,
    winningLine,
    moveHistory: history,
    scores,
    settings: { ...state.settings },
  }

  // Rare: history still terminal after pop — re-award using adjusted scores baseline.
  if (next.status === 'won' || next.status === 'draw') {
    return withTerminalScores(next)
  }

  return next
}

/**
 * In vs_ai mode, undo human move and the AI reply (if present).
 * Falls back to single undo when only one move exists.
 */
export function undoLastHumanTurn(state: GameState): GameState {
  if (state.settings.mode !== 'vs_ai') {
    return undoMove(state)
  }

  if (state.moveHistory.length === 0) {
    return state
  }

  const human = state.settings.humanPlayer
  const last = state.moveHistory[state.moveHistory.length - 1]

  // If last move was AI, undo AI then human (two steps).
  if (last.player !== human && state.moveHistory.length >= 2) {
    return undoMove(undoMove(state))
  }

  // Last move was human (AI hasn't replied, or human to move after incomplete pair).
  return undoMove(state)
}

export function getLegalMoves(state: GameState): number[] {
  if (state.status !== 'in_progress') return []
  return getEmptyIndices(state.board)
}

export function isAiTurn(state: GameState): boolean {
  if (state.settings.mode !== 'vs_ai') return false
  if (state.status !== 'in_progress') return false
  return state.currentPlayer !== state.settings.humanPlayer
}

export function getAiPlayer(state: GameState): Player {
  return oppositePlayer(state.settings.humanPlayer)
}
