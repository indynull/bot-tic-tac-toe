# Tic-Tac-Toe

A polished, fully client-side tic-tac-toe web app with local pass-and-play, vs-computer (easy / medium / hard / impossible), scores, themes, optional sound, keyboard support, and a pure game engine covered by unit tests.

## Features

- **Local PvP** — pass-and-play on one device
- **Vs computer** — easy / medium / hard / **impossible** (optimal minimax on 3×3; tactical/shallow on larger boards — see AI notes)
- **Draw ladder** — a full board with no winner is a normal draw; the **next** game starts on a larger empty board (3→4→…→7) with a longer win line
- **Session scores** — X / O / draws, persisted in `localStorage`
- **Settings** — first player, play as X/O (vs AI), light/dark theme, sound on/off
- **Undo** — one move in PvP; human+AI pair in vs computer (reverts ladder advance if undoing a draw)
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

## Deploy (free — GitHub Pages)

The game is a static Vite build (`dist/`). CI on `main` runs lint → test → build and publishes to **GitHub Pages** (no extra account or paid tier).

**Live URL (after first successful deploy):**  
`https://indynull.github.io/bot-tic-tac-toe/`

### One-time repo setup

1. **Settings → Pages → Build and deployment**
   - Source: **GitHub Actions** (not “Deploy from a branch”).
2. Push to `main` (or merge a PR). The [CI workflow](.github/workflows/ci.yml) uploads `dist` and deploys.
3. First run may prompt to approve the **github-pages** environment under **Settings → Environments** if protection rules are on.

PRs only run verify (lint/test/build); deploy runs on pushes to `main`.

### Local production build for Pages

```bash
BASE_PATH=/bot-tic-tac-toe/ npm run build
npm run preview
```

`BASE_PATH` must match the repo name so asset URLs resolve under the project site path. For a custom domain or user site (`username.github.io`), leave it unset (defaults to `/`).

## Architecture

| Area | Location | Role |
|------|----------|------|
| **Engine** | `src/game/` | Pure TS: board, rules, AI, storage helpers — **no DOM** |
| **Hooks** | `src/hooks/` | React controller (`useGameController`), sound |
| **UI** | `src/components/`, `src/App.tsx` | Presentation only; calls engine via controller |
| **Styles** | `src/styles/` | Global CSS variables + CSS modules |
| **Tests** | `tests/` | Vitest unit tests for engine, AI, storage |

### Board representation

Variable **N×N** array (`boardSize` 3–7), row-major: `index = row * boardSize + col`. Cells are `null | 'X' | 'O'`. Updates are immutable (new arrays / state objects).

### Engine API (highlights)

- `createGame(options?)` — initial state (optional `boardSize` / `ladderSize`)
- `applyMove(state, cellIndex)` — full board with no winner is a **draw** and advances `ladderSize` for the next game
- `resetGame(state, options?)` — new empty board at `ladderSize` (`resetProgression` returns to 3×3)
- `undoMove` / `undoLastTurn` — history-based undo (pair undo in vs AI); reverts ladder advance if undoing a draw
- `getLegalMoves(state)` — empty cells while in progress
- `chooseMove(state, difficulty?)` — AI policy (easy / medium / hard / impossible)

### Draw ladder (product rules)

1. A full board with no winner is always a **scored draw** (game ends).
2. The **next** new game uses a larger empty board: 3 → 4 → … up to 7 (stored as `ladderSize`).
3. Win length scales: **3** on 3×3, **4** on 4×4/5×5, **5** on 6×6/7×7 (playable ladder).
4. Wins keep the current size for the next game; only draws climb the ladder.
5. Vs computer: any ladder-advancing draw tiers difficulty up one step; on 4×4–6×6 hard/impossible use shallow minimax, on 7×7 tactical only (no slips).
6. **Reset ladder** clears scores and returns to classic 3×3.
7. Fresh / corrupt storage defaults: **vs computer**, **impossible**, human plays **O** (computer opens as X). Entering vs AI from PvP floors easy/medium up to **hard**.

### AI notes

| Board | easy | medium | hard | impossible |
|-------|------|--------|------|------------|
| **3×3** | always takes wins; ~55% blocks/forks | tactical (~5% slips) | optimal minimax | optimal + book/forks |
| **4×4** | always takes wins; ~55% blocks/forks | tactical (~5% slips) | shallow minimax (depth 4) | deeper shallow (depth 5) + deterministic ties |
| **5×5** | always takes wins; ~55% blocks/forks | tactical (~5% slips) | shallow minimax (depth 1) | shallow minimax (depth 2) |
| **6×6** | always takes wins; ~55% blocks/forks | tactical (~5% slips) | shallow minimax (depth 1) | shallow minimax (depth 1) |
| **7×7** | always takes wins; ~55% blocks/forks | tactical (~5% slips) | **tactical only** (no slips) | **tactical only** (no slips) |

Tier names are historical; settings copy and `aiPolicyNote()` describe the real policy. Hard/impossible are only fully optimal on classic 3×3.

## Rules (quick)

1. Players alternate placing **X** and **O** on empty cells.
2. First to **K-in-a-row** wins (K depends on board size).
3. Full board with no winner is a **draw** — and unlocks a **bigger empty board** for the next game (up to 7×7).
4. **New game** starts fresh at the ladder size; **Reset ladder** clears scores and returns to 3×3.
5. No moves after a terminal win/draw until **New game**.

## Accessibility

- Board cells are `<button>` elements with names like “Row 1, column 2, empty” / “X”.
- Status uses `aria-live` for turn / winner / draw / ladder advance / AI thinking.
- **Keyboard:** Tab through cells and controls; **Enter** or **Space** places a mark on a focused empty cell.
- Win is announced in text and highlighted cells (not color alone).
- Focus rings and sufficient contrast targets (light/dark themes).
- Animations respect `prefers-reduced-motion`.

## Persistence

Key: `ttt-v1` (versioned payload, currently **v3**). Stores scores, settings, and ladder `boardSize`. v1/v2 loads migrate (v2 `pendingEscalation` is dropped). Corrupt or unknown versions fall back to defaults without crashing.

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
- Hard/impossible are not optimal on 4×4+ (speed tradeoff; settings note this)
- No PWA / service worker
- No Playwright e2e suite (unit tests only)
- Sound uses Web Audio oscillators (may be blocked until first user gesture)

## License

Personal / demo project — use freely.
