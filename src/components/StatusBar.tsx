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

  if (game.lastMineEvent) {
    const e = game.lastMineEvent
    const steal =
      e.capturedIndex !== null
        ? ` and took over one of ${e.stepper}'s marks`
        : ''
    return `Mine! ${e.stepper} hit ${e.owner}'s trap — ${e.owner} claims the cell${steal}. ${game.currentPlayer}'s turn.`
  }

  if (game.justPlantedMine) {
    const planter = game.currentPlayer === 'X' ? 'O' : 'X'
    return `${planter} planted a hidden mine (${game.minesRemaining[planter]} left for them). ${game.currentPlayer}'s turn.`
  }

  if (game.justGrew && game.previousBoardSize != null) {
    const from = game.previousBoardSize
    const to = game.boardSize
    const tier =
      game.settings.mode === 'vs_ai' ? ` · AI ${game.settings.difficulty}` : ''
    return `Board grew ${from}×${from} → ${to}×${to} (marks kept; ${winRuleLabel(to)} now)${tier} — ${game.currentPlayer}'s turn`
  }

  if (game.status === 'won' && game.winner) {
    if (game.settings.mode === 'vs_ai') {
      const humanWon = game.winner === game.settings.humanPlayer
      if (humanWon) return `You win! (${game.winner})`
      if (game.settings.difficulty === 'impossible') {
        return `Computer wins — as expected. (${game.winner})`
      }
      if (game.settings.difficulty === 'hard') {
        return `Computer wins — hard mode doesn't miss. (${game.winner})`
      }
      return `Computer wins! (${game.winner})`
    }
    return `${game.winner} wins!`
  }

  if (game.status === 'draw') {
    if (game.boardSize >= MAX_BOARD_SIZE) {
      return `It's a draw — max board (${MAX_BOARD_SIZE}×${MAX_BOARD_SIZE}); no further growth`
    }
    return "It's a draw"
  }

  const prefix = boardPrefix(game)
  const mineBit =
    game.settings.mineMode
      ? ` · 💣 ${game.minesRemaining[game.currentPlayer]} mine${game.minesRemaining[game.currentPlayer] === 1 ? '' : 's'} left`
      : ''
  if (game.settings.mode === 'local_pvp') {
    return `${prefix}${game.currentPlayer}'s turn${mineBit} — pass the device`
  }
  if (game.currentPlayer === game.settings.humanPlayer) {
    if (game.settings.difficulty === 'impossible') {
      return `${prefix}Your turn (${game.currentPlayer})${mineBit} — play perfectly or lose`
    }
    if (game.settings.difficulty === 'hard') {
      return `${prefix}Your turn (${game.currentPlayer})${mineBit} — one mistake and it's over`
    }
    return `${prefix}Your turn (${game.currentPlayer})${mineBit}`
  }
  return `${prefix}Computer's turn (${game.currentPlayer})`
}

export function StatusBar({ game, aiThinking }: StatusBarProps) {
  const message = getStatusMessage(game, aiThinking)
  const tone =
    game.status === 'won' ? styles.won : game.status === 'draw' ? styles.draw : styles.progress
  const live = game.justGrew ? 'assertive' : 'polite'

  return (
    <div className={`${styles.status} ${tone}`} role="status" aria-live={live} aria-atomic="true">
      {message}
    </div>
  )
}
