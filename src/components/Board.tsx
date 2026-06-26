import type { BoardSize, Cell, MineMap, Player } from '../game'
import { indexToRowCol } from '../game'
import styles from '../styles/Board.module.css'

interface BoardProps {
  board: Cell[]
  boardSize: BoardSize
  winningLine: number[] | null
  status: 'in_progress' | 'won' | 'draw'
  disabled: boolean
  onCellClick: (index: number) => void
  /** Hidden mines — only show cells owned by `visibleMineOwner` (current human / both in PvP). */
  mines?: MineMap
  visibleMineOwner?: Player | 'both' | null
  /** When true, click plants a mine instead of placing a mark. */
  plantMode?: boolean
}

function cellLabel(
  index: number,
  value: Cell,
  boardSize: BoardSize,
  hasOwnMine: boolean,
  plantMode: boolean,
): string {
  const { row, col } = indexToRowCol(index, boardSize)
  const pos = `Row ${row + 1}, column ${col + 1}`
  if (value !== null) return `${pos}, ${value}`
  if (hasOwnMine) return `${pos}, your mine`
  if (plantMode) return `${pos}, empty, plant mine`
  return `${pos}, empty`
}

export function Board({
  board,
  boardSize,
  winningLine,
  status,
  disabled,
  onCellClick,
  mines = {},
  visibleMineOwner = null,
  plantMode = false,
}: BoardProps) {
  const winSet = new Set(winningLine ?? [])
  const isDraw = status === 'draw'
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
      className={`${styles.board} ${sizeClass} ${isDraw ? styles.drawBoard : ''} ${plantMode ? styles.plantMode : ''}`}
      role="grid"
      aria-label={`Tic-tac-toe board ${boardSize} by ${boardSize}`}
      style={{ ['--board-n' as string]: boardSize }}
    >
      {board.map((cell, index) => {
        const isWin = winSet.has(index)
        const occupied = cell !== null
        const mineOwner = mines[index]
        const showMine =
          mineOwner !== undefined &&
          (visibleMineOwner === 'both' || visibleMineOwner === mineOwner)
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
              showMine ? styles.mined : '',
            ]
              .filter(Boolean)
              .join(' ')}
            aria-label={cellLabel(index, cell, boardSize, showMine, plantMode && canPlay)}
            aria-disabled={!canPlay}
            disabled={!canPlay}
            onClick={() => canPlay && onCellClick(index)}
          >
            {cell ? (
              <span className={styles.mark} aria-hidden="true">
                {cell}
              </span>
            ) : showMine ? (
              <span className={styles.mineMark} aria-hidden="true">
                💣
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
