/**
 * learn/main.js
 * Dashboard d'apprentissage : grille de cartes dues + panneau de contexte.
 */

// ── Helpers ──────────────────────────────────────────────────────────────────

function escapeHtmlLearn(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function buildLearnTagsHtml(tags) {
    if (!tags || tags.length === 0) return '';
    return '<div class="card-tags">' +
        tags.map(t => `<span class="card-tag">${escapeHtmlLearn(t)}</span>`).join('') +
        '</div>';
}

// ── State ────────────────────────────────────────────────────────────────────

let allDueCards = [];
let selectedCardId = null;
let reviewerCard = null;         // carte actuellement chargée dans le reviewer
let includeTags = new Set();
let excludeTags = new Set();

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
        updateFilteredCount();

        if (data.total === 0) {
            grid.innerHTML = '<div class="learn-state-message">Aucune carte à réviser</div>';
            return;
        }

        renderGrid();
    } catch (err) {
        console.error('learn: failed to load due cards', err);
        grid.innerHTML = '<div class="learn-state-message">Erreur réseau</div>';
    }
}

// ── Tag filter ──────────────────────────────────────────────────────────────

async function loadAllTagsLearn() {
    try {
        const res = await fetch('/all_tags');
        const data = await res.json();
        if (data.success) renderTagFilter(data.tags);
    } catch (err) {
        console.error('learn: failed to load tags', err);
    }
}

function renderTagFilter(tags) {
    const container = document.getElementById('tag-filter');
    container.innerHTML = '';
    if (!tags || tags.length === 0) return;

    tags.forEach(tag => {
        const pill = document.createElement('span');
        pill.className = 'tag-pill';
        pill.textContent = tag;
        pill.addEventListener('click', () => cycleTagState(pill, tag));
        container.appendChild(pill);
    });
}

function cycleTagState(pill, tag) {
    if (includeTags.has(tag)) {
        // include → exclude
        includeTags.delete(tag);
        excludeTags.add(tag);
        pill.className = 'tag-pill exclude';
    } else if (excludeTags.has(tag)) {
        // exclude → neutral
        excludeTags.delete(tag);
        pill.className = 'tag-pill';
    } else {
        // neutral → include
        includeTags.add(tag);
        pill.className = 'tag-pill include';
    }
    renderGrid();
    updateFilteredCount();
}

function getFilteredCards() {
    return allDueCards.filter(card => {
        const cardTags = card.tags || [];
        if (excludeTags.size > 0 && cardTags.some(t => excludeTags.has(t))) return false;
        if (includeTags.size > 0 && !cardTags.some(t => includeTags.has(t))) return false;
        return true;
    });
}

function updateFilteredCount() {
    const countEl = document.getElementById('learn-count');
    const filtered = getFilteredCards();
    const total = allDueCards.length;
    if (filtered.length === total) {
        countEl.textContent = `${total} carte${total > 1 ? 's' : ''}`;
    } else {
        countEl.textContent = `${filtered.length}/${total} carte${total > 1 ? 's' : ''}`;
    }
}

function renderGrid() {
    const grid = document.getElementById('due-cards-grid');
    grid.innerHTML = '';

    const cards = getFilteredCards();

    if (allDueCards.length > 0 && cards.length === 0) {
        grid.innerHTML = '<div class="learn-state-message">Aucune carte pour ces filtres</div>';
        return;
    }

    cards.forEach(card => {
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

    const tagsHtml = buildLearnTagsHtml(card.tags);

    el.innerHTML = badgesHtml + imageHtml + titleHtml + tagsHtml;
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
        ${buildLearnTagsHtml(card.tags)}
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

    const typeClass = (card.type_label || 'new').toLowerCase();
    const currentInterval = card.interval || 1;

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
        ${buildLearnTagsHtml(card.tags)}
    `;

    // Ease column
    const easeCol = document.createElement('div');
    easeCol.className = 'ease-column';

    easeCol.innerHTML = `
        <div class="lr-ease-buttons">
            <button class="ease-btn ease-failed" data-action="failed">
                <span class="ease-label">Failed</span>
                <span class="ease-interval">1j</span>
            </button>
            <button class="ease-btn ease-maintain" data-action="maintain">
                <span class="ease-label">Maintain</span>
                <span class="ease-interval">${currentInterval}j</span>
            </button>
            <div class="ease-change-wrapper">
                <button class="ease-btn ease-change" data-action="change">
                    <span class="ease-label">Change</span>
                    <span class="ease-interval change-preview">${currentInterval}j</span>
                </button>
                <div class="ease-change-editor" style="display:none">
                    <button class="change-dec">−</button>
                    <span class="change-value">${currentInterval}</span>
                    <button class="change-inc">+</button>
                    <button class="change-confirm">OK</button>
                </div>
            </div>
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

    // Boutons Failed / Maintain
    easeCol.querySelector('.ease-failed').addEventListener('click', () => submitAnswer('failed'));
    easeCol.querySelector('.ease-maintain').addEventListener('click', () => submitAnswer('maintain'));

    // Bouton Change — affiche l'éditeur inline
    const changeBtn = easeCol.querySelector('.ease-change');
    const changeEditor = easeCol.querySelector('.ease-change-editor');
    const changeValueEl = easeCol.querySelector('.change-value');
    const changePreview = easeCol.querySelector('.change-preview');

    changeBtn.addEventListener('click', () => {
        changeBtn.style.display = 'none';
        changeEditor.style.display = 'flex';
        changeEditor.querySelector('.change-confirm').focus();
    });

    easeCol.querySelector('.change-dec').addEventListener('click', () => {
        const v = Math.max(1, parseInt(changeValueEl.textContent) - 1);
        changeValueEl.textContent = v;
        changePreview.textContent = `${v}j`;
    });

    easeCol.querySelector('.change-inc').addEventListener('click', () => {
        const v = parseInt(changeValueEl.textContent) + 1;
        changeValueEl.textContent = v;
        changePreview.textContent = `${v}j`;
    });

    easeCol.querySelector('.change-confirm').addEventListener('click', () => {
        submitAnswer('change', parseInt(changeValueEl.textContent));
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


async function submitAnswer(action, interval) {
    if (!reviewerCard) return;
    const card = reviewerCard;
    reviewerCard = null;

    const body = { card_id: card.card_id, action };
    if (action === 'change' && interval !== undefined) body.interval = interval;

    try {
        await fetch('/review_card', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
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

    const changeEditor = reviewer.querySelector('.ease-change-editor');
    const changeBtn = reviewer.querySelector('.ease-change');
    const changeValueEl = reviewer.querySelector('.change-value');
    const changePreview = reviewer.querySelector('.change-preview');
    const inChangeMode = changeEditor && changeEditor.style.display !== 'none';

    if (inChangeMode) {
        if (e.key === 'Enter') {
            e.preventDefault();
            submitAnswer('change', parseInt(changeValueEl.textContent));
        } else if (e.key === 'ArrowUp' || e.key === '+') {
            e.preventDefault();
            const v = parseInt(changeValueEl.textContent) + 1;
            changeValueEl.textContent = v;
            if (changePreview) changePreview.textContent = `${v}j`;
        } else if (e.key === 'ArrowDown' || e.key === '-') {
            e.preventDefault();
            const v = Math.max(1, parseInt(changeValueEl.textContent) - 1);
            changeValueEl.textContent = v;
            if (changePreview) changePreview.textContent = `${v}j`;
        }
        return;
    }

    if (e.key === '1') submitAnswer('failed');
    else if (e.key === '2') submitAnswer('maintain');
    else if (e.key === '3') {
        if (changeBtn && changeEditor) {
            changeBtn.style.display = 'none';
            changeEditor.style.display = 'flex';
            changeEditor.querySelector('.change-confirm').focus();
        }
    }
});

// ── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    loadDueCards();
    loadAllTagsLearn();
    document.getElementById('learn-refresh').addEventListener('click', loadDueCards);

    // Redraw connectors on resize
    window.addEventListener('resize', () => {
        const right = document.getElementById('learn-right');
        if (right.querySelector('.context-current-card')) {
            drawConnectors(right);
        }
    });
});
