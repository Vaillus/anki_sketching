function updateCanvasTransform() {
    canvas.style.transform = `translate(${canvasX}px, ${canvasY}px) scale(${zoom})`;
    zoomLevel.textContent = Math.round(zoom * 100) + '%';
    zoomInfo.textContent = Math.round(zoom * 100) + '%';
    position.textContent = `${Math.round(-canvasX)}, ${Math.round(-canvasY)}`;
}

function isPinchZoomWheelEvent(e) {
    // macOS trackpad pinch commonly triggers wheel events with ctrlKey=true
    return e.ctrlKey === true;
}

function handleCanvasWheel(e) {
    // Vérifie si la souris est au-dessus d'une carte
    const target = e.target;
    const cardBox = target.closest('.card-box');
    const isPinch = isPinchZoomWheelEvent(e);

    // Si on est sur une carte, laisse le scroll normal de la carte
    // (sauf si on est en pinch: dans ce cas on veut zoomer le canvas)
    if (cardBox && !isPinch) {
        return;
    }

    e.preventDefault();

    if (!isPinch) {
        // Deux doigts (scroll) = pan du canvas
        canvasX -= e.deltaX;
        canvasY -= e.deltaY;
        updateCanvasTransform();
        return;
    }

    // Pinch = zoom vers la souris
    const rect = canvasContainer.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const oldZoom = zoom;
    // Zoom moins sensible: facteur continu basé sur deltaY
    // deltaY > 0 => zoom out, deltaY < 0 => zoom in
    let zoomFactor = Math.exp(-e.deltaY * PINCH_ZOOM_SENSITIVITY);
    // Clamp pour éviter les sauts sur de gros deltas
    zoomFactor = Math.max(0.98, Math.min(1.02, zoomFactor));
    zoom = Math.max(0.1, Math.min(3, zoom * zoomFactor));

    // Ajuste la position pour zoomer vers la souris
    const zoomChange = zoom / oldZoom;
    canvasX = mouseX - (mouseX - canvasX) * zoomChange;
    canvasY = mouseY - (mouseY - canvasY) * zoomChange;

    updateCanvasTransform();
}

// Important: passive:false pour que preventDefault() fonctionne sur wheel
canvasContainer.addEventListener('wheel', handleCanvasWheel, { passive: false });

// Gestion du déplacement du canvas
canvasContainer.addEventListener('mousedown', (e) => {
    if (e.target === canvasContainer || e.target === canvas) {
        isDraggingCanvas = true;
        canvasContainer.classList.add('dragging');
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
        e.preventDefault();
    }
});

document.addEventListener('mousemove', (e) => {
    if (isDraggingCanvas) {
        const deltaX = e.clientX - lastMouseX;
        const deltaY = e.clientY - lastMouseY;
        canvasX += deltaX;
        canvasY += deltaY;
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
        updateCanvasTransform();
    }
});

document.addEventListener('mouseup', () => {
    isDraggingCanvas = false;
    canvasContainer.classList.remove('dragging');
});

// Contrôles de zoom
document.getElementById('zoom-in').addEventListener('click', () => {
    zoom = Math.min(3, zoom * 1.1);
    updateCanvasTransform();
});

document.getElementById('zoom-out').addEventListener('click', () => {
    zoom = Math.max(0.1, zoom * 0.9);
    updateCanvasTransform();
});

document.getElementById('reset-view').addEventListener('click', () => {
    canvasX = 0;
    canvasY = 0;
    zoom = 1;
    updateCanvasTransform();
});
