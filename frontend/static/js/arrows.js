function createAnchorPoints(element, elementId) {
    // Supprime les points d'ancrage existants
    removeAnchorPoints(elementId);
    
    // Crée le point d'ancrage du haut (entrée)
    const topAnchor = document.createElement('div');
    topAnchor.className = 'anchor-point top';
    topAnchor.setAttribute('data-anchor', 'top');
    topAnchor.setAttribute('data-element-id', elementId);
    
    // Crée le point d'ancrage du bas (sortie)
    const bottomAnchor = document.createElement('div');
    bottomAnchor.className = 'anchor-point bottom';
    bottomAnchor.setAttribute('data-anchor', 'bottom');
    bottomAnchor.setAttribute('data-element-id', elementId);
    
    // Crée le point d'ancrage de gauche (entrée)
    const leftAnchor = document.createElement('div');
    leftAnchor.className = 'anchor-point left';
    leftAnchor.setAttribute('data-anchor', 'left');
    leftAnchor.setAttribute('data-element-id', elementId);
    
    // Crée le point d'ancrage de droite (sortie)
    const rightAnchor = document.createElement('div');
    rightAnchor.className = 'anchor-point right';
    rightAnchor.setAttribute('data-anchor', 'right');
    rightAnchor.setAttribute('data-element-id', elementId);
    
    // Ajoute les points d'ancrage à l'élément
    element.appendChild(topAnchor);
    element.appendChild(bottomAnchor);
    element.appendChild(leftAnchor);
    element.appendChild(rightAnchor);
    
    // Stocke les références
    anchorPoints.set(elementId, {
        top: topAnchor,
        bottom: bottomAnchor,
        left: leftAnchor,
        right: rightAnchor
    });
    
    // Ajoute les gestionnaires d'événements
    addAnchorPointEventListeners(topAnchor, bottomAnchor, leftAnchor, rightAnchor, elementId);
}

function removeAnchorPoints(elementId) {
    const anchors = anchorPoints.get(elementId);
    if (anchors) {
        if (anchors.top && anchors.top.parentNode) {
            anchors.top.parentNode.removeChild(anchors.top);
        }
        if (anchors.bottom && anchors.bottom.parentNode) {
            anchors.bottom.parentNode.removeChild(anchors.bottom);
        }
        if (anchors.left && anchors.left.parentNode) {
            anchors.left.parentNode.removeChild(anchors.left);
        }
        if (anchors.right && anchors.right.parentNode) {
            anchors.right.parentNode.removeChild(anchors.right);
        }
        anchorPoints.delete(elementId);
    }
}

function addAnchorPointEventListeners(topAnchor, bottomAnchor, leftAnchor, rightAnchor, elementId) {
    topAnchor.addEventListener('click', (e) => {
        e.stopPropagation();
        handleAnchorClick(elementId, 'top');
    });
    
    bottomAnchor.addEventListener('click', (e) => {
        e.stopPropagation();
        handleAnchorClick(elementId, 'bottom');
    });
    
    leftAnchor.addEventListener('click', (e) => {
        e.stopPropagation();
        handleAnchorClick(elementId, 'left');
    });
    
    rightAnchor.addEventListener('click', (e) => {
        e.stopPropagation();
        handleAnchorClick(elementId, 'right');
    });
}

function handleAnchorClick(elementId, anchorType) {
    if (!isCreatingArrow) {
        startArrowCreation(elementId, anchorType);
        return;
    }
    
    if (!arrowStart) {
        startArrowCreation(elementId, anchorType);
        return;
    }
    
    if (arrowStart.elementId === elementId && arrowStart.anchorType === anchorType) {
        endArrowCreation();
        return;
    }
    
    if (arrowStart.elementId === elementId) {
        endArrowCreation();
        return;
    }
    
    createArrow(arrowStart.elementId, elementId, arrowStart.anchorType, anchorType);
    endArrowCreation();
}

function getAnchorByType(anchors, anchorType) {
    if (!anchors) return null;
    switch (anchorType) {
        case 'top':
            return anchors.top;
        case 'bottom':
            return anchors.bottom;
        case 'left':
            return anchors.left;
        case 'right':
            return anchors.right;
        default:
            return null;
    }
}

function startArrowCreation(elementId, anchorType) {
    isCreatingArrow = true;
    arrowStart = { elementId, anchorType };
    
    // Ajoute la classe creating au point d'ancrage de départ
    const anchors = anchorPoints.get(elementId);
    const startAnchor = getAnchorByType(anchors, anchorType);
    if (startAnchor) startAnchor.classList.add('creating');
    
    console.log(`Création de flèche commencée depuis ${elementId} (${anchorType})`);
}

function endArrowCreation() {
    isCreatingArrow = false;
    arrowStart = null;
    
    // Retire la classe creating de tous les points d'ancrage
    document.querySelectorAll('.anchor-point.creating').forEach(anchor => {
        anchor.classList.remove('creating');
    });
    
    console.log('Création de flèche terminée');
}

function createArrow(fromElementId, toElementId, fromAnchorType, toAnchorType) {
    const arrowId = `arrow_${++arrowCounter}`;
    const markerId = `arrowhead_${arrowId}`;
    
    // Crée l'élément SVG pour la flèche
    const arrowElement = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    arrowElement.setAttribute('data-arrow-id', arrowId);
    arrowElement.style.position = 'absolute';
    arrowElement.style.zIndex = '50';
    arrowElement.style.pointerEvents = 'none';
    
    // Ajoute l'élément SVG au canvas
    canvas.appendChild(arrowElement);
    
    // Stocke les informations de la flèche
    // Ajoute la pointe de flèche
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
    marker.setAttribute('id', markerId);
    marker.setAttribute('markerWidth', '10');
    marker.setAttribute('markerHeight', '7');
    marker.setAttribute('refX', '9');
    marker.setAttribute('refY', '3.5');
    marker.setAttribute('orient', 'auto');
    
    const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    polygon.setAttribute('points', '0 0, 10 3.5, 0 7');
    polygon.setAttribute('fill', '#2196F3');
    
    marker.appendChild(polygon);
    defs.appendChild(marker);
    arrowElement.appendChild(defs);
    
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('stroke', '#2196F3');
    path.setAttribute('stroke-width', '3');
    path.setAttribute('fill', 'none');
    path.setAttribute('marker-end', `url(#${markerId})`);
    path.setAttribute('data-arrow-id', arrowId);
    path.style.pointerEvents = 'stroke';
    path.addEventListener('contextmenu', handleArrowContextMenu);
    arrowElement.appendChild(path);
    
    arrows.set(arrowId, {
        from: fromElementId,
        to: toElementId,
        fromAnchor: fromAnchorType,
        toAnchor: toAnchorType,
        element: arrowElement,
        path: path,
        markerId: markerId
    });
    
    // Met à jour la position de la flèche
    updateArrowPosition(arrowId);
    
    console.log(`Flèche créée: ${fromElementId} (${fromAnchorType}) → ${toElementId} (${toAnchorType})`);
    return arrowId;
}

function updateArrowPosition(arrowId) {
    const arrow = arrows.get(arrowId);
    if (!arrow) return;
    
    const fromElement = document.querySelector(`[data-card-id="${arrow.from}"]`) || 
                      document.querySelector(`[data-group-id="${arrow.from}"]`);
    const toElement = document.querySelector(`[data-card-id="${arrow.to}"]`) || 
                    document.querySelector(`[data-group-id="${arrow.to}"]`);
    
    if (!fromElement || !toElement) return;
    
    // Calcule les positions des points d'ancrage
    const fromPos = getAnchorPosition(fromElement, arrow.fromAnchor);
    const toPos = getAnchorPosition(toElement, arrow.toAnchor);
    
    if (!fromPos || !toPos) return;
    
    // Calcule les dimensions du SVG
    const minX = Math.min(fromPos.x, toPos.x);
    const minY = Math.min(fromPos.y, toPos.y);
    const width = Math.abs(toPos.x - fromPos.x);
    const height = Math.abs(toPos.y - fromPos.y);
    
    // Configure le SVG
    arrow.element.setAttribute('width', Math.max(width, 1));
    arrow.element.setAttribute('height', Math.max(height, 1));
    arrow.element.style.left = minX + 'px';
    arrow.element.style.top = minY + 'px';
    
    // Crée le chemin de la flèche
    const startX = fromPos.x - minX;
    const startY = fromPos.y - minY;
    const endX = toPos.x - minX;
    const endY = toPos.y - minY;
    
    arrow.path.setAttribute('d', `M ${startX} ${startY} L ${endX} ${endY}`);
}

function getAnchorPosition(element, anchorType) {
    const rect = element.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    const scale = zoom || 1;
    
    let x, y;
    
    switch (anchorType) {
        case 'top':
            x = (rect.left - canvasRect.left + rect.width / 2) / scale;
            y = (rect.top - canvasRect.top) / scale;
            break;
        case 'bottom':
            x = (rect.left - canvasRect.left + rect.width / 2) / scale;
            y = (rect.top - canvasRect.top + rect.height) / scale;
            break;
        case 'left':
            x = (rect.left - canvasRect.left) / scale;
            y = (rect.top - canvasRect.top + rect.height / 2) / scale;
            break;
        case 'right':
            x = (rect.left - canvasRect.left + rect.width) / scale;
            y = (rect.top - canvasRect.top + rect.height / 2) / scale;
            break;
        default:
            return null;
    }
    
    return { x, y };
}

function updateAllArrows() {
    arrows.forEach((arrow, arrowId) => {
        updateArrowPosition(arrowId);
    });
}

function handleArrowContextMenu(e) {
    e.preventDefault();
    e.stopPropagation();
    const arrowId = e.currentTarget.getAttribute('data-arrow-id');
    if (arrowId) {
        deleteArrow(arrowId);
    }
}

function deleteArrow(arrowId) {
    const arrow = arrows.get(arrowId);
    if (!arrow) return;
    if (arrow.element && arrow.element.parentNode) {
        arrow.element.parentNode.removeChild(arrow.element);
    }
    arrows.delete(arrowId);
}

function deleteArrowsForElement(elementId) {
    const arrowsToDelete = [];
    arrows.forEach((arrow, arrowId) => {
        if (arrow.from === elementId || arrow.to === elementId) {
            arrowsToDelete.push(arrowId);
        }
    });
    arrowsToDelete.forEach((arrowId) => deleteArrow(arrowId));
}

function clearAllArrows() {
    const arrowIds = Array.from(arrows.keys());
    arrowIds.forEach((arrowId) => deleteArrow(arrowId));
    arrows.clear();
    arrowCounter = 0;
}
