import type { GameState } from '../game'
import styles from '../styles/StatusBar.module.css'

interface StatusBarProps {
  game: GameState
  aiThinking: boolean
}

function aiThinkingMessage(difficulty: GameState['settings']['difficulty']): string {
  switch (difficulty) {
    case 'impossible':
      return 'Computer is calculating the optimal line…'
    case 'hard':
      return 'Computer is thinking deeply…'
    default:
      return 'Computer is thinking…'
  }
}

export function getStatusMessage(game: GameState, aiThinking: boolean): string {
  if (aiThinking) return aiThinkingMessage(game.settings.difficulty)
  if (game.status === 'won' && game.winner) {
    if (game.settings.mode === 'vs_ai') {
      const humanWon = game.winner === game.settings.humanPlayer
      if (humanWon) return `You win! (${game.winner})`
      if (game.settings.difficulty === 'impossible') {
        return `Computer wins — as expected. (${game.winner})`
      }
      return `Computer wins! (${game.winner})`
    }
    return `${game.winner} wins!`
  }
  if (game.status === 'draw') {
    if (game.settings.mode === 'vs_ai' && game.settings.difficulty === 'impossible') {
      return "Draw — best possible outcome vs impossible AI"
    }
    return "It's a draw"
  }
  if (game.settings.mode === 'local_pvp') {
    return `${game.currentPlayer}'s turn — pass the device`
  }
  if (game.currentPlayer === game.settings.humanPlayer) {
    if (game.settings.difficulty === 'impossible') {
      return `Your turn (${game.currentPlayer}) — play perfectly or lose`
    }
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
