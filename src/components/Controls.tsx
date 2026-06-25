import type { Difficulty, GameMode, GameState } from '../game'
import styles from '../styles/Controls.module.css'

interface ControlsProps {
  game: GameState
  aiThinking: boolean
  onNewGame: () => void
  onUndo: () => void
  onResetScores: () => void
  onModeChange: (mode: GameMode) => void
  onDifficultyChange: (d: Difficulty) => void
  onOpenSettings: () => void
}

export function Controls({
  game,
  aiThinking,
  onNewGame,
  onUndo,
  onResetScores,
  onModeChange,
  onDifficultyChange,
  onOpenSettings,
}: ControlsProps) {
  const canUndo = game.moveHistory.length > 0 && !aiThinking

  return (
    <div className={styles.controls}>
      <div className={styles.row}>
        <label className={styles.field}>
          <span>Mode</span>
          <select
            value={game.settings.mode}
            onChange={(e) => onModeChange(e.target.value as GameMode)}
            aria-label="Game mode"
          >
            <option value="local_pvp">Local PvP</option>
            <option value="vs_ai">Vs Computer</option>
          </select>
        </label>

        {game.settings.mode === 'vs_ai' && (
          <label className={styles.field}>
            <span>Difficulty</span>
            <select
              value={game.settings.difficulty}
              onChange={(e) => onDifficultyChange(e.target.value as Difficulty)}
              aria-label="AI difficulty"
            >
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
              <option value="impossible">Impossible</option>
            </select>
          </label>
        )}
      </div>

      <div className={styles.actions}>
        <button type="button" className={styles.primary} onClick={onNewGame}>
          {game.ladderAdvanced && game.ladderSize > game.boardSize
            ? `New game (${game.ladderSize}×${game.ladderSize})`
            : 'New game'}
        </button>
        <button type="button" onClick={onUndo} disabled={!canUndo}>
          Undo
        </button>
        <button type="button" onClick={onResetScores} title="Clear scores and return to 3×3">
          Reset ladder
        </button>
        <button type="button" onClick={onOpenSettings}>
          Settings
        </button>
      </div>
    </div>
  )
}
