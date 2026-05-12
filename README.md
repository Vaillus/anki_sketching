# Anki Sketching

A web app for **spatially organizing Anki flashcards on an infinite canvas**, drawing dependencies between them, and reviewing the cards whose prerequisites are met.

> Status: personal project, single user, runs locally. Cards live in Anki; the canvas layout and dependency graph live in this app.

<!-- screenshot of Build page -->
<!-- screenshot of Learn page -->

## What it does

The app has two pages:

- **`/` (Build)** — an infinite canvas where you drag cards around, group them, and draw arrows between them. Arrows encode *prerequisite* relationships ("learn this before that"). You can also create local cards (not in Anki) to fill gaps in the graph.
- **`/learn`** — a review dashboard. Only shows cards that are due today **and not blocked by an unlearned prerequisite**. Each card is displayed with its immediate parents and children so you can review it in context.

Scheduling is its own thing: instead of Anki's Again/Hard/Good/Easy, reviews are *Failed / Maintain / Change* (you can pick the next interval directly).

## Prerequisites

- **Anki Desktop** running, with the [AnkiConnect](https://ankiweb.net/shared/info/2055492159) plugin installed (code `2055492159`). The app talks to Anki at `localhost:8765`.
- Python 3.8+ and [`uv`](https://github.com/astral-sh/uv).
- Decks must be under a parent deck named `dessin::` to show up in the import dropdown (this filter is currently hardcoded).

## Run

```bash
bash run.sh
# or:
uv run uvicorn src.anki_sketching.main:app --reload --host 0.0.0.0 --port 5050
```

Then open <http://localhost:5050>.

## Where data lives

- `data/card_positions.json` — canvas layout (card positions, groups, arrows, pan/zoom). Auto-saved on changes.
- `data/cards.db` — one row per card: content snapshot from Anki, scheduling state, tags, `is_blocking` / `is_blocked` / `topo_depth`, plus local cards.
- `data/graph.db` — only the dependency edges (parsed from the JSON) and a small config table (CRT cache).
- `frontend/static/images/` — card images. Anki-imported `Pasted image *.png` are gitignored; user-uploaded `local_*` images are committed.

See [`specs/cards.md`](specs/cards.md) and [`specs/graph.md`](specs/graph.md) for the full schemas.

## Specs (spec-driven development)

This project uses concept-oriented specs in [`specs/`](specs/). Start with [`specs/00-overview.md`](specs/00-overview.md). Each spec describes one concept end-to-end:

| Spec | What it covers |
|------|----------------|
| [cards.md](specs/cards.md) | The central object: Anki cards, local cards, fields, scheduling, identity |
| [graph.md](specs/graph.md) | Dependency edges, groups, blocking propagation, topological depth |
| [canvas.md](specs/canvas.md) | The Build page: pan/zoom, drag, selection, arrows, groups, modals |
| [review.md](specs/review.md) | The Learn page, the reviewer modal, ease buttons, scheduling rules |
| [tags.md](specs/tags.md) | Tagging cards, filtering, autocomplete |
| [anki-sync.md](specs/anki-sync.md) | AnkiConnect, deck listing, importing, the CRT, images |

The specs describe the intended behavior. When changing a feature, **edit the spec first**, then update the code to match.
