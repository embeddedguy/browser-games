# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Git Workflow

After completing any meaningful unit of work, commit and push to GitHub. Don't batch unrelated changes into one commit.

- Use clear, descriptive commit messages (e.g. `Add enemy patrol behavior to shooter`, not `update stuff`)
- Push after every commit so work is never only local
- Commit before switching tasks or ending a session

## Running the Games

No build step or dependencies. Open any `.html` file directly in a browser:

```
start tictactoe.html
start shooter.html
```

## Architecture

Each game is a single self-contained `.html` file with inline CSS and JavaScript — no external dependencies, no modules, no bundler.

### tictactoe.html
- Board state stored in a flat 9-element array; win detection checks hardcoded index triples.
- AI uses full minimax (unbeatable) — `bestMove()` calls `minimax()` recursively.
- Score persists across rounds within a session (page reload resets it).

## Sales Playbook Commands

The `coldEmail/` folder contains a private sales strategy (gitignored — never commit or push its contents).

| Command | What it does |
|---------|-------------|
| `run signal scan` | Searches web for hiring + funding signals → writes `coldEmail/weekly_brief.md` |
| `run metrics summary` | Reads `coldEmail/metrics.md` → writes `coldEmail/weekly_metrics_summary.md` |
| `run framework refinement` | Monthly recursive improvement cycle → reads 4 weeks of metrics → writes `coldEmail/proposals/YYYY-MM-refinements.md` for Sales Leader review |

Full prompt definitions are in `coldEmail/prompts/`. Do not push `coldEmail/` to GitHub.

**Timestamp rule:** Any time Claude writes to or edits a file in `coldEmail/`, update that file's `Last updated: YYYY-MM-DD HH:MM` header line to the current date and time (24-hour format).

---

### shooter.html — "Dead Zone"
- Canvas-based top-down shooter (`480×480`, scaled 2× via CSS).
- Game loop driven by `requestAnimationFrame`; delta time capped at `MAX_DELTA` (50ms) to prevent tunneling on tab switch.
- Central `Game` object holds state machine: `MENU → PLAYING → LEVEL_COMPLETE / GAME_OVER`.
- Separate plain objects for subsystems: `Player`, `Keys`, `Mouse`, `Shake` (screen shake), plus arrays for bullets, enemies, particles.
- Enemies and difficulty scale with `Game.level`.
