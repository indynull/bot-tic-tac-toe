import type { Scores } from '../game'
import styles from '../styles/ScoreBoard.module.css'

interface ScoreBoardProps {
  scores: Scores
}

export function ScoreBoard({ scores }: ScoreBoardProps) {
  return (
    <div className={styles.scores} aria-label="Session scores">
      <div className={styles.item}>
        <span className={styles.label}>X</span>
        <span className={styles.value}>{scores.X}</span>
      </div>
      <div className={styles.item}>
        <span className={styles.label}>Draws</span>
        <span className={styles.value}>{scores.draws}</span>
      </div>
      <div className={styles.item}>
        <span className={styles.label}>O</span>
        <span className={styles.value}>{scores.O}</span>
      </div>
    </div>
  )
}
