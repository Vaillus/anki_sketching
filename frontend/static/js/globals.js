// Variables globales pour le canvas
let canvasX = 0, canvasY = 0, zoom = 1;
let isDraggingCanvas = false;
let lastMouseX = 0, lastMouseY = 0;
let cardCounter = 0;
let cards = []; // Tableau pour stocker toutes les cartes
let currentDeck = ''; // Nom du paquet actuellement chargé

// Variables pour la sélection
let selectedCards = new Set(); // Cartes sélectionnées
let lastSelectedCard = null; // Dernière carte sélectionnée pour la sélection multiple

// Variables pour les groupes
let groups = new Map(); // Map: groupId -> { cards: Set, element: HTMLElement, name: string }
let cardGroups = new Map(); // Map: cardId -> groupId
let groupCounter = 0; // Compteur pour les IDs de groupes

// Variables pour les points d'ancrage et flèches
let anchorPoints = new Map(); // Map: elementId -> { top: HTMLElement, bottom: HTMLElement }
let isCreatingArrow = false; // Mode création de flèche
let arrowStart = null; // Point de départ de la flèche
let arrows = new Map(); // Map: arrowId -> { from: elementId, to: elementId, element: HTMLElement }
let arrowCounter = 0; // Compteur pour les IDs de flèches
let selectedArrows = new Set(); // Flèches sélectionnées

// Variables pour le redimensionnement des cartes
let resizingState = null; // { element, edges, startX, startY, startLeft, startTop, startW, startH }
const MIN_CARD_WIDTH_PX = 180;
const MIN_CARD_HEIGHT_PX = 120;

// Variables globales pour la physique
let isRepelling = false; // Flag pour éviter les conflits de répulsion

// Variables pour le mode d'interaction (move / select)
let interactionMode = 'move';   // 'move' | 'select'
let isMarqueeActive = false;
let marqueeStartX = 0;
let marqueeStartY = 0;
let marqueeJustEnded = false;

// Sensibilité du pinch-to-zoom (plus petit = moins sensible)
const PINCH_ZOOM_SENSITIVITY = 0.004;

// Overrides par carte (chargés depuis /card_info_all au démarrage)
const cardMinIntervals = new Map();

// Cache global des tags
let allTagsCache = [];

// Références aux éléments DOM
const canvas = document.getElementById('canvas');
const canvasContainer = document.getElementById('canvas-container');
const zoomLevel = document.getElementById('zoom-level');
const zoomInfo = document.getElementById('zoom-info');
const position = document.getElementById('position');
const contextMenu = document.getElementById('context-menu');
const selectionToolbar = document.getElementById('selection-toolbar');
const selectionCount = document.getElementById('selection-count');

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function buildTagsHTML(tags) {
    if (!tags || tags.length === 0) return '';
    let html = '<div class="card-tags">';
    tags.forEach(tag => {
        html += `<span class="card-tag">${escapeHtml(tag)}</span>`;
    });
    html += '</div>';
    return html;
}

function loadAllTags() {
    fetch('/all_tags')
        .then(r => r.json())
        .then(data => {
            if (data.success) allTagsCache = data.tags;
        })
        .catch(err => console.error('all_tags: failed', err));
}
