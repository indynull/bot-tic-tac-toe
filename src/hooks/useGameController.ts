import { useCallback, useEffect, useRef, useState } from 'react'
import {
  applyMove,
  chooseAiAction,
  createGame,
  isAiTurn,
  loadPersisted,
  plantMine,
  resetGame,
  resetScores,
  savePersisted,
  undoLastTurn,
  updateSettings,
  type Difficulty,
  type GameMode,
  type GameState,
  type Player,
  type Settings,
  type Theme,
} from '../game'

/** Hard ceiling: human-visible AI response must stay under 1 second. */
const AI_RESPONSE_BUDGET_MS = 800

/** Minimum “thinking” theater so moves don't blink in; shrinks if search was slow. */
function minThinkMs(difficulty: Difficulty, boardSize: number): number {
  if (boardSize > 3) {
    switch (difficulty) {
      case 'easy':
        return 40
      case 'medium':
        return 50
      case 'hard':
        return 60
      case 'impossible':
        return 80
      default:
        return 50
    }
  }
  switch (difficulty) {
    case 'easy':
      return 60
    case 'medium':
      return 80
    case 'hard':
      return 100
    case 'impossible':
      return 120
    default:
      return 80
  }
}

function initialState(): GameState {
  const { scores, settings, progression } = loadPersisted()
  const size = progression.boardSize
  return createGame({
    scores,
    settings,
    boardSize: size,
    ladderSize: size,
  })
}

export function useGameController() {
  const [game, setGame] = useState<GameState>(initialState)
  const [aiThinking, setAiThinking] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [plantMode, setPlantMode] = useState(false)
  const aiTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const gameRef = useRef(game)
  gameRef.current = game

  const clearAiTimer = useCallback(() => {
    if (aiTimerRef.current !== null) {
      clearTimeout(aiTimerRef.current)
      aiTimerRef.current = null
    }
  }, [])

  // Persist scores, settings, and ladder size (current / next empty game)
  useEffect(() => {
    savePersisted(game.scores, game.settings, {
      boardSize: game.boardSize,
    })
  }, [game.scores, game.settings, game.boardSize])

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', game.settings.theme)
  }, [game.settings.theme])

  const runAiMove = useCallback((state: GameState) => {
    // Pin the board we're solving for — gameRef may lag one frame behind setGame (e.g. after plant).
    if (!isAiTurn(state)) {
      setAiThinking(false)
      return
    }
    clearAiTimer()
    gameRef.current = state
    setAiThinking(true)
    const startedAt = performance.now()
    const minThink = minThinkMs(state.settings.difficulty, state.boardSize)
    const historyLenAtStart = state.moveHistory.length

    const applyAiAction = (board: GameState) => {
      if (!isAiTurn(board)) return false
      const pick = chooseAiAction(board)
      let result =
        pick.type === 'plant'
          ? plantMine(board, pick.cellIndex)
          : applyMove(board, pick.cellIndex)
      if (!result.ok && pick.type === 'plant') {
        result = applyMove(board, chooseAiAction({
          ...board,
          settings: { ...board.settings, mineMode: false },
        }).cellIndex)
      }
      if (!result.ok) {
        const legal = board.board
          .map((c, i) => (c === null ? i : -1))
          .filter((i) => i >= 0)
        if (legal.length > 0) result = applyMove(board, legal[0]!)
      }
      if (result.ok) {
        gameRef.current = result.state
        setGame(result.state)
        return true
      }
      return false
    }

    // Yield one tick so “thinking” status can paint, then compute + apply within budget.
    aiTimerRef.current = setTimeout(() => {
      aiTimerRef.current = null
      try {
        // Prefer live ref if the human somehow moved again; otherwise use the pinned state.
        let board =
          isAiTurn(gameRef.current) &&
          gameRef.current.moveHistory.length >= historyLenAtStart
            ? gameRef.current
            : state
        if (!isAiTurn(board)) {
          // Stale ref after plant — fall back to the state we were invoked with.
          board = state
        }
        if (!isAiTurn(board)) {
          setAiThinking(false)
          return
        }

        const elapsed = performance.now() - startedAt
        const wait = Math.max(
          0,
          Math.min(minThink - elapsed, AI_RESPONSE_BUDGET_MS - elapsed),
        )

        const commit = () => {
          try {
            const latest =
              isAiTurn(gameRef.current) &&
              gameRef.current.moveHistory.length >= historyLenAtStart
                ? gameRef.current
                : board
            if (!applyAiAction(isAiTurn(latest) ? latest : board)) {
              applyAiAction(state)
            }
          } catch {
            // no legal moves — still clear thinking flag
          } finally {
            setAiThinking(false)
          }
        }

        if (wait <= 0) {
          commit()
        } else {
          aiTimerRef.current = setTimeout(() => {
            aiTimerRef.current = null
            commit()
          }, wait)
        }
      } catch {
        setAiThinking(false)
      }
    }, 0)
  }, [clearAiTimer])

  // Trigger AI when it's their turn (opening move, after plant, after human place).
  useEffect(() => {
    if (isAiTurn(game) && !aiThinking && aiTimerRef.current === null) {
      runAiMove(game)
    }
  }, [game, game.moveHistory.length, game.currentPlayer, game.status, aiThinking, runAiMove])

  useEffect(() => {
    return () => clearAiTimer()
  }, [clearAiTimer])

  const placeMark = useCallback(
    (cellIndex: number) => {
      const current = gameRef.current
      if (aiThinking || isAiTurn(current)) return
      if (current.status !== 'in_progress') return
      const wantPlant =
        plantMode &&
        current.settings.mineMode &&
        (current.minesRemaining?.[current.currentPlayer] ?? 0) > 0
      // Leave plant mode even if the plant fails so the UI can't get stuck "armed".
      if (wantPlant) setPlantMode(false)
      const result = wantPlant ? plantMine(current, cellIndex) : applyMove(current, cellIndex)
      if (result.ok) {
        gameRef.current = result.state
        setGame(result.state)
        // Kick AI with the post-move state directly (don't wait for a render to refresh gameRef).
        if (isAiTurn(result.state)) {
          runAiMove(result.state)
        }
      }
    },
    [aiThinking, plantMode, runAiMove],
  )

  const newGame = useCallback(() => {
    clearAiTimer()
    setAiThinking(false)
    // Fresh empty board at ladder size (advanced after draws)
    setGame((g) => resetGame(g, { preserveScores: true, preserveSettings: true }))
  }, [clearAiTimer])

  const doResetScores = useCallback(() => {
    // Clear scores and return to classic 3×3 ladder
    setGame((g) => {
      const cleared = resetScores(g)
      return resetGame(cleared, {
        preserveScores: true,
        preserveSettings: true,
        resetProgression: true,
      })
    })
  }, [])

  const doUndo = useCallback(() => {
    clearAiTimer()
    setAiThinking(false)
    setGame((g) => undoLastTurn(g))
  }, [clearAiTimer])

  const patchSettings = useCallback(
    (partial: Partial<Settings>, restartGame = false) => {
      clearAiTimer()
      setAiThinking(false)
      setGame((g) => {
        const next = updateSettings(g, partial)
        if (restartGame || partial.mode !== undefined || partial.firstPlayer !== undefined || partial.humanPlayer !== undefined) {
          return resetGame(next, {
            preserveScores: true,
            preserveSettings: true,
          })
        }
        return next
      })
    },
    [clearAiTimer],
  )

  const setMode = useCallback(
    (mode: GameMode) => {
      if (gameRef.current.moveHistory.length > 0 && gameRef.current.status === 'in_progress') {
        const ok = window.confirm('Changing mode starts a new game. Continue?')
        if (!ok) return
      }
      // Switching into vs computer floors at hard — no soft entry via easy/medium defaults.
      if (mode === 'vs_ai') {
        const current = gameRef.current.settings.difficulty
        const floor: Difficulty =
          current === 'easy' || current === 'medium' ? 'hard' : current
        patchSettings({ mode, difficulty: floor }, true)
        return
      }
      patchSettings({ mode }, true)
    },
    [patchSettings],
  )

  const setDifficulty = useCallback(
    (difficulty: Difficulty) => patchSettings({ difficulty }),
    [patchSettings],
  )

  const setTheme = useCallback(
    (theme: Theme) => patchSettings({ theme }),
    [patchSettings],
  )

  const setSoundEnabled = useCallback(
    (soundEnabled: boolean) => patchSettings({ soundEnabled }),
    [patchSettings],
  )

  const setFirstPlayer = useCallback(
    (firstPlayer: Player) => patchSettings({ firstPlayer }, true),
    [patchSettings],
  )

  const setHumanPlayer = useCallback(
    (humanPlayer: Player) => patchSettings({ humanPlayer }, true),
    [patchSettings],
  )

  const setMineMode = useCallback(
    (mineMode: boolean) => {
      setPlantMode(false)
      patchSettings({ mineMode }, true)
    },
    [patchSettings],
  )

  const boardLocked = aiThinking || isAiTurn(game) || game.status !== 'in_progress'
  const canPlant =
    game.settings.mineMode &&
    !boardLocked &&
    (game.minesRemaining[game.currentPlayer] ?? 0) > 0

  /** In PvP both see only… actually both shouldn't see enemy mines; show current player's mines only. */
  const visibleMineOwner: Player | 'both' | null = game.settings.mineMode
    ? game.settings.mode === 'local_pvp'
      ? game.currentPlayer
      : game.settings.humanPlayer
    : null

  return {
    game,
    aiThinking,
    boardLocked,
    settingsOpen,
    setSettingsOpen,
    plantMode,
    setPlantMode,
    canPlant,
    visibleMineOwner,
    placeMark,
    newGame,
    doResetScores,
    doUndo,
    setMode,
    setDifficulty,
    setTheme,
    setSoundEnabled,
    setFirstPlayer,
    setHumanPlayer,
    setMineMode,
    patchSettings,
  }
}
