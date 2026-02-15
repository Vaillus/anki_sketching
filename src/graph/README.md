# Graph module: card blocking / blocked

This module maintains a small SQLite database that represents the **dependency graph** of Anki cards (from `data/card_positions.json`) and computes which cards are **blocking** and which are **blocked** according to their scheduling state in Anki.

## Idea

- **Blocking**: A card is "blocking" when it should be reviewed before its dependents (e.g. learning/relearning, or review due today or overdue).
- **Blocked**: A card is "blocked" when at least one of its **ancestors** in the graph is blocking. Blocking propagates **transitively**: if A blocks B and B blocks C, then C is blocked.

So the graph encodes "this card depends on those" and we use it to know which cards are effectively unavailable until some others are done.

## Data source

- **Graph structure**: `data/card_positions.json` (cards, groups, arrows). Groups are expanded into individual card-to-card edges when parsing.
- **Scheduling state**: Fetched from Anki via AnkiConnect for each card in the graph (type, queue, due date).

## Database (`data/graph.db`)

Two tables:

| Table       | Role |
|------------|------|
| `card_state` | One row per card: `card_id`, `card_type`, `queue`, `due_date`, `raw_due`, `is_blocking`, `is_blocked`. Filled from Anki then updated by the blocking logic. |
| `edges`      | Parent → child relationships (after expanding groups). Columns: `parent_card_id`, `child_card_id`. |

## Blocking rules

A card is **blocking** if:

1. It is **not** suspended or buried (`queue` not in -3, -2, -1), and  
2. Either:
   - `card_type` is **new** (0), **learning** (1), or **relearning** (3), or  
   - `card_type` is **review** (2) and `due_date` is **today or earlier**.

Then **blocked** is computed by propagation: start with every card `is_blocked = False`, then for each card with `is_blocking = True`, set `is_blocked = True` for all its **descendants** in the graph (DFS over `edges`).

## Modules

| File | Role |
|------|------|
| `schema.py` | `create_database(db_path)` — creates or resets the DB with the two tables. |
| `parse_graph.py` | `parse_json_to_db(json_path, db_conn)` — reads the JSON, expands groups into edges, fills `edges`, returns the set of all card IDs. |
| `sync_card_state.py` | `sync_anki_state(db_conn, crt, card_ids)` — for each card ID, loads the card from Anki, computes `due_date`, inserts a row in `card_state` with `is_blocking`/`is_blocked` set to 0. |
| `blocking.py` | `compute_blocking_states(db_conn)` — updates `is_blocking` from type/queue/due_date, then propagates `is_blocked` from blocking cards to their descendants. `get_blocking_report(db_conn)` returns counts and lists. |

## How to run

From the project root, with Anki open and AnkiConnect enabled:

```bash
uv run python build_graph.py
```

This will:

1. Recreate `data/graph.db`.
2. Parse `data/card_positions.json` and fill `edges`.
3. Sync each card’s state from Anki into `card_state`.
4. Compute `is_blocking` and `is_blocked`.
5. Print a short report (total cards, blocking count, blocked count, and which cards are blocking/blocked).

Only cards that appear in the JSON are considered; cards not in the graph are neither blocking nor blocked.
