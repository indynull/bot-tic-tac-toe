import type { GameState } from '../game'
import styles from '../styles/StatusBar.module.css'

interface StatusBarProps {
  game: GameState
  aiThinking: boolean
}

export function getStatusMessage(game: GameState, aiThinking: boolean): string {
  if (aiThinking) return 'Computer is thinking…'
  if (game.status === 'won' && game.winner) {
    if (game.settings.mode === 'vs_ai') {
      const humanWon = game.winner === game.settings.humanPlayer
      return humanWon ? `You win! (${game.winner})` : `Computer wins! (${game.winner})`
    }
    return `${game.winner} wins!`
  }
  if (game.status === 'draw') return "It's a draw"
  if (game.settings.mode === 'local_pvp') {
    return `${game.currentPlayer}'s turn — pass the device`
  }
  if (game.currentPlayer === game.settings.humanPlayer) {
    return `Your turn (${game.currentPlayer})`
  }
  return `Computer's turn (${game.currentPlayer})`
}

export function StatusBar({ game, aiThinking }: StatusBarProps) {
  const message = getStatusMessage(game, aiThinking)
  const tone =
    game.status === 'won' ? styles.won : game.status === 'draw' ? styles.draw : styles.progress

  return (
    <div className={`${styles.status} ${tone}`} role="status" aria-live="polite" aria-atomic="true">
      {message}
    </div>
  )
}
