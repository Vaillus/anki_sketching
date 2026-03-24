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
    // Deselect previous
    if (selectedCardId) {
        const prev = document.querySelector(`[data-card-id="${selectedCardId}"]`);
        if (prev) prev.classList.remove('selected');
    }

    selectedCardId = cardId;

    const el = document.querySelector(`[data-card-id="${cardId}"]`);
    if (el) el.classList.add('selected');

    // Right panel: placeholder until Phase 2
    const right = document.getElementById('learn-right');
    right.textContent = '';
    right.style.fontStyle = 'normal';
    right.style.color = '#f1eeff';
    right.textContent = 'Contexte à venir (Phase 2)';
}

// ── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    loadDueCards();
    document.getElementById('learn-refresh').addEventListener('click', loadDueCards);
});
