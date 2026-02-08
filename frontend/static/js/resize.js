function getPointerPosInElement(element, clientX, clientY) {
    const rect = element.getBoundingClientRect();
    return {
        x: clientX - rect.left,
        y: clientY - rect.top,
        w: rect.width,
        h: rect.height
    };
}

function getResizeEdges(element, clientX, clientY) {
    const pos = getPointerPosInElement(element, clientX, clientY);
    const x = pos.x;
    const y = pos.y;
    const w = pos.w;
    const h = pos.h;

    const style = window.getComputedStyle(element);
    const hasVScroll = (style.overflowY === 'auto' || style.overflowY === 'scroll') && element.scrollHeight > element.clientHeight;
    const hasHScroll = (style.overflowX === 'auto' || style.overflowX === 'scroll') && element.scrollWidth > element.clientWidth;
    if (hasVScroll && x >= w - SCROLLBAR_GUTTER_PX) return null;
    if (hasHScroll && y >= h - SCROLLBAR_GUTTER_PX) return null;

    const left = x <= RESIZE_BORDER_PX;
    const right = x >= w - RESIZE_BORDER_PX;
    const top = y <= RESIZE_BORDER_PX;
    const bottom = y >= h - RESIZE_BORDER_PX;

    if (!left && !right && !top && !bottom) return null;
    return { left, right, top, bottom };
}

function getResizeCursor(edges) {
    if ((edges.left && edges.top) || (edges.right && edges.bottom)) return 'nwse-resize';
    if ((edges.right && edges.top) || (edges.left && edges.bottom)) return 'nesw-resize';
    if (edges.left || edges.right) return 'ew-resize';
    if (edges.top || edges.bottom) return 'ns-resize';
    return 'nwse-resize';
}
