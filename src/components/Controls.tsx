import type { Difficulty, GameMode, GameState, Player, Theme } from '../game'

interface ControlsProps {
  state: GameState
  onNewGame: () => void
  onResetScores: () => void
  onUndo: () => void
  onModeChange: (mode: GameMode) => void
  onDifficultyChange: (d: Difficulty) => void
  onThemeChange: (t: Theme) => void
  onSoundChange: (enabled: boolean) => void
  onFirstPlayerChange: (p: Player) => void
  onHumanPlayerChange: (p: Player) => void
}

export function Controls({
  state,
  onNewGame,
  onResetScores,
  onUndo,
  onModeChange,
  onDifficultyChange,
  onThemeChange,
  onSoundChange,
  onFirstPlayerChange,
  onHumanPlayerChange,
}: ControlsProps) {
  const { settings } = state
  const canUndo = state.moveHistory.length > 0

  return (
    <section className="controls" aria-label="Game controls">
      <div className="controls__actions">
        <button type="button" className="btn btn--primary" onClick={onNewGame}>
          New game
        </button>
        <button type="button" className="btn" onClick={onUndo} disabled={!canUndo}>
          Undo
        </button>
        <button type="button" className="btn btn--danger" onClick={onResetScores}>
          Reset scores
        </button>
      </div>

      <div className="controls__field">
        <label htmlFor="mode-select">Mode</label>
        <select
          id="mode-select"
          value={settings.mode}
          onChange={(e) => onModeChange(e.target.value as GameMode)}
        >
          <option value="local_pvp">Local PvP</option>
          <option value="vs_ai">Vs computer</option>
        </select>
      </div>

      {settings.mode === 'vs_ai' ? (
        <>
          <div className="controls__field">
            <label htmlFor="difficulty-select">Difficulty</label>
            <select
              id="difficulty-select"
              value={settings.difficulty}
              onChange={(e) => onDifficultyChange(e.target.value as Difficulty)}
            >
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </div>
          <div className="controls__field">
            <label htmlFor="side-select">Play as</label>
            <select
              id="side-select"
              value={settings.humanPlayer}
              onChange={(e) => onHumanPlayerChange(e.target.value as Player)}
            >
              <option value="X">X (usually first)</option>
              <option value="O">O</option>
            </select>
          </div>
        </>
      ) : null}

      <div className="controls__field">
        <label htmlFor="first-select">First player</label>
        <select
          id="first-select"
          value={settings.firstPlayer}
          onChange={(e) => onFirstPlayerChange(e.target.value as Player)}
        >
          <option value="X">X</option>
          <option value="O">O</option>
        </select>
      </div>

      <div className="controls__field">
        <label htmlFor="theme-select">Theme</label>
        <select
          id="theme-select"
          value={settings.theme}
          onChange={(e) => onThemeChange(e.target.value as Theme)}
        >
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </div>

      <div className="controls__field controls__field--checkbox">
        <input
          id="sound-toggle"
          type="checkbox"
          checked={settings.soundEnabled}
          onChange={(e) => onSoundChange(e.target.checked)}
        />
        <label htmlFor="sound-toggle">Sound effects</label>
      </div>
    </section>
  )
}
