import type { GameState } from '../game'

interface StatusBarProps {
  state: GameState
  aiThinking: boolean
}

export function statusMessage(state: GameState, aiThinking: boolean): string {
  if (aiThinking) return 'Computer is thinking…'
  if (state.status === 'won' && state.winner) {
    if (state.settings.mode === 'vs_ai') {
      const humanWon = state.winner === state.settings.humanPlayer
      return humanWon ? `You win! (${state.winner})` : `Computer wins! (${state.winner})`
    }
    return `${state.winner} wins!`
  }
  if (state.status === 'draw') return "It's a draw"
  if (state.settings.mode === 'vs_ai') {
    const isHuman = state.currentPlayer === state.settings.humanPlayer
    return isHuman ? `Your turn (${state.currentPlayer})` : `Computer's turn (${state.currentPlayer})`
  }
  return `${state.currentPlayer}'s turn`
}

export function StatusBar({ state, aiThinking }: StatusBarProps) {
  const message = statusMessage(state, aiThinking)
  const passCue =
    state.settings.mode === 'local_pvp' &&
    state.status === 'in_progress' &&
    state.moveHistory.length > 0 &&
    !aiThinking

  return (
    <div className="status-bar" role="status" aria-live="polite" aria-atomic="true">
      <p className="status-bar__main">{message}</p>
      {passCue ? <p className="status-bar__hint">Pass the device if needed</p> : null}
    </div>
  )
}
