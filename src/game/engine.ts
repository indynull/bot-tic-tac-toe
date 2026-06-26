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
  MineEvent,
  MineMap,
  Move,
  Player,
  Scores,
  Settings,
} from './types'
import {
  DEFAULT_BOARD_SIZE,
  DEFAULT_SCORES,
  DEFAULT_SETTINGS,
  initialMinesRemaining,
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
    mines: {},
    minesRemaining: initialMinesRemaining(settings.mineMode),
    lastMineEvent: null,
    justPlantedMine: false,
  }
}

function cloneMines(mines: MineMap): MineMap {
  return { ...mines }
}

/** Most recent mark belonging to `owner` on the board (by move history), or null. */
function findCaptureTarget(board: Cell[], history: Move[], owner: Player): number | null {
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i]!
    if (m.kind === 'plant') continue
    if (m.player === owner && board[m.cellIndex] === owner) return m.cellIndex
  }
  for (let i = board.length - 1; i >= 0; i--) {
    if (board[i] === owner) return i
  }
  return null
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
    capturedIndex:
      m.capturedIndex === undefined
        ? undefined
        : remapIndex(m.capturedIndex, fromSize, toSize, rowOffset, colOffset),
  }))
  const mines: MineMap = {}
  for (const [key, owner] of Object.entries(state.mines)) {
    const fromIdx = Number(key)
    const toIdx = remapIndex(fromIdx, fromSize, toSize, rowOffset, colOffset)
    mines[toIdx] = owner
  }
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
    mines,
    settings,
    status: 'in_progress',
    winner: null,
    winningLine: null,
    ladderSize: toSize,
    justGrew: true,
    previousBoardSize: fromSize,
    lastMineEvent: null,
    justPlantedMine: false,
  }
}

/**
 * Plant a hidden mine on an empty cell (uses the turn). Mine mode only.
 * Opponent cannot see it; if they later place there they trigger takeover rules.
 */
/** Ensure mine fields exist (older in-memory / partial states). */
export function withMineFields(state: GameState): GameState {
  const mineMode = state.settings?.mineMode === true
  const mines = state.mines && typeof state.mines === 'object' ? state.mines : {}
  const mr = state.minesRemaining
  const minesRemaining =
    mr && typeof mr.X === 'number' && typeof mr.O === 'number'
      ? { X: mr.X, O: mr.O }
      : initialMinesRemaining(mineMode)
  return {
    ...state,
    settings: { ...DEFAULT_SETTINGS, ...state.settings, mineMode },
    mines: cloneMines(mines),
    minesRemaining,
    lastMineEvent: state.lastMineEvent ?? null,
    justPlantedMine: state.justPlantedMine === true,
  }
}

export function plantMine(state: GameState, cellIndex: number): ApplyMoveResult {
  state = withMineFields(state)
  if (!state.settings.mineMode) return { ok: false, reason: 'mines_disabled' }
  if (state.status !== 'in_progress') return { ok: false, reason: 'game_over' }
  if (!isValidIndex(cellIndex, state.boardSize)) return { ok: false, reason: 'invalid_index' }
  if (state.board[cellIndex] !== null) return { ok: false, reason: 'cell_occupied' }
  if (state.mines[cellIndex] !== undefined) return { ok: false, reason: 'cell_has_mine' }

  const player = state.currentPlayer
  if ((state.minesRemaining[player] ?? 0) <= 0) return { ok: false, reason: 'no_mines_left' }

  const mines = cloneMines(state.mines)
  mines[cellIndex] = player
  const minesRemaining = {
    X: state.minesRemaining.X,
    O: state.minesRemaining.O,
    [player]: state.minesRemaining[player] - 1,
  }
  const move: Move = { cellIndex, player, kind: 'plant' }
  const nextPlayer = opponent(player)

  return {
    ok: true,
    state: {
      ...state,
      mines,
      minesRemaining,
      moveHistory: [...state.moveHistory, move],
      currentPlayer: nextPlayer,
      status: 'in_progress',
      justGrew: false,
      justPlantedMine: true,
      lastMineEvent: null,
    },
  }
}

export function applyMove(state: GameState, cellIndex: number): ApplyMoveResult {
  state = withMineFields(state)
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
  let board = state.board.slice()
  let mines = cloneMines(state.mines)
  let lastMineEvent: MineEvent | null = null
  let capturedIndex: number | undefined
  let triggeredMineOwner: Player | undefined

  const mineOwner = mines[cellIndex]
  // Enemy mine: trap favors the **owner** — they get the cell and may convert one of the
  // stepper's marks (take over the victim's position). Stepper still spends their turn.
  if (mineOwner !== undefined && mineOwner !== player) {
    delete mines[cellIndex]
    board[cellIndex] = mineOwner
    const capture = findCaptureTarget(board, state.moveHistory, player)
    if (capture !== null && capture !== cellIndex && board[capture] === player) {
      board[capture] = mineOwner
      capturedIndex = capture
    }
    triggeredMineOwner = mineOwner
    lastMineEvent = {
      stepper: player,
      owner: mineOwner,
      cellIndex,
      capturedIndex: capturedIndex ?? null,
    }
  } else {
    // Own mine or no mine — normal place; clear own mine if stepping on it
    if (mineOwner === player) delete mines[cellIndex]
    board = setCell(board, cellIndex, player)
  }

  const outcome = evaluateBoard(board, state.boardSize, state.winLength)
  const move: Move = {
    cellIndex,
    player,
    kind: 'place',
    capturedIndex,
    triggeredMineOwner,
  }
  const moveHistory = [...state.moveHistory, move]
  const nextPlayer = opponent(player)
  const basePatch = {
    mines,
    lastMineEvent,
    justPlantedMine: false as const,
  }

  // Full board, no win → grow in place and keep playing when possible
  if (outcome.status === 'draw') {
    return finalizeGrowthOrDraw(state, board, moveHistory, nextPlayer, player, basePatch)
  }

  if (outcome.status === 'won') {
    const scores = applyOutcomeScores(state.scores, outcome.status, outcome.winner)
    return {
      ok: true,
      state: {
        ...state,
        ...basePatch,
        board,
        // Prefer actual winner (mine owner can win on the trap without being the stepper).
        currentPlayer: outcome.winner ?? player,
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
    const grown = finalizeGrowthOrDraw(state, board, moveHistory, nextPlayer, player, basePatch)
    if (grown.ok && (grown.state.justGrew || grown.state.status === 'draw')) {
      return grown
    }
  }

  return {
    ok: true,
    state: {
      ...state,
      ...basePatch,
      board,
      currentPlayer: nextPlayer,
      status: 'in_progress',
      winner: null,
      winningLine: null,
      moveHistory,
      scores: state.scores,
      ladderSize: state.ladderSize,
      justGrew: false,
    },
  }
}

type MineBoardPatch = {
  mines: MineMap
  lastMineEvent: MineEvent | null
  justPlantedMine: boolean
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
  minePatch: MineBoardPatch = {
    mines: state.mines,
    lastMineEvent: null,
    justPlantedMine: false,
  },
): ApplyMoveResult {
  const plan = planBoardGrowth(board, state.boardSize, nextPlayer)
  if (plan.grew) {
    const withMove: GameState = {
      ...state,
      ...minePatch,
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
      ...minePatch,
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

/**
 * Replay history onto a fresh board at `boardSize` (size-sticky undo; ignores growth).
 * Reconstructs marks, mines, and remaining plant charges.
 */
function replayHistory(
  settings: Settings,
  boardSize: BoardSize,
  history: Move[],
): {
  board: Cell[]
  mines: MineMap
  minesRemaining: Record<Player, number>
  currentPlayer: Player
} {
  const board = createEmptyBoard(boardSize)
  const mines: MineMap = {}
  const minesRemaining = initialMinesRemaining(settings.mineMode)
  let currentPlayer = settings.firstPlayer

  for (let hi = 0; hi < history.length; hi++) {
    const move = history[hi]!
    const kind = move.kind ?? 'place'
    if (kind === 'plant') {
      mines[move.cellIndex] = move.player
      minesRemaining[move.player] = Math.max(0, minesRemaining[move.player] - 1)
    } else {
      const owner = mines[move.cellIndex]
      if (owner !== undefined && owner !== move.player) {
        delete mines[move.cellIndex]
        board[move.cellIndex] = owner
        if (move.capturedIndex !== undefined && board[move.capturedIndex] === move.player) {
          board[move.capturedIndex] = owner
        } else {
          const capture = findCaptureTarget(board, history.slice(0, hi), move.player)
          if (capture !== null && board[capture] === move.player) board[capture] = owner
        }
      } else {
        if (owner === move.player) delete mines[move.cellIndex]
        board[move.cellIndex] = move.player
      }
    }
    currentPlayer = opponent(move.player)
  }

  return { board, mines, minesRemaining, currentPlayer }
}

/** Undo one move. In vs_ai, callers should typically undo twice (human+AI pair). */
export function undoMove(state: GameState): GameState {
  if (state.moveHistory.length === 0) return state

  const history = state.moveHistory.slice(0, -1)
  const { board, mines, minesRemaining, currentPlayer } = replayHistory(
    state.settings,
    state.boardSize,
    history,
  )

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
    mines,
    minesRemaining,
    currentPlayer: outcome.status === 'in_progress' ? currentPlayer : state.currentPlayer,
    status: outcome.status,
    winner: outcome.winner,
    winningLine: outcome.winningLine,
    moveHistory: history,
    scores,
    justGrew: false,
    justPlantedMine: false,
    lastMineEvent: null,
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
