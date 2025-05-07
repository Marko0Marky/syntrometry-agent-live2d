// File: js/draggablePanels.js

/**
 * Makes overlay panels draggable within a specified container.
 * This version automatically creates headers if they don't exist.
 * 
 * @param {string} panelSelector CSS selector for the draggable panels.
 * @param {string} containerSelector CSS selector for the bounding container.
 * @param {string[]} ignoreSelectors Array of CSS selectors for elements that should NOT trigger a drag.
 */
export function initializeDraggablePanels(
    panelSelector,
    containerSelector,
    ignoreSelectors = ['input', 'button', 'textarea', 'select', 'progress', 'canvas', '.no-drag', '[role="button"]', 'a', 'pre']
) {
    const container = document.querySelector(containerSelector);
    const panels = document.querySelectorAll(panelSelector);

    if (!container) {
        console.error("Draggable panels container not found:", containerSelector);
        return;
    }

    // Set initial positions for panels if not already set
    panels.forEach(panel => {
        // Only set initial position if not already positioned
        if (!panel.style.position || panel.style.position === 'static') {
            panel.style.position = 'absolute';
        }
        
        // Set initial position if not already set
        if (!panel.style.left && !panel.style.top) {
            // Get current position
            const rect = panel.getBoundingClientRect();
            const containerRect = container.getBoundingClientRect();
            
            // Calculate position relative to container
            const left = rect.left - containerRect.left;
            const top = rect.top - containerRect.top;
            
            // Set initial position
            panel.style.left = `${left}px`;
            panel.style.top = `${top}px`;
        }
        
        // Create header if it doesn't exist
        let header = panel.querySelector('.panel-header');
        if (!header) {
            header = document.createElement('div');
            header.className = 'panel-header';
            
            // Try to get a title from aria-label or id
            let title = panel.getAttribute('aria-label') || 
                        panel.id.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) || 
                        'Panel';
            
            header.textContent = title;
            
            // Insert at the beginning of the panel
            if (panel.firstChild) {
                panel.insertBefore(header, panel.firstChild);
            } else {
                panel.appendChild(header);
            }
        }
        
        // Make sure header has the right style
        header.style.cursor = 'grab';
        header.addEventListener('mousedown', dragStart.bind(panel), false);
        header.addEventListener('touchstart', dragStart.bind(panel), { passive: false });
    });

    let activePanel = null;
    let initialMouseX, initialMouseY;
    let panelStartX, panelStartY;

    // Calculate initial highest z-index dynamically
    let highestZ = 10;
    panels.forEach(p => {
        try {
            const z = parseInt(window.getComputedStyle(p).zIndex, 10);
            if (!isNaN(z) && z >= highestZ) {
                highestZ = z + 1;
            }
        } catch (e) { console.warn("Could not parse z-index for panel:", p, e); }
    });
    highestZ += 5;

    function dragStart(e) {
        // `this` is the panel element because of .bind(panel)
        const currentPanel = this;
        const targetElement = e.target;

        // Check if the clicked element should prevent dragging
        if (ignoreSelectors.some(sel => targetElement.closest(sel)) && 
            !targetElement.classList.contains('panel-header')) {
            return;
        }

        activePanel = currentPanel;

        const isTouchEvent = e.type.startsWith('touch');
        const currentEvent = isTouchEvent ? e.touches[0] : e;

        initialMouseX = currentEvent.clientX;
        initialMouseY = currentEvent.clientY;

        // Get panel's current position
        const panelRect = activePanel.getBoundingClientRect();
        panelStartX = panelRect.left;
        panelStartY = panelRect.top;

        const header = activePanel.querySelector('.panel-header');
        if (header) header.style.cursor = 'grabbing';
        activePanel.style.zIndex = ++highestZ;

        document.addEventListener('mousemove', drag, false);
        document.addEventListener('mouseup', dragEnd, false);
        if (isTouchEvent) {
            document.addEventListener('touchmove', drag, { passive: false });
            document.addEventListener('touchend', dragEnd, false);
        }

        document.body.classList.add('dragging');
        document.body.style.userSelect = 'none';
        
        e.preventDefault();
    }

    function drag(e) {
        if (!activePanel) return;

        if (e.type.startsWith('touch')) {
            e.preventDefault();
        }

        const isTouchEvent = e.type.startsWith('touch');
        const currentEvent = isTouchEvent ? e.touches[0] : e;

        // Calculate mouse movement delta
        const deltaX = currentEvent.clientX - initialMouseX;
        const deltaY = currentEvent.clientY - initialMouseY;

        // Calculate new position
        let newX = panelStartX + deltaX;
        let newY = panelStartY + deltaY;

        // Get container and panel dimensions
        const containerRect = container.getBoundingClientRect();
        const panelRect = activePanel.getBoundingClientRect();

        // Constrain to container
        newX = Math.max(containerRect.left, Math.min(newX, containerRect.right - panelRect.width));
        newY = Math.max(containerRect.top, Math.min(newY, containerRect.bottom - panelRect.height));

        // Apply position relative to the viewport
        activePanel.style.left = `${newX - containerRect.left}px`;
        activePanel.style.top = `${newY - containerRect.top}px`;
    }

    function dragEnd() {
        if (!activePanel) return;

        const header = activePanel.querySelector('.panel-header');
        if (header) header.style.cursor = 'grab';

        document.removeEventListener('mousemove', drag, false);
        document.removeEventListener('mouseup', dragEnd, false);
        document.removeEventListener('touchmove', drag, false);
        document.removeEventListener('touchend', dragEnd, false);

        document.body.classList.remove('dragging');
        document.body.style.userSelect = '';

        activePanel = null;
    }
}
