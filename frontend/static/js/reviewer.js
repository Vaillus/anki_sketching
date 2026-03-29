/**
 * reviewer.js
 * Modal de révision : affiche recto/verso d'une carte due et permet de répondre.
 */

(function () {
    // ── State ────────────────────────────────────────────────────────────────
    let currentCard = null;

    // ── DOM helpers ──────────────────────────────────────────────────────────
    function createModal() {
        const backdrop = document.createElement('div');
        backdrop.id = 'reviewer-backdrop';
        backdrop.innerHTML = `
            <div id="reviewer-panel">
                <button id="reviewer-close" title="Fermer (Échap)">✕</button>

                <div id="reviewer-front"></div>

                <div id="reviewer-back"></div>

                <div id="reviewer-answer-buttons">
                    <div id="reviewer-ease-buttons">
                        <button class="ease-btn ease-failed" data-action="failed">
                            <span class="ease-label">Failed</span>
                            <span class="ease-interval">1j</span>
                        </button>
                        <button class="ease-btn ease-maintain" data-action="maintain">
                            <span class="ease-label">Maintain</span>
                            <span class="ease-interval" id="reviewer-maintain-interval"></span>
                        </button>
                        <div class="ease-change-wrapper">
                            <button class="ease-btn ease-change" id="reviewer-change-btn" data-action="change">
                                <span class="ease-label">Change</span>
                                <span class="ease-interval change-preview" id="reviewer-change-preview"></span>
                            </button>
                            <div class="ease-change-editor" id="reviewer-change-editor" style="display:none">
                                <button class="change-dec" id="reviewer-change-dec">−</button>
                                <span class="change-value" id="reviewer-change-value"></span>
                                <button class="change-inc" id="reviewer-change-inc">+</button>
                                <button class="change-confirm" id="reviewer-change-confirm">OK</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(backdrop);

        if (!document.getElementById('lightbox-backdrop')) createLightbox();

        // Fermeture backdrop
        backdrop.addEventListener('click', (e) => {
            if (e.target === backdrop) closeModal();
        });

        // Fermeture bouton ✕
        document.getElementById('reviewer-close').addEventListener('click', closeModal);

        // Bouton Failed
        backdrop.querySelector('.ease-failed').addEventListener('click', () => submitAnswer('failed'));

        // Bouton Maintain
        backdrop.querySelector('.ease-maintain').addEventListener('click', () => submitAnswer('maintain'));

        // Bouton Change — affiche l'éditeur inline
        const changeBtn = document.getElementById('reviewer-change-btn');
        const changeEditor = document.getElementById('reviewer-change-editor');
        const changeValueEl = document.getElementById('reviewer-change-value');
        const changePreview = document.getElementById('reviewer-change-preview');

        changeBtn.addEventListener('click', () => {
            changeBtn.style.display = 'none';
            changeEditor.style.display = 'flex';
            document.getElementById('reviewer-change-confirm').focus();
        });

        document.getElementById('reviewer-change-dec').addEventListener('click', () => {
            const v = Math.max(1, parseInt(changeValueEl.textContent) - 1);
            changeValueEl.textContent = v;
            changePreview.textContent = `${v}j`;
        });

        document.getElementById('reviewer-change-inc').addEventListener('click', () => {
            const v = parseInt(changeValueEl.textContent) + 1;
            changeValueEl.textContent = v;
            changePreview.textContent = `${v}j`;
        });

        document.getElementById('reviewer-change-confirm').addEventListener('click', () => {
            submitAnswer('change', parseInt(changeValueEl.textContent));
        });

        return backdrop;
    }

    function getOrCreateModal() {
        return document.getElementById('reviewer-backdrop') || createModal();
    }

    function createLightbox() {
        const backdrop = document.createElement('div');
        backdrop.id = 'lightbox-backdrop';
        const img = document.createElement('img');
        img.id = 'lightbox-img';
        backdrop.appendChild(img);
        document.body.appendChild(backdrop);

        backdrop.addEventListener('click', (e) => {
            if (e.target === backdrop) closeLightbox();
        });
    }

    function openLightbox(src) {
        document.getElementById('lightbox-img').src = src;
        document.getElementById('lightbox-backdrop').classList.add('visible');
    }

    function closeLightbox() {
        document.getElementById('lightbox-backdrop').classList.remove('visible');
    }

    // ── Open / Close ─────────────────────────────────────────────────────────
    function openModal(card) {
        currentCard = card;
        const modal = getOrCreateModal();

        // Recto : premier champ + images
        const allFields = Object.entries(card.texts);
        const firstField = allFields.slice(0, 1);
        const remainingFields = allFields.slice(1);

        const renderFields = (fields) => fields.length > 0
            ? fields.map(([name, text]) =>
                `<div class="reviewer-field"><div class="reviewer-field-name">${name}</div><div class="reviewer-field-value">${text}</div></div>`
              ).join('')
            : '';

        const imagesHtml = (card.images && card.images.length > 0)
            ? card.images.map(src => `<img src="${src}" class="reviewer-image" alt="">`).join('')
            : '';

        const frontHtml = renderFields(firstField) || '<div class="reviewer-field-value">(sans texte)</div>';
        const backHtml = renderFields(remainingFields) || '<div class="reviewer-field-value">(sans champ supplémentaire)</div>';

        document.getElementById('reviewer-front').innerHTML = `
            <div class="reviewer-section-label">Recto</div>
            ${frontHtml}
            ${imagesHtml ? `<div class="reviewer-images">${imagesHtml}</div>` : ''}
        `;

        document.getElementById('reviewer-front').querySelectorAll('.reviewer-image').forEach(img => {
            img.addEventListener('click', () => openLightbox(img.src));
        });

        // Verso : champs restants (les images sont déjà au recto)
        document.getElementById('reviewer-back').innerHTML = `
            <div class="reviewer-divider"></div>
            <div class="reviewer-section-label">Verso</div>
            ${backHtml}
        `;

        // Intervalle courant pour les boutons Maintain et Change
        const currentInterval = card.interval || 1;
        document.getElementById('reviewer-maintain-interval').textContent = `${currentInterval}j`;
        document.getElementById('reviewer-change-value').textContent = currentInterval;
        document.getElementById('reviewer-change-preview').textContent = `${currentInterval}j`;

        // Reset éditeur Change
        const changeBtn = document.getElementById('reviewer-change-btn');
        const changeEditor = document.getElementById('reviewer-change-editor');
        changeBtn.style.display = '';
        changeEditor.style.display = 'none';

        modal.classList.add('visible');
    }

    function closeModal() {
        const modal = document.getElementById('reviewer-backdrop');
        if (modal) modal.classList.remove('visible');
        currentCard = null;
    }

    // ── Submit answer ─────────────────────────────────────────────────────────
    async function submitAnswer(action, interval) {
        if (!currentCard) return;
        const card = currentCard;

        const body = { card_id: card.card_id, action };
        if (action === 'change' && interval !== undefined) body.interval = interval;

        try {
            const res = await fetch('/review_card', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const data = await res.json();
            if (!data.success) {
                console.error('reviewer: review_card failed', data);
            }
        } catch (err) {
            console.error('reviewer: network error', err);
        }

        closeModal();

        // Mettre à jour le due_display sur la carte canvas
        try {
            const infoRes = await fetch('/get_cards_by_ids', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ card_ids: [card.card_id] }),
            });
            const infoData = await infoRes.json();
            if (infoData.success && infoData.cards.length > 0) {
                const updated = infoData.cards[0];
                const cardEl = document.querySelector(`[data-card-id="${card.card_id}"]`);
                if (cardEl) {
                    const dueEl = cardEl.querySelector('.card-due');
                    if (dueEl) dueEl.textContent = updated.due_display || '';
                }
            }
        } catch (err) {
            console.error('reviewer: failed to refresh card display', err);
        }

        // Rafraîchir la barre des cartes dues
        if (typeof loadDueCards === 'function') loadDueCards();
        if (typeof applyBlockingHighlights === 'function') applyBlockingHighlights();
    }

    // ── Keyboard ─────────────────────────────────────────────────────────────
    document.addEventListener('keydown', (e) => {
        const modal = document.getElementById('reviewer-backdrop');
        if (!modal || !modal.classList.contains('visible')) return;

        if (e.key === 'Escape') {
            const lb = document.getElementById('lightbox-backdrop');
            if (lb && lb.classList.contains('visible')) { closeLightbox(); return; }
            closeModal();
            return;
        }

        const changeEditor = document.getElementById('reviewer-change-editor');
        const changeValueEl = document.getElementById('reviewer-change-value');
        const changePreview = document.getElementById('reviewer-change-preview');
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
            const changeBtn = document.getElementById('reviewer-change-btn');
            if (changeBtn && changeEditor) {
                changeBtn.style.display = 'none';
                changeEditor.style.display = 'flex';
                document.getElementById('reviewer-change-confirm').focus();
            }
        }
    });

    // ── Public API ───────────────────────────────────────────────────────────
    window.openReviewer = openModal;
})();
