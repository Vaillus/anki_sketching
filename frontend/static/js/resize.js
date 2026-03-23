// Resize is now triggered exclusively from the .resize-handle element
// injected by makeDraggable(). The global mousemove/mouseup handlers below
// perform the actual resizing (always bottom-right).

document.addEventListener('mousemove', (e) => {
    if (!resizingState) return;

    const dx = (e.clientX - resizingState.startX) / zoom;
    const dy = (e.clientY - resizingState.startY) / zoom;

    let newW = Math.max(resizingState.startW + dx, MIN_CARD_WIDTH_PX);
    let newH = Math.max(resizingState.startH + dy, MIN_CARD_HEIGHT_PX);

    newW = Math.round(newW);
    newH = Math.round(newH);

    resizingState.element.style.width = newW + 'px';
    resizingState.element.style.height = newH + 'px';

    updateAllArrows();
    const cardId = resizingState.element.getAttribute('data-card-id');
    if (cardId && cardGroups.has(cardId)) {
        updateGroupBounds(cardGroups.get(cardId));
    }
});

document.addEventListener('mouseup', () => {
    if (!resizingState) return;
    resizingState.element.style.transition = 'left 0.3s ease-out, top 0.3s ease-out, border-color 0.2s ease';
    setTimeout(() => {
        repelOverlappingCards();
        updateAllGroups();
    }, 50);
    resizingState = null;
});
