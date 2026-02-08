// Gestion du formulaire d'import
document.getElementById('import-form').addEventListener('submit', function(event) {
    event.preventDefault();
    const deckName = document.getElementById('deck-name').value;
    importDeck(deckName);
});

// Gestionnaire pour le bouton de sauvegarde
document.getElementById('save-positions').addEventListener('click', saveCardPositions);

// Gestionnaire pour le bouton vider le canvas
document.getElementById('clear-canvas').addEventListener('click', function() {
    if (confirm('Voulez-vous vraiment vider le canvas ? Toutes les cartes seront supprimées.')) {
        canvas.innerHTML = '';
        cards = [];
        currentDeck = '';
        cardCounter = 0;
        deselectAllCards(); // Vide aussi la sélection
        
        // Vide aussi les groupes
        groups.clear();
        cardGroups.clear();
        groupCounter = 0;
    }
});

// ===== GESTIONNAIRES D'ÉVÉNEMENTS POUR LA SÉLECTION =====

// Menu contextuel - Désélectionner
document.getElementById('context-deselect').addEventListener('click', () => {
    if (contextMenu.targetCard) {
        toggleCardSelection(contextMenu.targetCard, false);
    }
    hideContextMenu();
});

// Menu contextuel - Supprimer
document.getElementById('context-delete').addEventListener('click', () => {
    if (contextMenu.targetCard) {
        if (contextMenu.targetCard.isGroup) {
            // Supprimer un groupe
            deleteGroup(contextMenu.targetCard.groupId);
        } else {
            // Supprimer une carte
            const cardId = contextMenu.targetCard.getAttribute('data-card-id');
            selectedCards.delete(cardId);
            cards = cards.filter(card => card !== contextMenu.targetCard);
            
            // Retire la carte de son groupe si elle en fait partie
            if (cardGroups.has(cardId)) {
                removeCardFromGroup(cardId);
            }
            
            contextMenu.targetCard.remove();
            updateSelectionDisplay();
        }
    }
    hideContextMenu();
});

// Menu contextuel - Mettre au premier plan
document.getElementById('context-bring-front').addEventListener('click', () => {
    if (contextMenu.targetCard) {
        contextMenu.targetCard.style.zIndex = ++cardCounter;
    }
    hideContextMenu();
});

// Barre d'outils - Grouper
document.getElementById('group-selected').addEventListener('click', () => {
    if (selectedCards.size >= 2) {
        const cardIds = Array.from(selectedCards);
        const groupId = createGroup(cardIds);
        if (groupId) {
            deselectAllCards(); // Désélectionne les cartes après groupement
        }
    } else {
        alert('Sélectionnez au moins 2 cartes pour créer un groupe');
    }
});

// Barre d'outils - Tout désélectionner
document.getElementById('deselect-all').addEventListener('click', () => {
    deselectAllCards();
});

// Clic global pour cacher le menu contextuel et désélectionner
document.addEventListener('click', (e) => {
    // Cache le menu contextuel si on clique ailleurs
    if (!contextMenu.contains(e.target)) {
        hideContextMenu();
    }
    
    // Désélectionne tout si on clique sur le canvas (pas sur une carte)
    if (e.target === canvas || e.target === canvasContainer) {
        deselectAllCards();
    }
});

// Empêche la propagation des clics dans les barres d'outils
document.getElementById('toolbar').addEventListener('click', (e) => {
    e.stopPropagation();
});

document.getElementById('zoom-controls').addEventListener('click', (e) => {
    e.stopPropagation();
});

selectionToolbar.addEventListener('click', (e) => {
    e.stopPropagation();
});

contextMenu.addEventListener('click', (e) => {
    e.stopPropagation();
});

// Empêche le zoom/pan accidentel du navigateur
document.addEventListener('keydown', function(e) {
    // Empêche Ctrl+Zoom et autres raccourcis de zoom
    if ((e.ctrlKey || e.metaKey) && (e.key === '+' || e.key === '-' || e.key === '0' || e.key === '=' || e.wheelDelta)) {
        e.preventDefault();
    }
    // Empêche les flèches de déplacer la page
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'PageUp', 'PageDown', 'Home', 'End'].includes(e.key)) {
        // Ne pas empêcher si on est dans un champ de saisie
        if (!['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) {
            e.preventDefault();
        }
    }
});

// Empêche le zoom par pincement sur mobile/trackpad
document.addEventListener('gesturestart', function(e) {
    e.preventDefault();
});
document.addEventListener('gesturechange', function(e) {
    e.preventDefault();
});
document.addEventListener('gestureend', function(e) {
    e.preventDefault();
});

// Initialisation
updateCanvasTransform();

// Charge automatiquement toutes les cartes sauvegardées au chargement de la page
window.addEventListener('load', () => {
    loadAllSavedCardsOnStartup();
});
