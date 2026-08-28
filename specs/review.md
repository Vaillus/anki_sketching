# Review

> Reviews happen on the practice page (`/practice`).

## Purpose

When a user wants to do a review session, they go to **`/practice`**. It shows the cards that are *actually reviewable right now* — due today, **and not blocked by an unlearned prerequisite** ([graph.md](./graph.md#blocking)).

For each card, the practice page also shows its immediate parents and children, so the user reviews the card *in context*. This is the main reason this app exists rather than using Anki directly.

## Scheduling model

This app uses a **deliberately simpler** scheduling than Anki's SM-2. The user is offered three options after seeing the answer:

| Button | New interval (before clamp) | Flips `is_new` to `0`? |
|--------|-----------------------------|------------------------|
| **Failed** | `1` | yes |
| **Maintain** | `current_interval` | yes |
| **Change** | `N` (user picks N: types it, steps it with `−` / `+`, or clicks a preset) | yes |

After any of the three:
- The interval is **clamped to `[1, MAX_INTERVAL_DAYS]`** (see [Interval cap](#interval-cap)).
- `is_new` → `0` (reviewed at least once).
- `due_date` → `today + new_interval`, stored as an ISO date.

The endpoint is `POST /review_card` (`src/anki_sketching/api/routes.py::review_card_endpoint`).

```
POST /review_card
Body: { card_id: "...", action: "failed" | "maintain" | "change", interval?: N }
```

A non-integer `interval` on a `change` is rejected with a 400.

After updating the row, `compute_blocking_states()` is called (descendants may become unblocked).

### Interval cap

`MAX_INTERVAL_DAYS = 60` lives in `src/graph/cards_db.py`, next to the `interval` column it
bounds. It is enforced **server-side** in `/review_card` — a single clamp applied after the
per-action branch, so no action can escape it — and mirrored in the practice UI, which never
displays or offers a value above the cap.

Without the cap, `Maintain` reconducted whatever interval was stored, so intervals imported
from Anki (up to 557 days here) survived indefinitely and an exercise could silently drop out
of rotation for a year and a half. Existing rows above the cap are cut back by
[`POST /reschedule_distant_cards`](#post-reschedule_distant_cards).

The cap is **not** applied at Anki import time: a re-import can reintroduce raw Anki intervals,
which the next run of the cutback button will clean up.

There is also a separate SM-2 implementation at `src/graph/srs.py` (ported from `anki-sm-2`, AGPL) that **is not currently wired up**. It's kept as reference material for how SM-2 works.

## The practice page

Template: `frontend/templates/practice.html`. JS: `frontend/static/js/practice/main.js` (single self-contained module). Styles: `frontend/static/css/practice.css`.

On phone-width devices, this page renders as a drilldown stack instead of side-by-side — see [mobile.md](./mobile.md).

### Layout

```
┌────────────────────────────────────────────────────────────────┐
│  [← Editor]  Practice   N cartes   [↺ Refresh]                 │ practice-header
├──────────────────┬─────────────────────────────────────────────┤
│  Tag filter      │                                             │
│  [tag1] [tag2] … │   Parents (M)                               │
│                  │   [parent card] [parent card] …             │
│  ┌────────────┐  │              │  │                           │
│  │ Card       │  │              ▼  ▼                           │
│  │ Card       │  │   ┌─────────────────────┐   ┌─[Failed 1j]─┐ │
│  │ Card       │  │   │  Current card       │   │ Maintain 5j │ │
│  │ Card       │  │   │  (front + reveal)   │   │ Change …    │ │
│  │ Card       │  │   └─────────────────────┘   └─────────────┘ │
│  └────────────┘  │              │  │                           │
│  due-cards-grid  │              ▼  ▼                           │
│                  │   Children (K)                              │
│                  │   [child card] [child card] …               │
└──────────────────┴─────────────────────────────────────────────┘
   practice-left         practice-right (context panel)
```

### Left column: the grid

`#due-cards-grid` — a flex grid of `practice-card` tiles, one per due card. Each tile shows: type badge, due-relative label, first text field (truncated), tags, and image (carousel if multiple).

Fetched by `loadDueCards()` → `GET /due_cards`. The cards arrive **pre-ordered** by `topo_depth ASC, status, due_date ASC` (see [Due cards query](#due-cards-query)) — the frontend renders them in the order received.

Clicking a card selects it and loads the right panel.

### Tag filter

A bar of pill toggles, one per distinct tag, with a tri-state cycle on click:

| State | Pill style | Effect |
|-------|------------|--------|
| neutral (default) | `.tag-pill` | no filter for this tag |
| include | `.tag-pill.include` | card must have **at least one** include tag |
| exclude | `.tag-pill.exclude` | card with **any** exclude tag is hidden |

Logic:
- A card passes if: (no include tags configured OR card has ≥1 include tag) AND (card has no exclude tags).
- Filtering is **client-side** (the full list is in `allDueCards`; `getFilteredCards()` is the predicate).
- The `practice-count` updates to show `filtered / total` when a filter is active.

### Right column: the context panel

When a card is selected, `loadContext(cardId)` calls `GET /practice/card/{id}/context`. The endpoint returns:

```json
{
  "success": true,
  "card":     { ...card... },
  "parents":  [ ...immediate parents... ],
  "children": [ ...immediate children... ]
}
```

Each card dict carries `interval` — the ease column needs it to label Maintain and to seed the
Change editor. `_build_card()` used to drop the column, so the frontend read `card.interval || 1`
and got `1` on every card: Maintain advertised "1j" while the server applied the real stored
interval. That mismatch is what let intervals grow unnoticed.

The panel renders:

1. **Parents bar** (top) — horizontal scroll of mini-cards. Empty state: "Aucun parent".
2. **Current card row** (middle) — the full card display with ease buttons to its right.
3. **Children bar** (bottom) — same as parents.
4. **SVG connectors** — curved lines from each parent's bottom to the current card's top, and from current card's bottom to each child's top. Redrawn on `resize` and after each panel render.

Mini-card click behavior:
- If the clicked card is **also due** (present in `allDueCards`), it becomes the new selection and the grid scrolls to it.
- If it's **not due** (out of scope today), it's just highlighted within the bar — no navigation.

### Current card row

The "front" is the first field in `texts`; the "back" is the rest. Both are rendered initially (there is **no flip / show-answer step** currently — see [Open questions](#open-questions)).

The image section is a carousel (`<` / `>` if multiple images). Clicking an image opens a lightbox (`#lightbox-backdrop`) that also has its own prev/next nav.

The ease column displays three buttons:

```
┌─────────────────────────────────┐
│ Failed      1j                  │
│ Maintain    <current_interval>j │
│ Change      <current_interval>j │  ← when clicked, becomes an inline editor:
│             [−] [ N ] [+]       │     N is a real number input
│             [      OK      ]    │
│             [1j] [3j] [ 7j]     │  ← presets
│             [14j][30j] [60j]    │
└─────────────────────────────────┘
```

All intervals shown here are already clamped to the [cap](#interval-cap), so the buttons never
advertise a value the server would reduce.

Clicking **Failed** or **Maintain** submits immediately. Clicking **Change** reveals the editor
and focuses the number input with its content selected, so typing replaces the value outright.
**Enter** or **OK** submits.

The editor offers three ways to reach a value, all funnelled through one `setChangeValue(v)`
helper that clamps to `[1, MAX_INTERVAL]`, writes the input, refreshes the `Change` button's
preview label, and moves the `.active` highlight onto the matching preset:

| Control | Effect |
|---------|--------|
| the number input | type a value directly |
| `−` / `+` | step by 1 |
| preset pills (`1j 3j 7j 14j 30j 60j`) | **set the value only — they do not submit**, so a preset can be picked and then nudged with `+` / `−` |

**Escape** closes the editor and restores the `Change` button.

### Keyboard shortcuts (Practice)

| Key | Effect |
|-----|--------|
| `1` | Submit Failed (only outside Change mode) |
| `2` | Submit Maintain (only outside Change mode) |
| `3` | Open the Change editor, focus the input and select its content |
| digits | Typed into the input (only in Change mode — the `1` / `2` shortcuts are inert there) |
| `↑` / `+` | Increment Change value, clamped at `MAX_INTERVAL` (only in Change mode) |
| `↓` / `-` | Decrement Change value, clamped at 1 (only in Change mode) |
| `Enter` | Submit the Change value (only in Change mode) |
| `Escape` | Close the Change editor without submitting |

The arrow and `+` / `-` handlers call `preventDefault()`: without it the keypress would both
insert a character into the input *and* trigger the native number-input stepper, moving the
value twice per press.

### Post-submit flow

After `POST /review_card`:

1. Refresh `allDueCards` via `loadDueCards()`.
2. If the just-reviewed card is **still in `allDueCards`** (shouldn't happen with the new due_date, but defensive), reload its context.
3. Otherwise clear `selectedCardId` and show "Sélectionne une carte" in the right pane.

The card's tile disappears from the grid (because the next-due-date is now in the future), and any newly-unblocked descendants appear (because `compute_blocking_states` was called server-side).

## Due cards query

`GET /due_cards` returns the queue. The query is in `api/routes.py::get_due_cards`:

```sql
SELECT <cols>
FROM cards
WHERE is_blocked = 0
  AND (
    is_new = 1
    OR due_date IS NULL
    OR date(due_date) <= date('now', 'localtime')
  )
ORDER BY
  topo_depth ASC,
  CASE
    WHEN is_new = 0 AND due_date IS NULL THEN 0  -- "review now" (no date) first
    WHEN is_new = 0 AND due_date IS NOT NULL THEN 1  -- then dated review cards
    ELSE 2                                         -- new cards last
  END,
  due_date ASC
```

Note: **new cards (`is_new = 1`) are sorted to the end** of each `topo_depth` bucket. This is deliberate — finish what you've started before adding new material.

Each row is then converted to the standard card-dict shape via `_card_from_db_row()` and returned in `{success: true, cards: [...], total: N}`.

## Reschedule operations

Two operations don't go through the reviewer but affect scheduling:

### `POST /reschedule_card`

Body: `{card_id}`. Sets `due_date = today`. Triggered by the **"Désapprendre"** context menu item on the canvas. Recomputes blocking. Rejects local card IDs.

### `POST /reschedule_distant_cards`

No body. Triggered by the toolbar "📅 Désapprendre lointaines" button. Performs **two
independent** updates:

| Update | Selector | Effect |
|--------|----------|--------|
| snap | `is_new = 0 AND due_date IS NOT NULL AND date(due_date) > today+5d` | `due_date = today` |
| cut back | `interval > MAX_INTERVAL_DAYS` | `interval = MAX_INTERVAL_DAYS` |

The two card sets do not coincide — a card can carry a 557-day interval while being due
tomorrow — so neither update is a filter on the other. Returns
`{success, rescheduled, capped}`; the toolbar reports both counts.

Snapping alone was not enough: it made distant cards due again but left the oversized interval
in place, so the first `Maintain` sent the card straight back out to 557 days. The cut back is
the missing half of what the button already meant to do.

`compute_blocking_states()` runs once, after both updates.

These are workflow tools for "I haven't been doing reviews for a while, snap everything back to today so I can catch up."

## What this spec does not cover

- How blocking gates the queue → [graph.md](./graph.md#blocking).
- Tag filtering details → [tags.md](./tags.md).

## Open questions

- **No "show answer" step.** The practice page shows front + back simultaneously. Worth adding a reveal step for genuine self-testing.
- **SM-2 module is dead code.** `src/graph/srs.py` is fully implemented (Again/Hard/Good/Easy with ease-factor updates and fuzz) but never imported. Kept as reference material on how SM-2 works.
- **No batch review.** Cards are reviewed one at a time. There's no "session" notion (count, progress, time spent).
- **No "skip" or "snooze".** The only way out of a card is to answer it.
- **Practice page does not refresh blocking highlights on the canvas** when navigated away (but the canvas reloads from scratch on navigation anyway).
