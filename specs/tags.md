# Tags

> Free-form labels on cards. Used to filter the review queue.

## Concept

A **tag** is a free-form string attached to a card. Tags live entirely in this app — they are *not* synced from or to Anki. They're used for one main purpose: **filtering the practice page** to focus a review session on a subset of cards (e.g. only "perspective" cards, excluding "anatomy").

Secondary uses: visual labeling on the canvas (small pills under each card), and grouping in spirit (without using the graph's groups, which are spatial).

There's no tag hierarchy, no validation, no canonical tag list — the set of known tags is just `SELECT DISTINCT tag FROM (jsonb of cards.tags_json)`.

## Storage

Per card, in `cards.db.cards.tags_json`:

```json
["perspective", "encre", "1-lignes"]
```

`NULL` and `[]` both mean "no tags". The frontend treats them identically.

There is **no separate tags table** — all tag operations are JSON read/modify/write on the `cards` row.

CRUD lives in `graph/cards_db.py`:

| Function | Behavior |
|----------|----------|
| `get_all_tags(conn=None) -> list[str]` | Returns the sorted set of all distinct tags across all cards. |
| `add_tag(card_ids: list[str], tag: str) -> None` | For each card, parses `tags_json`, adds `tag` if not present, writes back. |
| `remove_tag(card_ids: list[str], tag: str) -> None` | For each card, parses `tags_json`, removes `tag` if present, writes back. |

Tags are trimmed (`tag.strip()`) at the API layer but otherwise unvalidated — case is preserved, spaces and unicode are allowed.

## Endpoints

| Endpoint | Behavior |
|----------|----------|
| `GET /all_tags` | Returns `{success: true, tags: [...]}` — all distinct tags, sorted. |
| `POST /add_tag` | Body: `{card_ids: [...], tag: "..."}`. Adds the tag to every card. |
| `POST /remove_tag` | Body: `{card_ids: [...], tag: "..."}`. Removes the tag from every card. |

Tag changes via `POST /update_card` or `POST /update_local_card` use a different shape: pass `tags` as a complete list, overwriting whatever was there. (`/add_tag` and `/remove_tag` are incremental; the others are replacements.)

## UI surfaces

Tags show up in four places:

### 1. On every card display

Below the card content, as a row of small pills (`.card-tag`). Rendered by `buildTagsHTML()` in `globals.js` (editor) and `buildPracticeTagsHtml()` in `practice/main.js` (practice). Same visual style across both pages.

### 2. Selection toolbar (editor page)

Appears at the bottom of the editor page when ≥1 card is selected (`#selection-tags-list`):

```
N selected  [🔗 Group] [❌ Deselect]
Tags: [tag1] [tag2 (partial)]  [+ tag input ▼]
```

- Shows the **union** of tags across selected cards.
- A tag present on *some but not all* selected cards has the `.partial` class (rendered lighter — visual cue: "this is mixed").
- Each pill has an `×` to remove the tag from **all selected cards** (`POST /remove_tag`).
- The input has **autocomplete** sourced from `allTagsCache`. Filtering: `t.toLowerCase().includes(query.toLowerCase()) AND not already on all selected`.
- Pressing Enter (or clicking an autocomplete suggestion) adds the tag to all selected via `POST /add_tag`.

Selection-tag logic is in `selection.js::updateSelectionTags`/`addTagToSelected`/`removeTagFromSelected`.

### 3. Local-card modal

In the create/edit modal (`local_cards.js`):

```
Tags
[tag1 ×] [tag2 ×]   [+ tag input ▼]
```

Tags are managed locally in the modal's `modalTags` array. The same autocomplete is used (also reading from `allTagsCache`). On submit:
- For a new local card: passed in the `/create_local_card` body.
- For an edit: passed in the `/update_card` or `/update_local_card` body (full list, replacing previous).

### 4. Practice page tag filter

Top of the left column (`#tag-filter`). One pill per known tag, with a **tri-state cycle on click**:

| State | Class | Effect on filter |
|-------|-------|------------------|
| neutral (default) | `.tag-pill` | no constraint |
| include | `.tag-pill.include` | card must have **at least one** include-tagged tag |
| exclude | `.tag-pill.exclude` | card with **any** exclude-tagged tag is hidden |

State cycle order on click: neutral → include → exclude → neutral.

Filter predicate (`practice/main.js::getFilteredCards`):

```js
function pass(card):
    cardTags = card.tags || []
    if excludeTags ∩ cardTags  ≠ ∅:  return false
    if |includeTags| > 0 and  includeTags ∩ cardTags == ∅:  return false
    return true
```

Filtering is **client-side** — the full queue is loaded once and re-filtered in JS. The `practice-count` element shows `filtered/total` when a filter is active.

## Cache

`allTagsCache` (in `globals.js`) is the frontend's cached list of all known tags, refreshed by `loadAllTags()` (called on editor page load and after every add/remove action). It's the source for both autocompletes (selection toolbar and local-card modal).

The practice page has its own load: `loadAllTagsPractice()` on DOMContentLoaded. The two are not kept in sync — if the practice page is open and tags change on the editor page, the practice filter won't update until reload.

## What this spec does not cover

- The visual styling of pills → `frontend/static/css/app.css` and `practice.css`.
- How autocomplete dropdowns are positioned and dismissed (basic DOM manipulation in `selection.js` and `local_cards.js`).
- The tags row's exact CSS layout (responsive wrapping behavior).

## Open questions

- **No tag rename.** To rename a tag, the user has to add the new one and remove the old one from every card. No bulk operation.
- **No tag deletion.** A tag disappears from `/all_tags` only when no card has it left.
- **No tag hierarchy.** No `subject::topic` semantics like Anki tags.
- **No exclusive inclusion.** Include is "OR" (any). There's no "AND" — i.e. "must have tag A *and* tag B."
- **No persistence of filter state.** Refreshing the practice page resets all filter pills to neutral.
- **Anki tags are ignored.** Anki's own tag field on a note is not imported. Could be useful as initial tag seeding.
- **No tag color or icon.** All pills look the same.
- **Cache invalidation across pages.** The editor and practice pages each have their own tag cache, refreshed only on actions performed on that page.
