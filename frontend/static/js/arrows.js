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

const ARROW_SNAP_RADIUS_PX = 24;
let arrowDrag = null;
let tempArrow = null;

function addAnchorPointEventListeners(topAnchor, bottomAnchor, leftAnchor, rightAnchor, elementId) {
    topAnchor.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        startArrowDrag(elementId, 'top', e.clientX, e.clientY);
    });
    
    bottomAnchor.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        startArrowDrag(elementId, 'bottom', e.clientX, e.clientY);
    });
    
    leftAnchor.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        startArrowDrag(elementId, 'left', e.clientX, e.clientY);
    });
    
    rightAnchor.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        startArrowDrag(elementId, 'right', e.clientX, e.clientY);
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

function buildArrowSvg(arrowId, enableContextMenu) {
    const markerId = `arrowhead_${arrowId}`;
    const arrowElement = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    arrowElement.setAttribute('data-arrow-id', arrowId);
    arrowElement.style.position = 'absolute';
    arrowElement.style.zIndex = '50';
    arrowElement.style.pointerEvents = 'none';
    
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
    path.style.pointerEvents = enableContextMenu ? 'stroke' : 'none';
    if (enableContextMenu) {
        path.addEventListener('contextmenu', handleArrowContextMenu);
    }
    arrowElement.appendChild(path);
    
    return { element: arrowElement, path: path, markerId: markerId };
}

function createArrow(fromElementId, toElementId, fromAnchorType, toAnchorType) {
    const arrowId = `arrow_${++arrowCounter}`;
    const arrowSvg = buildArrowSvg(arrowId, true);
    
    // Ajoute l'élément SVG au canvas
    canvas.appendChild(arrowSvg.element);
    
    arrows.set(arrowId, {
        from: fromElementId,
        to: toElementId,
        fromAnchor: fromAnchorType,
        toAnchor: toAnchorType,
        element: arrowSvg.element,
        path: arrowSvg.path,
        markerId: arrowSvg.markerId
    });
    
    // Met à jour la position de la flèche
    updateArrowPosition(arrowId);
    
    console.log(`Flèche créée: ${fromElementId} (${fromAnchorType}) → ${toElementId} (${toAnchorType})`);
    return arrowId;
}

function startArrowDrag(elementId, anchorType, clientX, clientY) {
    if (arrowDrag) {
        cancelArrowDrag();
    }
    startArrowCreation(elementId, anchorType);
    arrowDrag = {
        startElementId: elementId,
        startAnchorType: anchorType,
        snappedTarget: null
    };
    createTempArrow();
    updateArrowDrag(clientX, clientY);
}

function updateArrowDrag(clientX, clientY) {
    if (!arrowDrag || !tempArrow) return;
    const mousePos = getMouseCanvasPosition(clientX, clientY);
    const snap = findClosestAnchorPosition(mousePos, ARROW_SNAP_RADIUS_PX, arrowDrag.startElementId);
    arrowDrag.snappedTarget = snap;
    
    const fromElement = document.querySelector(`[data-card-id="${arrowDrag.startElementId}"]`) || 
                      document.querySelector(`[data-group-id="${arrowDrag.startElementId}"]`);
    if (!fromElement) return;
    
    const startPos = getAnchorPosition(fromElement, arrowDrag.startAnchorType);
    if (!startPos) return;
    
    const endPos = snap ? snap.pos : mousePos;
    const toAnchorType = snap ? snap.anchorType : null;
    updateArrowSvgPath(tempArrow, startPos, endPos, arrowDrag.startAnchorType, toAnchorType);
}

function finishArrowDrag() {
    if (!arrowDrag) return;
    if (arrowDrag.snappedTarget) {
        createArrow(
            arrowDrag.startElementId,
            arrowDrag.snappedTarget.elementId,
            arrowDrag.startAnchorType,
            arrowDrag.snappedTarget.anchorType
        );
    }
    cancelArrowDrag();
}

function cancelArrowDrag() {
    removeTempArrow();
    arrowDrag = null;
    endArrowCreation();
}

function createTempArrow() {
    removeTempArrow();
    const tempId = `temp_${Date.now()}`;
    const arrowSvg = buildArrowSvg(tempId, false);
    canvas.appendChild(arrowSvg.element);
    tempArrow = {
        element: arrowSvg.element,
        path: arrowSvg.path
    };
}

function removeTempArrow() {
    if (!tempArrow) return;
    if (tempArrow.element && tempArrow.element.parentNode) {
        tempArrow.element.parentNode.removeChild(tempArrow.element);
    }
    tempArrow = null;
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
    
    updateArrowSvgPath(arrow, fromPos, toPos, arrow.fromAnchor, arrow.toAnchor);
}

function getDirection(anchorType) {
    switch (anchorType) {
        case 'top':
            return { x: 0, y: -1 };
        case 'bottom':
            return { x: 0, y: 1 };
        case 'left':
            return { x: -1, y: 0 };
        case 'right':
            return { x: 1, y: 0 };
        default:
            return { x: 0, y: 0 };
    }
}

function getDirectionFromVector(dx, dy) {
    if (Math.abs(dx) >= Math.abs(dy)) {
        return dx >= 0 ? { x: 1, y: 0 } : { x: -1, y: 0 };
    }
    return dy >= 0 ? { x: 0, y: 1 } : { x: 0, y: -1 };
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

function updateArrowSvgPath(arrowSvg, startPos, endPos, fromAnchorType, toAnchorType) {
    const startAbsX = startPos.x;
    const startAbsY = startPos.y;
    const endAbsX = endPos.x;
    const endAbsY = endPos.y;
    
    const dx = endAbsX - startAbsX;
    const dy = endAbsY - startAbsY;
    const dist = Math.hypot(dx, dy);
    const curve = Math.max(40, Math.min(200, dist * 0.5));
    const outDir = getDirection(fromAnchorType);
    const inDir = toAnchorType ? getDirection(toAnchorType) : getDirectionFromVector(dx, dy);
    const cp1AbsX = startAbsX + outDir.x * curve;
    const cp1AbsY = startAbsY + outDir.y * curve;
    const cp2AbsX = endAbsX + inDir.x * curve;
    const cp2AbsY = endAbsY + inDir.y * curve;
    
    const minX = Math.min(startAbsX, endAbsX, cp1AbsX, cp2AbsX);
    const minY = Math.min(startAbsY, endAbsY, cp1AbsY, cp2AbsY);
    const maxX = Math.max(startAbsX, endAbsX, cp1AbsX, cp2AbsX);
    const maxY = Math.max(startAbsY, endAbsY, cp1AbsY, cp2AbsY);
    const padding = 14;
    const paddedMinX = minX - padding;
    const paddedMinY = minY - padding;
    const paddedMaxX = maxX + padding;
    const paddedMaxY = maxY + padding;
    
    arrowSvg.element.setAttribute('width', Math.max(paddedMaxX - paddedMinX, 1));
    arrowSvg.element.setAttribute('height', Math.max(paddedMaxY - paddedMinY, 1));
    arrowSvg.element.style.left = paddedMinX + 'px';
    arrowSvg.element.style.top = paddedMinY + 'px';
    
    const startX = startAbsX - paddedMinX;
    const startY = startAbsY - paddedMinY;
    const endX = endAbsX - paddedMinX;
    const endY = endAbsY - paddedMinY;
    const cp1X = cp1AbsX - paddedMinX;
    const cp1Y = cp1AbsY - paddedMinY;
    const cp2X = cp2AbsX - paddedMinX;
    const cp2Y = cp2AbsY - paddedMinY;
    arrowSvg.path.setAttribute(
        'd',
        `M ${startX} ${startY} C ${cp1X} ${cp1Y}, ${cp2X} ${cp2Y}, ${endX} ${endY}`
    );
}

function getMouseCanvasPosition(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const scale = zoom || 1;
    return {
        x: (clientX - rect.left) / scale,
        y: (clientY - rect.top) / scale
    };
}

function findClosestAnchorPosition(mousePos, radiusPx, excludeElementId) {
    const scale = zoom || 1;
    const radius = radiusPx / scale;
    let closest = null;
    let closestDist = radius;
    const elements = document.querySelectorAll('[data-card-id], [data-group-id]');
    
    elements.forEach((element) => {
        const elementId = element.getAttribute('data-card-id') || element.getAttribute('data-group-id');
        if (elementId === excludeElementId) return;
        
        const anchorTypes = ['top', 'bottom', 'left', 'right'];
        anchorTypes.forEach((anchorType) => {
            const pos = getAnchorPosition(element, anchorType);
            if (!pos) return;
            const dist = Math.hypot(pos.x - mousePos.x, pos.y - mousePos.y);
            if (dist <= closestDist) {
                closestDist = dist;
                closest = { elementId: elementId, anchorType: anchorType, pos: pos };
            }
        });
    });
    
    return closest;
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

document.addEventListener('mousemove', (e) => {
    if (arrowDrag) {
        updateArrowDrag(e.clientX, e.clientY);
    }
});

document.addEventListener('mouseup', () => {
    if (arrowDrag) {
        finishArrowDrag();
    }
});
