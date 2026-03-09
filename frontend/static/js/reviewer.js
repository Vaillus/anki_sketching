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

                <div id="reviewer-show-answer-wrap">
                    <button id="reviewer-show-answer">Voir la réponse</button>
                </div>

                <div id="reviewer-back" class="hidden"></div>

                <div id="reviewer-answer-buttons" class="hidden">
                    <div id="reviewer-ease-buttons">
                        <button class="ease-btn ease-again" data-ease="1">
                            <span class="ease-label">Again</span>
                            <span class="ease-interval" id="interval-again"></span>
                        </button>
                        <button class="ease-btn ease-hard" data-ease="2">
                            <span class="ease-label">Hard</span>
                            <span class="ease-interval" id="interval-hard"></span>
                        </button>
                        <button class="ease-btn ease-good" data-ease="3">
                            <span class="ease-label">Good</span>
                            <span class="ease-interval" id="interval-good"></span>
                        </button>
                        <button class="ease-btn ease-easy" data-ease="4">
                            <span class="ease-label">Easy</span>
                            <span class="ease-interval" id="interval-easy"></span>
                        </button>
                    </div>
                </div>

                <div id="reviewer-stats" class="hidden">
                    <span class="stat-item" id="stat-interval"></span>
                    <span class="stat-item" id="stat-factor"></span>
                    <span class="stat-item" id="stat-reps"></span>
                    <span class="stat-item" id="stat-lapses"></span>
                    <span class="stat-item" id="stat-min-interval"></span>
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

        // Voir la réponse
        document.getElementById('reviewer-show-answer').addEventListener('click', revealAnswer);

        // Boutons de réponse
        backdrop.querySelectorAll('.ease-btn').forEach(btn => {
            btn.addEventListener('click', () => submitAnswer(parseInt(btn.dataset.ease)));
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

        // Intervalles next_reviews
        const intervals = card.next_reviews || [];
        ['again', 'hard', 'good', 'easy'].forEach((name, i) => {
            const el = document.getElementById(`interval-${name}`);
            if (el) el.textContent = intervals[i] || '';
        });

        // Stats
        const typeLabel = card.type_label || '';
        document.getElementById('stat-interval').textContent =
            card.interval > 0 ? `Intervalle : ${card.interval}j` : `Type : ${typeLabel}`;
        document.getElementById('stat-factor').textContent =
            card.factor_percent > 0 ? `Ease : ${card.factor_percent.toFixed(0)}%` : '';
        document.getElementById('stat-reps').textContent =
            card.reps !== undefined ? `Révisions : ${card.reps}` : '';
        document.getElementById('stat-lapses').textContent =
            card.lapses > 0 ? `Oublis : ${card.lapses}` : '';

        // Champ min_interval (editable inline)
        const minVal = cardMinIntervals.get(String(card.card_id)) || '';
        document.getElementById('stat-min-interval').innerHTML =
            `Min : <input type="number" id="min-interval-input" value="${minVal}" placeholder="—" min="1" style="width:40px">j`;
        document.getElementById('min-interval-input').addEventListener('change', e => {
            const v = parseInt(e.target.value);
            const key = String(card.card_id);
            const newVal = v > 0 ? v : null;
            if (newVal) cardMinIntervals.set(key, newVal);
            else cardMinIntervals.delete(key);
            fetch('/set_card_info', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ card_id: key, min_interval: newVal })
            });
        });

        // Reset état
        document.getElementById('reviewer-back').classList.add('hidden');
        document.getElementById('reviewer-answer-buttons').classList.add('hidden');
        document.getElementById('reviewer-stats').classList.add('hidden');
        document.getElementById('reviewer-show-answer-wrap').classList.remove('hidden');

        modal.classList.add('visible');
    }

    function closeModal() {
        const modal = document.getElementById('reviewer-backdrop');
        if (modal) modal.classList.remove('visible');
        currentCard = null;
    }

    function revealAnswer() {
        document.getElementById('reviewer-back').classList.remove('hidden');
        document.getElementById('reviewer-answer-buttons').classList.remove('hidden');
        document.getElementById('reviewer-stats').classList.remove('hidden');
        document.getElementById('reviewer-show-answer-wrap').classList.add('hidden');
    }

    // ── Submit answer ─────────────────────────────────────────────────────────
    async function submitAnswer(ease) {
        if (!currentCard) return;
        const card = currentCard;

        try {
            const res = await fetch('/review_card', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ card_id: card.card_id, ease }),
            });
            const data = await res.json();
            if (!data.success) {
                console.error('reviewer: answerCards failed', data);
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

        const backHidden = document.getElementById('reviewer-back').classList.contains('hidden');
        if (e.key === ' ' || e.key === 'Enter') {
            if (backHidden) revealAnswer();
            return;
        }

        if (!backHidden) {
            if (e.key === '1') submitAnswer(1);
            else if (e.key === '2') submitAnswer(2);
            else if (e.key === '3') submitAnswer(3);
            else if (e.key === '4') submitAnswer(4);
        }
    });

    // ── Public API ───────────────────────────────────────────────────────────
    window.openReviewer = openModal;
})();
