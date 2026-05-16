# Anki sync

> How this app reads from Anki: AnkiConnect, deck listing, importing cards, fetching the CRT, downloading images.

## Concept

Anki is the source of truth for **card content** and the **initial scheduling state**. This app reads from Anki via two channels:

1. **AnkiConnect HTTP API** at `http://localhost:8765` — for everything available there (deck names, card metadata, card content, media files).
2. **Direct read of `collection.anki2`** (Anki's SQLite file) — for the **CRT** (creation timestamp), which AnkiConnect does not expose.

Nothing is ever written back to Anki. This app does not call `editCard`, `addCard`, `setDueDate`, etc. — once a card is reviewed here, its Anki-side schedule drifts.

## Prerequisites

- Anki Desktop running.
- AnkiConnect plugin installed (code `2055492159`).
- Reachable at `localhost:8765` (the AnkiConnect default).

If Anki is down, **the app still runs** (since most data is cached in `cards.db` and `card_positions.json`) — but: the deck dropdown is empty, importing fails, and the status indicator goes red.

## Status polling

`frontend/static/js/anki_status.js` polls `GET /anki_status` every 5 seconds.

```
GET /anki_status
→ { connected: true | false }
```

Backend (`api/routes.py::anki_status`) calls `anki_request('deckNames')` and reports `connected = result is not None`. So "connected" really means "AnkiConnect responded successfully," not just that the TCP port is open.

Frontend behavior:

- `.connected` / `.disconnected` class on `#anki-status` (dot color).
- Label text updates ("Anki connecté" / "Anki non connecté — lancez Anki avec AnkiConnect").
- Import button is disabled when disconnected.
- **On the false → true transition, the page reloads.** This is so the deck dropdown (rendered server-side in `editor/routes.py`) picks up the now-available deck list.

## Deck listing

`src/anki_interface/get_all_decks.py::get_all_decks()` calls `anki_request('deckNames')` and returns the list (or `None` on failure).

The editor page (`editor/routes.py::index`) filters this list to only decks under the parent `dessin::`:

```python
dessin_decks = [
    deck for deck in all_decks
    if deck == 'dessin' or deck.startswith('dessin::')
]
```

This is **hardcoded**. Changing it requires editing `editor/routes.py`.

The dropdown shows the filtered list, sorted alphabetically.

## Import

The flow that pulls a deck into `cards.db`:

```
POST /import_deck
Form body: deck_name=<deck>
```

Backend (`api/routes.py::import_deck`):

```
1. Validate deck_name is non-empty.
2. card_ids = get_cards_ids(deck_name)            → AnkiConnect findCards
3. ensure data/images and frontend/static/images exist
4. crt = get_crt()                                 → from graph.db.config or collection.anki2
5. If crt found, persist it in graph.db.config
6. For each card_id:
     a. card = Card(card_id, load_images=True, image_output_dir=images_dir)
            → AnkiConnect cardsInfo + media retrieval per image
     b. compute due_date_obj = card.get_due_date(crt)
            → For type=2: today + (due - days_since_crt)
            → For type=1/3: timestamp interpreted as Unix seconds
     c. INSERT INTO cards.db.cards (...) ON CONFLICT(card_id) DO NOTHING
            → is_new (1 if Anki type == 0 else 0), due_date, interval,
              texts_json, image_filenames_json
            → is_blocking=0, is_blocked=0
            → tags_json is left NULL (handled as `[]` at read time)
            → Anki's `queue`, `factor`, `reps`, `lapses` are discarded:
              this app has no suspend concept and runs its own simple
              Failed/Maintain/Change scheduler that doesn't use them.
     d. If a row was actually inserted (rowcount > 0), append it to the
        response so the frontend places it on the canvas. Pre-existing
        rows are skipped silently.
7. Return list of newly-inserted cards.
```

**Import is insert-only**: cards already present in `cards.db` are left entirely untouched — scheduling, content (`texts_json`, `image_filenames_json`), tags, and computed graph state all survive a re-import unchanged. Only brand-new card IDs from Anki get inserted (and returned to the frontend for canvas placement).

The `Card` class in `src/anki_interface/card.py` is the workhorse that translates AnkiConnect's `cardsInfo` response into typed fields. See its module docstring for the field-by-field mapping.

## CRT

The **CRT (collection creation time)** is a Unix timestamp recorded when an Anki user first created their collection. It's needed because Anki's `due` field for review cards (Anki `type=2`) is encoded as "days since CRT," not as a real date.

AnkiConnect **does not expose** the CRT. So we read it directly from the SQLite file:

```
collection.anki2 → table `col` → column `crt`
```

Implementation: `src/anki_interface/get_collection_crt.py`.

### Path detection

`_find_collection_path()` tries (in order):

- macOS: `~/Library/Application Support/Anki2/<profile>/collection.anki2`
- Linux: `~/.local/share/Anki2/User 1/collection.anki2`
- Windows: `~/AppData/Roaming/Anki2/User 1/collection.anki2`

It also scans `~/Library/Application Support/Anki2` for any subdirectory containing `collection.anki2` (so multi-profile users are handled on macOS at least).

### Locking

Anki holds an exclusive lock on `collection.anki2` when running. The reader uses:

1. **First try**: open with `mode=ro` and `timeout=15s`. SQLite will wait for the lock for 15s.
2. **Fallback**: open with `mode=ro&immutable=1` — bypasses lock, reads the file directly without acquiring anything. **Safe for the CRT** because it's set once at collection creation and never changes.

The function returns `None` on any error (caller must handle).

### Caching

The CRT is cached aggressively because the read is comparatively expensive (file I/O + potential lock wait):

1. **In-memory cache** — `_cached_crt` module-global in `api/routes.py`.
2. **Persistent cache** — `graph.db.config` table, key `"crt"`.

Read priority on `get_crt()`:

```
in-memory cache → graph.db.config → fresh read from collection.anki2 → persist to graph.db.config
```

So in practice the file is read **once per app lifetime**, and only if `graph.db.config` doesn't already have it.

The CRT never expires from cache — it doesn't change.

### `find_all_profiles()`

Returns a list of `(profile_name, collection_path)` for every Anki profile on the system. Currently surfaced through `GET /collection_info` (an endpoint not actively used by the UI). Could be used in the future to support a profile picker.

## Images

Image filenames are inside Anki's media folder. They're referenced in card HTML as `<img src="...">`.

During import, `Card.__init__(load_images=True, image_output_dir=…)` does:

1. Parses `<img>` tags out of the card's field HTML.
2. For each image, calls AnkiConnect `retrieveMediaFile(filename)` → base64 content.
3. Decodes and writes to `frontend/static/images/<filename>`.
4. Records the basename in `card.image_filenames` (later JSON-encoded into `image_filenames_json`).

Images are **deduplicated by filename** — if the file already exists at the destination, the download is skipped.

Filenames are used as-is (so two Anki notes referencing different images with the same name would collide — but this is rare in practice for personal use).

### Local card images

Local cards use a separate flow:

```
POST /upload_image (multipart)
→ saves to frontend/static/images/local_<uuid8>.<ext>
→ returns { filename, path }
```

The `local_` prefix lets the gitignore rule (`!local_*`) keep them tracked in git while excluding Anki-imported images.

## AnkiConnect endpoints used

| AnkiConnect action | Where | Purpose |
|--------------------|-------|---------|
| `deckNames` | `get_all_decks.py`, `anki_status` endpoint | List decks + ping for connectivity check |
| `findCards` (with `deck:<name>`) | `get_cards_ids.py` | Get all card IDs in a deck |
| `cardsInfo` | `Card.__init__` | Fetch type (used to derive `is_new`), due, interval, fields |
| `retrieveMediaFile` | `Card._download_images` | Base64-fetch a media file by filename |

All wrapped by `src/anki_interface/utils.py::anki_request(action, **params)` which:

1. Sends `POST localhost:8765` with JSON `{"action": action, "version": 6, "params": {...}}`.
2. Returns `result` on success, `None` on any exception or AnkiConnect-level error.

There is no retry, no streaming, no parallelism. Imports are sequential — for ~30 cards this is fast enough.

## What this spec does not cover

- The `Card` class's field-by-field translation logic — see `src/anki_interface/card.py`.
- The HTML-image-extraction regex — same file, `_extract_image_filenames()`.
- The frontend's behavior on import (grid placement of new cards) → [canvas.md](./canvas.md#toolbar-buttons).
- The post-import recompute (no recompute happens at import; the user has to save once to regenerate edges + blocking).

## Open questions

- **No write-back to Anki.** Reviewing in this app does not update Anki. If the user wants stats parity, they have to also do reviews in Anki — defeating the purpose. Long-term, `editCard` / `setSpecificValueOfCard` could sync `due_date` and `interval` back.
- **Anki tags not imported.** A note's `tags` field in Anki is not pulled. Could seed `tags_json` with them.
- **Hardcoded `dessin::` filter.** Not a setting; literal in `web/routes.py`. Lift to config when adding multi-collection support.
- **No multi-profile support.** The CRT and import implicitly assume a single Anki profile. `find_all_profiles()` exists but no UI uses it.
- **AnkiConnect version not checked.** We use `version: 6` but don't verify it's supported on the running plugin.
- **Image-name collisions** are silently overwritten (the last import wins). Unlikely in practice but worth noting.
- **`collection.anki2` path detection is macOS-biased.** Linux/Windows users may need to pass `collection_path` explicitly.
