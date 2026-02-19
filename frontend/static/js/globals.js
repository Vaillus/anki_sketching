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
const RESIZE_BORDER_PX = 10;
const MIN_CARD_WIDTH_PX = 180;
const MIN_CARD_HEIGHT_PX = 120;
const SCROLLBAR_GUTTER_PX = 16;

// Variables globales pour la physique
let isRepelling = false; // Flag pour éviter les conflits de répulsion

// Sensibilité du pinch-to-zoom (plus petit = moins sensible)
const PINCH_ZOOM_SENSITIVITY = 0.004;

// Références aux éléments DOM
const canvas = document.getElementById('canvas');
const canvasContainer = document.getElementById('canvas-container');
const zoomLevel = document.getElementById('zoom-level');
const zoomInfo = document.getElementById('zoom-info');
const position = document.getElementById('position');
const contextMenu = document.getElementById('context-menu');
const selectionToolbar = document.getElementById('selection-toolbar');
const selectionCount = document.getElementById('selection-count');
