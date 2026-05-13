# Cards

> The central object. Everything else (graph, review, tags) is an operation on cards.

## Concept

A **card** is one item displayed on the canvas. It has:

- An **identity** (the `card_id`).
- A **content snapshot** (text fields, image filenames, tags) — copied from Anki on import for Anki cards, or authored in the app for local cards.
- A **scheduling state** (type, queue, due date, interval, ease) — originally from Anki, may become locally managed.
- A **graph state** (`is_blocking`, `is_blocked`, `topo_depth`) — computed, never input directly.
- An optional **per-card override** (`min_interval`).

All of this lives in a single table: `cards.db.cards`. There is no separate "anki_card" vs "local_card" table — local cards are just rows where `card_id` starts with `local_` and `locally_managed=1`.

## Identity

Two kinds of `card_id`, both stored as `TEXT`:

| Origin | Example | Stable across imports? |
|--------|---------|------------------------|
| Anki | `1721160391157` (note's first card ID, numeric) | Yes — matches Anki's primary key |
| Local | `local_1ccd12ff` (8 hex chars after `local_`) | Yes — generated once at creation |

Identity is global across decks. Re-importing a deck does `INSERT OR REPLACE` on the `card_id`, so positions and tags on the canvas survive a re-import, but **scheduling fields are overwritten** unless `locally_managed=1` (see [Scheduling ownership](#scheduling-ownership) below — currently the import does *not* check the flag, see [Open questions](#open-questions)).

## Schema: `cards.db.cards`

```sql
CREATE TABLE cards (
    card_id              TEXT PRIMARY KEY,
    card_type            INTEGER NOT NULL DEFAULT 0,   -- 0=new, 1=learning, 2=review, 3=relearning
    queue                INTEGER NOT NULL DEFAULT 0,   -- Anki queue; -3/-2/-1 = suspended/buried
    due_date             TEXT,                          -- ISO 'YYYY-MM-DD' (or NULL)
    raw_due              INTEGER,                       -- Anki's raw due, kept for debugging
    interval             INTEGER NOT NULL DEFAULT 0,    -- days
    ease_factor          REAL    NOT NULL DEFAULT 2.5,
    locally_managed      BOOLEAN NOT NULL DEFAULT 0,    -- 1 once we've taken over scheduling
    texts_json           TEXT,                          -- JSON: {field_name: value, ...}
    image_filenames_json TEXT,                          -- JSON: ["file1.png", "file2.png", ...]
    tags_json            TEXT,                          -- JSON: ["tag1", "tag2", ...]
    reps                 INTEGER NOT NULL DEFAULT 0,
    lapses               INTEGER NOT NULL DEFAULT 0,
    is_blocking          BOOLEAN NOT NULL DEFAULT 0,    -- computed
    is_blocked           BOOLEAN NOT NULL DEFAULT 0,    -- computed
    topo_depth           INTEGER NOT NULL DEFAULT 0,    -- computed
    min_interval         INTEGER,                       -- optional override (days)
    created_at           TEXT                           -- only set for local cards
);
```

Migrations are handled idempotently in `graph/cards_db.py::migrate_cards_db`. There is also a one-shot `migrate_from_legacy()` (in `main.py` startup) that consumes the old `card_info.db` + `graph.db.card_state` if present. Both are safe to run on every startup.

## Card types and queue

The `card_type` and `queue` semantics match Anki's:

| `card_type` | Meaning | `due_date` semantics in this app |
|-------------|---------|---------------------------------|
| `0` | New (never reviewed) | `NULL` |
| `1` | Learning | `NULL` (treated as "review now") |
| `2` | Review | ISO date — the day it's next due |
| `3` | Relearning | `NULL` (treated as "review now") |

`queue` values from Anki:

| `queue` | Meaning | Effect |
|---------|---------|--------|
| `-3` | Sched buried | Excluded from review and from blocking |
| `-2` | User-buried | Same |
| `-1` | Suspended | Same |
| `0` | New | Normal |
| `1`+ | Learning / review / etc. | Normal |

The `WHERE queue >= 0` filter is the canonical "card is active" check.

## Due date semantics

The `due_date` column is **always an ISO date string** (or `NULL`). It is *not* Anki's raw `due` integer — which would mean different things for `card_type=2` (days since CRT) vs `card_type=1/3` (Unix timestamp). The translation happens in `Card.get_due_date(crt)` during import (`src/anki_interface/card.py`).

After import, this app never re-reads Anki's `due` for that card. Updates come from:
- `/review_card` (sets `due_date = today + new_interval`)
- `/reschedule_card` (sets `due_date = today`)
- `/reschedule_distant_cards` (sets `due_date = today` for cards due > 5 days out)

All three also set `locally_managed = 1`.

## Scheduling ownership

The `locally_managed` flag answers "who owns the next-review-date of this card?".

- **`0`** — Anki owns it. The values in `cards.db` are a snapshot from the last import.
- **`1`** — This app owns it. Subsequent imports should *not* overwrite scheduling fields. (Note: as of now, re-import does overwrite them. See [Open questions](#open-questions).)

The flag is one-way: once flipped to `1`, it stays. There is no "sync back to Anki" feature — Anki's scheduling for these cards drifts from reality.

## Content fields

### `texts_json`

A dict, `{field_name: html_string}`. Field names come from Anki's note type (commonly `"Front"` and `"Back"`, but anything else is allowed and rendered as-is). The HTML may contain `<img src="…">` tags — those are stripped during import and the image filenames are listed in `image_filenames_json` instead, so they can be deduplicated and gitignored.

For **local cards**, `texts_json` is normalized to `{"Front": …, "Back": …}` (omitted if empty). The local card editor only exposes those two fields.

### `image_filenames_json`

A JSON list of basenames (e.g. `["Pasted image 20240701.png"]`). The actual files are served from `/static/images/<filename>`. The frontend constructs URLs by prepending `/static/images/` and filters out files that don't physically exist (handles the gitignored-image case gracefully).

Multiple images per card is supported. The reviewer and learn-page card display them as a carousel.

For **local cards**, the upload endpoint (`POST /upload_image`) generates a filename `local_<uuid8><ext>` so they sort apart from Anki images and can be tracked in git.

### `tags_json`

A JSON list of strings. Tags live entirely in this app (not synced to Anki). See [tags.md](./tags.md).

## Computed fields

These are written by `graph/blocking.py`, never set by user input.

- **`is_blocking`** — see [graph.md](./graph.md#blocking).
- **`is_blocked`** — see [graph.md](./graph.md#blocking).
- **`topo_depth`** — see [graph.md](./graph.md#topological-depth).

They are recomputed:
- On every `/save_positions` (after re-parsing the JSON into edges).
- On every `/review_card`, `/reschedule_card`, `/reschedule_distant_cards`.
- On every `build_graph.py` run.

## Local cards

A local card is a card created in the app via the canvas context menu → "Nouvelle carte". It exists *only* in `cards.db`, with no Anki counterpart.

| Field | Default for local cards |
|-------|------------------------|
| `card_id` | `local_<uuid8>` |
| `card_type` | `0` (New) |
| `queue` | `0` |
| `locally_managed` | `1` |
| `texts_json` | `{"Front": …, "Back": …}` (only present fields) |
| `image_filenames_json` | `[]` or `["local_xxx.png", …]` |
| `created_at` | `datetime('now', 'localtime')` at creation |
| Other scheduling fields | Defaults (interval `0`, ease `2.5`, etc.) |

The CRUD lives in `graph/local_cards.py`:

| Function | Notes |
|----------|-------|
| `create_local_card(front_text, back_text, image_filename, tags=None) -> card_id` | Inserts a new row |
| `get_local_card(card_id) -> dict \| None` | Reads back a single card |
| `update_local_card(card_id, front_text=…, back_text=…, image_filenames=…) -> bool` | Updates only the fields passed |
| `delete_local_card(card_id) -> bool` | Deletes the row **and** removes the image files from disk |
| `get_local_cards_by_ids(card_ids) -> list[dict]` | Batch read |

Note: `get_local_card` reads from the unified `cards` table — there is no separate local-card table.

## Endpoints

| Endpoint | Purpose |
|----------|---------|
| `POST /import_deck` | Pulls a deck from Anki, inserts/replaces rows in `cards.db`. See [anki-sync.md](./anki-sync.md#import). |
| `POST /get_cards_by_ids` | Body: `{card_ids: [...]}`. Returns full card dicts (including images, tags). Used by the canvas to render cards on startup and after edits. |
| `POST /create_local_card` | Body: `{front_text, back_text, image_filename?, tags?}`. Returns the created card. |
| `POST /update_card` | Updates `texts_json`, `tags_json`, and optionally `image_filenames_json` on any card (Anki or local). |
| `POST /update_local_card` | Same as above but with input shape matching the local-card modal. |
| `POST /upload_image` | Multipart upload. Returns `{filename, path}`. |
| `POST /delete_local_card` | Deletes a local card and its images. Rejects Anki card IDs. |
| `GET /card_info_all` | Returns `{card_info: {card_id: {min_interval: N}, ...}}` for cards with overrides. |
| `POST /set_card_info` | Body: `{card_id, min_interval}` (pass `null` to clear). |

All endpoints return `{success: bool, ...}` or `{success: false, error: str}`.

## What this spec does not cover

- The actual visual rendering of a card on the canvas → [canvas.md](./canvas.md#card-rendering).
- How cards become blocking/blocked → [graph.md](./graph.md#blocking).
- How the reviewer mutates scheduling → [review.md](./review.md#scheduling-update).
- How tags are added/removed → [tags.md](./tags.md).
- How images are downloaded from Anki → [anki-sync.md](./anki-sync.md#images).

## Open questions

- **Re-import overwrites scheduling.** `/import_deck` does `INSERT OR REPLACE` and writes scheduling fields unconditionally, even when `locally_managed=1`. This wipes locally-made review history. Likely should skip scheduling fields when `locally_managed=1`.
- **Local cards never graduate.** They stay `card_type=0` until first review, which is normal — but they have no way to be promoted to "Anki" status (i.e. exported to Anki).
- **No deletion path for Anki cards.** The canvas context menu's "Supprimer la carte" only removes the card from the canvas (deletes from `card_positions.json` on next save). It does *not* delete from `cards.db` — the row sticks around with whatever last scheduling it had.
