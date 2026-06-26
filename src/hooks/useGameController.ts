import { useCallback, useEffect, useRef, useState } from 'react'
import {
  applyMove,
  chooseFortressCell,
  chooseMove,
  createGame,
  isAiTurn,
  isSiegeSetup,
  loadPersisted,
  placeFortress,
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
    if (!isAiTurn(state)) {
      setAiThinking(false)
      return
    }
    clearAiTimer()
    gameRef.current = state
    setAiThinking(true)
    const startedAt = performance.now()
    const minThink = minThinkMs(state.settings.difficulty, state.boardSize)
    const setup = isSiegeSetup(state)

    aiTimerRef.current = setTimeout(() => {
      aiTimerRef.current = null
      try {
        let board = isAiTurn(gameRef.current) ? gameRef.current : state
        if (!isAiTurn(board)) board = state
        if (!isAiTurn(board)) {
          setAiThinking(false)
          return
        }

        const act = () => {
          try {
            const latest = isAiTurn(gameRef.current) ? gameRef.current : board
            let result
            if (isSiegeSetup(latest)) {
              // Place all remaining fortresses for the AI in one "thinking" burst.
              let s = latest
              while (isAiTurn(s) && isSiegeSetup(s)) {
                const cell = chooseFortressCell(s)
                const r = placeFortress(s, cell)
                if (!r.ok) break
                s = r.state
              }
              gameRef.current = s
              setGame(s)
              // If setup finished and AI opens marks, loop will re-enter via effect.
            } else {
              const pick = chooseMove(latest)
              result = applyMove(latest, pick)
              if (result.ok) {
                gameRef.current = result.state
                setGame(result.state)
                // Extra turn after fortress hit — keep AI going.
                if (isAiTurn(result.state) && result.state.lastFortressHit) {
                  setTimeout(() => runAiMove(result!.state), 0)
                  return
                }
              }
            }
          } catch {
            // ignore
          } finally {
            setAiThinking(false)
          }
        }

        const elapsed = performance.now() - startedAt
        const wait = Math.max(
          0,
          Math.min(minThink - elapsed, AI_RESPONSE_BUDGET_MS - elapsed),
        )
        if (wait <= 0 || setup) act()
        else {
          aiTimerRef.current = setTimeout(() => {
            aiTimerRef.current = null
            act()
          }, wait)
        }
      } catch {
        setAiThinking(false)
      }
    }, 0)
  }, [clearAiTimer])

  // Trigger AI when it's their turn (setup fortresses or marks)
  useEffect(() => {
    if (isAiTurn(game) && !aiThinking && aiTimerRef.current === null) {
      runAiMove(game)
    }
  }, [game, game.phase, game.currentPlayer, game.moveHistory.length, aiThinking, runAiMove])

  useEffect(() => {
    return () => clearAiTimer()
  }, [clearAiTimer])

  const placeMark = useCallback(
    (cellIndex: number) => {
      const current = gameRef.current
      if (aiThinking || isAiTurn(current)) return
      if (current.status !== 'in_progress') return
      const result = isSiegeSetup(current)
        ? placeFortress(current, cellIndex)
        : applyMove(current, cellIndex)
      if (result.ok) {
        gameRef.current = result.state
        setGame(result.state)
        if (isAiTurn(result.state)) {
          runAiMove(result.state)
        } else if (
          result.state.phase === 'playing' &&
          result.state.lastFortressHit &&
          result.state.currentPlayer === result.state.lastFortressHit.attacker &&
          isAiTurn({ ...result.state, currentPlayer: result.state.currentPlayer })
        ) {
          // human hit fortress — they play again; no AI
        }
      }
    },
    [aiThinking, runAiMove],
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

  const setSiegeMode = useCallback(
    (siegeMode: boolean) => patchSettings({ siegeMode }, true),
    [patchSettings],
  )

  const boardLocked = aiThinking || isAiTurn(game) || game.status !== 'in_progress'

  /** Own fortresses during setup; revealed hits always; never show intact enemy forts. */
  const visibleFortresses: number[] = (() => {
    if (!game.settings.siegeMode) return []
    const revealed = game.revealedFortresses ?? []
    if (game.phase === 'siege_setup') {
      const mine =
        game.settings.mode === 'vs_ai'
          ? game.fortresses[game.settings.humanPlayer] ?? []
          : game.fortresses[game.currentPlayer] ?? []
      return [...new Set([...mine, ...revealed])]
    }
    if (game.settings.mode === 'vs_ai') {
      const mine = game.fortresses[game.settings.humanPlayer] ?? []
      return [...new Set([...mine, ...revealed])]
    }
    // Local PvP: only show revealed (hits); intact forts stay secret on the shared screen.
    return [...revealed]
  })()

  return {
    game,
    aiThinking,
    boardLocked,
    settingsOpen,
    setSettingsOpen,
    visibleFortresses,
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
    setSiegeMode,
    patchSettings,
  }
}
