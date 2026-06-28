const POLL_INTERVAL_MS = 5000;
let lastConnected = null;

async function checkAnkiStatus() {
    try {
        const statusEl = document.getElementById('anki-status');
        if (!statusEl) return;  // UI Anki masquée (prod)

        const res = await fetch('/anki_status');
        const data = await res.json();
        const connected = data.connected;

        const popoverEl = document.getElementById('anki-popover');
        const popoverStatusEl = document.getElementById('anki-popover-status');
        const importBtn = document.querySelector('#import-form button[type="submit"]');

        const stateClass = connected ? 'connected' : 'disconnected';
        const statusText = connected
            ? 'Anki connecté'
            : 'Anki non connecté — lancez Anki avec AnkiConnect';

        statusEl.classList.remove('connected', 'disconnected');
        statusEl.classList.add(stateClass);
        statusEl.setAttribute('title', statusText);

        if (popoverEl) {
            popoverEl.classList.remove('connected', 'disconnected');
            popoverEl.classList.add(stateClass);
        }
        if (popoverStatusEl) popoverStatusEl.textContent = statusText;
        if (importBtn) importBtn.disabled = !connected;

        // If Anki just came online, reload the deck list
        if (connected && lastConnected === false) {
            location.reload();
        }
        lastConnected = connected;
    } catch (e) {
        // server unreachable
    }
}

checkAnkiStatus();
setInterval(checkAnkiStatus, POLL_INTERVAL_MS);
