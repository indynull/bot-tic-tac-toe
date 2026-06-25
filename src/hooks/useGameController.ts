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

/**
 * Artificial thinking delay. On boards > 3×3 keep delays tiny so growth feels instant
 * (search is already tactical/shallow on large boards).
 */
function aiDelayMs(difficulty: Difficulty, boardSize: number): number {
  if (boardSize > 3) {
    switch (difficulty) {
      case 'easy':
        return 40
      case 'medium':
        return 60
      case 'hard':
        return 80
      case 'impossible':
        return 100
      default:
        return 60
    }
  }
  switch (difficulty) {
    case 'easy':
      return 280
    case 'medium':
      return 450
    case 'hard':
      return 700
    case 'impossible':
      return 850 + Math.floor(Math.random() * 650)
    default:
      return 700
  }
}

function initialState(): GameState {
  const { scores, settings, progression } = loadPersisted()
  return createGame({
    scores,
    settings,
    boardSize: progression.boardSize,
    pendingEscalation: progression.pendingEscalation,
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

  // Persist scores, settings, and draw-escalation progression
  useEffect(() => {
    savePersisted(game.scores, game.settings, {
      boardSize: game.boardSize,
      pendingEscalation: game.pendingEscalation,
    })
  }, [game.scores, game.settings, game.boardSize, game.pendingEscalation])

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
    aiTimerRef.current = setTimeout(() => {
      aiTimerRef.current = null
      const latest = gameRef.current
      if (!isAiTurn(latest)) {
        setAiThinking(false)
        return
      }
      try {
        const move = chooseMove(latest)
        const result = applyMove(latest, move)
        if (result.ok) {
          setGame(result.state)
        }
      } catch {
        // no legal moves
      } finally {
        setAiThinking(false)
      }
    }, aiDelayMs(state.settings.difficulty, state.boardSize))
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
    // Only explicit New game consumes pending draw escalation
    setGame((g) =>
      resetGame(g, { preserveScores: true, preserveSettings: true, applyEscalation: true }),
    )
  }, [clearAiTimer])

  const doResetScores = useCallback(() => {
    // Reset scores and return to classic 3×3 ladder
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
          // Settings/mode restart must NOT consume draw escalation
          return resetGame(next, {
            preserveScores: true,
            preserveSettings: true,
            applyEscalation: false,
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
