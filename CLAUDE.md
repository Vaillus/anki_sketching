# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A web-based spatial organization tool for Anki flashcards. Cards are displayed on an infinite canvas where you can drag, group, and connect them with arrows. The app integrates with Anki Desktop via the AnkiConnect plugin and tracks card scheduling and dependency (blocking) relationships.

**Prerequisites:** Anki Desktop must be running with the AnkiConnect plugin (code: 2055492159) active on `localhost:8765`.

## Commands

```bash
# Run the app (uses uv)
bash run.sh
# Or directly:
uv run uvicorn src.anki_sketching.main:app --reload --port 5000

# Rebuild the dependency graph (requires Anki running)
uv run python build_graph.py

# Inspect a card's due date
uv run python check_card_due.py [card_id]
```

The app is available at `http://localhost:5000`. There are no automated tests.

## Git

- Never add `Co-Authored-By: Claude` or any Claude/Anthropic attribution to commit messages.

## Architecture

### Backend (FastAPI)

- **`src/anki_sketching/main.py`** — App setup: mounts `frontend/static`, configures Jinja2 from `frontend/templates`, includes API and web route modules, runs on port 5000.
- **`src/anki_sketching/api/routes.py`** — REST API: save/load canvas state (`card_positions.json`), import deck from Anki, fetch due cards from `graph.db`. Contains a global `_cached_crt` to avoid repeated reads of the Anki collection file.
- **`src/anki_sketching/web/routes.py`** — Serves `index.html`, fetches available decks from Anki (filters for `dessin::*` decks).
- **`src/anki_interface/`** — All communication with Anki via AnkiConnect HTTP API (`utils.py` wraps calls to `localhost:8765`). The `Card` class (`card.py`) models Anki SRS data including due date computation via collection creation timestamp (CRT).
- **`src/graph/`** — SQLite-backed dependency graph. `build_graph.py` orchestrates: parse JSON → sync Anki state → compute blocking. Two tables: `card_state` (per-card scheduling/blocking flags) and `edges` (parent→child relationships, groups expanded to individual edges).

### Due Date Calculation

Review cards (type=2): `due` is days relative to the collection CRT (Unix timestamp stored in `collection.anki2`). Learning/relearning cards (type=1,3): `due` is a direct Unix timestamp. CRT is read directly from the Anki SQLite file (`get_collection_crt.py`), with a 15-second timeout for lock handling.

### Blocking Logic

A card **blocks** its descendants if it is not suspended/buried AND (is new/learning/relearning OR is a review due today/overdue). Blocking propagates transitively via DFS through the edges table. The `/due_cards` endpoint returns only non-blocked cards due today.

### Frontend (Vanilla JS, no framework)

Eleven JS modules loaded in order via `<script>` tags in `index.html`:

| Module | Responsibility |
|--------|----------------|
| `globals.js` | Shared state: canvas position/zoom, card/group/arrow maps, selection set |
| `bootstrap.js` | Event listeners, initialization, keyboard shortcuts, calls `loadAllSavedCardsOnStartup()` |
| `canvas.js` | Pan/zoom transform, pinch-zoom detection (`ctrlKey=true` on macOS trackpad) |
| `cards.js` | Import from API, render card divs with type badges, grid layout, drag via `makeDraggable()` |
| `arrows.js` | SVG arrows between cards, 4 anchor points per card, 24px snap radius |
| `groups.js` | Group boxes (dashed border), `groups Map` and `cardGroups Map` |
| `selection.js` | Multi-select (shift/ctrl-click), range selection |
| `storage.js` | Save/load canvas state JSON to backend; restores arrows and positions on startup |
| `physics.js` | Card repulsion simulation |
| `resize.js` | Edge-drag resizing (10px border zone) |
| `due_cards.js` | Bottom bar of due-today cards fetched from `/due_cards` |

### Persistence

- **`data/card_positions.json`** — Canvas state: card positions/sizes, groups, arrows, canvas x/y/zoom. Auto-saved on changes. Gitignored.
- **`data/graph.db`** — SQLite dependency graph. Must be rebuilt with `build_graph.py` when the canvas layout changes. Gitignored.
- **`frontend/static/images/`** — Card images extracted from Anki on import. Gitignored.
