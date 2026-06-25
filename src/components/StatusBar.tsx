import type { GameState } from '../game'
import { aiPolicyNote } from '../game'
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
  if (game.justGrew && game.previousBoardSize != null) {
    const from = game.previousBoardSize
    const to = game.boardSize
    const tier =
      game.settings.mode === 'vs_ai' && from <= 3
        ? ` · AI tier up (${game.settings.difficulty})`
        : game.settings.mode === 'vs_ai' && to >= 4
          ? ` · ${aiPolicyNote(to, game.settings.difficulty)}`
          : ''
    return `Board grew ${from}×${from} → ${to}×${to} (marks kept, top-left; ${game.winLength} in a row now)${tier} — ${game.currentPlayer}'s turn`
  }
  if (game.status === 'won' && game.winner) {
    if (game.settings.mode === 'vs_ai') {
      const humanWon = game.winner === game.settings.humanPlayer
      if (humanWon) return `You win! (${game.winner})`
      if (game.settings.difficulty === 'impossible' && game.boardSize <= 3) {
        return `Computer wins — as expected. (${game.winner})`
      }
      return `Computer wins! (${game.winner})`
    }
    return `${game.winner} wins!`
  }
  if (game.status === 'draw') {
    if (game.boardSize >= 7) {
      return "It's a draw — max board size (7×7); no further growth"
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
  // Assertive when the grid size just changed so screen readers announce growth
  const live = game.justGrew ? 'assertive' : 'polite'

  return (
    <div className={`${styles.status} ${tone}`} role="status" aria-live={live} aria-atomic="true">
      {message}
    </div>
  )
}
