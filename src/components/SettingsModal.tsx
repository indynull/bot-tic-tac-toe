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
              AI strength: {aiPolicyNote(boardSize, settings.difficulty)}. Hard/impossible are
              optimal only on 3×3; larger boards use fast tactical play so replies stay under 1s. A
              draw unlocks a larger empty board next game and tiers difficulty up one step (if not
              already impossible).
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
