# Tic-Tac-Toe

A polished, fully client-side **3×3 tic-tac-toe** web app with local pass-and-play, vs-computer (easy / medium / hard), scores, themes, optional sound, keyboard support, and a pure game engine covered by unit tests.

## Features

- **Local PvP** — pass-and-play on one device
- **Vs computer** — easy (random), medium (tactics + heuristic), hard (minimax + alpha-beta, optimal on 3×3)
- **Session scores** — X / O / draws, persisted in `localStorage`
- **Settings** — first player, play as X/O (vs AI), light/dark theme, sound on/off
- **Undo** — one move in PvP; human+AI pair in vs computer
- **Accessible board** — buttons with labels, live status region, keyboard play
- **Responsive** — usable ~360px mobile and desktop widths

## Prerequisites

- **Node.js** 20+ (or recent LTS) and npm

## Commands

```bash
# Install
npm install

# Development server (hot reload)
npm run dev

# Production build → dist/
npm run build

# Preview production build
npm run preview

# Unit tests
npm test

# Lint (oxlint)
npm run lint
```

Open the URL printed by `npm run dev` (typically `http://localhost:5173`).

## Architecture

| Area | Location | Role |
|------|----------|------|
| **Engine** | `src/game/` | Pure TS: board, rules, AI, storage helpers — **no DOM** |
| **Hooks** | `src/hooks/` | React controller (`useGameController`), sound |
| **UI** | `src/components/`, `src/App.tsx` | Presentation only; calls engine via controller |
| **Styles** | `src/styles/` | Global CSS variables + CSS modules |
| **Tests** | `tests/` | Vitest unit tests for engine, AI, storage |

### Board representation

Fixed **length-9 array**, row-major: `index = row * 3 + col` (0 = top-left, 8 = bottom-right). Cells are `null | 'X' | 'O'`. Updates are immutable (new arrays / state objects).

### Engine API (highlights)

- `createGame(settings?)` — initial state
- `applyMove(state, cellIndex)` — `{ ok: true, state }` or `{ ok: false, reason }`
- `resetGame(state, options?)` — new board; scores/settings preserved by default
- `undoMove` / `undoLastTurn` — history-based undo (pair undo in vs AI)
- `getLegalMoves(state)` — empty cells while in progress
- `chooseMove(state, difficulty?)` — AI policy (easy / medium / hard)

### AI notes

3×3 is small; **hard** uses full minimax with alpha-beta pruning. Optimal play vs optimal play always draws. Easy prioritizes randomness so humans can win; medium blocks/takes wins but slips ~25% of the time.

## Rules (quick)

1. Players alternate placing **X** and **O** on empty cells.
2. First to three in a row (row, column, or diagonal) wins.
3. Full board with no three-in-a-row is a **draw**.
4. No moves after the game ends until **New game**.

## Accessibility

- Board cells are `<button>` elements with names like “Row 1, column 2, empty” / “X”.
- Status uses `aria-live="polite"` for turn / winner / draw / AI thinking.
- **Keyboard:** Tab through cells and controls; **Enter** or **Space** places a mark on a focused empty cell.
- Win is announced in text and highlighted cells (not color alone).
- Focus rings and sufficient contrast targets (light/dark themes).
- Animations respect `prefers-reduced-motion`.

## Persistence

Key: `ttt-v1` (versioned). Stores scores + settings. Corrupt or unknown versions fall back to defaults without crashing.

## Manual QA checklist

1. PvP: X wins, O wins, draw — scores increment correctly
2. Vs AI easy / medium / hard — at least one game each; no illegal AI moves
3. Human as **O** (Settings) — AI opens when it should
4. New game, reset scores, undo (PvP single step; vs AI pair)
5. Refresh — scores, theme, difficulty, mode restore
6. Theme toggle light/dark
7. Resize ~360px and ~1280px — no horizontal scroll; board stays square
8. Keyboard-only full game
9. Rapid / double-click cells during play and during AI turn — state stays valid
10. New game mid-AI-turn — timer cleared, no double moves

## Known limitations / stretch not included

- No online multiplayer or accounts
- No 4×4 or custom boards
- No PWA / service worker
- No Playwright e2e suite (unit tests only)
- Sound uses Web Audio oscillators (may be blocked until first user gesture)

## License

Personal / demo project — use freely.
