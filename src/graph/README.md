# Graph module: card blocking / blocked

This module maintains a small SQLite database that represents the **dependency graph** of Anki cards (from `data/card_positions.json`) and computes which cards are **blocking** and which are **blocked** according to their scheduling state in Anki.

## Idea

- **Blocking**: A card is "blocking" when it should be reviewed before its dependents (e.g. learning/relearning, or review due today or overdue).
- **Blocked**: A card is "blocked" when at least one of its **ancestors** in the graph is blocking. Blocking propagates **transitively**: if A blocks B and B blocks C, then C is blocked.

So the graph encodes "this card depends on those" and we use it to know which cards are effectively unavailable until some others are done.

## Data source

- **Graph structure**: `data/card_positions.json` (cards, groups, arrows). Groups are expanded into individual card-to-card edges when parsing.
- **Scheduling state**: Stored in `data/cards.db` (`is_new`, `due_date`, ...). Seeded from Anki at import, then mutated locally on review. See [`specs/cards.md`](../../specs/cards.md).

## Databases

| File / Table | Role |
|--------------|------|
| `data/cards.db` (`cards`) | One row per card: scheduling state, content snapshot, computed `is_blocking` / `is_blocked` / `topo_depth`. See [`specs/cards.md`](../../specs/cards.md). |
| `data/graph.db` (`edges`) | Parent → child relationships (after expanding groups). Columns: `parent_card_id`, `child_card_id`. |
| `data/graph.db` (`config`) | Key/value store, currently caches the Anki CRT. |

## Blocking rules

A card is **blocking** if it's due now — either `is_new = 1`, `due_date IS NULL`, or `due_date <= today`. See [`specs/graph.md`](../../specs/graph.md#blocking) for the authoritative definition.

Then **blocked** is computed by propagation: start with every card `is_blocked = False`, then for each card with `is_blocking = True`, set `is_blocked = True` for all its **descendants** in the graph (DFS over `edges`).

## Modules

| File | Role |
|------|------|
| `schema.py` | Manages `graph.db` (edges + config). |
| `cards_db.py` | Manages `cards.db` (the `cards` table, schema migrations). |
| `parse_graph.py` | `parse_json_to_db(json_path, db_conn)` — reads the JSON, expands groups into edges, fills `edges`. |
| `blocking.py` | `compute_blocking_states(cards_conn, graph_conn)` — updates `is_blocking` from `is_new`/`due_date`, then propagates `is_blocked` from blocking cards to their descendants. `compute_topo_depths(...)` computes the longest-path depth. `get_blocking_report(...)` returns counts and lists. |
| `local_cards.py` | CRUD for `local_*` cards in `cards.db`. |
| `srs.py` | SM-2 scheduler module (currently dead code; not wired into `/review_card`). |

## How to run

From the project root, with Anki open and AnkiConnect enabled:

```bash
uv run python build_graph.py
```

This will:

1. Recreate `data/graph.db`.
2. Parse `data/card_positions.json` and fill `edges`.
3. Compute `is_blocking` / `is_blocked` / `topo_depth` in `data/cards.db`.
4. Print a short report (total cards, blocking count, blocked count, and which cards are blocking/blocked).

Only cards that appear in the JSON are considered; cards not in the graph are neither blocking nor blocked.
