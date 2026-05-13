# Anki Sketching

A personal tool for building a **drawing-practice routine**: exercises are organized as a skill tree, and review sessions surface only the exercises whose prerequisites you've already learned.

> Status: personal project, single user, runs locally. Name is a leftover from when this was an Anki front-end — Anki is now an optional import source.

<!-- screenshot of editor (/editor) -->
<!-- screenshot of practice session (/practice) -->

## Why this exists

I tried using Anki directly for drawing practice and hit two problems:

- **Anki's intervals didn't match my real repetition needs.** Drawing skills don't decay on the same curve as memorized information. From my experience, declarative and procedural memories just don't work in the same way.
- **Exercises have explicit prerequisites that Anki can't encode.** An advanced exercise shouldn't be surfaced before its foundational exercises have been practiced at least once. There's no way to express that explicitly in Anki.

So this app has its own scheduling, and its own concept of a dependency graph between exercises.

## What it does

Two parts:

- **Skill-tree editor** — an infinite canvas where exercises are nodes and arrows are prerequisites. Drag to position, group related exercises, tag, draw arrows. Exercises can be created directly in the editor.
- **Practice sessions** — a review dashboard that only shows exercises whose prerequisites are learned. Each exercise is presented with its immediate parents and children so you review it in context. Scheduling is SM-2-derived, simplified to three actions: *Failed / Maintain / Change*.

## Prerequisites

- Python 3.8+ and [`uv`](https://github.com/astral-sh/uv).

That's it for the core app. Anki integration is optional — see below.

## Run

```bash
bash start.sh
# or:
uv run uvicorn src.anki_sketching.main:app --reload --host 0.0.0.0 --port 5050
```

Then open <http://localhost:5050>.

## Where data lives

- `data/card_positions.json` — canvas layout (positions, groups, arrows, pan/zoom). Auto-saved on changes.
- `data/cards.db` — one row per exercise: content, scheduling state, tags, `is_blocking` / `is_blocked` / `topo_depth`.
- `data/graph.db` — dependency edges (parsed from the JSON) and a small config table.
- `frontend/static/images/` — exercise images. `local_*` images are committed; Anki-imported images are gitignored.

See [`specs/cards.md`](specs/cards.md) and [`specs/graph.md`](specs/graph.md) for the full schemas.

## Optional: import from Anki

The app started life as an Anki front-end, and a working AnkiConnect importer is still in the codebase. If you have an Anki deck of exercises you want to seed the editor with:

- Install the [AnkiConnect](https://ankiweb.net/shared/info/2055492159) plugin (code `2055492159`) and have Anki Desktop running.
- The import dropdown filters for decks under a parent named `dessin::` — change `src/anki_sketching/editor/routes.py` to match your naming.

Imported cards become regular exercises in the editor. Their scheduling drifts from Anki after the first review here, since this app doesn't sync back.

See [`specs/anki-sync.md`](specs/anki-sync.md) for the full integration details.

## Specs (spec-driven development)

This project uses concept-oriented specs in [`specs/`](specs/). Start with [`specs/00-overview.md`](specs/00-overview.md). Each spec describes one concept end-to-end:

| Spec | What it covers |
|------|----------------|
| [cards.md](specs/cards.md) | The central object: exercises, fields, scheduling state, identity |
| [graph.md](specs/graph.md) | Dependency edges, groups, blocking propagation, topological depth |
| [canvas.md](specs/canvas.md) | The editor: pan/zoom, drag, selection, arrows, groups, modals |
| [review.md](specs/review.md) | Practice sessions, ease buttons, scheduling rules |
| [tags.md](specs/tags.md) | Tagging exercises, filtering, autocomplete |
| [anki-sync.md](specs/anki-sync.md) | The optional Anki importer |

The specs describe the intended behavior. When changing a feature, **edit the spec first**, then update the code to match.
