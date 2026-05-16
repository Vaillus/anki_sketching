# Cards

> The central object. Everything else (graph, review, tags) is an operation on cards.

## Concept

A **card** is one item displayed on the canvas. It has:

- An **identity** (the `card_id`).
- A **content snapshot** (text fields, image filenames, tags) — copied from Anki on import for Anki cards, or authored in the app for local cards.
- A **scheduling state** (`is_new`, due date, interval) — seeded from Anki on import, then managed locally.
- A **graph state** (`is_blocking`, `is_blocked`, `topo_depth`) — computed, never input directly.

All of this lives in a single table: `cards.db.cards`. There is no separate "anki_card" vs "local_card" table — local cards are just rows whose `card_id` starts with `local_`.

## Identity

Two kinds of `card_id`, both stored as `TEXT`:

| Origin | Example | Stable across imports? |
|--------|---------|------------------------|
| Anki | `1721160391157` (note's first card ID, numeric) | Yes — matches Anki's primary key |
| Local | `local_1ccd12ff` (8 hex chars after `local_`) | Yes — generated once at creation |

Identity is global across decks. Re-importing a deck is **insert-only** (`INSERT … ON CONFLICT(card_id) DO NOTHING`): cards already present in `cards.db` are left entirely untouched — scheduling, content, tags, and computed graph state are all preserved. Only new card IDs get inserted (and returned to the frontend for canvas placement).

## Schema: `cards.db.cards`

```sql
CREATE TABLE cards (
    card_id              TEXT PRIMARY KEY,
    is_new               BOOLEAN NOT NULL DEFAULT 1,    -- 1 until the card's first review
    due_date             TEXT,                          -- ISO 'YYYY-MM-DD' (or NULL)
    interval             INTEGER NOT NULL DEFAULT 0,    -- days
    texts_json           TEXT,                          -- JSON: {field_name: value, ...}
    image_filenames_json TEXT,                          -- JSON: ["file1.png", "file2.png", ...]
    tags_json            TEXT,                          -- JSON: ["tag1", "tag2", ...]
    is_blocking          BOOLEAN NOT NULL DEFAULT 0,    -- computed
    is_blocked           BOOLEAN NOT NULL DEFAULT 0,    -- computed
    topo_depth           INTEGER NOT NULL DEFAULT 0,    -- computed
    created_at           TEXT                           -- only set for local cards
);
```

Migrations are handled idempotently in `graph/cards_db.py::migrate_cards_db`. There is also a one-shot `migrate_from_legacy()` (in `main.py` startup) that consumes the old `card_info.db` + `graph.db.card_state` if present. Both are safe to run on every startup.

## `is_new`

A card is **new** until its first review in this app. After that, `is_new` flips to `0` permanently and stays there — there is no demotion path.

The flag is set at import: any Anki card with `type == 0` (Anki's "New") imports as `is_new = 1`; everything else (Learning, Review, Relearning) imports as `is_new = 0`. Anki's `queue` field — including suspended / buried states — is **discarded**: this app has no suspend/bury concept, so all imported cards become reviewable. Local cards always start with `is_new = 1`.

`is_new = 1` is treated as "always due" everywhere it matters (the `/due_cards` query, the blocking check). After the first review, the card's lifecycle is fully governed by `due_date`.

## Due date semantics

The `due_date` column is **always an ISO date string** (or `NULL`). It is *not* Anki's raw `due` integer — which would mean different things for review cards (days since CRT) vs learning/relearning (Unix timestamp). The translation happens in `Card.get_due_date(crt)` during import (`src/anki_interface/card.py`); the result is then stored as ISO regardless of the card's Anki state.

After import, this app never re-reads Anki's `due` for that card. Updates come from:
- `/review_card` (sets `due_date = today + new_interval`)
- `/reschedule_card` (sets `due_date = today`)
- `/reschedule_distant_cards` (sets `due_date = today` for cards due > 5 days out)

Once a card has been reviewed or rescheduled here, its Anki-side scheduling drifts from reality — there is no "sync back to Anki" feature. Re-imports never touch existing rows, so any local progress is preserved.

## Content fields

### `texts_json`

A dict, `{field_name: html_string}`. Field names come from Anki's note type (commonly `"Front"` and `"Back"`, but anything else is allowed and rendered as-is). The HTML may contain `<img src="…">` tags — those are stripped during import and the image filenames are listed in `image_filenames_json` instead, so they can be deduplicated and gitignored.

For **local cards**, `texts_json` is normalized to `{"Front": …, "Back": …}` (omitted if empty). The local card editor only exposes those two fields.

### `image_filenames_json`

A JSON list of basenames (e.g. `["Pasted image 20240701.png"]`). The actual files are served from `/static/images/<filename>`. The frontend constructs URLs by prepending `/static/images/` and filters out files that don't physically exist (handles the gitignored-image case gracefully).

Multiple images per card is supported. The reviewer and practice-page card display them as a carousel.

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
| `is_new` | `1` |
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
| `POST /import_deck` | Pulls a deck from Anki, inserts only new rows into `cards.db` (existing rows are left untouched). See [anki-sync.md](./anki-sync.md#import). |
| `POST /get_cards_by_ids` | Body: `{card_ids: [...]}`. Returns full card dicts (including images, tags). Used by the canvas to render cards on startup and after edits. |
| `POST /create_local_card` | Body: `{front_text, back_text, image_filename?, tags?}`. Returns the created card. |
| `POST /update_card` | Updates `texts_json`, `tags_json`, and optionally `image_filenames_json` on any card (Anki or local). |
| `POST /update_local_card` | Same as above but with input shape matching the local-card modal. |
| `POST /upload_image` | Multipart upload. Returns `{filename, path}`. |
| `POST /delete_local_card` | Deletes a local card and its images. Rejects Anki card IDs. |

All endpoints return `{success: bool, ...}` or `{success: false, error: str}`.

## What this spec does not cover

- The actual visual rendering of a card on the canvas → [canvas.md](./canvas.md#card-rendering).
- How cards become blocking/blocked → [graph.md](./graph.md#blocking).
- How the reviewer mutates scheduling → [review.md](./review.md#scheduling-update).
- How tags are added/removed → [tags.md](./tags.md).
- How images are downloaded from Anki → [anki-sync.md](./anki-sync.md#images).

## Open questions

- **Local cards never graduate.** They stay `is_new = 1` until first review, which is normal — but they have no way to be promoted to "Anki" status (i.e. exported to Anki).
- **No deletion path for Anki cards.** The canvas context menu's "Supprimer la carte" only removes the card from the canvas (deletes from `card_positions.json` on next save). It does *not* delete from `cards.db` — the row sticks around with whatever last scheduling it had.
