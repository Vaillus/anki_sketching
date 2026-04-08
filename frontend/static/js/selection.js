function updateSelectionDisplay() {
    const count = selectedCards.size;
    selectionCount.textContent = `${count} carte(s) sélectionnée(s)`;
    
    if (count > 0) {
        selectionToolbar.style.display = 'block';
    } else {
        selectionToolbar.style.display = 'none';
    }
}

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
