// File: js/draggablePanels.js

/**
 * Makes overlay panels draggable within a specified container.
 * @param {string} panelSelector CSS selector for the draggable panels.
 * @param {string} containerSelector CSS selector for the bounding container.
 * @param {string[]} ignoreSelectors Array of CSS selectors for elements inside the panel that should NOT trigger a drag (e.g., inputs, buttons).
 * @param {string[]} ignoredClasses Array of CSS classes on target elements that should prevent dragging.
 */
export function initializeDraggablePanels(
    panelSelector,
    containerSelector,
    ignoreSelectors = ['input', 'button', 'textarea', 'select', 'progress', 'canvas', '.no-drag', '[role="button"]', 'a', 'pre', '.chart-container'], // Added pre, chart-container
    ignoredClasses = ['heatmap-cell', 'cv-syndrome-bar', 'bar-fill', 'metric-value', 'metric-label'] // Added more specific ignores
) {
    const container = document.querySelector(containerSelector);
    const panels = document.querySelectorAll(panelSelector);
    let activePanel = null;
    let currentX, currentY, initialX, initialY;
    // let xOffset = 0, yOffset = 0; // Removed unused offsets
    let highestZ = 10; // Start z-index

    if (!container) {
        console.error("Draggable panels container not found:", containerSelector);
        return;
    }

    // Calculate initial highest z-index based on existing panels
    panels.forEach(p => {
        try { // Add try-catch for robustness
            const z = parseInt(window.getComputedStyle(p).zIndex, 10);
            if (!isNaN(z) && z >= highestZ) {
                highestZ = z + 1;
            }
        } catch (e) {
            console.warn("Could not parse z-index for panel:", p, e);
        }
    });
    // Add a buffer for panels brought to front later
    highestZ += 5;

    panels.forEach(panel => {
        panel.style.cursor = 'grab'; // Indicate draggable
        // Use the panel itself as the drag handle
        panel.addEventListener('mousedown', dragStart, false);
        panel.addEventListener('touchstart', dragStart, { passive: false }); // Add touch support
    });

    function dragStart(e) {
        // Determine event type (mouse or touch)
        const isTouchEvent = e.type.startsWith('touch');
        const currentEvent = isTouchEvent ? e.touches[0] : e;

        const targetElement = currentEvent.target;

        // Check if the clicked/touched element or its parent matches ignoreSelectors or ignoredClasses
        if (targetElement.closest(ignoreSelectors.join(','))) {
             return; // Don't drag if clicking on an ignored element type or selector
        }
        if (ignoredClasses.some(cls => targetElement.classList.contains(cls))) {
            return; // Don't drag if clicking on an element with an ignored class
        }

        // Check if the click is on a scrollbar (heuristic)
        if (!isTouchEvent && isScrollbarClick(e, this)) {
            return;
        }

        activePanel = this; // 'this' refers to the panel the event listener is attached to
        activePanel.style.cursor = 'grabbing'; // Change cursor during drag

        // Bring panel to front
        highestZ++;
        activePanel.style.zIndex = highestZ;

        // Calculate initial offset relative to the panel's top-left corner
        // initialX/Y is the offset *within* the panel where the drag started
        initialX = currentEvent.pageX - activePanel.offsetLeft;
        initialY = currentEvent.pageY - activePanel.offsetTop;

        // Add listeners to the document to capture movement anywhere
        document.addEventListener('mousemove', drag, false);
        document.addEventListener('mouseup', dragEnd, false);
        document.addEventListener('touchmove', drag, { passive: false }); // Add touch support
        document.addEventListener('touchend', dragEnd, false); // Add touch support

        document.body.classList.add('dragging'); // Add class for cursor/selection styles
    }

    function drag(e) {
        if (!activePanel) return;

        // Prevent default actions like text selection or page scrolling during drag
        e.preventDefault();

        const isTouchEvent = e.type.startsWith('touch');
        const currentEvent = isTouchEvent ? e.touches[0] : e;

        // New desired position = current mouse/touch position - initial offset within the panel
        currentX = currentEvent.pageX - initialX;
        currentY = currentEvent.pageY - initialY;

        // --- Containment Logic ---
        const containerRect = container.getBoundingClientRect();
        const panelRect = activePanel.getBoundingClientRect(); // Current dimensions/position

        // Available space for the panel's top-left corner
        const containerInnerWidth = container.clientWidth;
        const containerInnerHeight = container.clientHeight;
        const panelWidth = activePanel.offsetWidth;
        const panelHeight = activePanel.offsetHeight;

        // Constrain the panel's top-left corner (currentX, currentY)
        const minX = 0;
        const minY = 0;
        const maxX = Math.max(0, containerInnerWidth - panelWidth); // Ensure maxX >= 0
        const maxY = Math.max(0, containerInnerHeight - panelHeight); // Ensure maxY >= 0

        // Clamp calculated position
        currentX = Math.max(minX, Math.min(currentX, maxX));
        currentY = Math.max(minY, Math.min(currentY, maxY));

        // Apply the constrained position using left/top
        setTranslate(currentX, currentY, activePanel);
    }

    function dragEnd() {
        if (!activePanel) return;

        activePanel.style.cursor = 'grab'; // Reset cursor

        // Remove listeners from the document
        document.removeEventListener('mousemove', drag, false);
        document.removeEventListener('mouseup', dragEnd, false);
        document.removeEventListener('touchmove', drag, false);
        document.removeEventListener('touchend', dragEnd, false);

        document.body.classList.remove('dragging'); // Remove dragging class
        activePanel = null; // Deactivate panel
    }

    function setTranslate(xPos, yPos, el) {
        // Use left/top for simplicity and compatibility with initial CSS positioning
        el.style.left = `${xPos}px`;
        el.style.top = `${yPos}px`;
        // Reset transform just in case it was used elsewhere, ensuring left/top take precedence
        el.style.transform = '';
    }

    // Helper to check if click is on the scrollbar area
    // Note: This is a heuristic and might not be 100% accurate across all browsers/OS/themes.
    function isScrollbarClick(e, element) {
        // Check only if the element actually has scrollbars
        const hasVerticalScrollbar = element.scrollHeight > element.clientHeight;
        const hasHorizontalScrollbar = element.scrollWidth > element.clientWidth;

        if (!hasVerticalScrollbar && !hasHorizontalScrollbar) {
            return false; // No scrollbars, so click cannot be on one
        }

        const rect = element.getBoundingClientRect();
        // clientWidth/Height excludes scrollbar size
        const scrollbarWidth = element.offsetWidth - element.clientWidth;
        const scrollbarHeight = element.offsetHeight - element.clientHeight;

        // Click position relative to the element's border box edge
        const clickXrelative = e.clientX - rect.left;
        const clickYrelative = e.clientY - rect.top;

        // Check if click is within the approximate scrollbar zones
        // Add a small tolerance (e.g., 2px) for edge cases
        const tolerance = 2;
        const isOverVerticalScrollbar = hasVerticalScrollbar && scrollbarWidth > 5 && clickXrelative >= (element.offsetWidth - scrollbarWidth - tolerance);
        const isOverHorizontalScrollbar = hasHorizontalScrollbar && scrollbarHeight > 5 && clickYrelative >= (element.offsetHeight - scrollbarHeight - tolerance);

        return isOverVerticalScrollbar || isOverHorizontalScrollbar;
    }
}
