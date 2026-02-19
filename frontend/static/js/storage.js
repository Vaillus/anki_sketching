const VALID_ARROW_ANCHORS = new Set(['top', 'bottom', 'left', 'right']);

function getArrowElementById(elementId) {
    return document.querySelector(`[data-card-id="${elementId}"]`) || 
        document.querySelector(`[data-group-id="${elementId}"]`);
}

function attachArrowRefreshOnImageLoad() {
    const images = canvas.querySelectorAll('img');
    images.forEach((img) => {
        if (img.complete) return;
        img.addEventListener('load', updateAllArrows, { once: true });
    });
}

function scheduleArrowLayoutRefresh() {
    updateAllArrows();
    requestAnimationFrame(updateAllArrows);
    setTimeout(updateAllArrows, 0);
    attachArrowRefreshOnImageLoad();
}

function restoreSavedArrows(arrowsData) {
    clearAllArrows();
    if (!Array.isArray(arrowsData)) return;

    arrowsData.forEach((arrowData) => {
        if (!arrowData) return;
        const { from, to, fromAnchor, toAnchor } = arrowData;
        if (!VALID_ARROW_ANCHORS.has(fromAnchor) || !VALID_ARROW_ANCHORS.has(toAnchor)) return;
        if (!getArrowElementById(from) || !getArrowElementById(to)) return;
        createArrow(from, to, fromAnchor, toAnchor);
    });

    scheduleArrowLayoutRefresh();
}

function saveCardPositions() {
    if (cards.length === 0) {
        alert('Aucune carte à sauvegarder.');
        return;
    }

    const positions = {};
    const decks = new Set(); // Pour tracker tous les decks présents

    cards.forEach(card => {
        const cardId = card.getAttribute('data-card-id');
        positions[cardId] = {
            left: parseInt(card.style.left) || 0,
            top: parseInt(card.style.top) || 0,
            zIndex: parseInt(card.style.zIndex) || 1,
            width: card.offsetWidth,
            height: card.offsetHeight
        };
        // Essaie de deviner le deck de chaque carte (basé sur le dernier deck importé)
        decks.add(currentDeck || 'mixed');
    });

    // Sauvegarde des groupes
    const groupsData = {};
    groups.forEach((group, groupId) => {
        groupsData[groupId] = {
            name: group.name,
            cards: Array.from(group.cards)
        };
    });

    // Sauvegarde des flèches
    const arrowsData = [];
    arrows.forEach((arrow) => {
        arrowsData.push({
            from: arrow.from,
            to: arrow.to,
            fromAnchor: arrow.fromAnchor,
            toAnchor: arrow.toAnchor
        });
    });

    const saveData = {
        deck: currentDeck || 'mixed', // Garde la compatibilité avec l'ancien format
        decks: Array.from(decks), // Nouvelle info : tous les decks présents
        canvas: { x: canvasX, y: canvasY, zoom: zoom },
        cards: positions,
        groups: groupsData, // Nouveau : sauvegarde des groupes
        arrows: arrowsData // Nouveau : sauvegarde des flèches
    };

    fetch('/save_positions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(saveData)
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            alert('✅ Positions, groupes et flèches sauvegardés !');
        } else {
            alert('❌ Erreur lors de la sauvegarde: ' + data.error);
        }
    })
    .catch(error => {
        alert('❌ Erreur de communication: ' + error);
    });
}

function loadCardPositions() {
    if (!currentDeck) return;

    fetch('/load_positions')
    .then(response => response.json())
    .then(data => {
        if (data.success && data.positions.deck === currentDeck) {
            const savedData = data.positions;
            
            // Restaure la position et le zoom du canvas
            if (savedData.canvas) {
                canvasX = savedData.canvas.x || 0;
                canvasY = savedData.canvas.y || 0;
                zoom = savedData.canvas.zoom || 1;
                updateCanvasTransform();
            }

            // Restaure les positions des cartes
            if (savedData.cards) {
                cards.forEach(card => {
                    const cardId = card.getAttribute('data-card-id');
                    const savedPos = savedData.cards[cardId];
                    if (savedPos) {
                        card.style.left = savedPos.left + 'px';
                        card.style.top = savedPos.top + 'px';
                        card.style.zIndex = savedPos.zIndex || 1;
                        if (savedPos.width) card.style.width = savedPos.width + 'px';
                        if (savedPos.height) card.style.height = savedPos.height + 'px';
                        cardCounter = Math.max(cardCounter, savedPos.zIndex || 1);
                    }
                });
            }

            // Restaure les groupes
            if (savedData.groups) {
                // Supprime les groupes existants
                groups.forEach((group, groupId) => {
                    if (group.element && group.element.parentNode) {
                        group.element.parentNode.removeChild(group.element);
                    }
                });
                groups.clear();
                cardGroups.clear();
                groupCounter = 0;

                // Recrée les groupes sauvegardés
                Object.keys(savedData.groups).forEach(groupId => {
                    const groupData = savedData.groups[groupId];
                    const cardIds = groupData.cards;
                    
                    // Vérifie que toutes les cartes du groupe existent
                    const existingCardIds = cardIds.filter(cardId => 
                        document.querySelector(`[data-card-id="${cardId}"]`)
                    );
                    
                    if (existingCardIds.length >= 2) {
                        createGroup(existingCardIds, groupData.name);
                    }
                });
            }

            // Restaure les flèches
            if (savedData.arrows) {
                restoreSavedArrows(savedData.arrows);
            }

            console.log('Positions et groupes restaurés pour le paquet:', currentDeck);
        }
    })
    .catch(error => {
        console.error('Erreur lors du chargement des positions:', error);
    });
}

function loadAllSavedCardsOnStartup() {
    fetch('/load_positions')
    .then(response => response.json())
    .then(data => {
        if (data.success && data.positions.cards) {
            const savedCards = data.positions.cards;
            const cardIds = Object.keys(savedCards);
            
            if (cardIds.length === 0) {
                console.log('Aucune carte sauvegardée trouvée');
                return;
            }
            
            // Récupère les informations de toutes les cartes sauvegardées
            fetch('/get_cards_by_ids', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ card_ids: cardIds })
            })
            .then(response => response.json())
            .then(cardsData => {
                if (cardsData.success && cardsData.cards.length > 0) {
                    // Vide le canvas au cas où
                    canvas.innerHTML = '';
                    cards = [];
                    
                    // Recrée toutes les cartes
                    cardsData.cards.forEach(card => {
                        const cardBox = document.createElement('div');
                        cardBox.className = 'card-box';
                        cardBox.setAttribute('data-card-id', card.card_id);
                        
                        // Applique les positions sauvegardées
                        const savedPos = savedCards[card.card_id];
                        cardBox.style.left = savedPos.left + 'px';
                        cardBox.style.top = savedPos.top + 'px';
                        cardBox.style.zIndex = savedPos.zIndex || 1;
                        if (savedPos.width) cardBox.style.width = savedPos.width + 'px';
                        if (savedPos.height) cardBox.style.height = savedPos.height + 'px';
                        cardCounter = Math.max(cardCounter, savedPos.zIndex || 1);
                        
                        let content = '';
                        if (card.type !== undefined && card.type_label) {
                            const typeClass = card.type_label.toLowerCase().replace(' ', '-');
                            content += '<div class="card-info">';
                            content += `<span class="card-type ${typeClass}">${card.type_label}</span>`;
                            if (card.due_display) {
                                content += `<span class="card-due">${card.due_display}</span>`;
                            }
                            content += '</div>';
                        }
                        for (const [field, text] of Object.entries(card.texts)) {
                            content += `<strong>${field}:</strong><p>${text}</p>`;
                        }
                        card.images.forEach(imgPath => {
                            content += `<img src="${imgPath}" alt="Image de la carte">`;
                        });

                        cardBox.innerHTML = `<div class="card-content">${content}</div>`;
                        canvas.appendChild(cardBox);
                        cards.push(cardBox);
                        makeDraggable(cardBox);
                    });
                    
                    // Restaure la vue du canvas
                    if (data.positions.canvas) {
                        canvasX = data.positions.canvas.x || 0;
                        canvasY = data.positions.canvas.y || 0;
                        zoom = data.positions.canvas.zoom || 1;
                        updateCanvasTransform();
                    }
                    
                    console.log(`${cardsData.cards.length} cartes restaurées depuis la sauvegarde`);
                    
                    // Met le select sur le dernier deck pour la compatibilité
                    if (data.positions.deck) {
                        const deckSelect = document.getElementById('deck-name');
                        deckSelect.value = data.positions.deck;
                        currentDeck = data.positions.deck;
                    }
                    
                    // Restaure les groupes sauvegardés
                    if (data.positions.groups) {
                        // Supprime les groupes existants
                        groups.forEach((group, groupId) => {
                            if (group.element && group.element.parentNode) {
                                group.element.parentNode.removeChild(group.element);
                            }
                        });
                        groups.clear();
                        cardGroups.clear();
                        groupCounter = 0;

                        // Recrée les groupes sauvegardés
                        Object.keys(data.positions.groups).forEach(groupId => {
                            const groupData = data.positions.groups[groupId];
                            const cardIds = groupData.cards;
                            
                            // Vérifie que toutes les cartes du groupe existent
                            const existingCardIds = cardIds.filter(cardId => 
                                document.querySelector(`[data-card-id="${cardId}"]`)
                            );
                            
                            if (existingCardIds.length >= 2) {
                                createGroup(existingCardIds, groupData.name);
                            }
                        });
                    }

                    // Restaure les flèches sauvegardées
                    if (data.positions.arrows) {
                        restoreSavedArrows(data.positions.arrows);
                    }

                    // Surbrillance des cartes bloquantes
                    applyBlockingHighlights();
                }
            });
        }
    })
    .catch(error => {
        console.error('Erreur lors du chargement des cartes sauvegardées:', error);
    });
}

function applyBlockingHighlights() {
    document.querySelectorAll('.card-blocking').forEach(el => el.classList.remove('card-blocking'));
    fetch('/blocking_cards')
        .then(r => r.json())
        .then(data => {
            if (!data.success) return;
            data.card_ids.forEach(cardId => {
                const el = document.querySelector(`[data-card-id="${cardId}"]`);
                if (el) el.classList.add('card-blocking');
            });
        })
        .catch(err => console.error('blocking_cards: failed to load', err));
}

function loadAllSavedCards() {
    fetch('/load_positions')
    .then(response => response.json())
    .then(data => {
        if (data.success && data.positions.cards) {
            const savedCards = data.positions.cards;
            
            // Pour chaque carte sauvegardée, on essaie de la retrouver et la positionner
            Object.keys(savedCards).forEach(cardId => {
                const cardElement = document.querySelector(`[data-card-id="${cardId}"]`);
                if (cardElement) {
                    const savedPos = savedCards[cardId];
                    cardElement.style.left = savedPos.left + 'px';
                    cardElement.style.top = savedPos.top + 'px';
                    cardElement.style.zIndex = savedPos.zIndex || 1;
                    if (savedPos.width) cardElement.style.width = savedPos.width + 'px';
                    if (savedPos.height) cardElement.style.height = savedPos.height + 'px';
                    cardCounter = Math.max(cardCounter, savedPos.zIndex || 1);
                }
            });

            // Restaure aussi le canvas
            if (data.positions.canvas) {
                canvasX = data.positions.canvas.x || 0;
                canvasY = data.positions.canvas.y || 0;
                zoom = data.positions.canvas.zoom || 1;
                updateCanvasTransform();
            }

            console.log('Toutes les cartes sauvegardées ont été repositionnées');
        }
    })
    .catch(error => {
        console.error('Erreur lors du chargement des cartes sauvegardées:', error);
    });
}
