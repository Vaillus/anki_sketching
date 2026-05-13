# Canvas (Editor page)

> The `/editor` page: infinite canvas for laying out cards, drawing arrows, building the graph.

## Purpose

The editor is where the user **authors the graph**. It's not for reviewing cards (that's [review.md](./review.md)) — it's for arranging cards spatially, drawing prerequisite arrows, grouping related cards, and creating local cards to fill gaps.

The canvas state is auto-saved (positions, groups, arrows, pan/zoom) and is the source of truth for the graph structure ([graph.md](./graph.md#json-shape)).

## Layout

```
┌──────────────────────────────────────────────────────────────┐
│  [Practice →]  Editor                          [Anki: ●]     │ editor-header
├──────────────────────────────────────────────────────────────┤
│  Deck dropdown ▾  [Import]                                   │ toolbar
│  [💾 Save]  [🗑 Clear]  [📅 Désapprendre lointaines]          │
│                                                              │
│  [+] 100% [−] [Reset]                          Move/Select   │ zoom-controls + mode-indicator
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │                                                        │  │
│  │             Canvas (pan, zoom, drag cards)             │  │
│  │                                                        │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  Position: x, y  |  Zoom: 100%                               │ info-panel (bottom)
│                                                              │
│  ┌─ À réviser (N) ────────────────────────────────────[↺]─┐  │ due-cards-bar
│  │ [card chip] [card chip] [card chip] ...               │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘

  (Floating, when ≥1 card selected:)
  ┌──────────────────────────────────────────┐
  │ N selected · [🔗 Group] [❌ Deselect]    │ selection-toolbar
  │ Tags: [tag1] [tag2] ... [+ tag input]   │
  └──────────────────────────────────────────┘
```

Template: `frontend/templates/index.html`.
Styles: `frontend/static/css/app.css`.

## Frontend modules

All loaded as `<script>` tags from `index.html`, in this order (order matters — later modules call earlier ones):

| Module | Responsibility |
|--------|----------------|
| `globals.js` | Shared state: `canvasX/Y/zoom`, `cards[]`, `selectedCards`, `groups`, `cardGroups`, `arrows`, `anchorPoints`, `cardMinIntervals`, `allTagsCache`, DOM refs, `escapeHtml`, `buildTagsHTML`. |
| `resize.js` | Edge-drag resize: handles `mousemove` and `mouseup` while `resizingState` is set. |
| `canvas.js` | Pan/zoom: wheel handling (pinch vs scroll, see [Pan and zoom](#pan-and-zoom)), zoom buttons, marquee start. |
| `selection.js` | Selection state, marquee, shift/ctrl-click. Selection tags toolbar logic. |
| `arrows.js` | Anchor points (4 per element), arrow creation, SVG rendering, hit-testing, deletion. |
| `groups.js` | Group creation, group dragging (moves member cards), group context menu, group resize on member move. |
| `physics.js` | Repulsion: pushes cards apart so they don't overlap after import. Runs once after deck import. |
| `storage.js` | `saveCardPositions()`, `loadCardPositions()`, `loadAllSavedCardsOnStartup()`. Calls `/save_positions`, `/load_positions`, `/get_cards_by_ids`. |
| `cards.js` | `importDeck()`, `makeDraggable()`, card rendering (badges, fields, images, tags). |
| `local_cards.js` | Canvas right-click menu → "Nouvelle carte". Modal for create/edit, image upload, tag input with autocomplete. |
| `bootstrap.js` | Event listeners: form submit, toolbar buttons, context menu items, keyboard shortcuts. Triggers `loadAllSavedCardsOnStartup()` on `window.load`. |
| `due_cards.js` | Fetches `/due_cards`, renders chips in the bottom bar, clicks open the reviewer modal. |
| `anki_status.js` | Polls `/anki_status` every 5s, updates the status indicator, **reloads the page** when Anki transitions from disconnected → connected (so the deck dropdown refills). |
| `reviewer.js` | Modal review on the editor page itself (not the practice page). Same ease buttons as practice. See [review.md](./review.md#reviewer-modal). |

State lives in module-global `let`/`Map`/`Set` declarations in `globals.js` and selected modules. No framework, no reactivity — DOM is mutated directly.

## Pan and zoom

Implemented in `canvas.js`. The canvas itself is a `<div>` with a `transform: translate(x,y) scale(z)` applied; `canvasX/Y/zoom` are the source of truth.

**Pan** — three ways:
- Two-finger scroll on a trackpad (wheel event with `ctrlKey=false`).
- Mouse-drag on empty canvas in *Move* mode.
- Programmatic via the Reset button.

**Zoom** — three ways:
- Trackpad pinch (wheel event with `ctrlKey=true`, **macOS convention**). Zooms toward the cursor. Sensitivity controlled by `PINCH_ZOOM_SENSITIVITY = 0.004` and clamped per-event to `[0.98, 1.02]` to avoid jumps.
- `+` / `−` buttons (10% steps).
- Reset button (zoom=1, pan=0,0).

Zoom range: `[0.1, 3]`.

## Interaction modes

Two modes, toggled by pressing `S`:

- **Move** (default) — click-drag the empty canvas to pan.
- **Select** — click-drag the empty canvas to marquee-select cards.

The mode is shown by the `#mode-indicator` element. Both modes allow clicking cards to select them.

## Cards on the canvas

### Rendering

Cards are absolutely-positioned `<div class="card-box">` elements with `data-card-id="…"`. Initial size: 320×220 px, but the user can resize via the bottom-right handle.

Content structure (built in `cards.js::importDeck` and `storage.js::loadAllSavedCardsOnStartup`):

```html
<div class="card-box" data-card-id="…" style="left:…; top:…; z-index:…">
  <div class="card-content">
    <div class="card-info">
      <span class="card-type new|learning|review|relearning">Label</span>
      <span class="card-due">aujourd'hui | 3j | 2sem | …</span>
    </div>
    <strong>Front:</strong><p>…</p>
    <strong>Back:</strong><p>…</p>
    <img src="/static/images/…">
    <div class="card-tags"><span class="card-tag">…</span>…</div>
  </div>
  <div class="resize-handle"></div>
  <!-- anchor points injected on hover -->
</div>
```

### Interactions on a card

| Interaction | Effect |
|-------------|--------|
| Left-click (not on text) | Toggle selection. Shift/Ctrl-click extends. |
| Left-click on text content | Browser text selection (drag-select to copy). |
| Left-click + drag | Move the card. If selected, **all selected cards move together** (delta applied to each). |
| Right-click | Open card context menu. |
| Drag the bottom-right corner | Resize. Min size: 180×120 px. |
| Hover | Show 4 anchor points (`top`/`bottom`/`left`/`right`) for drawing arrows. |
| Mouse leaves card while not creating an arrow | Anchors hide. |

### Card context menu items

(See `index.html` `#context-menu`.)

| Item | Behavior |
|------|----------|
| Désélectionner | Removes the card from the selection. |
| Supprimer la carte | Removes from canvas, deletes arrows touching it. **Does not delete from `cards.db`.** |
| Mettre au premier plan | Bumps `zIndex` to `++cardCounter`. |
| Désapprendre | `POST /reschedule_card` — sets `due_date=today`, `locally_managed=1`. Refreshes blocking and the due-cards bar. |
| Intervalle minimum… | `prompt()` for an integer; calls `POST /set_card_info` with `min_interval=N` (or `null` to clear). Used by `/review_card` to clamp the next interval. |
| Modifier la carte | Opens the local-card modal in edit mode (works for both Anki and local cards — edits text and tags; image edits are local-only). |

## Arrows and groups

### Anchor points

When the mouse enters a card or group, four anchor circles appear (`top`, `bottom`, `left`, `right`). Drag from one anchor to another to create an arrow.

The **anchor identity is preserved** in the saved JSON and restored on load (`fromAnchor`, `toAnchor`). It is **purely visual** — the graph semantics only care about `(from, to)`, not which corner.

Anchors snap to other anchors within a 24-pixel radius.

### Arrow rendering

Arrows are SVG paths drawn in a dedicated overlay layer. They use cubic Bézier curves with control points offset perpendicular to the anchor direction (so an arrow from a `bottom` anchor curves downward initially). The arrowhead is an SVG `<marker>`.

### Arrow selection and deletion

- Click an arrow to select it (visually highlighted).
- Pressing `Delete` or `Backspace` while ≥1 arrow is selected removes them. The keyboard shortcut is suppressed when focus is in an input.

### Groups

- Created via the selection toolbar's **"🔗 Group"** button (requires ≥2 cards selected).
- Auto-named `Groupe N` (the counter is local and resets per session — see [Open questions](#open-questions)).
- Right-click the group label to open the group context menu (delete, rename).
- Dragging the group's background moves all member cards together.
- The dashed rectangle auto-resizes to enclose its members with 50px padding.

See [graph.md](./graph.md#groups) for the data-model side.

## Selection toolbar

Appears at the bottom-left (CSS-positioned, above the due-cards bar) whenever `selectedCards.size > 0`. Contains:

- **N selected** count.
- **🔗 Group** — creates a group (requires ≥2 selected).
- **❌ Deselect** — clears the selection.
- **Tags row** — shows the union of tags across selected cards. Tags present on *some but not all* selected cards get a `.partial` style. A text input with autocomplete (from `/all_tags`) lets you add a tag to all selected cards. See [tags.md](./tags.md).

## Local-card modal

Opened in two ways:
- Right-click empty canvas → "Nouvelle carte" (canvas context menu). The card is positioned at the right-click point (canvas coords, accounting for pan/zoom).
- Right-click an existing card → "Modifier la carte" (works for Anki and local cards; only image edits are restricted to local cards).

The modal (`#local-card-modal`) has fields: Recto (textarea), Verso (textarea), Image (paste/drag/click upload), Tags (input + autocomplete + removable pills).

Behavior:

| Action | API |
|--------|-----|
| Create local card | `POST /create_local_card` then place on canvas. |
| Update Anki card (text/tags only) | `POST /update_card`. |
| Update local card (text/tags/images) | `POST /update_local_card`. |
| Image upload | `POST /upload_image` → returns filename; appended to the card's image list. |
| Delete local card | `POST /delete_local_card`; also removes from canvas. |

Image input accepts **paste (Ctrl+V) anywhere in the modal**, drag-and-drop on the paste zone, or click to open a file picker.

## Toolbar buttons

| Button | Endpoint / behavior |
|--------|--------------------|
| Import (form submit) | `POST /import_deck` with the selected deck name. New cards are placed in a 4-column grid below existing cards. See [anki-sync.md](./anki-sync.md#import). |
| 💾 Save positions | `saveCardPositions()` → `POST /save_positions`. Always called automatically too — see [Save loop](#save-loop). |
| 🗑 Clear canvas | Wipes the in-memory state (cards, groups, arrows). Does not touch `cards.db`. Confirms first. |
| 📅 Désapprendre lointaines | `POST /reschedule_distant_cards` — sets `due_date=today` for every card with `due > today+5d`. Confirms first. |

## Save loop

The user can force-save with the 💾 button, but the app should also save automatically. Currently `saveCardPositions()` is called from:

- The 💾 button.
- Internally by other modules when state mutates (positions on drag-end, group changes, arrow create/delete — check the actual callers in code if changing behavior).

`POST /save_positions` triggers `_rebuild_edges_and_blocking()` on the backend. See [graph.md](./graph.md#when-the-graph-is-recomputed).

## Startup sequence

```
window.onload:
  1. loadAllSavedCardsOnStartup()       (storage.js)
     ├─ GET /load_positions             → JSON layout
     ├─ POST /get_cards_by_ids          → card content for the ids in the JSON
     ├─ render each card on the canvas
     ├─ restore groups from groupsData
     ├─ restore arrows from arrowsData (waits for images to load before laying out)
     └─ apply blocking highlights (GET /blocking_cards)
  2. loadAllTags()                      (globals.js)
     └─ GET /all_tags
  3. loadDueCards()                     (due_cards.js, DOMContentLoaded)
     └─ GET /due_cards
  4. checkAnkiStatus() then poll every 5s   (anki_status.js)
     └─ GET /anki_status
```

`POST /get_cards_by_ids` is the single fetch for all card content — no N+1 fetches.

## Blocking highlight

`applyBlockingHighlights()` is called after startup, after every save, after every review action. It:

1. `GET /blocking_cards` → list of card IDs that are *blocking and not blocked* (these are the leaves you actually need to work on next).
2. Adds the `.card-blocking` CSS class to matching `.card-box` elements (and removes from non-matching).

## Keyboard shortcuts

| Key | Effect |
|-----|--------|
| `S` | Toggle Move/Select mode. |
| `Delete` / `Backspace` | Delete selected arrows. |
| `Ctrl+/Cmd+` `+/−/0/=` | Suppressed (so browser zoom doesn't fight canvas zoom). |
| Arrow keys / Space / PageUp/Down / Home / End | `preventDefault` on the canvas (so they don't scroll the page) — unless focused in an input. |

## What this spec does not cover

- The graph data model (edges, group expansion, blocking propagation) → [graph.md](./graph.md).
- The card data model (fields, IDs, schema) → [cards.md](./cards.md).
- The bottom "due cards" bar's clicking-a-chip behavior (opens the reviewer modal) → [review.md](./review.md#reviewer-modal).
- Tag management details → [tags.md](./tags.md).
- The Anki connection indicator's polling and auto-reload → [anki-sync.md](./anki-sync.md#status-polling).

## Open questions

- **Save trigger coverage.** It's not 100% clear which user actions auto-save vs require pressing 💾. Likely worth auditing and ensuring every mutation triggers save (debounced).
- **`groupCounter` is per-session.** Two different sessions can produce two `group_3`s in the same JSON if the file is loaded, edited, and saved across reloads. Currently `groups.js` uses `++groupCounter`. Should derive the next ID from the max in the loaded JSON to avoid collisions.
- **No undo.** Every mutation is one-way. Considered out of scope for now, but worth flagging.
- **Selection of arrows + cards together** isn't well-defined.
- **Mobile/touch input** not supported. `gesturestart` is `preventDefault`ed.
