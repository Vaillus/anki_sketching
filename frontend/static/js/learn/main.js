/**
 * learn/main.js
 * Dashboard d'apprentissage : grille de cartes dues + panneau de contexte.
 */

// ── State ────────────────────────────────────────────────────────────────────

let allDueCards = [];
let selectedCardId = null;
let reviewerCard = null;         // carte actuellement chargée dans le reviewer
const cardMinIntervals = new Map();

// ── Lightbox ──────────────────────────────────────────────────────────────────

function ensureLightbox() {
    if (document.getElementById('lightbox-backdrop')) return;
    const backdrop = document.createElement('div');
    backdrop.id = 'lightbox-backdrop';
    const img = document.createElement('img');
    img.id = 'lightbox-img';
    backdrop.appendChild(img);
    document.body.appendChild(backdrop);
    backdrop.addEventListener('click', () => backdrop.classList.remove('visible'));
}

function openLightbox(src) {
    ensureLightbox();
    document.getElementById('lightbox-img').src = src;
    document.getElementById('lightbox-backdrop').classList.add('visible');
}

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

    // Parents bar
    right.appendChild(buildContextBar(parents, 'Parents', 'parents'));

    // Children bar
    right.appendChild(buildContextBar(children, 'Enfants', 'children'));

    // Reviewer — prend les données SRS complètes depuis allDueCards
    const fullCard = allDueCards.find(c => c.card_id === card.card_id) || card;
    right.appendChild(buildInlineReviewer(fullCard));
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

// ── Inline reviewer ───────────────────────────────────────────────────────────

function buildInlineReviewer(card) {
    reviewerCard = card;

    const section = document.createElement('div');
    section.id = 'learn-reviewer';
    section.className = 'learn-reviewer';

    const allFields = Object.entries(card.texts || {});
    const firstField = allFields.slice(0, 1);
    const remainingFields = allFields.slice(1);

    const renderFields = (fields) => fields.map(([name, text]) =>
        `<div class="reviewer-field"><div class="reviewer-field-name">${name}</div><div class="reviewer-field-value">${text}</div></div>`
    ).join('');

    const imagesHtml = (card.images && card.images.length > 0)
        ? card.images.map(src => `<img src="${src}" class="reviewer-image" alt="">`).join('')
        : '';

    const intervals = card.next_reviews || [];
    const minVal = cardMinIntervals.get(String(card.card_id)) || '';

    section.innerHTML = `
        <div class="lr-front">
            <div class="reviewer-section-label">Recto</div>
            ${renderFields(firstField) || '<div class="reviewer-field-value">(sans texte)</div>'}
            ${imagesHtml ? `<div class="reviewer-images">${imagesHtml}</div>` : ''}
        </div>

        <div class="lr-show-answer-wrap">
            <button class="lr-show-answer-btn">Voir la réponse</button>
        </div>

        <div class="lr-back hidden">
            <div class="reviewer-divider"></div>
            <div class="reviewer-section-label">Verso</div>
            ${renderFields(remainingFields) || '<div class="reviewer-field-value">(sans champ supplémentaire)</div>'}
        </div>

        <div class="lr-ease-buttons hidden">
            <button class="ease-btn ease-again" data-ease="1">
                <span class="ease-label">Again</span>
                <span class="ease-interval">${intervals[0] || ''}</span>
            </button>
            <button class="ease-btn ease-hard" data-ease="2">
                <span class="ease-label">Hard</span>
                <span class="ease-interval">${intervals[1] || ''}</span>
            </button>
            <button class="ease-btn ease-good" data-ease="3">
                <span class="ease-label">Good</span>
                <span class="ease-interval">${intervals[2] || ''}</span>
            </button>
            <button class="ease-btn ease-easy" data-ease="4">
                <span class="ease-label">Easy</span>
                <span class="ease-interval">${intervals[3] || ''}</span>
            </button>
        </div>

        <div class="lr-stats hidden">
            <span class="stat-item">${card.interval > 0 ? `Intervalle : ${card.interval}j` : `Type : ${card.type_label || ''}`}</span>
            <span class="stat-item">${card.factor_percent > 0 ? `Ease : ${card.factor_percent.toFixed(0)}%` : ''}</span>
            <span class="stat-item">${card.reps !== undefined ? `Révisions : ${card.reps}` : ''}</span>
            <span class="stat-item">${card.lapses > 0 ? `Oublis : ${card.lapses}` : ''}</span>
            <span class="stat-item">Min : <input type="number" class="min-interval-input" value="${minVal}" placeholder="—" min="1" style="width:40px">j</span>
        </div>
    `;

    // Images zoomables
    section.querySelectorAll('.reviewer-image').forEach(img => {
        img.addEventListener('click', () => openLightbox(img.src));
    });

    // Voir la réponse
    section.querySelector('.lr-show-answer-btn').addEventListener('click', revealAnswer);

    // Boutons ease
    section.querySelectorAll('.ease-btn').forEach(btn => {
        btn.addEventListener('click', () => submitAnswer(parseInt(btn.dataset.ease)));
    });

    // Min interval
    section.querySelector('.min-interval-input').addEventListener('change', e => {
        const v = parseInt(e.target.value);
        const key = String(card.card_id);
        const newVal = v > 0 ? v : null;
        if (newVal) cardMinIntervals.set(key, newVal);
        else cardMinIntervals.delete(key);
        fetch('/set_card_info', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ card_id: key, min_interval: newVal }),
        });
    });

    return section;
}

function revealAnswer() {
    const reviewer = document.getElementById('learn-reviewer');
    if (!reviewer) return;
    reviewer.querySelector('.lr-back').classList.remove('hidden');
    reviewer.querySelector('.lr-ease-buttons').classList.remove('hidden');
    reviewer.querySelector('.lr-stats').classList.remove('hidden');
    reviewer.querySelector('.lr-show-answer-wrap').classList.add('hidden');
}

async function submitAnswer(ease) {
    if (!reviewerCard) return;
    const card = reviewerCard;
    reviewerCard = null;

    try {
        await fetch('/review_card', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ card_id: card.card_id, ease }),
        });
    } catch (err) {
        console.error('learn: submitAnswer failed', err);
    }

    await loadDueCards();

    // Si la carte est encore due, recharger son contexte ; sinon vider la sélection
    const stillDue = allDueCards.some(c => c.card_id === card.card_id);
    if (stillDue) {
        loadContext(card.card_id);
    } else {
        selectedCardId = null;
        const right = document.getElementById('learn-right');
        right.innerHTML = 'Sélectionne une carte';
    }
}

// ── Keyboard ──────────────────────────────────────────────────────────────────

document.addEventListener('keydown', e => {
    const reviewer = document.getElementById('learn-reviewer');
    if (!reviewer) return;

    const backHidden = reviewer.querySelector('.lr-back').classList.contains('hidden');

    if ((e.key === ' ' || e.key === 'Enter') && backHidden) {
        e.preventDefault();
        revealAnswer();
        return;
    }

    if (!backHidden) {
        if (e.key === '1') submitAnswer(1);
        else if (e.key === '2') submitAnswer(2);
        else if (e.key === '3') submitAnswer(3);
        else if (e.key === '4') submitAnswer(4);
    }
});

// ── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    loadDueCards();
    document.getElementById('learn-refresh').addEventListener('click', loadDueCards);
});
