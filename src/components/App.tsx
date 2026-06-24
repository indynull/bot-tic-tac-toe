import { useGame } from '../state/useGame'
import { Board } from './Board'
import { Controls } from './Controls'
import { ScoreBoard } from './ScoreBoard'
import { StatusBar } from './StatusBar'

export function App() {
  const game = useGame()
  const { state, aiThinking, boardLocked, playCell } = game

  return (
    <div className="app">
      <header className="app__header">
        <h1 className="app__title">Tic-Tac-Toe</h1>
        <p className="app__tagline">Local pass-and-play or challenge the computer</p>
      </header>

      <main className="app__main">
        <StatusBar state={state} aiThinking={aiThinking} />
        <ScoreBoard scores={state.scores} />

        <Board
          board={state.board}
          winningLine={state.winningLine}
          status={state.status}
          disabled={boardLocked}
          onCellActivate={playCell}
        />

        <Controls
          state={state}
          onNewGame={game.newGame}
          onResetScores={game.resetScores}
          onUndo={game.undo}
          onModeChange={game.setMode}
          onDifficultyChange={game.setDifficulty}
          onThemeChange={game.setTheme}
          onSoundChange={game.setSoundEnabled}
          onFirstPlayerChange={game.setFirstPlayer}
          onHumanPlayerChange={game.setHumanPlayer}
        />
      </main>

      <footer className="app__footer">
        <p>Keyboard: Tab to a cell, Enter or Space to place a mark.</p>
      </footer>
    </div>
  )
}
