import type { BoardSize, Cell, GamePhase, Player } from '../game'
import { indexToRowCol } from '../game'
import styles from '../styles/Board.module.css'

interface BoardProps {
  board: Cell[]
  boardSize: BoardSize
  winningLine: number[] | null
  status: 'in_progress' | 'won' | 'draw'
  phase?: GamePhase
  disabled: boolean
  onCellClick: (index: number) => void
  /** Fortress indices visible to this client (own + revealed hits). */
  fortresses?: number[]
  /** Cells that were hit (show as ruined fort under/near mark). */
  revealedFortresses?: number[]
}

function cellLabel(
  index: number,
  value: Cell,
  boardSize: BoardSize,
  hasFort: boolean,
  setup: boolean,
): string {
  const { row, col } = indexToRowCol(index, boardSize)
  const pos = `Row ${row + 1}, column ${col + 1}`
  if (value !== null) return hasFort ? `${pos}, ${value}, fortress hit` : `${pos}, ${value}`
  if (hasFort && setup) return `${pos}, your fortress`
  if (hasFort) return `${pos}, fortress`
  if (setup) return `${pos}, empty, place fortress`
  return `${pos}, empty`
}

export function Board({
  board,
  boardSize,
  winningLine,
  status,
  phase = 'playing',
  disabled,
  onCellClick,
  fortresses = [],
  revealedFortresses = [],
}: BoardProps) {
  const winSet = new Set(winningLine ?? [])
  const fortSet = new Set(fortresses)
  const revealedSet = new Set(revealedFortresses)
  const isDraw = status === 'draw'
  const setup = phase === 'siege_setup'
  const sizeClass =
    boardSize === 3
      ? styles.size3
      : boardSize === 4
        ? styles.size4
        : boardSize === 5
          ? styles.size5
          : boardSize === 6
            ? styles.size6
            : boardSize === 7
              ? styles.size7
              : boardSize === 8
                ? styles.size8
                : styles.size9

  return (
    <div
      className={`${styles.board} ${sizeClass} ${isDraw ? styles.drawBoard : ''} ${setup ? styles.siegeSetup : ''}`}
      role="grid"
      aria-label={`Tic-tac-toe board ${boardSize} by ${boardSize}${setup ? ', fortress setup' : ''}`}
      style={{ ['--board-n' as string]: boardSize }}
    >
      {board.map((cell, index) => {
        const isWin = winSet.has(index)
        const occupied = cell !== null
        // Setup: fortresses don't occupy the board array — block re-clicks via fort set in parent legal moves
        const hasFort = fortSet.has(index)
        const wasHit = revealedSet.has(index)
        const canPlay = !disabled && !occupied && !(setup && hasFort)
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
              hasFort && setup ? styles.fortressOwn : '',
              wasHit ? styles.fortressHit : '',
            ]
              .filter(Boolean)
              .join(' ')}
            aria-label={cellLabel(index, cell, boardSize, hasFort || wasHit, setup)}
            aria-disabled={!canPlay}
            disabled={!canPlay}
            onClick={() => canPlay && onCellClick(index)}
          >
            {cell ? (
              <span className={styles.mark} aria-hidden="true">
                {cell}
              </span>
            ) : hasFort && setup ? (
              <span className={styles.fortMark} aria-hidden="true">
                🏰
              </span>
            ) : null}
            {wasHit && cell ? (
              <span className={styles.fortBadge} aria-hidden="true">
                💥
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}

export function playerDisplay(p: Player): string {
  return p
}
