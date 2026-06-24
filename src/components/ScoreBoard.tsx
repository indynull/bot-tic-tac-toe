import type { Scores } from '../game'

interface ScoreBoardProps {
  scores: Scores
}

export function ScoreBoard({ scores }: ScoreBoardProps) {
  return (
    <div className="scores" aria-label="Session scores">
      <div className="scores__item">
        <span className="scores__label">X</span>
        <span className="scores__value">{scores.X}</span>
      </div>
      <div className="scores__item scores__item--draws">
        <span className="scores__label">Draws</span>
        <span className="scores__value">{scores.draws}</span>
      </div>
      <div className="scores__item">
        <span className="scores__label">O</span>
        <span className="scores__value">{scores.O}</span>
      </div>
    </div>
  )
}
