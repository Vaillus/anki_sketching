# Overview

> How the system is shaped and how the specs are organized.

## What the app is

A personal drawing-practice tool, served as a local web app. It does two things:

1. **Authors a skill tree** — exercises as nodes, prerequisite relationships as arrows. See [canvas.md](./canvas.md).
2. **Surfaces exercises for practice** based on its own scheduler, only showing exercises whose prerequisites are learned. See [review.md](./review.md).

The app owns exercise content, the graph, and scheduling. Anki integration is optional and one-way: an AnkiConnect-based importer can seed exercises from an Anki deck, after which Anki is out of the loop. The review logic is fully independent of Anki's SRS. See [anki-sync.md](./anki-sync.md).

## Editor and practice

Two surfaces, one backing store:

- **`/editor`** — the editor canvas. Position exercises, draw prerequisite arrows, group, tag, create new exercises. See [canvas.md](./canvas.md). (`/` redirects here.)
- **`/practice`** — the practice dashboard. Pick a due exercise, see its parents/children, answer it. See [review.md](./review.md).

Both pages read from the same backing store (`cards.db` + `graph.db` + `card_positions.json`). Any change on one side is reflected on the other after a reload (or a `loadDueCards()` refresh).

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  FastAPI app (src/anki_sketching/main.py, port 5050)        │
│                                                             │
│   editor/routes.py   → serves /editor   (editor canvas)     │
│   practice/routes.py → serves /practice (practice dash)     │
│   api/routes.py      → JSON endpoints                       │
│                                                             │
│   ─── optional ────────────────────────────────────         │
│   anki_interface/ → AnkiConnect at localhost:8765           │
│                  → direct read of collection.anki2 (CRT)    │
│   Only used by POST /import_deck and the editor page's      │
│   deck-list dropdown.                                       │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│   data/                                                     │
│     cards.db            — one row per exercise              │
│     graph.db            — edges + config (CRT cache)        │
│     card_positions.json — canvas layout (source of truth    │
│                           for the graph structure)          │
└─────────────────────────────────────────────────────────────┘
```

The frontend is **vanilla JS** loaded as `<script>` tags from `frontend/templates/index.html` and `practice.html`. No bundler, no framework.

## Data flow: the two main loops

### Save loop (Editor)

```
User edits canvas → saveCardPositions() → POST /save_positions
                                       │
                                       ├─► writes card_positions.json
                                       └─► _rebuild_edges_and_blocking()
                                            ├─► parse_json_to_db()
                                            │    → graph.db.edges
                                            ├─► compute_blocking_states()
                                            │    → cards.db.{is_blocking,is_blocked}
                                            └─► compute_topo_depths()
                                                 → cards.db.topo_depth
```

The JSON is the source of truth for graph structure. Every save reparses it.

### Review loop (Practice)

```
User clicks ease button → POST /review_card
                       │
                       ├─► UPDATE cards.db SET card_type=2, due_date=…
                       └─► compute_blocking_states()   ← unblocks newly-eligible cards
```

`/due_cards` then returns cards with `is_blocked=0 AND queue >= 0 AND due`, ordered by `topo_depth` so foundational cards bubble up.

## Module map

### Backend (`src/`)

| Path | Role |
|------|------|
| `anki_sketching/main.py` | FastAPI app, mounts statics, runs legacy migration, includes routers |
| `anki_sketching/editor/routes.py` | Serves `/editor` (editor canvas) and the `/` → `/editor` redirect. Fetches deck list from Anki. |
| `anki_sketching/practice/routes.py` | Serves `/practice` and `/practice/card/{id}/context` |
| `anki_sketching/api/routes.py` | JSON endpoints (save, import, due, review, local cards, tags, …) |
| `anki_interface/` | **Optional integration.** All AnkiConnect calls + direct sqlite read of `collection.anki2` for the CRT. Only used by `/import_deck` and the editor's deck dropdown. See [anki-sync.md](./anki-sync.md). |
| `graph/cards_db.py` | `cards` table schema, opens connections, runs migrations |
| `graph/schema.py` | `graph.db` schema (`edges` + `config`) |
| `graph/parse_graph.py` | `card_positions.json` → `graph.db.edges` (groups expanded into edges) |
| `graph/blocking.py` | `is_blocking` / `is_blocked` computation + `topo_depth` |
| `graph/local_cards.py` | CRUD for cards with `local_*` IDs |
| `graph/srs.py` | SM-2 scheduler (ported from anki-sm-2, AGPL). The conceptual basis for the app's scheduling. The current `/review_card` endpoint uses a simplified Failed/Maintain/Change shape that doesn't call into this module directly — see [review.md](./review.md). |
| `utilities/paths.py` | Project paths (data dir, images dir, positions file) |

### Frontend (`frontend/static/js/`)

Two app surfaces. All editor modules are loaded as `<script>` tags from `index.html`; practice has its own single bundle.

**Editor (14 modules)** — see [canvas.md](./canvas.md) for the breakdown.

**Practice** — `practice/main.js` is self-contained.

## Glossary

| Term | Meaning |
|------|---------|
| **Card** | The central object — an exercise on the canvas. ID is either `local_<hex>` (created in the editor) or numeric (imported from Anki). The codebase uses "card" throughout for historical reasons; the user-facing concept is "exercise". See [cards.md](./cards.md). |
| **Group** | A visual cluster of cards (dashed border) that can act as a single endpoint for an arrow. Groups are *not* nodes in the dependency graph: when an arrow attaches to a group, it's expanded into one edge per member at parse time. See [graph.md](./graph.md#groups). |
| **Arrow** | A directed connection between two endpoints (card or group) drawn on the canvas. Each endpoint has an anchor (`top` / `bottom` / `left` / `right`) for visual routing only — the anchor has no semantic meaning. |
| **Edge** | A `(parent_card_id, child_card_id)` row in `graph.db`. Always card-to-card after group expansion. |
| **Blocking** | A card is *blocking* if it's due (or new/learning/relearning) and not suspended. It prevents review of its descendants. See [graph.md](./graph.md#blocking). |
| **Blocked** | A card has at least one *blocking* ancestor. Hidden from `/due_cards`. |
| **`topo_depth`** | Longest path from any root (a node with no parents) to this card, computed in `compute_topo_depths()`. Drives the order in which due cards are surfaced. |
| **CRT** | Anki's *collection creation time* (Unix timestamp). Only relevant during Anki import — needed to translate Anki's `due` field for review cards into real dates. See [anki-sync.md](./anki-sync.md#crt). |

## What this overview deliberately doesn't cover

- Detailed schemas (in [cards.md](./cards.md) and [graph.md](./graph.md))
- Endpoint contracts (in each feature spec)
- The frontend module wiring (in [canvas.md](./canvas.md) and [review.md](./review.md))
- The AnkiConnect call shapes (in [anki-sync.md](./anki-sync.md))
