function getExistingCardsBounds() {
    if (cards.length === 0) {
        return { minX: 0, maxY: 0 };
    }
    
    let minX = Infinity;
    let maxY = -Infinity;
    
    cards.forEach(card => {
        const left = parseInt(card.style.left) || 0;
        const top = parseInt(card.style.top) || 0;
        const height = card.offsetHeight || 220; // hauteur par défaut
        
        minX = Math.min(minX, left);
        maxY = Math.max(maxY, top + height);
    });
    
    return { minX: minX === Infinity ? 0 : minX, maxY };
}

function importDeck(deckName) {
    currentDeck = deckName; // Met à jour le paquet actuel
    
    // Ne vide PAS le canvas - garde les cartes existantes
    // canvas.innerHTML = '';
    // cards = [];
    
    fetch('/import_deck', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `deck_name=${encodeURIComponent(deckName)}`
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            alert(`Erreur: ${data.error}`);
            return;
        }
        if (data.length === 0) {
            alert('Aucune carte trouvée.');
            return;
        }

        // Calcule la position de départ pour les nouvelles cartes
        const bounds = getExistingCardsBounds();
        const startX = bounds.minX;
        const startY = bounds.maxY + 20; // 20px d'espacement

        data.forEach((card, index) => {
            const cardBox = document.createElement('div');
            cardBox.className = 'card-box';
            cardBox.setAttribute('data-card-id', card.card_id);
            
            // Position en grille (4 par rangée) à partir de la position calculée
            const cardsPerRow = 4;
            const cardWidth = 320;
            const cardHeight = 220;
            const col = index % cardsPerRow;
            const row = Math.floor(index / cardsPerRow);
            
            cardBox.style.left = (startX + col * cardWidth) + 'px';
            cardBox.style.top = (startY + row * cardHeight) + 'px';
            cardBox.style.zIndex = ++cardCounter;
            
            // Construire le contenu avec les infos de carte
            let content = '';
            
            // Ajouter les informations de planification en haut
            if (card.type !== undefined && card.type_label) {
                const typeClass = card.type_label.toLowerCase().replace(' ', '-');
                content += '<div class="card-info">';
                content += `<span class="card-type ${typeClass}">${card.type_label}</span>`;
                
                if (card.due_display) {
                    content += `<span class="card-due">${card.due_display}</span>`;
                }
                
                content += '</div>';
            }
            
            // Ajouter les champs de la carte
            for (const [field, text] of Object.entries(card.texts)) {
                content += `<strong>${field}:</strong><p>${text}</p>`;
            }
            
            // Ajouter les images
            card.images.forEach(imgPath => {
                content += `<img src="${imgPath}" alt="Image de la carte">`;
            });

            cardBox.innerHTML = `<div class="card-content">${content}</div>`;
            canvas.appendChild(cardBox);
            cards.push(cardBox); // Ajoute la carte au tableau
            makeDraggable(cardBox);
        });
        
        // Charge les positions sauvegardées après avoir créé toutes les cartes
        // Seulement si c'est le premier import (canvas vide au départ)
        setTimeout(() => {
            if (bounds.maxY === 0) { // Si c'était le premier import
                loadCardPositions();
            }
        }, 200);
        
        // Applique la répulsion après avoir chargé toutes les cartes (si pas de positions sauvées)
        setTimeout(() => physicsRepulsion(), 300);
    })
    .catch(error => {
        alert('Erreur de communication.');
        console.error('Erreur:', error);
    });
}

function makeDraggable(element) {
    let isDragging = false;
    let startX, startY, startLeft, startTop;
    let hasMoved = false; // Pour distinguer clic et drag

    element.addEventListener('mousedown', (e) => {
        // Gestion du clic droit pour le menu contextuel
        if (e.button === 2) {
            e.preventDefault();
            e.stopPropagation();
            showContextMenu(e.clientX, e.clientY, element);
            return;
        }
        
        // Gestion du clic gauche
        if (e.button === 0) {
            // Si on clique dans le corps de la carte, laisser le navigateur gérer la sélection de texte
            const isInTextContent = e.target.closest('.card-content') && !e.target.closest('.card-info');
            if (isInTextContent) {
                e.stopPropagation(); // empêche le pan du canvas
                return;
            }

            // Si on clique sur la bordure, on redimensionne au lieu de déplacer
            const resizeEdges = getResizeEdges(element, e.clientX, e.clientY);
            if (resizeEdges) {
                hasMoved = true; // évite le toggle de sélection sur click après resize
                resizingState = {
                    element: element,
                    edges: resizeEdges,
                    startX: e.clientX,
                    startY: e.clientY,
                    startLeft: parseInt(element.style.left) || 0,
                    startTop: parseInt(element.style.top) || 0,
                    startW: element.offsetWidth,
                    startH: element.offsetHeight
                };

                // Désactive temporairement les transitions pendant le resize
                element.style.transition = 'none';
                element.style.cursor = getResizeCursor(resizeEdges);

                e.preventDefault();
                e.stopPropagation();
                return;
            }

            isDragging = true;
            hasMoved = false;
            startX = e.clientX;
            startY = e.clientY;
            startLeft = parseInt(element.style.left) || 0;
            startTop = parseInt(element.style.top) || 0;
            element.style.zIndex = Math.max(++cardCounter, 10); // Toujours au moins 10 pour être au-dessus des groupes
            
            // Désactive temporairement les transitions pendant le drag
            element.style.transition = 'none';
            
            e.preventDefault();
            e.stopPropagation();
        }
    });

    element.addEventListener('mousemove', (e) => {
        if (resizingState && resizingState.element === element) return;
        const edges = getResizeEdges(element, e.clientX, e.clientY);
        if (edges) {
            element.style.cursor = getResizeCursor(edges);
        } else if (e.target.closest('.card-content') && !e.target.closest('.card-info')) {
            element.style.cursor = '';
        } else {
            element.style.cursor = 'move';
        }
    });

    element.addEventListener('mouseleave', () => {
        if (resizingState && resizingState.element === element) return;
        element.style.cursor = 'move';
    });

    element.addEventListener('click', (e) => {
        // Gère la sélection seulement si on n'a pas bougé la carte
        if (!hasMoved) {
            const isInTextContent = e.target.closest('.card-content') && !e.target.closest('.card-info');
            if (isInTextContent) return; // ne pas sélectionner la carte via un clic texte
            handleCardClick(element, e);
        }
        e.stopPropagation();
    });

    // Empêche le menu contextuel par défaut du navigateur
    element.addEventListener('contextmenu', (e) => {
        e.preventDefault();
    });
    
    // Gestion des points d'ancrage au survol
    element.addEventListener('mouseenter', () => {
        const cardId = element.getAttribute('data-card-id');
        createAnchorPoints(element, cardId);
        
        // Affiche les points d'ancrage
        const anchors = anchorPoints.get(cardId);
        if (anchors) {
            anchors.top.style.display = 'block';
            anchors.bottom.style.display = 'block';
            anchors.left.style.display = 'block';
            anchors.right.style.display = 'block';
        }
    });
    
    element.addEventListener('mouseleave', () => {
        const cardId = element.getAttribute('data-card-id');
        const anchors = anchorPoints.get(cardId);
        if (anchors) {
            anchors.top.style.display = 'none';
            anchors.bottom.style.display = 'none';
            anchors.left.style.display = 'none';
            anchors.right.style.display = 'none';
        }
    });

    document.addEventListener('mousemove', (e) => {
        if (isDragging) {
            const deltaX = (e.clientX - startX) / zoom;
            const deltaY = (e.clientY - startY) / zoom;
            
            // Si on bouge de plus de 5px, on considère que c'est un drag
            if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) {
                hasMoved = true;
            }
            
            element.style.left = (startLeft + deltaX) + 'px';
            element.style.top = (startTop + deltaY) + 'px';
            updateAllArrows();
        }
    });

    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            
            // Réactive les transitions pour l'animation de répulsion
            element.style.transition = 'left 0.3s ease-out, top 0.3s ease-out, border-color 0.2s ease';
            
            // Vérifie et repousse les cartes qui se chevauchent après le déplacement
            if (hasMoved) {
                setTimeout(() => {
                    repelOverlappingCards();
                    updateAllGroups(); // Met à jour les groupes après le déplacement
                }, 50);
            } else {
                // Même si la carte n'a pas bougé, met à jour le z-index du groupe si elle en fait partie
                const cardId = element.getAttribute('data-card-id');
                if (cardGroups.has(cardId)) {
                    const groupId = cardGroups.get(cardId);
                    updateGroupZIndex(groupId);
                }
            }
            updateAllArrows();
        }
    });
}

// Gestion globale du redimensionnement
document.addEventListener('mousemove', (e) => {
    if (!resizingState) return;

    const dx = (e.clientX - resizingState.startX) / zoom;
    const dy = (e.clientY - resizingState.startY) / zoom;

    const edges = resizingState.edges || { left: false, right: true, top: false, bottom: true };
    const startW = resizingState.startW;
    const startH = resizingState.startH;
    const startLeft = resizingState.startLeft;
    const startTop = resizingState.startTop;

    let newLeft = startLeft;
    let newTop = startTop;
    let newW = startW;
    let newH = startH;

    if (edges.right) newW = startW + dx;
    if (edges.bottom) newH = startH + dy;
    if (edges.left) {
        newW = startW - dx;
        newLeft = startLeft + dx;
    }
    if (edges.top) {
        newH = startH - dy;
        newTop = startTop + dy;
    }

    // Clamp + ajustement de position pour garder le bord opposé fixe
    if (newW < MIN_CARD_WIDTH_PX) {
        if (edges.left && !edges.right) {
            newLeft = startLeft + (startW - MIN_CARD_WIDTH_PX);
        }
        newW = MIN_CARD_WIDTH_PX;
    }
    if (newH < MIN_CARD_HEIGHT_PX) {
        if (edges.top && !edges.bottom) {
            newTop = startTop + (startH - MIN_CARD_HEIGHT_PX);
        }
        newH = MIN_CARD_HEIGHT_PX;
    }

    newLeft = Math.round(newLeft);
    newTop = Math.round(newTop);
    newW = Math.round(newW);
    newH = Math.round(newH);

    resizingState.element.style.left = newLeft + 'px';
    resizingState.element.style.top = newTop + 'px';
    resizingState.element.style.width = newW + 'px';
    resizingState.element.style.height = newH + 'px';

    // Garder les flèches/groupes synchronisés avec la nouvelle taille
    updateAllArrows();
    const cardId = resizingState.element.getAttribute('data-card-id');
    if (cardId && cardGroups.has(cardId)) {
        updateGroupBounds(cardGroups.get(cardId));
    }
});

document.addEventListener('mouseup', () => {
    if (!resizingState) return;
    // Réactive les transitions et repousse si besoin (comme après un drag)
    resizingState.element.style.transition = 'left 0.3s ease-out, top 0.3s ease-out, border-color 0.2s ease';
    setTimeout(() => {
        repelOverlappingCards();
        updateAllGroups();
    }, 50);
    resizingState = null;
});
