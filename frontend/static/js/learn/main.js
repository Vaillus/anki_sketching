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

    // Remove old SVG overlay if any
    const oldSvg = right.querySelector('.connector-svg');
    if (oldSvg) oldSvg.remove();

    // Parents bar
    right.appendChild(buildContextBar(parents, 'Parents', 'parents'));

    // Current card row (card + ease buttons)
    const fullCard = allDueCards.find(c => c.card_id === card.card_id) || card;
    right.appendChild(buildCurrentCardRow(fullCard));

    // Children bar
    right.appendChild(buildContextBar(children, 'Enfants', 'children'));

    // Draw SVG connectors after DOM settles
    requestAnimationFrame(() => drawConnectors(right));
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

// ── Current card row (card + ease buttons) ───────────────────────────────────

function buildCurrentCardRow(card) {
    reviewerCard = card;

    const row = document.createElement('div');
    row.id = 'learn-reviewer';
    row.className = 'current-card-row';

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
    const typeClass = (card.type_label || 'new').toLowerCase();

    // Current card element
    const cardEl = document.createElement('div');
    cardEl.className = 'context-current-card';

    cardEl.innerHTML = `
        <div class="context-mini-badge"><span class="card-type ${typeClass}">${card.type_label}</span></div>
        ${imagesHtml ? `<div class="current-card-images">${imagesHtml}</div>` : ''}
        <div class="current-card-fields">
            <div class="reviewer-section-label">Recto</div>
            ${renderFields(firstField) || '<div class="reviewer-field-value">(sans texte)</div>'}
            ${remainingFields.length > 0 ? `
            <div class="lr-back">
                <div class="reviewer-divider"></div>
                <div class="reviewer-section-label">Verso</div>
                ${renderFields(remainingFields)}
            </div>` : ''}
        </div>
    `;

    // Ease column
    const easeCol = document.createElement('div');
    easeCol.className = 'ease-column';

    easeCol.innerHTML = `
        <div class="lr-ease-buttons">
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
        <div class="lr-stats">
            <span class="stat-item">${card.interval > 0 ? `Intervalle : ${card.interval}j` : `Type : ${card.type_label || ''}`}</span>
            <span class="stat-item">${card.factor_percent > 0 ? `Ease : ${card.factor_percent.toFixed(0)}%` : ''}</span>
            <span class="stat-item">${card.reps !== undefined ? `Révisions : ${card.reps}` : ''}</span>
            <span class="stat-item">${card.lapses > 0 ? `Oublis : ${card.lapses}` : ''}</span>
            <span class="stat-item">Min : <input type="number" class="min-interval-input" value="${minVal}" placeholder="—" min="1" style="width:40px">j</span>
        </div>
    `;

    const spacer = document.createElement('div');
    spacer.className = 'ease-column-spacer';

    row.appendChild(spacer);
    row.appendChild(cardEl);
    row.appendChild(easeCol);

    // Images zoomables
    row.querySelectorAll('.reviewer-image').forEach(img => {
        img.addEventListener('click', () => openLightbox(img.src));
    });

    // Boutons ease
    row.querySelectorAll('.ease-btn').forEach(btn => {
        btn.addEventListener('click', () => submitAnswer(parseInt(btn.dataset.ease)));
    });

    // Min interval
    row.querySelector('.min-interval-input').addEventListener('change', e => {
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

    return row;
}

// ── SVG connector lines ──────────────────────────────────────────────────────

function drawConnectors(container) {
    // Remove old SVG
    const old = container.querySelector('.connector-svg');
    if (old) old.remove();

    const currentCard = container.querySelector('.context-current-card');
    if (!currentCard) return;

    const parentMinis = container.querySelectorAll('.context-bar--parents .context-mini');
    const childMinis = container.querySelectorAll('.context-bar--children .context-mini');

    if (parentMinis.length === 0 && childMinis.length === 0) return;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('connector-svg');

    const containerRect = container.getBoundingClientRect();

    const relPos = (el) => {
        const r = el.getBoundingClientRect();
        return {
            top: r.top - containerRect.top + container.scrollTop,
            bottom: r.bottom - containerRect.top + container.scrollTop,
            centerX: r.left + r.width / 2 - containerRect.left,
        };
    };

    const cardPos = relPos(currentCard);

    const drawArrow = (fromX, fromY, toX, toY) => {
        const dy = toY - fromY;
        const cp = Math.max(Math.abs(dy) * 0.4, 20);
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', `M${fromX},${fromY} C${fromX},${fromY + cp} ${toX},${toY - cp} ${toX},${toY}`);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', 'rgba(90,74,170,0.6)');
        path.setAttribute('stroke-width', '1.5');
        path.setAttribute('marker-end', 'url(#connector-arrow)');
        svg.appendChild(path);
    };

    // Arrow marker
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
    marker.setAttribute('id', 'connector-arrow');
    marker.setAttribute('viewBox', '0 0 10 10');
    marker.setAttribute('refX', '10');
    marker.setAttribute('refY', '5');
    marker.setAttribute('markerWidth', '6');
    marker.setAttribute('markerHeight', '6');
    marker.setAttribute('orient', 'auto-start-reverse');
    const arrowPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    arrowPath.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z');
    arrowPath.setAttribute('fill', 'rgba(90,74,170,0.6)');
    marker.appendChild(arrowPath);
    defs.appendChild(marker);
    svg.appendChild(defs);

    // Parent → current card
    parentMinis.forEach(mini => {
        const p = relPos(mini);
        drawArrow(p.centerX, p.bottom, cardPos.centerX, cardPos.top);
    });

    // Current card → children
    childMinis.forEach(mini => {
        const p = relPos(mini);
        drawArrow(cardPos.centerX, cardPos.bottom, p.centerX, p.top);
    });

    container.appendChild(svg);
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
    if (!document.getElementById('learn-reviewer')) return;
    if (e.key === '1') submitAnswer(1);
    else if (e.key === '2') submitAnswer(2);
    else if (e.key === '3') submitAnswer(3);
    else if (e.key === '4') submitAnswer(4);
});

// ── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    loadDueCards();
    document.getElementById('learn-refresh').addEventListener('click', loadDueCards);

    // Redraw connectors on resize
    window.addEventListener('resize', () => {
        const right = document.getElementById('learn-right');
        if (right.querySelector('.context-current-card')) {
            drawConnectors(right);
        }
    });
});
