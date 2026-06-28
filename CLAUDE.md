# CLAUDE.md

Guidance for Claude Code when working in this repo.

## Project Overview

A personal drawing-practice tool served as a local web app. Exercises are organized as a skill tree (graph of prerequisite relationships), and a custom SM-2-derived scheduler surfaces only the exercises whose prerequisites are learned. Anki integration via AnkiConnect exists but is optional — exercises can also be created directly in the editor.

## Spec-driven workflow

This project uses **specs in [`specs/`](specs/) as the source of truth for behavior.** The code implements the specs.

Concrete rules:

- **Before any non-trivial code change**, read the relevant spec(s) **and** the code they describe. If they disagree, flag the drift and ask which is correct before doing anything else.
- **Edit the spec first, then the code.** Never the other way around. The spec defines intent; the code matches.
- **A new feature starts as a spec change.** If the change doesn't fit cleanly into an existing spec, propose a new spec file before writing code.
- **Don't duplicate spec content here.** Architecture details, schemas, endpoints, module roles — all live in specs. CLAUDE.md only carries workflow rules and ambient project facts.

Start with [`specs/00-overview.md`](specs/00-overview.md). Each subsequent spec is concept-oriented (cards, graph, canvas, review, tags, anki-sync, mobile, deployment).

## Commands

```bash
# Run the app
bash start.sh
# Or directly:
uv run uvicorn src.anki_sketching.main:app --reload --host 0.0.0.0 --port 5050

# Rebuild the dependency graph from card_positions.json (rarely needed — /save_positions does this automatically)
uv run python build_graph.py

# Inspect an Anki card's due date (debugging tool, requires Anki running)
uv run python check_card_due.py [card_id]
```

The app runs at <http://localhost:5050>. There are no automated tests.

## Git

- Never add `Co-Authored-By: Claude` or any Claude/Anthropic attribution to commit messages.
- Never add "Generated with Claude Code" or AI attribution to PR descriptions.
