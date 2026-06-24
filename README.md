# Tic-Tac-Toe

A polished browser tic-tac-toe game: local pass-and-play or human vs computer (easy / medium / hard), with scores, themes, keyboard support, and a pure TypeScript game engine covered by unit tests.

## Features

- Classic 3×3 tic-tac-toe (no backend required)
- **Local PvP** — pass-and-play on one device
- **Vs computer** — easy (random-ish), medium (win/block heuristics), hard (minimax + alpha-beta, optimal on 3×3)
- Win / draw / in-progress states with winning-line highlight
- Session scores (X / O / draws) persisted in `localStorage`
- Settings: first player, play as X or O (vs AI), difficulty, light/dark theme, optional sound
- Undo (in vs AI, undoes human + AI pair when applicable)
- Responsive layout (~360px phones through desktop)
- Keyboard + mouse/touch; accessible names and live status region
- Subtle animations (respects `prefers-reduced-motion`)

## Stack

| Layer | Choice |
|-------|--------|
| UI | React 19 + TypeScript |
| Build | Vite 6 |
| Styles | Plain CSS (CSS variables, light/dark themes) |
| Tests | Vitest |
| State | React `useState` hook orchestrating pure engine calls |

## Prerequisites

- **Node.js** 20+ recommended (18+ should work)
- npm 10+ (ships with recent Node)

## Install / run / build / test

```bash
# Install dependencies
npm install

# Development server (hot reload)
npm run dev

# Production build → dist/
npm run build

# Preview production build locally
npm run preview

# Unit tests
npm test

# Typecheck only
npm run lint
```

Open the URL printed by `npm run dev` (usually `http://localhost:5173`).

## Architecture

```
src/
  game/          # Pure engine — no DOM imports
    types.ts     # Cell, Player, GameState, Settings, …
    board.ts     # 9-cell row-major board helpers, win lines
    evaluate.ts  # Win / draw detection
    engine.ts    # createGame, applyMove, reset, undo, legal moves
    ai.ts        # chooseMove(easy|medium|hard), minimax
  state/
    useGame.ts   # React hook: UI events → engine; AI delay; persistence
  components/    # Presentational React UI
  utils/         # localStorage session, optional Web Audio beeps
  styles/        # global.css themes and layout
tests/           # Vitest unit tests for engine, AI, storage
```

**Board representation:** fixed-length array of 9 cells (`null | 'X' | 'O'`), row-major order (`0..2` top row, `3..5` middle, `6..8` bottom). Updates are immutable (new arrays / state objects).

**Rules live in the engine.** The UI never decides wins or legal moves; it calls `applyMove` / `chooseMove` and renders the returned state.

**AI:** Hard uses full minimax with alpha-beta on the tiny 3×3 tree (correctness over optimization). Medium prioritizes winning and blocking, then center/corners. Easy picks mostly at random so humans can win.

## Rules (brief)

1. Players alternate placing **X** and **O** on empty cells.
2. **X** starts unless Settings → First player says otherwise.
3. First to complete a row, column, or diagonal wins.
4. Full board with no line → draw.
5. No moves after a win or draw (New game starts a fresh board).

## Accessibility

- Board cells are **buttons** with names like “Row 1, column 2, empty” / “X”.
- Status uses **`aria-live="polite"`** for turn / winner / “Computer is thinking…”.
- Full **keyboard** play: Tab to cells and controls; **Enter** or **Space** places a mark.
- Visible focus rings; win indicated by text status **and** highlight pattern (not color alone).
- During AI turn or after game over, playable cells are disabled/inert.

## Persistence

Scores and settings are stored under key `ttt-session-v1` in `localStorage`. Corrupt or missing data falls back to defaults without crashing.

## Manual QA checklist

Use after `npm run dev` (or `preview`):

1. [ ] PvP: play to X wins / O wins / draw
2. [ ] Vs AI easy / medium / hard — at least one game each
3. [ ] Play as O (AI opens)
4. [ ] New game, reset scores, undo (incl. after AI reply)
5. [ ] Refresh: scores + theme/settings restore
6. [ ] Theme toggle light ↔ dark
7. [ ] Layout at ~360px width and ~1280px width
8. [ ] Keyboard-only PvP game
9. [ ] Rapid / double-click cells (no illegal marks / no crash)
10. [ ] Start new game while “Computer is thinking…”

## Known limitations / not implemented

- No online multiplayer, accounts, or ads
- Board size fixed at 3×3 (no 4×4 stretch)
- No Playwright e2e suite (unit tests only)
- Sound uses Web Audio oscillators; blocked autoplay fails silently
- Move replay / shareable URL / PWA offline — stretch goals not shipped

## Product acceptance (smoke)

| Scenario | Expected |
|----------|----------|
| PvP X wins a row | Status “X wins!”, cells highlighted, scores X+1, further clicks ignored |
| Draw | Status draw, draws+1, new game clears board keeps scores |
| Vs AI easy | Occasional human wins; AI never illegal |
| Vs AI hard optimal play | Draw (or AI win if human blunders) |
| Persistence | Dark theme + scores survive refresh |
| Undo vs AI | Removes human+AI pair when AI has replied |
| Corrupt storage | App still loads with defaults |

## License

Personal / demo project — use freely.
