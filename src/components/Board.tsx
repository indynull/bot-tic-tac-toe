import type { Cell, GameStatus } from '../game'
import { indexToRowCol } from '../game'

interface BoardProps {
  board: Cell[]
  winningLine: number[] | null
  status: GameStatus
  disabled: boolean
  onCellActivate: (index: number) => void
}

function cellLabel(index: number, value: Cell): string {
  const { row, col } = indexToRowCol(index)
  const pos = `Row ${row + 1}, column ${col + 1}`
  if (value === null) return `${pos}, empty`
  return `${pos}, ${value}`
}

export function Board({ board, winningLine, status, disabled, onCellActivate }: BoardProps) {
  const winSet = new Set(winningLine ?? [])

  return (
    <div
      className={`board${status === 'draw' ? ' board--draw' : ''}${status === 'won' ? ' board--won' : ''}`}
      role="grid"
      aria-label="Tic-tac-toe board"
    >
      {board.map((cell, index) => {
        const isWin = winSet.has(index)
        const isEmpty = cell === null
        const canPlay = !disabled && isEmpty

        return (
          <button
            key={index}
            type="button"
            role="gridcell"
            className={[
              'cell',
              cell === 'X' ? 'cell--x' : '',
              cell === 'O' ? 'cell--o' : '',
              isWin ? 'cell--win' : '',
              !isEmpty ? 'cell--filled' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            aria-label={cellLabel(index, cell)}
            aria-disabled={!canPlay}
            disabled={!canPlay}
            onClick={() => {
              if (canPlay) onCellActivate(index)
            }}
          >
            {cell ? <span className="cell__mark" aria-hidden="true">{cell}</span> : null}
          </button>
        )
      })}
    </div>
  )
}
