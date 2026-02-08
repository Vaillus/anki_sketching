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
