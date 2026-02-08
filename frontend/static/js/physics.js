function isOverlapping(rect1, rect2) {
    return !(rect1.right < rect2.left || 
             rect2.right < rect1.left || 
             rect1.bottom < rect2.top || 
             rect2.bottom < rect1.top);
}

function getCardRect(cardElement) {
    const left = parseInt(cardElement.style.left) || 0;
    const top = parseInt(cardElement.style.top) || 0;
    const width = cardElement.offsetWidth || 300;
    const height = cardElement.offsetHeight || 200;
    
    return {
        left: left,
        top: top,
        right: left + width,
        bottom: top + height,
        centerX: left + width / 2,
        centerY: top + height / 2
    };
}

function repelOverlappingCards() {
    physicsRepulsion();
}

function physicsRepulsion() {
    if (isRepelling) return;
    isRepelling = true;

    let hasOverlaps = true;
    let iterations = 0;
    const maxIterations = 50;

    function repelStep() {
        hasOverlaps = false;
        const forces = new Map();

        // Initialise les forces pour chaque carte
        cards.forEach(card => {
            forces.set(card, { x: 0, y: 0 });
        });

        // Calcule les forces de répulsion entre toutes les paires de cartes
        for (let i = 0; i < cards.length; i++) {
            for (let j = i + 1; j < cards.length; j++) {
                const card1 = cards[i];
                const card2 = cards[j];
                const rect1 = getCardRect(card1);
                const rect2 = getCardRect(card2);
                
                if (isOverlapping(rect1, rect2)) {
                    hasOverlaps = true;
                    
                    // Calcule la direction et distance de répulsion
                    const deltaX = rect2.centerX - rect1.centerX;
                    const deltaY = rect2.centerY - rect1.centerY;
                    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
                    
                    if (distance === 0) {
                        // Si les cartes sont exactement au même endroit
                        const force1 = forces.get(card1);
                        const force2 = forces.get(card2);
                        force1.x -= 30;
                        force1.y -= 30;
                        force2.x += 30;
                        force2.y += 30;
                    } else {
                        // Calcule la force de répulsion nécessaire pour séparer les cartes
                        const overlapX = Math.max(0, Math.min(rect1.right, rect2.right) - Math.max(rect1.left, rect2.left));
                        const overlapY = Math.max(0, Math.min(rect1.bottom, rect2.bottom) - Math.max(rect1.top, rect2.top));
                        const overlap = overlapX + overlapY;
                        
                        const forceStrength = Math.min(40, overlap * 0.3 + 15);
                        const normalX = deltaX / distance;
                        const normalY = deltaY / distance;
                        
                        const force1 = forces.get(card1);
                        const force2 = forces.get(card2);
                        
                        force1.x -= normalX * forceStrength;
                        force1.y -= normalY * forceStrength;
                        force2.x += normalX * forceStrength;
                        force2.y += normalY * forceStrength;
                    }
                }
            }
        }

        // Applique les forces calculées avec une animation smooth
        forces.forEach((force, card) => {
            if (Math.abs(force.x) > 0.1 || Math.abs(force.y) > 0.1) {
                const currentLeft = parseInt(card.style.left) || 0;
                const currentTop = parseInt(card.style.top) || 0;
                
                // Applique un facteur d'amortissement pour des mouvements plus fluides
                const dampening = 0.7;
                card.style.left = (currentLeft + force.x * dampening) + 'px';
                card.style.top = (currentTop + force.y * dampening) + 'px';
            }
        });

        iterations++;
        
        // Continue la simulation si il y a encore des chevauchements
        if (hasOverlaps && iterations < maxIterations) {
            setTimeout(repelStep, 80); // Délai pour l'animation
        } else {
            isRepelling = false;
            // Met à jour les groupes après la répulsion
            updateAllGroups();
        }
    }

    repelStep();
}
