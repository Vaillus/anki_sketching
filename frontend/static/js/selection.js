function updateSelectionDisplay() {
    const count = selectedCards.size;
    selectionCount.textContent = `${count} carte(s) sélectionnée(s)`;

    if (count > 0) {
        selectionToolbar.style.display = 'block';
        updateSelectionTags();
    } else {
        selectionToolbar.style.display = 'none';
    }
}

// ===== Selection tag management =====

function updateSelectionTags() {
    const ids = Array.from(selectedCards);
    if (ids.length === 0) return;

    fetch('/get_cards_by_ids', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ card_ids: ids }),
    })
    .then(r => r.json())
    .then(data => {
        if (!data.success) return;
        const tagCounts = {};
        const total = data.cards.length;
        data.cards.forEach(card => {
            (card.tags || []).forEach(tag => {
                tagCounts[tag] = (tagCounts[tag] || 0) + 1;
            });
        });

        const listEl = document.getElementById('selection-tags-list');
        listEl.innerHTML = '';
        Object.keys(tagCounts).sort().forEach(tag => {
            const pill = document.createElement('span');
            pill.className = 'card-tag removable';
            if (tagCounts[tag] < total) pill.classList.add('partial');
            pill.innerHTML = `${escapeHtml(tag)} <span class="tag-remove">&times;</span>`;
            pill.querySelector('.tag-remove').addEventListener('click', (e) => {
                e.stopPropagation();
                removeTagFromSelected(tag);
            });
            listEl.appendChild(pill);
        });
    })
    .catch(err => console.error('updateSelectionTags:', err));
}

function addTagToSelected(tag) {
    const ids = Array.from(selectedCards);
    fetch('/add_tag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ card_ids: ids, tag }),
    })
    .then(r => r.json())
    .then(data => {
        if (data.success) {
            refreshTagsOnCards(ids);
            updateSelectionTags();
            loadAllTags();
        }
    });
}

function removeTagFromSelected(tag) {
    const ids = Array.from(selectedCards);
    fetch('/remove_tag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ card_ids: ids, tag }),
    })
    .then(r => r.json())
    .then(data => {
        if (data.success) {
            refreshTagsOnCards(ids);
            updateSelectionTags();
            loadAllTags();
        }
    });
}

function refreshTagsOnCards(cardIds) {
    fetch('/get_cards_by_ids', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ card_ids: cardIds }),
    })
    .then(r => r.json())
    .then(data => {
        if (!data.success) return;
        data.cards.forEach(card => {
            const el = document.querySelector(`[data-card-id="${card.card_id}"]`);
            if (!el) return;
            const content = el.querySelector('.card-content');
            if (!content) return;
            // Remove existing tags div
            const existing = content.querySelector('.card-tags');
            if (existing) existing.remove();
            // Add new tags
            if (card.tags && card.tags.length > 0) {
                content.insertAdjacentHTML('beforeend', buildTagsHTML(card.tags));
            }
        });
    });
}

// ===== Selection tag input =====

function initSelectionTagInput() {
    const input = document.getElementById('tag-input');
    const autocomplete = document.getElementById('tag-autocomplete');

    // Prevent canvas/keyboard interference
    ['mousedown', 'click', 'keydown'].forEach(evt => {
        input.addEventListener(evt, (e) => e.stopPropagation());
    });

    input.addEventListener('input', () => {
        const q = input.value.trim().toLowerCase();
        autocomplete.innerHTML = '';
        if (!q) { autocomplete.style.display = 'none'; return; }
        const matches = allTagsCache.filter(t =>
            t.toLowerCase().includes(q)
        ).slice(0, 8);
        if (matches.length === 0) { autocomplete.style.display = 'none'; return; }
        matches.forEach(tag => {
            const item = document.createElement('div');
            item.className = 'tag-autocomplete-item';
            item.textContent = tag;
            item.addEventListener('mousedown', (e) => {
                e.preventDefault();
                addTagToSelected(tag);
                input.value = '';
                autocomplete.style.display = 'none';
            });
            autocomplete.appendChild(item);
        });
        autocomplete.style.display = 'block';
    });

    input.addEventListener('blur', () => {
        setTimeout(() => { autocomplete.style.display = 'none'; }, 150);
    });

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const val = input.value.trim();
            if (val) {
                addTagToSelected(val);
                input.value = '';
                autocomplete.style.display = 'none';
            }
        }
    });
}

// Initialize when DOM is ready
initSelectionTagInput();

function toggleCardSelection(cardElement, forceState = null) {
    const cardId = cardElement.getAttribute('data-card-id');
    
    if (forceState === true || (forceState === null && !selectedCards.has(cardId))) {
        // Sélectionner
        selectedCards.add(cardId);
        cardElement.classList.add('selected');
        lastSelectedCard = cardElement;
    } else {
        // Désélectionner
        selectedCards.delete(cardId);
        cardElement.classList.remove('selected');
        if (lastSelectedCard === cardElement) {
            lastSelectedCard = null;
        }
    }
        
    updateSelectionDisplay();
}

function deselectAllCards() {
    selectedCards.forEach(cardId => {
        const cardElement = document.querySelector(`[data-card-id="${cardId}"]`);
        if (cardElement) {
            cardElement.classList.remove('selected');
        }
    });
    selectedCards.clear();
    lastSelectedCard = null;
    updateSelectionDisplay();
}

function handleCardClick(cardElement, event) {
    if (event.shiftKey && lastSelectedCard) {
        // Sélection multiple : sélectionne toutes les cartes entre la dernière et celle-ci
        const allCards = Array.from(document.querySelectorAll('.card-box'));
        const lastIndex = allCards.indexOf(lastSelectedCard);
        const currentIndex = allCards.indexOf(cardElement);
        
        const startIndex = Math.min(lastIndex, currentIndex);
        const endIndex = Math.max(lastIndex, currentIndex);
        
        for (let i = startIndex; i <= endIndex; i++) {
            toggleCardSelection(allCards[i], true);
        }
    } else if (event.ctrlKey || event.metaKey) {
        // Ajout/suppression à la sélection avec Ctrl/Cmd
        toggleCardSelection(cardElement);
    } else {
        // Sélection simple : désélectionne tout et sélectionne seulement cette carte
        deselectAllCards();
        toggleCardSelection(cardElement, true);
    }
}

// ===== Marquee selection =====

function startMarquee(e) {
    const rect = canvasContainer.getBoundingClientRect();
    marqueeStartX = e.clientX - rect.left;
    marqueeStartY = e.clientY - rect.top;
    isMarqueeActive = true;

    const marquee = document.getElementById('marquee-rect');
    marquee.style.left = marqueeStartX + 'px';
    marquee.style.top = marqueeStartY + 'px';
    marquee.style.width = '0px';
    marquee.style.height = '0px';
    marquee.style.display = 'block';
}

function updateMarquee(e) {
    if (!isMarqueeActive) return;

    const rect = canvasContainer.getBoundingClientRect();
    const currentX = e.clientX - rect.left;
    const currentY = e.clientY - rect.top;

    const x = Math.min(marqueeStartX, currentX);
    const y = Math.min(marqueeStartY, currentY);
    const w = Math.abs(currentX - marqueeStartX);
    const h = Math.abs(currentY - marqueeStartY);

    const marquee = document.getElementById('marquee-rect');
    marquee.style.left = x + 'px';
    marquee.style.top = y + 'px';
    marquee.style.width = w + 'px';
    marquee.style.height = h + 'px';
}

function endMarquee(e) {
    if (!isMarqueeActive) return;
    isMarqueeActive = false;

    const marquee = document.getElementById('marquee-rect');
    marquee.style.display = 'none';

    const mRect = {
        left: parseFloat(marquee.style.left),
        top: parseFloat(marquee.style.top),
        width: parseFloat(marquee.style.width),
        height: parseFloat(marquee.style.height)
    };

    // Skip tiny drags (accidental clicks)
    if (mRect.width < 5 && mRect.height < 5) return;

    // Without Ctrl/Cmd, replace selection
    if (!e.ctrlKey && !e.metaKey) {
        deselectAllCards();
    }

    // Convert marquee rect to screen coordinates
    const containerRect = canvasContainer.getBoundingClientRect();
    const marqueeScreen = {
        left: containerRect.left + mRect.left,
        top: containerRect.top + mRect.top,
        right: containerRect.left + mRect.left + mRect.width,
        bottom: containerRect.top + mRect.top + mRect.height
    };

    // Test intersection with each card
    document.querySelectorAll('.card-box').forEach(card => {
        const cardRect = card.getBoundingClientRect();
        // AABB intersection
        if (cardRect.right > marqueeScreen.left &&
            cardRect.left < marqueeScreen.right &&
            cardRect.bottom > marqueeScreen.top &&
            cardRect.top < marqueeScreen.bottom) {
            toggleCardSelection(card, true);
        }
    });

    marqueeJustEnded = true;
    setTimeout(() => { marqueeJustEnded = false; }, 0);
}

function showContextMenu(x, y, targetCard) {
    contextMenu.style.left = x + 'px';
    contextMenu.style.top = y + 'px';
    contextMenu.style.display = 'block';
    contextMenu.targetCard = targetCard;
}

function hideContextMenu() {
    contextMenu.style.display = 'none';
    contextMenu.targetCard = null;
}
