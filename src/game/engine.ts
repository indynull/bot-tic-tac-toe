import {
  createEmptyBoard,
  embedBoard,
  evaluateBoard,
  getEmptyCells,
  isValidIndex,
  opponent,
  planBoardGrowth,
  positionHasWinningPotential,
  remapIndex,
  setCell,
} from './board'
import type {
  ApplyMoveResult,
  BoardSize,
  Cell,
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
    justGrew: false,
    previousBoardSize: null,
  }
}

/**
 * Embed marks into a larger board (offsets from plan); remap history; optionally tier up vs-AI.
 * Game stays in progress on the larger grid. Undo is size-sticky (does not shrink).
 */
export function growBoardInPlace(
  state: GameState,
  toSize: BoardSize,
  rowOffset = 0,
  colOffset = 0,
): GameState {
  if (toSize <= state.boardSize) return state
  const fromSize = state.boardSize
  const winLength = winLengthForBoard(toSize)
  const board = embedBoard(state.board, fromSize, toSize, rowOffset, colOffset)
  const moveHistory = state.moveHistory.map((m) => ({
    ...m,
    cellIndex: remapIndex(m.cellIndex, fromSize, toSize, rowOffset, colOffset),
  }))
  let settings = state.settings
  if (settings.mode === 'vs_ai' && shouldEscalateDifficulty(fromSize)) {
    settings = { ...settings, difficulty: nextDifficulty(settings.difficulty) }
  }
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
    ladderSize: toSize,
    justGrew: true,
    previousBoardSize: fromSize,
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
  const nextPlayer = opponent(player)

  // Full board, no win → grow in place and keep playing when possible
  if (outcome.status === 'draw') {
    return finalizeGrowthOrDraw(state, board, moveHistory, nextPlayer, player)
  }

  let scores = state.scores
  if (outcome.status === 'won') {
    scores = applyOutcomeScores(state.scores, outcome.status, outcome.winner)
    return {
      ok: true,
      state: {
        ...state,
        board,
        currentPlayer: player,
        status: 'won',
        winner: outcome.winner,
        winningLine: outcome.winningLine,
        moveHistory,
        scores,
        ladderSize: state.boardSize,
        justGrew: false,
      },
    }
  }

  // In progress but every k-in-a-row line is already blocked for both sides (empties remain).
  // Grow now so players aren't stuck filling a dead board by hand.
  if (
    state.boardSize < MAX_BOARD_SIZE &&
    !positionHasWinningPotential(board, state.boardSize, state.winLength)
  ) {
    const grown = finalizeGrowthOrDraw(state, board, moveHistory, nextPlayer, player)
    if (grown.ok && (grown.state.justGrew || grown.state.status === 'draw')) {
      return grown
    }
  }

  return {
    ok: true,
    state: {
      ...state,
      board,
      currentPlayer: nextPlayer,
      status: 'in_progress',
      winner: null,
      winningLine: null,
      moveHistory,
      scores,
      ladderSize: state.ladderSize,
      justGrew: false,
    },
  }
}

/**
 * Attempt in-place growth for `nextPlayer` to move; otherwise score a draw.
 */
function finalizeGrowthOrDraw(
  state: GameState,
  board: Cell[],
  moveHistory: Move[],
  nextPlayer: Player,
  lastPlayer: Player,
): ApplyMoveResult {
  const plan = planBoardGrowth(board, state.boardSize, nextPlayer)
  if (plan.grew) {
    const withMove: GameState = {
      ...state,
      board,
      moveHistory,
      justGrew: false,
    }
    const grown = growBoardInPlace(withMove, plan.boardSize, plan.rowOffset, plan.colOffset)
    return {
      ok: true,
      state: {
        ...grown,
        currentPlayer: nextPlayer,
        scores: state.scores,
      },
    }
  }
  const scores = applyOutcomeScores(state.scores, 'draw', null)
  return {
    ok: true,
    state: {
      ...state,
      board,
      currentPlayer: lastPlayer,
      status: 'draw',
      winner: null,
      winningLine: null,
      moveHistory,
      scores,
      ladderSize: state.boardSize,
      justGrew: false,
    },
  }
}

/**
 * Resolve board size + settings for a new (empty) game.
 * Keeps current ladder size (in-place growth already applied during play).
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

  // Size is sticky after in-place growth (undo does not shrink the grid)
  return {
    ...state,
    board,
    currentPlayer: outcome.status === 'in_progress' ? currentPlayer : state.currentPlayer,
    status: outcome.status,
    winner: outcome.winner,
    winningLine: outcome.winningLine,
    moveHistory: history,
    scores,
    justGrew: false,
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
