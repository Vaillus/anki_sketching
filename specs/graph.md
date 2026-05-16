# Graph

> Dependencies between cards: who blocks whom, who comes first.

## Concept

The graph encodes **prerequisites**: an arrow from A to B means "you should know A before B is worth reviewing." Card A is then said to *block* card B until A is learned.

The structure is a directed graph (cycles are not prevented by the schema but are nonsensical — see [Open questions](#open-questions)). Cards that don't appear in the graph at all are neither blocking nor blocked.

## Where the graph lives

Two representations, kept in sync:

1. **Source of truth — `data/card_positions.json`** (`cards`, `groups`, `arrows`). Edited via the canvas UI.
2. **Working copy — `graph.db.edges`** — `(parent_card_id, child_card_id)` pairs, derived from the JSON by `parse_graph.py` (groups expanded). This is what the blocking/depth computations read.

The JSON is always reparsed wholesale; edges are never edited incrementally. This keeps the two in sync without invariants to maintain.

## JSON shape

```json
{
  "deck": "dessin::encre::1-lignes",
  "decks": ["dessin::encre::1-lignes"],
  "canvas": { "x": 913, "y": -351, "zoom": 0.27 },
  "cards": {
    "1721160391157": { "left": 1853, "top": -646, "zIndex": 55, "width": 328, "height": 210 },
    ...
  },
  "groups": {
    "group_1": { "name": "Groupe 2", "cards": ["1721161532151", "1721160317692"] },
    ...
  },
  "arrows": [
    { "from": "group_1", "to": "1721160506870", "fromAnchor": "bottom", "toAnchor": "top" },
    ...
  ]
}
```

- `cards` keys are `card_id`s — both Anki and `local_*`.
- `groups` keys are auto-generated (`group_N`), opaque, unique per session.
- `arrows[].from` and `arrows[].to` are either a `card_id` or a `group_id`.
- `arrows[].fromAnchor`/`toAnchor` are `"top" | "bottom" | "left" | "right"` — **visual only**, no semantic effect.

`canvas` is the pan/zoom state when last saved.

## Groups

A **group** is a visual cluster of cards drawn as a dashed rectangle on the canvas. Groups have no semantic role in the graph — they are a shorthand for "all these cards as one endpoint."

Behavioral rules:

- A group must contain at least 2 cards.
- A card can be in **at most one group** at a time (`cardGroups` map enforces this on the frontend).
- A card can be in zero groups (the common case).
- Groups can have any number of incoming and outgoing arrows.
- Groups themselves can be moved as a unit (drag-to-move applies the same delta to all member cards).

### Group expansion

When `parse_graph.py` walks the `arrows` list, every endpoint is expanded:

```
expand_node(node_id):
    if node_id is a group:
        return list of card_ids in that group
    else:
        return [node_id]
```

For an arrow `(from=A, to=B)`:
```
edges += { (p, c) for p in expand(A) for c in expand(B) }
```

So an arrow from a 3-card group to a 2-card group creates **6 edges**. Duplicates are deduped by the `(parent, child)` primary key.

This means groups are *purely* a UI ergonomic — you could redraw the same graph as N×M arrows and the blocking behavior would be identical.

## `graph.db` schema

```sql
CREATE TABLE edges (
    parent_card_id TEXT NOT NULL,
    child_card_id  TEXT NOT NULL,
    PRIMARY KEY (parent_card_id, child_card_id)
);

CREATE TABLE config (
    key   TEXT PRIMARY KEY,
    value TEXT
);
```

`config` currently holds only `crt` (Anki collection creation time, cached after first read). See [anki-sync.md](./anki-sync.md#crt).

The `edges` table is wiped (`DELETE FROM edges`) and rewritten on every parse — never patched.

## Blocking

A card is **blocking** if it is **due now** — one of:

- `is_new = 1` (always due), or
- `due_date IS NULL`, or
- `due_date <= today`.

(See `graph/blocking.py::_is_blocking_row`.)

A card is **blocked** if at least one of its **ancestors** in the edge DAG is blocking. "Ancestor" is the transitive closure of `(parent → child)`.

Both flags are computed and persisted in `cards.db.cards`. The algorithm:

```
# Phase 1: per-row flag
for each row in cards.db.cards:
    is_blocking = compute_from(is_new, due_date)

# Phase 2: propagation
reset is_blocked = 0 everywhere
for each blocking card C:
    DFS through graph.db.edges from C, set is_blocked=1 on every descendant
```

DFS, not BFS, because the depth is bounded by the user-drawn graph (rarely deep, no need to optimize).

A card can have `is_blocking=1` AND `is_blocked=1` simultaneously — e.g. it's due itself but also has an unlearned parent. In that case it's still hidden from `/due_cards` (the query is `is_blocked = 0`).

## Topological depth

`topo_depth` is the **length of the longest path from any root to this card**, where a root is a node with no incoming edges.

```
depths = {root: 0 for each root}
process nodes in BFS order:
    for each child of node N:
        depths[child] = max(depths[child], depths[N] + 1)
```

Cards not in the graph keep `topo_depth = 0`.

This is used as the **primary sort key for `/due_cards`** so that foundational cards (lower depth) are surfaced before downstream ones. Tie-broken by `(due before today before "new") ASC, due_date ASC`.

Computed by `compute_topo_depths()` in `graph/blocking.py`, called right after `compute_blocking_states()`.

## When the graph is recomputed

Edges are rewritten and blocking/depth recomputed in three places:

| Trigger | Function |
|---------|----------|
| `POST /save_positions` | `_rebuild_edges_and_blocking()` in `api/routes.py` |
| `python build_graph.py` | Standalone CLI — recreates `graph.db` from scratch |
| App startup | Only `migrate_db()` — ensures the `config` table exists. Does *not* create the `edges` table (that's `create_database()` in `build_graph.py`) and does *not* recompute edges. On a fresh install with no `graph.db`, `_rebuild_edges_and_blocking()` early-returns until `build_graph.py` is run once. |

Blocking alone (without re-parsing edges) is recomputed on `/review_card`, `/reschedule_card`, `/reschedule_distant_cards` — they call `compute_blocking_states()` directly, since changing one card's scheduling can unblock its descendants without changing the edge set.

## Endpoints

| Endpoint | Behavior |
|----------|----------|
| `POST /save_positions` | Body: full `card_positions.json` payload. Writes file, then rebuilds edges + blocking + depth. |
| `GET /load_positions` | Returns the parsed JSON. |
| `GET /blocking_cards` | Returns `{card_ids: [...]}` of cards that are `is_blocking=1 AND is_blocked=0` — the ones to highlight on the canvas. |
| `GET /due_cards` | Returns unblocked due cards, ordered by `topo_depth` then due-date. See [review.md](./review.md#due-cards-query). |
| `GET /practice/card/{id}/context` | Returns the card plus its immediate parents and children (one-hop only). Used by the practice page's right panel. |

## What this spec does not cover

- How the user draws arrows and groups on the canvas → [canvas.md](./canvas.md#arrows-and-groups).
- How blocking surfaces in the editor view (highlight) and practice view (filter) → those pages' specs.
- What changes `is_new`/`due_date` → [review.md](./review.md#scheduling-update) and [anki-sync.md](./anki-sync.md#import).

## Open questions

- **No cycle detection.** Nothing prevents drawing `A → B → A`. The DFS would loop on itself indefinitely (well, terminate after marking everything in the cycle as blocked). Worth adding a cycle check at parse time.
- **Groups can't nest.** Useful or not — TBD.
- **Group as semantic unit.** Currently groups have no scheduling semantics (they expand to N edges). One could argue a group should be "blocked iff *all* members are blocked," which would change reviewer ordering. Currently each member is independent.
- **`build_graph.py` is rarely needed.** Save now triggers a full rebuild, so the CLI is only useful when `graph.db` is missing or corrupt. Could be folded into startup.
- **Edge weights / arrow types.** Currently all edges are equal. No notion of "soft prerequisite" vs "hard prerequisite."
