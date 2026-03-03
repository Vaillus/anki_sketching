/**
 * local_cards.js
 * Menu contextuel du canvas + modal de création/édition de cartes locales.
 */

(function () {
    // ── Canvas context menu ──────────────────────────────────────────────
    const canvasContextMenu = document.getElementById('canvas-context-menu');
    let canvasClickX = 0, canvasClickY = 0; // coordonnées canvas du clic

    canvasContainer.addEventListener('contextmenu', (e) => {
        // Ne rien faire si on clique sur une carte ou un groupe
        if (e.target.closest('.card-box') || e.target.closest('.group-box')) return;

        e.preventDefault();

        // Coordonnées canvas (en tenant compte du pan/zoom)
        canvasClickX = (e.clientX - canvasX) / zoom;
        canvasClickY = (e.clientY - canvasY) / zoom;

        canvasContextMenu.style.left = e.clientX + 'px';
        canvasContextMenu.style.top = e.clientY + 'px';
        canvasContextMenu.style.display = 'block';
    });

    document.getElementById('canvas-ctx-new-card').addEventListener('click', () => {
        canvasContextMenu.style.display = 'none';
        openLocalCardModal(canvasClickX, canvasClickY);
    });

    // Cache le menu canvas sur tout clic
    document.addEventListener('click', (e) => {
        if (!canvasContextMenu.contains(e.target)) {
            canvasContextMenu.style.display = 'none';
        }
    });

    // ── "Modifier" in card context menu ──────────────────────────────────
    const editMenuItem = document.getElementById('context-edit-local');
    editMenuItem.addEventListener('click', () => {
        const cardId = contextMenu.targetCard?.getAttribute('data-card-id');
        hideContextMenu();
        if (cardId && cardId.startsWith('local_')) {
            openLocalCardModal(null, null, cardId);
        }
    });

    // Show/hide "Modifier" depending on whether card is local
    const origShowContextMenu = window.showContextMenu || showContextMenu;
    window.showContextMenu = function (x, y, targetCard) {
        origShowContextMenu(x, y, targetCard);
        const cardId = targetCard.getAttribute('data-card-id');
        editMenuItem.style.display = (cardId && cardId.startsWith('local_')) ? 'block' : 'none';
    };

    // ── Modal de création / édition ──────────────────────────────────────
    const modal = document.getElementById('local-card-modal');
    const modalTitle = document.getElementById('local-card-modal-title');
    const frontInput = document.getElementById('local-card-front');
    const backInput = document.getElementById('local-card-back');
    const imageInput = document.getElementById('local-card-image');
    const pasteZone = document.getElementById('local-card-paste-zone');
    const imagePreview = document.getElementById('local-card-image-preview');
    const removeImageBtn = document.getElementById('local-card-remove-image');
    const submitBtn = document.getElementById('local-card-submit');
    const cancelBtn = document.getElementById('local-card-cancel');
    const deleteBtn = document.getElementById('local-card-delete');

    let editCardId = null;
    let posX = 0, posY = 0;
    let uploadedFilename = null;

    function showImagePreview(src) {
        imagePreview.innerHTML = `<img src="${src}" style="max-width:100%;max-height:120px;border-radius:6px;">`;
        removeImageBtn.style.display = 'inline-block';
        pasteZone.classList.add('has-image');
    }

    function clearImagePreview() {
        imagePreview.innerHTML = '';
        uploadedFilename = null;
        removeImageBtn.style.display = 'none';
        pasteZone.classList.remove('has-image');
        imageInput.value = '';
    }

    async function uploadFile(file) {
        const formData = new FormData();
        formData.append('file', file);
        try {
            const res = await fetch('/upload_image', { method: 'POST', body: formData });
            const data = await res.json();
            if (data.success) {
                uploadedFilename = data.filename;
                showImagePreview(data.path);
            }
        } catch (err) {
            console.error('upload_image failed', err);
        }
    }

    function openLocalCardModal(x, y, cardIdToEdit) {
        editCardId = cardIdToEdit || null;
        posX = x || 0;
        posY = y || 0;
        clearImagePreview();

        if (editCardId) {
            modalTitle.textContent = 'Modifier la carte';
            submitBtn.textContent = 'Enregistrer';
            deleteBtn.style.display = 'inline-block';
            // Fetch existing content
            fetch('/get_cards_by_ids', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ card_ids: [editCardId] }),
            })
                .then(r => r.json())
                .then(data => {
                    if (data.success && data.cards.length > 0) {
                        const c = data.cards[0];
                        frontInput.value = c.texts['Front'] || '';
                        backInput.value = c.texts['Back'] || '';
                        if (c.images && c.images.length > 0) {
                            showImagePreview(c.images[0]);
                        }
                    }
                });
        } else {
            modalTitle.textContent = 'Nouvelle carte';
            submitBtn.textContent = 'Créer';
            deleteBtn.style.display = 'none';
            frontInput.value = '';
            backInput.value = '';
        }

        modal.classList.add('visible');
        frontInput.focus();
    }

    function closeLocalCardModal() {
        modal.classList.remove('visible');
        editCardId = null;
    }

    cancelBtn.addEventListener('click', closeLocalCardModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeLocalCardModal();
    });

    // Remove image button
    removeImageBtn.addEventListener('click', clearImagePreview);

    // Click paste zone → open file picker as fallback
    pasteZone.addEventListener('click', () => imageInput.click());

    // Hidden file input change
    imageInput.addEventListener('change', () => {
        const file = imageInput.files[0];
        if (file) uploadFile(file);
    });

    // Paste image from clipboard (works anywhere in the modal)
    document.getElementById('local-card-panel').addEventListener('paste', (e) => {
        const items = e.clipboardData?.items;
        if (!items) return;
        for (const item of items) {
            if (item.type.startsWith('image/')) {
                e.preventDefault();
                const file = item.getAsFile();
                if (file) uploadFile(file);
                return;
            }
        }
    });

    // Drag & drop on paste zone
    pasteZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        pasteZone.classList.add('dragover');
    });
    pasteZone.addEventListener('dragleave', () => {
        pasteZone.classList.remove('dragover');
    });
    pasteZone.addEventListener('drop', (e) => {
        e.preventDefault();
        pasteZone.classList.remove('dragover');
        const file = e.dataTransfer?.files[0];
        if (file && file.type.startsWith('image/')) uploadFile(file);
    });

    // Submit
    submitBtn.addEventListener('click', async () => {
        const front = frontInput.value.trim();
        const back = backInput.value.trim();

        if (!front && !back) return;

        if (editCardId) {
            // Update
            const body = { card_id: editCardId, front_text: front, back_text: back };
            if (uploadedFilename) body.image_filename = uploadedFilename;
            const res = await fetch('/update_local_card', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const data = await res.json();
            if (data.success) {
                // Refresh card DOM
                refreshCardContent(editCardId, data.card);
                saveCardPositions({ silent: true });
            }
        } else {
            // Create
            const body = { front_text: front, back_text: back };
            if (uploadedFilename) body.image_filename = uploadedFilename;
            const res = await fetch('/create_local_card', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const data = await res.json();
            if (data.success) {
                createCardOnCanvas(data.card, posX, posY);
                saveCardPositions({ silent: true });
            }
        }

        closeLocalCardModal();
        if (typeof loadDueCards === 'function') loadDueCards();
    });

    // Delete
    deleteBtn.addEventListener('click', async () => {
        if (!editCardId) return;
        if (!confirm('Supprimer cette carte locale ?')) return;

        await fetch('/delete_local_card', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ card_id: editCardId }),
        });

        // Remove from canvas
        const el = document.querySelector(`[data-card-id="${editCardId}"]`);
        if (el) {
            const cid = editCardId;
            selectedCards.delete(cid);
            cards = cards.filter(c => c !== el);
            if (cardGroups.has(cid)) removeCardFromGroup(cid);
            deleteArrowsForElement(cid);
            removeAnchorPoints(cid);
            el.remove();
            updateSelectionDisplay();
            saveCardPositions({ silent: true });
        }

        closeLocalCardModal();
        if (typeof loadDueCards === 'function') loadDueCards();
    });

    // Keyboard
    document.addEventListener('keydown', (e) => {
        if (!modal.classList.contains('visible')) return;
        if (e.key === 'Escape') closeLocalCardModal();
    });

    // ── Card rendering helpers ───────────────────────────────────────────

    function buildCardHTML(cardData) {
        let content = '';
        if (cardData.type_label) {
            const typeClass = cardData.type_label.toLowerCase().replace(' ', '-');
            content += '<div class="card-info">';
            content += `<span class="card-type ${typeClass}">${cardData.type_label}</span>`;
            if (cardData.due_display) {
                content += `<span class="card-due">${cardData.due_display}</span>`;
            }
            content += '</div>';
        }
        for (const [field, text] of Object.entries(cardData.texts || {})) {
            content += `<strong>${field}:</strong><p>${text}</p>`;
        }
        (cardData.images || []).forEach(imgPath => {
            content += `<img src="${imgPath}" alt="Image de la carte">`;
        });
        return `<div class="card-content">${content}</div>`;
    }

    function createCardOnCanvas(cardData, x, y) {
        const cardBox = document.createElement('div');
        cardBox.className = 'card-box';
        cardBox.setAttribute('data-card-id', cardData.card_id);
        cardBox.style.left = x + 'px';
        cardBox.style.top = y + 'px';
        cardBox.style.zIndex = ++cardCounter;
        cardBox.innerHTML = buildCardHTML(cardData);

        canvas.appendChild(cardBox);
        cards.push(cardBox);
        makeDraggable(cardBox);
    }

    function refreshCardContent(cardId, cardData) {
        const el = document.querySelector(`[data-card-id="${cardId}"]`);
        if (el) {
            el.innerHTML = buildCardHTML(cardData);
        }
    }

    // Public
    window.openLocalCardModal = openLocalCardModal;
})();
