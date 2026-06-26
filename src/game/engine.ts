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
  fortressesNeeded,
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
  const siege = settings.siegeMode === true
  return {
    boardSize,
    winLength: winLengthForBoard(boardSize),
    board: createEmptyBoard(boardSize),
    currentPlayer: settings.firstPlayer,
    status: 'in_progress',
    phase: siege ? 'siege_setup' : 'playing',
    winner: null,
    winningLine: null,
    moveHistory: [],
    scores,
    settings,
    ladderSize,
    justGrew: false,
    previousBoardSize: null,
    fortresses: { X: [], O: [] },
    revealedFortresses: [],
    lastFortressHit: null,
  }
}

function cloneFortresses(f: GameState['fortresses']): GameState['fortresses'] {
  return { X: [...(f?.X ?? [])], O: [...(f?.O ?? [])] }
}

/** Cells already used as anyone's fortress (setup cannot overlap). */
function fortressOccupied(state: GameState, cellIndex: number): boolean {
  return state.fortresses.X.includes(cellIndex) || state.fortresses.O.includes(cellIndex)
}

/**
 * Place a secret fortress during siege setup (uses the "turn" for that side).
 * When both sides have placed all fortresses, phase becomes `playing` and
 * `currentPlayer` resets to `firstPlayer` for the opening mark.
 */
export function placeFortress(state: GameState, cellIndex: number): ApplyMoveResult {
  if (!state.settings.siegeMode) return { ok: false, reason: 'not_siege' }
  if (state.status !== 'in_progress') return { ok: false, reason: 'game_over' }
  if (state.phase !== 'siege_setup') return { ok: false, reason: 'siege_complete' }
  if (!isValidIndex(cellIndex, state.boardSize)) return { ok: false, reason: 'invalid_index' }
  if (fortressOccupied(state, cellIndex)) return { ok: false, reason: 'fortress_taken' }

  const player = state.currentPlayer
  const need = fortressesNeeded(state.boardSize)
  if (state.fortresses[player].length >= need) return { ok: false, reason: 'siege_complete' }

  const fortresses = cloneFortresses(state.fortresses)
  fortresses[player] = [...fortresses[player], cellIndex]

  let next: GameState = {
    ...state,
    fortresses,
    lastFortressHit: null,
    justGrew: false,
  }

  const playerDone = fortresses[player].length >= need
  if (playerDone) {
    const other = opponent(player)
    if (fortresses[other].length >= need) {
      // Setup complete — first player opens with marks.
      next = {
        ...next,
        phase: 'playing',
        currentPlayer: state.settings.firstPlayer,
      }
    } else {
      next = { ...next, currentPlayer: other }
    }
  }
  // Same player places multiple fortresses in a row until their quota is filled.

  return { ok: true, state: next }
}

/** AI picks fortress cells: prefer corners, then center, then edges; avoid overlaps. */
export function chooseFortressCell(state: GameState): number {
  const taken = new Set([...state.fortresses.X, ...state.fortresses.O])
  const n = state.boardSize
  const center = Math.floor(n / 2)
  const priority: number[] = []
  const push = (i: number) => {
    if (i >= 0 && i < n * n && !taken.has(i)) priority.push(i)
  }
  push(0)
  push(n - 1)
  push((n - 1) * n)
  push(n * n - 1)
  push(center * n + center)
  for (let i = 0; i < n * n; i++) push(i)
  if (priority.length === 0) throw new Error('No fortress cells left')
  // Slight jitter so AI isn't fully deterministic on ties beyond priority order.
  return priority[0]!
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
  const fortresses = cloneFortresses(state.fortresses)
  fortresses.X = fortresses.X.map((i) => remapIndex(i, fromSize, toSize, rowOffset, colOffset))
  fortresses.O = fortresses.O.map((i) => remapIndex(i, fromSize, toSize, rowOffset, colOffset))
  const revealedFortresses = state.revealedFortresses.map((i) =>
    remapIndex(i, fromSize, toSize, rowOffset, colOffset),
  )

  return {
    ...state,
    boardSize: toSize,
    winLength,
    board,
    moveHistory,
    fortresses,
    revealedFortresses,
    settings,
    status: 'in_progress',
    phase: state.phase === 'siege_setup' ? 'siege_setup' : 'playing',
    winner: null,
    winningLine: null,
    ladderSize: toSize,
    justGrew: true,
    previousBoardSize: fromSize,
    lastFortressHit: null,
  }
}

export function applyMove(state: GameState, cellIndex: number): ApplyMoveResult {
  if (state.status !== 'in_progress') {
    return { ok: false, reason: 'game_over' }
  }
  if (state.phase === 'siege_setup') {
    return { ok: false, reason: 'game_over' }
  }
  if (!isValidIndex(cellIndex, state.boardSize)) {
    return { ok: false, reason: 'invalid_index' }
  }
  if (state.board[cellIndex] !== null) {
    return { ok: false, reason: 'cell_occupied' }
  }

  const player = state.currentPlayer
  const enemy = opponent(player)
  const fortresses = cloneFortresses(state.fortresses)
  let revealedFortresses = [...(state.revealedFortresses ?? [])]
  let hitFortress = false
  let lastFortressHit: GameState['lastFortressHit'] = null

  // Landing on an enemy fortress: place your mark and earn an extra turn.
  const enemyForts = fortresses[enemy]
  const hitIdx = enemyForts.indexOf(cellIndex)
  if (hitIdx >= 0) {
    hitFortress = true
    fortresses[enemy] = enemyForts.filter((i) => i !== cellIndex)
    if (!revealedFortresses.includes(cellIndex)) revealedFortresses = [...revealedFortresses, cellIndex]
    lastFortressHit = { attacker: player, cellIndex }
  }

  const board = setCell(state.board, cellIndex, player)
  const outcome = evaluateBoard(board, state.boardSize, state.winLength)
  const move: Move = { cellIndex, player, hitFortress }
  const moveHistory = [...state.moveHistory, move]
  // Extra turn on fortress hit (unless the game already ended on this placement).
  const nextPlayer = hitFortress && outcome.status === 'in_progress' ? player : opponent(player)

  const siegePatch = {
    fortresses,
    revealedFortresses,
    lastFortressHit,
    phase: 'playing' as const,
  }

  // Full board, no win → grow in place and keep playing when possible
  if (outcome.status === 'draw') {
    return finalizeGrowthOrDraw(state, board, moveHistory, nextPlayer, player, siegePatch)
  }

  if (outcome.status === 'won') {
    const scores = applyOutcomeScores(state.scores, outcome.status, outcome.winner)
    return {
      ok: true,
      state: {
        ...state,
        ...siegePatch,
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
    const grown = finalizeGrowthOrDraw(state, board, moveHistory, nextPlayer, player, siegePatch)
    if (grown.ok && (grown.state.justGrew || grown.state.status === 'draw')) {
      return grown
    }
  }

  return {
    ok: true,
    state: {
      ...state,
      ...siegePatch,
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

type SiegeBoardPatch = Pick<
  GameState,
  'fortresses' | 'revealedFortresses' | 'lastFortressHit' | 'phase'
>

/**
 * Attempt in-place growth for `nextPlayer` to move; otherwise score a draw.
 */
function finalizeGrowthOrDraw(
  state: GameState,
  board: Cell[],
  moveHistory: Move[],
  nextPlayer: Player,
  lastPlayer: Player,
  siegePatch?: SiegeBoardPatch,
): ApplyMoveResult {
  const plan = planBoardGrowth(board, state.boardSize, nextPlayer)
  const base = siegePatch ? { ...state, ...siegePatch } : state
  if (plan.grew) {
    const withMove: GameState = {
      ...base,
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
      ...base,
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
 * Replay mark history (not fortresses). Fortress state is not undone for v1 simplicity —
 * undo only rewinds marks / scores while phase stays `playing` if siege was on.
 */
function replayMarks(
  firstPlayer: Player,
  boardSize: BoardSize,
  history: Move[],
): { board: Cell[]; currentPlayer: Player } {
  const board = createEmptyBoard(boardSize)
  let currentPlayer = firstPlayer
  for (const move of history) {
    board[move.cellIndex] = move.player
    currentPlayer = move.hitFortress ? move.player : opponent(move.player)
  }
  return { board, currentPlayer }
}

/** Undo one move. In vs_ai, callers should typically undo twice (human+AI pair). */
export function undoMove(state: GameState): GameState {
  if (state.phase === 'siege_setup') {
    // Pop last fortress for current setup player if any; else previous player.
    const fortresses = cloneFortresses(state.fortresses)
    let player = state.currentPlayer
    if (fortresses[player].length === 0) {
      player = opponent(player)
    }
    if (fortresses[player].length === 0) return state
    fortresses[player] = fortresses[player].slice(0, -1)
    return {
      ...state,
      fortresses,
      phase: 'siege_setup',
      currentPlayer: player,
      lastFortressHit: null,
      justGrew: false,
    }
  }

  if (state.moveHistory.length === 0) return state

  const history = state.moveHistory.slice(0, -1)
  const { board, currentPlayer } = replayMarks(
    state.settings.firstPlayer,
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
  // Fortress lists are not perfectly restored on mark-undo (v1); hits stay revealed.
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
    lastFortressHit: null,
    phase: 'playing',
  }
}

/**
 * Undo appropriate step(s): in vs_ai, remove last human+AI pair when possible;
 * in PvP, remove one move.
 */
export function undoLastTurn(state: GameState): GameState {
  if (state.phase === 'siege_setup') {
    return undoMove(state)
  }
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
  if (state.phase === 'siege_setup') {
    const taken = new Set([...state.fortresses.X, ...state.fortresses.O])
    const out: number[] = []
    for (let i = 0; i < state.boardSize * state.boardSize; i++) {
      if (!taken.has(i)) out.push(i)
    }
    return out
  }
  return getEmptyCells(state.board)
}

export function isAiTurn(state: GameState): boolean {
  if (state.settings.mode !== 'vs_ai') return false
  if (state.status !== 'in_progress') return false
  return state.currentPlayer !== state.settings.humanPlayer
}

export function isSiegeSetup(state: GameState): boolean {
  return state.settings.siegeMode === true && state.phase === 'siege_setup'
}

export function getAiPlayer(state: GameState): Player {
  return opponent(state.settings.humanPlayer)
}
