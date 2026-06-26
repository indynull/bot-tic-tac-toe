import type { BoardSize, Player, Settings, Theme } from '../game'
import { aiPolicyNote } from '../game'
import styles from '../styles/SettingsModal.module.css'

interface SettingsModalProps {
  open: boolean
  settings: Settings
  /** Current ladder size — AI labels are only fully accurate on 3×3. */
  boardSize?: BoardSize
  onClose: () => void
  onFirstPlayer: (p: Player) => void
  onHumanPlayer: (p: Player) => void
  onTheme: (t: Theme) => void
  onSound: (enabled: boolean) => void
  onMineMode: (enabled: boolean) => void
}

export function SettingsModal({
  open,
  settings,
  boardSize = 3,
  onClose,
  onFirstPlayer,
  onHumanPlayer,
  onTheme,
  onSound,
  onMineMode,
}: SettingsModalProps) {
  if (!open) return null

  return (
    <div className={styles.overlay} role="presentation" onClick={onClose}>
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className={styles.header}>
          <h2 id="settings-title">Settings</h2>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Close settings">
            ×
          </button>
        </header>

        <div className={styles.body}>
          <label className={styles.field}>
            <span>First player (opens the game)</span>
            <select
              value={settings.firstPlayer}
              onChange={(e) => onFirstPlayer(e.target.value as Player)}
            >
              <option value="X">X</option>
              <option value="O">O</option>
            </select>
          </label>

          {settings.mode === 'vs_ai' && (
            <label className={styles.field}>
              <span>Play as (vs computer)</span>
              <select
                value={settings.humanPlayer}
                onChange={(e) => onHumanPlayer(e.target.value as Player)}
              >
                <option value="X">X (you go first if first player is X)</option>
                <option value="O">O (computer may open)</option>
              </select>
            </label>
          )}

          {settings.mode === 'vs_ai' && (
            <p className={styles.hint} role="note">
              AI strength: {aiPolicyNote(boardSize, settings.difficulty)}. Fully optimal only on
              3×3; on larger boards hard is tactical and impossible uses timed minimax (≤200ms).
              Full boards grow in place (marks kept, new empty ring) until 9×9 (5-in-a-row from
              6×6 up); vs-AI tiers up one step on growth when possible.
            </p>
          )}

          <label className={styles.field}>
            <span>Theme</span>
            <select value={settings.theme} onChange={(e) => onTheme(e.target.value as Theme)}>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>

          <label className={styles.check}>
            <input
              type="checkbox"
              checked={settings.soundEnabled}
              onChange={(e) => onSound(e.target.checked)}
            />
            <span>Sound effects</span>
          </label>

          <label className={styles.check}>
            <input
              type="checkbox"
              checked={settings.mineMode}
              onChange={(e) => onMineMode(e.target.checked)}
            />
            <span>Mine mode (crazy)</span>
          </label>
          {settings.mineMode && (
            <p className={styles.hint} role="note">
              Each side gets 2 hidden mines per game. Planting uses your turn (toggle “Plant mine”
              under the board). If the opponent steps on <strong>your</strong> mine, <strong>you</strong>{' '}
              get that cell and may convert one of <strong>their</strong> marks — they wasted the turn.
              Starts a new game when toggled.
            </p>
          )}
        </div>

        <footer className={styles.footer}>
          <button type="button" className={styles.primary} onClick={onClose}>
            Done
          </button>
        </footer>
      </div>
    </div>
  )
}
