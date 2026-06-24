import { useCallback, useEffect, useRef, useState } from 'react'
import {
  applyMove,
  chooseMove,
  createGame,
  isAiTurn,
  resetGame,
  resetScores,
  undoLastHumanTurn,
  type Difficulty,
  type GameMode,
  type GameState,
  type Player,
  type Settings,
  type Theme,
} from '../game'
import { playDrawSound, playPlaceSound, playWinSound } from '../utils/sound'
import { buildInitialScores, buildInitialSettings, saveSession } from '../utils/storage'

const AI_DELAY_MS = 450

export function useGame() {
  const [state, setState] = useState<GameState>(() =>
    createGame({
      ...buildInitialSettings(),
      scores: buildInitialScores(),
    }),
  )
  const [aiThinking, setAiThinking] = useState(false)
  const aiTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const aiGenerationRef = useRef(0)
  const stateRef = useRef(state)
  stateRef.current = state

  const clearAiTimer = useCallback(() => {
    aiGenerationRef.current += 1
    if (aiTimerRef.current !== null) {
      clearTimeout(aiTimerRef.current)
      aiTimerRef.current = null
    }
    setAiThinking(false)
  }, [])

  const persist = useCallback((next: GameState) => {
    saveSession(next.scores, next.settings)
  }, [])

  const commit = useCallback(
    (next: GameState, opts?: { sound?: 'place' | 'win' | 'draw' | 'none' }) => {
      setState(next)
      persist(next)
      const sound = opts?.sound ?? 'none'
      if (sound === 'place') playPlaceSound(next.settings.soundEnabled)
      if (sound === 'win') playWinSound(next.settings.soundEnabled)
      if (sound === 'draw') playDrawSound(next.settings.soundEnabled)
    },
    [persist],
  )

  // Drive AI turns from a single effect keyed by turn identity.
  useEffect(() => {
    if (!isAiTurn(state)) {
      if (aiTimerRef.current !== null) {
        clearTimeout(aiTimerRef.current)
        aiTimerRef.current = null
      }
      setAiThinking(false)
      return
    }

    const generation = ++aiGenerationRef.current
    setAiThinking(true)

    aiTimerRef.current = setTimeout(() => {
      aiTimerRef.current = null
      if (generation !== aiGenerationRef.current) return

      const current = stateRef.current
      if (!isAiTurn(current)) {
        setAiThinking(false)
        return
      }

      try {
        const idx = chooseMove(current, current.settings.difficulty)
        const result = applyMove(current, idx)
        if (!result.ok) {
          setAiThinking(false)
          return
        }
        let sound: 'place' | 'win' | 'draw' = 'place'
        if (result.state.status === 'won') sound = 'win'
        else if (result.state.status === 'draw') sound = 'draw'
        commit(result.state, { sound })
      } finally {
        if (generation === aiGenerationRef.current) {
          setAiThinking(false)
        }
      }
    }, AI_DELAY_MS)

    return () => {
      // Invalidate this scheduled move on re-run / unmount (StrictMode safe).
      aiGenerationRef.current += 1
      if (aiTimerRef.current !== null) {
        clearTimeout(aiTimerRef.current)
        aiTimerRef.current = null
      }
    }
  }, [
    state.board.join(','),
    state.currentPlayer,
    state.status,
    state.settings.mode,
    state.settings.humanPlayer,
    state.settings.difficulty,
    commit,
  ])

  useEffect(() => {
    document.documentElement.dataset.theme = state.settings.theme
  }, [state.settings.theme])

  const playCell = useCallback(
    (cellIndex: number) => {
      const current = stateRef.current
      if (aiThinking || isAiTurn(current)) return
      if (current.status !== 'in_progress') return

      const result = applyMove(current, cellIndex)
      if (!result.ok) return

      let sound: 'place' | 'win' | 'draw' = 'place'
      if (result.state.status === 'won') sound = 'win'
      else if (result.state.status === 'draw') sound = 'draw'
      commit(result.state, { sound })
    },
    [aiThinking, commit],
  )

  const newGame = useCallback(() => {
    clearAiTimer()
    const current = stateRef.current
    const next = resetGame(current, { preserveScores: true, preserveSettings: true })
    commit(next)
  }, [clearAiTimer, commit])

  const doResetScores = useCallback(() => {
    const current = stateRef.current
    const next = resetScores(current)
    commit(next)
  }, [commit])

  const undo = useCallback(() => {
    clearAiTimer()
    const current = stateRef.current
    const next = undoLastHumanTurn(current)
    commit(next)
  }, [clearAiTimer, commit])

  const patchSettings = useCallback(
    (patch: Partial<Settings>, opts?: { restart?: boolean }) => {
      clearAiTimer()
      const current = stateRef.current
      const settings = { ...current.settings, ...patch }
      const restart = opts?.restart ?? false
      const midGame = current.moveHistory.length > 0 && current.status === 'in_progress'

      if (
        restart ||
        (midGame &&
          (patch.mode !== undefined ||
            patch.humanPlayer !== undefined ||
            patch.firstPlayer !== undefined))
      ) {
        const next = resetGame(current, { preserveScores: true, settings })
        commit(next)
        return
      }

      const next = { ...current, settings }
      commit(next)
    },
    [clearAiTimer, commit],
  )

  const setMode = useCallback(
    (mode: GameMode) => patchSettings({ mode }, { restart: true }),
    [patchSettings],
  )
  const setDifficulty = useCallback(
    (difficulty: Difficulty) => patchSettings({ difficulty }),
    [patchSettings],
  )
  const setTheme = useCallback((theme: Theme) => patchSettings({ theme }), [patchSettings])
  const setSoundEnabled = useCallback(
    (soundEnabled: boolean) => patchSettings({ soundEnabled }),
    [patchSettings],
  )
  const setFirstPlayer = useCallback(
    (firstPlayer: Player) => patchSettings({ firstPlayer }, { restart: true }),
    [patchSettings],
  )
  const setHumanPlayer = useCallback(
    (humanPlayer: Player) => patchSettings({ humanPlayer }, { restart: true }),
    [patchSettings],
  )

  const boardLocked = aiThinking || isAiTurn(state) || state.status !== 'in_progress'

  return {
    state,
    aiThinking,
    boardLocked,
    playCell,
    newGame,
    resetScores: doResetScores,
    undo,
    setMode,
    setDifficulty,
    setTheme,
    setSoundEnabled,
    setFirstPlayer,
    setHumanPlayer,
    patchSettings,
  }
}
