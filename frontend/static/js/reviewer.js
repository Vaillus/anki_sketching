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
                </div>
            </div>
        `;
        document.body.appendChild(backdrop);

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

    // ── Open / Close ─────────────────────────────────────────────────────────
    function openModal(card) {
        currentCard = card;
        const modal = getOrCreateModal();

        // Recto
        const frontFields = Object.entries(card.texts);
        const frontHtml = frontFields.length > 0
            ? frontFields.map(([name, text]) =>
                `<div class="reviewer-field"><div class="reviewer-field-name">${name}</div><div class="reviewer-field-value">${text}</div></div>`
              ).join('')
            : '<div class="reviewer-field-value">(sans texte)</div>';

        // Images du recto (on affiche toutes les images disponibles)
        const imagesHtml = (card.images && card.images.length > 0)
            ? card.images.map(src => `<img src="${src}" class="reviewer-image" alt="">`).join('')
            : '';

        document.getElementById('reviewer-front').innerHTML = `
            <div class="reviewer-section-label">Recto</div>
            ${frontHtml}
            ${imagesHtml ? `<div class="reviewer-images">${imagesHtml}</div>` : ''}
        `;

        // Verso (pour l'instant on n'a pas de distinction recto/verso via l'API actuelle)
        // On affiche tous les champs au verso aussi mais l'ensemble complet
        document.getElementById('reviewer-back').innerHTML = `
            <div class="reviewer-divider"></div>
            <div class="reviewer-section-label">Verso</div>
            ${frontHtml}
            ${imagesHtml ? `<div class="reviewer-images">${imagesHtml}</div>` : ''}
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

        // Rafraîchir la barre des cartes dues
        if (typeof loadDueCards === 'function') loadDueCards();
    }

    // ── Keyboard ─────────────────────────────────────────────────────────────
    document.addEventListener('keydown', (e) => {
        const modal = document.getElementById('reviewer-backdrop');
        if (!modal || !modal.classList.contains('visible')) return;

        if (e.key === 'Escape') { closeModal(); return; }

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
