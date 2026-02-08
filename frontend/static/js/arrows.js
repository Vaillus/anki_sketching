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
    // Gestionnaire pour le point du haut (point d'arrivée)
    topAnchor.addEventListener('click', (e) => {
        e.stopPropagation();
        if (isCreatingArrow && arrowStart && arrowStart.elementId !== elementId) {
            // Termine la création de la flèche (du point de départ vers ce point d'arrivée)
            createArrow(arrowStart.elementId, elementId, arrowStart.anchorType, 'top');
            endArrowCreation();
        }
    });
    
    // Gestionnaire pour le point du bas (point de départ)
    bottomAnchor.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!isCreatingArrow) {
            // Commence la création d'une flèche depuis ce point de départ
            startArrowCreation(elementId, 'bottom');
        } else if (arrowStart && arrowStart.elementId !== elementId) {
            // Termine la création de la flèche (du point de départ vers ce point d'arrivée)
            createArrow(arrowStart.elementId, elementId, arrowStart.anchorType, 'top');
            endArrowCreation();
        }
    });
    
    // Gestionnaire pour le point de gauche (point d'arrivée)
    leftAnchor.addEventListener('click', (e) => {
        e.stopPropagation();
        if (isCreatingArrow && arrowStart && arrowStart.elementId !== elementId) {
            // Termine la création de la flèche (du point de départ vers ce point d'arrivée)
            createArrow(arrowStart.elementId, elementId, arrowStart.anchorType, 'left');
            endArrowCreation();
        }
    });
    
    // Gestionnaire pour le point de droite (point de départ)
    rightAnchor.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!isCreatingArrow) {
            // Commence la création d'une flèche depuis ce point de départ
            startArrowCreation(elementId, 'right');
        } else if (arrowStart && arrowStart.elementId !== elementId) {
            // Termine la création de la flèche (du point de départ vers ce point d'arrivée)
            createArrow(arrowStart.elementId, elementId, arrowStart.anchorType, 'left');
            endArrowCreation();
        }
    });
}

function startArrowCreation(elementId, anchorType) {
    isCreatingArrow = true;
    arrowStart = { elementId, anchorType };
    
    // Ajoute la classe creating au point d'ancrage de départ
    const anchors = anchorPoints.get(elementId);
    if (anchors) {
        const startAnchor = anchorType === 'top' ? anchors.top : anchors.bottom;
        startAnchor.classList.add('creating');
    }
    
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
    
    // Crée l'élément SVG pour la flèche
    const arrowElement = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    arrowElement.setAttribute('data-arrow-id', arrowId);
    arrowElement.style.position = 'absolute';
    arrowElement.style.zIndex = '50';
    arrowElement.style.pointerEvents = 'none';
    
    // Ajoute l'élément SVG au canvas
    canvas.appendChild(arrowElement);
    
    // Stocke les informations de la flèche
    arrows.set(arrowId, {
        from: fromElementId,
        to: toElementId,
        fromAnchor: fromAnchorType,
        toAnchor: toAnchorType,
        element: arrowElement
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
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const startX = fromPos.x - minX;
    const startY = fromPos.y - minY;
    const endX = toPos.x - minX;
    const endY = toPos.y - minY;
    
    path.setAttribute('d', `M ${startX} ${startY} L ${endX} ${endY}`);
    path.setAttribute('stroke', '#2196F3');
    path.setAttribute('stroke-width', '3');
    path.setAttribute('fill', 'none');
    path.setAttribute('marker-end', 'url(#arrowhead)');
    
    // Ajoute la pointe de flèche
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
    marker.setAttribute('id', 'arrowhead');
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
    arrow.element.appendChild(defs);
    arrow.element.appendChild(path);
}

function getAnchorPosition(element, anchorType) {
    const rect = element.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    
    let x, y;
    
    switch (anchorType) {
        case 'top':
            x = rect.left - canvasRect.left + rect.width / 2;
            y = rect.top - canvasRect.top;
            break;
        case 'bottom':
            x = rect.left - canvasRect.left + rect.width / 2;
            y = rect.top - canvasRect.top + rect.height;
            break;
        case 'left':
            x = rect.left - canvasRect.left;
            y = rect.top - canvasRect.top + rect.height / 2;
            break;
        case 'right':
            x = rect.left - canvasRect.left + rect.width;
            y = rect.top - canvasRect.top + rect.height / 2;
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
