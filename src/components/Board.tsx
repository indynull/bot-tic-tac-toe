import type { Cell, Player } from '../game'
import { indexToRowCol } from '../game'
import styles from '../styles/Board.module.css'

interface BoardProps {
  board: Cell[]
  winningLine: number[] | null
  status: 'in_progress' | 'won' | 'draw'
  disabled: boolean
  onCellClick: (index: number) => void
}

function cellLabel(index: number, value: Cell): string {
  const { row, col } = indexToRowCol(index)
  const pos = `Row ${row + 1}, column ${col + 1}`
  if (value === null) return `${pos}, empty`
  return `${pos}, ${value}`
}

export function Board({ board, winningLine, status, disabled, onCellClick }: BoardProps) {
  const winSet = new Set(winningLine ?? [])
  const isDraw = status === 'draw'

  return (
    <div
      className={`${styles.board} ${isDraw ? styles.drawBoard : ''}`}
      role="grid"
      aria-label="Tic-tac-toe board"
    >
      {board.map((cell, index) => {
        const isWin = winSet.has(index)
        const occupied = cell !== null
        const canPlay = !disabled && !occupied
        return (
          <button
            key={index}
            type="button"
            role="gridcell"
            className={[
              styles.cell,
              isWin ? styles.winning : '',
              occupied ? styles.occupied : '',
              cell === 'X' ? styles.markX : '',
              cell === 'O' ? styles.markO : '',
            ]
              .filter(Boolean)
              .join(' ')}
            aria-label={cellLabel(index, cell)}
            aria-disabled={!canPlay}
            disabled={!canPlay}
            onClick={() => canPlay && onCellClick(index)}
          >
            {cell ? <span className={styles.mark} aria-hidden="true">{cell}</span> : null}
          </button>
        )
      })}
    </div>
  )
}

export function playerDisplay(p: Player): string {
  return p
}
