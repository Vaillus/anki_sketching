/**
 * learn/main.js
 * Dashboard d'apprentissage : grille de cartes dues + panneau de contexte.
 */

// ── State ────────────────────────────────────────────────────────────────────

let allDueCards = [];
let selectedCardId = null;

// ── Fetch & render ───────────────────────────────────────────────────────────

async function loadDueCards() {
    const grid = document.getElementById('due-cards-grid');
    const countEl = document.getElementById('learn-count');

    grid.innerHTML = '<div class="learn-state-message">Chargement…</div>';
    countEl.textContent = '';

    try {
        const res = await fetch('/due_cards');
        const data = await res.json();

        if (!data.success) {
            grid.innerHTML = '<div class="learn-state-message">Erreur de chargement</div>';
            return;
        }

        allDueCards = data.cards;
        const n = data.total;
        countEl.textContent = `${n} carte${n > 1 ? 's' : ''}`;

        if (n === 0) {
            grid.innerHTML = '<div class="learn-state-message">Aucune carte à réviser</div>';
            return;
        }

        renderGrid();
    } catch (err) {
        console.error('learn: failed to load due cards', err);
        grid.innerHTML = '<div class="learn-state-message">Erreur réseau</div>';
    }
}

function renderGrid() {
    const grid = document.getElementById('due-cards-grid');
    grid.innerHTML = '';

    allDueCards.forEach(card => {
        const el = buildCardEl(card);
        el.addEventListener('click', () => selectCard(card.card_id));
        grid.appendChild(el);
    });

    // Re-apply selection highlight if a card was previously selected
    if (selectedCardId) {
        const el = grid.querySelector(`[data-card-id="${selectedCardId}"]`);
        if (el) el.classList.add('selected');
    }
}

function buildCardEl(card) {
    const el = document.createElement('div');
    el.className = 'learn-card';
    el.dataset.cardId = card.card_id;

    const typeClass = (card.type_label || 'new').toLowerCase();
    const firstText = Object.values(card.texts || {})[0] || '';

    const badgesHtml = `
        <div class="learn-card-badges">
            <span class="card-type ${typeClass}">${card.type_label}</span>
            <span class="learn-card-due">${card.due_display}</span>
        </div>
    `;

    const imageHtml = (card.images && card.images.length > 0)
        ? `<div class="learn-card-image"><img src="${card.images[0]}" alt="" loading="lazy"></div>`
        : '';

    const titleHtml = `<div class="learn-card-title${firstText ? '' : ' learn-card-empty'}">${firstText || '(sans texte)'}</div>`;

    el.innerHTML = badgesHtml + imageHtml + titleHtml;
    return el;
}

// ── Selection ─────────────────────────────────────────────────────────────────

function selectCard(cardId) {
    // Deselect previous in grid
    if (selectedCardId) {
        const prev = document.querySelector(`#due-cards-grid [data-card-id="${selectedCardId}"]`);
        if (prev) prev.classList.remove('selected');
    }

    selectedCardId = cardId;

    const el = document.querySelector(`#due-cards-grid [data-card-id="${cardId}"]`);
    if (el) el.classList.add('selected');

    loadContext(cardId);
}

async function loadContext(cardId) {
    const right = document.getElementById('learn-right');
    right.innerHTML = '<div class="context-loading">Chargement…</div>';

    try {
        const res = await fetch(`/learn/card/${cardId}/context`);
        const data = await res.json();

        if (!data.success) {
            right.innerHTML = '<div class="context-empty">Erreur de chargement</div>';
            return;
        }

        renderContextPanel(data.card, data.parents, data.children);
    } catch (err) {
        console.error('learn: context fetch failed', err);
        right.innerHTML = '<div class="context-empty">Erreur réseau</div>';
    }
}

function renderContextPanel(card, parents, children) {
    const right = document.getElementById('learn-right');
    right.innerHTML = '';
    right.style.display = 'flex';
    right.style.flexDirection = 'column';
    right.style.alignItems = '';
    right.style.justifyContent = '';

    // Parents bar
    const parentsBar = buildContextBar(parents, 'Parents', 'parents');
    right.appendChild(parentsBar);

    // Main card
    const mainCard = buildContextMainCard(card);
    right.appendChild(mainCard);

    // Children bar
    const childrenBar = buildContextBar(children, 'Enfants', 'children');
    right.appendChild(childrenBar);
}

function buildContextBar(cards, label, role) {
    const section = document.createElement('div');
    section.className = `context-bar context-bar--${role}`;

    if (cards.length === 0) {
        section.innerHTML = `<span class="context-bar-empty">Aucun ${label.toLowerCase()}</span>`;
        return section;
    }

    const header = document.createElement('div');
    header.className = 'context-bar-label';
    header.textContent = `${label} (${cards.length})`;
    section.appendChild(header);

    const scroll = document.createElement('div');
    scroll.className = 'context-bar-scroll';

    cards.forEach(c => {
        const mini = buildMiniCard(c);
        mini.addEventListener('click', () => {
            const isDue = allDueCards.some(d => d.card_id === c.card_id);
            if (isDue) {
                selectCard(c.card_id);
                // Scroll to card in grid
                const gridEl = document.querySelector(`#due-cards-grid [data-card-id="${c.card_id}"]`);
                if (gridEl) gridEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            } else {
                // Just highlight in context bar (no grid change)
                section.querySelectorAll('.context-mini.highlight').forEach(el => el.classList.remove('highlight'));
                mini.classList.toggle('highlight');
            }
        });
        scroll.appendChild(mini);
    });

    section.appendChild(scroll);
    return section;
}

function buildMiniCard(card) {
    const el = document.createElement('div');
    el.className = 'context-mini';
    el.dataset.cardId = card.card_id;

    const isDue = allDueCards.some(d => d.card_id === card.card_id);
    if (isDue) el.classList.add('is-due');

    const typeClass = (card.type_label || 'new').toLowerCase();
    const firstText = Object.values(card.texts || {})[0] || '';

    const imageHtml = (card.images && card.images.length > 0)
        ? `<div class="context-mini-image"><img src="${card.images[0]}" alt="" loading="lazy"></div>`
        : '';

    el.innerHTML = `
        <div class="context-mini-badge"><span class="card-type ${typeClass}">${card.type_label}</span></div>
        ${imageHtml}
        <div class="context-mini-title">${firstText || '(sans texte)'}</div>
    `;
    return el;
}

function buildContextMainCard(card) {
    const el = document.createElement('div');
    el.className = 'context-main-card';

    const typeClass = (card.type_label || 'new').toLowerCase();
    const texts = card.texts || {};

    const badgesHtml = `
        <div class="context-main-badges">
            <span class="card-type ${typeClass}">${card.type_label}</span>
        </div>
    `;

    const imagesHtml = (card.images && card.images.length > 0)
        ? `<div class="context-main-images">${card.images.map(src => `<img src="${src}" alt="" loading="lazy">`).join('')}</div>`
        : '';

    const textsHtml = Object.entries(texts).map(([field, value]) =>
        `<div class="context-main-field"><span class="context-main-field-name">${field}</span><div class="context-main-field-value">${value}</div></div>`
    ).join('');

    el.innerHTML = badgesHtml + imagesHtml + (textsHtml ? `<div class="context-main-texts">${textsHtml}</div>` : '');
    return el;
}

// ── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    loadDueCards();
    document.getElementById('learn-refresh').addEventListener('click', loadDueCards);
});
