import { useEffect, useRef } from 'react'
import { Board } from './components/Board'
import { Controls } from './components/Controls'
import { ScoreBoard } from './components/ScoreBoard'
import { SettingsModal } from './components/SettingsModal'
import { StatusBar } from './components/StatusBar'
import { useGameController } from './hooks/useGameController'
import { useSound } from './hooks/useSound'
import appStyles from './styles/App.module.css'

export default function App() {
  const ctrl = useGameController()
  const { play } = useSound(ctrl.game.settings.soundEnabled)
  const prevStatus = useRef(ctrl.game.status)
  const prevHistoryLen = useRef(ctrl.game.moveHistory.length)

  useEffect(() => {
    const hist = ctrl.game.moveHistory.length
    if (hist > prevHistoryLen.current) {
      play('place')
    }
    prevHistoryLen.current = hist
  }, [ctrl.game.moveHistory.length, play])

  useEffect(() => {
    if (prevStatus.current === 'in_progress' && ctrl.game.status === 'won') {
      play('win')
    } else if (prevStatus.current === 'in_progress' && ctrl.game.status === 'draw') {
      play('draw')
    }
    prevStatus.current = ctrl.game.status
  }, [ctrl.game.status, play])

  return (
    <div className={appStyles.app}>
      <header className={appStyles.header}>
        <h1 className={appStyles.title}>Tic-Tac-Toe</h1>
        <p className={appStyles.tagline}>
          Local PvP &amp; vs computer — full boards grow in place (keep your marks)
          {ctrl.game.boardSize > 3 ? ` · now ${ctrl.game.boardSize}×${ctrl.game.boardSize}` : ''}
        </p>
      </header>

      <main className={appStyles.main}>
        <StatusBar game={ctrl.game} aiThinking={ctrl.aiThinking} />
        <ScoreBoard scores={ctrl.game.scores} />

        <Board
          board={ctrl.game.board}
          boardSize={ctrl.game.boardSize}
          winningLine={ctrl.game.winningLine}
          status={ctrl.game.status}
          disabled={ctrl.boardLocked}
          onCellClick={ctrl.placeMark}
        />

        <Controls
          game={ctrl.game}
          aiThinking={ctrl.aiThinking}
          onNewGame={ctrl.newGame}
          onUndo={ctrl.doUndo}
          onResetScores={ctrl.doResetScores}
          onModeChange={ctrl.setMode}
          onDifficultyChange={ctrl.setDifficulty}
          onOpenSettings={() => ctrl.setSettingsOpen(true)}
        />
      </main>

      <footer className={appStyles.footer}>
        <p>Keyboard: Tab to cells, Enter/Space to place. Scores &amp; settings save in this browser.</p>
      </footer>

      <SettingsModal
        open={ctrl.settingsOpen}
        settings={ctrl.game.settings}
        boardSize={ctrl.game.boardSize}
        onClose={() => ctrl.setSettingsOpen(false)}
        onFirstPlayer={ctrl.setFirstPlayer}
        onHumanPlayer={ctrl.setHumanPlayer}
        onTheme={ctrl.setTheme}
        onSound={ctrl.setSoundEnabled}
      />
    </div>
  )
}
