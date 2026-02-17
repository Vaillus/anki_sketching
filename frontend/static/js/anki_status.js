const POLL_INTERVAL_MS = 5000;
let lastConnected = null;

async function checkAnkiStatus() {
    try {
        const res = await fetch('/anki_status');
        const data = await res.json();
        const connected = data.connected;

        const statusEl = document.getElementById('anki-status');
        const labelEl = document.getElementById('anki-status-label');
        const importBtn = document.querySelector('#import-form button[type="submit"]');

        statusEl.className = connected ? 'connected' : 'disconnected';
        labelEl.textContent = connected ? 'Anki connecté' : 'Anki non connecté — lancez Anki avec AnkiConnect';
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
