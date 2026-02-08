function calculateGroupBounds(cardIds) {
    if (cardIds.length === 0) return null;
    
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    cardIds.forEach(cardId => {
        const cardElement = document.querySelector(`[data-card-id="${cardId}"]`);
        if (cardElement) {
            const left = parseInt(cardElement.style.left) || 0;
            const top = parseInt(cardElement.style.top) || 0;
            
            // Utilise la taille réelle (pour supporter le redimensionnement)
            const width = cardElement.offsetWidth || 300;
            const height = cardElement.offsetHeight || 200;
            
            minX = Math.min(minX, left);
            minY = Math.min(minY, top);
            maxX = Math.max(maxX, left + width);
            maxY = Math.max(maxY, top + height);
        }
    });
    
    // Padding plus généreux pour éviter que la bordure passe sous les cartes
    const padding = 50;
    return {
        left: minX - padding,
        top: minY - padding,
        width: (maxX - minX) + (padding * 2),
        height: (maxY - minY) + (padding * 2)
    };
}

function createGroup(cardIds, name = null) {
    if (cardIds.length < 2) {
        alert('Un groupe doit contenir au moins 2 cartes');
        return null;
    }
    
    const groupId = `group_${++groupCounter}`;
    const groupName = name || `Groupe ${groupCounter}`;
    
    // Retire les cartes de leurs groupes existants
    cardIds.forEach(cardId => {
        if (cardGroups.has(cardId)) {
            removeCardFromGroup(cardId);
        }
    });
    
    // Calcule les dimensions du groupe
    const bounds = calculateGroupBounds(cardIds);
    if (!bounds) return null;
    
    // Crée l'élément visuel du groupe
    const groupElement = document.createElement('div');
    groupElement.className = 'group-box';
    groupElement.setAttribute('data-group-id', groupId);
    groupElement.style.left = bounds.left + 'px';
    groupElement.style.top = bounds.top + 'px';
    groupElement.style.width = bounds.width + 'px';
    groupElement.style.height = bounds.height + 'px';
    
    // Ajoute le label du groupe
    const label = document.createElement('div');
    label.className = 'group-label';
    label.textContent = groupName;
    label.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showGroupContextMenu(e.clientX, e.clientY, groupId);
    });
    groupElement.appendChild(label);
    
    // Ajoute le groupe au canvas
    canvas.appendChild(groupElement);
    
    // Met à jour les structures de données
    const cardIdSet = new Set(cardIds);
    groups.set(groupId, {
        cards: cardIdSet,
        element: groupElement,
        name: groupName
    });
    
    // Met à jour cardGroups pour tracker les cartes dans ce groupe
    cardIds.forEach(cardId => {
        cardGroups.set(cardId, groupId);
    });
    
    // Met à jour le z-index du groupe pour qu'il soit juste en dessous de ses cartes
    updateGroupZIndex(groupId);
    
    // Rend le groupe déplaçable
    makeGroupDraggable(groupElement, groupId);
    
    // Crée les points d'ancrage pour le groupe
    createAnchorPoints(groupElement, groupId);
    
    console.log(`Groupe "${groupName}" créé avec ${cardIds.length} cartes`);
    return groupId;
}

function updateGroupBounds(groupId) {
    const group = groups.get(groupId);
    if (!group) return;
    
    const cardIds = Array.from(group.cards);
    const bounds = calculateGroupBounds(cardIds);
    
    if (bounds) {
        // Vérifie que les nouvelles dimensions sont valides
        if (bounds.width > 0 && bounds.height > 0) {
            group.element.style.left = bounds.left + 'px';
            group.element.style.top = bounds.top + 'px';
            group.element.style.width = bounds.width + 'px';
            group.element.style.height = bounds.height + 'px';
        }
    }
}

function deleteGroup(groupId) {
    const group = groups.get(groupId);
    if (!group) return;
    
    // Retire les cartes du groupe
    group.cards.forEach(cardId => {
        cardGroups.delete(cardId);
    });
    
    // Supprime l'élément visuel
    if (group.element && group.element.parentNode) {
        group.element.parentNode.removeChild(group.element);
    }
    
    // Supprime les points d'ancrage du groupe
    removeAnchorPoints(groupId);
    
    // Supprime de la structure de données
    groups.delete(groupId);
    
    console.log(`Groupe "${group.name}" supprimé`);
}

function removeCardFromGroup(cardId) {
    const groupId = cardGroups.get(cardId);
    if (!groupId) return;
    
    const group = groups.get(groupId);
    if (!group) return;
    
    group.cards.delete(cardId);
    cardGroups.delete(cardId);
    
    // Si le groupe n'a plus assez de cartes, le supprimer
    if (group.cards.size < 2) {
        deleteGroup(groupId);
    } else {
        updateGroupBounds(groupId);
    }
}

function updateGroupZIndex(groupId) {
    const group = groups.get(groupId);
    if (!group) return;
    
    let minCardZIndex = Infinity;
    
    // Trouve le z-index le plus bas parmi les cartes du groupe
    group.cards.forEach(cardId => {
        const cardElement = document.querySelector(`[data-card-id="${cardId}"]`);
        if (cardElement) {
            const cardZIndex = parseInt(cardElement.style.zIndex) || 1;
            minCardZIndex = Math.min(minCardZIndex, cardZIndex);
        }
    });
    
    // Le groupe a un z-index juste en dessous de sa carte la plus basse
    if (group.element) {
        group.element.style.zIndex = Math.max(1, minCardZIndex - 1);
    }
}

function updateAllGroups() {
    groups.forEach((group, groupId) => {
        updateGroupBounds(groupId);
        updateGroupZIndex(groupId);
    });
    
    // Met à jour toutes les flèches
    updateAllArrows();
}

function showGroupContextMenu(x, y, groupId) {
    // Pour l'instant, utilisons le même menu que les cartes
    // Nous pourrions créer un menu spécifique aux groupes plus tard
    const group = groups.get(groupId);
    if (group) {
        showContextMenu(x, y, { isGroup: true, groupId: groupId, element: group.element });
    }
}

function makeGroupDraggable(groupElement, groupId) {
    let isDragging = false;
    let startX, startY;
    let initialCardPositions = new Map(); // Stocke les positions initiales des cartes
    let hasMoved = false;

    groupElement.addEventListener('mousedown', (e) => {
        // Gestion du clic droit pour le menu contextuel
        if (e.button === 2) {
            e.preventDefault();
            e.stopPropagation();
            showGroupContextMenu(e.clientX, e.clientY, groupId);
            return;
        }
        
        // Gestion du clic gauche
        if (e.button === 0) {
            isDragging = true;
            hasMoved = false;
            startX = e.clientX;
            startY = e.clientY;
            
            // Stocke les positions initiales de toutes les cartes du groupe
            const group = groups.get(groupId);
            if (group) {
                group.cards.forEach(cardId => {
                    const cardElement = document.querySelector(`[data-card-id="${cardId}"]`);
                    if (cardElement) {
                        initialCardPositions.set(cardId, {
                            left: parseInt(cardElement.style.left) || 0,
                            top: parseInt(cardElement.style.top) || 0
                        });
                    }
                });
                
                // Stocke aussi la position initiale du groupe
                initialCardPositions.set('group', {
                    left: parseInt(groupElement.style.left) || 0,
                    top: parseInt(groupElement.style.top) || 0
                });
            }
            
            // Amène le groupe au premier plan et ajoute la classe dragging
            // Le groupe garde son z-index relatif à ses cartes
            groupElement.classList.add('dragging');
            
            e.preventDefault();
            e.stopPropagation();
        }
    });

    // Empêche le menu contextuel par défaut du navigateur
    groupElement.addEventListener('contextmenu', (e) => {
        e.preventDefault();
    });
    
    // Gestion des points d'ancrage au survol
    groupElement.addEventListener('mouseenter', () => {
        // Affiche les points d'ancrage
        const anchors = anchorPoints.get(groupId);
        if (anchors) {
            anchors.top.style.display = 'block';
            anchors.bottom.style.display = 'block';
            anchors.left.style.display = 'block';
            anchors.right.style.display = 'block';
        }
    });
    
    groupElement.addEventListener('mouseleave', () => {
        // Cache les points d'ancrage
        const anchors = anchorPoints.get(groupId);
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
            
            // Déplace toutes les cartes du groupe en utilisant leurs positions initiales
            const group = groups.get(groupId);
            if (group) {
                group.cards.forEach(cardId => {
                    const cardElement = document.querySelector(`[data-card-id="${cardId}"]`);
                    if (cardElement) {
                        const initialPos = initialCardPositions.get(cardId);
                        if (initialPos) {
                            cardElement.style.left = (initialPos.left + deltaX) + 'px';
                            cardElement.style.top = (initialPos.top + deltaY) + 'px';
                        }
                    }
                });
                
                // Déplace le groupe directement avec le même delta (plus rapide que recalculer)
                const initialGroupPos = initialCardPositions.get('group');
                if (initialGroupPos) {
                    groupElement.style.left = (initialGroupPos.left + deltaX) + 'px';
                    groupElement.style.top = (initialGroupPos.top + deltaY) + 'px';
                }
            }
        }
    });

    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            
            // Retire la classe dragging
            groupElement.classList.remove('dragging');
            
            // Met à jour les bounds du groupe après le déplacement
            if (hasMoved) {
                setTimeout(() => updateGroupBounds(groupId), 50);
            }
        }
    });
}
