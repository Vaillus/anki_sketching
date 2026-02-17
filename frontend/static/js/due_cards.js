/**
 * due_cards.js
 * Fetches and renders the bottom bar of unblocked cards due today.
 */

async function loadDueCards() {
    const list = document.getElementById('due-cards-list');
    const countEl = document.getElementById('due-cards-count');

    list.innerHTML = '<div class="due-cards-loading">Chargement…</div>';
    countEl.textContent = '';

    try {
        const response = await fetch('/due_cards');
        const data = await response.json();

        if (!data.success) {
            list.innerHTML = '<div class="due-cards-empty">Erreur de chargement</div>';
            return;
        }

        if (data.cards.length === 0) {
            list.innerHTML = '<div class="due-cards-empty">Aucune carte à réviser</div>';
            countEl.textContent = '0 carte';
            return;
        }

        const n = data.total;
        countEl.textContent = `${n} carte${n > 1 ? 's' : ''}`;
        list.innerHTML = '';

        data.cards.forEach(card => {
            const chip = document.createElement('div');
            chip.className = 'due-card-chip';
            chip.dataset.cardId = card.card_id;

            const typeClass = card.type_label.toLowerCase();
            const firstText = Object.values(card.texts)[0] || '(sans texte)';

            const thumbHtml = (card.images && card.images.length > 0)
                ? `<div class="chip-thumb"><img src="${card.images[0]}" alt=""></div>`
                : `<div class="chip-thumb chip-thumb--empty"></div>`;

            chip.innerHTML = `
                ${thumbHtml}
                <div class="chip-content">
                    <div class="due-card-chip-header">
                        <span class="card-type ${typeClass}">${card.type_label}</span>
                        <span class="due-card-chip-date">${card.due_display}</span>
                    </div>
                    <div class="due-card-chip-text">${firstText}</div>
                </div>
            `;

            list.appendChild(chip);
        });

    } catch (err) {
        console.error('due_cards: failed to load', err);
        list.innerHTML = '<div class="due-cards-empty">Erreur réseau</div>';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    loadDueCards();
    document.getElementById('due-cards-refresh').addEventListener('click', loadDueCards);
});
