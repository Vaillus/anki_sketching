# Overview

> How the system is shaped and how the specs are organized.

## What the app is

A local single-user web app that sits next to Anki. It does three things:

1. **Mirrors a subset of an Anki collection** (decks under `dessin::`) into its own database, so the canvas can render and reason about cards without hitting Anki on every interaction.
2. **Lets the user lay out cards spatially and connect them with arrows** to encode prerequisite relationships ("learn A before B").
3. **Schedules and surfaces reviews** based on that graph: a card is hidden from review when an ancestor is still unlearned.

It is not a replacement for Anki — Anki still owns the card content, the note types, and (until a card is imported) the SRS state. This app owns the layout, the graph, the tags, and from the moment a card is first reviewed in `/learn`, its scheduling state too (the `locally_managed` flag flips to `1`).

## Two pages, one model

- **`/` Build** — the canvas. Edit the graph: position cards, draw arrows, group, tag, create local cards. See [canvas.md](./canvas.md).
- **`/learn` Learn** — the review dashboard. Pick a due card, see its parents/children, answer it. See [review.md](./review.md).

Both pages read from the same backing store (`cards.db` + `graph.db` + `card_positions.json`). Any change on one side is reflected on the other after a reload (or a `loadDueCards()` refresh).

## Architecture

```
┌─────────────────────┐         ┌─────────────────────┐
│   Anki Desktop      │         │   collection.anki2  │
│   + AnkiConnect     │◄────────┤   (read-only, CRT)  │
│   localhost:8765    │         └─────────────────────┘
└──────────┬──────────┘                  ▲
           │ HTTP/JSON                   │ direct sqlite read
           │                             │ (one-shot, cached)
┌──────────▼─────────────────────────────┴──────────────┐
│  FastAPI app (src/anki_sketching/main.py, port 5050)  │
│                                                       │
│   web/routes.py   — serves /            (index.html)  │
│   learn/routes.py — serves /learn       (learn.html)  │
│   api/routes.py   — JSON endpoints                    │
└────────┬──────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│   data/                                                 │
│     cards.db          — one row per card                │
│     graph.db          — edges + config (CRT cache)      │
│     card_positions.json — canvas layout (source of      │
│                           truth for the graph structure)│
└─────────────────────────────────────────────────────────┘
```

The frontend is **vanilla JS** loaded as `<script>` tags from `frontend/templates/index.html` and `learn.html`. No bundler, no framework.

## Data flow: the two main loops

### Save loop (Build)

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

### Review loop (Learn)

```
User clicks ease button → POST /review_card
                       │
                       ├─► UPDATE cards.db SET card_type=2, due_date=…, locally_managed=1
                       └─► compute_blocking_states()   ← unblocks newly-eligible cards
```

`/due_cards` then returns cards with `is_blocked=0 AND queue >= 0 AND due`, ordered by `topo_depth` so foundational cards bubble up.

## Module map

### Backend (`src/`)

| Path | Role |
|------|------|
| `anki_sketching/main.py` | FastAPI app, mounts statics, runs legacy migration, includes routers |
| `anki_sketching/web/routes.py` | Serves `/` (Build page). Fetches deck list from Anki. |
| `anki_sketching/learn/routes.py` | Serves `/learn` and `/learn/card/{id}/context` |
| `anki_sketching/api/routes.py` | JSON endpoints (save, import, due, review, local cards, tags, …) |
| `anki_interface/` | All AnkiConnect calls + direct sqlite read of `collection.anki2` for the CRT. See [anki-sync.md](./anki-sync.md). |
| `graph/cards_db.py` | `cards` table schema, opens connections, runs migrations |
| `graph/schema.py` | `graph.db` schema (`edges` + `config`) |
| `graph/parse_graph.py` | `card_positions.json` → `graph.db.edges` (groups expanded into edges) |
| `graph/blocking.py` | `is_blocking` / `is_blocked` computation + `topo_depth` |
| `graph/local_cards.py` | CRUD for cards with `local_*` IDs |
| `graph/card_info.py` | `min_interval` getter/setter (per-card scheduling override) |
| `graph/srs.py` | SM-2 scheduler (ported from anki-sm-2, AGPL). **Currently unused** — see [review.md](./review.md#open-questions). |
| `utilities/paths.py` | Project paths (data dir, images dir, positions file) |

### Frontend (`frontend/static/js/`)

Two app surfaces. All Build modules are loaded as `<script>` tags from `index.html`; Learn has its own single bundle.

**Build (14 modules)** — see [canvas.md](./canvas.md) for the breakdown.

**Learn** — `learn/main.js` is self-contained.

## Glossary

| Term | Meaning |
|------|---------|
| **Card** | The unit displayed on the canvas. Either an Anki card (numeric ID like `1721160391157`) or a local card (`local_<hex>`). See [cards.md](./cards.md). |
| **Group** | A visual cluster of cards (dashed border) that can act as a single endpoint for an arrow. Groups are *not* nodes in the dependency graph: when an arrow attaches to a group, it's expanded into one edge per member at parse time. See [graph.md](./graph.md#groups). |
| **Arrow** | A directed connection between two endpoints (card or group) drawn on the canvas. Each endpoint has an anchor (`top` / `bottom` / `left` / `right`) for visual routing only — the anchor has no semantic meaning. |
| **Edge** | A `(parent_card_id, child_card_id)` row in `graph.db`. Always card-to-card after group expansion. |
| **Blocking** | A card is *blocking* if it's due/new/learning/relearning and not suspended. It prevents review of its descendants. See [graph.md](./graph.md#blocking). |
| **Blocked** | A card has at least one *blocking* ancestor. Hidden from `/due_cards`. |
| **CRT** | Anki's *collection creation time* (Unix timestamp). Needed to compute real dates for review cards (`type=2`). See [anki-sync.md](./anki-sync.md#crt). |
| **Local card** | A card created in this app, not in Anki. ID prefix `local_`. Always `card_type=0`, `locally_managed=1`. See [cards.md](./cards.md#local-cards). |
| **`locally_managed`** | Flag on `cards.db.cards`. When `1`, scheduling decisions in this app are authoritative; we no longer trust Anki's state for that card. Flips to `1` on first `/review_card`, `/reschedule_card`, or `/reschedule_distant_cards`. |
| **`topo_depth`** | Longest path from any root (a node with no parents) to this card, computed in `compute_topo_depths()`. Drives the order in which due cards are surfaced. |

## How to use the specs

Each spec is **self-contained for its concept** and **cross-references the others** with relative links.

- **Building a new feature?** Find the concept it touches most, read that spec, follow links to adjacent ones, then edit the relevant spec(s) before writing code.
- **Adding a brand-new concept?** Add a new file `specs/<concept>.md` and link it from this overview.
- **Each spec should answer**: what is this concept, what state does it own, what behaviors are defined on it, what does the UI look like (if applicable), what's the backend/frontend surface, and what's still open.

## What this overview deliberately doesn't cover

- Detailed schemas (in [cards.md](./cards.md) and [graph.md](./graph.md))
- Endpoint contracts (in each feature spec)
- The frontend module wiring (in [canvas.md](./canvas.md) and [review.md](./review.md))
- The AnkiConnect call shapes (in [anki-sync.md](./anki-sync.md))
