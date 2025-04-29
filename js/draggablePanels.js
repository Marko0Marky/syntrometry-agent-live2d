// File: js/draggablePanels.js

/**
 * Makes overlay panels draggable within a specified container.
 * @param {string} panelSelector CSS selector for the draggable panels.
 * @param {string} containerSelector CSS selector for the bounding container.
 * @param {string[]} ignoreSelectors Array of CSS selectors for elements inside the panel that should NOT trigger a drag (e.g., inputs, buttons).
 * @param {string[]} ignoredClasses Array of CSS classes on target elements that should prevent dragging.
 */
export function initializeDraggablePanels(panelSelector, containerSelector, ignoreSelectors = ['input', 'button', 'textarea', 'select', 'progress', 'canvas', '.no-drag', '[role="button"]', 'a'], ignoredClasses = ['heatmap-cell', 'cv-syndrome-bar']) {
    const container = document.querySelector(containerSelector);
    const panels = document.querySelectorAll(panelSelector);
    let activePanel = null;
    let currentX, currentY, initialX, initialY;
    let xOffset = 0, yOffset = 0;
    let highestZ = 10; // Start z-index lower

    if (!container) {
        console.error("Draggable panels container not found:", containerSelector);
        return;
    }

    // Calculate initial highest z-index based on existing panels
    panels.forEach(p => {
        const z = parseInt(window.getComputedStyle(p).zIndex, 10);
        if (!isNaN(z) && z >= highestZ) { // Use >= to account for initial value
            highestZ = z + 1; // Ensure new highest is above existing
        }
    });
    // Add a buffer
    highestZ += 5;


    panels.forEach(panel => {
        // Use the panel itself as the drag handle for simplicity
        panel.addEventListener('mousedown', dragStart, false);
    });

    function dragStart(e) {
        const targetElement = e.target;

        // Check if the clicked element or its parent matches ignoreSelectors or ignoredClasses
        if (targetElement.closest(ignoreSelectors.join(','))) {
             return; // Don't drag if clicking on an ignored element type or selector
        }
        if (ignoredClasses.some(cls => targetElement.classList.contains(cls))) {
            return; // Don't drag if clicking on an element with an ignored class
        }

        // Check if the click is on a scrollbar
        if (isScrollbarClick(e, this)) {
            return;
        }

        activePanel = this; // 'this' refers to the panel the event listener is attached to

        // Bring panel to front
        highestZ++;
        activePanel.style.zIndex = highestZ;

        // Calculate initial offset relative to the panel's top-left corner
        const rect = activePanel.getBoundingClientRect();

        // PageX/Y gives coords relative to the whole page.
        // We need the offset from the panel's origin (offsetLeft/Top)
        // This assumes the panel's offsetParent is the container, which it should be if container is positioned non-statically and panel is absolute.
        initialX = e.pageX - activePanel.offsetLeft;
        initialY = e.pageY - activePanel.offsetTop;

        // Store the initial offsets (these don't change during drag)
        xOffset = activePanel.offsetLeft;
        yOffset = activePanel.offsetTop;


        document.addEventListener('mousemove', drag, false);
        document.addEventListener('mouseup', dragEnd, false);
        document.body.classList.add('dragging'); // Add class for cursor/selection styles
    }

    function drag(e) {
        if (!activePanel) return;

        e.preventDefault(); // Prevent text selection, etc. during drag

        // New position = current mouse position - initial offset within the panel
        // These coordinates are relative to the panel's offsetParent (likely the container)
        currentX = e.pageX - initialX;
        currentY = e.pageY - initialY;

        // --- Containment Logic ---
        const containerRect = container.getBoundingClientRect(); // Container dimensions in viewport
        const panelRect = activePanel.getBoundingClientRect(); // Panel dimensions in viewport

        // Calculate container's content dimensions (available space for panel's top-left corner)
        const containerInnerWidth = container.clientWidth; // Includes padding, excludes border/scrollbar
        const containerInnerHeight = container.clientHeight;

        // Constrain the panel's top-left corner (currentX, currentY)
        // Ensure it stays within the container's bounds (0,0) to (containerSize - panelSize)
        const minX = 0;
        const minY = 0;
        // Use offsetWidth/Height as panelRect includes transforms, offsetWidth doesn't
        const maxX = containerInnerWidth - activePanel.offsetWidth;
        const maxY = containerInnerHeight - activePanel.offsetHeight;

        // Clamp calculated position
        currentX = Math.max(minX, Math.min(currentX, maxX));
        currentY = Math.max(minY, Math.min(currentY, maxY));

        // Apply the constrained position using left/top
        setTranslate(currentX, currentY, activePanel);
    }

    function dragEnd() {
        if (!activePanel) return;

        activePanel = null; // Deactivate panel

        document.removeEventListener('mousemove', drag, false);
        document.removeEventListener('mouseup', dragEnd, false);
        document.body.classList.remove('dragging'); // Remove dragging class
    }

    function setTranslate(xPos, yPos, el) {
        // Use left/top for simplicity and compatibility with initial CSS positioning
        el.style.left = `${xPos}px`;
        el.style.top = `${yPos}px`;
        // Reset transform just in case it was used elsewhere, ensuring left/top take precedence
        el.style.transform = '';
    }

    // Helper to check if click is on the scrollbar area
    function isScrollbarClick(e, element) {
        const rect = element.getBoundingClientRect();
        // clientWidth/Height excludes scrollbar size
        const scrollbarWidth = element.offsetWidth - element.clientWidth;
        const scrollbarHeight = element.offsetHeight - element.clientHeight;

        // Click position relative to the element's border box edge
        const clickXrelative = e.clientX - rect.left;
        const clickYrelative = e.clientY - rect.top;

        // Check if click is within the approximate scrollbar zones (right edge for vertical, bottom edge for horizontal)
        // Add a small tolerance (e.g., 2px)
        const tolerance = 2;
        const isOverVerticalScrollbar = scrollbarWidth > 5 && clickXrelative >= (element.offsetWidth - scrollbarWidth - tolerance);
        const isOverHorizontalScrollbar = scrollbarHeight > 5 && clickYrelative >= (element.offsetHeight - scrollbarHeight - tolerance);

        return isOverVerticalScrollbar || isOverHorizontalScrollbar;
    }
}