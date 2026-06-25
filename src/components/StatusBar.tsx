import type { GameState } from '../game'
import { MAX_BOARD_SIZE, winRuleLabel } from '../game'
import styles from '../styles/StatusBar.module.css'

interface StatusBarProps {
  game: GameState
  aiThinking: boolean
}

function aiThinkingMessage(difficulty: GameState['settings']['difficulty']): string {
  switch (difficulty) {
    case 'impossible':
      return 'Computer is calculating…'
    case 'hard':
      return 'Computer is thinking deeply…'
    default:
      return 'Computer is thinking…'
  }
}

function boardPrefix(game: GameState): string {
  if (game.boardSize <= 3) return ''
  return `${game.boardSize}×${game.boardSize} · ${winRuleLabel(game.boardSize)} · `
}

export function getStatusMessage(game: GameState, aiThinking: boolean): string {
  if (aiThinking) return aiThinkingMessage(game.settings.difficulty)

  if (game.status === 'won' && game.winner) {
    const stay =
      game.boardSize > 3
        ? ` · still ${game.boardSize}×${game.boardSize} next game`
        : ''
    if (game.settings.mode === 'vs_ai') {
      const humanWon = game.winner === game.settings.humanPlayer
      if (humanWon) return `You win! (${game.winner})${stay}`
      if (game.settings.difficulty === 'impossible') {
        return `Computer wins — as expected. (${game.winner})${stay}`
      }
      if (game.settings.difficulty === 'hard') {
        return `Computer wins — hard mode doesn't miss. (${game.winner})${stay}`
      }
      return `Computer wins! (${game.winner})${stay}`
    }
    return `${game.winner} wins!${stay}`
  }

  if (game.status === 'draw') {
    if (game.ladderAdvanced && game.ladderSize > game.boardSize) {
      const tier =
        game.settings.mode === 'vs_ai'
          ? ` · AI now ${game.settings.difficulty}`
          : ''
      return `Draw — next game is ${game.ladderSize}×${game.ladderSize} (${winRuleLabel(game.ladderSize)})${tier}. Tap New game.`
    }
    if (game.boardSize >= MAX_BOARD_SIZE) {
      return "It's a draw — max board (7×7); ladder stays here"
    }
    return "It's a draw"
  }

  const prefix = boardPrefix(game)
  if (game.settings.mode === 'local_pvp') {
    return `${prefix}${game.currentPlayer}'s turn — pass the device`
  }
  if (game.currentPlayer === game.settings.humanPlayer) {
    if (game.settings.difficulty === 'impossible') {
      return `${prefix}Your turn (${game.currentPlayer}) — play perfectly or lose`
    }
    if (game.settings.difficulty === 'hard') {
      return `${prefix}Your turn (${game.currentPlayer}) — one mistake and it's over`
    }
    return `${prefix}Your turn (${game.currentPlayer})`
  }
  return `${prefix}Computer's turn (${game.currentPlayer})`
}

export function StatusBar({ game, aiThinking }: StatusBarProps) {
  const message = getStatusMessage(game, aiThinking)
  const tone =
    game.status === 'won' ? styles.won : game.status === 'draw' ? styles.draw : styles.progress
  const live = game.ladderAdvanced ? 'assertive' : 'polite'

  return (
    <div className={`${styles.status} ${tone}`} role="status" aria-live={live} aria-atomic="true">
      {message}
    </div>
  )
}
