import { useCallback, useEffect, useRef, useState } from 'react'
import {
  applyMove,
  chooseMove,
  createGame,
  isAiTurn,
  loadPersisted,
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
  const aiTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const gameRef = useRef(game)
  gameRef.current = game

  const clearAiTimer = useCallback(() => {
    if (aiTimerRef.current !== null) {
      clearTimeout(aiTimerRef.current)
      aiTimerRef.current = null
    }
  }, [])

  // Persist scores, settings, and ladder size (next new game)
  useEffect(() => {
    savePersisted(game.scores, game.settings, {
      boardSize: game.ladderSize,
    })
  }, [game.scores, game.settings, game.ladderSize])

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', game.settings.theme)
  }, [game.settings.theme])

  const runAiMove = useCallback((state: GameState) => {
    clearAiTimer()
    if (!isAiTurn(state)) {
      setAiThinking(false)
      return
    }
    setAiThinking(true)
    const startedAt = performance.now()
    const minThink = minThinkMs(state.settings.difficulty, state.boardSize)

    // Yield one tick so “thinking” status can paint, then compute + apply within budget.
    aiTimerRef.current = setTimeout(() => {
      aiTimerRef.current = null
      try {
        const current = gameRef.current
        if (!isAiTurn(current)) {
          setAiThinking(false)
          return
        }
        const move = chooseMove(current)
        const elapsed = performance.now() - startedAt
        // Pad for a brief think feel, but never miss the sub-second budget.
        const wait = Math.max(
          0,
          Math.min(minThink - elapsed, AI_RESPONSE_BUDGET_MS - elapsed),
        )

        const commit = () => {
          try {
            const latestBoard = gameRef.current
            if (!isAiTurn(latestBoard)) return
            const pick =
              latestBoard.moveHistory.length === current.moveHistory.length
                ? move
                : chooseMove(latestBoard)
            const result = applyMove(latestBoard, pick)
            if (result.ok) setGame(result.state)
          } catch {
            // no legal moves
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

  // Trigger AI when it's their turn
  useEffect(() => {
    if (isAiTurn(game) && !aiThinking && aiTimerRef.current === null) {
      runAiMove(game)
    }
    return () => {
      // cleanup only on unmount handled separately
    }
  }, [game, aiThinking, runAiMove])

  useEffect(() => {
    return () => clearAiTimer()
  }, [clearAiTimer])

  const placeMark = useCallback(
    (cellIndex: number) => {
      const current = gameRef.current
      if (aiThinking || isAiTurn(current)) return
      if (current.status !== 'in_progress') return
      const result = applyMove(current, cellIndex)
      if (result.ok) {
        setGame(result.state)
      }
    },
    [aiThinking],
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

  const boardLocked = aiThinking || isAiTurn(game) || game.status !== 'in_progress'

  return {
    game,
    aiThinking,
    boardLocked,
    settingsOpen,
    setSettingsOpen,
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
    patchSettings,
  }
}
