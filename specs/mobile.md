# Mobile

> Phone-only flow for `/practice`. The editor is desktop-only.

## Purpose

Make practice usable on a phone. The editor (canvas, arrows, groups) needs a real screen and pointer, so it stays desktop-only. Practice on phone uses a drilldown stack (grid → card) instead of the side-by-side desktop layout.

## Activation

Pure CSS, gated by a single media query:

```css
@media (max-width: 600px) { … }
```

No User-Agent sniffing, no server-side rendering branch. A device that crosses the breakpoint (rotation, browser resize) flips layouts live.

## Routing

| URL | Phone-width behavior |
|---|---|
| `/practice` | Renders the mobile layout |
| `/editor` (and `/` → `/editor`) | Client-side redirect to `/practice` on page load |

The redirect fires once at page-load time from the editor's bootstrap JS. Resizing from desktop into phone width while already on `/editor` does **not** redirect — only fresh navigations.

The `← Editor` link in the practice header is hidden on phone width (CSS).

## Two views, one page

`/practice` on phone has two views, only one shown at a time:

1. **Grid view** (default on load) — tag filter strip + due-cards grid, full-width.
2. **Card view** — the current card, full-width, simplified (see below).

Tapping a card in grid view transitions to card view. Tapping the header back button returns to grid view. Returning to grid view restores scroll position; the previously-selected card stays highlighted but no card is auto-opened.

There is no URL state for the selected card. The browser back button leaves the page rather than switching views. See [Open questions](#open-questions).

## Header

Same `#practice-header` element, restyled for phone width. Slots:

| View | Slots |
|---|---|
| Grid | `[title]  [count]  [↺]` |
| Card | `[← Back]  [title]  [↺]` |

The `← Editor` link is hidden. A `← Back` button replaces it in card view. A `data-view="grid"` / `data-view="card"` attribute on `#practice-main` (toggled by JS) drives which header elements are visible via CSS.

## Card view layout

The desktop right pane is *parents bar / current card + ease column / children bar* with SVG connectors. On phone, this collapses to:

```
┌──────────────────────────┐
│ [← Back] Practice  [↺]   │  header
├──────────────────────────┤
│                          │
│   ┌──────────────────┐   │
│   │ Current card     │   │  full-width (or close)
│   │ (image + fields) │   │
│   └──────────────────┘   │
│                          │
│   [ Failed     1j ]      │
│   [ Maintain   Nj ]      │  full-width stacked
│   [ Change     Nj ]      │  ease buttons
│                          │
└──────────────────────────┘
```

Tapping **Change** swaps that button for the inline editor, which stacks in the same column:

```
│   [ − ] [  14  ] [ + ]   │  number input, typable
│   [        OK        ]   │
│   [ 1j ] [ 3j ] [ 7j ]   │  preset pills, 3 per row
│   [14j ] [30j ] [60j ]   │
```

Explicitly **out for v1**:

- Parents bar
- Children bar
- SVG connectors

The desktop `current-card-row` (`grid-template-columns: 1fr auto 1fr`) collapses to a single column: card on top, ease buttons stacked beneath. Ease buttons have tap targets ≥ 44px tall — the preset pills and the `−` / `+` steppers follow the same rule.

The image carousel and lightbox stay available; the lightbox already covers the viewport on any width.

## Tag filter

Unchanged. Sits at the top of grid view and wraps to multiple rows as needed. Pills stay tappable.

## Out of scope (v1)

- Landscape phone layout (uses the same media query — a phone in landscape that exceeds 600px gets the desktop layout, by design)
- Tablet-specific layout
- Editor on phone in any form
- Parents/children context inside card view
- Swipe gestures (header back button only)
- Pull-to-refresh (the `↺` button covers it)
- URL state for the selected card

## Open questions

- **Browser back button**: should it return from card view to grid view (via `history.pushState` per selection)? Currently it does not — back leaves the page entirely.
- **Header count in card view**: keep it or drop it for space?
- **Resize back to desktop**: a phone user who somehow ends up at desktop width on `/practice` keeps the desktop layout, which is fine. The reverse (desktop session that resizes down) also flips live — fine.
