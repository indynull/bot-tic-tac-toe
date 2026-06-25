import {
  createEmptyBoard,
  embedBoard,
  evaluateBoard,
  getEmptyCells,
  isValidIndex,
  opponent,
  planBoardGrowth,
  remapIndex,
  setCell,
} from './board'
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
  MAX_BOARD_SIZE,
  nextDifficulty,
  shouldEscalateDifficulty,
  winLengthForBoard,
} from './types'

export interface CreateGameOptions {
  settings?: Partial<Settings>
  scores?: Scores
  boardSize?: BoardSize
  pendingEscalation?: boolean
}

export interface ResetGameOptions {
  preserveScores?: boolean
  preserveSettings?: boolean
  settings?: Partial<Settings>
  /** Force a specific board size (skips draw-escalation logic). */
  boardSize?: BoardSize
  /**
   * When true, apply pending draw escalation (bigger board + harder AI).
   * Default: **false** — only explicit "New game" should pass true so theme/settings
   * changes don't consume an escalation token.
   */
  applyEscalation?: boolean
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
    pendingEscalation: options.pendingEscalation ?? false,
  }
}

/**
 * Apply an in-place board growth: embed marks, remap history, optionally bump AI tier.
 * Game stays in progress; next player moves on the larger board.
 */
export function growBoardInPlace(state: GameState, toSize: BoardSize): GameState {
  if (toSize <= state.boardSize) return state
  const winLength = winLengthForBoard(toSize)
  const board = embedBoard(state.board, state.boardSize, toSize)
  const moveHistory = state.moveHistory.map((m) => ({
    ...m,
    cellIndex: remapIndex(m.cellIndex, state.boardSize, toSize),
  }))
  let settings = state.settings
  if (settings.mode === 'vs_ai' && shouldEscalateDifficulty(state.boardSize)) {
    settings = { ...settings, difficulty: nextDifficulty(settings.difficulty) }
  }
  const atMax = toSize >= MAX_BOARD_SIZE
  return {
    ...state,
    boardSize: toSize,
    winLength,
    board,
    moveHistory,
    settings,
    status: 'in_progress',
    winner: null,
    winningLine: null,
    // Only block further growth once we hit the ceiling
    pendingEscalation: atMax ? false : state.pendingEscalation,
  }
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

  // Full board but not a win → try growing in place so the game continues
  if (outcome.status === 'draw') {
    const nextPlayer = opponent(player)
    const plan = planBoardGrowth(board, state.boardSize, nextPlayer)
    if (plan.grew) {
      const grownHistory = moveHistory.map((m) => ({
        ...m,
        cellIndex: remapIndex(m.cellIndex, state.boardSize, plan.boardSize),
      }))
      let settings = state.settings
      if (settings.mode === 'vs_ai' && shouldEscalateDifficulty(state.boardSize)) {
        settings = { ...settings, difficulty: nextDifficulty(settings.difficulty) }
      }
      return {
        ok: true,
        state: {
          ...state,
          boardSize: plan.boardSize,
          winLength: plan.winLength,
          board: plan.board,
          currentPlayer: nextPlayer,
          status: 'in_progress',
          winner: null,
          winningLine: null,
          moveHistory: grownHistory,
          scores: state.scores,
          settings,
          pendingEscalation: false,
        },
      }
    }
    // At max size (or no safe growth) — real draw, count it
    const scores = applyOutcomeScores(state.scores, 'draw', null)
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
        pendingEscalation: state.boardSize >= MAX_BOARD_SIZE,
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
      pendingEscalation: state.pendingEscalation,
    },
  }
}

/**
 * Resolve board size + settings for a new (empty) game.
 * Board growth happens in-place on draws; new game keeps current ladder size unless reset.
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

  // Keep current board size on the ladder (growth already applied in-place during play)
  return { boardSize: state.boardSize, settings }
}

export function resetGame(state: GameState, options: ResetGameOptions = {}): GameState {
  const preserveScores = options.preserveScores !== false
  const { boardSize, settings } = resolveEscalation(state, options)
  return createGame({
    settings,
    scores: preserveScores ? cloneScores(state.scores) : { ...DEFAULT_SCORES },
    boardSize,
    pendingEscalation: false,
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

  return {
    ...state,
    board,
    currentPlayer: outcome.status === 'in_progress' ? currentPlayer : state.currentPlayer,
    status: outcome.status,
    winner: outcome.winner,
    winningLine: outcome.winningLine,
    moveHistory: history,
    scores,
    pendingEscalation: false,
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
