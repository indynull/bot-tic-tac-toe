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
      if (game.pendingEscalation && game.boardSize < 7) {
        return `Draw — best possible outcome vs impossible AI (next: ${game.boardSize + 1}×${game.boardSize + 1})`
      }
      return "Draw — best possible outcome vs impossible AI"
    }
    if (game.pendingEscalation && game.boardSize < 7) {
      const next = game.boardSize + 1
      if (game.settings.mode === 'vs_ai' && game.boardSize <= 4) {
        return `It's a draw — New game → ${next}×${next} (AI tier up)`
      }
      if (game.settings.mode === 'vs_ai') {
        return `It's a draw — New game → ${next}×${next} (same AI tier; depth-limited on large boards)`
      }
      return `It's a draw — New game → ${next}×${next}`
    }
    if (game.pendingEscalation && game.boardSize >= 7) {
      return "It's a draw — max board size reached"
    }
    return "It's a draw"
  }
  if (game.boardSize > 3) {
    const prefix = `${game.boardSize}×${game.boardSize} · ${game.winLength} in a row · `
    if (game.settings.mode === 'local_pvp') {
      return `${prefix}${game.currentPlayer}'s turn — pass the device`
    }
    if (game.currentPlayer === game.settings.humanPlayer) {
      return `${prefix}Your turn (${game.currentPlayer})`
    }
    return `${prefix}Computer's turn (${game.currentPlayer})`
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
